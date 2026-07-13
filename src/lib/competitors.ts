// ---------------------------------------------------------------------------
// Concorrentes da Kanglu — lista de bloqueio de domínios
// ---------------------------------------------------------------------------
//
// A Kanglu é uma plataforma de rastreamento de pedidos, notificações ao cliente
// e experiência pós-compra. Na geração por tema (busca web automática), as
// fontes vêm da internet aberta — e algumas serão de concorrentes diretos
// (rastreamento, gestão de fretes, notificações, ERPs com rastreio, hubs
// logísticos). Uma fonte cujo domínio REAL (após desembrulhar o redirect) caia
// nesta lista é descartada antes de virar fonte do artigo.
//
// Edite à vontade: adicione uma linha por domínio. O matcher bloqueia o domínio
// exato e qualquer subdomínio dele (ex.: "blog.melhorenvio.com.br").

export const COMPETITOR_DOMAINS: string[] = [
  // Gestão de fretes / etiquetas
  "melhorenvio.com.br",
  "frenet.com.br",
  "intelipost.com.br",
  "intelipost.com",
  "smartenvios.com",
  "smartenvios.com.br",
  "kangu.com.br",

  // ERPs / plataformas com rastreio
  "bling.com.br",

  // Transporte / logística
  "loggi.com",
  "loggi.com.br",

  // Rastreamento / pós-compra / notificações
  "rastreio.net",
  "edrone.me",
  "edrone.com",
  "layerup.com.br",
  "layerup.io",
  "fulwood.me",
  "fulwood.com.br",

  // Pagamentos / gateways / checkout
  "stripe.com",
  "iugu.com",
  "pagbrasil.com",
  "prax.ai",
  "yavdigital.com",
  "base.com",
  "pagseguro.com.br",
  "pagseguro.uol.com.br",
  "mercadopago.com.br",
  "mercadopago.com",
  "pagar.me",

  // E-commerce / lojas / marketplaces
  "shopify.com",
  "vtex.com",
  "vtex.com.br",
  "nuvemshop.com.br",
  "tray.com.br",

  // Plataformas de e-commerce / automação comercial / agências
  "wake.tech",
  "sweda.com.br",
  "caravel.com.br",
  "quatrocor.com.br",

  // Vídeo / redes (não é fonte adequada para artigo)
  "youtube.com",
];

/**
 * True se a URL aponta para o domínio de um concorrente (ou um subdomínio
 * dele). Normaliza o hostname (minúsculo, sem `www.`) e compara por igualdade
 * exata ou sufixo de domínio — assim "melhorenvio.com.br" bloqueia também
 * "blog.melhorenvio.com.br", mas "meumelhorenvio.com" (marca diferente) não é
 * pego por engano.
 *
 * URL malformada retorna `false` — quem chama já descarta fontes sem URL real
 * antes de chegar aqui; na dúvida, não classificamos como concorrente.
 */
export function isCompetitorUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host.startsWith("www.")) host = host.slice(4);

  return COMPETITOR_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}
