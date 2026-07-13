import "server-only";
import { getPublishedArticlesForChat } from "@/lib/public-articles";
import { IMAGE_MARKER } from "@/lib/body-images";

// ---------------------------------------------------------------------------
// Chatbot do blog — responde dúvidas SOBRE os artigos publicados.
//
// O contexto é DINÂMICO: a cada requisição buscamos os artigos publicados e
// visíveis (mesmo `publicWhere` das páginas públicas) e montamos o prompt com
// eles. Adicionar/editar/remover artigo reflete no bot sem tocar em código.
//
// Espelha o padrão de chamada do `ai.ts` (OpenRouter OpenAI-compatible, timeout,
// extração defensiva), mas fica separado: é outro fluxo, outro system prompt e
// saída em texto puro (sem JSON).
// ---------------------------------------------------------------------------

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CHAT_MODEL =
  process.env.OPENROUTER_CHAT_MODEL || "google/gemini-3.1-flash-lite";

/** Chat é interativo; queremos resposta rápida, então timeout mais curto. */
const CHAT_TIMEOUT_MS = 30_000;

// Orçamento de contexto. Com 3 artigos sobra espaço de sobra — isto é blindagem
// para quando a base crescer: cada artigo é truncado, e o total é limitado.
const MAX_PER_ARTICLE_CHARS = 6_000;
const MAX_CONTEXT_CHARS = 24_000;

// Limites do histórico recebido (endpoint público): quantas mensagens olhamos e
// o teto por mensagem — contém abuso trivial e o custo de tokens.
export const MAX_HISTORY_MESSAGES = 10;
export const MAX_MESSAGE_CHARS = 2_000;

/** Erro tratável do chat. A rota captura e responde 502 amigável. */
export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatError";
  }
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Tira os marcadores de imagem do corpo — URLs de Blob só gastam token no LLM. */
function stripImageMarkers(content: string): string {
  return content.replace(IMAGE_MARKER, " ").replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Monta o bloco de contexto a partir dos artigos publicados, respeitando o
 * orçamento de caracteres. Do mais recente ao mais antigo: inclui o conteúdo
 * (truncado); se o total estourar, cai para o excerpt; se ainda estourar, para
 * e sinaliza que houve corte. Texto plano de propósito — nada de markdown, para
 * o modelo não espelhar formatação na resposta.
 */
async function buildArticlesContext(): Promise<string> {
  const articles = await getPublishedArticlesForChat();
  if (articles.length === 0) {
    return "(No momento não há artigos publicados no blog.)";
  }

  const blocks: string[] = [];
  let used = 0;
  let truncatedSome = false;

  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    const full = stripImageMarkers(a.content).slice(0, MAX_PER_ARTICLE_CHARS);
    let body = full;

    // Se o conteúdo não couber no que resta do orçamento, tenta só o excerpt.
    if (used + full.length > MAX_CONTEXT_CHARS) {
      const excerpt = (a.excerpt ?? "").trim();
      if (excerpt && used + excerpt.length <= MAX_CONTEXT_CHARS) {
        body = excerpt;
        truncatedSome = true;
      } else {
        // Nem o excerpt cabe: encerra a montagem aqui.
        truncatedSome = true;
        break;
      }
    }

    const block = `Artigo ${i + 1} — Título: ${a.title}\nConteúdo: ${body}`;
    blocks.push(block);
    used += body.length;
  }

  if (truncatedSome) {
    blocks.push(
      "(Observação: alguns artigos foram omitidos ou resumidos por limite de espaço.)",
    );
  }

  return blocks.join("\n\n");
}

/** System prompt: escopo + base de conhecimento (contexto dinâmico dos artigos). */
function buildSystemPrompt(context: string): string {
  return [
    "Você é o assistente virtual do blog da Kanglu — uma plataforma de rastreamento de pedidos, notificações ao cliente e experiência pós-compra no e-commerce.",
    "Seu papel é ajudar os leitores a tirar dúvidas SOBRE OS CONTEÚDOS DOS ARTIGOS PUBLICADOS no blog, listados abaixo.",
    "",
    "REGRAS:",
    "- Responda SOMENTE com base nas informações dos artigos abaixo. Não invente dados, números, fatos ou a existência de artigos que não estejam aqui.",
    "- Se a resposta não estiver nos artigos, diga com simpatia que esse ponto não está coberto nos conteúdos do blog e ofereça ajudar com os temas que estão disponíveis. Não invente para agradar.",
    "- Se a pergunta for FORA do escopo do blog (assuntos gerais, outra área, pedir código, curiosidades como capitais de países), recuse com gentileza e leveza: explique que você é o assistente do blog da Kanglu e só consegue ajudar com dúvidas sobre os conteúdos publicados aqui, e convide a pessoa a perguntar sobre esses temas. NUNCA seja seco, ríspido ou robótico.",
    "- Escreva em português brasileiro, em TEXTO SIMPLES e conversacional. NÃO use markdown: nada de asteriscos para negrito ou itálico, nada de listas com hífen ou asterisco, nada de títulos com #, nada de tabelas. Use apenas frases e parágrafos curtos.",
    "- Seja caloroso, direto e objetivo.",
    "",
    "ARTIGOS PUBLICADOS (sua única base de conhecimento):",
    context,
  ].join("\n");
}

/**
 * Rede de segurança: remove marcações de markdown que o modelo possa deixar
 * escapar, mesmo instruído a não usar. Tira negrito/itálico, marcadores de
 * lista, títulos `#`, crases e blockquotes — preservando o texto legível.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, "")) // cercas de código
    .replace(/`([^`]+)`/g, "$1") // código inline
    .replace(/\*\*([^*]+)\*\*/g, "$1") // negrito **
    .replace(/__([^_]+)__/g, "$1") // negrito __
    .replace(/\*([^*]+)\*/g, "$1") // itálico *
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // títulos #
    .replace(/^\s{0,3}>\s?/gm, "") // blockquote >
    .replace(/^\s{0,3}[-*+]\s+/gm, "") // bullets - * +
    .replace(/^\s{0,3}\d+\.\s+/gm, "") // listas numeradas
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
 * Responde à conversa com base nos artigos publicados. Monta o contexto do
 * banco em tempo real, chama o Gemini flash-lite (OpenRouter) e devolve a
 * resposta já limpa de markdown. Lança `ChatError` em qualquer falha tratável.
 */
export async function answerBlogQuestion(
  messages: ChatMessage[],
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new ChatError("OPENROUTER_API_KEY não configurada");
  }

  const context = await buildArticlesContext();
  const systemPrompt = buildSystemPrompt(context);

  // Só as últimas N mensagens entram — bound de tokens no endpoint público.
  const history = messages.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
    role: m.role,
    content: m.content.slice(0, MAX_MESSAGE_CHARS),
  }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

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
        model: CHAT_MODEL,
        messages: [{ role: "system", content: systemPrompt }, ...history],
        temperature: 0.3, // baixa: menos invenção, mais fidelidade ao contexto
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ChatError(`Tempo esgotado (${CHAT_TIMEOUT_MS}ms) no chat`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new ChatError(`Falha de rede ao chamar o modelo: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ChatError(
      `Modelo respondeu ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ChatError("Resposta do modelo não é JSON");
  }

  const content = extractMessageContent(json);
  if (!content || !content.trim()) {
    throw new ChatError("Resposta do modelo veio sem conteúdo");
  }

  return stripMarkdown(content);
}
