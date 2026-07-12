import { z } from "zod";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converte um título em slug amigável para URL.
 * `.normalize("NFD")` separa cada letra acentuada em (letra + diacrítico);
 * o regex remove os diacríticos combinantes (̀-ͯ). Assim
 * "Ação e Coração" -> "acao-e-coracao" sem perder as consoantes.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tira acentos pt-BR (á, ã, ç, é, ô...)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // qualquer não-alfanumérico vira hífen
    .replace(/^-+|-+$/g, ""); // remove hífens das pontas
}

/**
 * Gera um slug único a partir do título. Se "meu-artigo" já existe, tenta
 * "meu-artigo-2", "-3", etc. Título só de símbolos (slug vazio) cai em "artigo".
 *
 * Vive aqui (e não na rota) porque agora DUAS rotas criam artigos: o POST
 * manual e o /generate por IA. Ambas precisam do mesmo slug único.
 *
 * O @unique no slug é a garantia real; este loop evita o erro na maioria dos
 * casos. Sob corrida, o create ainda pode falhar com P2002 — aceitável no
 * escopo do MVP (single-admin, sem escrita concorrente).
 */
export async function generateUniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "artigo";
  let candidate = base;
  let n = 2;

  while (await prisma.article.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

/**
 * Verdadeiro só para URLs http/https bem-formadas. É o critério do portão de
 * publicação: uma "fonte" só conta se aponta para um endereço web real.
 * Rejeita mailto:, javascript:, ftp:, strings soltas, etc.
 */
export function isValidHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** Uma fonte enviada junto do artigo (nested create). */
export const sourceInput = z.object({
  title: z.string().trim().min(1, "Título da fonte é obrigatório"),
  url: z.url("URL da fonte inválida"),
});

/**
 * Entrada do POST /api/articles.
 * Note que NÃO existe `status` aqui: todo artigo nasce `draft`. O status só
 * muda por PATCH (draft/in_review/archived) ou pelo endpoint de publish.
 */
export const createArticleInput = z.object({
  title: z.string().trim().min(1, "Título é obrigatório"),
  content: z.string().min(1, "Conteúdo é obrigatório"),
  excerpt: z.string().trim().optional(),

  // SEO
  metaTitle: z.string().trim().optional(),
  metaDescription: z.string().trim().optional(),
  canonicalUrl: z.url("canonicalUrl inválida").optional(),
  ogImage: z.url("ogImage inválida").optional(),

  // Imagem — se houver imagem, crédito é esperado (regra leve de dados)
  imageCredit: z.string().trim().optional(),
  imageSourceUrl: z.url("imageSourceUrl inválida").optional(),

  // Rastreabilidade de IA (disclaimer exigido pelo teste)
  aiAssisted: z.boolean().optional(),
  aiModel: z.string().trim().optional(),

  // Agendamento: data/hora a partir da qual o artigo publicado aparece no blog.
  // Chega como ISO (UTC) do client; coerce.date() a converte em Date.
  publishAt: z.coerce.date().nullable().optional(),

  sources: z.array(sourceInput).optional(),
});

/**
 * Entrada do PATCH /api/articles/[id].
 * Tudo opcional (atualização parcial). O `status` aceita SÓ
 * draft/in_review/archived — `published` está ausente de propósito: publicar
 * é regra de negócio (exige fonte válida) e só acontece pelo /publish.
 */
export const updateArticleInput = z
  .object({
    title: z.string().trim().min(1).optional(),
    content: z.string().min(1).optional(),
    excerpt: z.string().trim().nullable().optional(),
    status: z.enum(["draft", "in_review", "archived"]).optional(),

    metaTitle: z.string().trim().nullable().optional(),
    metaDescription: z.string().trim().nullable().optional(),
    canonicalUrl: z.url("canonicalUrl inválida").nullable().optional(),
    ogImage: z.url("ogImage inválida").nullable().optional(),

    imageCredit: z.string().trim().nullable().optional(),
    imageSourceUrl: z.url("imageSourceUrl inválida").nullable().optional(),

    aiAssisted: z.boolean().optional(),
    aiModel: z.string().trim().nullable().optional(),

    // Agendamento (ver createArticleInput). null limpa o agendamento (volta a
    // aparecer assim que publicado). Ausência do campo o mantém como está.
    publishAt: z.coerce.date().nullable().optional(),

    sources: z.array(sourceInput).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Nenhum campo para atualizar",
  });

export type CreateArticleInput = z.infer<typeof createArticleInput>;
export type UpdateArticleInput = z.infer<typeof updateArticleInput>;
export type SourceInput = z.infer<typeof sourceInput>;
