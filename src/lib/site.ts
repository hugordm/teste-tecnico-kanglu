// Base de URL pública do site, num único lugar. Usada pelo metadataBase do
// layout, pelo sitemap, pelo robots e pelo JSON-LD — assim o fallback aparece
// uma vez só e não há risco de divergir entre os arquivos de SEO.
//
// Sem barra final: quem concatena caminho ("/blog/...") controla a barra.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");
