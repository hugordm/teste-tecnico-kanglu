"use client";

import { useEffect, useRef, useState } from "react";

// Chatbot flutuante do blog: responde dúvidas sobre os artigos publicados.
// Estado 100% em memória (useState) — NADA de localStorage. Só renderiza na
// área /blog (é montado pelo src/app/blog/layout.tsx).

type Msg = { role: "user" | "assistant"; content: string };

const GREETING =
  "Oi! Sou o assistente do blog da Kanglu. Posso ajudar com dúvidas sobre os conteúdos publicados aqui — pós-venda, rastreamento, entregas, devoluções e afins. O que você quer saber?";

export function BlogChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Rola pro fim quando chega mensagem nova ou aparece o "digitando…".
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  // Foca o campo ao abrir a janela.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send() {
    const text = input.trim();
    if (text === "" || loading) return;

    const nextMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Manda só user/assistant (o greeting inicial é do assistente e não
        // atrapalha; o backend usa só as últimas N e ignora o excesso).
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
      };

      if (!res.ok || !data.reply) {
        setError(
          data.error ??
            "Não consegui responder agora. Tente novamente em instantes.",
        );
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply as string },
        ]);
      }
    } catch {
      setError("Falha de conexão. Verifique sua internet e tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Bolinha flutuante — abre/fecha a janela. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fechar o chat do blog" : "Abrir o chat do blog"}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-kanglu-orange text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kanglu-orange"
      >
        {open ? (
          <span className="text-2xl leading-none">×</span>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Janela do chat. */}
      {open && (
        <div
          role="dialog"
          aria-label="Chat do blog da Kanglu"
          className="fixed bottom-24 right-5 z-50 flex h-[70vh] max-h-[560px] w-[calc(100vw-2.5rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-kanglu-nude bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-kanglu-bordo px-4 py-3">
            <div>
              <p className="font-heading text-sm font-semibold text-white">
                Assistente do blog
              </p>
              <p className="text-xs text-white/70">Dúvidas sobre os conteúdos</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar o chat"
              className="rounded-full p-1 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <span className="text-xl leading-none">×</span>
            </button>
          </div>

          {/* Mensagens */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto bg-kanglu-cream/40 px-4 py-4"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "rounded-br-sm bg-kanglu-orange text-white"
                      : "rounded-bl-sm border border-kanglu-nude bg-white text-kanglu-bordo"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-kanglu-nude bg-white px-3 py-2 text-sm text-kanglu-bordo/60">
                  digitando…
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 border-t border-kanglu-nude bg-white px-3 py-3">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Escreva sua dúvida…"
              disabled={loading}
              className="min-w-0 flex-1 rounded-full border border-kanglu-nude bg-kanglu-cream/40 px-4 py-2 text-sm text-kanglu-bordo outline-none focus:border-kanglu-orange disabled:opacity-60"
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || input.trim() === ""}
              aria-label="Enviar mensagem"
              className="shrink-0 rounded-full bg-kanglu-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-kanglu-orange/90 disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
