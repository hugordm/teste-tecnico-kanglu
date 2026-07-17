# Kanglu — Gerador de artigos SEO com IA

Aplicação web para **gerar, revisar e publicar artigos de blog** com assistência de IA, rastreabilidade de fontes, geração de imagens e boas práticas de SEO. Um administrador gera rascunhos — a partir de URLs de referência **ou** de busca automática na web por tema —, revisa o conteúdo, gera ilustrações, posiciona imagens no corpo, agenda a publicação, e publica. O blog público é otimizado para busca e conta com um assistente de IA que tira dúvidas sobre os artigos.

Projeto desenvolvido como teste técnico para a vaga de Desenvolvedor(a) Fullstack Júnior na Kanglu.

| | |
|---|---|
| **Demo** | https://teste-tecnico-kanglu-eosin.vercel.app |
| **Blog público** | https://teste-tecnico-kanglu-eosin.vercel.app/blog |
| **Painel admin** | https://teste-tecnico-kanglu-eosin.vercel.app/admin |
| **Login de teste** | `admin@kanglu.test` / `kanglu123` |
| **Documentação da API** | [`API.md`](./API.md) (referência) · **Swagger interativo** em `/api-doc` |

> **Disclaimer de IA:** os rascunhos são gerados com assistência de IA e **revisados manualmente** antes da publicação. Cada afirmação factual é ancorada em fontes reais, listadas ao final de cada artigo. O fluxo com URLs usa `google/gemini-3.1-flash-lite`; na busca por tema, as fontes vêm do **Firecrawl** (motor padrão, via API direta) ou do **Perplexity Sonar**, e o modelo de texto escolhido escreve a partir delas; as imagens usam `google/gemini-3.1-flash-lite-image` (Nano Banana 2); o assistente do blog usa `google/gemini-3.1-flash-lite` — modelos de IA via OpenRouter.

---

## Stack

| Camada | Tecnologia | Papel |
|---|---|---|
| Framework | **Next.js 16 (App Router)** | Front-end e back-end no mesmo app; SSR/SSG para SEO |
| Linguagem | **TypeScript** | Type-safety de ponta a ponta |
| Banco | **PostgreSQL** + **Prisma 6** | Persistência, migrations e seed |
| Autenticação | **jose** (JWT) | Tokens compatíveis com qualquer runtime do Next |
| Validação | **zod** | Validação de entrada e da saída da IA |
| IA (texto) | **OpenRouter** | `gemini-3.1-flash-lite` (com fontes) e `perplexity/sonar` (busca web) |
| Busca web (por tema) | **Firecrawl** (`/v2/search`) + **Perplexity Sonar** | Motor de busca das fontes no fluxo por tema — Firecrawl padrão, Sonar alternativo e fallback |
| IA (imagem) | **Nano Banana 2** (`gemini-3.1-flash-lite-image`) | Ilustrações de capa e de corpo |
| IA (chat) | **Gemini flash-lite** (OpenRouter) | Assistente do blog com contexto dos artigos |
| Storage de imagens | **Vercel Blob** | Hospedagem pública das imagens geradas |
| Extração de fontes | **@mozilla/readability** + **linkedom** | Extrai o texto principal das URLs (linkedom: serverless-friendly) |
| Renderização | **react-markdown** + **remark-gfm** | Markdown → HTML semântico |
| Estilo | **Tailwind CSS v4** | Identidade visual Kanglu via tokens no `@theme` |
| Deploy | **Vercel** | Um deploy para todo o app |

---

## Como rodar do zero

Pré-requisitos: Node.js 20+, um banco PostgreSQL, uma chave da OpenRouter e (para imagens) um token do Vercel Blob. Opcionalmente, uma chave do Firecrawl para a busca por tema — sem ela, esse fluxo usa o Sonar.

