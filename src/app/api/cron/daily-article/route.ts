import { prisma } from "@/lib/prisma";
import { suggestIdeas, IdeasError } from "@/lib/ideas";
import { pickFreshIdea } from "@/lib/theme-overlap";
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
 * Quantos títulos do histórico entram no prompt e no pós-filtro.
 * 20 ≈ 3 semanas de cron diário — o suficiente para pegar a repetição que
 * importa (a de dias próximos) sem inflar o prompt: medido, ~390 tokens de
 * input a mais na chamada MAIS BARATA do pipeline.
 */
const RECENT_TITLES_COUNT = 20;

/**
 * Os títulos que já ocupam o blog, para não repetir a pauta.
 *
 * O filtro é `status: published` OU rascunho nascido do cron:
 *   - `published` cobre publicado E agendado de uma vez (agendado = published
 *     com publishAt futuro), que é exatamente o pedido;
 *   - o rascunho `cron-daily` entra porque o `shortPolicy: "keepDraft"` deixa
 *     rascunho quando o texto sai curto. Sem contá-lo, o tema que FALHOU
 *     ontem seria sorteado de novo hoje — a repetição mais irritante das duas.
 *
 * Ordena por createdAt desc: é quando a pauta foi USADA, que é o que interessa
 * aqui (publishAt/publishedAt diriam quando foi ao ar).
 *
 * Uma query só, com a conexão já quente da checagem de idempotência acima:
 * ~200ms medidos, contra um teto de 60s do handler.
 */
async function recentThemeTitles(): Promise<string[]> {
  const rows = await prisma.article.findMany({
    where: {
      OR: [{ status: "published" }, { createdVia: CREATED_VIA }],
    },
    orderBy: { createdAt: "desc" },
    take: RECENT_TITLES_COUNT,
    select: { title: true },
  });
  return rows.map((r) => r.title);
}

/**
 * Orçamento (ms desde o início do handler) até o qual ainda vale INICIAR o
 * fallback Sonar. Passado disto, se o Firecrawl falhou, aborta em vez de arriscar
 * o timeout de 60s no meio. 35s deixa margem para Sonar (~9-14s) + imagens (~7-30s)
 * caber nos 60s. Medido: caminho feliz ~28s; fallback com timeout de 30s dava 57s.
 */
const FALLBACK_BUDGET_MS = 35_000;

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
  const startedAt = Date.now(); // orçamento de tempo (guarda de fallback + diag)

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
  // Pede algumas e escolhe a primeira que não repete o histórico; a temperatura
  // alta do suggestIdeas dá variação dia a dia. `recent: true` ancora a pauta no
  // momento atual (injeta a data de hoje) — o pedido central da cliente:
  // conteúdo ATUAL, não atemporal. Falha da IA aqui vira 502 amigável — nada é
  // criado.
  //
  // ANTIRREPETIÇÃO, em duas camadas (a idempotência do slot impede dois artigos
  // no mesmo dia, mas nada impedia a mesma PAUTA voltar em dias diferentes):
  //   1. o histórico entra no prompt, pedindo ângulo novo (lib/ideas);
  //   2. o pós-filtro determinístico escolhe entre as 5 candidatas que já vieram
  //      na resposta (lib/theme-overlap) — sem chamada extra à IA.
  // A camada 2 é a que garante: prompt é pedido, não contrato.
  const recentTitles = await recentThemeTitles();

  let theme: string;
  let themeRepeat = false;
  let themeOverlap = 0;
  const pautaStart = Date.now();
  try {
    const { ideas } = await suggestIdeas({
      count: 5,
      recent: true,
      avoidTitles: recentTitles,
    });
    // O cron usa só o TÍTULO da pauta escolhida como tema (as keywords são para
    // o painel; aqui não passamos keywords — o fluxo segue idêntico).
    const pick = pickFreshIdea(ideas, recentTitles);
    if (!pick) throw new IdeasError("Nenhuma pauta aproveitável");
    theme = pick.idea.title;
    themeRepeat = pick.repeat;
    themeOverlap = pick.overlap;
    if (themeRepeat) {
      // TODAS as 5 candidatas bateram no limiar. Publicar um tema próximo é
      // melhor que ficar sem artigo do dia, então seguimos com a MENOS parecida
      // — mas o dia fica marcado (diag.themeRepeat) para a revisão humana da
      // noite decidir se vale editar ou vetar.
      console.warn(
        `[cron] todas as pautas repetem o histórico; usando a de menor ` +
          `sobreposição (${themeOverlap.toFixed(2)}): "${theme}"`,
      );
    }
  } catch (err) {
    const msg = err instanceof IdeasError ? err.message : String(err);
    console.warn(`[cron] sugestão de pauta falhou: ${msg}`);
    return Response.json(
      { error: "Não foi possível gerar a pauta do dia." },
      { status: 502 },
    );
  }
  const pautaMs = Date.now() - pautaStart;

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
    // Guarda de orçamento: não inicia o fallback Sonar se já passou de 35s.
    deadlineMs: startedAt + FALLBACK_BUDGET_MS,
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

  // Instrumentação ecoada na resposta para inspeção nos logs do cron: qual motor
  // produziu as fontes, quantas, o tamanho do texto e o TEMPO de cada etapa
  // (pauta/geração/imagens/total) — para caçar de onde vem qualquer estouro de 60s.
  const diag = {
    engine: outcome.engine,
    sourceCount: outcome.sourceCount,
    // Antirrepetição: `themeRepeat: true` = TODAS as pautas do dia colidiram com
    // o histórico e o cron seguiu com a menos parecida (tema forçado). É o sinal
    // para a revisão humana olhar esse artigo com mais atenção. `themeOverlap` é
    // a sobreposição da pauta escolhida (0–1) — útil mesmo quando não houve
    // repetição, para ver de longe se o modelo está começando a convergir.
    themeRepeat,
    themeOverlap: Number(themeOverlap.toFixed(2)),
    historyTitles: recentTitles.length,
    words: outcome.length.words,
    sections: outcome.length.sections,
    ms: {
      pauta: pautaMs,
      geracao: outcome.timing.genMs,
      imagens: outcome.timing.imagesMs,
      total: Date.now() - startedAt,
    },
  };

  // Problema de qualidade (curto após o retry, ou fontes fora do tema) → NÃO
  // publica. Fica de draft agendado para o veto/edição humana da noite — melhor
  // nenhum artigo no ar que um parágrafo ou um texto off-topic.
  if (outcome.qualityIssue) {
    console.warn(
      `[cron] artigo ${outcome.article.id} com problema (${outcome.qualityIssue}: ` +
        `words=${diag.words}, sections=${diag.sections}); mantido como DRAFT, não publicado`,
    );
    return Response.json({
      published: false,
      reason: outcome.qualityIssue,
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
      `(engine=${diag.engine} sources=${diag.sourceCount} words=${diag.words}` +
      `${diag.themeRepeat ? " TEMA-FORÇADO" : ""})`,
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
