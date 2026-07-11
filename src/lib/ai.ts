import { z } from "zod";
import { slugify } from "@/lib/validation";
import type { ExtractedSource } from "@/lib/extract";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3.1-flash-lite";

/** Timeout da chamada ao LLM. Geração é mais lenta que um fetch de página. */
const AI_TIMEOUT_MS = 60_000;

/**
 * Erro tratável do gerador. A rota captura isto e responde 502 amigável, sem
 * criar artigo quebrado nem derrubar o server.
 */
export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

// ---------------------------------------------------------------------------
// Contrato de saída
// ---------------------------------------------------------------------------

/**
 * Shape que exigimos do modelo. Validar com zod é a rede de segurança: o LLM
 * pode devolver JSON com campos faltando ou tipos errados, e a gente não
 * confia — se não bater com isto, é erro tratável.
 */
const draftSchema = z.object({
  title: z.string().trim().min(1),
  excerpt: z.string().trim().min(1),
  content: z.string().trim().min(1), // markdown
  metaTitle: z.string().trim().min(1),
  metaDescription: z.string().trim().min(1),
  suggestedSlug: z.string().trim().min(1),
});

export type GeneratedDraft = z.infer<typeof draftSchema>;

export interface GenerateDraftParams {
  theme: string;
  keywords?: string[];
  sources: ExtractedSource[];
}

export interface GenerateDraftResult {
  draft: GeneratedDraft;
  model: string;
}

// ---------------------------------------------------------------------------
// Prompt — o system prompt é o coração da regra anti-invenção
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Você é um redator especialista em conteúdo educativo para lojistas de e-commerce brasileiros.

Escreva SEMPRE em português do Brasil (pt-BR), com tom educativo, prático e acessível para donos de loja — nada de jargão acadêmico.

REGRAS FACTUAIS (inegociáveis):
- Use SOMENTE o conteúdo das fontes fornecidas como base factual.
- TODA estatística, número, porcentagem, data, valor ou citação DEVE vir explicitamente de uma das fontes. Se uma afirmação factual não tem respaldo nas fontes, NÃO a faça.
- Prefira NÃO usar números, percentuais ou estatísticas específicas, a menos que sejam absolutamente centrais para o tema. Quando o conteúdo puder ser transmitido de forma conceitual (sem cravar números), escolha a forma conceitual. Se usar um número, ele DEVE estar textualmente na fonte fornecida e ser atribuído a ela de forma clara.
- É PROIBIDO inventar pesquisas, dados de mercado, estudos, nomes de empresas, citações ou fontes que não estejam no material fornecido.
- Não invente URLs, autores ou instituições.
- Se as fontes forem insuficientes para um tópico, escreva de forma geral e conceitual, sem alegar fatos específicos que você não tem.
- Ao usar um dado específico de uma fonte, deixe claro no texto de onde veio (ex.: 'segundo a ABComm...', 'de acordo com o E-Commerce Brasil...'), citando o nome da fonte de forma natural no corpo do artigo.

REGRA DE MARCA (Kanglu):
- Este é o blog da Kanglu, uma plataforma de rastreamento de pedidos, notificações ao cliente e experiência pós-compra para e-commerce.
- NÃO recomende, elogie, nem cite pelo nome empresas concorrentes ou plataformas que oferecem serviços semelhantes aos da Kanglu (rastreamento, gestão de fretes, notificações, ERPs com rastreio, hubs logísticos). Exemplos a evitar: Melhor Envio, Frenet, Intelipost, SmartEnvios, Bling, Loggi, Rastreio.net, e similares.
- Você PODE falar dos conceitos de forma genérica ('plataformas de rastreamento', 'sistemas de gestão', 'transportadoras') sem nomear empresas específicas.
- Você PODE citar entidades neutras e não-concorrentes como fontes: associações do setor (ABComm), órgãos e serviços públicos (Correios), portais de conteúdo (E-Commerce Brasil), e pesquisas de mercado.
- Se uma fonte fornecida for de um concorrente, use a informação factual dela mas NÃO mencione o nome do concorrente no texto — atribua de forma neutra ou a outra fonte.

