// ---------------------------------------------------------------------------
// Ponte entre a geração de bytes da imagem (`image.ts`) e a hospedagem no
// Vercel Blob. Fica numa camada própria (não no `image.ts`, que só produz
// bytes) para ser reutilizada por TODAS as rotas que geram imagem:
//   - POST /api/articles/[id]/generate-image  (botão manual: gerar/regerar)
//   - POST /api/articles/generate             (geração automática ao criar)
//   - POST /api/articles/generate-auto        (idem, via busca web)
//
// Esta função só GERA + HOSPEDA e devolve a URL + crédito. A persistência no
// artigo (update do `ogImage`/`imageCredit`) fica em cada rota, porque cada
// fluxo trata a falha de um jeito (502 amigável no manual; ignora e segue com
// o artigo sem imagem nos fluxos automáticos).
// ---------------------------------------------------------------------------

import { put } from "@vercel/blob";
import { generateArticleImage, IMAGE_CREDIT } from "@/lib/image";

/** Extensão do arquivo a partir do MIME devolvido pelo modelo (fallback png). */
function extFromContentType(contentType: string): string {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  return "png";
}

export interface UploadedArticleImage {
  /** URL pública no Vercel Blob, pronta pra virar `ogImage`. */
  url: string;
  /** Crédito do modelo, pronto pra virar `imageCredit`. */
  credit: string;
}

/**
 * Gera uma imagem ilustrativa via IA e hospeda no Vercel Blob (público).
 * Devolve a URL pública + o crédito do modelo — o chamador decide como/onde
 * persistir no artigo.
 *
 * LANÇA em qualquer falha (geração ou upload): `ImageAiError` se a geração
 * falhar, ou o erro cru do Blob. O chamador é responsável por tratar — nenhum
 * artigo é tocado aqui.
 */
export async function generateAndUploadArticleImage(
  articleId: string,
  title: string,
): Promise<UploadedArticleImage> {
  const image = await generateArticleImage(title);

  const blob = await put(
    `articles/${articleId}-${Date.now()}.${extFromContentType(image.contentType)}`,
    image.data,
    { access: "public", contentType: image.contentType },
  );

  return { url: blob.url, credit: IMAGE_CREDIT };
}
