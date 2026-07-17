import { z } from "zod";
import { slugify } from "@/lib/validation";
import type { ExtractedSource } from "@/lib/extract";
import { resolveWebSources, type ResolvedSource } from "@/lib/web-sources";
import { parseJsonLoose } from "@/lib/json-extract";
import { isCompetitorUrl } from "@/lib/competitors";
import {
  firecrawlSearch,
  FirecrawlError,
  type FirecrawlSearchResult,
} from "@/lib/firecrawl";
import { SONAR_RECENCY_FILTER } from "@/lib/recency";
import {
  isIndexPage,
  isOnNicheByContent,
  isLikelyPortuguese,
  isExcludedHost,
  hasStaleYearInUrl,
  hasNicheSignal,
  nicheScore,
} from "@/lib/relevance";

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

// ---------------------------------------------------------------------------
// Piso de extensão do artigo
//
// O modelo VARIA: com o mesmo material, um dia escreve um artigo, outro dia
// devolve um parágrafo único (formato "featured snippet"). O SYSTEM_PROMPT pede
// profundidade (ver ESTRUTURA E EXTENSÃO), mas os lite às vezes ignoram — então
// há também esta checagem no código. Thresholds calibrados pelos artigos reais:
// os aceitáveis têm ≥3 seções e ≥250 palavras; o parágrafo-snippet tem ~0-1 seção.
// Quem decide o que fazer com um artigo curto é o chamador (o painel rejeita com
// 422; o cron re-tenta e, se persistir, deixa como draft sem publicar).
// ---------------------------------------------------------------------------

export const MIN_ARTICLE_WORDS = 250;
export const MIN_ARTICLE_SECTIONS = 3;

export interface ArticleLength {
  ok: boolean;
  words: number;
  sections: number;
}

