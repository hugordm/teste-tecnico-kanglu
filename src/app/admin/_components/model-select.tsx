"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../_lib/api";
import type { CuratedModels, ModelInfo } from "@/lib/models";

// Seletor de modelo estilo ChatGPT: um botão com a LOGO do provedor + nome do
// modelo, e um dropdown com a lista curada (logo + nome + provedor), o
// selecionado em destaque. Fecha ao clicar fora / Esc (mesmo padrão do
// datepicker). Client Component: tem estado de abertura e recebe a escolha.
//
// `import type` do lib server-only é seguro: o tipo é apagado na compilação,
// então NENHUM código de servidor entra no bundle do cliente.

/**
 * Busca a lista curada de modelos (/api/models) uma vez. Enquanto carrega,
 * `loading` é true; se falhar, `models` fica null (o seletor mostra o estado de
 * indisponível e a geração segue no default do servidor).
 */
export function useCuratedModels(): {
  models: CuratedModels | null;
  loading: boolean;
} {
  const [models, setModels] = useState<CuratedModels | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiFetch<CuratedModels>("/api/models")
      .then((data) => {
        if (alive) setModels(data);
      })
      .catch(() => {
        // Silencioso: sem lista, o seletor some e a geração usa o default.
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { models, loading };
}

export function ModelSelect({
  label,
  models,
  value,
  onChange,
  disabled,
}: {
  label: string;
  models: ModelInfo[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = models.find((m) => m.id === value) ?? models[0];
  if (!selected) return null;

  return (
    // min-w-0: como item de grid/flex, permite encolher abaixo do min-content —
    // sem isto o `truncate` (white-space:nowrap) do nome forçaria a célula a
    // esticar com o texto inteiro e vazar no mobile.
    <div className="min-w-0">
      <span className="mb-1 block text-sm font-medium text-kanglu-bordo">
        {label}
      </span>
      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex w-full items-center gap-2 rounded-lg border border-kanglu-nude bg-kanglu-cream/40 px-3 py-2 text-left text-kanglu-bordo outline-none focus:border-kanglu-orange disabled:opacity-60"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selected.logo} alt="" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{selected.name}</span>
          <span className="hidden shrink-0 text-xs text-kanglu-bordo/50 sm:inline">
            {selected.providerLabel}
          </span>
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            fill="none"
            className={`h-4 w-4 shrink-0 text-kanglu-bordo/40 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path
              d="m6 8 4 4 4-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {open && (
          <ul
            role="listbox"
            className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-kanglu-nude bg-white py-1 shadow-lg"
          >
            {models.map((m) => {
              const isSel = m.id === selected.id;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-kanglu-cream ${
                      isSel ? "bg-kanglu-orange/10" : ""
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.logo} alt="" className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-sm text-kanglu-bordo">
                      {m.name}
                    </span>
                    <span className="shrink-0 text-xs text-kanglu-bordo/50">
                      {m.providerLabel}
                    </span>
                    {isSel && (
                      <span className="shrink-0 text-kanglu-orange">✓</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seletor de MOTOR de busca (generate-auto): Firecrawl (padrão) | Sonar.
//
// Mesma lógica/visual do ModelSelect, mas lista ESTÁTICA de 2 opções (não vem da
// API) — a escolha vai no body do POST e é validada no servidor (zod enum). O
// Firecrawl busca e o modelo escreve; o Sonar busca e escreve nativamente e
// também é o fallback automático se o Firecrawl falhar.
// ---------------------------------------------------------------------------

export type SearchEngine = "firecrawl" | "sonar";

const ENGINES: { id: SearchEngine; name: string; hint: string }[] = [
  { id: "firecrawl", name: "Firecrawl", hint: "padrão" },
  { id: "sonar", name: "Sonar", hint: "Perplexity" },
];

export function EngineSelect({
  value,
  onChange,
  disabled,
}: {
  value: SearchEngine;
  onChange: (id: SearchEngine) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = ENGINES.find((e) => e.id === value) ?? ENGINES[0];

  return (
    <div className="min-w-0">
      <span className="mb-1 block text-sm font-medium text-kanglu-bordo">
        Motor de busca
      </span>
      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex w-full items-center gap-2 rounded-lg border border-kanglu-nude bg-kanglu-cream/40 px-3 py-2 text-left text-kanglu-bordo outline-none focus:border-kanglu-orange disabled:opacity-60"
        >
          <span className="min-w-0 flex-1 truncate">{selected.name}</span>
          <span className="hidden shrink-0 text-xs text-kanglu-bordo/50 sm:inline">
            {selected.hint}
          </span>
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            fill="none"
            className={`h-4 w-4 shrink-0 text-kanglu-bordo/40 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path
              d="m6 8 4 4 4-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {open && (
          <ul
            role="listbox"
            className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-kanglu-nude bg-white py-1 shadow-lg"
          >
            {ENGINES.map((e) => {
              const isSel = e.id === selected.id;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    onClick={() => {
                      onChange(e.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-kanglu-cream ${
                      isSel ? "bg-kanglu-orange/10" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-kanglu-bordo">
                      {e.name}
                    </span>
                    <span className="shrink-0 text-xs text-kanglu-bordo/50">
                      {e.hint}
                    </span>
                    {isSel && (
                      <span className="shrink-0 text-kanglu-orange">✓</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Toggle de RECÊNCIA da busca — mesmo parâmetro (`recent`) que o cron diário
 * liga fixo, aqui exposto como escolha do editor, tema a tema.
 *
 * DESLIGADO por padrão: no painel quem escolhe o tema é uma pessoa. Tema
 * noticioso, liga; tema atemporal (pós-venda, fidelização), deixa desligado —
 * priorizar data nesses casos empurra para baixo material evergreen que é o
 * melhor que existe sobre o assunto (o histórico dessa decisão está em
 * lib/recency.ts). O cron é o oposto: sem humano, e a pauta do dia É noticiosa.
 *
 * Mora junto do EngineSelect porque é o mesmo tipo de controle — um ajuste da
 * BUSCA, não do artigo — e assim os dois compartilham a mesma caixa visual.
 */
export function RecencyToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-sm font-medium text-kanglu-bordo">
        Recência da busca
      </span>
      {/* <label> envolvendo o input: a linha inteira vira área de clique e o
          rótulo já fica associado ao controle, sem precisar de htmlFor/id. */}
      <label
        className={`flex w-full items-center gap-3 rounded-lg border border-kanglu-nude bg-kanglu-cream/40 px-3 py-2 transition-colors focus-within:border-kanglu-orange ${
          disabled ? "opacity-60" : "cursor-pointer hover:border-kanglu-orange"
        }`}
      >
        {/* Checkbox REAL, só visualmente escondido: teclado, leitores de tela e
            o estado "marcado" vêm de graça do elemento nativo. O desenho do
            interruptor abaixo reage por `peer-checked`. */}
        <input
          type="checkbox"
          checked={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="relative h-5 w-9 shrink-0 rounded-full bg-kanglu-bordo/20 transition-colors peer-checked:bg-kanglu-orange peer-focus-visible:ring-2 peer-focus-visible:ring-kanglu-orange/40"
        >
          {/* A bolinha NÃO usa `peer-checked`: o variant do Tailwind gera um
              seletor de IRMÃO (`.peer:checked ~ …`) e ela é neta do input, não
              irmã — a regra nunca casaria. Como o componente é controlado, o
              próprio `value` decide, o que também é mais fácil de ler. */}
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
              value ? "translate-x-4" : ""
            }`}
          />
        </span>
        {/* "Priorizar", não "buscar só": o parâmetro ordena por data dentro do
            último ano, não corta o que é mais velho. A janela DURA de 6 meses
            foi aposentada justamente por cegar o evergreen (lib/recency.ts) — o
            rótulo tem que descrever o que o código faz hoje. */}
        <span className="min-w-0 flex-1 text-sm text-kanglu-bordo">
          Priorizar conteúdo recente
        </span>
        <span className="hidden shrink-0 text-xs text-kanglu-bordo/50 sm:inline">
          {value ? "último ano" : "sem preferência"}
        </span>
      </label>
      <p className="mt-1 text-xs text-kanglu-bordo/50">
        Ligado, a busca prioriza publicações do último ano — bom para temas
        noticiosos. Desligado (padrão), aceita material mais antigo, que costuma
        ser o melhor em temas atemporais.
      </p>
    </div>
  );
}

/** Esqueleto exibido enquanto a lista de modelos carrega. */
export function ModelSelectSkeleton({ label }: { label: string }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-kanglu-bordo">
        {label}
      </span>
      <div className="h-[42px] w-full animate-pulse rounded-lg border border-kanglu-nude bg-kanglu-cream/40" />
    </div>
  );
}
