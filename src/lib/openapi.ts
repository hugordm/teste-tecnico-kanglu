import { z } from "zod";
import { AUTH_COOKIE } from "@/lib/auth";
import { CATEGORY_SLUGS } from "@/lib/categories";
import {
  createArticleInput,
  updateArticleInput,
} from "@/lib/validation";
import {
  loginInput,
  generateInput,
  generateAutoInput,
  ideasInput,
  chatInput,
} from "@/lib/api-schemas";

// ---------------------------------------------------------------------------
// Documento OpenAPI 3.1 do projeto — gerado de forma HÍBRIDA.
//
//  - REQUEST BODIES: derivados dos MESMOS schemas Zod que as rotas usam para
//    validar, via `z.toJSONSchema` (OpenAPI 3.1 == JSON Schema 2020-12, que o
//    Zod 4 emite nativamente). Fonte única: a doc dos corpos reflete a validação
//    real, sem duplicação nem drift.
//  - PATHS / QUERY PARAMS / RESPONSES / AUTH: escritos à mão, porque os handlers
//    devolvem JSON ad-hoc (não há schema de saída). Documentamos os status REAIS
//    (200/201/400/401/404/409/422/502) como realmente acontecem.
//
// Servido por `GET /api/openapi` e renderizado pelo Scalar em `/api-doc`.
// ---------------------------------------------------------------------------

/**
 * Converte um schema Zod em JSON Schema para o corpo de requisição.
 * `io: "input"` documenta o que o CLIENTE envia (campos com `.default()` viram
 * opcionais, como na prática). `unrepresentable: "any"` evita que tipos sem
 * equivalente em JSON Schema (ex.: `z.coerce.date`) quebrem a geração. Removemos
 * a chave `$schema` (ruído dentro de um componente OpenAPI).
 */