```bash
git clone https://github.com/hugordm/teste-tecnico-kanglu.git
cd teste-tecnico-kanglu
npm install

cp .env.example .env      # preencha os valores (ver tabela abaixo)

npx prisma migrate dev    # aplica TODAS as migrations no banco
npm run seed              # popula os 3 artigos de exemplo (capa + imagens no corpo)
npm run dev               # http://localhost:3000
```

O projeto sobe em poucos minutos. A geração por IA, as imagens e o chatbot são opcionais para rodar — a criação manual de artigos funciona sem elas. O build de produção usa `prisma generate && next build` (garante o Prisma Client atualizado na Vercel mesmo em mudanças só de schema).

**Migrations:** o histórico vive em `prisma/migrations/`. Todas são aditivas. A mais recente, `add_category`, adiciona a coluna opcional `category` (nullable) ao `Article` — os artigos existentes seguem funcionando sem categoria. Em produção, aplique com `npx prisma migrate deploy`. Para atribuir categorias aos 3 artigos já existentes **sem recriar** nada (ao contrário do seed, que faz `deleteMany`), há um script idempotente e não-destrutivo: `npx tsx prisma/assign-categories.ts`.

### Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão do PostgreSQL |
| `JWT_SECRET` | Segredo para assinar os JWT (`openssl rand -base64 32`) |
| `ADMIN_EMAIL` | E-mail de login do admin |
| `ADMIN_PASSWORD` | Senha de login do admin |
| `OPENROUTER_API_KEY` | Chave da OpenRouter (texto, imagem e chat) |
| `FIRECRAWL_API_KEY` | Chave do Firecrawl (`fc-…`) — motor de busca **padrão** do fluxo por tema. Sem ela (ou se o Firecrawl falhar/esgotar crédito), a busca cai no Sonar |
| `OPENROUTER_MODEL` | **Default** do modelo de geração com fontes (padrão: `google/gemini-3.1-flash-lite`) |
| `WEB_SEARCH_MODEL` | **Default** do modelo de busca web por tema com o motor Sonar (padrão: `perplexity/sonar`) |
| `OPENROUTER_IMAGE_MODEL` | **Default** do modelo de imagem (padrão: `google/gemini-3.1-flash-lite-image`) |
| `OPENROUTER_CHAT_MODEL` | Modelo do assistente do blog (padrão: `google/gemini-3.1-flash-lite`) |
| `OPENROUTER_IDEAS_MODEL` | Modelo da sugestão de pautas (padrão: `google/gemini-3.1-flash-lite`) |
| `BLOB_READ_WRITE_TOKEN` | Token do Vercel Blob (upload das imagens) |
| `NEXT_PUBLIC_SITE_URL` | URL pública do site (OG, canonical e sitemap absolutos) |
| `CRON_SECRET` | Segredo do cron diário (`GET /api/cron/daily-article`). A Vercel injeta `Authorization: Bearer <valor>` ao acionar o cron; sem esta env a rota fica desabilitada (responde `500`) |

Os modelos têm valores padrão no código; só é preciso defini-los para sobrescrever. As três variáveis marcadas como **default** definem apenas a opção **pré-selecionada** de cada fluxo — na tela de geração há um **seletor de modelo** (texto + imagem) que lista modelos curados da OpenRouter em runtime e permite escolher outro (ver *Seletor de modelo* abaixo).

---

## Funcionalidades

### Geração de conteúdo — dois fluxos

**1. Geração com fontes (manual)** — `/admin/generate`. O usuário fornece um tema e URLs de referência. O sistema extrai o texto das URLs (Readability + linkedom) e gera o rascunho com o Gemini, ancorado nesse material. Controle total sobre as fontes.

**2. Busca automática por tema** — `/admin/generate-auto`. O usuário fornece apenas o tema e escolhe o **motor de busca** (ver abaixo). O motor encontra fontes reais na web, o sistema filtra concorrentes automaticamente e gera o rascunho ancorado nas fontes encontradas.

