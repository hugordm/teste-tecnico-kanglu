import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitContentByImageMarker } from "@/lib/body-images";
import { extractHeadings, type TocEntry } from "@/lib/toc";

// Renderer de markdown compartilhado entre o blog público e o PREVIEW do editor
// admin — é a mesma aparência que o leitor final verá. Sem "use client": o
// componente é puro, então roda como Server Component no blog (bom pra SEO) e
// também dentro do Client Component do editor.

/**
 * Nó hast mínimo para o walker de ids (só o que usamos). O plugin muta
 * `properties` — entrada do pipeline rehype, não estado de React.
 */
type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/**
 * Plugin rehype que atribui os ids das âncoras aos headings h2/h3, na ordem em
 * que aparecem na árvore, a partir de `entries` (a fatia do índice referente a
 * ESTE trecho de markdown).
 *
 * Por que um plugin e não um contador no render: cada trecho vira uma instância
 * separada de <ReactMarkdown>, e o React Compiler proíbe mutar um contador
 * compartilhado dentro dos componentes de render. Mutar `properties` da hast,
 * porém, é exatamente o que plugins rehype fazem — roda no transform, fora do
 * render — então cada instância assina seus ids de forma isolada e determinística.
 *
 * `index` conta TODO heading encontrado (mantendo o alinhamento 1:1 com a
 * extração), mas só grava o id quando o nível bate — defensivo: no pior caso a
 * âncora fica sem id em vez de apontar pro lugar errado.
 */
function rehypeHeadingIds(entries: TocEntry[]) {
  return (tree: HastNode) => {
    let index = 0;
    const walk = (node: HastNode) => {
      const level = node.tagName === "h2" ? 2 : node.tagName === "h3" ? 3 : 0;
      if (node.type === "element" && (level === 2 || level === 3)) {
        const entry = entries[index];
        index += 1;
        if (entry && entry.level === level) {
          node.properties = { ...(node.properties ?? {}), id: entry.id };
        }
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

/**
 * Mapeamento dos elementos markdown para versões estilizadas na marca:
 * títulos em bordô (Poppins), links em laranja, tipografia de leitura
 * confortável. Definido no módulo para não recriar a cada render.
 *
 * h2/h3 recebem o `id` da âncora via props (posto na hast pelo `rehypeHeadingIds`)
 * e ganham `scroll-mt` pra o scroll suave do índice parar com respiro no topo.
 */
const components: Components = {
  h2: ({ children, id }) => (
    <h2
      id={id}
      className="mt-10 mb-3 scroll-mt-24 font-heading text-2xl font-semibold text-kanglu-bordo lg:text-3xl"
    >
      {children}
    </h2>
  ),
  h3: ({ children, id }) => (
    <h3
      id={id}
      className="mt-8 mb-2 scroll-mt-24 font-heading text-xl font-semibold text-kanglu-bordo lg:text-2xl"
    >
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="my-4">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-kanglu-orange underline decoration-kanglu-orange/40 underline-offset-2 hover:decoration-kanglu-orange"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-4 list-disc space-y-1 pl-6 marker:text-kanglu-orange">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-4 list-decimal space-y-1 pl-6 marker:text-kanglu-orange">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-6 border-l-4 border-kanglu-orange bg-white/60 py-2 pl-4 pr-2 italic text-kanglu-bordo/80">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-kanglu-nude/40 px-1.5 py-0.5 font-mono text-[0.85em] text-kanglu-bordo">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-6 overflow-x-auto rounded-lg bg-kanglu-bordo p-4 text-sm text-kanglu-cream">
      {children}
    </pre>
  ),
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={typeof src === "string" ? src : undefined}
      alt={alt ?? ""}
      className="my-6 h-auto max-w-full rounded-lg border border-kanglu-nude"
    />
  ),
  hr: () => <hr className="my-8 border-kanglu-nude" />,
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-kanglu-nude bg-white px-3 py-2 text-left font-semibold text-kanglu-bordo">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-kanglu-nude px-3 py-2">{children}</td>
  ),
};

/**
 * Corpo do artigo (markdown) renderizado com as cores da marca.
 *
 * Antes de renderizar, o `content` é quebrado nos marcadores `[[imagem:URL]]`
 * (imagens do corpo, Etapa 3): cada trecho de texto vai pro react-markdown; cada
 * marcador vira um `<figure>` injetado — o parser do remark nunca vê o marcador,
 * evitando colisão com link references do CommonMark. Sem marcador, é um único
 * trecho de texto (idêntico ao render anterior). `title` alimenta o alt.
 *
 * Ids das âncoras (índice do artigo): os headings h2/h3 ganham `id` a partir de
 * `headings` — a MESMA extração que alimenta o índice, então cada link do índice
 * cai na seção certa. Como o corpo é fatiado (imagens), cada trecho de texto
 * recebe só a fatia do índice que lhe pertence (`partEntries`), e um plugin
 * rehype (`rehypeHeadingIds`) grava os ids na ordem do documento. Se `headings`
 * não vier, é extraída aqui — o componente continua autossuficiente.
 */
export function ArticleMarkdown({
  content,
  title,
  headings,
}: {
  content: string;
  title?: string;
  headings?: TocEntry[];
}) {
  const parts = splitContentByImageMarker(content);
  const toc = headings ?? extractHeadings(content);

  // Quantos headings há em cada trecho (imagens não têm). Contar por trecho é
  // seguro: os marcadores de imagem ficam ENTRE blocos, nunca dentro de um bloco
  // de código, então o estado de "cerca aberta" nunca cruza a fronteira de um
  // trecho — a contagem por trecho soma exatamente a extração global.
  const counts = parts.map((part) =>
    part.type === "text" ? extractHeadings(part.value).length : 0,
  );

  // Fatia o índice por trecho, na ordem do documento, sem contador mutável no
  // render (React Compiler): o início de cada trecho é a soma das contagens
  // anteriores. Trechos pequenos → custo desprezível.
  const partEntries = parts.map((_, i) => {
    const start = counts.slice(0, i).reduce((sum, n) => sum + n, 0);
    return toc.slice(start, start + counts[i]);
  });

  return (
    <div className="leading-relaxed text-kanglu-bordo/90 lg:text-xl lg:leading-relaxed">
      {parts.map((part, i) =>
        part.type === "text" ? (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeHeadingIds, partEntries[i]]]}
            components={components}
          >
            {part.value}
          </ReactMarkdown>
        ) : (
          <figure key={i} className="my-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={part.url}
              alt={title ? `Imagem do artigo: ${title}` : "Imagem do artigo"}
              className="w-full rounded-xl border border-kanglu-nude object-cover"
            />
          </figure>
        ),
      )}
    </div>
  );
}
