"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { logout } from "../actions";

// Cabeçalho do painel: logo da marca à esquerda, sair à direita. Client
// Component porque o botão sair dispara uma Server Action e tem estado de
// loading enquanto a sessão é encerrada.
export function AdminHeader() {
  const [leaving, setLeaving] = useState(false);

  return (
    <header className="border-b border-kanglu-nude bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
        <Link href="/admin" className="flex items-center">
          <Image
            src="/kanglu-logo-completo.png"
            alt="Kanglu"
            width={1397}
            height={396}
            priority
            className="h-8 w-auto"
          />
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href="/blog"
            target="_blank"
            className="text-sm font-medium text-kanglu-orange hover:underline"
          >
            Ver blog →
          </Link>
          <button
            type="button"
            onClick={() => {
              setLeaving(true);
              // A action redireciona; o estado de loading cobre a transição.
              logout();
            }}
            disabled={leaving}
            className="rounded-lg border border-kanglu-nude px-3 py-1.5 text-sm font-medium text-kanglu-bordo transition-colors hover:bg-kanglu-cream disabled:opacity-60"
          >
            {leaving ? "Saindo…" : "Sair"}
          </button>
        </div>
      </div>
    </header>
  );
}