Em ambos, o rascunho nasce como assistido por IA e é **revisado pelo autor** antes de publicar. Também há criação totalmente manual.

### Motor de busca por tema (Firecrawl | Sonar)

O `generate-auto` tem um **seletor de motor de busca**, com dois caminhos:

- **Firecrawl** (padrão): busca as fontes via **API direta** (`POST /v2/search`, timeout curto de **12s**) e traz o conteúdo de cada página em **markdown**. Ruído (Instagram/YouTube/TikTok + dumps de documento tipo Scribd) sai na query (`-site:`); o LinkedIn é preservado como host, mas `/pulse/` e `/posts/` (conteúdo aberto, não-editorial) são cortados por path. As fontes passam por **descarte de índices**, **relevância por conteúdo** (off-topic como poliéster/portos é cortado), **idioma** (fonte não-portuguesa descartada — espanhol vazava termos) e **host/ano antigo** (ver `lib/relevance`). O sistema filtra concorrentes e o **modelo escolhido escreve** a partir do que sobrou.
- **Sonar**: o Perplexity Sonar **busca e escreve nativamente** (e um modelo não-Sonar recebe o plugin `web` da OpenRouter para buscar). É o comportamento original, mantido como opção.
- **Fallback automático**: se o Firecrawl falhar (erro, limite de crédito, timeout de 12s) **ou** não sobrar fonte, a busca cai no **Sonar**. No cron, o fallback busca com o Sonar mas **scrapeia as citações** com o extrator próprio (linkedom, sem crédito) e aplica a **mesma régua de conteúdo** do Firecrawl (idioma/relevância/índice), reescrevendo com o nosso modelo — assim, quando o crédito do Firecrawl acaba (a partir do ~dia 20), o Sonar vira o caminho único mas com **qualidade equivalente**. Se o scrape render pouco, usa a escrita nativa do Sonar (rede de segurança). Uma **guarda de orçamento** não inicia o fallback se já passou de 35s (não estoura os 60s). O `diag` registra qual caminho rodou (`firecrawl`/`sonar-scraped`/`sonar-native`).

As **quatro camadas de proteção** valem nos **dois motores** (o Firecrawl só busca — quem aplica as regras é o pipeline): (1) **filtro de concorrentes** sobre as fontes, antes de escrever; (2) o **SYSTEM_PROMPT completo** (anti-invenção, regra de marca, anti-LaTeX, sugestão de categoria) vai ao modelo que escreve; (3) **limpeza determinística** da saída (tags `<cite>`, marcadores `[1]`, extração tolerante de JSON); (4) o **portão de publicação** (`422` sem fonte válida).

### Seletor de modelo (texto + imagem)

Cada tela de geração tem um seletor com a **logo do provedor** + nome do modelo, alimentado por uma **lista curada da OpenRouter** buscada em runtime (`GET /api/models`, cacheada 6h; provedores conhecidos, logos self-hosted em `public/providers/`). A lista de **texto** depende do fluxo — e, no `generate-auto`, do **motor**:

- **Busca por tema** (`generate-auto`): a lista **se adapta ao motor**. Com o **Firecrawl** (padrão), aparecem **todos** os modelos (inclusive os "lite") — o Firecrawl busca e o modelo só escreve, então qualquer modelo serve. Com o **Sonar**, só **modelos robustos + o Sonar**: os "lite" (id com `lite`/`mini`/`nano`/`haiku`) são escondidos, porque nesse motor um modelo não-Sonar precisa acionar o plugin `web` da OpenRouter e os lite não fazem isso bem (voltariam sem fontes). Ao trocar o motor, o seletor atualiza a lista — um lite selecionado é resetado para o default robusto ao mudar para Sonar.
- **Geração com URLs** (`generate`): aceita a lista **ampla** (inclusive lite), já que não há busca — o modelo só escreve a partir das URLs.

