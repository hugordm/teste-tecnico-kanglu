import "server-only";
import { prisma } from "@/lib/prisma";
import { generateUniqueSlug } from "@/lib/validation";
import {
  generateDraftWithWebSearch,
  generateDraftWithFirecrawl,
  AiError,
} from "@/lib/ai";
import { generateAndUploadArticleImageOptions } from "@/lib/article-image";
import { validateModelId } from "@/lib/models";
import { normalizeCategory } from "@/lib/categories";
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
   * Busca apenas conteúdo RECENTE (últimos meses). O cron diário liga isto para
   * o artigo do dia falar do momento atual, não de tema atemporal. No Firecrawl
   * vira filtro `tbs`; no fallback Sonar, a atualidade vem do próprio tema.
   */
  recent?: boolean;
  /**
   * Agendamento de visibilidade (`publishAt`). Null/ausente = visível assim que
   * publicado. Data futura = fica `published` mas invisível no blog até a hora
   * (mesmo mecanismo do agendamento manual). O cron usa isto para o artigo gerado
   * de manhã só aparecer mais tarde. Gravado em UTC.
   */
  publishAt?: Date;
}

/**
 * Resultado discriminado da geração:
 *   - ok                → artigo criado (draft, com fontes e talvez imagem).
 *   - generation_failed → busca/geração da IA falhou (AiError). Nada criado. (502)
 *   - no_sources        → após filtrar, sobraram ZERO fontes. Nada criado. (422)
 *     Carrega o `model` usado para o chamador decidir a mensagem (nativo x não).
 */
export type GenerateAutoOutcome =
  | { ok: true; article: ArticleWithSources }
  | { ok: false; reason: "generation_failed" }
  | { ok: false; reason: "no_sources"; model: string };

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
  let result;
  try {
    if (searchEngine === "sonar") {
      result = await generateDraftWithWebSearch({
        theme,
        keywords,
        model: textModel,
        recent,
      });
    } else {
      try {
        result = await generateDraftWithFirecrawl({
          theme,
          keywords,
          model: textModel,
          recent,
        });
      } catch (fcErr) {
        const msg = fcErr instanceof Error ? fcErr.message : String(fcErr);
        console.warn(
          `[generate-auto] Firecrawl indisponível, caindo no Sonar: ${msg}`,
        );
        // Fallback SEMPRE no Sonar (env WEB_SEARCH_MODEL), sem passar o modelo
        // escritor: ele pode ser um "lite" que não busca bem. O Sonar é a rede.
        result = await generateDraftWithWebSearch({ theme, keywords, recent });
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

  return { ok: true, article };
}
