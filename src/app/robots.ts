import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Next 16 serve isto como /robots.txt.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // O painel administrativo não deve ser indexado. (O acesso já é barrado
      // pelo proxy; aqui evitamos até que o caminho apareça em buscadores.)
      disallow: "/admin",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
