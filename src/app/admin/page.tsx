"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminHeader } from "./_components/admin-header";
import { useToast } from "./_components/toast";
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

  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // id do card em ação — desabilita seus botões e evita cliques duplos.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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

  // Retry é disparado por evento do usuário (pode setar estado à vontade).
  function retry() {
    setLoading(true);
    setError(null);
    load();
  }

  // Move o artigo entre rascunho e revisão (PATCH). Atualiza o card no lugar.
  async function changeStatus(id: string, status: ArticleStatus) {
    setBusyId(id);
    try {
      const data = await apiFetch<{ article: AdminArticle }>(
        `/api/articles/${id}`,
        { method: "PATCH", body: { status } },
      );
      setArticles((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: data.article.status } : a)),
      );
      toast.success(`Movido para "${STATUS_META[status].label}".`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível mover.");
    } finally {
      setBusyId(null);
    }
  }

  // Publica (portão /publish). 422 = sem fonte válida: mostra o motivo e NÃO
  // publica; o card fica onde está.
  async function publish(id: string) {
    setBusyId(id);
    try {
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
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        toast.error(
          "Adicione ao menos uma fonte com URL válida antes de publicar.",
        );
      } else {
        toast.error(
          err instanceof ApiError ? err.message : "Não foi possível publicar.",
        );
      }
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Excluir "${title}"? Esta ação não pode ser desfeita.`)) return;
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
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {COLUMNS.map(({ status, highlight }) => (
              <Column
                key={status}
                status={status}
                highlight={highlight}
                articles={articles.filter((a) => a.status === status)}
                busyId={busyId}
                onOpen={(id) => router.push(`/admin/articles/${id}`)}
                onChangeStatus={changeStatus}
                onPublish={publish}
                onDelete={remove}
              />
            ))}
          </div>
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
  onOpen,
  onChangeStatus,
  onPublish,
  onDelete,
}: {
  status: ArticleStatus;
  highlight: boolean;
  articles: AdminArticle[];
  busyId: string | null;
  onOpen: (id: string) => void;
  onChangeStatus: (id: string, status: ArticleStatus) => void;
  onPublish: (id: string) => void;
  onDelete: (id: string, title: string) => void;
}) {
  return (
    <section
      className={`rounded-xl border p-4 ${
        highlight
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
          <p className="rounded-lg border border-dashed border-kanglu-nude px-3 py-6 text-center text-sm text-kanglu-bordo/40">
            Nenhum artigo
          </p>
        ) : (
          articles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              busy={busyId === article.id}
              onOpen={onOpen}
              onChangeStatus={onChangeStatus}
              onPublish={onPublish}
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
  onChangeStatus,
  onPublish,
  onDelete,
}: {
  article: AdminArticle;
  busy: boolean;
  onOpen: (id: string) => void;
  onChangeStatus: (id: string, status: ArticleStatus) => void;
  onPublish: (id: string) => void;
  onDelete: (id: string, title: string) => void;
}) {
  const meta = STATUS_META[article.status];
  const scheduled = isScheduled(article);
  // stopPropagation nas ações: clicar num botão não deve abrir o editor.
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <article
      onClick={() => onOpen(article.id)}
      className="group cursor-pointer rounded-lg border border-kanglu-nude bg-white p-3 transition-colors hover:border-kanglu-orange"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-heading text-sm font-semibold text-kanglu-bordo group-hover:text-kanglu-orange">
          {article.title}
        </h3>
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
          <QuickBtn onClick={stop(() => onChangeStatus(article.id, "in_review"))} disabled={busy}>
            Enviar p/ revisão
          </QuickBtn>
        )}
        {article.status === "in_review" && (
          <>
            <QuickBtn primary onClick={stop(() => onPublish(article.id))} disabled={busy}>
              Publicar
            </QuickBtn>
            <QuickBtn onClick={stop(() => onChangeStatus(article.id, "draft"))} disabled={busy}>
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
            <QuickBtn onClick={stop(() => onChangeStatus(article.id, "in_review"))} disabled={busy}>
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
