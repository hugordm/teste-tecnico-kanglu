# Documentação da API — Kanglu

Referência de todas as rotas. As rotas de escrita exigem autenticação (JWT em cookie `httpOnly`). As rotas públicas do blog e o chat não exigem autenticação.

> **Versão interativa:** este documento é a referência estática (legível direto no GitHub). Com o projeto rodando, há também um **Swagger interativo e testável** em **`/api-doc`** (Scalar), cuja spec **OpenAPI 3.1** fica em `GET /api/openapi` — os corpos de requisição são gerados dos próprios schemas Zod das rotas.

**Login de teste:** `admin@kanglu.test` / `kanglu123`

**Convenção de status HTTP:**

| Código | Significado |
|---|---|
| `200` | Sucesso |
| `201` | Recurso criado |
| `400` | Dados malformados (falha de schema/zod) |
| `401` | Não autenticado |
| `404` | Recurso não encontrado |
| `409` | Conflito (ex.: regenerar um artigo que não é rascunho) |
| `422` | Regra de negócio violada (publicar sem fonte; busca sem fonte válida) |
| `502` | Falha na IA (com fallback amigável) |

---

## Autenticação

### `POST /api/auth/login`
Autentica o admin e devolve um JWT em cookie `httpOnly`.
**Corpo:** `{ "email": "...", "password": "..." }`
**Respostas:** `200` (+ cookie) · `401` credenciais inválidas.

---

## Artigos (admin — exigem autenticação)

### `GET /api/articles`
Lista todos os artigos. Query opcional `status`.
**Respostas:** `200` (array com sources) · `400` status inválido · `401`.

### `POST /api/articles`
Cria um artigo manualmente. Nasce como `draft`. Aceita opcionalmente `category` (um slug da lista fixa: `logistica`, `atendimento`, `marketing`, `gestao`, `tecnologia`, `vendas`); qualquer outro valor é rejeitado pelo schema.
**Respostas:** `201` · `400` · `401`.

### `GET /api/articles/[id]`
Retorna um artigo com suas fontes. `200` · `404` · `401`.

### `PATCH /api/articles/[id]`
Edita um artigo. Aceita `draft`, `in_review`, `archived` — **não** aceita `published`. As fontes, se enviadas, substituem o conjunto atual. Aceita `publishAt` (agendamento), `category` (slug da lista fixa, ou `null` para limpar) e a seleção de imagem de capa; ao salvar, as imagens não usadas (nem capa, nem referenciadas no conteúdo) são removidas do Blob.
**Respostas:** `200` · `400` (inclui tentativa de setar `published`) · `404` · `401`.

### `DELETE /api/articles/[id]`
Remove o artigo (fontes em cascata). `200` · `404` · `401`.

### `POST /api/articles/[id]/publish`
**Portão de publicação.** Único caminho para `published`. Exige ao menos 1 fonte com URL válida.
**Respostas:** `200` · `422` `{ code: "NO_VALID_SOURCE" }` · `404` · `401`.

### `POST /api/articles/[id]/regenerate`
Regenera o conteúdo do rascunho a partir das mesmas fontes. Sobrescreve `content` e `excerpt`. Só em rascunhos.
**Respostas:** `200` · `409` se não for `draft` · `404` · `401` · `502`.

---

## Geração assistida por IA

### `POST /api/articles/generate`
Geração **com fontes fornecidas** (tema + palavras-chave + URLs). Extrai o texto (Readability + linkedom) e gera com o Gemini. Ao final, gera 4 opções de imagem de capa. O modelo sugere uma `category` no mesmo JSON (normalizada contra a lista fixa), gravada no rascunho.
**Corpo:** `{ "theme": "...", "keywords": ["..."], "urls": ["https://..."], "textModel": "...", "imageModel": "..." }`
`textModel`/`imageModel` são **opcionais** e validados contra a lista curada (`GET /api/models`); um id inválido/ausente cai no default do ambiente.
**Respostas:** `201` (draft com fontes, categoria sugerida e opções de imagem) · `400` · `401` · `502`.

### `POST /api/articles/generate-auto`
Geração por **busca automática** (apenas o tema). Um **motor de busca** encontra as fontes na web; as URLs são filtradas contra concorrentes; o rascunho é ancorado nas fontes válidas. Também sugere `category` e gera 4 opções de imagem.
**Corpo:** `{ "theme": "...", "keywords": ["..."], "searchEngine": "firecrawl"|"sonar", "textModel": "...", "imageModel": "..." }`
- `searchEngine` (**opcional**, default `"firecrawl"`; valor inválido cai no default):
  - `"firecrawl"` — o Firecrawl (`POST /v2/search`, API direta) busca e traz o conteúdo em markdown; o **modelo de texto escolhido escreve** a partir dessas fontes.
  - `"sonar"` — o Perplexity Sonar busca e escreve nativamente (um modelo não-Sonar recebe o plugin `web` da OpenRouter).
  - **Fallback:** se o Firecrawl falhar (erro/limite/timeout) ou não sobrar fonte não-concorrente, cai automaticamente no Sonar.
