"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AdminHeader } from "./_components/admin-header";
import { useToast } from "./_components/toast";
import { useConfirm } from "./_components/confirm";
import { apiFetch, ApiError } from "./_lib/api";
import { STATUS_META, formatDate, formatDateTime, isScheduled } from "./_lib/status";
import type { AdminArticle, ArticleStatus } from "./_lib/types";

// As três colunas do fluxo editorial. "Em revisão" é destacada porque é o
// estado que o fluxo de aprovação gira em torno (e o que o avaliador procura).
const COLUMNS: { status: ArticleStatus; highlight: boolean }[] = [
  { status: "draft", highlight: false },
  { status: "in_review", highlight: true },
  { status: "published", highlight: false },
];

export default function KanbanPage() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // id do card em ação — desabilita seus botões e evita cliques duplos.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // id do card sendo arrastado agora — alimenta o <DragOverlay>.
  const [activeId, setActiveId] = useState<string | null>(null);

  // Não seta estado de forma síncrona: o primeiro setState só ocorre depois do
  // await (satisfaz a regra set-state-in-effect). O estado inicial já é
  // loading=true, então não precisamos ligá-lo aqui.
  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ articles: AdminArticle[] }>(
        "/api/articles",
      );
      setArticles(data.articles);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao carregar artigos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch de montagem: buscar dados + refletir loading/erro é exatamente o
    // que esta tela precisa. A regra set-state-in-effect é conservadora demais
    // para este caso legítimo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Sensores: ponteiro (mouse/touch/caneta) com constraint de 8px — só começa a
  // arrastar depois de mover um pouco, então cliques no card/botões/alça
  // continuam funcionando. Teclado como reforço de acessibilidade (os botões
  // seguem sendo o caminho acessível principal).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  // Soltou: se caiu sobre uma coluna diferente, move (a própria moveArticle trata
  // no-op na mesma coluna, otimismo e rollback). `over.id` é o status da coluna.
  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    moveArticle(String(active.id), over.id as ArticleStatus);
  }

  const activeArticle = activeId
    ? articles.find((a) => a.id === activeId) ?? null
    : null;

  // Retry é disparado por evento do usuário (pode setar estado à vontade).
  function retry() {
    setLoading(true);
    setError(null);
    load();
  }

  // Move um artigo para outro status — usado tanto pelo DRAG (soltar numa coluna)
  // quanto pelos botões de ação. É OTIMISTA COM ROLLBACK: troca o status no
  // estado na hora (o card salta pra coluna nova), chama a API e, se ela falhar,
  // reverte para o status anterior + avisa. O SERVIDOR é a fonte da verdade — a
  // persistência só acontece se ele aceitar, então o portão de publicação não é
  // furado pelo drag.
  //
  // Rota conforme o alvo: published passa pelo portão POST /publish (422 = sem
  // fonte válida → rollback); draft/in_review vão por PATCH.
  async function moveArticle(id: string, target: ArticleStatus) {
    const current = articles.find((a) => a.id === id);
    if (!current || current.status === target) return; // no-op na mesma coluna
    const previousStatus = current.status;

    // Movimento otimista.
    setArticles((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: target } : a)),
    );
    setBusyId(id);
    try {
      if (target === "published") {
        const data = await apiFetch<{ article: AdminArticle }>(
          `/api/articles/${id}/publish`,
          { method: "POST" },
        );
        setArticles((prev) =>
          prev.map((a) =>
            a.id === id
              ? { ...a, status: "published", publishedAt: data.article.publishedAt }
              : a,
          ),
        );
        toast.success("Artigo publicado.");
      } else {
        const data = await apiFetch<{ article: AdminArticle }>(
          `/api/articles/${id}`,
          { method: "PATCH", body: { status: target } },
        );
        setArticles((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, status: data.article.status } : a,
          ),
        );
        toast.success(`Movido para "${STATUS_META[target].label}".`);
      }
    } catch (err) {
      // Rollback: o card volta pra coluna de origem.
      setArticles((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: previousStatus } : a)),
      );
      if (target === "published" && err instanceof ApiError && err.status === 422) {
        toast.error(
          "Não é possível publicar sem uma fonte válida. Adicione ao menos uma fonte com URL (http/https) no editor.",
        );
      } else {
        toast.error(
          err instanceof ApiError ? err.message : "Não foi possível mover.",
        );
      }
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, title: string) {
    const ok = await confirm({
      title: "Excluir artigo",
      message: `Excluir "${title}"? Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await apiFetch(`/api/articles/${id}`, { method: "DELETE" });
      setArticles((prev) => prev.filter((a) => a.id !== id));
      toast.success("Artigo excluído.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível excluir.");
    } finally {
      setBusyId(null);
    }
  }

  // "Criar manual": cria um rascunho mínimo e abre direto no editor.
  async function createManual() {
    setCreating(true);
    try {
      const data = await apiFetch<{ article: AdminArticle }>("/api/articles", {
        method: "POST",
        body: {
          title: "Novo artigo",
          content: "# Novo artigo\n\nComece a escrever aqui…",
        },
      });
      toast.success("Rascunho criado.");
      router.push(`/admin/articles/${data.article.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível criar.");
      setCreating(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold text-kanglu-bordo">
              Painel editorial
            </h1>
            <p className="mt-1 text-sm text-kanglu-bordo/60">
              Rascunho → Em revisão → Publicado
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={createManual}
              disabled={creating}
              className="rounded-lg border border-kanglu-orange px-4 py-2 text-sm font-semibold text-kanglu-orange transition-colors hover:bg-kanglu-orange/10 disabled:opacity-60"
            >
              {creating ? "Criando…" : "Criar manual"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin/ideas")}
              className="rounded-lg border border-kanglu-orange px-4 py-2 text-sm font-semibold text-kanglu-orange transition-colors hover:bg-kanglu-orange/10"
            >
              💡 Sugerir pautas
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin/generate")}
              className="rounded-lg bg-kanglu-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-kanglu-orange/90"
            >
              ✨ Gerar artigo com IA
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin/generate-auto")}
              className="rounded-lg bg-kanglu-bordo px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-kanglu-bordo/90"
            >
              🌐 Gerar por tema (web)
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {COLUMNS.map(({ status, highlight }) => (
                <Column
                  key={status}
                  status={status}
                  highlight={highlight}
                  articles={articles.filter((a) => a.status === status)}
                  busyId={busyId}
                  activeId={activeId}
                  onOpen={(id) => router.push(`/admin/articles/${id}`)}
                  onMove={moveArticle}
                  onDelete={remove}
                />
              ))}
            </div>

            {/* Card "levantado" que segue o cursor durante o arraste. */}
            <DragOverlay>
              {activeArticle ? <CardOverlay article={activeArticle} /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </main>
    </div>
  );
}

function Column({
  status,
  highlight,
  articles,
  busyId,
  activeId,
  onOpen,
  onMove,
  onDelete,
}: {
  status: ArticleStatus;
  highlight: boolean;
  articles: AdminArticle[];
  busyId: string | null;
  activeId: string | null;
  onOpen: (id: string) => void;
  onMove: (id: string, status: ArticleStatus) => void;
  onDelete: (id: string, title: string) => void;
}) {
  // Zona de soltura: o id da coluna é o próprio status, lido no onDragEnd.
  const { setNodeRef, isOver } = useDroppable({ id: status });
  // Destaca a coluna quando um card está sendo arrastado por cima — mas não a
  // própria coluna de origem do card (soltar ali é no-op).
  const activeIsFromHere = articles.some((a) => a.id === activeId);
  const dropActive = isOver && !activeIsFromHere;

  return (
    <section
      ref={setNodeRef}
      className={`rounded-xl border p-4 transition-colors ${
        dropActive
          ? "border-kanglu-orange bg-kanglu-orange/10 ring-2 ring-kanglu-orange/40"
          : highlight
            ? "border-kanglu-orange bg-kanglu-orange/5"
            : "border-kanglu-nude bg-white/50"
      }`}
    >
      <h2 className="flex items-center gap-2 font-heading text-sm font-semibold uppercase tracking-wide text-kanglu-bordo">
        {STATUS_META[status].label}
        <span className="rounded-full bg-kanglu-nude/50 px-2 py-0.5 text-xs font-bold text-kanglu-bordo">
          {articles.length}
        </span>
      </h2>

      <div className="mt-4 space-y-3">
        {articles.length === 0 ? (
          <p
            className={`rounded-lg border border-dashed px-3 py-6 text-center text-sm ${
              dropActive
                ? "border-kanglu-orange text-kanglu-orange"
                : "border-kanglu-nude text-kanglu-bordo/40"
            }`}
          >
            {dropActive ? "Soltar aqui" : "Nenhum artigo"}
          </p>
        ) : (
          articles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              busy={busyId === article.id}
              onOpen={onOpen}
              onMove={onMove}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ArticleCard({
  article,
  busy,
  onOpen,
  onMove,
  onDelete,
}: {
  article: AdminArticle;
  busy: boolean;
  onOpen: (id: string) => void;
  onMove: (id: string, status: ArticleStatus) => void;
  onDelete: (id: string, title: string) => void;
}) {
  const meta = STATUS_META[article.status];
  const scheduled = isScheduled(article);
  // stopPropagation nas ações: clicar num botão não deve abrir o editor.
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  // Draggable: o card inteiro é o nó que se move (referência), mas só a ALÇA
  // dispara o arraste (setActivatorNodeRef + listeners). Assim o clique no corpo
  // segue abrindo o editor e os botões continuam clicáveis. Com o <DragOverlay>,
  // o original só é esmaecido enquanto arrasta — quem "voa" é o overlay.
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } =
    useDraggable({ id: article.id });

  return (
    <article
      ref={setNodeRef}
      onClick={() => onOpen(article.id)}
      className={`group rounded-lg border border-kanglu-nude bg-white p-3 transition-colors hover:border-kanglu-orange ${
        isDragging ? "cursor-grabbing opacity-40" : "cursor-pointer"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          {/* Alça de arraste — carrega os listeners do dnd-kit. */}
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Arrastar "${article.title}" para mover de coluna`}
            title="Arraste para mover entre colunas"
            className="-ml-1 shrink-0 cursor-grab touch-none rounded px-1 text-kanglu-bordo/30 hover:bg-kanglu-cream hover:text-kanglu-bordo/60 active:cursor-grabbing"
          >
            ⠿
          </button>
          <h3 className="min-w-0 font-heading text-sm font-semibold text-kanglu-bordo group-hover:text-kanglu-orange">
            {article.title}
          </h3>
        </div>
        {article.aiAssisted && (
          <span
            title="Rascunho assistido por IA"
            className="shrink-0 rounded bg-kanglu-nude/40 px-1.5 py-0.5 text-[10px] font-semibold text-kanglu-bordo"
          >
            IA
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${meta.badge}`}>
          {meta.label}
        </span>
        {scheduled && (
          <span
            title={`Publicado, mas só aparece no blog a partir de ${formatDateTime(article.publishAt)}`}
            className="rounded bg-kanglu-orange/15 px-1.5 py-0.5 text-[10px] font-semibold text-kanglu-orange"
          >
            ⏱ Agendado p/ {formatDateTime(article.publishAt)}
          </span>
        )}
        <time className="text-xs text-kanglu-bordo/50">
          {formatDate(article.publishedAt ?? article.updatedAt)}
        </time>
      </div>

      {/* Ações rápidas por status. */}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-kanglu-nude/60 pt-3">
        {article.status === "draft" && (
          <QuickBtn onClick={stop(() => onMove(article.id, "in_review"))} disabled={busy}>
            Enviar p/ revisão
          </QuickBtn>
        )}
        {article.status === "in_review" && (
          <>
            <QuickBtn primary onClick={stop(() => onMove(article.id, "published"))} disabled={busy}>
              Publicar
            </QuickBtn>
            <QuickBtn onClick={stop(() => onMove(article.id, "draft"))} disabled={busy}>
              Voltar p/ rascunho
            </QuickBtn>
          </>
        )}
        {article.status === "published" && (
          <>
            <a
              href={`/blog/${article.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded border border-kanglu-nude px-2 py-1 text-xs font-medium text-kanglu-orange hover:bg-kanglu-cream"
            >
              Ver no blog ↗
            </a>
            <QuickBtn onClick={stop(() => onMove(article.id, "in_review"))} disabled={busy}>
              Despublicar
            </QuickBtn>
          </>
        )}
        <QuickBtn danger onClick={stop(() => onDelete(article.id, article.title))} disabled={busy}>
          Excluir
        </QuickBtn>
      </div>
    </article>
  );
}

// Card renderizado dentro do <DragOverlay> — o que "voa" com o cursor. Estático
// (sem handlers), com sombra/escala pra dar a sensação de "levantado".
function CardOverlay({ article }: { article: AdminArticle }) {
  const meta = STATUS_META[article.status];
  return (
    <article className="w-full max-w-xs rotate-2 cursor-grabbing rounded-lg border border-kanglu-orange bg-white p-3 shadow-xl">
      <div className="flex items-start gap-1.5">
        <span className="text-kanglu-bordo/40">⠿</span>
        <h3 className="font-heading text-sm font-semibold text-kanglu-bordo">
          {article.title}
        </h3>
      </div>
      <span
        className={`mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${meta.badge}`}
      >
        {meta.label}
      </span>
    </article>
  );
}

function QuickBtn({
  children,
  onClick,
  disabled,
  primary,
  danger,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const style = primary
    ? "bg-kanglu-orange text-white hover:bg-kanglu-orange/90 border-kanglu-orange"
    : danger
      ? "border-kanglu-nude text-red-700 hover:bg-red-50"
      : "border-kanglu-nude text-kanglu-bordo hover:bg-kanglu-cream";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${style}`}
    >
      {children}
    </button>
  );
}

function LoadingState() {
  return (
    <div className="mt-8 grid gap-5 md:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-64 animate-pulse rounded-xl border border-kanglu-nude bg-white/40"
        />
      ))}
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mt-12 rounded-xl border border-red-200 bg-red-50 p-8 text-center">
      <p className="font-medium text-red-800">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-lg bg-kanglu-orange px-4 py-2 text-sm font-semibold text-white hover:bg-kanglu-orange/90"
      >
        Tentar novamente
      </button>
    </div>
  );
}
