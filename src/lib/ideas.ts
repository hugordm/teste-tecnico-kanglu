import "server-only";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Sugestão de pautas — a IA propõe TÍTULOS de artigos no nicho da Kanglu.
//
// É um passo ANTERIOR à geração: não escreve o artigo, só sugere ~5 títulos que
// o editor edita/descarta e então manda para o gerador por tema (generate-auto).
//
// Espelha o padrão de chamada de `ai.ts`/`chat.ts` (OpenRouter OpenAI-compatible,
// timeout, extração defensiva, validação com zod), mas com um modelo BARATO
// (flash-lite) — é uma tarefa curta e sem base factual a respeitar, só ideias.
// ---------------------------------------------------------------------------

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Modelo barato para as sugestões. Sugerir títulos é leve — não precisa de busca
 * web nem do modelo maior. Configurável por env pra trocar sem mexer no código.
 */
const IDEAS_MODEL =
  process.env.OPENROUTER_IDEAS_MODEL || "google/gemini-3.1-flash-lite";

/** Tarefa curta: timeout mais apertado que a geração de artigo. */
const IDEAS_TIMEOUT_MS = 30_000;

/** Quantas pautas pedimos por padrão, e o teto que aceitamos de volta. */
const DEFAULT_COUNT = 5;
const MAX_COUNT = 8;

/** Erro tratável das sugestões. A rota captura e responde 502 amigável. */
export class IdeasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdeasError";
  }
}

// ---------------------------------------------------------------------------
// Prompt — mesmas regras de marca/nicho do gerador, mas pedindo só TÍTULOS
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Você é um estrategista de conteúdo para o blog da Kanglu — uma plataforma de rastreamento de pedidos, notificações ao cliente e experiência pós-compra para e-commerce.

Sua tarefa é sugerir TÍTULOS de artigos de blog (pautas), NÃO escrever os artigos.

REGRAS:
- Escreva SEMPRE em português do Brasil (pt-BR).
- Os títulos devem ser sobre o nicho da Kanglu: e-commerce, logística, frete, rastreamento de pedidos, entregas, notificações ao cliente, pós-venda, trocas e devoluções, e experiência de compra. Foco em quem tem uma loja online.
- Cada título deve ser atraente e otimizado para SEO: claro, específico e com potencial de busca (ex.: formatos "Como…", "X maneiras de…", guias práticos). Evite títulos vagos ou genéricos demais.
- NÃO cite, elogie nem recomende empresas concorrentes ou plataformas de serviços semelhantes aos da Kanglu (rastreamento, gestão de fretes, notificações, ERPs com rastreio, hubs logísticos). Exemplos a evitar: Melhor Envio, Frenet, Intelipost, SmartEnvios, Bling, Loggi, Rastreio.net e similares. Fale dos conceitos de forma genérica, sem marcas.
- Não invente estatísticas nem números específicos nos títulos.
- Cada título é uma linha só, sem numeração, sem aspas, sem markdown.

