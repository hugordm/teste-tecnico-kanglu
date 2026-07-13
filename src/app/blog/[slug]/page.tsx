import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArticleBody } from "@/components/article-body";
import { TableOfContents } from "@/components/table-of-contents";
import { SiteHeader } from "@/components/site-header";
import {
  getPublishedArticleBySlug,
  type PublicArticle,
} from "@/lib/public-articles";
import { extractHeadings } from "@/lib/toc";
import { SITE_URL } from "@/lib/site";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

// Revalida no máximo a cada 60s. Um artigo agendado responde 404 até a hora;
// com ISR, passada a hora a página se re-renderiza (em até ~60s) e passa a
// servir o artigo — o agendamento "liga" sozinho, sem cron nem redeploy.
export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

/**
 * SEO por artigo. Roda no servidor antes do render, então as tags entram no
 * HTML inicial. Faz fallback title→metaTitle e excerpt→metaDescription, e só
 * emite openGraph.images / canonical quando os campos existem.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);

  // Sem artigo publicado: metadata mínima. A própria page() chama notFound().
  if (!article) {
    return { title: "Artigo não encontrado" };
  }

  const title = article.metaTitle ?? article.title;
  const description = article.metaDescription ?? article.excerpt ?? undefined;

  // Canônica: a canonicalUrl explícita (override manual), se houver; senão a
  // própria URL pública do artigo. Mesma base/regra do JSON-LD e do sitemap.
  const canonical = article.canonicalUrl ?? `${SITE_URL}/blog/${article.slug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      ...(article.ogImage ? { images: [article.ogImage] } : {}),
    },
    alternates: { canonical },
  };
}

/**
 * Monta o objeto JSON-LD schema.org/BlogPosting com dados REAIS do artigo.
 * Campos opcionais só entram se existirem — nada de null nem inventado. Como
 * JSON.stringify já descarta chaves `undefined`, description/image ausentes
 * simplesmente somem do schema.
 */
function buildBlogPostingLd(article: PublicArticle) {
  // mainEntityOfPage é a URL canônica do artigo: a canonicalUrl explícita, se
  // houver; senão a própria URL pública em /blog/{slug}.
  const canonical = article.canonicalUrl ?? `${SITE_URL}/blog/${article.slug}`;

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.metaDescription ?? article.excerpt ?? undefined,
    ...(article.publishedAt
      ? { datePublished: article.publishedAt.toISOString() }
      : {}),
    dateModified: article.updatedAt.toISOString(),
    author: { "@type": "Organization", name: "Kanglu" },
    mainEntityOfPage: canonical,
    ...(article.ogImage ? { image: article.ogImage } : {}),
  };
}

/**
 * /blog/[slug] — página do artigo. Server Component: markdown é renderizado no
 * servidor (react-markdown é puro, sem interatividade), então o conteúdo já
 * chega no HTML — ótimo para SEO e leitura sem JS.
 */
export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);

  if (!article) notFound();

  const jsonLd = buildBlogPostingLd(article);

  // Mesma extração pura usada pelo índice inline do ArticleBody — aqui alimenta o
  // índice LATERAL (sticky) do desktop. Os ids das âncoras continuam sendo postos
  // no corpo pelo ArticleMarkdown, então os dois índices (topo no mobile/tablet,
  // lateral no desktop) apontam pras mesmas seções. Só mostramos a sidebar com
  // 2+ seções (mesma regra do inline).
  const headings = extractHeadings(article.content);
  const hasToc = headings.length >= 2;

  return (
    <div className="flex flex-col flex-1">
      {/* JSON-LD BlogPosting: dados reais do artigo para rich results. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SiteHeader />

      {/* Container largo (max-w-7xl) que no DESKTOP (lg+) vira 2 colunas estilo
          HostGator: conteúdo largo à esquerda + índice sticky à direita, ocupando
          bem a tela. A coluna de texto é ~68% (1fr) e a sidebar ~26% (20rem), com
          gap generoso — juntas preenchem o container. No corpo, tipo maior
          (lg:text-xl) mantém a leitura confortável mesmo na coluna larga.
          Abaixo de lg é 1 coluna: a coluna de texto centra em max-w-2xl e o
          índice volta pro topo (via ArticleBody tocInline="mobileOnly") —
          idêntico ao aprovado. */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 sm:px-8 sm:py-14 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16 lg:py-16 xl:gap-20">
        <article className="mx-auto w-full min-w-0 max-w-2xl lg:mx-0 lg:max-w-none">
          <Link
            href="/blog"
            className="text-sm font-medium text-kanglu-orange hover:underline"
          >
            ← Voltar ao blog
          </Link>

          <h1 className="mt-6 font-heading text-3xl font-bold leading-tight text-kanglu-bordo sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            {article.title}
          </h1>

          {article.aiAssisted && (
            <p className="mt-4 rounded-lg border border-kanglu-nude bg-white px-4 py-3 text-sm text-kanglu-bordo/70">
              Rascunho assistido por IA, revisado pelo autor.
            </p>
          )}

          {/* Capa + corpo via componente COMPARTILHADO com a prévia do editor. No
              desktop o índice inline some (tocInline="mobileOnly") — a sidebar à
              direita assume; no mobile/tablet ele volta pro topo, como antes. */}
          <ArticleBody
            title={article.title}
            content={article.content}
            ogImage={article.ogImage}
            imageCredit={article.imageCredit}
            imageSourceUrl={article.imageSourceUrl}
            publishedAt={article.publishedAt}
            tocInline="mobileOnly"
          />

          <SourcesSection sources={article.sources} />
        </article>

        {/* Índice LATERAL — só no desktop (lg+) e só com 2+ seções. Coluna com
            presença (card estilizado) e sticky, acompanhando o scroll da leitura. */}
        {hasToc && (
          <aside className="hidden lg:block">
            <div className="sticky top-8">
              <TableOfContents entries={headings} variant="sidebar" />
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}

/**
 * "Fontes e referências" — SEMPRE visível quando há fontes. Cada fonte é um
 * link para a url original (rel noopener noreferrer por segurança) com a data
 * de acesso. Transparência editorial exigida pelo teste.
 */
function SourcesSection({
  sources,
}: {
  sources: { id: string; title: string; url: string; accessedAt: Date }[];
}) {
  if (sources.length === 0) return null;

  return (
    <section className="mt-12 border-t border-kanglu-nude pt-6">
      <h2 className="font-heading text-lg font-semibold text-kanglu-bordo">
        Fontes e referências
      </h2>
      <ul className="mt-4 space-y-3">
        {sources.map((source) => (
          <li key={source.id} className="text-sm">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-kanglu-orange underline decoration-kanglu-orange/40 underline-offset-2 hover:decoration-kanglu-orange"
            >
              {source.title}
            </a>
            <span className="ml-2 text-kanglu-bordo/50">
              acesso em{" "}
              <time dateTime={source.accessedAt.toISOString()}>
                {dateFmt.format(source.accessedAt)}
              </time>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
