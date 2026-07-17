import { prisma } from "@/lib/prisma";
import { suggestIdeas, IdeasError } from "@/lib/ideas";
import { generateAutoArticle } from "@/lib/generate-article";
import { publishArticle } from "@/lib/publish";

// Teto de execução. No plano atual da Vercel o limite real é 60s (Hobby), então
// declaramos 60 — pedir mais é ignorado/capado. O fluxo medido cabe folgado: ~25s
// no caminho feliz, ~35-40s no pior caso (retry de escrita curta). Se algum dia
// migrar para um plano com teto maior, subir este número.
export const runtime = "nodejs";
export const maxDuration = 60;

/** Marca que identifica os artigos nascidos deste cron (idempotência + badge futuro). */
const CREATED_VIA = "cron-daily";

/**
 * GET /api/cron/daily-article  — publicação diária automática.
 *
 * Acionada pelo Vercel Cron (ver `vercel.json`: `0 18 * * *` = 18:00 UTC = 15:00
 * BRT). Gera de TARDE de propósito: o artigo só vai ao ar às 09:00 BRT do dia
 * seguinte, então sobra a noite inteira como janela de veto humano. Faz, em ordem:
 *   1. AUTENTICA o cron pelo header `Authorization: Bearer <CRON_SECRET>` que a
 *      Vercel injeta. Sem o segredo configurado, recusa (falha barulhenta > rota
 *      aberta ao mundo). Isso mantém o endpoint privado mesmo sendo GET público.
 *   2. IDEMPOTÊNCIA pelo SLOT de publicação (amanhã 12:00 UTC = 09:00 BRT), não
 *      pelo dia de criação: se já existe um `cron-daily` agendado para esse slot,
 *      devolve `skipped` — reexecução/retentativa da mesma rodada não duplica.
 *   3. Pede UMA pauta à IA ancorada no MOMENTO ATUAL (`recent`), gera o rascunho
 *      por tema com busca restrita aos últimos meses (Firecrawl→Sonar), marcado
 *      como `cron-daily` e AGENDADO para o slot (amanhã 09:00 BRT), e então PUBLICA
 *      pelo portão compartilhado (`lib/publish`) — a mesma regra "≥1 fonte válida"
 *      da rota humana. O artigo fica `published` mas só aparece no blog na manhã
 *      seguinte (agendamento via `publishAt`). Como a geração só cria o artigo se
 *      sobrarem fontes reais, o portão passa; se por acaso barrar, o rascunho
 *      fica salvo (nada se perde).
 *
 * Respostas (sempre JSON, para inspeção fácil nos logs do cron):
 *   200 { skipped: true }            — já há artigo agendado para o slot de amanhã.
 *   200 { published: true, ... }     — artigo do dia criado, publicado e agendado.
 *   200 { published: false, ... }    — criado como draft, mas o portão barrou (raro).
 *   401                              — segredo ausente/errado.
 *   500 { error: "CRON_SECRET..." }  — segredo não configurado no ambiente.
 *   502 { error }                    — pauta ou geração da IA falhou; nada criado.
 */