/** Conta palavras e seções (`##`) do markdown e diz se passa do piso mínimo. */
export function checkArticleLength(markdown: string): ArticleLength {
  const trimmed = markdown.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const sections = (markdown.match(/^##\s/gm) || []).length;
  return {
    ok: words >= MIN_ARTICLE_WORDS && sections >= MIN_ARTICLE_SECTIONS,
    words,
    sections,
  };
}

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
  // Sugestão de categoria: LOOSE de propósito (nullish) — o modelo pode devolver
  // o slug, o rótulo, "null" ou omitir. Não deixamos isso quebrar a geração: a
  // rota normaliza via normalizeCategory (lib/categories) contra a lista fixa,
  // caindo em null se não casar. É só uma SUGESTÃO pré-selecionada no editor.
  category: z.string().trim().nullish(),
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

IDIOMA (inegociável):
- Escreva em PORTUGUÊS DO BRASIL correto, do começo ao fim. Se ALGUMA fonte estiver em espanhol, inglês ou outro idioma, TRADUZA integralmente para pt-BR — NUNCA copie termos, palavras ou trechos no idioma original. Exemplos do que é PROIBIDO: 'flota' (use 'frota'), 'kilómetros' (use 'quilômetros'), 'reentregas'/'condutores'/'tercerizada' vindos do espanhol. Na dúvida sobre uma palavra estrangeira, reescreva a ideia em português natural.

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

ESTRUTURA E EXTENSÃO (obrigatório):
- Escreva um ARTIGO COMPLETO e aprofundado — NÃO uma resposta curta, uma definição, nem um único parágrafo de destaque (formato "featured snippet").
- Estrutura mínima: uma introdução, AO MENOS 3 seções com subtítulo em ## (idealmente 3 a 5) e uma conclusão.
- Desenvolva cada seção com profundidade: explique o porquê, dê contexto e exemplos conceituais aplicáveis a quem tem uma loja online. Mire em cerca de 500 palavras ou mais quando o material permitir.
- A extensão vem de PROFUNDIDADE, não de repetição nem de encher com dados: as REGRAS FACTUAIS acima continuam valendo — se as fontes forem magras, aprofunde de forma conceitual, sem inventar estatísticas, números ou citações para "atingir tamanho".

CATEGORIA (classificação):
- Classifique o artigo em UMA destas categorias fixas, retornando exatamente o slug: "logistica" (estoque, armazenagem, rastreamento, transporte, entregas, prazos, frete), "atendimento" (pós-venda, suporte, relacionamento, fidelização, SAC), "marketing" (aquisição, tráfego, conteúdo, redes sociais, SEO, branding), "gestao" (processos, finanças, operação, indicadores, planejamento), "tecnologia" (automação, sistemas, integrações, plataformas, IA) ou "vendas" (funil, conversão, negociação, ticket médio, recompra, checkout).
- Escolha a MAIS adequada ao tema central. Se nenhuma se encaixar bem, use null. Não invente categorias fora dessa lista.

FORMATO DE SAÍDA (obrigatório):
Responda APENAS com um objeto JSON válido, sem texto antes ou depois, sem cercas de código, com exatamente estas chaves:
{
  "title": "título do artigo",
  "excerpt": "resumo curto de 1-2 frases",
  "content": "corpo completo em markdown",
  "metaTitle": "título SEO (até ~60 caracteres)",
  "metaDescription": "descrição SEO (até ~155 caracteres)",
  "suggestedSlug": "slug-amigavel-em-kebab-case",
  "category": "logistica | atendimento | marketing | gestao | tecnologia | vendas (ou null)"
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
  /**
   * Restringe a busca a conteúdo RECENTE (últimos meses). Usado pelo cron diário,
   * que precisa de atualidade. O Firecrawl aplica via `tbs`; o Sonar nativo via
   * `search_after_date_filter` (ambos na mesma janela de `lib/recency`).
   */
  recent?: boolean;
  /**
   * Se o rascunho vier abaixo do piso de extensão (checkArticleLength), re-escreve
   * UMA vez antes de devolver. Ligado pelo cron (sem humano para barrar um
   * parágrafo); o painel deixa desligado e trata o curto com um 422. A re-escrita
   * reaproveita as MESMAS fontes — no Firecrawl não re-busca (barato); no Sonar,
   * como busca e escrita são acopladas, custa uma nova chamada.
   */
  retryOnShort?: boolean;
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
    // Depois passa pelo pós-filtro do Sonar (o caminho que menos filtra, e que
    // vira o NORMAL quando o Firecrawl fica raro por crédito/timeout).
    const sources = filterSonarSources(await resolveWebSources(annotations));
    last = { draft: parsed, model, sources };

    if (sources.length > 0) {
      // Fontes ok. Só re-tenta se o cron pediu (retryOnShort) E o texto veio
      // abaixo do piso — e ainda há tentativa sobrando. Caso contrário, devolve.
      const short = params.retryOnShort && !checkArticleLength(parsed.content).ok;
      if (short && attempt < WEB_MAX_ATTEMPTS) {
        console.warn(
          `[ai] tentativa ${attempt}/${WEB_MAX_ATTEMPTS}: rascunho curto ` +
            `(< piso), repetindo a geração…`,
        );
        continue;
      }
      return last;
    }

    console.warn(
      `[ai] tentativa ${attempt}/${WEB_MAX_ATTEMPTS}: busca web voltou sem ` +
        `fontes válidas (pós-filtro), repetindo…`,
    );
  }

  // Esgotou as tentativas (sem fontes, ou ainda curto). Devolve a última.
  return last as GenerateWithWebResult;
}

// ---------------------------------------------------------------------------
// Geração por tema com busca web via FIRECRAWL (motor padrão do generate-auto)
// ---------------------------------------------------------------------------
//
// Caminho ADITIVO e paralelo ao Sonar (que continua intocado acima). Aqui a
// BUSCA é do Firecrawl e a ESCRITA é do modelo de texto do seletor — separadas,
// diferente do Sonar (que busca+escreve junto). O Firecrawl só conhece a web;
// TODAS as regras/proteções continuam sendo aplicadas por ESTE pipeline:
//   1. Filtro de concorrentes (competitors.ts) nas fontes, ANTES de escrever.
//   2. SYSTEM_PROMPT completo vai ao modelo escritor — via `generateDraft`, que
//      já usa exatamente o mesmo prompt e a mesma validação do fluxo manual.
//   3. Limpeza da saída (tags <cite>, marcadores [1], extração robusta de JSON)
//      — também dentro de `generateDraft` (safeParseDraft/stripCitationMarkers).
//   4. O portão de publicação (422 se zero fontes) fica na rota, como já é.
//
// Se o Firecrawl falhar (erro/limite/timeout) OU não sobrar nenhuma fonte
// não-concorrente, esta função LANÇA — a rota captura e cai no Sonar (fallback).

/**
 * Teto de caracteres do markdown de cada fonte do Firecrawl que vai pro modelo.
 * Mesmo espírito do MAX_TEXT_CHARS da extração manual: síntese sem estourar
 * contexto/custo. Uma página scrapeada inteira pode ser bem maior que isto.
 */
const FIRECRAWL_MAX_TEXT_CHARS = 12_000;

/**
 * Gera um rascunho onde o FIRECRAWL busca as fontes e o MODELO DE TEXTO escreve.
 * Reusa o mesmo `SYSTEM_PROMPT` e a mesma validação (via `generateDraft`), então
 * as regras factuais e de marca são idênticas às dos outros fluxos.
 *
 * Lança `FirecrawlError` se a busca falhar OU se, depois de descartar
 * concorrentes/duplicatas, não sobrar nenhuma fonte aproveitável — em ambos os
 * casos a rota cai no Sonar (fallback). Pode propagar `AiError` da escrita.
 */
export async function generateDraftWithFirecrawl(
  params: GenerateWithWebParams,
): Promise<GenerateWithWebResult> {
  const { theme, keywords, model, recent } = params;

  // BUSCA: só o Firecrawl. Pode lançar FirecrawlError (rota → fallback Sonar).
  // `recent` restringe aos últimos meses (conteúdo atual do cron).
  const results = await firecrawlSearch(theme, { recent });

  // CAMADA 1 — filtro de concorrentes + dedupe, ANTES de escrever. O Firecrawl
  // devolve URL real (sem redirect do Google), então filtramos direto.
  const sources = filterFirecrawlSources(results);
  if (sources.length === 0) {
    // Nada não-concorrente aproveitável: sinaliza o fallback pro Sonar (que pode
    // achar fontes neutras). Não gastamos o modelo escritor à toa.
    throw new FirecrawlError(
      "Firecrawl não retornou fontes não-concorrentes aproveitáveis",
    );
  }

  // ESCRITA: o modelo do seletor escreve a partir do conteúdo buscado. Decisão:
  // se o modelo escolhido for o Sonar (perplexity/*), ele NÃO é um bom escritor
  // puro e rejeita `response_format: json_object` — então escrevemos com o modelo
  // de texto padrão (OPENROUTER_MODEL). Qualquer outro modelo escolhido é usado.
  const writingModel =
    model && !model.startsWith("perplexity/") ? model : undefined;

  // CAMADAS 2 e 3 (SYSTEM_PROMPT completo + limpeza/JSON robusto) vivem aqui.
  let { draft, model: usedModel } = await generateDraft({
    theme,
    keywords,
    sources,
    model: writingModel,
  });

  // Retry por extensão (só quando o cron pede): se o texto veio abaixo do piso,
  // re-escreve UMA vez com as MESMAS fontes — não re-busca (barato). A variação do
  // modelo costuma resolver na 2ª. Fica com a versão que passar; se nenhuma passar,
  // devolve a mais longa (quem chama decide não publicar).
  if (params.retryOnShort && !checkArticleLength(draft.content).ok) {
    console.warn("[ai] Firecrawl: rascunho curto (< piso), re-escrevendo…");
    const retry = await generateDraft({ theme, keywords, sources, model: writingModel });
    const firstOk = checkArticleLength(draft.content).ok;
    const retryOk = checkArticleLength(retry.draft.content).ok;
    if (retryOk || (!firstOk && retry.draft.content.length > draft.content.length)) {
      draft = retry.draft;
      usedModel = retry.model;
    }
  }

  return {
    draft,
    model: usedModel,
    sources: sources.map((s) => ({ title: s.title, url: s.url })),
  };
}

/**
 * Converte os resultados do Firecrawl em fontes aproveitáveis: descarta
 * concorrentes (competitors.ts) e duplicatas (por host+path), e trunca o
 * markdown ao teto. Devolve `ExtractedSource[]` — o mesmo shape que o
 * `generateDraft` (fluxo manual) já consome. Pode devolver lista vazia.
 */
function filterFirecrawlSources(
  results: FirecrawlSearchResult[],
): ExtractedSource[] {
  const seen = new Set<string>();
  const out: ExtractedSource[] = [];

  for (const r of results) {
    if (isCompetitorUrl(r.url)) {
      console.warn(`[firecrawl] concorrente descartado: ${r.url}`);
      continue;
    }
    // Host de ruído/documento (Scribd & cia) ou URL com ano antigo — a query já
    // exclui os hosts via -site:, mas isto é a rede caso escape; o ano antigo pega
    // o que a recência soft deixou passar.
    if (isExcludedHost(r.url) || hasStaleYearInUrl(r.url)) {
      console.warn(`[firecrawl] host/ano descartado: ${r.url}`);
      continue;
    }
    // Descarta HOME/listagem: passam o filtro de markdown vazio (índice TEM
    // texto), mas não são artigo. Sinais conservadores (URL de índice / muitos
    // links) — ver lib/relevance.
    if (isIndexPage(r.url, r.markdown)) {
      console.warn(`[firecrawl] índice/listagem descartado: ${r.url}`);
      continue;
    }
    // Descarta fonte NÃO-portuguesa: espanhol vazava termos pro texto ("flota",
    // "kilómetros"). Detecção por conteúdo (Firecrawl não tem filtro de idioma).
    if (!isLikelyPortuguese(r.markdown)) {
      console.warn(`[firecrawl] fonte não-portuguesa descartada: ${r.url}`);
      continue;
    }
    // Descarta off-topic: o portão só via http+não-concorrente, então poliéster/
    // portos passavam. Score de nicho pelo CONTEÚDO (folga grande: off-topic ~1,
    // fonte boa 7-11).
    if (!isOnNicheByContent(r.title, r.markdown)) {
      console.warn(
        `[firecrawl] fora do nicho descartado (score=${nicheScore(`${r.title} ${r.markdown.slice(0, 6000)}`)}): ${r.url}`,
      );
      continue;
    }
    const key = firecrawlDedupeKey(r.url);
    if (seen.has(key)) continue;
    seen.add(key);

    const textContent = r.markdown.slice(0, FIRECRAWL_MAX_TEXT_CHARS);
    out.push({
      title: r.title,
      url: r.url,
      excerpt: textContent.slice(0, 280).trim(),
      textContent,
    });
  }

  return out;
}

/**
 * Pós-filtro das citações do Sonar (fallback). NÃO temos o conteúdo delas (a
 * perplexity lê as páginas internamente), então só dá pra filtrar por URL+título
 * — mais fraco que o filtro de CONTEÚDO do Firecrawl, mas sobe o piso do caminho
 * que menos filtra. IMPORTANTE: enquanto o Firecrawl for raro (crédito/timeout),
 * ESTE é o caminho NORMAL do cron — daí valer a pena filtrar aqui também.
 * O que dá pra checar sem conteúdo: host de ruído/documento, ano antigo na URL,
 * índice pela URL, e sinal de nicho no título+URL. Idioma fica com o prompt.
 */
function filterSonarSources(sources: ResolvedSource[]): ResolvedSource[] {
  return sources.filter((s) => {
    if (isExcludedHost(s.url) || hasStaleYearInUrl(s.url)) {
      console.warn(`[sonar] host/ano descartado: ${s.url}`);
      return false;
    }
    if (isIndexPage(s.url, "")) {
      console.warn(`[sonar] índice descartado: ${s.url}`);
      return false;
    }
    if (!hasNicheSignal(s.title, s.url)) {
      console.warn(`[sonar] fora do nicho descartado: ${s.url}`);
      return false;
    }
    return true;
  });
}

/** Chave de dedup: host + pathname (ignora query/hash e barra final). */
function firecrawlDedupeKey(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return url;
  }
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
        // Recência no Sonar nativo (perplexity/*): `search_recency_filter` = último
        // ano — a PREFERÊNCIA por recente (não janela dura), análoga ao sbd:1,qdr:y
        // do Firecrawl (ver lib/recency). Verificado respeitando o filtro. Fecha o
        // buraco do fallback (antes buscava sem filtro de data). Só no Sonar nativo;
        // o plugin `web` (outro modelo) não conhece o param.
        ...(params.recent && !useWebPlugin
          ? { search_recency_filter: SONAR_RECENCY_FILTER }
          : {}),
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
