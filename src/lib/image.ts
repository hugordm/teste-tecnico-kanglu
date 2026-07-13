// ---------------------------------------------------------------------------
// Geração de imagem ilustrativa por IA (Nano Banana 2 Lite via OpenRouter).
//
// Espelha a estrutura do `ai.ts`: mesmo endpoint OpenAI-compatible da OpenRouter,
// mesma OPENROUTER_API_KEY, erro tratável dedicado e extração defensiva do corpo
// (nada aqui confia no shape que o modelo devolve). A diferença é `modalities:
// ["image","text"]`, que faz o modelo devolver a imagem em
// `choices[0].message.images[]` como uma data URL base64.
//
// Esta camada SÓ produz os bytes da imagem. O upload pro Vercel Blob e a
// persistência ficam na rota — separação de responsabilidades.
// ---------------------------------------------------------------------------

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image). Slug confirmado na API de
 * modelos da OpenRouter — SEM sufixo `-preview` (esse é o irmão maior,
 * `gemini-3.1-flash-image-preview`). Configurável por env pra trocar sem código.
 */
const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-lite-image";

/** Crédito gravado no artigo. Fica salvo por artigo em `Article.imageCredit`. */
export const IMAGE_CREDIT = "Nano Banana 2 (Gemini) via OpenRouter";

/** Geração de imagem é mais lenta que um fetch; o Lite leva ~4s, damos folga. */
const IMAGE_TIMEOUT_MS = 60_000;

/**
 * Erro tratável do gerador de imagem. A rota captura isto e responde 502
 * amigável, sem tocar no artigo. Espelha o `AiError` do texto.
 */
export class ImageAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageAiError";
  }
}

export interface GeneratedImage {
  /** Bytes crus da imagem, prontos pro upload no Blob. */
  data: Buffer;
  /** MIME extraído da data URL (ex.: "image/png"). */
  contentType: string;
  /** Modelo efetivamente usado (pra rastreabilidade). */
  model: string;
}

/**
 * Monta o prompt da imagem a partir do título do artigo. Estilo editorial,
 * moderno e limpo, SEM texto na imagem (modelos de imagem tendem a "escrever"
 * coisas erradas), com a paleta da marca Kanglu.
 *
 * `variantHint` (opcional) injeta uma direção de estilo/composição diferente por
 * variação — usado quando geramos 4 opções em paralelo, pra que saiam distintas
 * em vez de 4 quase-iguais.
 */
function buildImagePrompt(title: string, variantHint?: string): string {
  return [
    `Ilustração editorial profissional para o topo de um artigo de blog sobre: "${title}".`,
    "Contexto: blog de e-commerce e logística (rastreamento de pedidos, entregas, pós-compra).",
    "Estilo: moderno, limpo, minimalista, vetorial/flat com profundidade sutil, luz suave.",
    "Paleta condizente com a marca: tons de bordô, laranja e creme.",
    "Composição horizontal (banner), boa como imagem de capa.",
    variantHint ? `Direção específica desta versão: ${variantHint}.` : "",
    "IMPORTANTE: NÃO inclua nenhum texto, letras, números, logos ou marcas d'água na imagem.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Chama o Nano Banana 2 Lite e devolve os bytes da imagem gerada. Lança
 * `ImageAiError` em qualquer falha tratável: chave ausente, HTTP de erro,
 * timeout, corpo sem imagem ou data URL malformada.
 */
export async function generateArticleImage(
  title: string,
  variantHint?: string,
  modelId?: string,
): Promise<GeneratedImage> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new ImageAiError("OPENROUTER_API_KEY não configurada");
  }
  // Modelo escolhido no seletor; sem ele, usa OPENROUTER_IMAGE_MODEL/default.
  const model = modelId || process.env.OPENROUTER_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "user", content: buildImagePrompt(title, variantHint) },
        ],
        // Habilita a saída de imagem: o modelo devolve a imagem em
        // choices[0].message.images[] como data URL base64.
        modalities: ["image", "text"],
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ImageAiError(
        `Tempo esgotado (${IMAGE_TIMEOUT_MS}ms) na geração da imagem`,
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new ImageAiError(`Falha de rede ao chamar o modelo de imagem: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ImageAiError(
      `Modelo de imagem respondeu ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ImageAiError("Resposta do modelo de imagem não é JSON");
  }

  const dataUrl = extractImageDataUrl(json);
  if (!dataUrl) {
    throw new ImageAiError("O modelo não retornou imagem");
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw new ImageAiError("A imagem retornada veio em formato inesperado");
  }

  return { data: parsed.data, contentType: parsed.contentType, model };
}

/**
 * Puxa a data URL da imagem do envelope da OpenRouter. Tolerante a desvios de
 * shape (nunca lança): procura em `choices[0].message.images[].image_url.url`.
 * Qualquer coisa fora do esperado vira null, e o chamador trata como "sem
 * imagem" com 502 amigável.
 */
function extractImageDataUrl(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return null;
  const images = (message as { images?: unknown }).images;
  if (!Array.isArray(images)) return null;

  for (const img of images) {
    if (typeof img !== "object" || img === null) continue;
    const imageUrl = (img as { image_url?: unknown }).image_url;
    if (typeof imageUrl !== "object" || imageUrl === null) continue;
    const url = (imageUrl as { url?: unknown }).url;
    if (typeof url === "string" && url.startsWith("data:")) return url;
  }
  return null;
}

/**
 * Decodifica uma data URL `data:<mime>;base64,<dados>` em `{ contentType, data }`.
 * Devolve null se não for base64 ou se o payload estiver vazio.
 */
function parseDataUrl(
  dataUrl: string,
): { contentType: string; data: Buffer } | null {
  // Sem flag /s: base64 vindo de JSON é uma linha só (sem quebras), e o flag
  // dotAll exigiria target es2018+. `.+` já cobre o payload inteiro aqui.
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  const contentType = match[1] || "image/png";
  const base64 = match[2];
  const data = Buffer.from(base64, "base64");
  if (data.length === 0) return null;
  return { contentType, data };
}
