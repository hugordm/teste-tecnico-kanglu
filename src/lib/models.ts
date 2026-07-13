import "server-only";

// ---------------------------------------------------------------------------
// Lista CURADA de modelos da OpenRouter para os seletores de geração.
//
// A OpenRouter expõe ~300 modelos (GET /api/v1/models). Aqui buscamos essa lista,
// filtramos para uma seleção usável (provedores conhecidos, texto vs imagem),
// mapeamos o provedor -> logo local (public/providers/*.svg) e cacheamos por 6h
// (a lista muda pouco). Se a API falhar, caímos num conjunto FIXO — a geração
// nunca trava por causa disto.
//
// server-only: contém a leitura da OPENROUTER_API_KEY e roda só no servidor.
// ---------------------------------------------------------------------------

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6h

/** Provedores mapeados: prefixo do id -> rótulo + arquivo de logo (sem extensão). */
const PROVIDERS: Record<string, { label: string; logo: string }> = {
  openai: { label: "OpenAI", logo: "openai" },
  google: { label: "Google", logo: "google" },
  anthropic: { label: "Anthropic", logo: "anthropic" },
  "meta-llama": { label: "Meta", logo: "meta" },
  mistralai: { label: "Mistral", logo: "mistral" },
  deepseek: { label: "DeepSeek", logo: "deepseek" },
  "x-ai": { label: "xAI", logo: "xai" },
  perplexity: { label: "Perplexity", logo: "perplexity" },
};

/** Ordem de exibição dos provedores no seletor de texto (mais relevantes primeiro). */
const TEXT_PROVIDER_ORDER = [
  "openai",
  "google",
  "anthropic",
  "x-ai",
  "deepseek",
  "meta-llama",
  "mistralai",
  "perplexity",
];

const MAX_TEXT_PER_PROVIDER = 2; // diversidade: os N mais recentes de cada provedor
const MAX_TEXT = 14;
const MAX_IMAGE = 10;

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  providerLabel: string;
  /** Caminho do logo self-hosted (ex.: "/providers/openai.svg"). */
  logo: string;
}

export interface CuratedModels {
  text: ModelInfo[];
  image: ModelInfo[];
  /** Ids default (do env) para pré-selecionar em cada fluxo. */
  defaults: { text: string; textWeb: string; image: string };
}

/** Shape mínimo que lemos da resposta da OpenRouter (defensivo, sem confiar). */
interface RawModel {
  id: string;
  name?: string;
  created?: number;
  architecture?: { output_modalities?: string[] };
}

/** Ids default resolvidos do env (os mesmos fallbacks das libs de geração). */
export function defaultModelIds(): CuratedModels["defaults"] {
  return {
    text: process.env.OPENROUTER_MODEL || "google/gemini-3.1-flash-lite",
    textWeb: process.env.WEB_SEARCH_MODEL || "perplexity/sonar",
    image: process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-lite-image",
  };
}

function providerOf(id: string): string {
  return id.split("/")[0];
}

function logoFor(provider: string): string {
  const p = PROVIDERS[provider];
  return p ? `/providers/${p.logo}.svg` : "/providers/generic.svg";
}

function labelFor(provider: string): string {
  return PROVIDERS[provider]?.label ?? provider;
}

/** Remove o prefixo "Provedor: " do name (mostramos logo + rótulo separados). */
function cleanName(raw: RawModel): string {
  const name = (raw.name ?? raw.id).replace(/^[^:]+:\s*/, "").trim();
  return name || raw.id;
}

function toInfo(raw: RawModel): ModelInfo {
  const provider = providerOf(raw.id);
  return {
    id: raw.id,
    name: cleanName(raw),
    provider,
    providerLabel: labelFor(provider),
    logo: logoFor(provider),
  };
}

/** Sintetiza um ModelInfo a partir de um id (fallback quando o raw não existe). */
function synthInfo(id: string): ModelInfo {
  const provider = providerOf(id);
  const tail = id.split("/")[1] ?? id;
  const name = tail
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { id, name, provider, providerLabel: labelFor(provider), logo: logoFor(provider) };
}

// Conjunto FIXO usado se a API de modelos falhar — os defaults atuais + alguns
// conhecidos, pra o seletor nunca ficar vazio.
const FALLBACK_TEXT: ModelInfo[] = [
  "google/gemini-3.1-flash-lite",
  "perplexity/sonar",
  "openai/gpt-5-mini",
  "anthropic/claude-haiku-4.5",
  "deepseek/deepseek-chat",
].map(synthInfo);

