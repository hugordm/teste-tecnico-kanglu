// ---------------------------------------------------------------------------
// Categorias dos artigos — FONTE ÚNICA.
//
// Modelagem por CONSTANTE (não enum do Postgres): a coluna é um `String?`
// simples e a allowlist vive aqui. Vantagens num banco COMPARTILHADO:
//  - migration aditiva mínima (só `ADD COLUMN ... TEXT`, sem criar tipo novo);
//  - evoluir a lista = editar este array, ZERO migration;
//  - a app é a única escritora e já valida tudo (Zod + normalizeCategory).
//
// Guardamos o SLUG (URL-safe) no banco e nos query params (`?categoria=slug`);
// o rótulo bonito fica só na UI, mapeado a partir daqui. Assim badge, filtro,
// editor, validação e a sugestão da IA falam todos a mesma língua.
//
// Sem "server-only": é uma constante pura (sem segredo/Prisma), então pode ser
// importada tanto no servidor quanto em Client Components (ex.: dropdown do
// editor, chips do blog).
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  { slug: "logistica", label: "Logística" },
  { slug: "e-commerce", label: "E-commerce" },
  { slug: "atendimento", label: "Atendimento" },
  { slug: "tecnologia", label: "Tecnologia" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

/** Só os slugs — usado pela validação (Zod enum) e pela sanitização de query. */
export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [
  CategorySlug,
  ...CategorySlug[],
];

/** true se a string é um slug de categoria conhecido (type guard). */
export function isCategorySlug(value: unknown): value is CategorySlug {
  return (
    typeof value === "string" &&
    CATEGORY_SLUGS.includes(value as CategorySlug)
  );
}

/** Rótulo de exibição do slug, ou null se ausente/desconhecido. */
export function categoryLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? null;
}

/**
 * Normaliza um valor cru (vindo da IA, de um form ou de um query param) para um
 * slug válido ou `null`. Aceita tanto o slug quanto o rótulo (case-insensitive,
 * com/sem acento via `label`), porque o modelo às vezes devolve "Logística" em
 * vez de "logistica". Qualquer coisa fora da lista fixa vira `null` — nunca
 * gravamos categoria inválida.
 */
export function normalizeCategory(raw: unknown): CategorySlug | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  const match = CATEGORIES.find(
    (c) => c.slug === value || c.label.toLowerCase() === value,
  );
  return match ? match.slug : null;
}
