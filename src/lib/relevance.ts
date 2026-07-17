// ---------------------------------------------------------------------------
// Relevância de fonte + detecção de página de índice.
//
// O portão de publicação só valida "http + não-concorrente" — uma fonte sobre
// poliéster ou portos passa. No cron não há humano para perceber que a fonte não
// tem nada a ver com o tema. Aqui está a rede que faltava, em duas peças:
//
//   1. isIndexPage — descarta HOME/listagem (/blog, /noticias, índice com
//      centenas de links) que passam o filtro de markdown vazio porque um índice
//      TEM texto (títulos, resumos), mas não é um artigo.
//   2. nicheScore / hasNicheSignal — pontua o quanto a fonte fala do NICHO da
//      Kanglu (e-commerce, logística, pós-venda, cliente…). Off-topic pontua ~0-1;
//      fonte do nicho, 7-11 no conteúdo. Calibrado empiricamente.
//
// Filosofia (pedido do dono): na dúvida, DEIXAR PASSAR — errar deixando uma fonte
// fraca passar (o portão de relevância/o humano pega depois) é melhor que cortar
// uma fonte boa. Por isso os cortes são conservadores e com folga de margem.
// ---------------------------------------------------------------------------

/**
 * Vocabulário do nicho — radicais (sem acento) que casam por substring, então
 * "logistic" pega logística/logístico, "fideliz" pega fidelização/fidelizar etc.
 */
export const NICHE_VOCAB = [
  "ecommerce",
  "e-commerce",
  "comercio eletronico",
  "loja online",
  "loja virtual",
  "varejo",
  "lojista",
  "marketplace",
  "pos-venda",
  "pos venda",
  "posvenda",
  "fideliz",
  "cliente",
  "consumidor",
  "comprador",
  "pedido",
  "entrega",
  "frete",
  "logistic",
  "transportadora",
  "rastrea",
  "devolucao",
  "troca",
  "checkout",
  "carrinho",
  "atendimento",
  "conversao",
  "recompra",
  "estoque",
  "expedicao",
  "marca",
  "produto",
];

/** Corte de relevância por CONTEÚDO (título + markdown) — fonte do Firecrawl. */
export const MIN_CONTENT_NICHE_SCORE = 4;

/** Quantos caracteres do conteúdo entram no score (o começo já é representativo). */
const CONTENT_SCAN_CHARS = 6000;

/** Acima disto, a página é claramente um índice/listagem, não um artigo. */
const INDEX_LINK_LIMIT = 300;

/** Último segmento de URL que denuncia índice/listagem (não um artigo). */
const INDEX_SEGMENTS = new Set([
  "blog",
  "blogs",
  "noticias",
  "noticia",
  "artigos",
  "artigo",
  "categoria",
  "categorias",
  "category",
  "categories",
  "tag",
  "tags",
  "page",
  "pagina",
  "paginas",
  "autor",
  "author",
  "home",
  "index",
]);

/** Remove acentos e baixa a caixa, para casar radicais de forma tolerante. */
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Nº de termos DISTINTOS do nicho presentes no texto. */
export function nicheScore(text: string): number {
  const hay = fold(text);
  let n = 0;
  for (const term of NICHE_VOCAB) {
    if (hay.includes(fold(term))) n++;
  }
  return n;
}

/**
 * A fonte é do nicho pelo CONTEÚDO? (título + começo do markdown). Usado no
 * pipeline do Firecrawl, que tem o conteúdo scrapeado em mãos. Corte com folga:
 * off-topic pontua ~1, fonte boa 7-11.
 */
export function isOnNicheByContent(title: string, content: string): boolean {
  return (
    nicheScore(`${title} ${content.slice(0, CONTENT_SCAN_CHARS)}`) >=
    MIN_CONTENT_NICHE_SCORE
  );
}

/**
 * Há ALGUM sinal do nicho no título+URL? Backstop universal (título+URL é o que
 * sobra depois da geração, para as duas engines). Lenient de propósito: basta 1
 * termo. Off-topic pontua 0; fonte do nicho, ≥1.
 */
export function hasNicheSignal(title: string, url: string): boolean {
  return nicheScore(`${title} ${url}`) >= 1;
}

/**
 * A página é um índice/listagem (não um artigo)? Dois sinais conservadores:
 *   (a) último segmento da URL é palavra de índice (/blog, /noticias…) ou a URL
 *       é a raiz (home);
 *   (b) o markdown tem MUITOS links (índice lista dezenas/centenas) — teto bem
 *       acima de qualquer artigo real (que teve ~50 links no pior caso medido).
 * Conservador: um artigo legítimo quase nunca tem slug = palavra de índice nem
 * centenas de links, então o risco de cortar fonte boa é baixo.
 */
export function isIndexPage(url: string, markdown: string): boolean {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length === 0) return true; // raiz = home
    const last = decodeURIComponent(segs[segs.length - 1]).toLowerCase();
    if (INDEX_SEGMENTS.has(last)) return true;
  } catch {
    // URL malformada não decide índice aqui; segue pro sinal de links.
  }
  const links = (markdown.match(/\[[^\]]*\]\([^)]*\)/g) || []).length;
  return links > INDEX_LINK_LIMIT;
}
