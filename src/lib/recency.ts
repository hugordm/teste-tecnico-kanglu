// ---------------------------------------------------------------------------
// Janela de recência compartilhada entre os dois motores de busca.
//
// O cron diário quer conteúdo ATUAL (não temas atemporais). Cada motor tem seu
// jeito de restringir por data, mas a JANELA é a mesma — definida aqui uma vez:
//   - Firecrawl /v2/search: parâmetro `tbs` (time-based search, herdado do Google),
//     intervalo de datas `cdr:1,cd_min:...,cd_max:...`.
//   - Perplexity/Sonar (via OpenRouter): `search_after_date_filter` (MM/DD/YYYY).
//
// Ambos foram verificados empiricamente respeitando o filtro (sem ele, aparece
// conteúdo de 2021; com ele, só dos últimos meses).
// ---------------------------------------------------------------------------

/**
 * Tamanho da janela em meses. Alguns meses (não semanas) é o equilíbrio: apertado
 * o bastante para ser "atual", largo o bastante para ainda achar fontes em pt-BR
 * do nicho (senão a busca zera e cai no fallback).
 */
export const RECENCY_MONTHS = 6;

/** Formata uma data como MM/DD/YYYY (formato que tbs e o Sonar esperam). */
function fmt(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

/** Intervalo [início, fim] da janela de recência, em MM/DD/YYYY, a partir de HOJE. */
function recencyRange(): { min: string; max: string } {
  const max = new Date();
  const min = new Date();
  min.setMonth(min.getMonth() - RECENCY_MONTHS);
  return { min: fmt(min), max: fmt(max) };
}

/** Valor `tbs` do Firecrawl: intervalo de datas dos últimos `RECENCY_MONTHS` meses. */
export function recencyTbs(): string {
  const { min, max } = recencyRange();
  return `cdr:1,cd_min:${min},cd_max:${max}`;
}

/**
 * Data de corte (início da janela) para o `search_after_date_filter` do Sonar —
 * "só fontes DEPOIS desta data". Mesmo início do intervalo do Firecrawl.
 */
export function recencyAfterDate(): string {
  return recencyRange().min;
}
