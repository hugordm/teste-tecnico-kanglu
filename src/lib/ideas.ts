import "server-only";
import { parseJsonLoose } from "@/lib/json-extract";

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
- Para CADA título, inclua de 3 a 5 PALAVRAS-CHAVE curtas do nicho, relevantes àquele título — termos que ajudam na busca de fontes e no SEO (ex.: "frete grátis", "prazo de entrega", "logística reversa"). Também em pt-BR, sem marcas de concorrentes.

FORMATO DE SAÍDA (obrigatório):
Responda APENAS com um objeto JSON válido, sem texto antes ou depois, sem cercas de código, exatamente neste formato:
{ "ideas": [ { "title": "Primeiro título", "keywords": ["palavra-chave 1", "palavra-chave 2", "palavra-chave 3"] }, { "title": "Segundo título", "keywords": ["..."] } ] }`;

/** Data de hoje por extenso em pt-BR (fuso BRT), p/ ancorar pautas no momento. */
function todayLongPtBr(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

/**
 * Monta o prompt do usuário: quantidade pedida + o tema/direção, se houver.
 * Sem tema, pedimos pautas gerais do nicho. Com `recent`, injeta a DATA DE HOJE
 * (o modelo não sabe que dia é) e pede pautas ancoradas no momento atual — o cron
 * diário usa isto para o artigo do dia falar de algo recente, não atemporal.
 */
function buildUserPrompt(
  count: number,
  theme?: string,
  recent?: boolean,
  avoidTitles?: string[],
): string {
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
  if (recent) {
    parts.push(
      `Hoje é ${todayLongPtBr()}. Priorize pautas ancoradas no MOMENTO ATUAL: tendências recentes, sazonalidade do período (datas do varejo, época do ano) e o que é relevante AGORA para lojistas — evite temas puramente atemporais/genéricos. Não invente fatos nem números; a atualidade deve estar no ângulo da pauta, não em estatísticas inventadas.`,
    );
  }
  // Histórico: o modelo não tem memória entre execuções, então sem esta lista
  // ele converge para as mesmas pautas "óbvias" do nicho dia após dia.
  //
  // A instrução pede ÂNGULO diferente, não assunto proibido — de propósito. Com
  // `recent` ligado já mandamos priorizar a sazonalidade do período, e é
  // justamente isso que faz todo mundo cair em "segundo semestre". Se aqui
  // proibíssemos o assunto, as duas instruções se contradiriam e o modelo
  // obedeceria uma das duas ao acaso. Pedir um recorte novo sobre o mesmo
  // momento mantém as duas compatíveis.
  //
  // Isto REDUZ a repetição; quem GARANTE é o pós-filtro determinístico do cron
  // (lib/theme-overlap) — prompt é pedido, não contrato.
  if (avoidTitles && avoidTitles.length > 0) {
    parts.push(
      `O blog JÁ PUBLICOU (ou já tem agendados) os artigos abaixo. NÃO sugira pautas que sejam o mesmo artigo com outras palavras — nem o mesmo assunto com sinônimos no título. Se o tema for próximo de algum deles, mude o ÂNGULO (outro recorte, outro público, outra etapa do processo) ou escolha outro assunto do nicho:\n${avoidTitles
        .map((t) => `- ${t}`)
        .join("\n")}`,
    );
  }

  parts.push("Responda apenas com o JSON no formato pedido.");
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Contrato de saída — validação defensiva
// ---------------------------------------------------------------------------

/** Uma pauta: título + palavras-chave sugeridas (podem vir vazias). */
export interface Idea {
  title: string;
  keywords: string[];
}

/** Teto de palavras-chave e tamanho de cada uma (contém abuso/ruído do modelo). */
const MAX_KEYWORDS = 5;
const MAX_KEYWORD_LEN = 40;

export interface SuggestIdeasParams {
  theme?: string;
  count?: number;
  /**
   * Ancora as pautas no momento atual (injeta a data de hoje + pede atualidade).
   * O cron diário liga isto; o painel de pautas deixa desligado (default). */
  recent?: boolean;
  /**
   * Títulos que o blog já tem (publicados ou agendados) para o modelo NÃO
   * repetir. Vazio/ausente = sem histórico no prompt, comportamento de antes.
   *
   * Só o cron passa isto hoje; o painel segue sem histórico — lá quem filtra é
   * o humano, que vê a lista de artigos na tela ao lado.
   */
  avoidTitles?: string[];
}

export interface SuggestIdeasResult {
  ideas: Idea[];
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
          {
            role: "user",
            content: buildUserPrompt(
              count,
              theme,
              params.recent,
              params.avoidTitles,
            ),
          },
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
 * Extração defensiva: limpa cercas, faz JSON.parse e aceita VÁRIOS formatos que o
 * modelo pode devolver — `{ ideas: [{title, keywords}] }` (o pedido), o legado
 * `{ titles: [...] }`, ou um array cru de strings/objetos. Normaliza cada item
 * para `{ title, keywords }`, descarta vazios/duplicatas e corta em `count`. Se o
 * item não trouxer keywords, elas ficam `[]` (o campo do gerador fica vazio, como
 * hoje — não quebra). Nunca lança — devolve `[]` no pior caso.
 */
function parseIdeas(raw: string, count: number): Idea[] {
  const obj = parseJsonLoose(raw);
  if (obj === null) return [];

  // Localiza a lista de itens: array cru, ou o campo `ideas`/`titles` do objeto.
  let list: unknown;
  if (Array.isArray(obj)) {
    list = obj;
  } else if (typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    list = Array.isArray(o.ideas)
      ? o.ideas
      : Array.isArray(o.titles)
        ? o.titles
        : null;
  }
  if (!Array.isArray(list)) return [];

  const seen = new Set<string>();
  const out: Idea[] = [];
  for (const item of list) {
    // Item pode ser uma string (título só) ou um objeto { title, keywords }.
    let title = "";
    let keywords: string[] = [];
    if (typeof item === "string") {
      title = cleanTitle(item);
    } else if (item && typeof item === "object") {
      const it = item as Record<string, unknown>;
      if (typeof it.title === "string") title = cleanTitle(it.title);
      keywords = cleanKeywords(it.keywords);
    }
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, keywords });
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
 * Limpa e limita a lista de palavras-chave de uma pauta: só strings, sem
 * marcadores/aspas, sem vazias nem duplicatas, cada uma com tamanho contido, e no
 * máximo `MAX_KEYWORDS`. Qualquer coisa fora do esperado vira `[]`.
 */
function cleanKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    if (typeof k !== "string") continue;
    const clean = k
      .trim()
      .replace(/^\s*[-*•]\s*/, "")
      .replace(/^["“']+|["”']+$/g, "")
      .replace(/\s+/g, " ")
      .slice(0, MAX_KEYWORD_LEN)
      .trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}
