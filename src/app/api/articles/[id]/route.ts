import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { updateArticleInput, slugify } from "@/lib/validation";
import { deleteArticleImages } from "@/lib/article-image";
import { z } from "zod";

// O passo de confirmar a escolha de capa apaga imagens do Vercel Blob (SDK do
// Node), então fixamos o runtime nodejs.
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/articles/[id]  (protegido)
 */
export async function GET(req: Request, { params }: Params) {
  const auth = await getAuth(req);
  if (!auth) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params; // params é Promise no Next 16
  const article = await prisma.article.findUnique({
    where: { id },
    include: { sources: true },
  });
  if (!article) {
    return Response.json({ error: "Artigo não encontrado" }, { status: 404 });
  }

  return Response.json({ article });
}

/**
 * PATCH /api/articles/[id]  (protegido)
 * Atualização parcial. NÃO publica: `status` aqui só aceita
 * draft/in_review/archived (garantido pelo updateArticleInput).
 */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await getAuth(req);
  if (!auth) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = updateArticleInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Dados inválidos", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const existing = await prisma.article.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Artigo não encontrado" }, { status: 404 });
  }

  const { sources, title, ...rest } = parsed.data;

  // Se o título mudou, regeneramos o slug (único, excluindo o próprio artigo).
  let slug: string | undefined;
  if (title !== undefined && title !== existing.title) {
    slug = await generateUniqueSlug(title, id);
  }

  // Confirmação da escolha de capa: salvar é o momento em que a opção marcada
  // (`ogImage`) vira DEFINITIVA. Se o artigo ainda tinha opções pendentes
  // (`imageOptions` não vazio), aqui a gente confirma — as demais opções somem
  // do Blob e `imageOptions` esvazia. `finalOg` é a URL que fica: a enviada no
  // payload (a marcada) ou, se o cliente não mandou o campo, a capa atual.
  // `imageOptions` NÃO é editável pelo cliente (fora do updateArticleInput):
  // quem o zera é só este passo, de forma controlada.
  const clearImageOptions = existing.imageOptions.length > 0;
  const imageOptionsData = clearImageOptions ? { imageOptions: [] } : {};

  const article = await prisma.article.update({
    where: { id },
    data: {
      ...rest,
      ...imageOptionsData,
      ...(title !== undefined ? { title } : {}),
      ...(slug !== undefined ? { slug } : {}),
      // Fontes enviadas SUBSTITUEM as existentes (troca atômica).
      ...(sources !== undefined
        ? { sources: { deleteMany: {}, create: sources } }
        : {}),
    },
    include: { sources: true },
  });

  // Limpeza do Blob depois do commit no banco: apaga as opções não escolhidas.
  // Fora da transação de propósito — é limpeza de lixo e nunca deve fazer o save
  // falhar (deleteArticleImages também não lança). Se o Blob estiver fora do ar,
  // o pior caso é uma imagem órfã, não um erro pro usuário.
  if (clearImageOptions) {
    const finalOg = "ogImage" in rest ? rest.ogImage : existing.ogImage;
    const toDelete = existing.imageOptions.filter((u) => u !== finalOg);
    await deleteArticleImages(toDelete);
  }

  return Response.json({ article });
}

/**
 * DELETE /api/articles/[id]  (protegido)
 * As Source do artigo caem junto por onDelete: Cascade no schema.
 */
export async function DELETE(req: Request, { params }: Params) {
  const auth = await getAuth(req);
  if (!auth) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.article.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Artigo não encontrado" }, { status: 404 });
  }

  await prisma.article.delete({ where: { id } });
  return Response.json({ ok: true });
}

/** Igual ao do POST, mas ignorando o próprio artigo na checagem de colisão. */
async function generateUniqueSlug(
  title: string,
  excludeId: string,
): Promise<string> {
  const base = slugify(title) || "artigo";
  let candidate = base;
  let n = 2;

  while (true) {
    const clash = await prisma.article.findUnique({
      where: { slug: candidate },
    });
    if (!clash || clash.id === excludeId) break;
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}