function body(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

/** Corpo de requisição JSON (obrigatório) a partir de um schema Zod. */
function jsonBody(schema: z.ZodType) {
  return {
    required: true,
    content: { "application/json": { schema: body(schema) } },
  };
}

/** Resposta JSON com uma descrição (shape genérico quando não formalizado). */
function jsonResponse(
  description: string,
  schema: Record<string, unknown> = { type: "object" },
) {
  return {
    description,
    content: { "application/json": { schema } },
  };
}

/** Respostas de erro comuns, reutilizadas entre endpoints. */
const ERR = {
  badRequest: jsonResponse("Dados malformados (falha de schema/zod)."),
  unauthorized: jsonResponse("Não autenticado (sem cookie JWT válido)."),
  notFound: jsonResponse("Recurso não encontrado."),
  aiFailure: jsonResponse("Falha da IA — mensagem amigável, nada é criado."),
};

/** Marca um endpoint como exigindo o cookie de admin. */
const ADMIN_SECURITY = [{ cookieAuth: [] as string[] }];

/**
 * Monta o documento OpenAPI 3.1 completo. Puro (sem I/O): pode ser chamado no
 * handler de `GET /api/openapi` a cada request sem custo relevante.
 */
export function buildOpenApiDocument(): Record<string, unknown> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  return {
    openapi: "3.1.0",
    info: {
      title: "Kanglu — API do gerador de artigos",
      version: "1.0.0",
      description:
        "API do painel e do blog público da Kanglu. As rotas de escrita/admin " +
        "exigem o cookie JWT `httpOnly` (faça login em `POST /api/auth/login`). " +
        "O chat e as rotas públicas do blog não exigem autenticação. " +
        "Referência estática complementar no `API.md` do repositório.",
    },
    // Mesma origem: o \"Try it out\" mira o próprio host e reaproveita o cookie de
    // sessão do admin logado. A URL de produção entra só como referência.
    servers: [
      { url: "/", description: "Mesma origem (dev e produção)" },
      ...(siteUrl ? [{ url: siteUrl, description: "Produção" }] : []),
    ],
    tags: [
      { name: "Autenticação", description: "Login do admin (emite o cookie JWT)." },
      { name: "Artigos", description: "CRUD de artigos e portão de publicação (admin)." },
      { name: "Geração (IA)", description: "Geração de texto/imagem e lista de modelos (admin)." },
      { name: "Utilidades (IA)", description: "Sugestão de pautas (admin) e chatbot público." },
      { name: "Automação (cron)", description: "Publicação diária automática (Vercel Cron)." },
      { name: "Blog público", description: "Páginas públicas (retornam HTML/XML)." },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: AUTH_COOKIE,
          description:
            "JWT `httpOnly` emitido por `POST /api/auth/login`. O navegador o " +
            "envia automaticamente nas requisições de mesma origem.",
        },
        // O cron NÃO usa o cookie do admin: quem o aciona é a Vercel, sem
        // sessão. A autenticação é um Bearer com o valor da env CRON_SECRET,
        // que a Vercel injeta no header ao disparar o agendamento.
        cronBearer: {
          type: "http",
          scheme: "bearer",
          description:
            "`Authorization: Bearer <CRON_SECRET>`. A Vercel injeta este header " +
            "ao acionar o cron. Sem a env `CRON_SECRET` configurada, a rota " +
            "recusa TUDO (responde `500`) em vez de ficar aberta.",
        },
      },
    },
    paths: {
      // ------------------------------------------------------------------ Auth
      "/api/auth/login": {
        post: {
          tags: ["Autenticação"],
          summary: "Login do admin",
          description:
            "Valida as credenciais (env `ADMIN_EMAIL`/`ADMIN_PASSWORD`) e " +
            "devolve um JWT no cookie `httpOnly`.",
          requestBody: jsonBody(loginInput),
          responses: {
            "200": jsonResponse("Autenticado (+ cookie de sessão).", {
              type: "object",
              properties: { ok: { type: "boolean" }, email: { type: "string" } },
            }),
            "400": ERR.badRequest,
            "401": jsonResponse("Credenciais inválidas."),
            "500": jsonResponse("Credenciais de admin não configuradas no servidor."),
          },
        },
      },

      // -------------------------------------------------------------- Articles
      "/api/articles": {
        get: {
          tags: ["Artigos"],
          summary: "Lista artigos",
          security: ADMIN_SECURITY,
          parameters: [
            {
              name: "status",
              in: "query",
              required: false,
              description: "Filtra por status.",
              schema: {
                type: "string",
                enum: ["draft", "in_review", "published", "archived"],
              },
            },
          ],
          responses: {
            "200": jsonResponse("Lista de artigos (com fontes)."),
            "400": jsonResponse("Status inválido."),
            "401": ERR.unauthorized,
          },
        },
        post: {
          tags: ["Artigos"],
          summary: "Cria um artigo (manual)",
          description:
            "Cria sempre como `draft` (o status não é aceito aqui). Aceita " +
            "`category` (slug da lista fixa) e fontes aninhadas. `publishAt` no " +
            "passado é recusado com `400` — na criação não há valor anterior a " +
            "preservar, então todo agendamento é novo e precisa ser futuro.",
          security: ADMIN_SECURITY,
          requestBody: jsonBody(createArticleInput),
          responses: {
            "201": jsonResponse("Artigo criado (draft, com fontes)."),
            "400": ERR.badRequest,
            "401": ERR.unauthorized,
          },
        },
      },
      "/api/articles/{id}": {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        get: {
          tags: ["Artigos"],
          summary: "Detalhe de um artigo",
          security: ADMIN_SECURITY,
          responses: {
            "200": jsonResponse("Artigo com fontes."),
            "401": ERR.unauthorized,
            "404": ERR.notFound,
          },
        },
        patch: {
          tags: ["Artigos"],
          summary: "Atualiza um artigo (parcial)",
          description:
            "Atualização parcial. `status` aceita apenas `draft`/`in_review`/" +
            "`archived` — NUNCA `published` (publicar é só via `/publish`). " +
            "`sources`, se enviadas, substituem o conjunto atual. Aceita " +
            "`publishAt` (agendamento, ISO 8601), `category` e a seleção de capa. " +
            "**Agendamento no passado é recusado com `400`**, mas SÓ quando o " +
            "valor MUDA: reenviar o `publishAt` já gravado (o caso de todo " +
            "artigo do cron depois das 09:00) continua salvando normalmente, " +
            "senão a trava impediria editar qualquer artigo antigo. A " +
            "comparação usa o instante do request, com 60s de tolerância para " +
            "a granularidade de minuto do seletor.",
          security: ADMIN_SECURITY,
          requestBody: jsonBody(updateArticleInput),
          responses: {
            "200": jsonResponse("Artigo atualizado."),
            "400": jsonResponse(
              "Dados malformados (inclui tentativa de setar `published`) ou " +
                "novo `publishAt` no passado.",
            ),
            "401": ERR.unauthorized,
            "404": ERR.notFound,
          },
        },
        delete: {
          tags: ["Artigos"],
          summary: "Remove um artigo",
          description: "Remove o artigo e suas fontes (cascata).",
          security: ADMIN_SECURITY,
          responses: {
            "200": jsonResponse("Removido.", {
              type: "object",
              properties: { ok: { type: "boolean" } },
            }),
            "401": ERR.unauthorized,
            "404": ERR.notFound,
          },
        },
      },
      "/api/articles/{id}/publish": {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        post: {
          tags: ["Artigos"],
          summary: "Publica um artigo (portão)",
          description:
            "Único caminho para `published`. Exige ao menos 1 fonte com URL " +
            "válida — do contrário, `422`.",
          security: ADMIN_SECURITY,
          responses: {
            "200": jsonResponse("Publicado."),
            "401": ERR.unauthorized,
            "404": ERR.notFound,
            "422": jsonResponse("Sem fonte válida.", {
              type: "object",
              properties: { code: { const: "NO_VALID_SOURCE" } },
            }),
          },
        },
      },
      "/api/articles/{id}/regenerate": {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        post: {
          tags: ["Artigos"],
          summary: "Regenera o rascunho",
          description:
            "Refaz `content`/`excerpt` a partir das MESMAS fontes. Só em " +
            "rascunhos (senão `409`).",
          security: ADMIN_SECURITY,
          responses: {
            "200": jsonResponse("Rascunho regenerado."),
            "401": ERR.unauthorized,
            "404": ERR.notFound,
            "409": jsonResponse("O artigo não é um rascunho."),
            "502": ERR.aiFailure,
          },
        },
      },

      // ------------------------------------------------------------- Geração IA
      "/api/articles/generate": {
        post: {
          tags: ["Geração (IA)"],
          summary: "Gera a partir de URLs",
          description:
            "Extrai o texto das `urls` (Readability + linkedom) e gera o " +
            "rascunho com o modelo escolhido. Também sugere `category` e gera 4 " +
            "opções de capa. `textModel`/`imageModel` são validados contra a " +
            "lista curada (id inválido cai no default).",
          security: ADMIN_SECURITY,
          requestBody: jsonBody(generateInput),
          responses: {
            "201": jsonResponse("Draft criado (fontes, categoria sugerida, imagens)."),
            "400": ERR.badRequest,
            "401": ERR.unauthorized,
            "502": ERR.aiFailure,
          },
        },
      },
      "/api/articles/generate-auto": {
        post: {
          tags: ["Geração (IA)"],
          summary: "Gera por tema (busca automática)",
          description:
            "Um MOTOR de busca encontra as fontes; concorrentes são filtrados; " +
            "o rascunho é ancorado nas fontes válidas. `searchEngine`: " +
            "`firecrawl` (padrão — busca via API direta e o modelo escolhido " +
            "escreve) ou `sonar` (busca+escreve nativo). Se o Firecrawl falhar " +
            "ou não achar fonte, cai automaticamente no Sonar (fallback). " +
            "`textModel` é validado conforme o motor (Firecrawl aceita qualquer " +
            "modelo; Sonar só robustos). Também sugere `category` e gera 4 capas. " +
            "`recent` (booleano, **default `false`**) é o MESMO parâmetro que o " +
            "cron liga fixo: preferência por conteúdo recente — `sbd:1,qdr:y` " +
            "(ordena por data no último ano) no Firecrawl e " +
            "`search_recency_filter: \"year\"` no Sonar. NÃO é janela dura: " +
            "prioriza o recente sem cegar o material evergreen. Ligado, também " +
            "ativa o scrape das citações no fallback Sonar (mesma régua de " +
            "conteúdo do Firecrawl). Só um booleano de verdade liga — qualquer " +
            "outro valor cai em `false`.",
          security: ADMIN_SECURITY,
          requestBody: jsonBody(generateAutoInput),
          responses: {
            "201": jsonResponse("Draft criado."),
            "400": ERR.badRequest,
            "401": ERR.unauthorized,
            "422": jsonResponse(
              "Nenhuma fonte válida encontrada (após o fallback); a mensagem " +
                "orienta usar Sonar/modelo robusto ou a geração manual.",
            ),
            "502": ERR.aiFailure,
          },
        },
      },
      "/api/articles/{id}/generate-image": {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        post: {
          tags: ["Geração (IA)"],
          summary: "Gera 4 novas capas",
          description:
            "Gera 4 opções de capa (Nano Banana 2) em paralelo, sobe no Vercel " +
            "Blob e as associa (a 1ª vira capa). Descarta do Blob as opções " +
            "anteriores não usadas. Aceita `imageModel` (opcional).",
          security: ADMIN_SECURITY,
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    imageModel: {
                      type: "string",
                      description: "Id do modelo de imagem (validado; opcional).",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": jsonResponse("Artigo com as novas opções."),
            "401": ERR.unauthorized,
            "404": ERR.notFound,
            "502": jsonResponse("Todas as gerações/uploads falharam (artigo intacto)."),
          },
        },
      },
      "/api/models": {
        get: {
          tags: ["Geração (IA)"],
          summary: "Lista curada de modelos",
          description:
            "Modelos da OpenRouter para os seletores (cache 6h; fallback fixo). " +
            "`text` = lista ampla (URLs e generate-auto/Firecrawl); `textWeb` = " +
            "lista robusta (generate-auto/Sonar); `image` = lista de imagem.",
          security: ADMIN_SECURITY,
          responses: {
            "200": jsonResponse("Listas curadas + defaults.", {
              type: "object",
              properties: {
                text: { type: "array", items: { type: "object" } },
                textWeb: { type: "array", items: { type: "object" } },
                image: { type: "array", items: { type: "object" } },
                defaults: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    textWeb: { type: "string" },
                    image: { type: "string" },
                  },
                },
              },
            }),
            "401": ERR.unauthorized,
          },
        },
      },

      // ----------------------------------------------------------- Utilidades IA
      "/api/ideas": {
        post: {
          tags: ["Utilidades (IA)"],
          summary: "Sugere pautas",
          description:
            "Sugere ~5 pautas (título + 3-5 palavras-chave) no nicho da Kanglu " +
            "(opcionalmente focadas num tema). Não cria nada — as pautas são efêmeras.",
          security: ADMIN_SECURITY,
          requestBody: jsonBody(ideasInput),
          responses: {
            "200": jsonResponse("Lista de pautas (título + palavras-chave).", {
              type: "object",
              properties: {
                ideas: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      keywords: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            }),
            "400": ERR.badRequest,
            "401": ERR.unauthorized,
            "502": ERR.aiFailure,
          },
        },
      },
      "/api/chat": {
        post: {
          tags: ["Utilidades (IA)"],
          summary: "Chatbot do blog (público)",
          description:
            "PÚBLICO (sem auth). Responde dúvidas sobre os artigos PUBLICADOS, " +
            "com contexto montado do banco e escopo limitado. A última mensagem " +
            "deve ser do usuário. Resposta em texto simples.",
          requestBody: jsonBody(chatInput),
          responses: {
            "200": jsonResponse("Resposta do assistente.", {
              type: "object",
              properties: { reply: { type: "string" } },
            }),
            "400": jsonResponse("Entrada inválida (ou última mensagem não é do usuário)."),
            "502": ERR.aiFailure,
          },
        },
      },

      // ------------------------------------------------------- Automação (cron)
      "/api/cron/daily-article": {
        get: {
          tags: ["Automação (cron)"],
          summary: "Publicação diária automática",
          description:
            "Acionada pelo Vercel Cron (`vercel.json`: `0 18 * * *` = 18:00 UTC " +
            "= 15:00 BRT). Gera de tarde de propósito: o artigo é AGENDADO para " +
            "as 09:00 BRT do dia seguinte (`publishAt` = 12:00 UTC de amanhã), " +
            "deixando a noite como janela de veto humano.\n\n" +
            "Fluxo: (1) autentica pelo Bearer; (2) IDEMPOTÊNCIA pelo SLOT — se " +
            "já existe um `cron-daily` agendado para o slot de amanhã, devolve " +
            "`skipped` sem recriar; (3) pede 5 pautas à IA, passando os títulos " +
            "dos últimos 20 artigos para não repetir tema, e escolhe a primeira " +
            "que não colide com o histórico; (4) gera o rascunho por tema com " +
            "`recent` ligado (Firecrawl, com fallback para Sonar + scrape das " +
            "citações); (5) aplica os portões de extensão e relevância — se " +
            "falharem, mantém como draft e NÃO publica; (6) publica pelo MESMO " +
            "portão da rota humana (`lib/publish`, regra “≥1 fonte válida”).\n\n" +
            "GET sem efeito colateral seguro: NÃO é idempotente por natureza " +
            "(cria artigo), mas o passo 2 garante que reexecuções da mesma " +
            "rodada não dupliquem. É GET porque é o que o Vercel Cron dispara.",
          security: [{ cronBearer: [] as string[] }],
          responses: {
            "200": jsonResponse(
              "Três formatos possíveis, todos 200: `published: true` (criado, " +
                "publicado e agendado), `skipped: true` (já havia artigo para o " +
                "slot) ou `published: false` (criado como draft e NÃO publicado " +
                "— texto curto, fora do tema, ou o portão barrou).",
              {
                type: "object",
                properties: {
                  published: { type: "boolean" },
                  skipped: { type: "boolean" },
                  reason: {
                    type: "string",
                    description:
                      "`already-scheduled-for-slot` (skipped) ou o motivo de " +
                      "não publicar: `too_short`, `off_topic`, `no_valid_source`.",
                  },
                  slot: { type: "string", description: "Slot de publicação (ISO)." },
                  theme: { type: "string", description: "Pauta escolhida." },
                  article: { type: "object" },
                  diag: {
                    type: "object",
                    description: "Instrumentação ecoada para os logs do cron.",
                    properties: {
                      engine: {
                        type: "string",
                        enum: ["firecrawl", "sonar-scraped", "sonar-native"],
                        description: "Por qual caminho as fontes vieram.",
                      },
                      sourceCount: { type: "integer" },
                      words: { type: "integer" },
                      sections: { type: "integer" },
                      themeRepeat: {
                        type: "boolean",
                        description:
                          "TODAS as pautas do dia colidiram com o histórico e o " +
                          "cron seguiu com a menos parecida (tema forçado). " +
                          "Sinal para olhar esse artigo na revisão.",
                      },
                      themeOverlap: {
                        type: "number",
                        description:
                          "Sobreposição da pauta escolhida com o histórico (0–1). " +
                          "Limiar de repetição: 0,35 (Jaccard sobre palavras " +
                          "significativas — ver `lib/theme-overlap`).",
                      },
                      historyTitles: {
                        type: "integer",
                        description: "Quantos títulos entraram na comparação (até 20).",
                      },
                      ms: {
                        type: "object",
                        properties: {
                          pauta: { type: "integer" },
                          geracao: { type: "integer" },
                          imagens: { type: "integer" },
                          total: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            ),
            "401": jsonResponse("Segredo ausente ou errado."),
            "500": jsonResponse("`CRON_SECRET` não configurada no ambiente."),
            "502": jsonResponse(
              "A pauta ou a geração da IA falhou — nada é criado. Inclui o " +
                "`budget_exceeded`: o Firecrawl queimou o orçamento e o fallback " +
                "Sonar não foi iniciado para não estourar os 60s da função.",
            ),
          },
        },
      },

      // ---------------------------------------------------------- Blog público
      "/blog": {
        get: {
          tags: ["Blog público"],
          summary: "Listagem do blog (HTML)",
          description:
            "Página SSR dos artigos publicados. Query params coexistem. Retorna " +
            "HTML.",
          parameters: [
            {
              name: "page",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1 },
              description: "Paginação.",
            },
            {
              name: "q",
              in: "query",
              required: false,
              schema: { type: "string" },
              description:
                "Busca por título/excerpt (folding de acentos e caixa). " +
                "Páginas de busca recebem `noindex`.",
            },
            {
              name: "categoria",
              in: "query",
              required: false,
              schema: { type: "string", enum: [...CATEGORY_SLUGS] },
              description:
                "Filtro por categoria (slug da lista fixa; valor inválido é " +
                "ignorado).",
            },
          ],
          responses: { "200": htmlResponse("Página da listagem.") },
        },
      },
      "/blog/{slug}": {
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
        ],
        get: {
          tags: ["Blog público"],
          summary: "Página do artigo (HTML)",
          description:
            "Artigo publicado e visível. Slug de rascunho, agendado ainda " +
            "invisível ou inexistente → 404.",
          responses: {
            "200": htmlResponse("Página do artigo."),
            "404": htmlResponse("Artigo não encontrado / não visível."),
          },
        },
      },
      "/": {
        get: {
          tags: ["Blog público"],
          summary: "Home (HTML)",
          description: "Landing: hero, recursos e os últimos artigos publicados.",
          responses: { "200": htmlResponse("Home.") },
        },
      },
      "/sitemap.xml": {
        get: {
          tags: ["Blog público"],
          summary: "Sitemap (XML)",
          description: "Sitemap dinâmico dos artigos publicados e visíveis.",
          responses: { "200": xmlResponse("Sitemap XML.") },
        },
      },
      "/robots.txt": {
        get: {
          tags: ["Blog público"],
          summary: "robots.txt",
          description: "Permite indexação, bloqueia `/admin`, aponta o sitemap.",
          responses: {
            "200": {
              description: "robots.txt",
              content: { "text/plain": { schema: { type: "string" } } },
            },
          },
        },
      },
    },
  };
}

/** Resposta HTML (páginas do blog). */
function htmlResponse(description: string) {
  return { description, content: { "text/html": { schema: { type: "string" } } } };
}

/** Resposta XML (sitemap). */
function xmlResponse(description: string) {
  return {
    description,
    content: { "application/xml": { schema: { type: "string" } } },
  };
}
