import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { getPublishedArticles, type PublicArticle } from "@/lib/public-articles";

export const metadata: Metadata = {
  title: "Blog",
  description: "Artigos e novidades da Kanglu.",
};

// Revalida no máximo a cada 60s. Sem isto, em produção a listagem seria
// estática e um artigo AGENDADO nunca apareceria sozinho quando sua hora
// chegasse. Com ISR, passada a hora agendada a página se re-renderiza (em até
// ~60s) e o artigo entra na lista — sem cron e sem redeploy.
export const revalidate = 60;

const PAGE_SIZE = 6;

// Formata datas em pt-BR ("11 de julho de 2026"). Criado uma vez no módulo
// em vez de a cada card. publishedAt é opcional no schema; tratamos null.
const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * /blog — listagem pública paginada.
 * Server Component: os dados são buscados no servidor (bom para SEO e perf,
 * zero JS de listagem enviado ao cliente). `searchParams` é uma Promise no
 * Next 16, então precisa de await.
 */
export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  // ?page= vem como string (ou array/undefined); parse tolerante que cai em 1.
  const requestedPage = Number.parseInt(pageParam ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? requestedPage : 1;

  const { articles, page: currentPage, totalPages, total } =
    await getPublishedArticles({ page, pageSize: PAGE_SIZE });

  return (
    <div className="flex flex-col flex-1">
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="font-heading text-3xl font-bold text-kanglu-bordo sm:text-4xl">
          Blog
        </h1>
        <p className="mt-2 text-kanglu-bordo/70">
          Artigos e novidades da Kanglu.
        </p>

        {articles.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <section className="mt-10 grid gap-6 sm:grid-cols-2">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </section>

            <Pagination currentPage={currentPage} totalPages={totalPages} />

            <p className="mt-6 text-center text-sm text-kanglu-bordo/50">
              {total} {total === 1 ? "artigo publicado" : "artigos publicados"}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

/** Um card de artigo na listagem. Elemento <article> por ser conteúdo autônomo. */
function ArticleCard({ article }: { article: PublicArticle }) {
  return (
    <article className="group relative flex flex-col rounded-xl border border-kanglu-nude bg-white p-6 transition-colors hover:border-kanglu-orange">
      <h2 className="font-heading text-xl font-semibold text-kanglu-bordo">
        <Link
          href={`/blog/${article.slug}`}
          className="after:absolute after:inset-0"
        >
          {article.title}
        </Link>
      </h2>

      {article.excerpt && (
        <p className="mt-3 line-clamp-3 text-kanglu-bordo/75">
          {article.excerpt}
        </p>
      )}

      {article.publishedAt && (
        <time
          dateTime={article.publishedAt.toISOString()}
          className="mt-4 text-sm text-kanglu-bordo/50"
        >
          {dateFmt.format(article.publishedAt)}
        </time>
      )}

      <span className="mt-4 text-sm font-medium text-kanglu-orange">
        Ler artigo →
      </span>
    </article>
  );
}

/** Estado vazio: nenhum artigo publicado ainda. */
function EmptyState() {
  return (
    <div className="mt-16 rounded-xl border border-dashed border-kanglu-nude bg-white/50 px-6 py-16 text-center">
      <p className="font-heading text-lg font-semibold text-kanglu-bordo">
        Nenhum artigo publicado ainda
      </p>
      <p className="mt-2 text-kanglu-bordo/60">
        Volte em breve — novos conteúdos estão a caminho.
      </p>
    </div>
  );
}

/**
 * Controles de paginação via query param (?page=). Links reais (<a>) para
 * funcionar sem JS e serem rastreáveis. Bordas ficam desabilitadas nas pontas.
 */
function Pagination({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const linkBase =
    "rounded-lg border border-kanglu-nude px-4 py-2 text-sm font-medium transition-colors";
  const enabled = "text-kanglu-orange hover:bg-kanglu-orange hover:text-white";
  const disabled =
    "pointer-events-none cursor-default text-kanglu-bordo/30";

  return (
    <nav
      className="mt-10 flex items-center justify-between"
      aria-label="Paginação"
    >
      {hasPrev ? (
        <Link
          href={`/blog?page=${currentPage - 1}`}
          rel="prev"
          className={`${linkBase} ${enabled}`}
        >
          ← Anterior
        </Link>
      ) : (
        <span className={`${linkBase} ${disabled}`}>← Anterior</span>
      )}

      <span className="text-sm text-kanglu-bordo/60">
        Página {currentPage} de {totalPages}
      </span>

      {hasNext ? (
        <Link
          href={`/blog?page=${currentPage + 1}`}
          rel="next"
          className={`${linkBase} ${enabled}`}
        >
          Próxima →
        </Link>
      ) : (
        <span className={`${linkBase} ${disabled}`}>Próxima →</span>
      )}
    </nav>
  );
}
