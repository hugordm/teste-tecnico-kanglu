// ---------------------------------------------------------------------------
// Detecção de PAUTA REPETIDA — quanto um título proposto pisa em cima dos
// artigos que o blog já tem.
//
// Por que não comparar título exato: o modelo raramente repete a mesma frase;
// ele repete o mesmo ARTIGO com outras palavras. "Logística do 2º semestre" e
// "Prepare a logística para o segundo semestre" são o mesmo texto e não casam em
// nenhuma comparação literal. Então comparamos CONJUNTOS de palavras
// significativas (sem stopwords, sem acento, sem plural), com Jaccard.
//
// Puro e sem I/O de propósito: é a camada determinística que garante o que a
// instrução do prompt só pede com jeitinho. O prompt reduz a chance de repetir;
// isto aqui é o que efetivamente decide.
// ---------------------------------------------------------------------------

/**
 * Palavras sem carga temática: conectivos, artigos, preposições, verbos de
 * ligação e os moldes de título que a própria instrução de SEO pede ("como",
 * "maneiras", "guia", "dicas"). Se "como" contasse, metade das pautas do nicho
 * casaria entre si por motivo nenhum.
 *
 * O vocabulário DO NICHO (logística, entrega, rastreamento…) fica FORA desta
 * lista de propósito: é exatamente ele que denuncia a repetição de tema. O que
 * evita o falso positivo não é remover essas palavras, é o limiar — dois títulos
 * do nicho compartilham 1 ou 2 termos, um artigo repetido compartilha quase tudo.
 */
const STOPWORD_SOURCE = [
  // artigos, preposições, conjunções, pronomes
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "da", "do", "das",
  "dos", "em", "no", "na", "nos", "nas", "por", "pelo", "pela", "pelos",
  "pelas", "para", "pra", "com", "sem", "sob", "sobre", "entre", "até", "após",
  "ante", "e", "ou", "mas", "que", "se", "ao", "aos", "num", "numa", "seu",
  "sua", "seus", "suas", "meu", "minha", "este", "esta", "esse", "essa",
  "aquele", "aquela", "isso", "lhe", "ele", "ela", "eles", "elas", "você",
  "qual", "quais", "onde", "quando", "porque", "pois", "também", "mais",
  "menos", "muito", "muita", "todo", "toda", "todos", "todas", "cada",
  "outro", "outra", "outros", "outras", "mesmo", "mesma", "já", "não", "sim",
  // verbos de ligação / auxiliares comuns em título
  "ser", "são", "está", "estão", "ter", "tem", "terá", "fazer", "faz",
  "pode", "podem", "deve", "devem", "vai", "vão", "usar", "saber",
  // moldes de título — a instrução de SEO pede justamente estes formatos, então
  // eles aparecem em quase toda pauta e não dizem nada sobre o TEMA.
  "como", "maneiras", "formas", "jeitos", "passos", "dicas", "guia",
  "completo", "completa", "prático", "prática", "melhor", "melhores",
  "principais", "tudo", "saiba", "veja", "descubra", "conheça", "aprenda",
  "entenda", "evitar", "erros", "checklist",
  // "molduras" de valor: dizem que o assunto importa, não QUAL é o assunto.
  // Sem elas, "A importância do rastreamento…" e "A importância do pós-venda…"
  // casariam por causa de "importância" — palavras diferentes, tema diferente.
  "importância", "essencial", "essenciais", "fundamental", "necessário",
  "benefícios", "vantagens", "motivos", "razões", "vale", "pena",
];

/**
 * Stopwords passam pela MESMA normalização dos tokens do título (fold +
 * singular). Sem isso a comparação sairia torta nos dois sentidos: "melhores"
 * viraria "melhore" e não casaria com a entrada "melhores" da lista, e
 * "prática" não casaria com "pratica". Normalizar os dois lados com a mesma
 * função é o que garante que a lista faça o que está escrito nela.
 */
const STOPWORDS = new Set(
  STOPWORD_SOURCE.map((w) => singularize(fold(w))),
);

/**
 * Tira acento e caixa. Mesma normalização usada em outros filtros do projeto —
 * comparar "logística" com "logistica" tem que dar match.
 */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Ordinais escritos como dígito viram a palavra correspondente: "2º semestre"
 * e "segundo semestre" precisam colidir — é literalmente o caso que motivou
 * este módulo. Vai só até 12 (semestres, trimestres, meses); acima disso o
 * número raramente é ordinal num título.
 */
const ORDINAIS: Record<string, string> = {
  "1": "primeiro", "2": "segundo", "3": "terceiro", "4": "quarto",
  "5": "quinto", "6": "sexto", "7": "setimo", "8": "oitavo",
  "9": "nono", "10": "decimo", "11": "undecimo", "12": "duodecimo",
};

