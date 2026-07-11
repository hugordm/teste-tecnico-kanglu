import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Renderer de markdown compartilhado entre o blog público e o PREVIEW do editor
// admin — é a mesma aparência que o leitor final verá. Sem "use client": o
// componente é puro, então roda como Server Component no blog (bom pra SEO) e
// também dentro do Client Component do editor.

/**
 * Mapeamento dos elementos markdown para versões estilizadas na marca:
 * títulos em bordô (Poppins), links em laranja, tipografia de leitura
 * confortável. Definido no módulo para não recriar a cada render.
 */
const components: Components = {
  h2: ({ children }) => (
    <h2 className="mt-10 mb-3 font-heading text-2xl font-semibold text-kanglu-bordo">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-8 mb-2 font-heading text-xl font-semibold text-kanglu-bordo">
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

/** Corpo do artigo (markdown) renderizado com as cores da marca. */
export function ArticleMarkdown({ content }: { content: string }) {
  return (
    <div className="leading-relaxed text-kanglu-bordo/90">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
