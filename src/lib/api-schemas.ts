import { z } from "zod";
import { MAX_HISTORY_MESSAGES, MAX_MESSAGE_CHARS } from "@/lib/chat";

// ---------------------------------------------------------------------------
// Schemas de ENTRADA (request body) compartilhados.
//
// Estes schemas Zod eram declarados inline nas próprias rotas. Foram movidos
// para cá SEM ALTERAÇÃO — cada rota importa exatamente o mesmo objeto e valida
// com o mesmo `.safeParse`, então o comportamento é idêntico. O ganho é ter uma
// FONTE ÚNICA: o gerador de OpenAPI (`lib/openapi`) converte estes mesmos
// schemas em JSON Schema (`z.toJSONSchema`), garantindo que a doc dos corpos de
// requisição reflita a validação REAL, sem duplicar nem sair de sincronia.
//
// Os schemas de artigo (createArticleInput/updateArticleInput) já viviam em
// `lib/validation` (compartilhados desde antes) e continuam lá.
// ---------------------------------------------------------------------------

/** Entrada do `POST /api/auth/login`. */
export const loginInput = z.object({
  email: z.email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

/**
 * Entrada do `POST /api/articles/generate` (geração com URLs).
 * Só `theme` é obrigatório — dá pra gerar sem fontes (o prompt segura a mão
 * contra inventar dados quando não há material).
 */
export const generateInput = z.object({
  theme: z.string().trim().min(1, "Tema é obrigatório"),
  keywords: z.array(z.string().trim().min(1)).optional(),
  urls: z.array(z.url("URL de fonte inválida")).optional(),
  // Modelos escolhidos nos seletores (opcionais). São VALIDADOS contra a lista
  // curada antes de usar — string arbitrária é descartada e cai no default.
  textModel: z.string().optional(),
  imageModel: z.string().optional(),
});

/**
 * Entrada do `POST /api/articles/generate-auto` (busca automática por tema).
 * Aqui NÃO há URLs: as fontes são buscadas pelo motor escolhido.
 */
export const generateAutoInput = z.object({
  theme: z.string().trim().min(1, "Tema é obrigatório"),
  keywords: z.array(z.string().trim().min(1)).optional(),
  // Modelos escolhidos (opcionais), VALIDADOS contra a lista curada.
  textModel: z.string().optional(),
  imageModel: z.string().optional(),
  // Motor de busca web: Firecrawl (padrão) busca e o modelo escreve; Sonar busca
  // e escreve nativamente (fluxo original). Valor inválido/ausente cai no padrão
  // (Firecrawl) — mesma filosofia leniente do seletor de modelo.
  searchEngine: z.enum(["firecrawl", "sonar"]).default("firecrawl").catch("firecrawl"),
  // Preferência por conteúdo recente na busca. Mesmo parâmetro que o cron liga
  // fixo — aqui vira escolha do editor, tema a tema.
  //
  // DEFAULT FALSE, e o `.catch` reforça: corpo ausente, campo omitido ou lixo no
  // lugar do booleano caem em desligado. É o comportamento atual do painel, que
  // não muda para quem chama a API sem o campo novo.
  recent: z.boolean().default(false).catch(false),
});

/**
 * Entrada do `POST /api/ideas`. Só `theme` (opcional): vazio → pautas gerais do
 * nicho; preenchido → pautas focadas nele. Teto de tamanho contém abuso trivial.
 */
export const ideasInput = z.object({
  theme: z.string().trim().max(200).optional(),
});

/**
 * Entrada do `POST /api/chat`. Histórico da conversa; cada mensagem é do usuário
 * ou do assistente. Tetos de tamanho/quantidade contêm abuso trivial num
 * endpoint público (o próprio lib/chat também corta as últimas N).
 */
export const chatInput = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
      }),
    )
    .min(1, "Envie ao menos uma mensagem")
    .max(MAX_HISTORY_MESSAGES * 4), // teto generoso; lib/chat usa só as últimas N
});
