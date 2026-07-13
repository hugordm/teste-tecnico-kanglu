// ---------------------------------------------------------------------------
// Ponte entre a geração de bytes da imagem (`image.ts`) e a hospedagem no
// Vercel Blob. Fica numa camada própria (não no `image.ts`, que só produz
// bytes) para ser reutilizada por TODAS as rotas que geram imagem:
//   - POST /api/articles/[id]/generate-image  (botão manual: gerar novamente)
//   - POST /api/articles/generate             (geração automática ao criar)
//   - POST /api/articles/generate-auto        (idem, via busca web)
//
// Estas funções só GERAM + HOSPEDAM (ou APAGAM) e devolvem URLs. A persistência
// no artigo (update de `ogImage`/`imageOptions`) fica em cada rota, porque cada
// fluxo trata a falha de um jeito (502 amigável no manual; ignora e segue com o
// artigo sem imagem nos fluxos automáticos).
// ---------------------------------------------------------------------------

import { put, del } from "@vercel/blob";
import { generateArticleImage, IMAGE_CREDIT } from "@/lib/image";

/** Extensão do arquivo a partir do MIME devolvido pelo modelo (fallback png). */
function extFromContentType(contentType: string): string {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  return "png";
}

/**
 * Direções de estilo/composição — uma por opção. Variar o prompt faz as 4
 * saírem visivelmente distintas (senão o modelo tende a repetir a mesma cena).
 * A ordem importa pouco: a 1ª que subir vira a capa padrão, mas todas são
 * intercambiáveis na galeria de escolha.
 */
const VARIANT_HINTS = [
  "composição isométrica com objetos em 3D estilizado e sombras suaves",
  "close-up de um detalhe (pacote, etiqueta ou mão), enquadramento aproximado",
  "cena ampla com bastante espaço negativo e profundidade, poucos elementos",
  "conjunto de ícones flat organizados em grade, estilo infográfico limpo",
];

export interface UploadedArticleImage {
  /** URL pública no Vercel Blob, pronta pra virar `ogImage`. */
  url: string;
  /** Crédito do modelo, pronto pra virar `imageCredit`. */
  credit: string;
}

export interface UploadedArticleImageOptions {
  /**
   * URLs públicas (Vercel Blob) das opções que deram certo — 1 a `count`. A
   * PRIMEIRA é a capa padrão sugerida. Vazio nunca acontece: se NENHUMA deu
   * certo, a função lança em vez de devolver `[]`.
   */
  urls: string[];
  /** Crédito do modelo, comum a todas as opções. */
  credit: string;
}

/**
 * Gera `count` (padrão 4) ilustrações EM PARALELO e hospeda cada uma no Vercel
 * Blob. Devolve as URLs das que deram certo (a 1ª é a capa padrão sugerida) +
 * o crédito do modelo — o chamador decide como/onde persistir.
 *
 * Resiliência: usa `Promise.allSettled`, então uma variação que falhe (geração
 * ou upload) NÃO derruba as outras — 2 ou 3 opções já servem. LANÇA só no caso
 * extremo de TODAS falharem; aí o chamador trata (502 no manual, warn nos
 * fluxos automáticos, sempre sem tocar no artigo).
 */
export async function generateAndUploadArticleImageOptions(
  articleId: string,
  title: string,
  count = 4,
  imageModel?: string,
): Promise<UploadedArticleImageOptions> {
  const hints = Array.from(
    { length: count },
    (_, i) => VARIANT_HINTS[i % VARIANT_HINTS.length],
  );

  const settled = await Promise.allSettled(
    hints.map(async (hint, i) => {
      const image = await generateArticleImage(title, hint, imageModel);
      // Sufixo `-i` além do timestamp: as 4 sobem "ao mesmo tempo", então o
      // Date.now() pode coincidir entre elas — o índice garante chaves únicas.
      const blob = await put(
        `articles/${articleId}-${Date.now()}-${i}.${extFromContentType(image.contentType)}`,
        image.data,
        { access: "public", contentType: image.contentType },
      );
      return blob.url;
    }),
  );

  const urls = settled
    .filter(
      (r): r is PromiseFulfilledResult<string> => r.status === "fulfilled",
    )
    .map((r) => r.value);

  if (urls.length === 0) {
    // Loga o primeiro motivo real pra ajudar no diagnóstico; o chamador só
    // precisa saber que não veio nenhuma imagem.
    const firstReason = settled.find((r) => r.status === "rejected");
    const detail =
      firstReason && firstReason.status === "rejected"
        ? firstReason.reason instanceof Error
          ? firstReason.reason.message
          : String(firstReason.reason)
        : "motivo desconhecido";
    throw new Error(`Nenhuma opção de imagem foi gerada: ${detail}`);
  }

  return { urls, credit: IMAGE_CREDIT };
}

/** Só apagamos do Blob URLs que são de fato do nosso store — assim uma URL de
 * imagem externa (ex.: OG colada à mão) nunca é passada ao `del` (que lançaria)
 * e é simplesmente ignorada. */
function isVercelBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/**
 * Apaga do Vercel Blob as imagens cujas URLs foram passadas — usado quando
 * opções deixam de ser usadas (confirmação da escolha ao salvar, ou "gerar
 * novamente"). Resiliente por natureza: filtra só URLs do nosso Blob, dedup, e
 * NUNCA lança — limpeza de lixo jamais deve derrubar o fluxo principal. Falhas
 * viram só um warn (o pior caso é uma imagem órfã no Blob, não um erro ao user).
 */
export async function deleteArticleImages(urls: string[]): Promise<void> {
  const targets = Array.from(new Set(urls.filter(isVercelBlobUrl)));
  if (targets.length === 0) return;
  try {
    await del(targets);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[article-image] falha ao apagar do Blob (ignorada): ${msg}`);
  }
}
