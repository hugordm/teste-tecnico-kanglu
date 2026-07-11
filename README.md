# Kanglu — Gerador de artigos SEO

Aplicação web para **gerar, revisar e publicar artigos de blog** com rastreabilidade de fontes e boas práticas de SEO. Um administrador gera rascunhos assistidos por IA a partir de um tema e de URLs de referência, revisa o conteúdo, gerencia as fontes e publica — e os artigos aparecem em uma área pública otimizada para SEO.

Projeto desenvolvido como teste técnico para a vaga de Desenvolvedor(a) Fullstack Júnior na Kanglu.

- **Demo:** `[COLAR URL DE PRODUÇÃO AQUI APÓS O DEPLOY]`
- **Blog público:** `[URL]/blog`
- **Painel admin:** `[URL]/admin`
- **Credenciais de teste (admin):** `admin@kanglu.test` / `kanglu123`
- **Documentação da API:** ver [`API.md`](./API.md)

> **Disclaimer de IA:** os rascunhos são gerados com assistência de IA (modelo `google/gemini-3.1-flash-lite` via OpenRouter) e **revisados manualmente pelo autor** antes da publicação. Cada afirmação factual é ancorada em fontes reais e verificáveis, listadas ao final de cada artigo.

---

## Stack

| Camada | Tecnologia | Motivo |
|---|---|---|
| Framework | **Next.js 16 (App Router)** | Front-end e back-end no mesmo projeto; SSR/SSG nativo para SEO; deploy de um clique na Vercel |
| Linguagem | **TypeScript** | Type-safety de ponta a ponta |
| Banco | **PostgreSQL** + **Prisma 6** | ORM com migrations versionadas e seed simples |
| Autenticação | **jose** (JWT) | Funciona em qualquer runtime do Next (inclusive edge) |
| Validação | **zod** | Validação de entrada type-safe com erros estruturados |
| Geração IA | **OpenRouter** (`gemini-3.1-flash-lite`) | Endpoint OpenAI-compatible; modelo econômico e configurável via env |
| Extração de fontes | **@mozilla/readability** + **jsdom** | Extrai o texto principal de páginas web |
| Renderização | **react-markdown** + **remark-gfm** | Renderiza o markdown dos artigos com HTML semântico |
| Estilo | **Tailwind CSS v4** | Tokens da identidade Kanglu no `@theme` |

---

## Como rodar do zero

Pré-requisitos: Node.js 20+, um banco PostgreSQL e (opcionalmente) uma chave da OpenRouter.

```bash
# 1. Clonar e instalar
git clone https://github.com/hugordm/teste-tecnico-kanglu.git
cd teste-tecnico-kanglu
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# preencha o .env (ver seção abaixo)

# 3. Aplicar o schema no banco
npx prisma migrate dev

# 4. Popular com os 3 artigos de exemplo
npm run seed

# 5. Rodar
npm run dev
# http://localhost:3000
```

O projeto sobe em menos de 15 minutos seguindo estes passos.

### Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão do PostgreSQL |
| `JWT_SECRET` | Segredo para assinar os JWT (gere com `openssl rand -base64 32`) |
| `ADMIN_EMAIL` | E-mail de login do admin |
| `ADMIN_PASSWORD` | Senha de login do admin |
| `OPENROUTER_API_KEY` | Chave da OpenRouter para geração de rascunhos |
| `OPENROUTER_MODEL` | Modelo (padrão: `google/gemini-3.1-flash-lite`) |
| `NEXT_PUBLIC_SITE_URL` | URL pública do site (para OG, canonical e sitemap absolutos) |

---

## Arquitetura e decisões técnicas

### Um único app: front-end e back-end juntos

Não há back-end separado. As rotas de API vivem em `src/app/api/**/route.ts` e rodam no runtime **Node** do próprio Next. Isso mantém CRUD, autenticação, geração por IA e o portão de publicação num único projeto, com **um único deploy**. Um servidor Express à parte seria over-engineering para o escopo (dois projetos, dois deploys, duas superfícies de falha). Se o produto crescesse — workers pesados, escala independente — o back-end seria extraído; para um MVP, o monolito é a escolha certa.

### Prisma 6 (fixado, não 7)

O Prisma 7 trouxe breaking changes (a URL de conexão saiu do `schema.prisma` para um `prisma.config.ts` e o `PrismaClient` passou a exigir driver adapters obrigatórios). Para um MVP com prazo curto, fixei a linha **6.x** estável, que funciona com o schema padrão e tem documentação madura. Decisão de estabilidade sobre novidade.

### Estados do artigo e o "portão" de publicação

