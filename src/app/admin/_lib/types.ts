// Tipos que o admin recebe da API. As datas chegam como string (JSON não tem
// Date), então NÃO reaproveitamos os tipos do Prisma direto — modelamos o que
// de fato trafega pela rede.

export type ArticleStatus =
  | "draft"
  | "in_review"
  | "published"
  | "archived";

export type AdminSource = {
  id?: string; // ausente em linhas novas ainda não salvas
  title: string;
  url: string;
  accessedAt?: string;
};

export type AdminArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  status: ArticleStatus;
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  category: string | null; // slug de categoria (lib/categories); null = sem categoria
  ogImage: string | null;
  imageCredit: string | null;
  imageSourceUrl: string | null;
  imageOptions: string[]; // opções de capa pendentes de escolha (vazio = já escolhida)
  aiAssisted: boolean;
  aiModel: string | null;
  publishedAt: string | null;
  publishAt: string | null; // agendamento (ISO/UTC); null = sem agendamento
  createdAt: string;
  updatedAt: string;
  sources: AdminSource[];
};
