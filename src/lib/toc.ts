// ---------------------------------------------------------------------------
// Índice do artigo (Table of Contents) — FONTE ÚNICA DE VERDADE dos headings.
//
// O corpo do artigo é renderizado em VÁRIAS instâncias de <ReactMarkdown>
// (o `content` é fatiado nos marcadores `[[imagem:URL]]`, ver body-images.ts),
// então NÃO dá pra confiar num slugger interno por-instância: a deduplicação
// de headings repetidos não cruzaria as fatias, e o índice teria que replicar
// o algoritmo do slugger pra adivinhar os ids — dois lugares divergindo.
//
// Em vez disso, extraímos os headings UMA vez do markdown CRU (antes de qualquer
// split). A lista ordenada resultante alimenta os DOIS lados: o índice (os
// links `#id`) e os ids atribuídos às âncoras no corpo. Como é a mesma lista, na
// mesma ordem, o link do índice sempre bate com a âncora — impossível divergir.
//
// Roda sobre o `content` cru: os marcadores de imagem ficam em linha própria e
// não são headings, então este scanner os ignora naturalmente — o pipeline de
// imagens continua intocado.
// ---------------------------------------------------------------------------

export type TocEntry = {
  /** Id único da âncora (slug do texto; sufixo -N se repetido). */
  id: string;
  /** Texto de exibição do heading (markdown inline já removido). */
  text: string;
  /** 2 = h2, 3 = h3. */
  level: 2 | 3;
};

/**
 * Slug estável a partir do texto de um heading: minúsculas, acentos removidos
 * (NFD → sem os diacríticos combinantes), tudo que não é letra/número vira
 * hífen, e hífens das pontas são aparados. Determinístico: o mesmo texto sempre
 * gera o mesmo slug (a unicidade entre repetidos é resolvida em `extractHeadings`).
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacríticos combinantes (acentos)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // qualquer separador/símbolo → hífen
    .replace(/^-+|-+$/g, ""); // apara hífens das pontas
}

/**
 * Remove a marcação inline do markdown do TEXTO do heading para exibição no
 * índice: ênfase (`**x**`, `_x_`), código (`` `x` ``) e links (`[texto](url)`
 * → `texto`). Não é um parser completo — cobre o que aparece em heading — e o
 * resultado é usado tanto no índice quanto pra gerar o slug, mantendo os dois
 * consistentes.
 */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // [texto](url) / ![alt](url) → texto/alt
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // **negrito** / __negrito__
    .replace(/(\*|_)(.*?)\1/g, "$2") // *itálico* / _itálico_
    .replace(/`([^`]+)`/g, "$1") // `código`
    .trim();
}

/**
 * Extrai os headings h2/h3 do markdown cru, em ordem de documento, com ids
 * únicos. Blocos de código cercados (``` ou ~~~) são ignorados — um `## ` lá
 * dentro é código, não seção.
 *
 * Deduplicação: dois headings com o mesmo texto geram o mesmo slug base; o
 * segundo em diante ganha sufixo `-2`, `-3`, ... garantindo âncoras únicas.
 */
export function extractHeadings(content: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const counts = new Map<string, number>();
  let inFence = false;
  let fenceMarker = "";

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trimEnd();

    // Abre/fecha bloco de código cercado. A cerca de fechamento precisa ser do
    // mesmo tipo (``` fecha ```, ~~~ fecha ~~~), então um ``` dentro de um bloco
    // ~~~ não fecha por engano.
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      const marker = fence[1][0];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;

    // ## / ### no início da linha. Aparamos `#` de fechamento opcional (ATX).
    const heading = line.match(/^(#{2,3})\s+(.+?)\s*#*$/);
    if (!heading) continue;

    const level = heading[1].length as 2 | 3;
    const text = stripInlineMarkdown(heading[2]);
    if (!text) continue; // heading vazio após limpar não vira âncora

    const base = slugify(text) || "secao"; // fallback se o texto não gerar slug
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    const id = seen === 0 ? base : `${base}-${seen + 1}`;

    entries.push({ id, text, level });
  }

  return entries;
}
