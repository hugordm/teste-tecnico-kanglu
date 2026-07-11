import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { generateArticleImage, ImageAiError, IMAGE_CREDIT } from "@/lib/image";

// O upload pro Blob usa o SDK do Node (Buffer), então fixamos o runtime nodejs.
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Extensão do arquivo a partir do MIME devolvido pelo modelo (fallback png). */
function extFromContentType(contentType: string): string {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  return "png";
}

/**
 * POST /api/articles/[id]/generate-image  (protegido)
 *
 * Gera uma imagem ilustrativa via Nano Banana 2 Lite (OpenRouter), hospeda no
 * Vercel Blob (público) e salva a URL + o crédito do modelo no artigo. Pode ser
 * chamado de novo para SUBSTITUIR a imagem (gera outra e sobrescreve a URL).
 *
 * A URL vai em `ogImage` (serve de imagem no topo do artigo E de imagem
 * OpenGraph/JSON-LD) e o crédito em `imageCredit`.
 *
 * Contratos de falha — NENHUM deles corrompe o artigo (só damos update DEPOIS de
 * ter a imagem e a URL do Blob em mãos):
 *   - 401 se não autenticado.
 *   - 404 se o artigo não existe.
 *   - 502 se a geração da imagem OU o upload falharem (mensagem amigável).
 */
export async function POST(req: Request, { params }: Params) {
  const auth = await getAuth(req);
  if (!auth) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params; // params é Promise no Next 16
  const existing = await prisma.article.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Artigo não encontrado" }, { status: 404 });
  }

  // Geração + upload são os pontos que podem falhar de verdade (APIs externas).
  // Isolados no try pra virar 502 amigável em vez de 500 cru — e, crucialmente,
  // o artigo só é tocado no update lá embaixo, depois de tudo dar certo.
  let url: string;
  try {
    const image = await generateArticleImage(existing.title);

    const blob = await put(
      `articles/${id}-${Date.now()}.${extFromContentType(image.contentType)}`,
      image.data,
      { access: "public", contentType: image.contentType },
    );
    url = blob.url;
  } catch (err) {
    if (err instanceof ImageAiError) {
      console.warn(`[generate-image] geração falhou: ${err.message}`);
    } else {
      // Falha do upload (Blob) ou outro erro externo: log e 502 mesmo assim,
      // sem derrubar o server nem mexer no artigo.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[generate-image] upload/erro externo falhou: ${msg}`);
    }
    return Response.json(
      { error: "Não foi possível gerar a imagem agora. Tente novamente." },
      { status: 502 },
    );
  }

  // Só aqui tocamos o artigo: URL da imagem em ogImage + crédito do modelo.
  const article = await prisma.article.update({
    where: { id },
    data: { ogImage: url, imageCredit: IMAGE_CREDIT },
    include: { sources: true },
  });

  return Response.json({ article });
}
