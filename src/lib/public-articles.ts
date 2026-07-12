import "server-only";
import { prisma } from "@/lib/prisma";
import type { Article, Source } from "@prisma/client";

// `import "server-only"` faz o build FALHAR se este módulo for importado por
// um Client Component. É a trava de segurança que garante que a lógica de
// leitura pública (e o Prisma) nunca vaze para o bundle do navegador.

// O público só enxerga artigos publicados. Centralizamos o filtro num helper
// para que NENHUMA das funções abaixo possa esquecê-lo — é a exigência de
// segurança do módulo: draft/in_review jamais chegam ao público.
//
// Além do status, o filtro respeita o AGENDAMENTO: um artigo published só
// aparece quando publishAt é null (sem agendamento) OU já passou. Um artigo
// agendado para o futuro fica invisível até a hora e passa a aparecer sozinho
// depois — sem cron, só pela query. É uma função (não constante) porque o
// "agora" precisa ser recalculado a cada request. publishAt é gravado em UTC;
// new Date() também é UTC, então a comparação é sempre no mesmo referencial.
function publicWhere() {
  return {
    status: "published" as const,
    OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }],
  };
}

export type PublicArticle = Article & { sources: Source[] };

export type PublishedArticlesPage = {
  articles: PublicArticle[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Lista paginada de artigos publicados (mais recentes primeiro).
 * `page`/`pageSize` são saneados para evitar skip negativo ou take absurdo
 * vindo de um ?page= manipulado na URL.
 */
export async function getPublishedArticles({
  page = 1,
  pageSize = 6,
}: {
  page?: number;
  pageSize?: number;
} = {}): Promise<PublishedArticlesPage> {
  const safePageSize = Math.min(Math.max(1, Math.trunc(pageSize)), 50);
  const safePage = Math.max(1, Math.trunc(page));

  // Mesmo "agora" para contagem e listagem — evita que um artigo cruze a hora
  // agendada entre as duas queries e a paginação fique inconsistente.
  const where = publicWhere();

  // Uma transação: conta o total e busca a página no mesmo instante,
  // evitando divergência entre contagem e listagem.
  const [total, articles] = await prisma.$transaction([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      include: { sources: true },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
  ]);

  return {
    articles,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
  };
}

/**
 * Um artigo publicado pelo slug (com suas fontes), ou null se não existir /
 * não estiver publicado. O status entra no WHERE — então um slug de rascunho
 * responde exatamente como um slug inexistente (404), sem vazar existência.
 */
export async function getPublishedArticleBySlug(
  slug: string,
): Promise<PublicArticle | null> {
  return prisma.article.findFirst({
    where: { slug, ...publicWhere() },
    include: { sources: true },
  });
}

/**
 * TODOS os artigos publicados E já visíveis (slug + updatedAt), para o sitemap.
 * Reusa o MESMO publicWhere() das funções acima — o filtro de segurança não é
 * reescrito, então rascunhos/em revisão continuam impossíveis de vazar, e os
 * agendados ainda não visíveis também ficam de fora do sitemap.
 *
 * Diferente de getPublishedArticles(): sem paginação (o sitemap precisa de
 * TODOS, e aquele helper limita a 50) e sem include de sources (o sitemap não
 * usa) — uma query leve e sob medida.
 */
export async function getPublishedArticlesForSitemap(): Promise<
  { slug: string; updatedAt: Date }[]
> {
  return prisma.article.findMany({
    where: publicWhere(),
    orderBy: { publishedAt: "desc" },
    select: { slug: true, updatedAt: true },
  });
}
