import "server-only";
import { prisma } from "@/lib/prisma";
import { generateUniqueSlug } from "@/lib/validation";
import {
  generateDraftWithWebSearch,
  generateDraftWithFirecrawl,
  checkArticleLength,
  type ArticleLength,
  AiError,
} from "@/lib/ai";
import { generateAndUploadArticleImageOptions } from "@/lib/article-image";
import { validateModelId } from "@/lib/models";
import { normalizeCategory } from "@/lib/categories";
import { hasNicheSignal } from "@/lib/relevance";
import type { ArticleWithSources } from "@/lib/publish";

// ---------------------------------------------------------------------------
// Geração automática por TEMA — busca fontes reais, escreve o rascunho e cria o
// artigo (sempre `draft`). Antes esta orquestração vivia inline no handler de
// `POST /api/articles/generate-auto`. Foi extraída para cá porque o cron diário
// precisa da MESMA geração (busca com fallback Firecrawl→Sonar, filtro de
// concorrentes, criação + imagem) — e duplicar ~100 linhas de fallback delicado
// entre a rota e o cron seria pedir para os dois divergirem.
//
// A função devolve um resultado discriminado; quem chama (a rota HTTP ou o cron)
// traduz o motivo em resposta. O `runtime = "nodejs"` continua sendo declarado
// nas ROTAS (config de rota), não aqui.
// ---------------------------------------------------------------------------

/** Qual caminho de busca produziu as fontes (instrumentação — item 2.2). */
export type SearchEngineUsed = "firecrawl" | "sonar" | "sonar-fallback";

/** O que fazer quando o rascunho vem abaixo do piso de extensão. */
export type ShortPolicy = "reject" | "keepDraft";

export interface GenerateAutoParams {
  theme: string;
  keywords?: string[];
  /** Firecrawl (padrão) busca e o modelo escreve; Sonar busca e escreve nativo. */
  searchEngine: "firecrawl" | "sonar";
  /** Modelos escolhidos (opcionais); VALIDADOS contra a lista curada aqui dentro. */
  textModel?: string;
  imageModel?: string;
  /** Origem gravada no artigo (`createdVia`). Ex.: "cron-daily". Default: null. */
  createdVia?: string;
  /**
   * Busca apenas conteúdo RECENTE (últimos meses). O cron diário liga isto para o
   * artigo do dia falar do momento atual. No Firecrawl vira filtro `tbs`; no Sonar
   * (nativo) vira `search_after_date_filter` — mesma janela (lib/recency).
   */
  recent?: boolean;
  /**
   * Agendamento de visibilidade (`publishAt`). Null/ausente = visível assim que
   * publicado. Data futura = fica `published` mas invisível no blog até a hora
   * (mesmo mecanismo do agendamento manual). Gravado em UTC.
   */
  publishAt?: Date;
  /**
   * Política para rascunho abaixo do piso de extensão (checkArticleLength):
   *   - "reject" (default, painel): não cria nada; devolve `too_short` → 422. Tem
   *     humano para gerar de novo.
   *   - "keepDraft" (cron): re-tenta a escrita 1× (retryOnShort); se persistir,
   *     CRIA como draft e sinaliza `tooShort` para o chamador NÃO publicar. Sem
   *     humano, melhor nenhum artigo no ar que um parágrafo.
   */
  shortPolicy?: ShortPolicy;
}

/**
 * Problema de QUALIDADE detectado após gerar:
 *   - too_short → abaixo do piso de extensão (parágrafo/snippet).
 *   - off_topic → nenhuma fonte tem sinal do nicho (título+URL) — a busca trouxe
 *     material fora do tema (poliéster, portos…). O portão de fonte não pega isso.
 */
export type QualityIssue = "too_short" | "off_topic";

