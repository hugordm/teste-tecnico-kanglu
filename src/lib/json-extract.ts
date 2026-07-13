// ---------------------------------------------------------------------------
// Extração robusta de JSON da resposta de um LLM.
//
// Modelos diferentes devolvem o JSON pedido de formas diferentes: puro, envolto
// em cercas de código (```json ... ```), ou com preâmbulo/posfácio ("Aqui está
// o JSON: {…}. Espero ter ajudado."). O parser antigo (JSON.parse do texto só
// sem cercas de envolvimento total) quebrava nesses casos — o seletor de modelo
// permite trocar pra modelos como o Claude, que usam esses formatos.
//
// Aqui centralizamos o "conseguir o JSON" (compartilhado por ai.ts e ideas.ts).
// A validação de SHAPE (zod) continua com cada chamador — isto só entrega o
// valor parseado, ou null se TODAS as estratégias falharem.
// ---------------------------------------------------------------------------

/**
 * Remove cercas de código markdown que envolvem TODO o texto (```json ... ``` ou
 * ``` ... ```). Se as cercas não envolvem tudo (há preâmbulo/posfácio), devolve
 * o texto aparado como está — nesse caso quem resolve é o `extractBalanced`.
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

/**
 * Extrai a PRIMEIRA estrutura JSON balanceada ({…} ou […]) do texto — o primeiro
 * `{`/`[` e o `}`/`]` correspondente — respeitando strings e escapes (um `}`
 * dentro de uma string não fecha o objeto). Devolve o trecho ou null se não
 * achar/fechar. Cobre o caso de texto antes/depois do bloco JSON.
 */
function extractBalanced(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start < 0) return null;

  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return text.slice(start, i + 1);
  }
  return null; // não fechou
}

/**
 * Faz o parse do JSON tolerando os formatos que modelos diferentes produzem.
 * Tenta, em ordem, e devolve o primeiro que parsear:
 *   1. o texto aparado direto (JSON puro — o caminho do Sonar/Gemini);
 *   2. sem as cercas de código de envolvimento total;
 *   3. o primeiro objeto/array balanceado extraído do MEIO do texto (cobre
 *      preâmbulo/posfácio e cercas que não envolvem tudo).
 * Devolve `null` só depois de esgotar as tentativas — o chamador decide o erro.
 */
export function parseJsonLoose(raw: string): unknown | null {
  const trimmed = raw.trim();
  const defenced = stripCodeFences(trimmed);

  const candidates = [
    defenced,
    trimmed,
    extractBalanced(defenced),
    extractBalanced(trimmed),
  ];

  const seen = new Set<string>();
  for (const c of candidates) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    try {
      return JSON.parse(c);
    } catch {
      // tenta a próxima estratégia
    }
  }
  return null;
}
