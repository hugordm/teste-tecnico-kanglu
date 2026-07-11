"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "../_lib/api";

// Login do admin. Client Component: precisa de estado do formulário, loading no
// botão e mensagem de erro inline. Em sucesso, o cookie httpOnly é setado pela
// rota e navegamos para o painel (ou para o ?next= que o proxy guardou).
//
// useSearchParams exige um limite de <Suspense> acima — daí o wrapper.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      // router.refresh() garante que o proxy reavalie a sessão recém-criada.
      router.replace(next);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Não foi possível entrar. Tente novamente.";
      setError(message);
      setLoading(false); // em sucesso não reabilita: a navegação assume
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-center font-heading text-3xl font-bold text-kanglu-bordo">
          Kanglu<span className="text-kanglu-orange">.</span>
        </h1>
        <p className="mt-1 text-center text-sm text-kanglu-bordo/60">
          Área administrativa
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-4 rounded-xl border border-kanglu-nude bg-white p-6"
        >
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-kanglu-bordo"
            >
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-kanglu-nude bg-kanglu-cream/40 px-3 py-2 text-kanglu-bordo outline-none focus:border-kanglu-orange"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-kanglu-bordo"
            >
              Senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-kanglu-orange px-4 py-2.5 font-semibold text-white transition-colors hover:bg-kanglu-orange/90 disabled:opacity-60"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
