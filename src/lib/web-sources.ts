import { isCompetitorUrl } from "@/lib/competitors";

// ---------------------------------------------------------------------------
// Fontes da busca web — desembrulho do redirect do Google + filtro
// ---------------------------------------------------------------------------
//
// O plugin `web` da OpenRouter devolve as fontes usadas em `annotations[]`
// (url_citation). Mas essas URLs NÃO vêm limpas: chegam embrulhadas num
// redirect do grounding do Google (vertexaisearch.cloud.google.com/
// grounding-api-redirect/...). O domínio real só aparece seguindo o redirect.
//
// Aqui a gente desembrulha cada uma (captura o header Location), descarta as
// que falham e as que caem em concorrente, e devolve só as fontes reais e
// aproveitáveis. Nada disto confia na rede: timeout duro e try/catch em tudo.

/** Timeout do fetch de desembrulho. Redirect que não responde em 5s: desiste. */
const UNWRAP_TIMEOUT_MS = 5_000;

/** Máx. de saltos de redirect a seguir — trava contra loop de redirect. */
const MAX_REDIRECT_HOPS = 5;

/** Host do proxy de grounding do Google que embrulha as fontes. */
const GOOGLE_REDIRECT_HOST = "vertexaisearch.cloud.google.com";

/** Uma citação crua vinda das annotations do modelo. */
export interface WebAnnotation {
  url: string;
  title?: string;
}

/** Uma fonte já desembrulhada, real e não-concorrente. */
export interface ResolvedSource {
  title: string;
  url: string;
}

/** True se a URL é um redirect de grounding do Google (precisa desembrulhar). */
function isGoogleRedirect(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().endsWith(GOOGLE_REDIRECT_HOST);
  } catch {
    return false;
  }
}

/**
 * Desembrulha uma URL de redirect do Google até a URL final real, seguindo o
 * header `Location` com `redirect: "manual"`. Retorna a URL real ou `null` se
 * o desembrulho falhar (timeout, rede, sem Location, loop) — nesse caso a fonte
 * é descartada. Uma URL que já é real (não é redirect do Google) passa direto.
 */
export async function unwrapRedirect(rawUrl: string): Promise<string | null> {
  if (!isGoogleRedirect(rawUrl)) {
    // Já é uma URL real (ou algo que não sabemos desembrulhar): valida e devolve.
    return isHttpUrl(rawUrl) ? rawUrl : null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UNWRAP_TIMEOUT_MS);

  try {
    let current = rawUrl;

    for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual", // não seguir automático: queremos ler o Location
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; KangluBot/1.0; +https://kanglu.example)",
        },
      });

      const location = res.headers.get("location");

      // Sem redirect: ou já é a página final (2xx) e não há para onde ir, ou é
      // um erro. De qualquer forma, não temos uma URL real a extrair aqui.
      if (!location) return null;

      const next = absolutize(location, current);
      if (!next) return null;

      // Chegou numa URL real (fora do proxy do Google): é o alvo.
      if (!isGoogleRedirect(next)) {
        return isHttpUrl(next) ? next : null;
      }

      // Ainda dentro do proxy: segue mais um salto.
      current = next;
    }

    // Estourou os saltos sem sair do proxy — descarta.
    return null;
  } catch {
    // Timeout (AbortError), DNS, TLS, etc.: fonte perdida, segue a vida.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Desembrulha + filtra todas as annotations em paralelo e devolve só as fontes
 * reais, não-concorrentes e sem duplicatas. Resiliente: uma annotation podre
 * (redirect quebrado, concorrente, URL inválida) é ignorada, não derruba as
 * outras. Pode devolver lista vazia — quem chama decide (retornar 422).
 */
export async function resolveWebSources(
  annotations: WebAnnotation[],
): Promise<ResolvedSource[]> {
  if (annotations.length === 0) return [];

  const settled = await Promise.allSettled(
    annotations.map(async (a): Promise<ResolvedSource> => {
      const real = await unwrapRedirect(a.url);
      if (!real) {
        throw new Error("desembrulho falhou");
      }
      if (isCompetitorUrl(real)) {
        throw new Error(`concorrente descartado: ${real}`);
      }
      return { title: a.title?.trim() || real, url: real };
    }),
  );

  const seen = new Set<string>();
  const sources: ResolvedSource[] = [];

  for (const result of settled) {
    if (result.status !== "fulfilled") {
      console.warn(`[web-sources] fonte ignorada: ${result.reason}`);
      continue;
    }
    const key = dedupeKey(result.value.url);
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(result.value);
  }

  return sources;
}

// ---------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------

/** True só para http/https bem-formado. */
function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Resolve um Location possivelmente relativo contra a URL de origem. */
function absolutize(location: string, base: string): string | null {
  try {
    return new URL(location, base).toString();
  } catch {
    return null;
  }
}

/** Chave de dedup: host + pathname (ignora query/hash e barra final). */
function dedupeKey(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return url;
  }
}
