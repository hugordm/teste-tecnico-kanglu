# Kanglu — Gerador de artigos SEO

Aplicação web para **gerar, revisar e publicar artigos de blog** com rastreabilidade de fontes, geração de imagens por IA e boas práticas de SEO. Um administrador gera rascunhos assistidos por IA — a partir de URLs de referência **ou** de busca automática na web por tema —, revisa o conteúdo, gera uma ilustração de capa, e publica. Os artigos aparecem em uma área pública otimizada para busca.

Projeto desenvolvido como teste técnico para a vaga de Desenvolvedor(a) Fullstack Júnior na Kanglu.

| | |
|---|---|
| **Demo** | https://teste-tecnico-kanglu-eosin.vercel.app |
| **Blog público** | https://teste-tecnico-kanglu-eosin.vercel.app/blog |
| **Painel admin** | https://teste-tecnico-kanglu-eosin.vercel.app/admin |
| **Login de teste** | `admin@kanglu.test` / `kanglu123` |
| **Documentação da API** | [`API.md`](./API.md) |

> **Disclaimer de IA:** os rascunhos são gerados com assistência de IA e **revisados manualmente** antes da publicação. A geração usa `google/gemini-3.1-flash-lite` (fluxo com URLs) e `perplexity/sonar` (busca automática por tema), via OpenRouter. As imagens são geradas por `google/gemini-3.1-flash-lite-image` (Nano Banana 2). Cada afirmação factual é ancorada em fontes reais e verificáveis, listadas ao final de cada artigo.

---

## Stack

| Camada | Tecnologia | Papel |
|---|---|---|
| Framework | **Next.js 16 (App Router)** | Front-end e back-end no mesmo app; SSR/SSG para SEO |
| Linguagem | **TypeScript** | Type-safety de ponta a ponta |
| Banco | **PostgreSQL** + **Prisma 6** | Persistência, migrations e seed |
| Autenticação | **jose** (JWT) | Tokens compatíveis com qualquer runtime do Next |
| Validação | **zod** | Validação de entrada e da saída da IA |
| Geração de texto | **OpenRouter** | `gemini-3.1-flash-lite` (com fontes) e `perplexity/sonar` (busca web) |
| Geração de imagem | **Nano Banana 2** (`gemini-3.1-flash-lite-image`) | Ilustração de capa dos artigos |
| Armazenamento de imagens | **Vercel Blob** | Hospedagem pública das imagens geradas |
| Extração de fontes | **@mozilla/readability** + **linkedom** | Extrai o texto principal das URLs (linkedom: serverless-friendly) |
| Renderização | **react-markdown** + **remark-gfm** | Markdown → HTML semântico |
| Estilo | **Tailwind CSS v4** | Identidade visual Kanglu via tokens no `@theme` |
| Deploy | **Vercel** | Um deploy para todo o app |

---

## Como rodar do zero

Pré-requisitos: Node.js 20+, um banco PostgreSQL, uma chave da OpenRouter e (para imagens) um token do Vercel Blob.

```bash
git clone https://github.com/hugordm/teste-tecnico-kanglu.git
cd teste-tecnico-kanglu
npm install

cp .env.example .env      # preencha os valores (ver tabela abaixo)

npx prisma migrate dev    # aplica o schema no banco
npm run seed              # popula os 3 artigos de exemplo (com imagens)
npm run dev               # http://localhost:3000
```

O projeto sobe em menos de 15 minutos seguindo estes passos. A geração por IA e a geração de imagens são opcionais para rodar o projeto — a criação manual de artigos funciona sem elas.

### Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão do PostgreSQL |
| `JWT_SECRET` | Segredo para assinar os JWT (`openssl rand -base64 32`) |
| `ADMIN_EMAIL` | E-mail de login do admin |
| `ADMIN_PASSWORD` | Senha de login do admin |
| `OPENROUTER_API_KEY` | Chave da OpenRouter (usada em texto e imagem) |
| `OPENROUTER_MODEL` | Modelo de geração com fontes (padrão: `google/gemini-3.1-flash-lite`) |
| `WEB_SEARCH_MODEL` | Modelo de busca web por tema (padrão: `perplexity/sonar`) |
| `OPENROUTER_IMAGE_MODEL` | Modelo de imagem (padrão: `google/gemini-3.1-flash-lite-image`) |
| `BLOB_READ_WRITE_TOKEN` | Token do Vercel Blob (para upload das imagens) |
| `NEXT_PUBLIC_SITE_URL` | URL pública do site (para OG, canonical e sitemap absolutos) |

---

## Funcionalidades

### Fluxos de geração de conteúdo

O sistema oferece **dois fluxos** de geração assistida por IA, mais a criação manual:

**1. Geração com fontes (manual)** — `/admin/generate`. O usuário fornece um tema e URLs de referência. O sistema extrai o texto das URLs (Readability + linkedom) e gera o rascunho com o Gemini, ancorado nesse material. Controle total sobre as fontes.

**2. Busca automática por tema** — `/admin/generate-auto`. O usuário fornece apenas o tema. O sistema usa o Perplexity Sonar (que sempre pesquisa a web) para encontrar fontes reais, filtra concorrentes automaticamente e gera o rascunho ancorado nas fontes encontradas. Conveniência sem abrir mão da rastreabilidade.

**3. Criação manual** — para escrever um artigo do zero, sem IA.

Em todos os fluxos, o rascunho é **revisado pelo autor** antes de publicar.

### Regenerar rascunho

No editor, um botão **"Gerar novamente"** (visível apenas para rascunhos) refaz o conteúdo a partir das mesmas fontes do artigo, com confirmação antes de sobrescrever. Útil quando o primeiro resultado não agrada.

### Geração de imagem por IA

