"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminHeader } from "../_components/admin-header";
import { useToast } from "../_components/toast";
import { apiFetch, ApiError } from "../_lib/api";
import {
  LoadingMessages,
  GENERATE_URLS_MESSAGES,
} from "../_components/loading-messages";
import type { AdminArticle } from "../_lib/types";

// Geração por IA. A chamada pode DEMORAR (extrai URLs + chama o modelo), então
// o loading é explícito e o texto avisa. Erro 502 = geração indisponível: vira
// mensagem amigável sugerindo criar manual, sem quebrar a tela.
export default function GeneratePage() {
  const router = useRouter();
  const toast = useToast();

  const [theme, setTheme] = useState("");
  const [keywords, setKeywords] = useState("");
  // URLs como lista de linhas — o usuário adiciona/remove campos.
  const [urls, setUrls] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateUrl(index: number, value: string) {
    setUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }
  function addUrl() {
    setUrls((prev) => [...prev, ""]);
  }
  function removeUrl(index: number) {
    setUrls((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!theme.trim()) return;
    setError(null);
    setLoading(true);

    // Limpa entradas vazias e monta o payload no shape que a rota espera.
    const cleanKeywords = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);

    try {
      const data = await apiFetch<{ article: AdminArticle }>(
        "/api/articles/generate",
        {
          method: "POST",
          body: {
            theme: theme.trim(),
            ...(cleanKeywords.length ? { keywords: cleanKeywords } : {}),
            ...(cleanUrls.length ? { urls: cleanUrls } : {}),
          },
        },
      );
      toast.success("Rascunho gerado. Revise antes de publicar.");
      router.push(`/admin/articles/${data.article.id}`);
    } catch (err) {
      // 502: falha na IA — mensagem amigável e caminho alternativo.
      if (err instanceof ApiError && err.status === 502) {
        setError(
          "Geração indisponível no momento. Tente novamente em instantes ou crie o artigo manualmente.",
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
          Gerar artigo com IA
        </h1>
        <p className="mt-1 text-sm text-kanglu-bordo/60">
          A IA cria um rascunho a partir do tema e das fontes. Nada é publicado
          automaticamente — você revisa antes.
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

          <div>
            <span className="mb-1 block text-sm font-medium text-kanglu-bordo">
              Fontes / URLs (opcional)
            </span>
            <p className="mb-2 text-xs text-kanglu-bordo/50">
              A IA usa o conteúdo destas páginas como base factual.
            </p>
            <div className="space-y-2">
              {urls.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => updateUrl(i, e.target.value)}
                    placeholder="https://exemplo.com/artigo"
                    className="w-full rounded-lg border border-kanglu-nude bg-kanglu-cream/40 px-3 py-2 text-sm text-kanglu-bordo outline-none focus:border-kanglu-orange"
                  />
                  {urls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeUrl(i)}
                      className="shrink-0 rounded-lg border border-kanglu-nude px-3 text-kanglu-bordo/60 hover:bg-kanglu-cream"
                      aria-label="Remover URL"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addUrl}
              className="mt-2 text-sm font-medium text-kanglu-orange hover:underline"
            >
              + Adicionar URL
            </button>
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
              disabled={loading || !theme.trim()}
              className="rounded-lg bg-kanglu-orange px-5 py-2.5 font-semibold text-white transition-colors hover:bg-kanglu-orange/90 disabled:opacity-60"
            >
              {loading ? "Gerando… (pode levar alguns segundos)" : "Gerar rascunho"}
            </button>
            {loading && <LoadingMessages messages={GENERATE_URLS_MESSAGES} />}
          </div>
        </form>
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
