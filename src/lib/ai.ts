import { z } from "zod";
import { slugify } from "@/lib/validation";
import type { ExtractedSource } from "@/lib/extract";
import { resolveWebSources, type ResolvedSource } from "@/lib/web-sources";
import { parseJsonLoose } from "@/lib/json-extract";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3.1-flash-lite";

/**
 * Modelo usado SÓ na geração com busca web (`generateDraftWithWebSearch`). Um
 * modelo de busca dedicado (Perplexity Sonar) sempre pesquisa a web, o que
 * elimina o grounding intermitente do Gemini (que às vezes voltava zero fontes).
 * O fluxo manual e o resto do app seguem no `OPENROUTER_MODEL`/Gemini.
 * Configurável por env pra trocar fácil sem mexer no código.
 */
const WEB_SEARCH_MODEL = process.env.WEB_SEARCH_MODEL || "perplexity/sonar";

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
  /** Modelo escolhido no seletor; sem ele, usa OPENROUTER_MODEL/default. */
  model?: string;
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
- NUNCA cite pesquisas, institutos, consultorias ou percentuais de terceiros (ex: Statista, Nielsen, Ebit, Gartner, McKinsey) a menos que a URL da própria pesquisa esteja explicitamente entre as fontes fornecidas. Se um número ou percentual aparecer no material de uma fonte mas for atribuído a um terceiro que não está nas fontes, NÃO reproduza esse número — descreva de forma qualitativa (ex: 'a maioria dos consumidores' em vez de 'X% dos consumidores').
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
- NÃO use marcações de citação numeradas como [1], [2], [3] no texto. Escreva o conteúdo de forma fluida. As fontes serão listadas separadamente.
- NÃO use notação LaTeX ou matemática (ex: \\text{}, \\times, \\div, \\frac, cifrões de fórmula ou colchetes de equação). Escreva fórmulas em texto simples e legível — ex: "Altura × Largura × Comprimento ÷ 6.000", usando os símbolos × e ÷ diretamente no texto.

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
  const model = params.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  const raw = await callOpenRouter(apiKey, model, params);
  const parsed = safeParseDraft(raw);

  // Reforça o slug com o slugify do projeto: o modelo pode devolver algo com
  // acento, espaço ou maiúscula. Garante consistência com o resto do sistema.
  parsed.suggestedSlug = slugify(parsed.suggestedSlug) || slugify(parsed.title);

  return { draft: parsed, model };
}

// ---------------------------------------------------------------------------
// Geração por tema com busca web automática (plugin `web` da OpenRouter)
// ---------------------------------------------------------------------------

/**
 * Tentativas da geração com busca web. Com o modelo de busca dedicado (Sonar) a
 * ancoragem é praticamente garantida, então uma tentativa quase sempre basta.
 * Ainda assim re-tentamos UMA vez quando, DEPOIS de desembrulhar e filtrar
 * concorrentes, sobram ZERO fontes válidas (ex.: todos os resultados caíram em
 * concorrente). Se a 2ª também zerar, a rota devolve o 422 amigável. Só
 * re-tentamos o caso "zero fontes válidas"; erro de rede/HTTP é falha real.
 */
const WEB_MAX_ATTEMPTS = 2;

/**
 * Uma citação crua devolvida pelo modelo em `message.annotations[]`
 * (url_citation). Com o Sonar as URLs já vêm reais; com grounding do Gemini
 * viriam embrulhadas num redirect do Google. Em ambos os casos passam pelo
 * `resolveWebSources`, que desembrulha (se preciso) e filtra concorrentes.
 */
export interface RawAnnotation {
  url: string;
  title?: string;
}

export interface GenerateWithWebParams {
  theme: string;
  keywords?: string[];
  /** Modelo escolhido; sem ele, usa WEB_SEARCH_MODEL (Sonar). */
  model?: string;
}

export interface GenerateWithWebResult {
  draft: GeneratedDraft;
  model: string;
  /** Fontes já resolvidas: desembrulhadas, sem concorrentes e sem duplicatas. */
  sources: ResolvedSource[];
}

