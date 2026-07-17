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
import {
  useCuratedModels,
  ModelSelect,
  ModelSelectSkeleton,
  EngineSelect,
  type SearchEngine,
} from "../_components/model-select";
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

  // Pré-preenche tema E palavras-chave com a pauta escolhida em /admin/ideas, se
  // houver. Só o valor INICIAL vem da URL; depois os campos são livres (o estado
  // do usuário manda). As keywords vêm por query param e são SANITIZADAS.
  const [theme, setTheme] = useState(() => searchParams.get("theme") ?? "");
  const [keywords, setKeywords] = useState(() =>
    sanitizeKeywordsParam(searchParams.get("keywords")),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { models, loading: modelsLoading } = useCuratedModels();
  // null = ainda não escolheu → cai no default do motor. Derivar evita
  // setState-em-effect e preserva a escolha do usuário.
  const [textModel, setTextModel] = useState<string | null>(null);
  const [imageModel, setImageModel] = useState<string | null>(null);

  // Motor de busca: Firecrawl (padrão) busca e o modelo escreve; Sonar busca e
  // escreve nativamente (é também o fallback). A escolha é validada no servidor.
  const [engine, setEngine] = useState<SearchEngine>("firecrawl");

  // O seletor de MODELO DE TEXTO se adapta ao MOTOR: Firecrawl mostra a lista
  // COMPLETA (inclui lite — o modelo só escreve); Sonar mostra a lista ROBUSTA
  // (sem lite — o modelo não-Sonar precisa acionar o plugin web). Default idem.
  const textList = engine === "sonar" ? models?.textWeb : models?.text;
  const textDefault =
    engine === "sonar" ? models?.defaults.textWeb : models?.defaults.text;
  const effTextModel = textModel ?? textDefault ?? "";
  const effImageModel = imageModel ?? models?.defaults.image ?? "";

  // Ao trocar de motor, se o modelo ESCOLHIDO à mão não existir na lista do novo
  // motor (ex.: um lite selecionado e o motor virou Sonar), reseta pro default
  // robusto (setTextModel(null)) — assim não fica um lite selecionado no Sonar.
  // Trocar pra Firecrawl nunca precisa resetar (a lista é superconjunto).
  function handleEngineChange(next: SearchEngine) {
    setEngine(next);
    if (next === "sonar" && textModel && models) {
      const robust = models.textWeb;
      if (!robust.some((m) => m.id === textModel)) setTextModel(null);
    }
  }

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
            searchEngine: engine,
            ...(effTextModel ? { textModel: effTextModel } : {}),
            ...(effImageModel ? { imageModel: effImageModel } : {}),
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

          {/* Motor de busca: Firecrawl (padrão) busca e o modelo de texto escreve;
              Sonar busca e escreve nativamente. Se o Firecrawl falhar, o servidor
              cai no Sonar automaticamente. Lista estática, sempre disponível. */}
          <EngineSelect
            value={engine}
            onChange={handleEngineChange}
            disabled={loading}
          />

          {/* Seletores de modelo (texto + imagem). Empilham no mobile. Se a lista
              falhar, somem e a geração usa o padrão do servidor (Sonar). */}
          {modelsLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <ModelSelectSkeleton label="Modelo de texto" />
              <ModelSelectSkeleton label="Modelo de imagem" />
            </div>
          ) : models ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <ModelSelect
                label="Modelo de texto"
                models={textList ?? models.text}
                value={effTextModel}
                onChange={setTextModel}
                disabled={loading}
              />
              <ModelSelect
                label="Modelo de imagem"
                models={models.image}
                value={effImageModel}
                onChange={setImageModel}
                disabled={loading}
              />
            </div>
          ) : null}

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

// Sanitiza as palavras-chave vindas por query param (?keywords=a, b, c): separa
// por vírgula, limpa cada uma, descarta vazias/duplicatas, limita quantidade e
// tamanho, e rejunta. Ausente/vazio → "" (o campo fica vazio, como sem pauta).
// O React já escapa o value no input; isto é para conter ruído/abuso no param.
function sanitizeKeywordsParam(raw: string | null): string {
  if (!raw) return "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const clean = part.trim().replace(/\s+/g, " ").slice(0, 40).trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= 8) break;
  }
  return out.join(", ");
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
