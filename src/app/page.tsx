import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

// Canônica da home — mesma base do sitemap/JSON-LD. `${SITE_URL}/` casa com a
// entrada da home no sitemap.
export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/` },
};

// Home institucional do Blog Kanglu. Página estática e sóbria com a identidade
// da marca (creme, bordô, laranja) e um único caminho: entrar no /blog.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-kanglu-cream px-6 py-20 text-center">
      <Image
        src="/kanglu-logo-completo.png"
        alt="Kanglu"
        width={1397}
        height={396}
        priority
        className="h-12 w-auto sm:h-14"
      />

      <h1 className="mt-10 max-w-2xl font-heading text-3xl font-bold leading-tight text-kanglu-bordo sm:text-4xl md:text-5xl">
        Blog Kanglu — a jornada pós-compra do jeito certo
      </h1>

      <p className="mt-5 max-w-xl text-lg leading-relaxed text-kanglu-bordo/70">
        Conteúdo prático para lojistas de e-commerce transformarem entrega,
        rastreio e devolução em fidelização e mais vendas.
      </p>

      <Link
        href="/blog"
        className="mt-10 inline-flex items-center justify-center rounded-full bg-kanglu-orange px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-kanglu-orange/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kanglu-orange"
      >
        Ver o blog →
      </Link>
    </main>
  );
}
