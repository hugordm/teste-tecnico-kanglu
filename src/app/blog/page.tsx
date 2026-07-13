import Link from "next/link";
import Form from "next/form";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { getPublishedArticles, type PublicArticle } from "@/lib/public-articles";
import { SITE_URL } from "@/lib/site";

/**
 * Metadata da listagem. A canônica aponta SEMPRE para `/blog` (sem query), para
 * as páginas de busca não competirem com a listagem no índice. E páginas de
 * busca (`?q=`) recebem `noindex`: são resultados finos/duplicados, não vale
 * indexá-los — a listagem base segue indexável como antes.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  const term = q?.trim();

  return {
    title: term ? `Busca: “${term}”` : "Blog",
    description: "Artigos e novidades da Kanglu.",
    alternates: { canonical: `${SITE_URL}/blog` },
    ...(term ? { robots: { index: false, follow: true } } : {}),
  };
}

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
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page: pageParam, q: qParam } = await searchParams;
  // ?page= vem como string (ou array/undefined); parse tolerante que cai em 1.
  const requestedPage = Number.parseInt(pageParam ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? requestedPage : 1;
  // ?q= é o termo de busca. Normalizamos o vazio ("" ou só espaços) para
  // "sem busca", então `/blog?q=` se comporta igual a `/blog`.
  const query = qParam?.trim() ?? "";

  const { articles, page: currentPage, totalPages, total } =
    await getPublishedArticles({ page, pageSize: PAGE_SIZE, query });

  return (
    <div className="flex flex-col flex-1">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14 lg:py-16">
        <h1 className="font-heading text-3xl font-bold text-kanglu-bordo sm:text-4xl">
          Blog
        </h1>
        <p className="mt-2 text-kanglu-bordo/70">
          Artigos e novidades da Kanglu.
        </p>

        <SearchBar query={query} />

        {articles.length === 0 ? (
          query ? (
            <NoResults query={query} />
          ) : (
            <EmptyState />
          )
        ) : (
          <>
            <section className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </section>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              query={query}
            />

            <p className="mt-6 text-center text-sm text-kanglu-bordo/50">
              {query
                ? `${total} ${total === 1 ? "resultado" : "resultados"} para “${query}”`
                : `${total} ${total === 1 ? "artigo publicado" : "artigos publicados"}`}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

/**
 * Campo de busca via `next/form`: com `action` string, é um form GET que codifica
 * o input em `?q=` e navega client-side (com progressive enhancement — funciona
 * sem JS). Só o campo `q` é enviado, então buscar sempre volta à página 1 (o
 * `?page=` some). `defaultValue` mantém o termo visível após a busca.
 */
function SearchBar({ query }: { query: string }) {
  return (
    // Largura limitada (max-w-2xl) e alinhada à esquerda: no desktop a busca não
    // vira uma barra gigante atravessando as 3 colunas.
    <Form action="/blog" className="mt-8 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          {/* Ícone de lupa decorativo dentro do campo. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-kanglu-bordo/40"
          >
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2" />
            <path
              d="m14 14 3.5 3.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Buscar artigos..."
            aria-label="Buscar artigos"
            className="w-full rounded-full border border-kanglu-nude bg-white py-3 pl-11 pr-4 text-kanglu-bordo placeholder:text-kanglu-bordo/40 focus:border-kanglu-orange focus:outline-none focus:ring-2 focus:ring-kanglu-orange/30"
          />
        </div>

        <button
          type="submit"
          className="shrink-0 rounded-full bg-kanglu-orange px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-kanglu-orange/90"
        >
          Buscar
        </button>
      </div>

      {/* "Limpar" só aparece com busca ativa. Fica em linha própria (abaixo do
          campo) pra não apertar a linha input+botão nos ~375px do mobile. */}
      {query && (
        <Link
          href="/blog"
          className="mt-2 inline-block text-sm font-medium text-kanglu-orange hover:underline"
        >
          Limpar busca
        </Link>
      )}
    </Form>
  );
}

/** Busca sem resultados: mensagem amigável com o termo pesquisado. */
function NoResults({ query }: { query: string }) {
  return (
    <div className="mt-10 rounded-xl border border-dashed border-kanglu-nude bg-white/50 px-6 py-16 text-center">
      <p className="font-heading text-lg font-semibold text-kanglu-bordo">
        Nenhum artigo encontrado para “{query}”
      </p>
      <p className="mt-2 text-kanglu-bordo/60">
        Tente outras palavras ou{" "}
        <Link href="/blog" className="text-kanglu-orange hover:underline">
          veja todos os artigos
        </Link>
        .
      </p>
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
 * Quando há busca ativa, o `q` é preservado nos links para a paginação navegar
 * DENTRO dos resultados filtrados.
 */
function Pagination({
  currentPage,
  totalPages,
  query,
}: {
  currentPage: number;
  totalPages: number;
  query: string;
}) {
  if (totalPages <= 1) return null;

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  // Monta /blog?page=N preservando o termo de busca quando houver.
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    params.set("page", String(targetPage));
    return `/blog?${params.toString()}`;
  };

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
          href={pageHref(currentPage - 1)}
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
          href={pageHref(currentPage + 1)}
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
