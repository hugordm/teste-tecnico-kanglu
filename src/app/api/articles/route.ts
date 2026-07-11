import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { createArticleInput, generateUniqueSlug } from "@/lib/validation";
import { z } from "zod";

// Status válidos para o filtro do GET. Espelha o enum ArticleStatus do schema.
// `published` entra aqui (dá pra listar publicados), mas continua inatingível
// por POST/PATCH — só o /publish o produz.
const listStatus = z.enum([
  "draft",
  "in_review",
  "published",
  "archived",
]);

/**
 * GET /api/articles  (protegido)
 * Lista artigos, opcionalmente filtrando por ?status=.
 */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  const statusParam = new URL(req.url).searchParams.get("status");
  let where: { status?: z.infer<typeof listStatus> } = {};
  if (statusParam !== null) {
    const parsed = listStatus.safeParse(statusParam);
    if (!parsed.success) {
      return Response.json(
        { error: `status inválido: ${statusParam}` },
        { status: 400 },
      );
    }
    where = { status: parsed.data };
  }

  const articles = await prisma.article.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { sources: true },
  });

  return Response.json({ articles });
}

/**
 * POST /api/articles  (protegido)
 * Cria um artigo. Nasce sempre `draft`; slug único gerado do título.
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

  const parsed = createArticleInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Dados inválidos", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const { sources, ...data } = parsed.data;
  const slug = await generateUniqueSlug(data.title);

  const article = await prisma.article.create({
    data: {
      ...data,
      slug,
      status: "draft", // ponto de entrada único: todo artigo começa rascunho
      sources: sources?.length ? { create: sources } : undefined,
    },
    include: { sources: true },
  });

  return Response.json({ article }, { status: 201 });
}
