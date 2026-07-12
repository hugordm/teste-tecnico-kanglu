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

// Data + hora curtas ("12/07 14:30"), no fuso local do navegador — usado no
// badge de agendamento. O ISO é UTC; o Intl converte para o horário local.
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateTimeFmt.format(d);
}

/**
 * Um artigo está "agendado" quando está publicado mas com publishAt no futuro:
 * já passou pelo portão de publicação, porém ainda invisível ao público até a
 * hora marcada. Comparação em UTC (Date.parse do ISO vs. Date.now()).
 */
export function isScheduled(article: {
  status: ArticleStatus;
  publishAt: string | null;
}): boolean {
  if (article.status !== "published" || !article.publishAt) return false;
  const t = Date.parse(article.publishAt);
  return !Number.isNaN(t) && t > Date.now();
}
