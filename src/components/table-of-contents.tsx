import type { TocEntry } from "@/lib/toc";

// Índice do artigo ("Neste artigo:") — lista clicável dos headings que pula pra
// cada seção via âncora `#id`. Puro/Server Component (sem "use client"): roda no
// blog público e também dentro da prévia do editor, pelos mesmos motivos do
// ArticleBody. O scroll suave é 100% CSS (scroll-behavior no globals + scroll-mt
// nos headings), então não precisa de JS.
//
// Os `entries` vêm da MESMA extração (extractHeadings) que atribui os ids no
// corpo — por isso cada link aqui bate exatamente com a âncora da seção.

export function TableOfContents({
  entries,
  variant = "inline",
}: {
  entries: TocEntry[];
  // "inline": bloco no topo do corpo (mobile/tablet e prévia) — visual original.
  // "sidebar": card com mais presença pra coluna lateral sticky do desktop.
  variant?: "inline" | "sidebar";
}) {
  // Só faz sentido índice com 2+ seções — quem chama já filtra, mas guardamos
  // aqui também pra o componente ser seguro por conta própria.
  if (entries.length < 2) return null;

  // SIDEBAR (desktop): card branco com sombra suave e uma "espinha" de índice —
  // uma régua vertical à esquerda dos itens que se acende em laranja no hover,
  // reforçando a ideia de sumário (o elemento-assinatura, discreto).
  if (variant === "sidebar") {
    return (
      <nav
        aria-label="Índice do artigo"
        className="rounded-2xl border border-kanglu-nude bg-white p-6 shadow-sm"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-kanglu-orange">
          Neste artigo
        </p>
        <ul className="mt-5 space-y-0.5 border-l border-kanglu-nude">
          {entries.map((entry) => (
            <li key={entry.id}>
              <a
                href={`#${entry.id}`}
                className={`-ml-px block border-l-2 border-transparent py-1.5 text-sm leading-snug text-kanglu-bordo/70 transition-colors hover:border-kanglu-orange hover:text-kanglu-orange ${
                  entry.level === 3 ? "pl-8" : "pl-4 font-medium"
                }`}
              >
                {entry.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  // INLINE (mobile/tablet e prévia) — visual original, inalterado.
  return (
    <nav
      aria-label="Índice do artigo"
      className="rounded-xl border border-kanglu-nude bg-white/60 px-5 py-4"
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
