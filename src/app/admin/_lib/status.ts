import type { ArticleStatus } from "./types";

// Metadados de exibição dos status, num único lugar (usado pelo badge, pelas
// colunas do kanban e pelo editor). Cores discretas — o laranja da marca fica
// reservado para as AÇÕES, não para rótulos de estado.
export const STATUS_META: Record<
  ArticleStatus,
  { label: string; badge: string }
> = {
  draft: {
    label: "Rascunho",
    badge: "bg-kanglu-nude/40 text-kanglu-bordo",
  },
  in_review: {
    label: "Em revisão",
    badge: "bg-amber-100 text-amber-800",
  },
  published: {
    label: "Publicado",
    badge: "bg-emerald-100 text-emerald-800",
  },
  archived: {
    label: "Arquivado",
    badge: "bg-zinc-200 text-zinc-600",
  },
};

// Formatação de data pt-BR reutilizada nas telas do admin.
const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}
