import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { generateUniqueSlug } from "@/lib/validation";
import { generateDraftWithWebSearch, AiError } from "@/lib/ai";
import { generateAndUploadArticleImage } from "@/lib/article-image";
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

  const { theme, keywords } = parsed.data;

  // Busca + geração num só passo. Isolada no try pra virar 502 amigável em vez
  // de 500 cru se a API externa falhar.
  let result;
  try {
    result = await generateDraftWithWebSearch({ theme, keywords });
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
  // 422 honesto do que um rascunho sem lastro factual.
  if (sources.length === 0) {
    console.warn(
      `[generate-auto] nenhuma fonte válida para o tema "${theme}"`,
    );
    return Response.json(
      {
        error:
          "Não foram encontradas fontes adequadas (não-concorrentes) para este tema. Use a geração manual com URLs.",
      },
      { status: 422 },
    );
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
  // se a geração/upload da imagem falhar, engolimos o erro (warn) e devolvemos o
  // artigo sem imagem — o usuário gera depois pelo botão manual. Try/catch
  // próprio, isolado, pra que uma falha externa jamais derrube a criação.
  try {
    const { url, credit } = await generateAndUploadArticleImage(
      article.id,
      article.title,
    );
    article = await prisma.article.update({
      where: { id: article.id },
      data: { ogImage: url, imageCredit: credit },
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