- `textModel` é validado **conforme o motor**: com `firecrawl`, contra a lista **ampla** (qualquer modelo, inclusive lite — só escreve); com `sonar`, contra a lista **robusta** (um "lite" é descartado e cai no default robusto). `imageModel` é validado contra a lista de imagem. Um id inválido/ausente cai no default do ambiente.

As quatro proteções (filtro de concorrentes, `SYSTEM_PROMPT` completo, limpeza determinística da saída, portão `422`) valem nos dois motores — o Firecrawl só substitui a etapa de busca.
**Respostas:** `201` · `422` se nenhuma fonte válida for encontrada (após o fallback; a mensagem orienta usar o Sonar/um modelo mais robusto ou a geração manual) · `400` · `401` · `502`.

### `POST /api/articles/[id]/generate-image`
Gera **4 novas opções** de imagem (Nano Banana 2) em paralelo, faz upload no Vercel Blob e as associa ao artigo (a 1ª vira capa). Descarta do Blob as opções anteriores não usadas. Aceita opcionalmente `imageModel` (validado contra a lista curada de imagem).
**Respostas:** `200` (artigo com novas opções) · `404` · `401` · `502` (sem corromper o artigo).

### `GET /api/models`
Lista **curada** de modelos da OpenRouter para os seletores de geração (cacheada 6h; fallback fixo se a API falhar). Só admin autenticado.
**Resposta:** `200` `{ "text": [...], "textWeb": [...], "image": [...], "defaults": { "text": "...", "textWeb": "...", "image": "..." } }` — cada modelo traz `{ id, name, provider, providerLabel, logo }`. `text` é a lista ampla (fluxo com URLs e `generate-auto` com motor Firecrawl); `textWeb` é a lista robusta (`generate-auto` com motor Sonar: só robustos + Sonar); `image` é a lista de imagem. O cliente escolhe entre `text`/`textWeb` conforme o motor selecionado. `401` sem autenticação.

---

## Sugestão de pautas (admin)

### `POST /api/ideas`
Sugere ~5 **títulos** de artigos no nicho da Kanglu, opcionalmente focados num tema. Não cria nada — as pautas são efêmeras no cliente.
**Corpo:** `{ "theme": "..." }` (`theme` opcional, vazio → pautas gerais).
**Respostas:** `200` `{ "ideas": ["...", "..."] }` · `400` · `401` · `502` (falha da IA, com fallback amigável).

---

## Chatbot do blog

### `POST /api/chat`
Público (sem auth). Recebe o histórico da conversa e responde dúvidas sobre os **artigos publicados**, com contexto montado dinamicamente do banco e escopo limitado (recusa educada fora do tema). Resposta em texto simples, sem markdown.
**Corpo:** `{ "messages": [{ "role": "user"|"assistant", "content": "..." }] }` (histórico limitado às últimas mensagens; tetos de tamanho por mensagem).
**Respostas:** `200` `{ "reply": "..." }` · `400` entrada inválida · `502` falha da IA (com mensagem amigável).

---

## Rotas públicas (blog) — sem autenticação

Servem apenas artigos `published` e visíveis (respeitando o agendamento `publishAt`).

### `GET /`
Home (landing): hero, seção de recursos e os **3 últimos artigos publicados** (lidos do banco, revalidados). SSR/ISR.

### `GET /blog`
Listagem paginada dos artigos publicados (SSR). Query params, que **coexistem**:
- `?page=<n>` — paginação.
- `?q=<termo>` — busca por título/excerpt, com *folding* de acentos e caixa. Páginas de busca recebem `noindex` e canônica na listagem base.
- `?categoria=<slug>` — filtro por categoria (slug da lista fixa; valor inválido é ignorado). Indexável, com canônica própria em `?categoria=`. Os chips de filtro mostram só categorias com conteúdo publicado.

Inclui o chatbot flutuante.

### `GET /blog/[slug]`
Página do artigo: HTML semântico, SEO (meta, canonical, JSON-LD), selo de **categoria** (clicável → filtro), **tempo de leitura**, **índice (TOC)** para artigos com 2+ seções, imagem de capa com crédito, imagens no corpo (marcadores renderizados), seção "Fontes e referências", **botões de compartilhar**, e o chatbot. Slug de rascunho, agendado ainda invisível, ou inexistente → 404.

---

## Rotas de SEO (geradas pelo Next)

### `GET /sitemap.xml`
Sitemap dinâmico — reflete os artigos publicados e visíveis em runtime.

### `GET /robots.txt`
Permite indexação, bloqueia `/admin`, aponta o sitemap.

---

## Proteção de rotas

Páginas `/admin/*` (exceto login) são protegidas por `src/proxy.ts`, que verifica o JWT no edge. As rotas de API de escrita verificam o token no início de cada handler.