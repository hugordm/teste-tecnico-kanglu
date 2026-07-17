// ---------------------------------------------------------------------------
// Recência da busca — PREFERÊNCIA por recente, não janela dura.
//
// A primeira versão usava uma janela dura de 6 meses (tbs `cdr:...`). Medindo,
// isso QUEBRAVA temas evergreen (pós-venda, fidelização): os melhores artigos
// são mais velhos que 6 meses, a janela os cortava e sobrava lixo recente e
// off-topic. Solução (validada no /v2/search): trocar por PREFERÊNCIA por data.
//
//   - Firecrawl: `sbd:1,qdr:y` — "sort by date" dentro do último ano. Ordena
//     recentes-primeiro sem cegar a busca pro material evergreen bom (o ano é só
//     um teto de sanidade). No teste do tema que degradou, foi o que trouxe mais
//     fontes relevantes (3/6) contra 1/6 da janela dura.
//   - Sonar (perplexity, via OpenRouter): `search_recency_filter: "year"` — o
//     análogo mais próximo (último ano). Verificado respeitando o filtro.
//
// A ATUALIDADE do ângulo continua garantida pela pauta (que injeta a data de
// hoje); a busca só não é mais cega ao evergreen. Não classificamos o tema como
// "noticioso x atemporal" de propósito — seria mais uma heurística para errar.
// ---------------------------------------------------------------------------

/** Valor `tbs` do Firecrawl: ordena por data, dentro do último ano. */
export const FIRECRAWL_RECENCY_TBS = "sbd:1,qdr:y";

/** Filtro de recência do Sonar (perplexity): último ano. */
export const SONAR_RECENCY_FILTER = "year";
