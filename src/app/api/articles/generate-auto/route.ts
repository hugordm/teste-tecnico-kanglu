import { getAuth } from "@/lib/auth";
import { generateAutoInput } from "@/lib/api-schemas";
import { generateAutoArticle } from "@/lib/generate-article";
import { isNativeWebSearchModel } from "@/lib/models";
import { z } from "zod";

// O upload da imagem automática usa o SDK do Node (Buffer) via Vercel Blob,
// então fixamos o runtime nodejs (mesmo motivo do /generate-image).
export const runtime = "nodejs";

/**
 * POST /api/articles/generate-auto  (protegido)
 *
 * Gera um rascunho a partir SÓ do tema. A orquestração (busca com fallback
 * Firecrawl→Sonar, filtro de concorrentes, criação + imagem) vive em
 * `lib/generate-article`, compartilhada com o cron diário. Esta rota só faz
 * auth, valida o corpo e traduz o resultado em HTTP.
 *
 * Contratos de falha:
 *   - 502 se a busca/geração falhar (generation_failed) — nada é criado.
 *   - 422 se sobrarem ZERO fontes válidas (no_sources) — nada é criado; a
 *     mensagem depende de quem buscou (modelo nativo x não-nativo).
 */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = generateAutoInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Dados inválidos", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  // `recent` vem do toggle da tela, mas quem decide é o schema: só um booleano
  // de verdade liga a recência (ver generateAutoInput). O cliente não é fonte de
  // verdade — se mandar "true" como string, ou nada, sai desligado.
  const { theme, keywords, searchEngine, textModel, imageModel, recent } =
    parsed.data;

  const outcome = await generateAutoArticle({
    theme,
    keywords,
    searchEngine,
    textModel,
    imageModel,
    // MESMO parâmetro do cron: daqui pra baixo os dois caminhos são idênticos.
    // A tradução para cada motor (tbs do Firecrawl, search_recency do Sonar)
    // continua só em lib/recency — nada de recência é reimplementado aqui.
    recent,
  });

  if (!outcome.ok) {
    if (outcome.reason === "generation_failed") {
      return Response.json(
        {
          error:
            "Geração indisponível, tente novamente ou crie o artigo manualmente.",
        },
        { status: 502 },
      );
    }
    if (outcome.reason === "too_short") {
      // O modelo devolveu um texto abaixo do piso (parágrafo/snippet). É variação
      // do modelo — gerar de novo costuma resolver. 422: entrada válida, saída ruim.
      return Response.json(
        {
          error:
            "O texto gerado ficou muito curto (menos que um artigo). Gere de novo — costuma sair melhor na próxima.",
          code: "ARTICLE_TOO_SHORT",
        },
        { status: 422 },
      );
    }
    if (outcome.reason === "off_topic") {
      // A busca trouxe fontes fora do tema (a busca por tema às vezes degrada e
      // retorna material off-topic). 422: gerar de novo, ou usar URLs manuais.
      return Response.json(
        {
          error:
            "As fontes encontradas não são do tema. Gere de novo, ajuste o tema/palavras-chave, ou use a geração manual com URLs.",
          code: "ARTICLE_OFF_TOPIC",
        },
        { status: 422 },
      );
    }
    if (outcome.reason === "budget_exceeded") {
      // Não deve ocorrer no painel (só o cron passa deadlineMs), mas o tipo exige.
      return Response.json(
        { error: "Geração excedeu o tempo. Tente novamente." },
        { status: 502 },
      );
    }
    // no_sources: modelo não-nativo que não trouxe fonte provavelmente não
    // acionou bem o plugin `web` (típico dos lite) → orienta trocar por Sonar/
    // robusto. Sonar (nativo) sem fontes = realmente não achou não-concorrentes.
    const error = isNativeWebSearchModel(outcome.model)
      ? "Não foram encontradas fontes adequadas (não-concorrentes) para este tema. Use a geração manual com URLs."
      : "Este modelo não trouxe fontes para a busca web. Use o Sonar (recomendado) ou um modelo mais robusto, ou faça a geração manual com URLs.";
    return Response.json({ error }, { status: 422 });
  }

  return Response.json({ article: outcome.article }, { status: 201 });
}
