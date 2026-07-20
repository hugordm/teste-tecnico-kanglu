import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { getPublishedArticlesForSitemap } from "@/lib/public-articles";
import { publicPublishedAt } from "@/lib/article-date";

// Sem isto o Next congela o sitemap no build (a query ao banco não é uma
// request-time API, então ele prerenderiza estático). Como artigos são
// publicados em runtime pelo painel, forçamos geração dinâmica para o sitemap
// refletir o que está publicado AGORA, sem depender de novo deploy.
export const dynamic = "force-dynamic";

// Next 16 serve isto como /sitemap.xml. É async porque consulta o banco — o
// que também opta a rota por geração dinâmica, mantendo o sitemap sempre em dia
// com o que está publicado (sem precisar rebuild a cada artigo).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Só artigos publicados entram — rascunho/em revisão jamais (filtro reusado
  // do helper). Cada um vira /blog/{slug} com lastModified.
  const articles = await getPublishedArticlesForSitemap();

  // lastmod = a data mais recente entre "ficou público" e "última edição". No
  // artigo agendado o updatedAt sozinho ficaria ANTES da URL sequer existir
  // (editado em 17/07, público só em 18/07) — anunciar isso ao crawler é
  // errado. Nos demais casos o updatedAt continua mandando, como antes.
  const articleEntries: MetadataRoute.Sitemap = articles.map((a) => {
    const publishedOn = publicPublishedAt(a);
    return {
      url: `${SITE_URL}/blog/${a.slug}`,
      lastModified:
        publishedOn && publishedOn > a.updatedAt ? publishedOn : a.updatedAt,
      changeFrequency: "monthly",
      priority: 0.7,
    };
  });

  // Rotas estáticas públicas. A home e a listagem do blog.
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/blog`,
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  return [...staticEntries, ...articleEntries];
}
