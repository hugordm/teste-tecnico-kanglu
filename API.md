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

As quatro proteções (filtro de concorrentes, `SYSTEM_PROMPT` completo, limpeza determinística da saída, portão `422`) valem nos dois motores — o Firecrawl só substitui a etapa de busca. As fontes do Firecrawl passam por filtros de qualidade (ver `lib/relevance`): **descarte de índices** (home/listagem `/blog`, `/noticias`, ou página com centenas de links), **relevância** por conteúdo (off-topic como poliéster/portos é cortado), **idioma** (fonte não-portuguesa é descartada — espanhol vazava termos pro texto), e **host/ano** (redes sociais + dumps de documento tipo Scribd via `-site:`; URL com ano antigo). O LinkedIn fica de fora das exclusões de host, mas `/pulse/` e `/posts/` (conteúdo aberto, não-editorial) são descartados por path. No **fallback do cron**, as citações do Sonar não ficam só no filtro por URL: são **scrapeadas** pelo extrator próprio (linkedom, sem custo de crédito) e passam pela **mesma régua de conteúdo** do Firecrawl (idioma inclusive), e então o nosso modelo reescreve — paridade de qualidade. Se o scrape render menos de 1 fonte limpa, cai na escrita nativa do Sonar (rede de segurança). Além disso, o prompt de escrita recebe a **data de hoje** (o modelo não sabe que dia é), para não tratar evento passado como planejamento futuro.
**Portões de qualidade:** (a) **extensão** — artigo de verdade (≥3 seções `##`, ≥250 palavras); abaixo disso, `422 { code: "ARTICLE_TOO_SHORT" }`. (b) **relevância** — ao menos uma fonte com sinal do nicho; senão `422 { code: "ARTICLE_OFF_TOPIC" }`. Ambos são variação da busca/modelo; gerar de novo costuma resolver.
**Respostas:** `201` · `422` sem fonte válida, `ARTICLE_TOO_SHORT` ou `ARTICLE_OFF_TOPIC` · `400` · `401` · `502`.

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

## Automação (cron)

### `GET /api/cron/daily-article`
**Publicação diária automática.** Acionada pelo **Vercel Cron** (agendado em `vercel.json`: `0 18 * * *` = 18:00 UTC = **15:00 BRT**). Gera de tarde de propósito: o artigo só vai ao ar às 09:00 BRT do **dia seguinte**, deixando a noite inteira como janela de veto humano. Faz o fluxo ponta a ponta sem intervenção:
1. **Autentica** o cron pelo header `Authorization: Bearer <CRON_SECRET>` que a Vercel injeta. Sem a env `CRON_SECRET` a rota responde `500` (desabilitada de propósito, para não ficar aberta ao mundo).
2. **Idempotência pelo slot de publicação:** se já existe um artigo `createdVia = "cron-daily"` **agendado para o slot de amanhã** (`publishAt` = 12:00 UTC do dia seguinte), devolve `skipped` sem recriar — reexecuções/retentativas da mesma rodada não duplicam. A chave é o horário de publicação, não o dia de criação.
3. Pede **uma pauta** à IA ancorada no **momento atual** (a data de hoje é injetada no prompt; pautas atemporais são desencorajadas), gera o rascunho por tema com **preferência por conteúdo recente** — não janela dura: `sbd:1,qdr:y` (sort-by-date, último ano) no Firecrawl e `search_recency_filter: "year"` no fallback Sonar. Janela dura de meses cegava a busca para temas evergreen (pós-venda); a preferência por data mantém o recente na frente sem perder o evergreen bom. Marcado `createdVia: "cron-daily"`.
4. Aplica o **piso de extensão** (≥3 seções, ≥250 palavras). Sem humano para vetar um parágrafo, o cron **re-escreve 1×** se vier curto; se persistir, **mantém como draft e NÃO publica** (melhor nenhum artigo que um snippet).
5. Se passou no piso, **publica pelo mesmo portão** de `POST /api/articles/[id]/publish` (regra "≥1 fonte válida" = mesma função `lib/publish`), **agendado** para `publishAt` = 12:00 UTC do dia seguinte (09:00 BRT): fica `published`, mas só aparece no blog na manhã seguinte.

**Orçamento de tempo (60s):** a busca do Firecrawl tem timeout **curto (12s)** — medido p50 ~7s; um teto alto gastava metade do orçamento antes do fallback. Se o Firecrawl falhar e já tiver passado de **35s** do início, o fallback Sonar **não é iniciado** (`budget_exceeded` → "hoje não deu") para não morrer no meio (a Vercel mata a função sem retry nem alerta). Toda resposta traz um `diag`: `engine` (`firecrawl` / `sonar-scraped` / `sonar-native` — qual qualidade foi ao ar), `sourceCount`, `words`, `sections` e `ms` (`pauta`/`geracao`/`imagens`/`total`) — para caçar estouros de tempo e saber por qual caminho o artigo passou.

**Respostas:**
- `200` `{ "published": true, "theme": "...", "article": { ..., "publishAt": "<amanhã>T12:00:00Z" }, "diag": {...} }` — criado, publicado e agendado.
- `200` `{ "skipped": true, "reason": "already-scheduled-for-slot", "slot": "...", ... }` — já há artigo agendado para o slot de amanhã.
- `200` `{ "published": false, "reason": "too_short" | "off_topic" | "<portão>", "diag": {...} }` — criado como draft mas não publicado (texto curto após o retry, fontes fora do tema, ou portão barrou); fica salvo para revisão.
- `401` segredo ausente/errado · `500` `CRON_SECRET` não configurado · `502` pauta ou geração da IA falhou (nada criado).

> A regra de publicação (`lib/publish`) e a geração automática (`lib/generate-article`) são **compartilhadas** entre a rota humana e o cron — um único lugar para cada regra, sem risco de os dois caminhos divergirem.

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