No editor, o botão **"Gerar imagem"** cria uma ilustração de capa via Nano Banana 2, hospeda no Vercel Blob e a exibe no topo do artigo no blog, com o crédito do modelo. Opcional por artigo.

### Regras de conteúdo (aplicadas no prompt)

O system prompt aplica, nos dois fluxos de IA: proibição de inventar dados, números ou pesquisas; proibição de citar concorrentes da Kanglu (filtro reforçado por lista de domínios na busca web); atribuição explícita de fontes; e preferência por descrição qualitativa em vez de estatísticas específicas de terceiros não presentes nas fontes. A limpeza determinística remove marcações de citação numeradas ([n]) que o modelo de busca eventualmente insere.

---

## Arquitetura e decisões técnicas

### Um único app: front-end e back-end juntos

Não há back-end separado. As rotas de API vivem em `src/app/api/**/route.ts` e rodam no runtime Node do Next. CRUD, autenticação, geração de texto/imagem e o portão de publicação num único projeto, com um único deploy.

### Um modelo por tarefa

Cada modelo é usado onde é melhor: **Gemini** para gerar a partir de fontes já fornecidas (rápido, econômico); **Perplexity Sonar** para o fluxo de busca automática, por ser um modelo de busca dedicado que ancora fontes de forma confiável (o Gemini com grounding buscava de forma intermitente); e **Nano Banana 2** para imagens. Todos via OpenRouter, com uma única chave.

### O "portão" de publicação

Estados: `draft → in_review → published` (+ `archived`). O único caminho para `published` é `POST /api/articles/[id]/publish`, que valida as fontes. O `POST` cria sempre como `draft`; o `PATCH` não aceita `published`. Impossível, por construção, publicar sem fonte válida.

### 422 vs 400

`400` para dados malformados (zod); `422` para regra de negócio violada — publicar sem fonte válida, ou (na busca web) não encontrar nenhuma fonte não-concorrente para o tema.

### Extração serverless-friendly

A extração de texto usa **linkedom** em vez de jsdom. O jsdom quebra no ambiente serverless da Vercel (ERR_REQUIRE_ESM); o linkedom é feito para serverless e resolve o problema, mantendo o Readability.

### Filtro de concorrentes

Na busca automática, as URLs retornadas passam por `src/lib/competitors.ts` (lista editável de domínios) — concorrentes e players adjacentes (rastreamento, pagamento, plataformas de e-commerce) são descartados. As URLs vêm de citações do modelo; quando embrulhadas em redirect, são desembrulhadas para a URL real antes do filtro. Se nenhuma fonte não-concorrente sobra, o sistema não gera (422) e sugere o fluxo manual.

### Imagens no Vercel Blob

As imagens geradas são enviadas para um store público do Vercel Blob, que retorna uma URL permanente gravada no artigo (reusando o campo de imagem de Open Graph, o que também melhora o compartilhamento em redes). O crédito do modelo fica em campo dedicado.

### SEO técnico

Metadados únicos por artigo, slugs amigáveis, `sitemap.xml` dinâmico (reflete o banco em runtime), `robots.txt` que bloqueia `/admin`, JSON-LD `BlogPosting`, e a imagem gerada como `og:image`.

### Autenticação single-admin

Um admin com credenciais em variáveis de ambiente e JWT em cookie `httpOnly`. Rotas `/admin/*` protegidas por `src/proxy.ts` (middleware do Next 16) no edge.

---

## Estrutura

```
prisma/
  schema.prisma            # Article + Source + enum de estados
  seed.ts                  # 3 artigos de exemplo (com imagens), idempotente
src/
  app/
    api/
      auth/login/                    # login → JWT
      articles/
        route.ts                     # GET (lista) + POST (cria draft)
        [id]/route.ts                # GET / PATCH / DELETE
        [id]/publish/route.ts        # portão de publicação (422)
        [id]/regenerate/route.ts     # gerar novamente (das mesmas fontes)
        [id]/generate-image/route.ts # gera imagem → Vercel Blob
        generate/route.ts            # geração com URLs (Gemini)
        generate-auto/route.ts       # busca automática por tema (Sonar)
    admin/                           # login, painel, editor, geradores
    blog/                            # listagem + [slug] + not-found
    sitemap.ts, robots.ts            # SEO
  components/
    article-markdown.tsx             # renderer de markdown
  lib/
    prisma, auth, validation, extract, ai, image,
    web-sources, competitors, public-articles, site
  proxy.ts                           # proteção das rotas /admin
API.md                               # documentação das rotas
```

---

## Artigos de exemplo

`npm run seed` popula 3 artigos publicados, com imagens e fontes reais e neutras (não-concorrentes): dois gerados pelo fluxo com fontes (Gemini) e um pelo fluxo de busca automática por tema (Sonar), demonstrando ambos. Conteúdo real revisado; seed determinístico e idempotente.

---

## Escopo

**Obrigatório — completo:** CRUD com estados, autenticação, geração por IA, validação de fontes (portão 422), painel admin, blog público semântico com fontes, regras de conteúdo, SEO (slug, meta tags, sitemap, JSON-LD), identidade Kanglu, 3 artigos com fontes reais e deploy.

**Além do obrigatório:** busca automática de fontes por tema (Perplexity Sonar) com filtro de concorrentes; regeneração de rascunho; geração de imagem por IA (Nano Banana 2) hospedada no Vercel Blob, com crédito.

**Com mais tempo:** testes automatizados (unitários no portão + e2e do fluxo), CI no GitHub Actions, agendamento de publicação, histórico de versões do rascunho, e persistência do texto extraído das fontes (hoje o regenerar re-baixa as URLs).

---

## Licença

Projeto de teste técnico, sem fins comerciais.