/**
 * Gera um rascunho pedindo ao modelo de busca dedicado (Sonar) que ELE busque
 * as fontes na web, em vez de a gente extrair URLs manualmente. Reusa o mesmo
 * `SYSTEM_PROMPT` (anti-invenção + REGRA DE MARCA anti-concorrentes) e a mesma
 * validação de shape — só muda a origem das fontes.
 *
 * Já desembrulha + filtra concorrentes AQUI (via `resolveWebSources`) para o
 * retry enxergar a contagem PÓS-filtro: se sobrar zero fonte válida, tenta mais
 * uma vez. Devolve o rascunho validado + as `sources` já resolvidas; se ainda
 * assim vier vazio, a rota decide o 422. Lança `AiError` em falha tratável.
 */
export async function generateDraftWithWebSearch(
  params: GenerateWithWebParams,
): Promise<GenerateWithWebResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new AiError("OPENROUTER_API_KEY não configurada");
  }
  const model = params.model || WEB_SEARCH_MODEL;

  // O Sonar (perplexity/*) busca a web nativamente e devolve as fontes em
  // `annotations` sem precisar de plugin. Qualquer OUTRO modelo escolhido precisa
  // do plugin `web` da OpenRouter pra buscar e devolver as `annotations` no mesmo
  // formato — assim o seletor de modelo funciona no generate-auto sem perder as
  // fontes. Ver isNativeWebSearchModel em lib/models.
  const useWebPlugin = !model.startsWith("perplexity/");

  // Guardamos o último resultado para, se todas as tentativas voltarem sem
  // fontes válidas, ainda devolver um rascunho válido com sources:[] — a rota
  // decide o 422.
  let last: GenerateWithWebResult | null = null;

  for (let attempt = 1; attempt <= WEB_MAX_ATTEMPTS; attempt++) {
    const { content, annotations } = await callOpenRouterWeb(
      apiKey,
      model,
      params,
      useWebPlugin,
    );
    const parsed = safeParseDraft(content);
    parsed.suggestedSlug =
      slugify(parsed.suggestedSlug) || slugify(parsed.title);

    // Desembrulha (se preciso) + descarta concorrentes/duplicatas já aqui, para
    // o retry ser sobre "zero fontes VÁLIDAS", não sobre "zero annotations".
    const sources = await resolveWebSources(annotations);
    last = { draft: parsed, model, sources };
    if (sources.length > 0) return last;

    console.warn(
      `[ai] tentativa ${attempt}/${WEB_MAX_ATTEMPTS}: busca web voltou sem ` +
        `fontes válidas (pós-filtro), repetindo…`,
    );
  }

  // Todas as tentativas voltaram sem fontes válidas. Devolve a última (sources:[]).
  return last as GenerateWithWebResult;
}

/**
 * Monta o prompt do usuário para o modo web: só tema + keywords. NÃO passamos
 * fontes no prompt (o plugin `web` as injeta), mas reforçamos que a base
 * factual são as fontes buscadas e que as regras (factuais + marca) valem.
 */
function buildWebUserPrompt(params: GenerateWithWebParams): string {
  const { theme, keywords } = params;
  const parts: string[] = [`Tema do artigo: ${theme}`];

  if (keywords?.length) {
    parts.push(`Palavras-chave a considerar: ${keywords.join(", ")}`);
  }

  parts.push(
    "\nBusque fontes reais e confiáveis na web sobre este tema e use-as como" +
      " ÚNICA base factual. Siga TODAS as regras — especialmente as REGRAS" +
      " FACTUAIS (nada de dados inventados) e a REGRA DE MARCA (não citar nem" +
      " recomendar concorrentes pelo nome). Responda apenas com o JSON.",
  );
  return parts.join("\n");
}

/**
 * Chama a OpenRouter com o plugin `web` ligado e devolve `{ content,
 * annotations }`. Mesma robustez de `callOpenRouter` (timeout, HTTP de erro,
 * corpo vazio), só que também lê as `message.annotations` (url_citation).
 */
