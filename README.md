# Kanglu — Gerador de artigos SEO

Aplicação web para **gerar, revisar e publicar artigos de blog** com rastreabilidade de fontes e boas práticas de SEO. Um administrador gera rascunhos assistidos por IA a partir de um tema e de URLs de referência, revisa o conteúdo, gerencia as fontes e publica — e os artigos aparecem em uma área pública otimizada para busca.

Projeto desenvolvido como teste técnico para a vaga de Desenvolvedor(a) Fullstack Júnior na Kanglu.

| | |
|---|---|
| **Demo** | https://teste-tecnico-kanglu-eosin.vercel.app |
| **Blog público** | https://teste-tecnico-kanglu-eosin.vercel.app/blog |
| **Painel admin** | https://teste-tecnico-kanglu-eosin.vercel.app/admin |
| **Login de teste** | `admin@kanglu.test` / `kanglu123` |
| **Documentação da API** | [`API.md`](./API.md) |

> **Disclaimer de IA:** os rascunhos são gerados com assistência de IA (`google/gemini-3.1-flash-lite` via OpenRouter) e **revisados manualmente** antes da publicação. Cada afirmação factual é ancorada em fontes reais e verificáveis, listadas ao final de cada artigo.

---

## Visão geral

O projeto é uma aplicação **Next.js (App Router)** única, onde front-end e back-end convivem no mesmo código-base e sobem em um único deploy. Em vez de um servidor separado, o back-end é composto pelos **route handlers** do Next (`src/app/api/**`), que rodam no runtime Node. Essa escolha mantém o MVP simples: um repositório, um deploy, uma superfície de manutenção.

A aplicação se divide em duas camadas de interface e uma camada de dados:

**Front-end público (blog)** — renderizado no servidor para SEO. Lista os artigos publicados e exibe cada um em `/blog/{slug}` com HTML semântico, metadados dinâmicos, dados estruturados (JSON-LD) e uma seção de fontes visível.

**Front-end administrativo (painel)** — protegido por autenticação. Um painel kanban organiza os artigos por status (rascunho / em revisão / publicado), com editor completo, geração de rascunho por IA, preview e publicação.

**Back-end (API)** — as rotas em `src/app/api` cuidam de autenticação (JWT), CRUD de artigos, geração assistida por IA e o "portão" de publicação que valida as fontes. Toda a lógica de negócio vive aqui; as telas apenas consomem essas rotas.

---

## Stack

| Camada | Tecnologia | Papel |
|---|---|---|
| Framework | **Next.js 16 (App Router)** | Front-end e back-end no mesmo app; SSR/SSG para SEO |
| Linguagem | **TypeScript** | Type-safety de ponta a ponta |
| Banco | **PostgreSQL** + **Prisma 6** | Persistência, migrations e seed |
| Autenticação | **jose** (JWT) | Tokens compatíveis com qualquer runtime do Next |
| Validação | **zod** | Validação de entrada e saída (inclusive do JSON da IA) |
| Geração IA | **OpenRouter** (`gemini-3.1-flash-lite`) | Endpoint OpenAI-compatible, modelo configurável via env |
| Extração de fontes | **@mozilla/readability** + **jsdom** | Extrai o texto principal das URLs de referência |
| Renderização | **react-markdown** + **remark-gfm** | Markdown → HTML semântico (blog e preview) |
| Estilo | **Tailwind CSS v4** | Identidade visual Kanglu via tokens no `@theme` |
| Deploy | **Vercel** | Um deploy para todo o app |

---

## Como rodar do zero

Pré-requisitos: Node.js 20+, um banco PostgreSQL e (opcionalmente) uma chave da OpenRouter.

```bash
git clone https://github.com/hugordm/teste-tecnico-kanglu.git
cd teste-tecnico-kanglu
npm install

cp .env.example .env      # preencha os valores (ver tabela abaixo)

npx prisma migrate dev    # aplica o schema no banco
npm run seed              # popula os 3 artigos de exemplo
npm run dev               # http://localhost:3000
```

O projeto sobe em menos de 15 minutos seguindo estes passos.

### Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão do PostgreSQL |
| `JWT_SECRET` | Segredo para assinar os JWT (`openssl rand -base64 32`) |
| `ADMIN_EMAIL` | E-mail de login do admin |
| `ADMIN_PASSWORD` | Senha de login do admin |
| `OPENROUTER_API_KEY` | Chave da OpenRouter |
| `OPENROUTER_MODEL` | Modelo de IA (padrão: `google/gemini-3.1-flash-lite`) |
| `NEXT_PUBLIC_SITE_URL` | URL pública do site (para OG, canonical e sitemap absolutos) |

---

## Decisões técnicas

