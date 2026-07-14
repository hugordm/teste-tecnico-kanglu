import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { generateUniqueSlug } from "@/lib/validation";
import {
  generateDraftWithWebSearch,
  generateDraftWithFirecrawl,
  AiError,
} from "@/lib/ai";
import { generateAndUploadArticleImageOptions } from "@/lib/article-image";
import { validateModelId, isNativeWebSearchModel } from "@/lib/models";
import { normalizeCategory } from "@/lib/categories";
import { z } from "zod";

// O upload da imagem automática usa o SDK do Node (Buffer) via Vercel Blob,
// então fixamos o runtime nodejs (mesmo motivo do /generate-image).
export const runtime = "nodejs";

/**
 * Entrada do POST /api/articles/generate-auto.
 * Só `theme` é obrigatório — aqui NÃO há URLs: as fontes são buscadas na web
 * pelo próprio modelo (plugin `web` da OpenRouter).
 */
const generateAutoInput = z.object({
  theme: z.string().trim().min(1, "Tema é obrigatório"),
  keywords: z.array(z.string().trim().min(1)).optional(),
  // Modelos escolhidos (opcionais), VALIDADOS contra a lista curada.
  textModel: z.string().optional(),
  imageModel: z.string().optional(),
  // Motor de busca web: Firecrawl (padrão) busca e o modelo escreve; Sonar busca
  // e escreve nativamente (fluxo original). Valor inválido/ausente cai no padrão
  // (Firecrawl) — mesma filosofia leniente do seletor de modelo.
  searchEngine: z.enum(["firecrawl", "sonar"]).default("firecrawl").catch("firecrawl"),
});

/**
 * POST /api/articles/generate-auto  (protegido)
 *
 * Gera um rascunho a partir SÓ do tema: o modelo busca fontes reais na web,
 * a gente desembrulha os redirects do Google, descarta concorrentes e só então
 * cria o artigo (draft) com as fontes reais que sobraram.
 *
 * Contratos de falha:
 *   - 502 se a busca/geração falhar (AiError) — nada é criado.
 *   - 422 se, após desembrulhar + filtrar, sobrarem ZERO fontes válidas —
 *     nada é criado; sugere a geração manual.
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

  const { theme, keywords, searchEngine } = parsed.data;

  // Valida os modelos escolhidos contra a lista curada (allowlist); inválido/
  // ausente vira undefined → cai no default do env. O texto valida POR MOTOR:
  //   - Firecrawl: lista COMPLETA (o modelo só escreve; a busca é do Firecrawl) —
  //     qualquer modelo, inclusive lite.
  //   - Sonar: lista ROBUSTA (textWeb, sem lite) — um lite escolhido à mão é
  //     rejeitado aqui e cai no default robusto (Sonar), evitando o 422 do plugin.
  // Camada de segurança dupla: mesmo que a UI mostre um lite, o servidor barra.
  const textKind = searchEngine === "sonar" ? "textWeb" : "text";
  const textModel = await validateModelId(parsed.data.textModel, textKind);
  const imageModel = await validateModelId(parsed.data.imageModel, "image");

  // Busca + geração. Isolada no try pra virar 502 amigável em vez de 500 cru se
  // a API externa falhar. Dois motores de busca:
  //   - "sonar": fluxo ORIGINAL, intocado — o Sonar busca e escreve nativamente.
  //   - "firecrawl" (padrão): o Firecrawl busca e o modelo do seletor escreve. Se
  //     o Firecrawl falhar (erro/limite/timeout) OU não sobrar fonte
  //     não-concorrente, cai AUTOMATICAMENTE no Sonar (fallback) — a busca nunca
  //     simplesmente quebra. Só se o Sonar TAMBÉM falhar vira 502.
  let result;
  try {
    if (searchEngine === "sonar") {
      result = await generateDraftWithWebSearch({ theme, keywords, model: textModel });
    } else {
      try {
        result = await generateDraftWithFirecrawl({ theme, keywords, model: textModel });
      } catch (fcErr) {
        const msg = fcErr instanceof Error ? fcErr.message : String(fcErr);
        console.warn(
          `[generate-auto] Firecrawl indisponível, caindo no Sonar: ${msg}`,
        );
        // Fallback SEMPRE no Sonar (env WEB_SEARCH_MODEL), sem passar o modelo
        // escritor: ele pode ser um "lite" que não busca bem. O Sonar é a rede.
        result = await generateDraftWithWebSearch({ theme, keywords });
      }
    }
  } catch (err) {
    if (err instanceof AiError) {
      console.warn(`[generate-auto] geração falhou: ${err.message}`);
      return Response.json(
        {
          error:
            "Geração indisponível, tente novamente ou crie o artigo manualmente.",
        },
        { status: 502 },
      );
    }
    throw err;
  }

  // As fontes já vêm desembrulhadas e sem concorrentes (resolvidas dentro de
  // generateDraftWithWebSearch, que também já re-tentou o caso "zero válidas").
  const { draft, model, sources } = result;

  // Nenhuma fonte real e não-concorrente sobrou → NÃO cria o artigo. Melhor um
  // 422 honesto do que um rascunho sem lastro factual. A mensagem depende de
  // QUEM buscou: modelo não-nativo que não trouxe fonte provavelmente não
  // acionou bem o plugin `web` (típico dos lite) → orienta trocar por Sonar/
  // robusto. Sonar (nativo) sem fontes = realmente não achou não-concorrentes.
  if (sources.length === 0) {
    console.warn(
      `[generate-auto] nenhuma fonte válida para o tema "${theme}" (modelo: ${model})`,
    );
    const error = isNativeWebSearchModel(model)
      ? "Não foram encontradas fontes adequadas (não-concorrentes) para este tema. Use a geração manual com URLs."
      : "Este modelo não trouxe fontes para a busca web. Use o Sonar (recomendado) ou um modelo mais robusto, ou faça a geração manual com URLs.";
    return Response.json({ error }, { status: 422 });
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
      status: "draft", // SEMPRE draft — IA não publica, revisão humana decide
      aiAssisted: true,
      aiModel: model,
      // Sugestão de categoria da IA (mesmo JSON, sem chamada extra), normalizada
      // contra a lista fixa → slug válido ou null. Pré-seleciona no editor.
      category: normalizeCategory(draft.category),
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
  // se a geração/upload das imagens falhar, engolimos o erro (warn) e devolvemos
  // o artigo sem imagem — o usuário gera depois pelo botão manual. Try/catch
  // próprio, isolado, pra que uma falha externa jamais derrube a criação.
  //
  // Gera 4 opções EM PARALELO: a 1ª que der certo vira a capa padrão (ogImage),
  // e TODAS ficam em imageOptions pro editor escolher depois. Se só 2-3 derem
  // certo, usamos as que deram (allSettled dentro do helper).
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

  return Response.json({ article }, { status: 201 });
}
