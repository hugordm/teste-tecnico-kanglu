"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// Modal de confirmação com a identidade Kanglu, substituto do window.confirm()
// nativo (caixa preta do navegador, sem a cara da marca). Mesma arquitetura do
// ToastProvider: um contexto serve a função, um componente renderiza a UI.
//
// DESAFIO SÍNCRONO→ASSÍNCRONO: window.confirm() PARA o código até o usuário
// responder; um modal React é assíncrono (estado). A ponte é uma Promise:
// `confirm(options)` abre o modal e guarda o `resolve`; Confirmar resolve `true`,
// Cancelar/ESC/clique-fora resolve `false`. No call site, `await confirm({...})`
// retoma exatamente de onde parou — o `if (!confirm()) return` vira
// `if (!(await confirm({...}))) return`, sem quebrar o handler em duas metades.

export type ConfirmVariant = "default" | "danger";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  // O `resolve` da Promise em aberto vive num ref: os botões o chamam para
  // devolver a resposta a quem deu await. Ref (não estado) porque trocá-lo não
  // deve causar render nem entrar nas deps de efeitos.
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    // Se já houver um modal pendente (raro), resolve o anterior como cancelado
    // antes de abrir o novo — nunca deixa uma Promise órfã sem resolver.
    resolverRef.current?.(false);
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <ConfirmDialog
          options={options}
          onConfirm={() => close(true)}
          onCancel={() => close(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm precisa estar dentro de <ConfirmProvider>");
  }
  return ctx;
}

function ConfirmDialog({
  options,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // ESC cancela; foco vai pro modal ao abrir e volta pro elemento anterior ao
  // fechar (boa prática de diálogo). Guardamos o activeElement na montagem e o
  // restauramos no cleanup.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    confirmBtnRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [onCancel]);

  const isDanger = options.variant === "danger";

  return (
    // Overlay: clicar fora (no próprio overlay) cancela. O clique dentro da caixa
    // não propaga, então não fecha.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={options.message ? "confirm-message" : undefined}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-kanglu-nude bg-white p-6 shadow-lg"
      >
        <h2
          id="confirm-title"
          className="font-heading text-lg font-semibold text-kanglu-bordo"
        >
          {options.title}
        </h2>
        {options.message && (
          <p id="confirm-message" className="mt-2 text-sm text-kanglu-bordo/70">
            {options.message}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-kanglu-nude px-4 py-2 text-sm font-medium text-kanglu-bordo transition-colors hover:bg-kanglu-cream"
          >
            {options.cancelLabel ?? "Cancelar"}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
              isDanger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-kanglu-orange hover:bg-kanglu-orange/90"
            }`}
          >
            {options.confirmLabel ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