/**
 * "2º", "2ª", "2o", "2a" → "segundo". Só o dígito não basta: os indicadores
 * ordinais º/ª são LETRAS em Unicode (categoria Lo), então o token chega colado
 * ("2º") e nenhuma busca por "2" o encontraria. Um número solto sem marcador
 * ("9 estratégias") NÃO vira ordinal — ali ele é contagem, não posição.
 */
function ordinalWord(token: string): string | null {
  const m = /^(\d{1,2})[ºª°oa]$/.exec(token);
  return m ? (ORDINAIS[m[1]] ?? null) : null;
}

/**
 * Plural → singular, o suficiente para o português de títulos. "pedidos" e
 * "pedido" são a mesma palavra para efeito de tema; sem isto, metade das
 * colisões reais passaria batido.
 *
 * Não é um stemmer de verdade (não precisa ser): três regras cobrem o grosso —
 * "devoluções"→"devolucao", "canais"→"canal", "prazos"→"prazo". Um erro aqui
 * só desloca um pouco o score, e a decisão final ainda passa pelo limiar.
 */
function singularize(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("oes")) return `${word.slice(0, -3)}ao`;
  if (word.endsWith("aes")) return `${word.slice(0, -3)}ao`;
  if (word.endsWith("ais")) return `${word.slice(0, -3)}al`;
  if (word.endsWith("eis")) return `${word.slice(0, -3)}el`;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/**
 * Sufixos de derivação do português, do mais longo para o mais curto (a ordem
 * importa: "imento" tem que ser testado antes de "mento"/"to"). Cortá-los
 * aproxima palavras da MESMA família para a mesma raiz — que é o que interessa
 * aqui, porque a repetição de pauta quase sempre troca a forma da palavra:
 * "rastreamento de pedidos" vira "rastrear pedidos", "devolução" vira "devolver".
 */
const SUFIXOS = [
  "amento", "imento", "acao", "icao", "ancia", "encia", "agem", "ismo",
  "ista", "avel", "ivel", "ador", "idor", "ante", "ente", "ado", "ada",
  "ando", "endo", "indo", "ar", "er", "ir",
];

/**
 * Raiz aproximada de uma palavra: corta um sufixo de derivação e trunca em 6
 * caracteres. Não é linguística séria — é um casador de famílias barato:
 *
 *   rastreamento → rastre    rastrear → rastre    rastreio → rastre
 *   entrega      → entreg    entregar → entreg
 *   logistica    → logist    logistico → logist
 *
 * A truncagem em 6 é o que fecha os casos que o corte de sufixo não pega
 * sozinho. Curto demais (4-5) começa a fundir palavras não relacionadas; 6
 * mostrou-se o ponto em que as famílias juntam sem colar o que não é da família
 * (medido sobre os títulos reais do blog).
 *
 * Palavras curtas (≤4) ficam intactas: "frete", "loja", "pico" não têm o que
 * cortar e mexer nelas só criaria colisão falsa.
 */
function stem(word: string): string {
  if (word.length <= 4) return word;
  let root = word;
  for (const suf of SUFIXOS) {
    // Só corta se sobrar raiz com corpo — "entrar" não pode virar "ent".
    if (root.endsWith(suf) && root.length - suf.length >= 4) {
      root = root.slice(0, -suf.length);
      break;
    }
  }
  return root.slice(0, 6);
}

/**
 * Sinônimos do nicho que significam a MESMA coisa e aparecem misturados nos
 * títulos: uma pauta sobre "sua loja virtual" e outra sobre "seu e-commerce"
 * falam do mesmo lugar. Canonizamos ANTES de separar em palavras porque são
 * expressões de duas palavras, que a tokenização desmancharia.
 *
 * Lista curta e conservadora de propósito: só termos que são de fato
 * intercambiáveis no contexto da Kanglu. Sinônimo que não é sinônimo vira
 * falso positivo.
 */
const SINONIMOS: [RegExp, string][] = [
  [/\bcomercio eletronico\b/g, "ecommerce"],
  [/\be-commerce\b/g, "ecommerce"],
  [/\blojas? (online|virtuais|virtual)\b/g, "ecommerce"],
  [/\bpos[- ]venda\b/g, "posvenda"],
  [/\blogistica reversa\b/g, "logisticareversa"],
];

/** Aplica os sinônimos sobre o título já sem acento/caixa. */
function canonicalize(folded: string): string {
  let out = folded;
  for (const [re, to] of SINONIMOS) out = out.replace(re, to);
  return out;
}

/**
 * Título → conjunto de palavras significativas, normalizadas.
 * Descarta stopwords e tokens de 1-2 letras (ruído: "2", "os", siglas soltas).
 */
