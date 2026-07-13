import type { TocEntry } from "@/lib/toc";

// Índice do artigo ("Neste artigo:") — lista clicável dos headings que pula pra
// cada seção via âncora `#id`. Puro/Server Component (sem "use client"): roda no
// blog público e também dentro da prévia do editor, pelos mesmos motivos do
// ArticleBody. O scroll suave é 100% CSS (scroll-behavior no globals + scroll-mt
// nos headings), então não precisa de JS.
//
// Os `entries` vêm da MESMA extração (extractHeadings) que atribui os ids no
// corpo — por isso cada link aqui bate exatamente com a âncora da seção.

export function TableOfContents({ entries }: { entries: TocEntry[] }) {
  // Só faz sentido índice com 2+ seções — quem chama já filtra, mas guardamos
  // aqui também pra o componente ser seguro por conta própria.
  if (entries.length < 2) return null;

  return (
    <nav
      aria-label="Índice do artigo"
      className="mt-8 rounded-xl border border-kanglu-nude bg-white/60 px-5 py-4"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-kanglu-orange">
        Neste artigo
      </p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {entries.map((entry) => (
          <li
            key={entry.id}
            // h3 recuam pra sugerir a hierarquia sob o h2 anterior.
            className={entry.level === 3 ? "pl-4" : undefined}
          >
            <a
              href={`#${entry.id}`}
              className="text-kanglu-bordo/70 underline decoration-transparent underline-offset-2 transition-colors hover:text-kanglu-orange hover:decoration-kanglu-orange/40"
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
