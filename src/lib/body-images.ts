// ---------------------------------------------------------------------------
// Imagens NO CORPO do artigo via marcador `[[imagem:URL]]`.
//
// A URL do Blob é embutida direto no texto (não um índice): o `content` fica
// auto-contido, sobrevive ao save/regenerate sem campo novo no schema, e a
// própria presença da URL no texto é o que a protege da limpeza do Blob
// (ver `content.includes(url)` nas rotas de PATCH e generate-image).
//
// A URL de um Blob público não contém espaço nem `]`, então a regex é simples e
// robusta. O marcador deve ficar em LINHA PRÓPRIA, entre blocos.
// ---------------------------------------------------------------------------

/** Reconhece `[[imagem:https://…]]`. Grupo 1 = a URL. Global: usado em split. */
export const IMAGE_MARKER = /\[\[imagem:(https?:\/\/[^\]\s]+)\]\]/g;

/** Monta o marcador a partir de uma URL — fonte única da sintaxe (editor usa). */
export function imageMarker(url: string): string {
  return `[[imagem:${url}]]`;
}

export type ContentPart =
  | { type: "text"; value: string }
  | { type: "image"; url: string };

/**
 * Quebra o `content` na regex do marcador, devolvendo trechos de texto
 * intercalados com imagens. Cada trecho de texto é renderizado por
 * `<ReactMarkdown>`; cada imagem vira um `<figure>` injetado — assim não
 * dependemos de o remark entender o marcador (que colide com link references do
 * CommonMark).
 *
 * Sem marcador, devolve um único trecho de texto (render idêntico ao de hoje).
 */
export function splitContentByImageMarker(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  let lastIndex = 0;

  // `matchAll` com regex global percorre todas as ocorrências sem estado
  // compartilhado (não mexemos no lastIndex da regex do módulo).
  for (const match of content.matchAll(IMAGE_MARKER)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, start) });
    }
    parts.push({ type: "image", url: match[1] });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  return parts;
}
