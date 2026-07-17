import { getAuth } from "@/lib/auth";
import { publishArticle } from "@/lib/publish";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/articles/[id]/publish  (protegido)
 *
 * ÚNICO caminho HUMANO para status `published`. A regra de negócio — só publica
 * quem tem ao menos UMA fonte com URL http/https válida — vive em `lib/publish`
 * (o portão), compartilhada com o cron diário. Esta rota só faz auth e traduz o
 * resultado do portão em HTTP.
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
  const result = await publishArticle(id);

  if (!result.ok) {
    if (result.reason === "not_found") {
      return Response.json({ error: "Artigo não encontrado" }, { status: 404 });
    }
    // no_valid_source -> 422 (não 400): corpo bem-formado, é a REGRA que barra.
    return Response.json(
      {
        error:
          "Publicação bloqueada: é necessária ao menos uma fonte com URL válida (http/https).",
        code: "NO_VALID_SOURCE",
      },
      { status: 422 },
    );
  }

  // Idempotente: já publicado devolve como está, sinalizando `alreadyPublished`.
  if (result.alreadyPublished) {
    return Response.json({ article: result.article, alreadyPublished: true });
  }

  return Response.json({ article: result.article });
}
