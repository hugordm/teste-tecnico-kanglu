"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminHeader } from "../../_components/admin-header";
import { useToast } from "../../_components/toast";
import { apiFetch, ApiError } from "../../_lib/api";
import { STATUS_META, formatDateTime, isScheduled } from "../../_lib/status";
import type { AdminArticle, AdminSource } from "../../_lib/types";
import { ArticleMarkdown } from "@/components/article-markdown";

// Estado editável do formulário — espelho local do artigo. Datas/slug/status
// vêm do artigo mas nem tudo é editável aqui (slug é derivado do título pela
// API; status published só via /publish).
type FormState = {
  title: string;
  excerpt: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  ogImage: string;
  workflowStatus: "draft" | "in_review"; // estados de workflow editáveis
  publishAt: string; // datetime-local ("YYYY-MM-DDTHH:mm"), vazio = sem agendamento
};

type SourceRow = { title: string; url: string };

const isHttpUrl = (v: string) => /^https?:\/\/\S+$/i.test(v.trim());
const toNull = (s: string) => (s.trim() === "" ? null : s.trim());

// ISO (UTC, vindo da API) -> valor do <input type="datetime-local">, que é
// sempre HORÁRIO LOCAL. Usamos os getters locais do Date, então o navegador do
// editor vê a hora no seu próprio fuso. Vazio se não houver agendamento.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Valor do datetime-local (horário LOCAL, sem fuso) -> ISO em UTC para gravar.
// `new Date("2026-07-12T14:30")` é interpretado como hora local pelo runtime,
// e toISOString() a normaliza para UTC — o fuso é resolvido aqui, uma vez.
function localInputToIso(local: string): string | null {
  const v = local.trim();
  if (v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const [article, setArticle] = useState<AdminArticle | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [preview, setPreview] = useState(false);

  // Sem setState síncrono: o primeiro setState só acontece após o await (regra
  // set-state-in-effect). Estado inicial já é loading=true / loadError=null.
  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ article: AdminArticle }>(
        `/api/articles/${id}`,
      );
      hydrate(data.article);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Falha ao carregar o artigo.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  function hydrate(a: AdminArticle) {
    setArticle(a);
    setForm({
      title: a.title,
      excerpt: a.excerpt ?? "",
      content: a.content,
      metaTitle: a.metaTitle ?? "",
      metaDescription: a.metaDescription ?? "",
      canonicalUrl: a.canonicalUrl ?? "",
      ogImage: a.ogImage ?? "",
      workflowStatus: a.status === "in_review" ? "in_review" : "draft",
      publishAt: isoToLocalInput(a.publishAt),
    });
    setSources(
      a.sources.map((s: AdminSource) => ({ title: s.title, url: s.url })),
    );
  }

  useEffect(() => {
    // Fetch de montagem do artigo — ver nota no painel sobre set-state-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  // Valida e monta o payload do PATCH. Devolve null (e mostra toast) se houver
  // fonte incompleta ou URL inválida — evita 400 do servidor por dado ruim.
  function buildPayload(): Record<string, unknown> | null {
    if (!form) return null;
    if (form.title.trim() === "") {
      toast.error("O título não pode ficar vazio.");
      return null;
    }
    const incomplete = sources.some(
      (s) => (s.title.trim() === "") !== (s.url.trim() === ""),
    );
    if (incomplete) {
      toast.error("Há fontes incompletas: preencha título e URL, ou remova a linha.");
      return null;
    }
    const badUrl = sources.some((s) => s.url.trim() !== "" && !isHttpUrl(s.url));
    if (badUrl) {
      toast.error("Há fonte com URL inválida (use http/https).");
      return null;
    }
    const cleanSources = sources
      .filter((s) => s.title.trim() !== "" && s.url.trim() !== "")
      .map((s) => ({ title: s.title.trim(), url: s.url.trim() }));

    return {
      title: form.title.trim(),
      content: form.content,
      excerpt: toNull(form.excerpt),
      metaTitle: toNull(form.metaTitle),
      metaDescription: toNull(form.metaDescription),
      canonicalUrl: toNull(form.canonicalUrl),
      ogImage: toNull(form.ogImage),
      status: form.workflowStatus,
      publishAt: localInputToIso(form.publishAt),
      sources: cleanSources,
    };
  }

  // Salva (PATCH) e re-hidrata com a resposta (slug/updatedAt novos). Devolve o
  // artigo salvo — reaproveitado pelo fluxo de publicar.
  async function save(): Promise<AdminArticle | null> {
    const payload = buildPayload();
    if (!payload) return null;
    setSaving(true);
    try {
      const data = await apiFetch<{ article: AdminArticle }>(
        `/api/articles/${id}`,
        { method: "PATCH", body: payload },
      );
      hydrate(data.article);
      toast.success("Alterações salvas.");
      return data.article;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  // Publicar: salva primeiro (garante que as fontes recém-adicionadas estejam
  // no banco, pois o portão /publish consulta o banco), depois publica.
  async function publish() {
    const saved = await save();
    if (!saved) return; // erro de validação/save já sinalizado
    setPublishing(true);
    try {
      const data = await apiFetch<{ article: AdminArticle }>(
        `/api/articles/${id}/publish`,
        { method: "POST" },
      );
      hydrate(data.article);
      toast.success("Artigo publicado.");
    } catch (err) {
      // 422 = portão: sem fonte válida. Mostra o motivo e NÃO publica.
      if (err instanceof ApiError && err.status === 422) {
        toast.error(
          "Publicação bloqueada: adicione ao menos uma fonte com URL válida (http/https).",
        );
      } else {
        toast.error(
          err instanceof ApiError ? err.message : "Não foi possível publicar.",
        );
      }
    } finally {
      setPublishing(false);
    }
  }

  async function remove() {
    if (!article) return;
    if (!confirm(`Excluir "${article.title}"? Esta ação não pode ser desfeita.`))
      return;
    setDeleting(true);
    try {
      await apiFetch(`/api/articles/${id}`, { method: "DELETE" });
      toast.success("Artigo excluído.");
      router.push("/admin");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível excluir.");
      setDeleting(false);
    }
  }

  // Gerar novamente: refaz content/excerpt reusando o mesmo pipeline de geração,
  // a partir do título + fontes atuais. Sobrescreve o conteúdo do rascunho —
  // por isso a confirmação. Re-hidrata com o resultado (descarta edições locais
  // não salvas do conteúdo, que é justamente o "substituir" combinado).
  async function regenerate() {
    if (!article) return;
    if (
      !confirm("Isso vai substituir o conteúdo atual do rascunho. Continuar?")
    )
      return;
    setRegenerating(true);
    try {
      const data = await apiFetch<{ article: AdminArticle }>(
        `/api/articles/${id}/regenerate`,
        { method: "POST" },
      );
      hydrate(data.article);
      toast.success("Conteúdo gerado novamente.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível gerar novamente.",
      );
    } finally {
      setRegenerating(false);
    }
  }

  // Gerar imagem: cria uma ilustração via IA, hospeda no Blob e salva a URL no
  // artigo (campo ogImage) + o crédito do modelo. Atualiza SÓ os campos de
  // imagem no estado local — preserva edições de conteúdo ainda não salvas.
  // Chamar de novo substitui a imagem. Não corrompe o artigo se falhar (502).
  async function generateImage() {
    if (!article) return;
    setGeneratingImage(true);
    try {
      const data = await apiFetch<{ article: AdminArticle }>(
        `/api/articles/${id}/generate-image`,
        { method: "POST" },
      );
      setArticle((prev) =>
        prev
          ? {
              ...prev,
              ogImage: data.article.ogImage,
              imageCredit: data.article.imageCredit,
            }
          : prev,
      );
      set("ogImage", data.article.ogImage ?? "");
      toast.success("Imagem gerada.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível gerar a imagem.",
      );
    } finally {
      setGeneratingImage(false);
    }
  }

  // --- Fontes ---
  function addSource() {
    setSources((prev) => [...prev, { title: "", url: "" }]);
  }
  function updateSource(i: number, key: keyof SourceRow, value: string) {
    setSources((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, [key]: value } : s)),
    );
  }
  function removeSource(i: number) {
    setSources((prev) => prev.filter((_, idx) => idx !== i));
  }

  if (loading) {
    return (
      <Shell>
        <div className="h-96 animate-pulse rounded-xl border border-kanglu-nude bg-white/40" />
      </Shell>
    );
  }
  if (loadError || !article || !form) {
    return (
      <Shell>
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="font-medium text-red-800">
            {loadError ?? "Artigo não encontrado."}
          </p>
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="mt-4 rounded-lg bg-kanglu-orange px-4 py-2 text-sm font-semibold text-white hover:bg-kanglu-orange/90"
          >
            Voltar ao painel
          </button>
        </div>
      </Shell>
    );
  }

  const meta = STATUS_META[article.status];
  const busy =
    saving || publishing || deleting || regenerating || generatingImage;
  const hasImage = isHttpUrl(form.ogImage);

  return (
    <Shell>
      {/* Barra superior: voltar, status, ações principais. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className="text-sm font-medium text-kanglu-orange hover:underline"
        >
          ← Voltar ao painel
        </button>
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-1 text-xs font-semibold ${meta.badge}`}>
            {meta.label}
          </span>
          {isScheduled(article) && (
            <span
              title="Publicado, mas só aparece no blog a partir da data agendada"
              className="rounded bg-kanglu-orange/15 px-2 py-1 text-xs font-semibold text-kanglu-orange"
            >
              ⏱ Agendado p/ {formatDateTime(article.publishAt)}
            </span>
          )}
          {article.aiAssisted && (
            <span className="rounded bg-kanglu-nude/40 px-2 py-1 text-xs font-semibold text-kanglu-bordo">
              Assistido por IA
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg border border-kanglu-orange px-4 py-2 text-sm font-semibold text-kanglu-orange transition-colors hover:bg-kanglu-orange/10 disabled:opacity-60"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          onClick={publish}
          disabled={busy || article.status === "published"}
          className="rounded-lg bg-kanglu-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-kanglu-orange/90 disabled:opacity-60"
          title={
            article.status === "published"
              ? "Já publicado"
              : "Salva e publica (exige ao menos uma fonte válida)"
          }
        >
          {publishing ? "Publicando…" : article.status === "published" ? "Publicado" : "Publicar"}
        </button>
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className="rounded-lg border border-kanglu-nude px-4 py-2 text-sm font-medium text-kanglu-bordo transition-colors hover:bg-kanglu-cream"
        >
          {preview ? "Editar" : "Prévia"}
        </button>
        {article.status === "draft" && (
          <button
            type="button"
            onClick={regenerate}
            disabled={busy}
            className="rounded-lg border border-kanglu-nude px-4 py-2 text-sm font-medium text-kanglu-bordo transition-colors hover:bg-kanglu-cream disabled:opacity-60"
            title="Refaz o conteúdo do rascunho a partir do título e das fontes atuais"
          >
            {regenerating ? "Gerando…" : "Gerar novamente"}
          </button>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="ml-auto rounded-lg border border-kanglu-nude px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60"
        >
          {deleting ? "Excluindo…" : "Excluir"}
        </button>
      </div>

      {preview ? (
        <PreviewPane title={form.title} content={form.content} />
      ) : (
        <div className="mt-6 space-y-6">
          {/* Estado de workflow */}
          <div className="rounded-xl border border-kanglu-nude bg-white p-4">
            <span className="mb-2 block text-sm font-medium text-kanglu-bordo">
              Estado do fluxo
            </span>
            <div className="inline-flex overflow-hidden rounded-lg border border-kanglu-nude">
              {(["draft", "in_review"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("workflowStatus", s)}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                    form.workflowStatus === s
                      ? "bg-kanglu-orange text-white"
                      : "bg-white text-kanglu-bordo hover:bg-kanglu-cream"
                  }`}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
            {article.status === "published" && (
              <p className="mt-2 text-xs text-kanglu-bordo/50">
                Este artigo está publicado. Salvar com outro estado o remove do ar.
              </p>
            )}
          </div>

          {/* Agendamento de publicação */}
          <Section title="Agendar publicação">
            <Field
              label="Aparece no blog a partir de (horário local)"
              htmlFor="publishAt"
            >
              <input
                id="publishAt"
                type="datetime-local"
                value={form.publishAt}
                onChange={(e) => set("publishAt", e.target.value)}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-kanglu-bordo/50">
                Deixe vazio para publicar imediatamente. Com uma data futura, ao
                publicar o artigo fica <strong>publicado</strong> mas só aparece
                no blog a partir dela — some da listagem e responde 404 até a
                hora, e passa a aparecer sozinho depois (sem cron). Gravado em
                UTC, exibido no seu fuso.
              </p>
            </Field>
            {form.publishAt.trim() !== "" && (
              <button
                type="button"
                onClick={() => set("publishAt", "")}
                className="text-sm font-medium text-kanglu-orange hover:underline"
              >
                Limpar agendamento
              </button>
            )}
          </Section>

          {/* Imagem ilustrativa (IA) */}
          <Section title="Imagem ilustrativa">
            <p className="text-xs text-kanglu-bordo/50">
              Gera uma imagem de topo via IA a partir do título. Aparece no topo
              do artigo publicado, com crédito do modelo. Opcional.
            </p>
            {hasImage && (
              <div className="mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.ogImage}
                  alt={`Ilustração do artigo: ${form.title}`}
                  className="w-full rounded-lg border border-kanglu-nude object-cover"
                />
                {article.imageCredit && (
                  <p className="mt-2 text-xs text-kanglu-bordo/50">
                    Crédito: {article.imageCredit}
                  </p>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={generateImage}
              disabled={busy}
              className="mt-3 rounded-lg border border-kanglu-orange px-4 py-2 text-sm font-semibold text-kanglu-orange transition-colors hover:bg-kanglu-orange/10 disabled:opacity-60"
              title="Gera uma ilustração por IA e a hospeda para uso no artigo"
            >
              {generatingImage
                ? "Gerando imagem…"
                : hasImage
                  ? "Gerar novamente"
                  : "Gerar imagem"}
            </button>
          </Section>

          {/* Conteúdo principal */}
          <Section title="Conteúdo">
            <Field label="Título" htmlFor="title">
              <input
                id="title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Slug (gerado a partir do título)" htmlFor="slug">
              <input
                id="slug"
                value={article.slug}
                readOnly
                className={`${inputCls} cursor-not-allowed text-kanglu-bordo/50`}
              />
              <p className="mt-1 text-xs text-kanglu-bordo/50">
                Atualizado automaticamente quando você muda o título e salva.
              </p>
            </Field>
            <Field label="Resumo (excerpt)" htmlFor="excerpt">
              <textarea
                id="excerpt"
                rows={2}
                value={form.excerpt}
                onChange={(e) => set("excerpt", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Conteúdo (Markdown)" htmlFor="content">
              <textarea
                id="content"
                rows={16}
                value={form.content}
                onChange={(e) => set("content", e.target.value)}
                className={`${inputCls} font-mono text-sm`}
              />
            </Field>
          </Section>

          {/* Fontes */}
          <Section title="Fontes e referências">
            <p className="text-xs text-kanglu-bordo/50">
              É necessária ao menos uma fonte com URL válida para publicar.
            </p>
            <div className="mt-3 space-y-2">
              {sources.length === 0 && (
                <p className="rounded-lg border border-dashed border-kanglu-nude px-3 py-4 text-center text-sm text-kanglu-bordo/40">
                  Nenhuma fonte adicionada
                </p>
              )}
              {sources.map((s, i) => (
                <div key={i} className="flex flex-wrap gap-2 sm:flex-nowrap">
                  <input
                    value={s.title}
                    onChange={(e) => updateSource(i, "title", e.target.value)}
                    placeholder="Título da fonte"
                    className={`${inputCls} sm:w-1/3`}
                  />
                  <input
                    type="url"
                    value={s.url}
                    onChange={(e) => updateSource(i, "url", e.target.value)}
                    placeholder="https://exemplo.com"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => removeSource(i)}
                    className="shrink-0 rounded-lg border border-kanglu-nude px-3 text-kanglu-bordo/60 hover:bg-kanglu-cream"
                    aria-label="Remover fonte"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addSource}
              className="mt-2 text-sm font-medium text-kanglu-orange hover:underline"
            >
              + Adicionar fonte
            </button>
          </Section>

          {/* SEO */}
          <Section title="SEO">
            <Field label="Meta título" htmlFor="metaTitle">
              <input
                id="metaTitle"
                value={form.metaTitle}
                onChange={(e) => set("metaTitle", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Meta descrição" htmlFor="metaDescription">
              <textarea
                id="metaDescription"
                rows={2}
                value={form.metaDescription}
                onChange={(e) => set("metaDescription", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="URL canônica" htmlFor="canonicalUrl">
              <input
                id="canonicalUrl"
                type="url"
                value={form.canonicalUrl}
                onChange={(e) => set("canonicalUrl", e.target.value)}
                placeholder="https://…"
                className={inputCls}
              />
            </Field>
            <Field label="Imagem OG (URL)" htmlFor="ogImage">
              <input
                id="ogImage"
                type="url"
                value={form.ogImage}
                onChange={(e) => set("ogImage", e.target.value)}
                placeholder="https://…"
                className={inputCls}
              />
            </Field>
          </Section>
        </div>
      )}
    </Shell>
  );
}

const inputCls =
  "w-full rounded-lg border border-kanglu-nude bg-kanglu-cream/40 px-3 py-2 text-kanglu-bordo outline-none focus:border-kanglu-orange";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 sm:px-8">
        {children}
      </main>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-kanglu-nude bg-white p-5">
      <h2 className="mb-4 font-heading text-lg font-semibold text-kanglu-bordo">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-kanglu-bordo"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function PreviewPane({ title, content }: { title: string; content: string }) {
  return (
    <div className="mt-6 rounded-xl border border-kanglu-nude bg-white p-6 sm:p-8">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-kanglu-orange">
        Prévia — como o leitor verá
      </p>
      <article>
        <h1 className="font-heading text-3xl font-bold leading-tight text-kanglu-bordo">
          {title}
        </h1>
        <div className="mt-6">
          <ArticleMarkdown content={content} />
        </div>
      </article>
    </div>
  );
}
