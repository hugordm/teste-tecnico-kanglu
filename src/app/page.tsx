import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/site";
import { getPublishedArticles, type PublicArticle } from "@/lib/public-articles";

// Canônica da home — mesma base do sitemap/JSON-LD. `${SITE_URL}/` casa com a
// entrada da home no sitemap.
export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/` },
};

// Home = landing do produto. Puxa os 3 últimos publicados (mesmo helper de
// segurança do /blog), então revalida como a listagem: assim um artigo novo ou
// AGENDADO aparece na home sozinho (em até ~60s) sem redeploy.
export const revalidate = 60;

// Data em pt-BR ("11 de julho de 2026"), criada uma vez no módulo.
const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Home institucional do Blog Kanglu. Server Component: lê o banco no servidor
 * (zero JS de dados no cliente, bom p/ SEO) e NÃO chama nenhuma IA — é frontend
 * puro sobre o que já existe. Seções: hero → recursos (features REAIS da
 * plataforma) → últimos artigos → rodapé.
 */
export default async function Home() {
  // Só os 3 mais recentes; reusa o publicWhere() (rascunho/agendado nunca vazam).
  const { articles } = await getPublishedArticles({ page: 1, pageSize: 3 });

  return (
    <div className="flex flex-1 flex-col">
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <Features />
        <LatestArticles articles={articles} />
      </main>
      <SiteFooter />
    </div>
  );
}

/** Barra slim: logo (→ home) + atalho para o blog. */
function SiteNav() {
  return (
    <header className="border-b border-kanglu-nude bg-kanglu-cream/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center" aria-label="Kanglu — página inicial">
          <Image
            src="/kanglu-logo-completo.png"
            alt="Kanglu"
            width={1397}
            height={396}
            priority
            className="h-8 w-auto"
          />
        </Link>
        <Link
          href="/blog"
          className="text-sm font-semibold text-kanglu-bordo transition-colors hover:text-kanglu-orange"
        >
          Ver o blog →
        </Link>
      </div>
    </header>
  );
}

/**
 * HERO. Fundo creme com um brilho laranja/nude sutil (gradientes radiais em
 * camada absoluta, atrás do conteúdo). Título grande + proposta + dois CTAs.
 */
function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-kanglu-nude">
      {/* Brilhos decorativos — puramente estéticos, atrás do conteúdo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(255,112,71,0.14),transparent_70%),radial-gradient(40%_40%_at_85%_20%,rgba(229,198,188,0.5),transparent_70%)]"
      />
      <div className="relative mx-auto w-full max-w-3xl px-5 py-20 text-center sm:px-8 sm:py-24 lg:py-28">
        <span className="inline-flex items-center gap-2 rounded-full border border-kanglu-nude bg-white/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-kanglu-bordo/70">
          <span className="h-1.5 w-1.5 rounded-full bg-kanglu-orange" />
          Plataforma de conteúdo com IA
        </span>

        <h1 className="mt-6 font-heading text-4xl font-bold leading-[1.1] text-kanglu-bordo sm:text-5xl lg:text-6xl">
          Conteúdo sobre e-commerce e logística,{" "}
          <span className="text-kanglu-orange">gerado e curado com IA</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-kanglu-bordo/70">
          O Blog Kanglu reúne artigos práticos sobre a jornada pós-compra —
          entrega, rastreio e devolução — produzidos com apoio de IA e revisados
          por gente antes de publicar.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/blog"
            className="inline-flex w-full items-center justify-center rounded-full bg-kanglu-orange px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-kanglu-orange/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kanglu-orange sm:w-auto"
          >
            Ver o blog →
          </Link>
          <Link
            href="#recursos"
            className="inline-flex w-full items-center justify-center rounded-full border border-kanglu-nude bg-white px-8 py-3.5 text-base font-semibold text-kanglu-bordo transition-colors hover:border-kanglu-orange hover:text-kanglu-orange sm:w-auto"
          >
            Conhecer os recursos
          </Link>
        </div>
      </div>
    </section>
  );
}

/** As 6 features REAIS da plataforma (nada inventado). Ícone + título + texto. */
const FEATURES: { icon: ReactNode; title: string; desc: string }[] = [
  {
    icon: <IconSparkles />,
    title: "Geração de artigos com IA",
    desc: "Dois fluxos: por tema (a IA busca fontes reais na web) ou a partir de URLs que você fornece.",
  },
  {
    icon: <IconSearch />,
    title: "SEO técnico caprichado",
    desc: "Sitemap, meta tags, dados estruturados (JSON-LD) e canonical em cada página — pronto pra indexar.",
  },
  {
    icon: <IconImage />,
    title: "Imagens geradas por IA",
    desc: "Cada rascunho ganha opções de capa geradas por IA; você escolhe a que combina com o artigo.",
  },
  {
    icon: <IconCalendar />,
    title: "Agendamento de publicação",
    desc: "Marque data e hora: o artigo entra no ar sozinho quando chega a hora, sem cron nem redeploy.",
  },
  {
    icon: <IconChat />,
    title: "Chatbot com IA no blog",
    desc: "Um assistente responde dúvidas dos leitores usando apenas o conteúdo publicado como base.",
  },
  {
    icon: <IconLightbulb />,
    title: "Sugestão de pautas",
    desc: "Sem ideia do que escrever? A IA sugere pautas relevantes pra alimentar o próximo artigo.",
  },
];

function Features() {
  return (
    <section id="recursos" className="scroll-mt-20 border-b border-kanglu-nude bg-white">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
        <div className="max-w-2xl">
          <h2 className="font-heading text-3xl font-bold text-kanglu-bordo sm:text-4xl">
            Tudo que a plataforma faz
          </h2>
          <p className="mt-3 text-lg text-kanglu-bordo/70">
            Da ideia à publicação: um fluxo completo de conteúdo, com IA onde ela
            ajuda e revisão humana onde ela importa.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="flex flex-col rounded-xl border border-kanglu-nude bg-kanglu-cream/40 p-6 shadow-sm transition-colors hover:border-kanglu-orange"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-kanglu-orange/10 text-kanglu-orange">
                {f.icon}
              </span>
              <h3 className="mt-4 font-heading text-lg font-semibold text-kanglu-bordo">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-kanglu-bordo/70">
                {f.desc}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Últimos artigos publicados. Some por completo se não houver nenhum — sem
 * estado vazio na home (o CTA pro blog já cobre esse caminho).
 */
function LatestArticles({ articles }: { articles: PublicArticle[] }) {
  if (articles.length === 0) return null;

  return (
    <section className="bg-kanglu-cream">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-heading text-3xl font-bold text-kanglu-bordo sm:text-4xl">
            Últimos artigos
          </h2>
          <Link
            href="/blog"
            className="text-sm font-semibold text-kanglu-orange hover:underline"
          >
            Ver todos →
          </Link>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <HomeArticleCard key={article.id} article={article} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Card de artigo na home: capa (ou fallback), título, excerpt e data. */
function HomeArticleCard({ article }: { article: PublicArticle }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-kanglu-nude bg-white transition-colors hover:border-kanglu-orange">
      <div className="aspect-[16/9] w-full overflow-hidden bg-kanglu-cream">
        {article.ogImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.ogImage}
            alt={`Ilustração do artigo: ${article.title}`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          // Fallback sóbrio quando o artigo não tem capa: iniciais da marca.
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-kanglu-nude/60 to-kanglu-cream">
            <span className="font-heading text-2xl font-bold text-kanglu-bordo/30">
              Kanglu
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="font-heading text-lg font-semibold text-kanglu-bordo">
          <Link
            href={`/blog/${article.slug}`}
            className="after:absolute after:inset-0"
          >
            {article.title}
          </Link>
        </h3>

        {article.excerpt && (
          <p className="mt-2 line-clamp-3 text-sm text-kanglu-bordo/75">
            {article.excerpt}
          </p>
        )}

        {article.publishedAt && (
          <time
            dateTime={article.publishedAt.toISOString()}
            className="mt-4 text-xs text-kanglu-bordo/50"
          >
            {dateFmt.format(article.publishedAt)}
          </time>
        )}
      </div>
    </article>
  );
}

/** Rodapé em bordô — fechamento da marca + atalho pro blog + copyright real. */
function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-kanglu-bordo text-kanglu-cream">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-5 py-12 sm:flex-row sm:justify-between sm:px-8">
        <div className="text-center sm:text-left">
          <p className="font-heading text-lg font-semibold">Blog Kanglu</p>
          <p className="mt-1 text-sm text-kanglu-cream/70">
            A jornada pós-compra do jeito certo.
          </p>
        </div>
        <Link
          href="/blog"
          className="rounded-full bg-kanglu-orange px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-kanglu-orange/90"
        >
          Ver o blog →
        </Link>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto w-full max-w-6xl px-5 py-5 text-center text-xs text-kanglu-cream/60 sm:px-8">
          © {year} Kanglu. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Ícones (stroke, 24px, herdam a cor via currentColor). aria-hidden: são
// decorativos — o título do card já dá o significado.
// ---------------------------------------------------------------------------
function iconProps() {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-6 w-6",
    "aria-hidden": true,
  };
}

function IconSparkles() {
  return (
    <svg {...iconProps()}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M12 8.5 13.4 11l2.6 1.4-2.6 1.4L12 16.3l-1.4-2.5L8 12.4 10.6 11 12 8.5Z" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg {...iconProps()}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function IconImage() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 18 5-5 4 4 3-3 4 4" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
      <path d="M9 14h2v2H9z" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg {...iconProps()}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12Z" />
      <path d="M8.5 11h7M8.5 14h4" />
    </svg>
  );
}

function IconLightbulb() {
  return (
    <svg {...iconProps()}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 1 3.6 10.8c-.6.5-.9 1-1 1.7l-.1.5H9.5l-.1-.5c-.1-.7-.4-1.2-1-1.7A6 6 0 0 1 12 3Z" />
    </svg>
  );
}