FORMATO DE SAÍDA (obrigatório):
Responda APENAS com um objeto JSON válido, sem texto antes ou depois, sem cercas de código, exatamente neste formato:
{ "titles": ["Primeiro título", "Segundo título", "..."] }`;

/**
 * Monta o prompt do usuário: quantidade pedida + o tema/direção, se houver.
 * Sem tema, pedimos pautas gerais do nicho.
 */
function buildUserPrompt(count: number, theme?: string): string {
  const parts = [`Sugira ${count} títulos de artigos de blog.`];
  if (theme) {
    parts.push(
      `Direção/tema desejado: ${theme}. Todos os títulos devem girar em torno disso, dentro do nicho da Kanglu.`,
    );
  } else {
    parts.push(
      "Sem tema específico: sugira pautas gerais e variadas do nicho da Kanglu (e-commerce, logística, rastreamento, entregas, pós-venda).",
    );
  }
  parts.push("Responda apenas com o JSON no formato pedido.");
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Contrato de saída — validação defensiva
// ---------------------------------------------------------------------------

/** O shape que exigimos. Aceitamos `{titles:[...]}`; array cru é tratado antes. */
const ideasSchema = z.object({
  titles: z.array(z.string()),
});

export interface SuggestIdeasParams {
  theme?: string;
  count?: number;
}

export interface SuggestIdeasResult {
  ideas: string[];
  model: string;
}

/**
 * Pede ~N títulos ao modelo barato e devolve a lista já limpa e validada. Lança
 * `IdeasError` em qualquer falha tratável (chave ausente, HTTP de erro, timeout,
 * corpo vazio, JSON quebrado, shape inválido ou zero títulos aproveitáveis).
 */
export async function suggestIdeas(
  params: SuggestIdeasParams,
): Promise<SuggestIdeasResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new IdeasError("OPENROUTER_API_KEY não configurada");
  }

  const theme = params.theme?.trim() || undefined;
  const count = clampCount(params.count);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IDEAS_TIMEOUT_MS);

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
        model: IDEAS_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(count, theme) },
        ],
        // Pede objeto JSON quando o provedor suporta; se ignorar, a extração
        // defensiva ainda limpa cercas e valida o shape.
        response_format: { type: "json_object" },
        // Mais alta que a geração factual: aqui QUEREMOS variedade nas ideias.
        temperature: 0.9,
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new IdeasError(`Tempo esgotado (${IDEAS_TIMEOUT_MS}ms) nas sugestões`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new IdeasError(`Falha de rede ao chamar o modelo: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new IdeasError(
      `Modelo respondeu ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new IdeasError("Resposta do modelo não é JSON");
  }

  const content = extractMessageContent(json);
  if (!content) {
    throw new IdeasError("Resposta do modelo veio sem conteúdo");
  }

  const ideas = parseIdeas(content, count);
  if (ideas.length === 0) {
    throw new IdeasError("O modelo não devolveu títulos aproveitáveis");
  }

  return { ideas, model: IDEAS_MODEL };
}

/** Mantém a quantidade num intervalo são; default se vier ausente/inválida. */
function clampCount(count?: number): number {
  if (!Number.isFinite(count) || count === undefined) return DEFAULT_COUNT;
  return Math.min(MAX_COUNT, Math.max(1, Math.trunc(count)));
}

/** Puxa `choices[0].message.content` do envelope OpenAI-compatible. */
function extractMessageContent(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

/**
 * Extração defensiva: limpa cercas, faz JSON.parse e aceita tanto
 * `{ "titles": [...] }` quanto um array cru `[...]` (modelos às vezes ignoram o
 * wrapper). Depois normaliza cada título, remove numeração/aspas/markdown
 * residual, descarta vazios e duplicatas, e corta em `count`. Nunca lança —
 * devolve `[]` no pior caso e o chamador trata.
 */
function parseIdeas(raw: string, count: number): string[] {
  const cleaned = stripCodeFences(raw);

  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    return [];
  }

  // Aceita array cru ou o objeto {titles:[...]}.
  let list: unknown;
  if (Array.isArray(obj)) {
    list = obj;
  } else {
    const parsed = ideasSchema.safeParse(obj);
    if (!parsed.success) return [];
    list = parsed.data.titles;
  }
  if (!Array.isArray(list)) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const title = cleanTitle(item);
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(title);
    if (out.length >= count) break;
  }
  return out;
}

/** Tira numeração de lista, marcadores, aspas de cerca e espaços do título. */
function cleanTitle(raw: string): string {
  return raw
    .trim()
    .replace(/^\s*\d+[.)]\s*/, "") // "1. " / "2) "
    .replace(/^\s*[-*•]\s*/, "") // bullet
    .replace(/^["“']+|["”']+$/g, "") // aspas nas pontas
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Remove cercas de código markdown que modelos teimam em adicionar mesmo
 * pedindo JSON puro (```json ... ``` ou ``` ... ```).
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  return trimmed;
}
