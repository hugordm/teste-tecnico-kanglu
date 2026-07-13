# Documentação da API — Kanglu

Referência de todas as rotas. As rotas de escrita exigem autenticação (JWT em cookie `httpOnly`). As rotas públicas do blog não exigem autenticação.

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
| `422` | Regra de negócio violada (ex.: publicar sem fonte; busca sem fonte válida) |
| `502` | Falha na geração por IA (com fallback amigável) |

---

## Autenticação

### `POST /api/auth/login`
Autentica o admin e devolve um JWT em cookie `httpOnly`.

**Corpo:** `{ "email": "...", "password": "..." }`
**Respostas:** `200` (+ cookie) · `401` credenciais inválidas.

---

## Artigos (admin — exigem autenticação)

### `GET /api/articles`
Lista todos os artigos. Query opcional `status` (`draft|in_review|published|archived`).
**Respostas:** `200` (array com sources) · `400` status inválido · `401`.

### `POST /api/articles`
Cria um artigo manualmente. Nasce como `draft`.
**Respostas:** `201` · `400` dados inválidos · `401`.

### `GET /api/articles/[id]`
Retorna um artigo com suas fontes. `200` · `404` · `401`.

### `PATCH /api/articles/[id]`
Edita um artigo. Aceita `draft`, `in_review`, `archived` — **não** aceita `published`.
As fontes, se enviadas, substituem o conjunto atual.
Campo `publishAt` (ISO em UTC, ou `null`): **agenda** a partir de quando o artigo publicado aparece no blog. `null` (ou ausente na criação) = aparece assim que publicado.
**Respostas:** `200` · `400` (inclui tentativa de setar `published`) · `404` · `401`.

### `DELETE /api/articles/[id]`
Remove o artigo (fontes caem em cascata). `200` · `404` · `401`.

### `POST /api/articles/[id]/publish`
**Portão de publicação.** Único caminho para `published`. Exige ao menos 1 fonte com URL válida.
**Respostas:** `200` · `422` `{ code: "NO_VALID_SOURCE" }` · `404` · `401`.

### `POST /api/articles/[id]/regenerate`
Regenera o conteúdo do rascunho a partir das **mesmas fontes** já salvas (re-extrai as URLs e reescreve). Sobrescreve apenas `content` e `excerpt`. Só funciona em rascunhos.
**Respostas:** `200` (artigo atualizado) · `409` se não for `draft` · `404` · `401` · `502` se a IA falhar.

---

## Geração assistida por IA

### `POST /api/articles/generate`
Geração **com fontes fornecidas**. Recebe tema + palavras-chave + URLs; extrai o texto (Readability + linkedom) e gera o rascunho com o Gemini.

**Corpo:** `{ "theme": "...", "keywords": ["..."], "urls": ["https://..."] }`
**Respostas:** `201` (draft com fontes) · `400` · `401` · `502` (falha na IA, sem criar artigo).

### `POST /api/articles/generate-auto`
Geração por **busca automática na web**. Recebe apenas o tema; o Perplexity Sonar pesquisa a web, as URLs são desembrulhadas e filtradas contra a lista de concorrentes, e o rascunho é gerado ancorado nas fontes válidas.

**Corpo:** `{ "theme": "...", "keywords": ["..."] }`
**Fluxo:** busca (Sonar) → desembrulha redirects → filtra concorrentes → gera. Retry limitado sobre "zero fontes válidas".
**Respostas:** `201` (draft com fontes reais) · `422` se nenhuma fonte não-concorrente for encontrada · `400` · `401` · `502`.

### `POST /api/articles/[id]/generate-image`
"Gerar novamente": gera **4 opções** de capa via Nano Banana 2 **em paralelo**, faz upload no Vercel Blob e as grava em `imageOptions`; a 1ª que der certo vira a capa padrão (campo de imagem OG) + crédito. Apaga do Blob as imagens anteriores (opções pendentes + capa em uso) que serão substituídas.

**Respostas:** `200` (artigo com novas opções) · `404` · `401` · `502` (todas falharam, sem corromper o artigo).

### Escolha da capa (sem endpoint dedicado)
A escolha entre as `imageOptions` é feita no editor (estado local, reversível) e **confirmada ao salvar** o artigo via `PATCH /api/articles/[id]`: a opção marcada (campo OG) vira definitiva, as demais são apagadas do Blob e `imageOptions` é esvaziado.

---

## Rotas públicas (blog) — sem autenticação

Servem apenas artigos `published` **e já visíveis** — um artigo agendado (`publishAt` no futuro) é tratado como não publicado até a hora. As páginas usam ISR (`revalidate = 60`), então o artigo agendado passa a aparecer sozinho até ~60s após a data, sem cron nem redeploy.

### `GET /blog`
Listagem paginada dos artigos publicados e visíveis (SSR). Query `?page=`.

### `GET /blog/[slug]`
Página do artigo: HTML semântico, metadados de SEO, JSON-LD `BlogPosting`, imagem de capa com crédito (se houver), e seção "Fontes e referências". Slug de rascunho, **agendado ainda não visível**, ou inexistente → 404.

---

## Rotas de SEO (geradas pelo Next)

### `GET /sitemap.xml`
Sitemap dinâmico — reflete os artigos publicados **e já visíveis** em runtime (agendados ainda não visíveis ficam de fora). Inclui `/`, `/blog` e cada `/blog/{slug}`.

### `GET /robots.txt`
Permite indexação, bloqueia `/admin`, aponta o sitemap.

---

## Proteção de rotas

Páginas `/admin/*` (exceto login) são protegidas por `src/proxy.ts`, que verifica o JWT no edge. As rotas de API verificam o token no início de cada handler.