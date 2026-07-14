import Link from "next/link";
import Form from "next/form";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import {
  getPublishedArticles,
  getPublishedCategorySlugs,
  type PublicArticle,
} from "@/lib/public-articles";
import { SITE_URL } from "@/lib/site";
import {
  CATEGORIES,
  categoryLabel,
  isCategorySlug,
  type CategorySlug,
} from "@/lib/categories";

/**
 * Metadata da listagem. A canônica aponta SEMPRE para `/blog` (sem query), para
 * as páginas de busca não competirem com a listagem no índice. E páginas de
 * busca (`?q=`) recebem `noindex`: são resultados finos/duplicados, não vale
 * indexá-los — a listagem base segue indexável como antes.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string }>;
}): Promise<Metadata> {
  const { q, categoria } = await searchParams;
  const term = q?.trim();
  const category = isCategorySlug(categoria) ? categoria : undefined;

  // Busca (?q=): resultado fino/duplicado → noindex e canônica na listagem base
  // (mesma regra de antes). A busca "vence" a categoria para efeito de SEO.
  if (term) {
    return {
      title: `Busca: “${term}”`,
      description: "Artigos e novidades da Kanglu.",
      alternates: { canonical: `${SITE_URL}/blog` },
      robots: { index: false, follow: true },
    };
  }

  // Categoria é taxonomia legítima (diferente de busca): indexável, com canônica
  // própria em ?categoria= — assim a página da categoria pode ranquear sozinha.
  if (category) {
    const label = categoryLabel(category);
    return {
      title: `Categoria: ${label}`,
      description: `Artigos sobre ${label} — Kanglu.`,
      alternates: { canonical: `${SITE_URL}/blog?categoria=${category}` },
    };
  }

  return {
    title: "Blog",
    description: "Artigos e novidades da Kanglu.",
    alternates: { canonical: `${SITE_URL}/blog` },
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
  searchParams: Promise<{ page?: string; q?: string; categoria?: string }>;
}) {
  const { page: pageParam, q: qParam, categoria: catParam } = await searchParams;
  // ?page= vem como string (ou array/undefined); parse tolerante que cai em 1.
  const requestedPage = Number.parseInt(pageParam ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? requestedPage : 1;
  // ?q= é o termo de busca. Normalizamos o vazio ("" ou só espaços) para
  // "sem busca", então `/blog?q=` se comporta igual a `/blog`.
  const query = qParam?.trim() ?? "";
  // ?categoria= só vale se for um slug conhecido — qualquer outra coisa vira
  // "todas" (undefined). Assim nada arbitrário chega ao banco e a UI/canônica
  // ficam consistentes.
  const category = isCategorySlug(catParam) ? catParam : undefined;
  const categoryName = category ? categoryLabel(category) : null;

  // Em paralelo: a página de artigos + os slugs de categoria que têm conteúdo
  // publicado (pra montar só os chips não-vazios).
  const [
    { articles, page: currentPage, totalPages, total },
    availableCategories,
  ] = await Promise.all([
    getPublishedArticles({ page, pageSize: PAGE_SIZE, query, category }),
    getPublishedCategorySlugs(),
  ]);

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

        <SearchBar query={query} category={category} />

        {/* Filtro por categoria (chips). Só as categorias com conteúdo
            publicado. Preserva a busca ativa e reseta a página. Convive com
            ?q= e ?page= via query params. */}
        <CategoryFilter
          active={category}
          query={query}
          available={availableCategories}
        />

        {articles.length === 0 ? (
          query ? (
            <NoResults query={query} />
          ) : category ? (
            <NoCategoryResults label={categoryName} />
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
              category={category}
            />

            <p className="mt-6 text-center text-sm text-kanglu-bordo/50">
              {query
                ? `${total} ${total === 1 ? "resultado" : "resultados"} para “${query}”`
                : category
                  ? `${total} ${total === 1 ? "artigo" : "artigos"} em ${categoryName}`
                  : `${total} ${total === 1 ? "artigo publicado" : "artigos publicados"}`}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

/**
 * Chips de categoria: "Todos" + só as categorias COM conteúdo publicado
 * (`available`) — nada de chips vazios; ao publicar um artigo de outra
 * categoria, o chip aparece sozinho. A categoria ATIVA sempre entra (mesmo que
 * fique sem resultados por um artigo ter saído do ar), pra não sumir o filtro
 * corrente. Cada chip é um link real (SSR, rastreável, sem JS) que SETA
 * `categoria`, PRESERVA `q` e DROPA `page` (o conjunto muda → volta à pág. 1).
 * "Todos" remove `categoria`. Se não há nenhuma categoria com conteúdo, o filtro
 * inteiro some (nem o "Todos" aparece sozinho).
 */
function CategoryFilter({
  active,
  query,
  available,
}: {
  active?: CategorySlug;
  query: string;
  available: string[];
}) {
  const availableSet = new Set(available);
  // Ordem fixa da lista curada; só as que têm conteúdo (ou a ativa no momento).
  const shown = CATEGORIES.filter(
    (c) => availableSet.has(c.slug) || c.slug === active,
  );
  if (shown.length === 0) return null;

  const chipHref = (slug?: CategorySlug) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (slug) params.set("categoria", slug);
    const qs = params.toString();
    return qs ? `/blog?${qs}` : "/blog";
  };

  const base =
    "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors";
  const on = "border-kanglu-orange bg-kanglu-orange text-white";
  const off =
    "border-kanglu-nude text-kanglu-bordo/70 hover:border-kanglu-orange hover:text-kanglu-orange";

  return (
    <nav
      aria-label="Filtrar por categoria"
      className="mt-6 flex flex-wrap gap-2"
    >
      <Link
        href={chipHref()}
        aria-current={!active ? "page" : undefined}
        className={`${base} ${!active ? on : off}`}
      >
        Todos
      </Link>
      {shown.map((c) => (
        <Link
          key={c.slug}
          href={chipHref(c.slug)}
          aria-current={active === c.slug ? "page" : undefined}
          className={`${base} ${active === c.slug ? on : off}`}
        >
          {c.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Campo de busca via `next/form`: com `action` string, é um form GET que codifica
 * os campos em query e navega client-side (progressive enhancement — funciona
 * sem JS). Buscar volta à página 1 (o `?page=` não é um campo → some). Um input
 * OCULTO `categoria` preserva o filtro ativo, então a busca acontece DENTRO da
 * categoria. `defaultValue` mantém o termo visível após a busca.
 */
function SearchBar({
  query,
  category,
}: {
  query: string;
  category?: CategorySlug;
}) {
  return (
    // Largura limitada (max-w-2xl) e alinhada à esquerda: no desktop a busca não
    // vira uma barra gigante atravessando as 3 colunas.
    <Form action="/blog" className="mt-8 max-w-2xl">
      {/* Preserva a categoria ativa ao buscar (buscar dentro da categoria). */}
      {category && <input type="hidden" name="categoria" value={category} />}
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
          campo) pra não apertar a linha input+botão nos ~375px do mobile.
          Preserva a categoria ativa: limpar a busca mantém o filtro. */}
      {query && (
        <Link
          href={category ? `/blog?categoria=${category}` : "/blog"}
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
  const catLabel = categoryLabel(article.category);
  return (
    <article className="group relative flex flex-col rounded-xl border border-kanglu-nude bg-white p-6 transition-colors hover:border-kanglu-orange">
      {/* Badge da categoria. `relative z-10` fica ACIMA do overlay do título
          (after:inset-0), então é clicável por conta própria (leva ao filtro)
          sem competir com o link do card. */}
      {catLabel && (
        <Link
          href={`/blog?categoria=${article.category}`}
          className="relative z-10 mb-3 w-fit rounded-full bg-kanglu-orange/10 px-3 py-1 text-xs font-semibold text-kanglu-orange transition-colors hover:bg-kanglu-orange/20"
        >
          {catLabel}
        </Link>
      )}
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

/** Categoria sem artigos: mensagem própria com atalho para ver todos. */
function NoCategoryResults({ label }: { label: string | null }) {
  return (
    <div className="mt-10 rounded-xl border border-dashed border-kanglu-nude bg-white/50 px-6 py-16 text-center">
      <p className="font-heading text-lg font-semibold text-kanglu-bordo">
        Nenhum artigo em {label ?? "esta categoria"} ainda
      </p>
      <p className="mt-2 text-kanglu-bordo/60">
        <Link href="/blog" className="text-kanglu-orange hover:underline">
          Ver todos os artigos
        </Link>
        .
      </p>
    </div>
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
 * O `q` (busca) E a `categoria` (filtro) são preservados nos links, para a
 * paginação navegar DENTRO do recorte atual (busca + categoria).
 */
function Pagination({
  currentPage,
  totalPages,
  query,
  category,
}: {
  currentPage: number;
  totalPages: number;
  query: string;
  category?: CategorySlug;
}) {
  if (totalPages <= 1) return null;

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  // Monta /blog?page=N preservando busca e categoria quando houver.
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (category) params.set("categoria", category);
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
