import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { isValidHttpUrl } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/articles/[id]/publish  (protegido)
 *
 * ÚNICO caminho para status `published`. Regra de negócio: um artigo só é
 * publicável se tiver ao menos UMA fonte com URL http/https válida.
 *
 * Falha na regra -> 422 (Unprocessable Entity), NÃO 400. O corpo/estado está
 * bem-formado; o que impede é a regra de negócio. Essa distinção é o ponto.
 */
export async function POST(req: Request, { params }: Params) {
  const auth = await getAuth(req);
  if (!auth) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const article = await prisma.article.findUnique({
    where: { id },
    include: { sources: true },
  });
  if (!article) {
    return Response.json({ error: "Artigo não encontrado" }, { status: 404 });
  }

  // Já publicado: idempotente, devolve como está (não é erro).
  if (article.status === "published") {
    return Response.json({ article, alreadyPublished: true });
  }

  // O portão: pelo menos uma fonte com URL http/https de verdade.
  const validSources = article.sources.filter((s) => isValidHttpUrl(s.url));
  if (validSources.length === 0) {
    return Response.json(
      {
        error:
          "Publicação bloqueada: é necessária ao menos uma fonte com URL válida (http/https).",
        code: "NO_VALID_SOURCE",
      },
      { status: 422 },
    );
  }

  const published = await prisma.article.update({
    where: { id },
    data: {
      status: "published",
      publishedAt: article.publishedAt ?? new Date(),
    },
    include: { sources: true },
  });

  return Response.json({ article: published });
}
