"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminHeader } from "../_components/admin-header";
import { useToast } from "../_components/toast";
import { apiFetch, ApiError } from "../_lib/api";
import {
  LoadingMessages,
  GENERATE_AUTO_MESSAGES,
} from "../_components/loading-messages";
import type { AdminArticle } from "../_lib/types";

// Geração por TEMA com busca web automática. Diferente de /admin/generate: não
// há campo de URLs — o modelo busca as fontes na web, a rota desembrulha os
// redirects e filtra concorrentes. A chamada DEMORA (busca + geração), então o
// loading é explícito. Dois erros esperados viram mensagem amigável:
//   422 = nenhuma fonte não-concorrente encontrada → sugere geração manual.
//   502 = busca/geração indisponível.
// A página lê `?theme=` (pauta vinda de /admin/ideas) via useSearchParams, que
// no Next 16 precisa de um limite de Suspense. O default export só provê esse
// limite; a tela real vive em GenerateAutoForm.
export default function GenerateAutoPage() {
  return (
    <Suspense fallback={<GenerateAutoFallback />}>
      <GenerateAutoForm />
    </Suspense>
  );
}

function GenerateAutoForm() {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();

  // Pré-preenche o tema com a pauta escolhida em /admin/ideas, se houver. Só o
  // valor INICIAL vem da URL; depois o campo é livre (estado do usuário manda).
  const [theme, setTheme] = useState(() => searchParams.get("theme") ?? "");
  const [keywords, setKeywords] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!theme.trim()) return;
    setError(null);
    setLoading(true);

    const cleanKeywords = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    try {
      const data = await apiFetch<{ article: AdminArticle }>(
        "/api/articles/generate-auto",
        {
          method: "POST",
          body: {
            theme: theme.trim(),
            ...(cleanKeywords.length ? { keywords: cleanKeywords } : {}),
          },
        },
      );
      toast.success("Rascunho gerado. Revise antes de publicar.");
      router.push(`/admin/articles/${data.article.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        // Sem fontes adequadas: usa a mensagem do servidor (já é amigável).
        setError(err.message);
      } else if (err instanceof ApiError && err.status === 502) {
        setError(
          "Busca/geração indisponível no momento. Tente novamente em instantes ou use a geração manual com URLs.",
        );
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : "Não foi possível gerar o artigo.",
        );
      }
      setLoading(false);
    }
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
          Gerar por tema (busca automática)
        </h1>
        <p className="mt-1 text-sm text-kanglu-bordo/60">
          A IA busca fontes reais na web, filtra concorrentes e gera um rascunho.
          Você revisa antes de publicar.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-5 rounded-xl border border-kanglu-nude bg-white p-6"
        >
          <Field label="Tema" htmlFor="theme" required>
            <input
              id="theme"
              required
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="Ex.: Como reduzir devoluções em e-commerce de moda"
              className="w-full rounded-lg border border-kanglu-nude bg-kanglu-cream/40 px-3 py-2 text-kanglu-bordo outline-none focus:border-kanglu-orange"
            />
          </Field>

          <Field label="Palavras-chave (opcional)" htmlFor="keywords">
            <input
              id="keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="separadas por vírgula: logística, frete, troca"
              className="w-full rounded-lg border border-kanglu-nude bg-kanglu-cream/40 px-3 py-2 text-kanglu-bordo outline-none focus:border-kanglu-orange"
            />
          </Field>

          <p className="rounded-lg border border-kanglu-nude bg-kanglu-cream/40 px-3 py-2 text-xs text-kanglu-bordo/60">
            Sem campo de URLs: as fontes são buscadas automaticamente na web. Se
            só forem encontradas fontes de concorrentes, nada é gerado — use a
            geração manual com URLs.
          </p>

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
              disabled={loading || !theme.trim()}
              className="rounded-lg bg-kanglu-orange px-5 py-2.5 font-semibold text-white transition-colors hover:bg-kanglu-orange/90 disabled:opacity-60"
            >
              {loading
                ? "Buscando fontes e gerando… (pode levar um tempo)"
                : "Gerar rascunho"}
            </button>
            {loading && <LoadingMessages messages={GENERATE_AUTO_MESSAGES} />}
          </div>
        </form>
      </main>
    </div>
  );
}

// Fallback do Suspense enquanto o useSearchParams resolve. Mantém o header e um
// esqueleto simples pra não piscar a tela.
function GenerateAutoFallback() {
  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 sm:px-8">
        <div className="h-64 animate-pulse rounded-xl border border-kanglu-nude bg-white/40" />
      </main>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-kanglu-bordo"
      >
        {label}
        {required && <span className="text-kanglu-orange"> *</span>}
      </label>
      {children}
    </div>
  );
}