/**
 * Resultado discriminado da geração:
 *   - ok                → artigo criado (draft). `qualityIssue` diz se algo ficou
 *     ruim mesmo assim (só com shortPolicy "keepDraft", o cron): o chamador usa
 *     para NÃO publicar. `engine`/`sourceCount`/`length` = instrumentação.
 *   - generation_failed → busca/geração da IA falhou (AiError). Nada criado. (502)
 *   - no_sources        → após filtrar, sobraram ZERO fontes. Nada criado. (422)
 *   - too_short/off_topic → problema de qualidade com shortPolicy "reject". Nada
 *     criado. (422) Carrega `length` para a mensagem.
 */
export type GenerateAutoOutcome =
  | {
      ok: true;
      article: ArticleWithSources;
      engine: SearchEngineUsed;
      sourceCount: number;
      qualityIssue: QualityIssue | null;
      length: ArticleLength;
    }
  | { ok: false; reason: "generation_failed" }
  | { ok: false; reason: "no_sources"; model: string }
  | { ok: false; reason: QualityIssue; length: ArticleLength; model: string };

/**
 * Gera um rascunho a partir SÓ do tema: o motor escolhido busca fontes reais na
 * web, filtramos concorrentes e só então criamos o artigo (draft) com as fontes
 * que sobraram. NUNCA publica — publicar é decisão à parte (o portão).
 */