export async function GET(req: Request) {
  // 1) Autenticação do cron ------------------------------------------------
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Sem segredo não há como distinguir a Vercel de um estranho. Recusa tudo.
    console.error("[cron] CRON_SECRET não configurado — cron desabilitado");
    return Response.json(
      { error: "CRON_SECRET não configurado no ambiente" },
      { status: 500 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Slot de publicação: 09:00 BRT do DIA SEGUINTE = 12:00 UTC de amanhã. O cron
  // gera às 15:00 BRT (18:00 UTC) e o artigo só vai ao ar na manhã seguinte — a
  // tarde/noite inteira fica como janela de veto humano antes de publicar.
  const publishSlot = new Date();
  publishSlot.setUTCDate(publishSlot.getUTCDate() + 1);
  publishSlot.setUTCHours(12, 0, 0, 0);

  // 2) Idempotência pelo SLOT (não pelo dia de criação) --------------------
  // O que identifica "o artigo do dia" é o horário em que ele PUBLICA, não quando
  // foi gerado. Retentativas/reexecuções da mesma rodada apontam todas para o
  // mesmo `publishAt` (amanhã 12:00 UTC) → não duplicam. Igualdade exata basta:
  // sempre gravamos o slot com os mesmos milissegundos (12:00:00.000).
  const existing = await prisma.article.findFirst({
    where: { createdVia: CREATED_VIA, publishAt: publishSlot },
    orderBy: { createdAt: "desc" },
    select: { id: true, slug: true, status: true },
  });
  if (existing) {
    return Response.json({
      skipped: true,
      reason: "already-scheduled-for-slot",
      slot: publishSlot,
      article: existing,
    });
  }

  // 3a) Pauta do dia -------------------------------------------------------
  // Pede algumas e usa a primeira; a temperatura alta do suggestIdeas dá variação
  // dia a dia. `recent: true` ancora a pauta no momento atual (injeta a data de
  // hoje) — o pedido central da cliente: conteúdo ATUAL, não atemporal. Falha da
  // IA aqui vira 502 amigável — nada é criado.
  let theme: string;
  try {
    const { ideas } = await suggestIdeas({ count: 5, recent: true });
    theme = ideas[0];
  } catch (err) {
    const msg = err instanceof IdeasError ? err.message : String(err);
    console.warn(`[cron] sugestão de pauta falhou: ${msg}`);
    return Response.json(
      { error: "Não foi possível gerar a pauta do dia." },
      { status: 502 },
    );
  }

  // 3b) Geração (draft com fontes reais) — motor padrão Firecrawl→Sonar -----
  // `recent: true` restringe a busca aos últimos meses (conteúdo atual). O artigo
  // nasce agendado para o `publishSlot` (amanhã 09:00 BRT): gerado hoje às 15:00
  // BRT, só aparece no blog na manhã seguinte — janela de veto durante a noite.
  // `shortPolicy: "keepDraft"` — sem humano no cron: se vier curto mesmo após o
  // retry, cria como draft e NÃO publica (melhor nenhum artigo que um parágrafo).
  const outcome = await generateAutoArticle({
    theme,
    searchEngine: "firecrawl",
    createdVia: CREATED_VIA,
    recent: true,
    publishAt: publishSlot,
    shortPolicy: "keepDraft",
  });
  if (!outcome.ok) {
    // generation_failed (IA fora) ou no_sources (sem fonte não-concorrente):
    // em ambos nada foi criado. Para o cron os dois são "hoje não deu" → 502.
    // (too_short não ocorre aqui: keepDraft cria como draft em vez de rejeitar.)
    console.warn(
      `[cron] geração não produziu artigo (${outcome.reason}) para "${theme}"`,
    );
    return Response.json(
      { error: "Geração automática não produziu artigo hoje.", theme },
      { status: 502 },
    );
  }

  // Instrumentação (item 2.2) ecoada na resposta para inspeção nos logs do cron:
  // qual motor produziu as fontes, quantas, e o tamanho do texto.
  const diag = {
    engine: outcome.engine,
    sourceCount: outcome.sourceCount,
    words: outcome.length.words,
    sections: outcome.length.sections,
  };

  // Rascunho curto que sobreviveu ao retry → NÃO publica. Fica de draft agendado
  // para o veto/edição humana da noite.
  if (outcome.tooShort) {
    console.warn(
      `[cron] artigo ${outcome.article.id} ficou curto (words=${diag.words}, ` +
        `sections=${diag.sections}); mantido como DRAFT, não publicado`,
    );
    return Response.json({
      published: false,
      reason: "too_short",
      theme,
      article: { id: outcome.article.id, slug: outcome.article.slug },
      diag,
    });
  }

  // 3c) Publicação pelo MESMO portão da rota humana ------------------------
  const result = await publishArticle(outcome.article.id);
  if (!result.ok) {
    // A geração garante ≥1 fonte, então o portão deve passar. Se por acaso
    // barrar, o rascunho JÁ está salvo — devolvemos published:false e o editor
    // resolve manualmente. Nunca derrubamos o que foi gerado.
    console.warn(
      `[cron] artigo ${outcome.article.id} criado mas não publicado (${result.reason})`,
    );
    return Response.json({
      published: false,
      reason: result.reason,
      article: { id: outcome.article.id, slug: outcome.article.slug },
      diag,
    });
  }

  console.info(
    `[cron] artigo do dia publicado: ${result.article.slug} ` +
      `(engine=${diag.engine} sources=${diag.sourceCount} words=${diag.words})`,
  );
  return Response.json({
    published: true,
    theme,
    article: {
      id: result.article.id,
      slug: result.article.slug,
      title: result.article.title,
      status: result.article.status,
      publishAt: result.article.publishAt, // agendado p/ 12:00 UTC (09:00 BRT)
    },
    diag,
  });
}