**Um app, não dois.** O back-end são os route handlers do próprio Next, não um servidor Express separado. Para o escopo de um MVP, um servidor à parte significaria dois projetos, dois deploys e duas superfícies de falha. Caso o produto crescesse (workers pesados, escala independente), o back-end seria extraído — mas o monolito é a escolha correta aqui.

**Prisma 6, não 7.** O Prisma 7 introduziu breaking changes (URL de conexão fora do schema e driver adapters obrigatórios). A versão foi fixada na linha 6.x estável, que funciona com o schema padrão e tem documentação madura — estabilidade sobre novidade em um prazo curto.

**O "portão" de publicação.** O artigo tem os estados `draft → in_review → published` (+ `archived`). O único caminho para `published` é o endpoint `POST /api/articles/[id]/publish`, que valida as fontes. As demais rotas não alcançam esse estado: o `POST` cria sempre como `draft` e o `PATCH` não aceita o valor `published`. Assim, é impossível por construção publicar um artigo sem fonte válida.

**422 vs 400.** Dados malformados retornam `400` (falha de schema, via zod). Já tentar publicar sem fonte válida retorna `422` — os dados estão corretos, mas uma regra de negócio foi violada. A distinção é intencional e reflete a semântica HTTP.

**Fontes como relação.** As fontes são uma tabela relacionada ao artigo (não um campo JSON), o que permite validar a existência de fontes antes de publicar e exibir a seção de referências com integridade. Na edição, o conjunto é substituído (`deleteMany` + `create`) para evitar órfãs.

**Autenticação single-admin.** Um único administrador com credenciais em variáveis de ambiente e JWT em cookie `httpOnly`. Não há tabela `User` — seria over-engineering para um admin único. As rotas `/admin/*` são protegidas por `src/proxy.ts` (o middleware do Next 16), que verifica o token no edge antes da página carregar.

**Geração de IA responsável.** O endpoint de geração extrai o texto das URLs (com timeout e resiliência via `Promise.allSettled`), envia ao modelo com um system prompt anti-invenção (só afirmar o que está nas fontes; proibido inventar dados), usa temperatura baixa e valida a saída com zod. Se a IA falhar, retorna `502` amigável sem quebrar — a criação manual permanece disponível. Toda geração é revisada por um humano antes de publicar.

**SEO técnico.** Metadados únicos por artigo (`generateMetadata`), slugs amigáveis, `sitemap.xml` **dinâmico** (reflete o banco em tempo real, sem novo deploy), `robots.txt` que bloqueia `/admin`, e JSON-LD `BlogPosting` em cada artigo.

---

## Estrutura

```
prisma/
  schema.prisma            # Article + Source + enum de estados
  seed.ts                  # 3 artigos de exemplo (cópia fiel, idempotente)
src/
  app/
    api/
      auth/login/          # login → JWT em cookie httpOnly
      articles/            # CRUD + [id]/publish (portão) + generate (IA)
    admin/                 # login, painel kanban, gerador, editor
    blog/                  # listagem pública + [slug] + not-found
    sitemap.ts, robots.ts  # SEO gerado pelo Next
    globals.css            # tokens da marca Kanglu
  components/
    article-markdown.tsx   # renderer reusado no blog e no preview
  lib/
    prisma, auth, validation, extract, ai, public-articles, site
  proxy.ts                 # proteção das rotas /admin
API.md                     # documentação das rotas
```

---

## Artigos de exemplo

`npm run seed` popula 3 artigos publicados, com fontes reais e verificáveis:

1. **Rastreio no marketplace vs. transportadora** — Intelipost, Linx Commerce
2. **Notificações de status para o cliente no e-commerce** — Infobip, SmartEnvios
3. **Integração entre ERP e transportadora** — documentação do Bling, Melhor Envio

Os três foram gerados pelo endpoint de IA da aplicação e revisados manualmente. O seed é determinístico e idempotente: recria os artigos a partir de conteúdo já revisado, sem depender da chave de IA.

---

## Escopo

**Obrigatório — completo:** CRUD com estados, autenticação, geração por IA, validação de fontes (portão 422), painel admin (kanban, editor, geração, preview), blog público (listagem, artigo semântico, seção de fontes), regras de conteúdo, SEO (slug, meta tags, sitemap, HTML semântico), identidade visual Kanglu, 3 artigos com fontes reais e deploy.

**Diferenciais implementados:** SSR/SSG na área pública, `robots.txt` + `sitemap.xml` dinâmico, JSON-LD, extração automática de texto das URLs, fallback de geração.

**Com mais 2 semanas:** geração de imagens por IA (com crédito e `alt`), testes automatizados (unitários no portão + e2e do fluxo), CI no GitHub Actions, agendamento de publicação, sugestão de palavras-chave, e refino do prompt para filtrar citações de terceiros aninhadas nas fontes.

---

## Licença

Projeto de teste técnico, sem fins comerciais.