export async function generateAutoArticle(
  params: GenerateAutoParams,
): Promise<GenerateAutoOutcome> {
  const { theme, keywords, searchEngine, createdVia, recent, publishAt } =
    params;
  const shortPolicy: ShortPolicy = params.shortPolicy ?? "reject";
  // Só o cron (keepDraft) re-escreve um rascunho curto; o painel rejeita direto.
  const retryOnShort = shortPolicy === "keepDraft";

  // Valida os modelos escolhidos contra a lista curada (allowlist); inválido/
  // ausente vira undefined → cai no default do env. O texto valida POR MOTOR:
  //   - Firecrawl: lista COMPLETA (o modelo só escreve; a busca é do Firecrawl).
  //   - Sonar: lista ROBUSTA (textWeb, sem lite) — um lite escolhido à mão cai
  //     no default robusto (Sonar), evitando o 422 do plugin.
  const textKind = searchEngine === "sonar" ? "textWeb" : "text";
  const textModel = await validateModelId(params.textModel, textKind);
  const imageModel = await validateModelId(params.imageModel, "image");

  // Busca + geração. Dois motores:
  //   - "sonar": o Sonar busca e escreve nativamente.
  //   - "firecrawl" (padrão): o Firecrawl busca e o modelo escreve. Se o
  //     Firecrawl falhar (erro/limite/timeout) OU não sobrar fonte, cai
  //     AUTOMATICAMENTE no Sonar. Só se o Sonar TAMBÉM falhar vira generation_failed.
  // `engine` registra qual caminho REALMENTE produziu as fontes (instrumentação).
  let result;
  let engine: SearchEngineUsed = searchEngine;
  try {
    if (searchEngine === "sonar") {
      result = await generateDraftWithWebSearch({
        theme,
        keywords,
        model: textModel,
        recent,
        retryOnShort,
      });
    } else {
      try {
        result = await generateDraftWithFirecrawl({
          theme,
          keywords,
          model: textModel,
          recent,
          retryOnShort,
        });
      } catch (fcErr) {
        const msg = fcErr instanceof Error ? fcErr.message : String(fcErr);
        console.warn(
          `[generate-auto] Firecrawl indisponível, caindo no Sonar: ${msg}`,
        );
        // Fallback SEMPRE no Sonar (env WEB_SEARCH_MODEL), sem passar o modelo
        // escritor: ele pode ser um "lite" que não busca bem. O Sonar é a rede.
        // `recent` aqui aplica o search_after_date_filter do Sonar (item 2.1).
        engine = "sonar-fallback";
        result = await generateDraftWithWebSearch({
          theme,
          keywords,
          recent,
          retryOnShort,
        });
      }
    }
  } catch (err) {
    if (err instanceof AiError) {
      console.warn(`[generate-auto] geração falhou: ${err.message}`);
      return { ok: false, reason: "generation_failed" };
    }
    throw err;
  }

  // As fontes já vêm desembrulhadas e sem concorrentes (resolvidas dentro dos
  // geradores, que também já re-tentaram o caso "zero válidas").
  const { draft, model, sources } = result;

  // Nenhuma fonte real e não-concorrente sobrou → NÃO cria o artigo. Melhor um
  // "no_sources" honesto do que um rascunho sem lastro factual.
  if (sources.length === 0) {
    console.warn(
      `[generate-auto] nenhuma fonte válida para o tema "${theme}" (modelo: ${model})`,
    );
    return { ok: false, reason: "no_sources", model };
  }

  // Portões de QUALIDADE (o portão de fonte só vê http+não-concorrente):
  //   - relevância: ao menos UMA fonte precisa ter sinal do nicho no título+URL
  //     (backstop universal — no Firecrawl as fontes já vêm filtradas por conteúdo;
  //     aqui pega principalmente um fallback Sonar que trouxe off-topic).
  //   - extensão: o piso de seções/palavras (os geradores já re-escreveram 1× se
  //     retryOnShort; aqui é o veredito final).
  // Prioriza off_topic (mais grave: assunto errado) sobre too_short.
  const length = checkArticleLength(draft.content);
  const onNiche = sources.some((s) => hasNicheSignal(s.title, s.url));
  const issue: QualityIssue | null = !onNiche
    ? "off_topic"
    : !length.ok
      ? "too_short"
      : null;
  console.info(
    `[generate-auto] engine=${engine} sources=${sources.length} ` +
      `recent=${!!recent} words=${length.words} sections=${length.sections} ` +
      `lengthOk=${length.ok} onNiche=${onNiche} issue=${issue ?? "none"}`,
  );

  // Problema + política "reject" (painel): não cria nada, devolve 422 amigável.
  if (issue && shortPolicy === "reject") {
    console.warn(
      `[generate-auto] rascunho rejeitado (${issue}: words=${length.words}, ` +
        `sections=${length.sections}, onNiche=${onNiche}) para o tema "${theme}"`,
    );
    return { ok: false, reason: issue, length, model };
  }
  // Problema + "keepDraft" (cron): segue e cria como draft, mas marca o issue para
  // o cron NÃO publicar — fica para revisão humana.

  const slug = await generateUniqueSlug(draft.suggestedSlug || draft.title);

  let article = await prisma.article.create({
    data: {
      title: draft.title,
      slug,
      excerpt: draft.excerpt,
      content: draft.content,
      metaTitle: draft.metaTitle,
      metaDescription: draft.metaDescription,
      status: "draft", // SEMPRE draft — a geração não publica; o portão decide
      aiAssisted: true,
      aiModel: model,
      // Sugestão de categoria da IA, normalizada contra a lista fixa → slug ou null.
      category: normalizeCategory(draft.category),
      // Origem: null no fluxo do editor, "cron-daily" quando vem do cron.
      createdVia: createdVia ?? null,
      // Agendamento de visibilidade (null = aparece assim que publicado).
      publishAt: publishAt ?? null,
      // As fontes reais desembrulhadas — cada uma com o momento do acesso.
      sources: {
        create: sources.map((s) => ({
          title: s.title,
          url: s.url,
          accessedAt: new Date(),
        })),
      },
    },
    include: { sources: true },
  });

  // Imagem automática: extra, NUNCA obrigatória. O artigo já está salvo acima;
  // se a geração/upload falhar, engolimos o erro (warn) e devolvemos sem imagem.
  // Gera 4 opções EM PARALELO: a 1ª que der certo vira capa (ogImage); todas
  // ficam em imageOptions para escolha posterior no editor.
  try {
    const { urls, credit } = await generateAndUploadArticleImageOptions(
      article.id,
      article.title,
      4,
      imageModel,
    );
    article = await prisma.article.update({
      where: { id: article.id },
      data: { ogImage: urls[0], imageCredit: credit, imageOptions: urls },
      include: { sources: true },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[generate-auto] imagem automática falhou (artigo mantido): ${msg}`,
    );
  }

  return {
    ok: true,
    article,
    engine,
    sourceCount: sources.length,
    qualityIssue: issue,
    length,
  };
}
