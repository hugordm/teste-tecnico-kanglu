// ---------------------------------------------------------------------------
// Tempo de leitura estimado a partir do `content` (markdown) do artigo.
//
// Conta só as PALAVRAS reais: os marcadores de imagem `[[imagem:URL]]` e as
// URLs são descartados (não são leitura), e a sintaxe de markdown (`#`, `*`,
// `` ` ``, `>`, `|`, ...) some naturalmente porque contamos apenas sequências
// alfanuméricas — símbolos não entram. De links `[texto](url)` fica só o
// `texto`. Sem dependências: uma regex Unicode resolve.
// ---------------------------------------------------------------------------

/** Ritmo médio de leitura adotado para a estimativa. */
const WORDS_PER_MINUTE = 200;

/**
 * Conta as palavras "de leitura" no markdown: remove marcadores de imagem,
 * reduz links ao texto visível, tira URLs e então conta as sequências de
 * letras/números (a pontuação e os símbolos de markdown ficam de fora).
 */
export function countWords(content: string): number {
  const text = content
    .replace(/\[\[imagem:[^\]]*\]\]/g, " ") // marcador de imagem do corpo
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // [texto](url)/![alt](url) → texto/alt
    .replace(/https?:\/\/\S+/g, " "); // URLs soltas

  return text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}

/**
 * Minutos de leitura: palavras ÷ 200, arredondado pra cima, com mínimo de 1 —
 * um artigo curtíssimo (ou vazio) nunca mostra "0 min".
 */
export function readingTimeMinutes(content: string): number {
  return Math.max(1, Math.ceil(countWords(content) / WORDS_PER_MINUTE));
}

/** Rótulo pronto para exibição, ex.: "5 min de leitura". */
export function formatReadingTime(content: string): string {
  return `${readingTimeMinutes(content)} min de leitura`;
}
