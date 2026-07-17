"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminHeader } from "../_components/admin-header";
import { apiFetch, ApiError } from "../_lib/api";
import { LoadingMessages, IDEAS_MESSAGES } from "../_components/loading-messages";

// Sugestão de pautas: a partir de um tema opcional, a IA propõe ~5 TÍTULOS de
// artigos (modelo barato). O editor edita inline, descarta ou pede outra leva,
// e manda a pauta escolhida para o gerador por tema (/admin/generate-auto) via
// query param `?theme=`. As pautas são efêmeras — nada é salvo no banco.

/** Uma pauta na lista. `id` é só de UI (chave estável para editar/descartar). */
interface Idea {
  id: string;
  title: string;
  /** Palavras-chave sugeridas pela IA (podem vir vazias). Levadas ao gerador. */
  keywords: string[];
}

export default function IdeasPage() {
  const router = useRouter();

  const [theme, setTheme] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Já sugeriu ao menos uma vez? Controla o texto do botão e o estado vazio.
  const [hasSuggested, setHasSuggested] = useState(false);
  // Contador monotônico para ids de UI estáveis (sem Math.random/Date).
  const [seq, setSeq] = useState(0);

  async function suggest() {
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{
        ideas: { title: string; keywords?: string[] }[];
      }>("/api/ideas", {
        method: "POST",
        body: { ...(theme.trim() ? { theme: theme.trim() } : {}) },
      });
      // Cada nova leva SUBSTITUI a lista (é "gerar novas sugestões").
      let n = seq;
      setIdeas(
        data.ideas.map((it) => ({
          id: `idea-${n++}`,
          title: it.title,
          keywords: it.keywords ?? [],
        })),
      );
      setSeq(n);
      setHasSuggested(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 502) {
        setError(
          "Sugestão indisponível no momento. Tente novamente em instantes.",
        );
      } else {
        setError(
          err instanceof ApiError ? err.message : "Não foi possível sugerir pautas.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function editIdea(id: string, title: string) {
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, title } : i)));
  }

  function discardIdea(id: string) {
    setIdeas((prev) => prev.filter((i) => i.id !== id));
  }

  // Manda a pauta para o gerador por tema, pré-preenchendo Tema E palavras-chave
  // por query param. Ambos chegam editáveis — é sugestão, não imposição. Se a
  // pauta não trouxer keywords, o param sai fora e o campo fica vazio como hoje.
  function generateFrom(idea: Idea) {
    const params = new URLSearchParams({ theme: idea.title });
    if (idea.keywords.length) params.set("keywords", idea.keywords.join(", "));
    router.push(`/admin/generate-auto?${params.toString()}`);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader />

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 sm:px-8">
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className="text-sm font-medium text-kanglu-orange hover:underline"
        >
          ← Voltar ao painel
        </button>

        <h1 className="mt-4 font-heading text-2xl font-bold text-kanglu-bordo">
          Sugerir pautas
        </h1>
        <p className="mt-1 text-sm text-kanglu-bordo/60">
          A IA sugere títulos de artigos no nicho da Kanglu. Edite, descarte e
          mande a escolhida para a geração por tema.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading) suggest();
          }}
          className="mt-6 space-y-4 rounded-xl border border-kanglu-nude bg-white p-6"
        >
          <div>
            <label
              htmlFor="theme"
              className="mb-1 block text-sm font-medium text-kanglu-bordo"
            >
              Tema / direção{" "}
              <span className="font-normal text-kanglu-bordo/50">(opcional)</span>
            </label>
            <input
              id="theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="Ex.: estratégias de frete — deixe vazio para pautas gerais do nicho"
              className="w-full rounded-lg border border-kanglu-nude bg-kanglu-cream/40 px-3 py-2 text-kanglu-bordo outline-none focus:border-kanglu-orange"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-kanglu-orange px-5 py-2.5 font-semibold text-white transition-colors hover:bg-kanglu-orange/90 disabled:opacity-60"
            >
              {loading
                ? "Sugerindo…"
                : hasSuggested
                  ? "Gerar novas sugestões"
                  : "Sugerir pautas"}
            </button>
            {loading && <LoadingMessages messages={IDEAS_MESSAGES} />}
          </div>
        </form>

        {/* Lista de pautas. Só aparece depois da primeira sugestão. */}
        {hasSuggested && !loading && (
          <section className="mt-6">
            {ideas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-kanglu-nude px-4 py-8 text-center text-sm text-kanglu-bordo/50">
                Nenhuma pauta na lista. Clique em “Gerar novas sugestões” para
                pedir outra leva.
              </p>
            ) : (
              <ul className="space-y-3">
                {ideas.map((idea) => (
                  <IdeaRow
                    key={idea.id}
                    idea={idea}
                    onEdit={editIdea}
                    onDiscard={discardIdea}
                    onGenerate={generateFrom}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function IdeaRow({
  idea,
  onEdit,
  onDiscard,
  onGenerate,
}: {
  idea: Idea;
  onEdit: (id: string, title: string) => void;
  onDiscard: (id: string) => void;
  onGenerate: (idea: Idea) => void;
}) {
  const [editing, setEditing] = useState(false);
  // Rascunho local enquanto edita; só confirma no "Salvar" (ou Enter).
  const [draft, setDraft] = useState(idea.title);

  function startEdit() {
    setDraft(idea.title);
    setEditing(true);
  }

  function save() {
    const clean = draft.trim();
    if (clean) onEdit(idea.id, clean);
    setEditing(false);
  }

  return (
    <li className="rounded-xl border border-kanglu-nude bg-white p-4">
      {editing ? (
        <div className="flex flex-col gap-3">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") {
                setEditing(false);
              }
            }}
            className="w-full rounded-lg border border-kanglu-nude bg-kanglu-cream/40 px-3 py-2 text-kanglu-bordo outline-none focus:border-kanglu-orange"
          />
          <div className="flex gap-2">
            <ActionBtn primary onClick={save} disabled={!draft.trim()}>
              Salvar
            </ActionBtn>
            <ActionBtn onClick={() => setEditing(false)}>Cancelar</ActionBtn>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-sm font-semibold text-kanglu-bordo">
            {idea.title}
          </h3>
          {idea.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {idea.keywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded-full bg-kanglu-cream px-2 py-0.5 text-[11px] text-kanglu-bordo/70"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <ActionBtn primary onClick={() => onGenerate(idea)}>
              Gerar artigo →
            </ActionBtn>
            <ActionBtn onClick={startEdit}>Editar</ActionBtn>
            <ActionBtn danger onClick={() => onDiscard(idea.id)}>
              Descartar
            </ActionBtn>
          </div>
        </div>
      )}
    </li>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  primary,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
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
      className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${style}`}
    >
      {children}
    </button>
  );
}
