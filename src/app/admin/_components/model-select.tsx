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