const FALLBACK_IMAGE: ModelInfo[] = ["google/gemini-3.1-flash-lite-image"].map(
  synthInfo,
);

/** Garante que os ids `wanted` estejam na lista (prepend), usando o raw se houver. */
function ensureIds(
  list: ModelInfo[],
  wanted: string[],
  byId: Map<string, RawModel>,
): ModelInfo[] {
  for (const id of wanted) {
    if (!id || list.some((m) => m.id === id)) continue;
    const raw = byId.get(id);
    list.unshift(raw ? toInfo(raw) : synthInfo(id));
  }
  return list;
}

async function fetchRawModels(): Promise<RawModel[] | null> {
  const key = process.env.OPENROUTER_API_KEY;
  try {
    const res = await fetch(MODELS_URL, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
      next: { revalidate: CACHE_TTL_SECONDS },
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const data = (json as { data?: unknown })?.data;
    return Array.isArray(data) ? (data as RawModel[]) : null;
  } catch {
    return null;
  }
}

/** Os N modelos mais recentes de cada provedor, na ordem de TEXT_PROVIDER_ORDER. */
function curateText(raw: RawModel[]): ModelInfo[] {
  const byProvider = new Map<string, RawModel[]>();
  for (const m of raw) {
    const p = providerOf(m.id);
    if (!byProvider.has(p)) byProvider.set(p, []);
    byProvider.get(p)!.push(m);
  }
  const out: ModelInfo[] = [];
  for (const provider of TEXT_PROVIDER_ORDER) {
    const list = (byProvider.get(provider) ?? [])
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
      .slice(0, MAX_TEXT_PER_PROVIDER);
    out.push(...list.map(toInfo));
  }
  return out.slice(0, MAX_TEXT);
}

/**
 * Lista curada de modelos (texto + imagem) + os defaults. Cacheada (6h) pelo
 * cache de fetch do Next; em falha, cai no conjunto FIXO.
 */
export async function getCuratedModels(): Promise<CuratedModels> {
  const defaults = defaultModelIds();
  const raw = await fetchRawModels();

  if (!raw) {
    return {
      text: ensureIds([...FALLBACK_TEXT], [defaults.text, defaults.textWeb], new Map()),
      image: ensureIds([...FALLBACK_IMAGE], [defaults.image], new Map()),
      defaults,
    };
  }

  const byId = new Map(raw.map((m) => [m.id, m]));
  const outputs = (m: RawModel) => m.architecture?.output_modalities ?? [];
  const notVariant = (m: RawModel) => !m.id.startsWith("~");
  const known = (m: RawModel) => PROVIDERS[providerOf(m.id)] !== undefined;

  // TEXTO: provedor conhecido, gera texto e NÃO é modelo de imagem.
  const textRaw = raw.filter(
    (m) =>
      notVariant(m) &&
      known(m) &&
      outputs(m).includes("text") &&
      !outputs(m).includes("image"),
  );
  const text = ensureIds(curateText(textRaw), [defaults.text, defaults.textWeb], byId);

  // IMAGEM: qualquer modelo que gera imagem (são poucos), mais recentes primeiro.
  const imageRaw = raw
    .filter((m) => notVariant(m) && outputs(m).includes("image"))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .slice(0, MAX_IMAGE);
  const image = ensureIds(imageRaw.map(toInfo), [defaults.image], byId);

  return { text, image, defaults };
}

/**
 * Valida um id de modelo escolhido contra a lista curada. Devolve o id se for
 * conhecido, senão `undefined` — a rota então cai no default do env. É a trava
 * de segurança: NÃO aceitamos string arbitrária (evita mandar modelo caro/não
 * autorizado pra OpenRouter).
 */
export async function validateModelId(
  id: string | undefined,
  kind: "text" | "image",
): Promise<string | undefined> {
  if (!id) return undefined;
  const curated = await getCuratedModels();
  const list = kind === "text" ? curated.text : curated.image;
  return list.some((m) => m.id === id) ? id : undefined;
}

/**
 * O modelo de busca escolhido busca a web nativamente (Perplexity Sonar) e por
 * isso NÃO precisa do plugin `web` da OpenRouter. Qualquer outro modelo precisa
 * do plugin pra buscar e devolver as `annotations` (fontes). Ver ai.ts.
 */
export function isNativeWebSearchModel(id: string): boolean {
  return providerOf(id) === "perplexity";
}
