import "server-only";
import { prisma } from "@/lib/prisma";
import { isValidHttpUrl } from "@/lib/validation";
import type { Article, Source } from "@prisma/client";

// ---------------------------------------------------------------------------
// O PORTÃO da publicação.
//
// Regra de negócio central do teste, em uma frase: um artigo só é publicável se
// tiver ao menos UMA fonte com URL http/https de verdade. Antes esta lógica
// vivia inline na rota interativa `POST /[id]/publish`. Foi extraída para cá
// porque agora existe um SEGUNDO caminho que publica — o cron diário — e os dois
// PRECISAM aplicar exatamente a mesma regra. Um único lugar = zero risco de
// divergência (o cron nunca "esquece" o portão que a rota aplica, ou vice-versa).
//
// A regra fica no lib; a APRESENTAÇÃO (status HTTP, log, corpo JSON) fica na
// borda de cada chamador. Por isso `publishArticle` devolve um resultado
// discriminado com o MOTIVO, em vez de já responder um HTTP.
// ---------------------------------------------------------------------------

/** Artigo com suas fontes carregadas — o shape que os dois caminhos manipulam. */
export type ArticleWithSources = Article & { sources: Source[] };

/**
 * O portão em si: existe ao menos uma fonte com URL http/https válida?
 * Exportado à parte porque é útil consultar a regra sem efetuar a publicação
 * (ex.: habilitar/desabilitar um botão, ou o cron logar o porquê de um bloqueio).
 */
export function hasValidSource(sources: Source[]): boolean {
  return sources.some((s) => isValidHttpUrl(s.url));
}

/**
 * Resultado discriminado de tentar publicar. `ok:false` carrega o MOTIVO para o
 * chamador traduzir como quiser (a rota vira 404/422; o cron vira log + JSON).
 */
export type PublishResult =
  | { ok: true; article: ArticleWithSources; alreadyPublished: boolean }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "no_valid_source" };

/**
 * ÚNICO lugar que faz a transição para `published`. Passa pelo portão e:
 *   - artigo inexistente        → { ok:false, reason:"not_found" }
 *   - já publicado              → { ok:true, alreadyPublished:true }  (idempotente)
 *   - sem fonte válida          → { ok:false, reason:"no_valid_source" }
 *   - publica                   → { ok:true, alreadyPublished:false }
 *
 * Preserva `publishedAt` se já existir — não reescreve a data original de uma
 * publicação anterior.
 */
export async function publishArticle(id: string): Promise<PublishResult> {
  const article = await prisma.article.findUnique({
    where: { id },
    include: { sources: true },
  });
  if (!article) {
    return { ok: false, reason: "not_found" };
  }

  // Já publicado: idempotente, devolve como está (não é erro).
  if (article.status === "published") {
    return { ok: true, article, alreadyPublished: true };
  }

  // O portão: pelo menos uma fonte com URL http/https de verdade.
  if (!hasValidSource(article.sources)) {
    return { ok: false, reason: "no_valid_source" };
  }

  const published = await prisma.article.update({
    where: { id },
    data: {
      status: "published",
      publishedAt: article.publishedAt ?? new Date(),
    },
    include: { sources: true },
  });

  return { ok: true, article: published, alreadyPublished: false };
}