A imagem tem sua própria lista (não depende de busca), com o Nano Banana 2 como padrão. Toda escolha é **validada contra a allowlist** curada no servidor (no `generate-auto`, **conforme o motor**): um id arbitrário — ou um lite com o motor Sonar — é descartado e cai no default. Se a API de modelos falhar, um **fallback** fixo mantém o seletor utilizável.

### Documentação da API (Swagger interativo)

Além do [`API.md`](./API.md) — referência estática, legível direto no GitHub sem subir o projeto —, a API tem uma **doc interativa e testável** em **`/api-doc`**, renderizada pelo **Scalar**. A spec **OpenAPI 3.1** é servida em `GET /api/openapi` e gerada de forma **híbrida**: os **corpos de requisição vêm dos próprios schemas Zod** das rotas (via `z.toJSONSchema` — fonte única, sem drift), e paths/parâmetros/respostas/auth são anotados à mão refletindo os **status reais**. Escolhemos o Scalar em vez do `swagger-ui-react` porque ele renderiza **fora da árvore React** (route handler → HTML), evitando o conflito do swagger-ui com o **React 19** (que removeu `ReactDOM.findDOMNode`). A página é **pública** (a doc não é segredo); o "Try it out" usa o cookie JWT de mesma origem, então os endpoints protegidos só respondem logado (deslogado retornam `401`, honestamente).

### Sugestão de pautas

Em `/admin/ideas`, a IA sugere ~5 **títulos** de artigos no nicho da Kanglu (opcionalmente focados num tema informado). As pautas são efêmeras (não gravam nada); a escolhida abre já no gerador por tema. Endpoint: `POST /api/ideas`.

### Regenerar rascunho

No editor, "Gerar novamente" (visível só para rascunhos) refaz o conteúdo a partir das mesmas fontes, com confirmação antes de sobrescrever.

### Imagens por IA

Ao gerar um artigo, o sistema já cria **4 opções de imagem de capa** (Nano Banana 2, em paralelo) para o usuário escolher — a escolha é reversível até salvar, quando as não usadas são descartadas do Blob. "Gerar novamente" produz outras 4. Além da capa, o usuário pode **inserir imagens no corpo do artigo**, na posição que quiser (marcador inserido na posição do cursor), reusando as imagens já geradas; um botão alterna entre inserir e remover. Imagens usadas no corpo são preservadas na limpeza do Blob. Cada imagem exibe o crédito do modelo.

### Agendamento de publicação

Um artigo pode ser agendado para aparecer no blog em uma data/hora futura (`publishAt`). Enquanto agendado, fica publicado mas invisível no blog, com um selo "Agendado" no painel; aparece automaticamente quando a hora chega (filtro na query pública, sem cron).

### Publicação diária automática (cron)

Um **Vercel Cron** (`vercel.json`, `0 18 * * *` = 18:00 UTC = **15:00 BRT**) chama `GET /api/cron/daily-article` todo dia: a IA escolhe uma pauta **ancorada no momento atual** (a data de hoje entra no prompt), gera o rascunho por tema com **preferência por conteúdo recente** (sort-by-date no último ano nos dois motores — não janela dura, que cegava temas evergreen) e o publica **pelo mesmo portão** da rota humana, **agendado** para aparecer às 09:00 BRT do **dia seguinte** (`publishAt` = 12:00 UTC de amanhã). Gerar de tarde é intencional: deixa a noite inteira como **janela de veto** antes de o texto ir ao ar. É **idempotente pelo slot de publicação** — não recria se já houver um `cron-daily` agendado para o slot de amanhã — e **autenticado** pelo header `Authorization: Bearer <CRON_SECRET>` que a Vercel injeta.

