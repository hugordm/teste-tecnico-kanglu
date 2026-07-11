import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArticleMarkdown } from "@/components/article-markdown";
import { SiteHeader } from "@/components/site-header";
import {
  getPublishedArticleBySlug,
  type PublicArticle,
} from "@/lib/public-articles";
import { SITE_URL } from "@/lib/site";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

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

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      ...(article.ogImage ? { images: [article.ogImage] } : {}),
    },
    ...(article.canonicalUrl
      ? { alternates: { canonical: article.canonicalUrl } }
      : {}),
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

  return (
    <div className="flex flex-col flex-1">
      {/* JSON-LD BlogPosting: dados reais do artigo para rich results. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SiteHeader />

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        <article>
          <Link
            href="/blog"
            className="text-sm font-medium text-kanglu-orange hover:underline"
          >
            ← Voltar ao blog
          </Link>

          <h1 className="mt-6 font-heading text-3xl font-bold leading-tight text-kanglu-bordo sm:text-4xl">
            {article.title}
          </h1>

          {article.publishedAt && (
            <time
              dateTime={article.publishedAt.toISOString()}
              className="mt-3 block text-sm text-kanglu-bordo/50"
            >
              {dateFmt.format(article.publishedAt)}
            </time>
          )}

          {article.aiAssisted && (
            <p className="mt-4 rounded-lg border border-kanglu-nude bg-white px-4 py-3 text-sm text-kanglu-bordo/70">
              Rascunho assistido por IA, revisado pelo autor.
            </p>
          )}

          {/* Corpo em markdown, estilizado com as cores da marca. */}
          <div className="mt-8">
            <ArticleMarkdown content={article.content} />
          </div>

          {article.imageCredit && (
            <p className="mt-8 text-xs text-kanglu-bordo/50">
              Crédito da imagem:{" "}
              {article.imageSourceUrl ? (
                <a
                  href={article.imageSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-kanglu-orange hover:underline"
                >
                  {article.imageCredit}
                </a>
              ) : (
                article.imageCredit
              )}
            </p>
          )}

          <SourcesSection sources={article.sources} />
        </article>
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