O artigo tem quatro estados: `draft → in_review → published` (+ `archived`). O `in_review` é o rascunho pronto aguardando aprovação — destacado no painel.

A regra central: **o único caminho para `published` é `POST /api/articles/[id]/publish`**, que valida as fontes antes de publicar. As demais rotas não atingem esse estado:

- No `POST /articles`, todo artigo nasce `draft`.
- No `PATCH /articles/[id]`, o schema de update **não aceita** o valor `published` (só `draft`, `in_review`, `archived`).

Assim, é impossível por construção publicar sem passar pela validação de fontes.

### Validação: 422 vs 400

- **400 (Bad Request)** — dados malformados (validação de schema com zod). Ex.: título ausente, URL de fonte inválida.
- **422 (Unprocessable Entity)** — dados bem formados, mas que violam uma **regra de negócio**: publicar sem ao menos uma fonte com URL `http`/`https` válida. A resposta inclui `code: "NO_VALID_SOURCE"`.

Publicar sem fonte não é erro de formatação — é uma regra de negócio sendo respeitada. Daí o status distinto.

### Fontes como relação, não JSON

As fontes (`Source`) são uma tabela relacionada ao artigo, não um campo JSON. Isso permite **validar** (contar fontes válidas antes de publicar) e **exibir** a seção de referências com integridade referencial. Na edição, o conjunto de fontes é substituído (`deleteMany` + `create`) para evitar duplicatas ou órfãs.

### Autenticação single-admin

O escopo pede autenticação simples. Optei por um único admin com credenciais no `.env` e JWT em cookie `httpOnly` (protege contra leitura por JavaScript / XSS). Não há tabela `User` — seria over-engineering para um MVP single-admin. Num cenário multiusuário, eu adicionaria a tabela `User` com hash de senha (bcrypt/argon2) e comparação com `timingSafeEqual`.

As rotas `/admin/*` são protegidas por `src/proxy.ts` (o antigo `middleware.ts`, renomeado no Next 16), que verifica o JWT no edge e redireciona para o login antes da página carregar.

### Geração por IA: responsável e com fallback

`POST /api/articles/generate` recebe tema + palavras-chave + URLs:

1. **Extração** (`src/lib/extract.ts`): baixa cada URL com timeout (8s) e limite de tamanho, extrai o texto principal com Readability, e roda as URLs em paralelo com `Promise.allSettled` (uma fonte que falha não derruba as outras).
2. **Geração** (`src/lib/ai.ts`): monta um **system prompt anti-invenção** rígido — o modelo só afirma o que está nas fontes; toda estatística/número/citação deve vir das fontes; é proibido inventar dados. Usa `temperature: 0.4` e valida a saída com zod (não confia no JSON do modelo).
3. **Persistência**: o rascunho nasce `draft`, com `aiAssisted: true` e `aiModel` gravado. As fontes extraídas já entram preenchidas.
4. **Fallback**: se a IA falhar, retorna `502` amigável sem criar artigo quebrado nem derrubar o servidor. A criação manual continua funcionando.

> **Revisão humana:** o prompt cobre a maioria dos casos, mas LLMs podem herdar citações de terceiros aninhadas dentro de uma fonte. Por isso a revisão manual antes de publicar é obrigatória — cada artigo foi lido e ajustado para garantir que nenhuma afirmação factual fique sem fonte correspondente.

### SEO técnico

- **Metadados por artigo** (`generateMetadata`): `<title>` e `meta description` únicos, com fallback, Open Graph e `canonical` condicionais.
- **URLs amigáveis**: slug a partir do título, sem acentos (pt-BR) e único.
- **`sitemap.xml`** (`src/app/sitemap.ts`): **dinâmico** — consulta o banco a cada requisição, refletindo os artigos publicados em runtime sem novo deploy. Só inclui `published`.
- **`robots.txt`** (`src/app/robots.ts`): permite indexação, **bloqueia `/admin`**, aponta o sitemap.
- **JSON-LD `BlogPosting`**: dados estruturados reais em cada artigo.
- **HTML semântico**: `<article>`, `<h1>`, `<time datetime>`. Markdown renderizado no servidor (melhor para SEO).

### Segurança da área pública

Os helpers em `src/lib/public-articles.ts` usam `import "server-only"` (o build quebra se vazarem para o client) e filtram **exclusivamente** artigos `published`. Slug de rascunho retorna 404 — não confirma nem a existência.

---

## Estrutura do projeto

