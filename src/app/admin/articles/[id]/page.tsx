"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminHeader } from "../../_components/admin-header";
import { useToast } from "../../_components/toast";
import { useConfirm } from "../../_components/confirm";
import { apiFetch, ApiError } from "../../_lib/api";
import { STATUS_META, formatDateTime, isScheduled } from "../../_lib/status";
import type { AdminArticle, AdminSource } from "../../_lib/types";
import { ArticleBody } from "@/components/article-body";
import { DateTimePicker } from "../../_components/datetime-picker";
import {
  LoadingMessages,
  GENERATE_URLS_MESSAGES,
} from "../../_components/loading-messages";
import { IMAGE_MARKER, imageMarker } from "@/lib/body-images";
import {
  isPastSchedule,
  isScheduleChanged,
  PUBLISH_AT_PAST_MESSAGE,
} from "@/lib/schedule";
import {
  CATEGORIES,
  normalizeCategory,
  type CategorySlug,
} from "@/lib/categories";

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
  category: CategorySlug | ""; // "" = sem categoria
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
// ISO (ou null) -> Date (ou null), para comparar agendamentos por instante.
// Data inválida vira null: melhor tratar como "sem agendamento anterior" do que
// propagar um NaN para dentro da comparação.
function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

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
  const confirm = useConfirm();

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

  // Ref do textarea de conteúdo — usado pra inserir o marcador de imagem no
  // corpo exatamente na posição do cursor (selectionStart/End).
  const contentRef = useRef<HTMLTextAreaElement>(null);

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
      // normalizeCategory defende contra valor legado/desconhecido no banco.
      category: normalizeCategory(a.category) ?? "",
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
    // Agendamento no passado — MESMA regra do servidor (isPastSchedule +
    // isScheduleChanged em lib/validation), aqui só para dar erro na hora em vez
    // de um 400. Vale exclusivamente para um agendamento NOVO: um artigo que já
    // guarda uma data passada (todo artigo do cron depois das 09:00) reenvia o
    // mesmo valor e continua salvando normalmente.
    const nextPublishAt = localInputToIso(form.publishAt);
    if (
      nextPublishAt !== null &&
      isScheduleChanged(new Date(nextPublishAt), toDate(article?.publishAt)) &&
      isPastSchedule(new Date(nextPublishAt), new Date())
    ) {
      toast.error(PUBLISH_AT_PAST_MESSAGE);
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
      category: form.category || null, // "" → null (limpa a categoria)
      status: form.workflowStatus,
      publishAt: nextPublishAt,
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
    const ok = await confirm({
      title: "Excluir artigo",
      message: `Excluir "${article.title}"? Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;
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
    const ok = await confirm({
      title: "Gerar novamente",
      message:
        "Isso vai substituir o conteúdo atual do rascunho. Não dá para desfazer. Continuar?",
      confirmLabel: "Gerar novamente",
    });
    if (!ok) return;
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

  // Gerar (novamente) imagens: cria 4 opções de capa via IA, hospeda no Blob e
  // atualiza imageOptions + a capa padrão (1ª). Atualiza SÓ os campos de imagem
  // no estado local — preserva edições de conteúdo ainda não salvas. Chamar de
  // novo substitui as opções (a rota apaga as anteriores do Blob). Não corrompe
  // o artigo se tudo falhar (502).
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
              imageOptions: data.article.imageOptions,
            }
          : prev,
      );
      set("ogImage", data.article.ogImage ?? "");
      const n = data.article.imageOptions.length;
      toast.success(
        n > 1 ? `${n} opções geradas.` : "Imagem gerada.",
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível gerar a imagem.",
      );
    } finally {
      setGeneratingImage(false);
    }
  }

  // Marcar uma opção como capa (SÓ estado local, reversível). Não chama API nem
  // apaga nada: só aponta o ogImage pra opção clicada. A escolha vira definitiva
  // e as demais são descartadas do Blob apenas ao SALVAR (o PATCH confirma).
  function selectOption(url: string) {
    set("ogImage", url);
  }

  // Inserir uma imagem NO CORPO: escreve o marcador `[[imagem:URL]]` na posição
  // do cursor do textarea de conteúdo (em linha própria). Só mexe no texto local
  // — a URL passa a estar no content, o que também a protege da limpeza do Blob
  // ao salvar (content.includes). Reusa imagens já geradas; não sobe nada novo.
  function insertBodyImage(url: string) {
    const marker = imageMarker(url);
    setForm((prev) => {
      if (!prev) return prev;
      const el = contentRef.current;
      const text = prev.content;
      const start = el?.selectionStart ?? text.length;
      const end = el?.selectionEnd ?? text.length;
      const before = text.slice(0, start);
      const after = text.slice(end);
      // Garante o marcador isolado em bloco: quebras antes (se já não houver) e
      // depois. Linhas em branco extras são inofensivas no markdown.
      const lead = before === "" || before.endsWith("\n") ? "" : "\n\n";
      const newContent = `${before}${lead}${marker}\n\n${after}`;
      return { ...prev, content: newContent };
    });
    toast.success("Imagem inserida no conteúdo.");
  }

  // Remove do conteúdo TODAS as ocorrências do marcador desta imagem, junto com
  // as quebras de linha que o cercavam, e colapsa o espaço que sobra num único
  // separador de parágrafo. Como `isInserted` deriva de `content.includes`, o
  // selo "✓ Inserida" some sozinho e o botão volta a "Inserir no texto".
  function removeBodyImage(url: string) {
    const marker = imageMarker(url);
    // Escapa os caracteres especiais de regex do marcador (a URL tem . / ? etc.).
    const esc = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Casa o marcador + qualquer whitespace/quebras ao redor, trocando por uma
    // separação de parágrafo limpa.
    const re = new RegExp(`\\n*[ \\t]*${esc}[ \\t]*\\n*`, "g");
    setForm((prev) => {
      if (!prev) return prev;
      const cleaned = prev.content
        .replace(re, "\n\n")
        .replace(/\n{3,}/g, "\n\n") // colapsa excesso de linhas em branco
        .replace(/^\n+/, "") // sem linhas em branco no início
        .trimEnd();
      return { ...prev, content: cleaned };
    });
    toast.success("Imagem removida do conteúdo.");
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
  // Há opções pendentes de escolha? (galeria em vez de capa única)
  const hasOptions = article.imageOptions.length > 0;

  // Pool de imagens que o usuário pode inserir no CORPO: a capa marcada + as 4
  // opções geradas + qualquer imagem já referenciada no texto (pra reinserir).
  // Dedup e só URLs http válidas. Tudo já existe no Blob — inserir não gera nada.
  const bodyImageRefs = Array.from(form.content.matchAll(IMAGE_MARKER), (m) => m[1]);
  const insertPool = Array.from(
    new Set(
      [form.ogImage, ...article.imageOptions, ...bodyImageRefs].filter(isHttpUrl),
    ),
  );
  // O campo de agendamento só faz sentido enquanto o artigo NÃO está visível no
  // blog: rascunho, em revisão, ou publicado porém ainda agendado p/ o futuro.
  // Publicado e já no ar (publishAt nulo ou no passado) esconde o campo — evita
  // "reagendar" e sumir com um artigo que já está visível.
  const canSchedule = article.status !== "published" || isScheduled(article);

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
        <div className="flex flex-wrap items-center gap-2">
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
        {/* Mesmas mensagens rotativas da geração inicial — o regenerate relê as
            fontes existentes, então reusa a sequência de URLs. */}
        {regenerating && <LoadingMessages messages={GENERATE_URLS_MESSAGES} />}
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
        <PreviewPane
          title={form.title}
          content={form.content}
          ogImage={form.ogImage}
          imageCredit={article.imageCredit}
          imageSourceUrl={article.imageSourceUrl}
        />
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

          {/* Agendamento de publicação — só quando o artigo ainda não está
              visível no blog (ver canSchedule). Publicado e já no ar mostra
              apenas um aviso discreto no lugar do campo. */}
          {canSchedule ? (
            <Section title="Agendar publicação">
              <Field
                label="Aparece no blog a partir de (horário local)"
                htmlFor="publishAt"
              >
                <DateTimePicker
                  id="publishAt"
                  value={form.publishAt}
                  onChange={(v) => set("publishAt", v)}
                  disablePast
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
          ) : (
            <Section title="Agendar publicação">
              <p className="text-sm text-kanglu-bordo/50">
                Publicado e visível no blog.
              </p>
            </Section>
          )}

          {/* Imagem ilustrativa (IA) */}
          <Section title="Imagem ilustrativa">
            <p className="text-xs text-kanglu-bordo/50">
              Gera 4 opções de capa via IA a partir do título. Aparece no topo do
              artigo publicado, com crédito do modelo. Opcional.
            </p>

            {hasOptions ? (
              // Galeria de escolha: clicar marca a opção como capa (reversível,
              // só estado local). A marcada ganha destaque. Ao SALVAR o artigo, a
              // escolha vira definitiva e as demais são descartadas do Blob.
              <>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {article.imageOptions.map((url, i) => {
                    const selected = url === form.ogImage;
                    return (
                      <button
                        key={url}
                        type="button"
                        onClick={() => selectOption(url)}
                        aria-pressed={selected}
                        className={`group relative overflow-hidden rounded-lg border-2 transition-colors ${
                          selected
                            ? "border-kanglu-orange ring-2 ring-kanglu-orange/30"
                            : "border-kanglu-nude hover:border-kanglu-orange/50"
                        }`}
                        title={selected ? "Capa selecionada" : "Usar esta como capa"}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Opção de capa ${i + 1}`}
                          className="aspect-video w-full object-cover"
                        />
                        {selected && (
                          <span className="absolute left-2 top-2 rounded-full bg-kanglu-orange px-2 py-0.5 text-xs font-semibold text-white shadow">
                            ✓ Selecionada
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-kanglu-bordo/50">
                  Clique para escolher a capa. Ao <strong>salvar</strong>, a
                  selecionada vira definitiva e as demais são descartadas.
                </p>
              </>
            ) : (
              hasImage && (
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
              )
            )}

            <button
              type="button"
              onClick={generateImage}
              disabled={busy}
              className="mt-3 rounded-lg border border-kanglu-orange px-4 py-2 text-sm font-semibold text-kanglu-orange transition-colors hover:bg-kanglu-orange/10 disabled:opacity-60"
              title="Gera 4 novas opções de capa por IA e as hospeda para escolha"
            >
              {generatingImage
                ? "Gerando imagens…"
                : hasOptions || hasImage
                  ? "Gerar novamente"
                  : "Gerar imagem"}
            </button>

            {/* Imagens no corpo (Etapa 3): reusa as imagens já geradas. Insere o
                marcador [[imagem:URL]] na posição do cursor do conteúdo. */}
            {insertPool.length > 0 && (
              <div className="mt-5 border-t border-kanglu-nude pt-4">
                <p className="text-sm font-medium text-kanglu-bordo">
                  Imagens no corpo
                </p>
                <p className="mt-1 text-xs text-kanglu-bordo/50">
                  Posicione o cursor no conteúdo onde quer a imagem e clique em
                  “Inserir no texto”. A imagem aparece naquele ponto do artigo,
                  além da capa. Reusa as opções já geradas — nada novo é gerado. A
                  imagem usada como <strong>capa</strong> não entra no corpo; troque
                  a capa e ela fica disponível. Uma imagem no corpo é preservada ao
                  salvar.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {insertPool.map((url) => {
                    // Estados reativos: a capa atual (ogImage) não é inserível; e
                    // uma imagem já presente no texto ganha o selo "Inserida"
                    // (some sozinho se o marcador for apagado do conteúdo).
                    const isCover = url === form.ogImage;
                    const isInserted = !isCover && form.content.includes(url);
                    return (
                      <div
                        key={url}
                        className={`relative overflow-hidden rounded-lg border-2 transition-colors ${
                          isInserted
                            ? "border-kanglu-orange ring-2 ring-kanglu-orange/30"
                            : "border-kanglu-nude"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt=""
                          className={`aspect-video w-full object-cover ${
                            isCover ? "opacity-50" : ""
                          }`}
                        />
                        {isCover && (
                          <span className="absolute left-2 top-2 rounded-full bg-kanglu-bordo/80 px-2 py-0.5 text-xs font-semibold text-white shadow">
                            Capa
                          </span>
                        )}
                        {isInserted && (
                          <span className="absolute left-2 top-2 rounded-full bg-kanglu-orange px-2 py-0.5 text-xs font-semibold text-white shadow">
                            ✓ Inserida
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            isInserted
                              ? removeBodyImage(url)
                              : insertBodyImage(url)
                          }
                          disabled={isCover}
                          title={
                            isCover
                              ? "Esta imagem é a capa — troque a capa para liberá-la para o corpo"
                              : isInserted
                                ? "Remove todas as ocorrências desta imagem do conteúdo"
                                : "Insere o marcador da imagem na posição do cursor"
                          }
                          className={`block w-full px-2 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-white disabled:text-kanglu-bordo/30 ${
                            isInserted
                              ? "bg-white text-red-600 hover:bg-red-50"
                              : "bg-white text-kanglu-orange hover:bg-kanglu-orange/10"
                          }`}
                        >
                          {isCover
                            ? "É a capa"
                            : isInserted
                              ? "Remover do texto"
                              : "Inserir no texto"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
            <Field label="Categoria" htmlFor="category">
              <select
                id="category"
                value={form.category}
                onChange={(e) =>
                  set("category", e.target.value as CategorySlug | "")
                }
                className={inputCls}
              >
                <option value="">Sem categoria</option>
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-kanglu-bordo/50">
                Sugerida pela IA na geração — confirme ou troque. Aparece como
                selo no artigo e filtra a listagem do blog.
              </p>
            </Field>
            <Field label="Conteúdo (Markdown)" htmlFor="content">
              <textarea
                id="content"
                ref={contentRef}
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

// Prévia: mesma capa + corpo do blog público, via o componente COMPARTILHADO
// ArticleBody. Usa os dados AO VIVO do editor (form.ogImage, form.content),
// então mostra a capa selecionada e o conteúdo mesmo antes de salvar. Crédito da
// imagem vem do artigo (imageCredit/imageSourceUrl não são editáveis no form).
function PreviewPane({
  title,
  content,
  ogImage,
  imageCredit,
  imageSourceUrl,
}: {
  title: string;
  content: string;
  ogImage: string;
  imageCredit: string | null;
  imageSourceUrl: string | null;
}) {
  return (
    <div className="mt-6 rounded-xl border border-kanglu-nude bg-white p-6 sm:p-8">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-kanglu-orange">
        Prévia — como o leitor verá
      </p>
      <article>
        <h1 className="font-heading text-3xl font-bold leading-tight text-kanglu-bordo">
          {title}
        </h1>
        <ArticleBody
          title={title}
          content={content}
          ogImage={ogImage}
          imageCredit={imageCredit}
          imageSourceUrl={imageSourceUrl}
        />
      </article>
    </div>
  );
}