REGRAS DE ESCRITA:
- Reescreva e sintetize com suas próprias palavras. NÃO copie blocos de texto das fontes (sem plágio).
- Estruture o conteúdo em markdown: use ## para seções e listas quando fizer sentido.
- O texto deve ser original, coerente e útil para quem tem uma loja online.

FORMATO DE SAÍDA (obrigatório):
Responda APENAS com um objeto JSON válido, sem texto antes ou depois, sem cercas de código, com exatamente estas chaves:
{
  "title": "título do artigo",
  "excerpt": "resumo curto de 1-2 frases",
  "content": "corpo completo em markdown",
  "metaTitle": "título SEO (até ~60 caracteres)",
  "metaDescription": "descrição SEO (até ~155 caracteres)",
  "suggestedSlug": "slug-amigavel-em-kebab-case"
}`;

/**
 * Monta o prompt do usuário: tema + keywords + as fontes numeradas. As fontes
 * entram com título, URL e o texto extraído — é o material factual que o
 * modelo tem permissão de usar.
 */
function buildUserPrompt(params: GenerateDraftParams): string {
  const { theme, keywords, sources } = params;
  const parts: string[] = [`Tema do artigo: ${theme}`];

  if (keywords?.length) {
    parts.push(`Palavras-chave a considerar: ${keywords.join(", ")}`);
  }

  if (sources.length === 0) {
    parts.push(
      "\nNenhuma fonte foi fornecida. Escreva um artigo conceitual e educativo sobre o tema, SEM alegar estatísticas, números ou dados específicos.",
    );
  } else {
    parts.push(`\nFONTES (a única base factual permitida):`);
    sources.forEach((s, i) => {
      parts.push(
        `\n--- Fonte ${i + 1} ---\nTítulo: ${s.title}\nURL: ${s.url}\nConteúdo:\n${s.textContent}`,
      );
    });
  }

  parts.push(
    "\nGere o artigo seguindo TODAS as regras. Responda apenas com o JSON.",
  );
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------

/**
 * Chama a OpenRouter (endpoint OpenAI-compatible) e devolve o rascunho
 * validado. Lança `AiError` em qualquer falha tratável: chave ausente, HTTP
 * de erro, timeout, corpo vazio, JSON quebrado ou shape inválido.
 */
export async function generateDraft(
  params: GenerateDraftParams,
): Promise<GenerateDraftResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new AiError("OPENROUTER_API_KEY não configurada");
  }
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  const raw = await callOpenRouter(apiKey, model, params);
  const parsed = safeParseDraft(raw);

  // Reforça o slug com o slugify do projeto: o modelo pode devolver algo com
  // acento, espaço ou maiúscula. Garante consistência com o resto do sistema.
  parsed.suggestedSlug = slugify(parsed.suggestedSlug) || slugify(parsed.title);

  return { draft: parsed, model };
}

/** Faz a chamada HTTP e devolve o texto bruto do `message.content`. */
async function callOpenRouter(
  apiKey: string,
  model: string,
  params: GenerateDraftParams,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

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
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(params) },
        ],
        // Pede JSON estruturado quando o provedor/modelo suporta; se ignorar,
        // o safeParseDraft ainda limpa cercas e valida.
        response_format: { type: "json_object" },
        temperature: 0.4, // baixa: menos criatividade factual = menos invenção
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AiError(`Tempo esgotado (${AI_TIMEOUT_MS}ms) na geração`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new AiError(`Falha de rede ao chamar o modelo: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AiError(
      `Modelo respondeu ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new AiError("Resposta do modelo não é JSON");
  }

  const content = extractMessageContent(json);
  if (!content) {
    throw new AiError("Resposta do modelo veio sem conteúdo");
  }
  return content;
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
 * Limpa cercas ```json, faz JSON.parse dentro de try e valida o shape. Nada
 * aqui confia no modelo — qualquer desvio vira AiError tratável.
 */
function safeParseDraft(raw: string): GeneratedDraft {
  const cleaned = stripCodeFences(raw);

  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    throw new AiError("O modelo não devolveu um JSON válido");
  }

  const result = draftSchema.safeParse(obj);
  if (!result.success) {
    throw new AiError("O JSON do modelo não tem o formato esperado");
  }
  return result.data;
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