```
├── prisma/
│   ├── migrations/                      # migrations versionadas
│   ├── schema.prisma                    # Article + Source + enum de estados
│   └── seed.ts                          # 3 artigos de exemplo (cópia fiel, determinística)
├── public/
│   └── kanglu-logo.png                  # logo da marca
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/login/route.ts      # login -> JWT em cookie httpOnly
│   │   │   └── articles/
│   │   │       ├── route.ts             # GET (lista, filtro ?status) + POST (cria draft)
│   │   │       ├── [id]/route.ts        # GET / PATCH / DELETE
│   │   │       ├── [id]/publish/route.ts# portao: publica so com fonte valida (422)
│   │   │       └── generate/route.ts    # geracao por IA + fallback 502
│   │   ├── admin/
│   │   │   ├── _components/              # admin-header, toast
│   │   │   ├── _lib/                     # api (fetch central), status, types
│   │   │   ├── actions.ts               # server action de logout
│   │   │   ├── layout.tsx               # ToastProvider
│   │   │   ├── login/page.tsx           # tela de login
│   │   │   ├── page.tsx                 # painel kanban (draft / in_review / published)
│   │   │   ├── generate/page.tsx        # formulario de geracao
│   │   │   └── articles/[id]/page.tsx   # editor + fontes + preview + publicar
│   │   ├── blog/
│   │   │   ├── page.tsx                 # listagem publica paginada
│   │   │   └── [slug]/
│   │   │       ├── page.tsx             # artigo (semantico, SEO, fontes, JSON-LD)
│   │   │       └── not-found.tsx        # 404 na identidade Kanglu
│   │   ├── globals.css                  # tokens da marca (@theme)
│   │   ├── layout.tsx                   # fontes (Poppins/Inter) + metadata base
│   │   ├── sitemap.ts                   # sitemap dinamico
│   │   └── robots.ts                    # robots (bloqueia /admin)
│   ├── components/
│   │   └── article-markdown.tsx         # renderer de markdown (reusado no blog e no preview)
│   ├── lib/
│   │   ├── prisma.ts                    # singleton do PrismaClient
│   │   ├── auth.ts                      # signToken / getAuth (jose)
│   │   ├── validation.ts                # schemas zod + slugify
│   │   ├── extract.ts                   # extracao de texto das URLs
│   │   ├── ai.ts                        # geracao + prompt anti-invencao
│   │   ├── public-articles.ts           # queries publicas (so published)
│   │   └── site.ts                      # base URL do site
│   └── proxy.ts                         # protecao das rotas /admin (JWT no edge)
├── .env.example
├── API.md                               # documentacao das rotas
└── README.md
```

---

## Artigos de exemplo (seed)

`npm run seed` popula 3 artigos publicados, com temas evergreen e **fontes reais e verificáveis**:

1. **Rastreio no marketplace vs. transportadora** — Intelipost, Linx Commerce
2. **Notificações de status para o cliente no e-commerce** — Infobip, SmartEnvios
3. **Integração entre ERP e transportadora** — documentação do Bling, Melhor Envio

Os três foram gerados pelo endpoint de IA da aplicação e **revisados manualmente**. O seed é determinístico e idempotente: recria os artigos sem depender da chave de IA, garantindo que o projeto rode do zero.

---

## O que foi feito / diferenciais / o que faltou

### Escopo obrigatório — completo
- CRUD de artigos com estados `draft -> in_review -> published`
- Autenticação (JWT) protegendo rotas de escrita
- Geração de rascunho por IA a partir de tema + URLs
- Validação: não publica sem fonte com URL válida (portão 422)
- Área admin (kanban por status, editor, geração, preview)
- Área pública (listagem paginada, artigo semântico com seção de fontes)
- Regras de conteúdo (sem fake news, fontes explícitas, disclaimer de IA)
- SEO: slug, meta tags, sitemap, HTML semântico
- Identidade visual Kanglu (admin e blog)
- 3 artigos de exemplo com fontes reais + deploy

### Diferenciais implementados
- SSR/SSG na área pública
- `robots.txt` + `sitemap.xml` dinâmico
- JSON-LD (`BlogPosting`)
- Extração automática de texto das URLs de referência
- Fallback de geração (502 amigável) + criação manual

### O que faria com mais 2 semanas
- Geração de imagens por IA para os artigos (com crédito do modelo e `alt` obrigatório)
- Testes automatizados (unitários no portão de publicação + e2e do fluxo gerar->publicar)
- CI no GitHub Actions (lint + test)
- Agendamento de publicação (`publishAt`)
- Sugestão de palavras-chave a partir do conteúdo
- Refinar o prompt para filtrar citações de terceiros aninhadas nas fontes

---

## Licença

Projeto de teste técnico, sem fins comerciais.