async function callOpenRouterWeb(
  apiKey: string,
  model: string,
  params: GenerateWithWebParams,
  useWebPlugin: boolean,
): Promise<{ content: string; annotations: RawAnnotation[] }> {
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
          { role: "user", content: buildWebUserPrompt(params) },
        ],
        // Fonte da busca web:
        //  - Sonar (perplexity/*) pesquisa nativamente e devolve as fontes em
        //    message.annotations (url_citation) — sem plugin.
        //  - Qualquer outro modelo escolhido recebe o plugin `web` da OpenRouter,
        //    que busca e injeta as mesmas `annotations`. Assim o seletor funciona
        //    aqui sem quebrar o fluxo de fontes.
        ...(useWebPlugin ? { plugins: [{ id: "web" }] } : {}),
        // Sem `response_format`: o Sonar NÃO aceita `{ type: "json_object" }`
        // (só `json_schema`/`text`). Como o modelo já devolve o JSON pedido pelo
        // SYSTEM_PROMPT e o `safeParseDraft` limpa cercas + valida o shape, não
        // precisamos forçar o formato aqui.
        temperature: 0.4,
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
  return { content, annotations: extractAnnotations(json) };
}

/**
 * Puxa `choices[0].message.annotations[]` e devolve as url_citation como
 * `{ url, title }`. Tolerante: qualquer desvio de shape vira lista vazia (a
 * rota trata "zero fontes" com um 422 amigável). Nunca lança.
 */
function extractAnnotations(json: unknown): RawAnnotation[] {
  if (typeof json !== "object" || json === null) return [];
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return [];
  const message = (choices[0] as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return [];
  const annotations = (message as { annotations?: unknown }).annotations;
  if (!Array.isArray(annotations)) return [];

  const out: RawAnnotation[] = [];
  for (const a of annotations) {
    if (typeof a !== "object" || a === null) continue;
    const citation = (a as { url_citation?: unknown }).url_citation;
    if (typeof citation !== "object" || citation === null) continue;
    const url = (citation as { url?: unknown }).url;
    if (typeof url !== "string" || !url) continue;
    const title = (citation as { title?: unknown }).title;
    out.push({ url, title: typeof title === "string" ? title : undefined });
  }
  return out;
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
 * Extrai o JSON da resposta (tolerando cercas de código e texto antes/depois,
 * via `parseJsonLoose`) e valida o shape. Nada aqui confia no modelo — falha ao
 * conseguir o JSON ou desvio de shape vira AiError tratável.
 */
function safeParseDraft(raw: string): GeneratedDraft {
  const obj = parseJsonLoose(raw);
  if (obj === null) {
    throw new AiError("O modelo não devolveu um JSON válido");
  }

  const result = draftSchema.safeParse(obj);
  if (!result.success) {
    throw new AiError("O JSON do modelo não tem o formato esperado");
  }

  // Garantia: mesmo pedindo no prompt, o Sonar às vezes insiste em cravar
  // marcações de citação [1], [2][3] no corpo. Removemos aqui — as fontes são
  // exibidas separadamente na seção "Fontes e referências" a partir do sources[].
  result.data.content = stripCitationMarkers(result.data.content);
  return result.data;
}

/**
 * Remove as marcações de citação que os modelos teimam em deixar no corpo, sem
 * tocar no texto legítimo. Rede de segurança: a instrução no prompt vem primeiro,
 * mas cada modelo cita de um jeito e o seletor permite trocar o modelo.
 *
 * Cobre duas formas:
 *  - Tags `<cite ...>...</cite>` (ex.: Claude via plugin web) — removemos só as
 *    TAGS (abertura com ou sem atributos + fechamento), PRESERVANDO o conteúdo
 *    interno: "<cite ...>a função do estoque</cite>" → "a função do estoque".
 *  - Marcações numeradas [1], [2][3], … (ex.: Sonar). O Sonar costuma escrever
 *    "texto [1].", então engolimos o espaço inline antes do marcador.
 *
 * Ao final, normaliza qualquer espaço órfão que tenha restado grudado numa
 * pontuação (ex.: "texto ." → "texto.").
 */
function stripCitationMarkers(content: string): string {
  return content
    .replace(/<\/?cite(?=[\s/>])[^>]*>/gi, "")
    .replace(/[ \t]*\[\d+\](?:\[\d+\])*/g, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1");
}