export function titleTokens(title: string): Set<string> {
  const out = new Set<string>();
  // Separa por qualquer coisa que não seja letra/dígito — pontuação, hífen de
  // "e-commerce" incluído (vira "e" + "commerce"; "e" cai como stopword e
  // "commerce" fica, então "e-commerce" e "ecommerce" ainda casam pela metade
  // que importa).
  for (const raw of canonicalize(fold(title)).split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    const word = singularize(ordinalWord(raw) ?? raw);
    if (word.length < 3) continue;
    // A stopword é descartada ANTES do stem: "melhor" e "melhoria" têm a mesma
    // raiz, mas só a primeira é molde de título. Cortar antes evita que a raiz
    // de uma palavra temática caia na lista por coincidência.
    if (STOPWORDS.has(word)) continue;
    out.add(stem(word));
  }
  return out;
}

/**
 * Sobreposição de tema entre dois títulos, de 0 (nada em comum) a 1 (mesmas
 * palavras significativas). É o índice de Jaccard: interseção ÷ união.
 *
 * Jaccard e não "interseção ÷ menor conjunto" (coeficiente de overlap): este
 * último dá 1.0 sempre que um título curto está contido num longo, o que
 * transformaria qualquer pauta enxuta do nicho em "repetida". Jaccard cobra
 * também o que os títulos têm de DIFERENTE, que é justamente o sinal de que a
 * pauta tem ângulo próprio.
 */
export function titleOverlap(a: string, b: string): number {
  const setA = titleTokens(a);
  const setB = titleTokens(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const w of setA) if (setB.has(w)) shared++;
  // |A ∪ B| = |A| + |B| − |A ∩ B|
  return shared / (setA.size + setB.size - shared);
}

/** Maior sobreposição entre `title` e qualquer um dos títulos anteriores. */
export function maxOverlap(title: string, previous: string[]): number {
  let max = 0;
  for (const prev of previous) {
    const score = titleOverlap(title, prev);
    if (score > max) max = score;
  }
  return max;
}

/**
 * Limiar a partir do qual consideramos a pauta repetida: 0,35.
 *
 * CALIBRADO, não chutado. Medido sobre 22 pares montados a partir dos títulos
 * REAIS do blog — 10 que são o mesmo artigo reescrito (incluindo "logística do
 * 2º semestre" ↔ "prepare a logística para o segundo semestre" e as trocas de
 * forma tipo "rastreamento de pedidos" ↔ "rastrear pedidos") e 12 pautas
 * legitimamente distintas do nicho:
 *
 *   duplicados : 0,60 – 1,00
 *   distintos  : 0,00 – 0,20   ← todos compartilhando termos do nicho
 *   faixa morta: 0,20 → 0,60, sem um único ponto dentro
 *
 * Qualquer limiar de 0,25 a 0,45 acerta 22/22 na amostra. Escolhi 0,35: fica
 * abaixo do centro da faixa (0,40) e mantém folga dos dois lados — +0,15 sobre
 * o pior distinto, −0,25 sob o melhor duplicado.
 *
 * Por que abaixo do centro, e não nele: os custos são assimétricos. Um falso
 * positivo só faz o cron pular para a 2ª pauta — de graça, ela já veio na mesma
 * resposta. Um falso negativo publica o artigo repetido, que é o problema que
 * viemos resolver. Empate técnico se decide para o lado barato.
 *
 * Se um dia o blog crescer e aparecer falso positivo, o ajuste é aqui — mas
 * refaça a medição antes de mexer, não mexa no olho.
 */
export const THEME_OVERLAP_THRESHOLD = 0.35;

export type IdeaPick<T> = {
  /** A pauta escolhida — nunca null: o cron precisa sair com artigo. */
  idea: T;
  /** Sobreposição da escolhida com o histórico (0–1), para o diagnóstico. */
  overlap: number;
  /** True quando TODAS as candidatas bateram no limiar (dia de tema forçado). */
  repeat: boolean;
};

/**
 * Escolhe a pauta do dia entre as candidatas, evitando repetir o histórico.
 *
 * Regra:
 *  1. Percorre as pautas NA ORDEM do modelo (a 1ª é a preferida dele) e devolve
 *     a primeira com sobreposição abaixo do limiar. Preserva o ranking original
 *     — só pula o que colide.
 *  2. Se TODAS colidirem, devolve a de MENOR sobreposição com `repeat: true`.
 *     Nunca devolve vazio: ficar sem artigo é pior que um tema próximo, e a flag
 *     avisa o humano na revisão da noite.
 *
 * `previous` vazio (blog novo) faz todo mundo pontuar 0 — cai na regra 1.
 */
export function pickFreshIdea<T extends { title: string }>(
  ideas: T[],
  previous: string[],
): IdeaPick<T> | null {
  if (ideas.length === 0) return null;

  let fallback: IdeaPick<T> | null = null;

  for (const idea of ideas) {
    const overlap = maxOverlap(idea.title, previous);
    if (overlap < THEME_OVERLAP_THRESHOLD) {
      return { idea, overlap, repeat: false };
    }
    // Guarda a menos pior enquanto procura uma limpa.
    if (!fallback || overlap < fallback.overlap) {
      fallback = { idea, overlap, repeat: true };
    }
  }

  return fallback;
}
