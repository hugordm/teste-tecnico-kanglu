/**
 * A data em que um artigo FICOU PÚBLICO — a única que o blog deve exibir.
 *
 * Existem dois carimbos no schema e eles NÃO são a mesma coisa:
 *   - `publishedAt` — quando o artigo transitou para o status `published`
 *                     (ou seja, quando foi *aprovado*).
 *   - `publishAt`   — o agendamento: a hora a partir da qual ele fica VISÍVEL.
 *
 * No fluxo do cron os dois divergem por um dia: o cron gera e publica o artigo
 * às 15h de 17/07 já agendado (`publishAt`) para as 09h de 18/07. Exibir
 * `publishedAt` mostrava 17/07 — um dia em que o artigo não existia para
 * ninguém. A data correta é 18/07.
 *
 * A regra é a MESMA condição de visibilidade aplicada por `publicWhere()` em
 * `public-articles.ts` (status published E publishAt nulo ou já passado), lida
 * ao contrário: o artigo ficou público quando as DUAS condições passaram a
 * valer — logo, no MAIS TARDE entre os dois carimbos.
 *
 *   - publicado na hora (publishAt null) → publishedAt
 *   - agendado para o futuro            → publishAt
 *   - agendado para o passado           → publishedAt (a hora agendada já tinha
 *                                        passado; ficou visível ao publicar)
 *
 * O `max` cobre os três casos sem ramificar, por isso não escrevemos
 * `publishAt ?? publishedAt`: isso erraria o terceiro caso, exibindo uma data
 * anterior à publicação.
 *
 * Devolve `null` quando não há `publishedAt` (artigo não publicado) — os
 * chamadores já tratam data ausente omitindo o elemento/campo.
 */
export function publicPublishedAt(article: {
  publishedAt: Date | null;
  publishAt: Date | null;
}): Date | null {
  const { publishedAt, publishAt } = article;
  if (!publishedAt) return null;
  if (publishAt && publishAt > publishedAt) return publishAt;
  return publishedAt;
}
