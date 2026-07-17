// ---------------------------------------------------------------------------
// Firecrawl — cliente da busca web (/v2/search)
// ---------------------------------------------------------------------------
//
// Motor de busca PADRÃO do generate-auto (sugestão do Júlio). Diferente do Sonar
// (que busca E escreve), o Firecrawl só BUSCA: dado o tema, chama POST
// https://api.firecrawl.dev/v2/search pedindo o conteúdo de cada resultado já em
// markdown (scrapeOptions.formats=["markdown"]) e devolve { url, title, markdown }.
// Quem ESCREVE o artigo é o modelo de texto do seletor (ver generateDraftWithFirecrawl
// em lib/ai), aplicando TODAS as regras (filtro de concorrentes, SYSTEM_PROMPT,
// limpeza, portão de publicação).
//
// Este arquivo é só o transporte: faz a chamada HTTP com timeout, mapeia erros
// (falha/limite/timeout) para um FirecrawlError tratável e faz parsing DEFENSIVO
// da resposta (nada aqui confia no shape). Nunca faz filtro de concorrente nem
// escreve — isso é papel do pipeline em lib/ai.
//
// A chave vem SÓ do ambiente (FIRECRAWL_API_KEY, fc-...), nunca hardcoded.

import { recencyTbs } from "@/lib/recency";

/** Endpoint da busca v2 do Firecrawl. */
const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";

/**
 * Timeout da chamada. Busca + scrape de várias páginas é mais lento que um fetch
 * simples; se estourar, vira FirecrawlError e a rota cai no Sonar (fallback).
 */
const FIRECRAWL_TIMEOUT_MS = 30_000;

/**
 * Quantos resultados pedir. Cada resultado com scrape consome crédito do free
 * tier, então mantemos baixo — 5 fontes já é material de sobra pro modelo
 * escrever com lastro.
 */
const DEFAULT_LIMIT = 5;

/**
 * Redes que só geram RUÍDO como fonte de artigo (vídeo/post curto, sem markdown
 * aproveitável) e desperdiçam slots da busca — sobretudo com recência ligada, que
 * enviesa o resultado pra elas (medido: 6/10 eram Instagram). Excluídas na própria
 * query via operador `-site:`, que o Firecrawl RESPEITA (verificado empiricamente:
 * com a exclusão, os slots de social viram fontes reais; sem, dominam a lista).
 *
 * LinkedIn ficou DE FORA de propósito: às vezes traz artigo real de veículo do
 * setor (ex.: `/pulse/`). A exclusão aqui é só pra não gastar slot com ruído puro;
 * o filtro de markdown vazio (extractResults) continua sendo a rede de segurança
 * que descarta qualquer post fraco que passe.
 */
const SOCIAL_EXCLUDES = [
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "facebook.com",
  "x.com",
  "twitter.com",
];

/** Anexa os `-site:` de exclusão de redes sociais ao termo de busca. */
function withSocialExcludes(query: string): string {
  return `${query} ${SOCIAL_EXCLUDES.map((d) => `-site:${d}`).join(" ")}`;
}

/**
 * Erro tratável do Firecrawl (chave ausente, HTTP de erro, limite de crédito,
 * rate limit, timeout, corpo inválido). Quem chama (rota) captura e cai no Sonar
 * — a busca nunca simplesmente quebra. `status` guarda o HTTP quando houver.
 */
export class FirecrawlError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FirecrawlError";
  }
}

/** Um resultado cru da busca: URL real + título + conteúdo em markdown. */
export interface FirecrawlSearchResult {
  url: string;
  title: string;
  markdown: string;
}

/**
 * Busca o tema no Firecrawl e devolve os resultados com conteúdo em markdown.
 * As URLs já vêm reais (sem redirect do Google), então o filtro de concorrentes
 * é aplicado direto lá no pipeline. Lança `FirecrawlError` em qualquer falha
 * tratável; nunca devolve lixo — só itens com URL http(s) e markdown não-vazio.
 */
export async function firecrawlSearch(
  query: string,
  opts: { limit?: number; recent?: boolean } = {},
): Promise<FirecrawlSearchResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new FirecrawlError("FIRECRAWL_API_KEY não configurada");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FIRECRAWL_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(FIRECRAWL_SEARCH_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: withSocialExcludes(query),
        limit: opts.limit ?? DEFAULT_LIMIT,
        // Só busca web (sem imagens/news); com scrape do conteúdo em markdown.
        sources: [{ type: "web" }],
        scrapeOptions: { formats: [{ type: "markdown" }] },
        // Recência opcional: restringe aos últimos meses (conteúdo ATUAL do cron).
        // Omitido no fluxo do painel — lá o editor pode querer um tema atemporal.
        ...(opts.recent ? { tbs: recencyTbs() } : {}),
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new FirecrawlError(
        `Tempo esgotado (${FIRECRAWL_TIMEOUT_MS}ms) na busca Firecrawl`,
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new FirecrawlError(`Falha de rede ao chamar o Firecrawl: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // Mensagens específicas pros casos mais comuns do free tier — o resto vira
    // uma mensagem genérica com o status. Em todos os casos a rota cai no Sonar.
    const hint =
      res.status === 402
        ? "crédito do Firecrawl esgotado"
        : res.status === 429
          ? "limite de requisições do Firecrawl atingido"
          : res.status === 401 || res.status === 403
            ? "chave do Firecrawl inválida"
            : res.status === 408
              ? "busca do Firecrawl expirou"
              : `Firecrawl respondeu ${res.status}`;
    throw new FirecrawlError(
      `${hint}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      res.status,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new FirecrawlError("Resposta do Firecrawl não é JSON");
  }

  return extractResults(json);
}

/**
 * Puxa `data.web[]` da resposta e devolve só os itens úteis (URL http(s) + título
 * + markdown não-vazio). Totalmente defensivo: qualquer desvio de shape vira
 * lista vazia — quem chama trata "zero fontes" caindo no Sonar. Nunca lança.
 */
function extractResults(json: unknown): FirecrawlSearchResult[] {
  if (typeof json !== "object" || json === null) return [];
  const data = (json as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return [];
  const web = (data as { web?: unknown }).web;
  if (!Array.isArray(web)) return [];

  const out: FirecrawlSearchResult[] = [];
  for (const item of web) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as {
      url?: unknown;
      title?: unknown;
      markdown?: unknown;
      metadata?: { title?: unknown } | null;
    };
    const url = typeof rec.url === "string" ? rec.url : "";
    if (!isHttpUrl(url)) continue;
    const markdown = typeof rec.markdown === "string" ? rec.markdown : "";
    if (!markdown.trim()) continue; // sem conteúdo scrapeado não serve de fonte
    const title =
      (typeof rec.title === "string" && rec.title.trim()) ||
      (typeof rec.metadata?.title === "string" && rec.metadata.title.trim()) ||
      url;
    out.push({ url, title, markdown });
  }
  return out;
}

/** True só para http/https bem-formado. */
function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
