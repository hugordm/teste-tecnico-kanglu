import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

// ---------------------------------------------------------------------------
// Limites — o input vem da internet aberta, então nada aqui é confiável.
// ---------------------------------------------------------------------------

/** Timeout do fetch. Fonte que não responde em 8s a gente desiste. */
const FETCH_TIMEOUT_MS = 8_000;

/**
 * Teto de bytes baixados por página. `Content-Length` pode vir ausente ou
 * mentiroso, então não dá pra confiar nele: lemos o corpo em streaming e
 * cortamos ao estourar este teto. Evita engolir um HTML de 50MB e explodir
 * a memória do server.
 */
const MAX_HTML_BYTES = 2_000_000; // ~2MB

/**
 * Teto de caracteres do texto extraído que vai pro LLM. Um artigo longo pode
 * ter 100k+ caracteres; mandar tudo estoura o contexto e o custo. 12k é folga
 * de sobra pra síntese sem perder o miolo.
 */
const MAX_TEXT_CHARS = 12_000;

/**
 * Erro de extração tratável. O chamador captura isto e segue a vida (em
 * `extractMany`, uma fonte podre não derruba as outras). Nunca vaza stack
 * nem detalhe interno pro cliente.
 */
export class ExtractError extends Error {
  constructor(
    message: string,
    readonly url: string,
  ) {
    super(message);
    this.name = "ExtractError";
  }
}

/** O que uma extração bem-sucedida devolve. */
export interface ExtractedSource {
  title: string;
  url: string;
  excerpt: string;
  textContent: string;
}

// ---------------------------------------------------------------------------
// Extração de uma URL
// ---------------------------------------------------------------------------

/**
 * Baixa a página, extrai título + texto principal limpo com Readability e
 * devolve `{ title, url, excerpt, textContent }`. Lança `ExtractError` em
 * qualquer falha tratável (timeout, não-HTML, HTML gigante, sem conteúdo
 * legível).
 */
export async function extractFromUrl(url: string): Promise<ExtractedSource> {
  const html = await fetchHtml(url);

  // `url` no JSDOM é importante: o Readability resolve links/imagens relativos
  // e alguns sites dependem disso pra achar o conteúdo principal.
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  // Readability devolve null quando não acha um corpo de artigo (ex.: página
  // que é só um menu, um paywall, ou JS puro sem conteúdo no HTML servido).
  if (!article || !article.textContent?.trim()) {
    throw new ExtractError("Não foi possível extrair conteúdo legível", url);
  }

  const textContent = normalizeWhitespace(article.textContent).slice(
    0,
    MAX_TEXT_CHARS,
  );

  return {
    title: article.title?.trim() || url,
    url,
    // Readability já dá um excerpt; se não, cai num pedaço do texto.
    excerpt: (article.excerpt?.trim() || textContent.slice(0, 280)).trim(),
    textContent,
  };
}

// ---------------------------------------------------------------------------
// Extração de várias URLs em paralelo
// ---------------------------------------------------------------------------

/**
 * Roda `extractFromUrl` em paralelo pra várias URLs. Usa `allSettled` de
 * propósito: uma fonte que falha (404, timeout, HTML lixo) NÃO derruba as
 * outras — só as que deram certo voltam. As que falharam viram um warn no log
 * do server, não um erro pro cliente.
 *
 * Se nenhuma URL foi passada, devolve lista vazia (o gerador de rascunho
 * decide o que fazer sem fontes).
 */
export async function extractMany(
  urls: string[],
): Promise<ExtractedSource[]> {
  if (urls.length === 0) return [];

  const settled = await Promise.allSettled(urls.map(extractFromUrl));

  const ok: ExtractedSource[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      ok.push(result.value);
    } else {
      const reason = result.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      console.warn(`[extract] fonte ignorada: ${msg}`);
    }
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------

/**
 * Faz o fetch com timeout duro (AbortController) e lê o corpo em streaming,
 * cortando ao passar de MAX_HTML_BYTES. Valida que a resposta é HTML antes de
 * gastar bytes com ela.
 */
async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // Muitos sites bloqueiam user-agents vazios; um UA de browser destrava.
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; KangluBot/1.0; +https://kanglu.example)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      throw new ExtractError(`HTTP ${res.status} ao baixar a página`, url);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new ExtractError(
        `Conteúdo não é HTML (${contentType || "sem content-type"})`,
        url,
      );
    }

    return await readCapped(res, url);
  } catch (err) {
    // Erros já tratáveis passam direto; o resto (abort, DNS, TLS) é traduzido.
    if (err instanceof ExtractError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ExtractError(
        `Tempo esgotado (${FETCH_TIMEOUT_MS}ms) ao baixar a página`,
        url,
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new ExtractError(`Falha ao baixar a página: ${msg}`, url);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lê o corpo da resposta chunk a chunk, abortando se passar do teto de bytes.
 * Decodifica como UTF-8 (bom o bastante pro Readability; ele reparse o HTML
 * de qualquer jeito).
 */
async function readCapped(res: Response, url: string): Promise<string> {
  const body = res.body;
  if (!body) {
    // Sem stream (raro) — cai no texto direto, mas ainda respeita o teto.
    const text = await res.text();
    if (text.length > MAX_HTML_BYTES) {
      throw new ExtractError("Página grande demais para processar", url);
    }
    return text;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let received = 0;
  let html = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_HTML_BYTES) {
        throw new ExtractError("Página grande demais para processar", url);
      }
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode(); // flush final
    return html;
  } finally {
    // Solta a conexão mesmo se a gente abortou no meio pelo teto de tamanho.
    await reader.cancel().catch(() => {});
  }
}

/** Colapsa espaços/quebras repetidas — Readability deixa muito \n\n\n. */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
