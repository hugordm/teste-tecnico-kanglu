import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { generateUniqueSlug } from "@/lib/validation";
import { extractMany } from "@/lib/extract";
import { generateDraft, AiError } from "@/lib/ai";
import { generateAndUploadArticleImage } from "@/lib/article-image";
import { z } from "zod";

// O upload da imagem automática usa o SDK do Node (Buffer) via Vercel Blob,
// então fixamos o runtime nodejs (mesmo motivo do /generate-image).
export const runtime = "nodejs";

/**
 * Entrada do POST /api/articles/generate.
 * Só `theme` é obrigatório — dá pra gerar sem fontes (o prompt segura a mão
 * contra inventar dados quando não há material).
 */
const generateInput = z.object({
  theme: z.string().trim().min(1, "Tema é obrigatório"),
  keywords: z.array(z.string().trim().min(1)).optional(),
  urls: z.array(z.url("URL de fonte inválida")).optional(),
});

/**
 * POST /api/articles/generate  (protegido)
 *
 * Extrai o texto das URLs fornecidas, pede um rascunho ao modelo e CRIA o
 * artigo como `draft` — nunca publica sozinho, vai pro fluxo de revisão.
 *
 * Se a geração falhar, responde 502 amigável e NÃO cria nada: melhor não ter
 * artigo do que ter um artigo quebrado no banco.
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

  const parsed = generateInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Dados inválidos", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const { theme, keywords, urls } = parsed.data;

  // Extração é resiliente: URLs podres são ignoradas, não quebram o fluxo.
  const sources = await extractMany(urls ?? []);

  // Geração é o ponto que pode falhar de verdade (API externa). Isolada no try
  // pra virar 502 amigável em vez de 500 cru.
  let result;
  try {
    result = await generateDraft({ theme, keywords, sources });
  } catch (err) {
    if (err instanceof AiError) {
      console.warn(`[generate] geração falhou: ${err.message}`);
      return Response.json(
        {
          error:
            "Geração indisponível, tente novamente ou crie o artigo manualmente.",
        },
        { status: 502 },
      );
    }
    // Erro inesperado (bug nosso, não da API): re-lança pro handler padrão.
    throw err;
  }

  const { draft, model } = result;
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
      // Só as fontes que a extração conseguiu ler entram — cada uma com o
      // momento do acesso, pra rastreabilidade do disclaimer de IA.
      sources: sources.length
        ? {
            create: sources.map((s) => ({
              title: s.title,
              url: s.url,
              accessedAt: new Date(),
            })),
          }
        : undefined,
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
    console.warn(`[generate] imagem automática falhou (artigo mantido): ${msg}`);
  }

  return Response.json({ article }, { status: 201 });
}