Como não há humano para vetar um texto ruim, o cron aplica dois **portões de qualidade**: **extensão** (≥3 seções, ≥250 palavras — se vier parágrafo/snippet, **re-escreve 1×** e, persistindo, mantém como **draft sem publicar**) e **relevância** (ao menos uma fonte do nicho — senão não publica). A regra de publicação (`lib/publish`) e a geração (`lib/generate-article`) são compartilhadas com o fluxo do painel (que rejeita curto/off-topic com `422`), num único lugar cada.

### Assistente do blog (chatbot)

Uma bolinha flutuante nas páginas do blog abre um chat que responde dúvidas sobre os **artigos publicados**. O contexto é montado dinamicamente a partir do banco (reflete adições/remoções de artigos sem alterar código), com orçamento de tokens. O escopo é limitado: perguntas fora dos temas do blog recebem uma recusa educada. Respostas em texto simples, sem markdown.

### Categorias e filtro

Cada artigo pode ter uma **categoria** (opcional) de uma **lista fixa** — Logística, Atendimento, Marketing, Gestão, Tecnologia, Vendas — validada na aplicação (a coluna é um `String?` simples, sem enum no banco, para a lista evoluir sem migration). A categoria é **sugerida pela IA na própria geração** (vem no mesmo JSON do rascunho, sem chamada extra) e fica pré-selecionada num dropdown no editor para o autor confirmar ou trocar. No blog, ela aparece como **selo clicável** (no artigo e no card) e a listagem ganha uma linha de **chips de filtro** (`/blog?categoria=<slug>`) que mostram só as categorias **com conteúdo publicado**. O filtro **coexiste** com a busca e a paginação via query params.

### Busca no blog

A listagem tem busca por texto (`/blog?q=<termo>`), feita no servidor (SSR). A comparação usa *folding* de acentos e caixa (NFD), então "logistica" casa com "Logística". As páginas de busca recebem `noindex` (resultado fino/duplicado); a listagem base e as de categoria seguem indexáveis.

### Índice do artigo (TOC)

Artigos com 2+ seções ganham um **índice navegável**: no topo em mobile/tablet e numa coluna lateral *sticky* no desktop. As âncoras usam scroll suave (CSS puro) e os dois índices apontam para os mesmos ids do corpo.

### Tempo de leitura

O cabeçalho do artigo mostra o tempo estimado de leitura (200 palavras/min, mínimo de 1). A contagem ignora marcadores de imagem, URLs e a sintaxe de markdown — conta só as palavras reais.

### Compartilhar

No fim do artigo, uma linha discreta "Compartilhar:" com botões para WhatsApp, LinkedIn, X/Twitter, Facebook, e-mail e **copiar link** (com feedback "Copiado!"). Ícones monocromáticos na identidade Kanglu (não nas cores das redes). A URL compartilhada é sempre a **canônica absoluta** de produção. Só aparece no artigo público (nunca na prévia do editor, para não copiar URL de rascunho).

### Home

A página inicial é uma landing: **hero** com a proposta e CTA para o blog, seção de **recursos** (as features reais da plataforma) e os **últimos artigos publicados** (puxados do banco, revalidados). Sem números fabricados — só o que existe de verdade.

### Responsividade

Toda a interface (blog e painel) é responsiva — mobile (~375px), tablet (~768px) e desktop (~1280px+): grids que reflowam (1/2/3 colunas), o índice lateral que vira topo, chips e botões que quebram sem vazar, e o editor/kanban adaptados ao toque.

### Regras de conteúdo (no prompt + limpeza determinística)

O system prompt proíbe inventar dados/números, citar concorrentes da Kanglu, usar notação LaTeX, e citar pesquisas/institutos de terceiros ausentes das fontes. Como modelos de linguagem são probabilísticos, há também **limpeza determinística** da saída, robusta a diferentes modelos (o seletor permite trocar de provedor): remoção de marcações de citação numeradas e de markdown residual no chat, remoção de tags `<cite>…</cite>` (que alguns modelos, como o Claude via plugin web, injetam) preservando o texto interno, e **extração tolerante de JSON** (aceita cercas de código ```` ```json ````, preâmbulo/posfácio e chaves balanceadas) antes da validação de shape com zod. E, principalmente, revisão humana antes de publicar.

---

## Arquitetura e decisões técnicas

### Um único app: front-end e back-end juntos

As rotas de API vivem em `src/app/api/**/route.ts` e rodam no runtime Node do Next. CRUD, autenticação, geração de texto/imagem, chatbot e o portão de publicação num só projeto, com um único deploy.

### Um modelo por tarefa

Gemini para gerar a partir de fontes fornecidas (rápido, econômico); na busca automática por tema, o **Firecrawl** é o motor padrão (busca via API direta e traz o conteúdo em markdown, e o modelo escolhido escreve a partir dele) e o **Perplexity Sonar** é a alternativa e o fallback (busca e escreve nativamente, ancorando fontes de forma confiável — o Gemini com grounding buscava de forma intermitente); Nano Banana 2 para imagens; Gemini flash-lite para o chat. Modelos via OpenRouter com uma única chave; a busca do Firecrawl usa a chave própria. Esses são os **defaults** — na geração, o seletor de modelo permite escolher outro (ver *Seletor de modelo*).

### O "portão" de publicação

Estados: `draft → in_review → published` (+ `archived`). O único caminho para `published` é `POST /api/articles/[id]/publish`, que valida as fontes. O `POST` cria sempre como `draft`; o `PATCH` não aceita `published`. Impossível, por construção, publicar sem fonte válida. O portão foi extraído para `lib/publish` (`publishArticle`) e é **a mesma função** usada pela rota humana e pelo cron diário — a regra vive num só lugar, sem risco de os dois caminhos divergirem.

### 400 vs 422

`400` para dados malformados (zod); `422` para regra de negócio violada — publicar sem fonte válida, ou (na busca web) não encontrar nenhuma fonte não-concorrente.

### Extração serverless-friendly

Usa **linkedom** em vez de jsdom, que quebra no serverless da Vercel (ERR_REQUIRE_ESM).

### Filtro de concorrentes

Na busca automática, as URLs passam por `src/lib/competitors.ts` (lista editável). Concorrentes e players adjacentes (rastreamento, pagamento, plataformas de e-commerce) são descartados por domínio real. Se nenhuma fonte não-concorrente sobra, o sistema não gera (422). Como a busca é da web aberta, o filtro reduz mas não elimina — a revisão humana é a garantia final.

### Imagens no Vercel Blob

As imagens vão para um store público do Vercel Blob, que retorna URLs permanentes. A capa reusa o campo de imagem de Open Graph (melhora o compartilhamento). A limpeza do Blob preserva a capa e qualquer imagem referenciada no conteúdo (imagens do corpo).

### SEO técnico

Metadados únicos por artigo, slugs amigáveis, `sitemap.xml` dinâmico, `robots.txt` que bloqueia `/admin`, JSON-LD `BlogPosting`, URL canônica automática (aponta para o próprio artigo, com override manual opcional), HTML semântico e a imagem gerada como `og:image`.

### Autenticação single-admin

Admin com credenciais em variáveis de ambiente e JWT em cookie `httpOnly`. Rotas `/admin/*` protegidas por `src/proxy.ts` (middleware do Next 16) no edge.

---

## Estrutura

```
prisma/
  schema.prisma            # Article (+ category) + Source + enum de estados
  migrations/              # histórico aditivo (inclui add_category)
  seed.ts                  # 3 artigos de exemplo (capa + imagens no corpo), idempotente
  assign-categories.ts     # atribui categoria aos artigos por slug (não-destrutivo)
src/
  app/
    api/
      auth/login/                    # login → JWT
      chat/route.ts                  # assistente do blog (público)
      ideas/route.ts                 # sugestão de pautas (IA)
      models/route.ts                # lista curada de modelos (seletor)
      openapi/route.ts               # spec OpenAPI 3.1 (JSON, pública)
      articles/
        route.ts                     # GET (lista) + POST (cria draft)
        [id]/route.ts                # GET / PATCH / DELETE
        [id]/publish/route.ts        # portão de publicação (422)
        [id]/regenerate/route.ts     # gerar novamente (das mesmas fontes)
        [id]/generate-image/route.ts # gera 4 imagens → Vercel Blob
        generate/route.ts            # geração com URLs (Gemini)
        generate-auto/route.ts       # busca automática por tema (Firecrawl padrão | Sonar)
      cron/daily-article/route.ts    # cron diário: gera + publica pelo portão
    api-doc/route.ts                 # Swagger interativo (Scalar) — público
    admin/                           # login, painel, editor, geradores, pautas
    blog/
      layout.tsx                     # injeta o chatbot em /blog/*
      page.tsx, [slug]/page.tsx      # listagem (busca + categoria) e artigo
    page.tsx                         # home (hero + recursos + últimos artigos)
    sitemap.ts, robots.ts            # SEO
  components/
    article-markdown.tsx             # renderer (inclui imagens no corpo)
    article-body.tsx                 # capa + corpo + tempo de leitura (compartilhado)
    table-of-contents.tsx            # índice do artigo (topo/lateral)
    share-buttons.tsx                # botões de compartilhar (client)
    cover-image.tsx                  # capa + crédito do modelo
    blog-chat.tsx                    # widget flutuante do chatbot
  lib/
    prisma, auth, validation, api-schemas, openapi, extract, ai, image,
    article-image, body-images, web-sources, firecrawl, competitors, chat,
    public-articles, site, categories, models, ideas, reading-time,
    json-extract, toc, publish, generate-article, recency, relevance
  proxy.ts                           # proteção das rotas /admin
vercel.json                          # agenda do cron diário (Vercel Cron)
API.md                               # documentação das rotas
```

---

## Artigos de exemplo

`npm run seed` popula 3 artigos publicados, com imagens (capa e corpo) e fontes reais e neutras: dois pelo fluxo de busca por tema e um pelo fluxo com fontes, demonstrando ambos. Conteúdo real revisado; seed determinístico e idempotente.

---

## Escopo

**Obrigatório — completo:** CRUD com estados, autenticação, geração por IA, validação de fontes (portão 422), painel admin, blog público semântico com fontes, regras de conteúdo, SEO (slug, meta tags, sitemap, JSON-LD), identidade Kanglu, 3 artigos com fontes reais e deploy.

**Diferenciais implementados:** SSR/SSG na área pública, robots + sitemap dinâmico, JSON-LD, extração de metadados de URLs, agendamento de publicação, URL canônica automática, busca automática de fontes por tema com seletor de motor (Firecrawl padrão via API direta + Sonar como alternativa e fallback) e filtro de concorrentes, regeneração de rascunho, geração de imagem por IA (4 opções + imagens no corpo) hospedada no Vercel Blob, assistente de IA no blog com contexto dinâmico dos artigos, seletor de modelo (texto + imagem) que se adapta ao motor de busca, sugestão de pautas por IA, categorias com filtro no blog e sugestão automática na geração, busca com folding de acentos, índice do artigo (TOC), tempo de leitura, botões de compartilhar, home com hero/recursos/últimos artigos, layout responsivo (mobile/tablet/desktop) e limpeza robusta da saída dos modelos (extração tolerante de JSON, remoção de tags `<cite>`).

**Com mais tempo:** testes automatizados (unitários no portão + e2e do fluxo), CI no GitHub Actions, histórico de versões do rascunho, persistência do texto extraído das fontes (hoje o regenerar re-baixa as URLs), rate-limiting no endpoint público do chat, e RAG (busca semântica) no chatbot caso o volume de artigos cresça.

---

## Licença

Projeto de teste técnico, sem fins comerciais.