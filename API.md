# Documentação da API — Kanglu

Referência de todas as rotas. As rotas de escrita exigem autenticação (JWT em cookie `httpOnly`). As rotas públicas do blog e o chat não exigem autenticação.

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
Cria um artigo manualmente. Nasce como `draft`.
**Respostas:** `201` · `400` · `401`.

### `GET /api/articles/[id]`
Retorna um artigo com suas fontes. `200` · `404` · `401`.

### `PATCH /api/articles/[id]`
Edita um artigo. Aceita `draft`, `in_review`, `archived` — **não** aceita `published`. As fontes, se enviadas, substituem o conjunto atual. Aceita `publishAt` (agendamento) e a seleção de imagem de capa; ao salvar, as imagens não usadas (nem capa, nem referenciadas no conteúdo) são removidas do Blob.
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
Geração **com fontes fornecidas** (tema + palavras-chave + URLs). Extrai o texto (Readability + linkedom) e gera com o Gemini. Ao final, gera 4 opções de imagem de capa.
**Corpo:** `{ "theme": "...", "keywords": ["..."], "urls": ["https://..."] }`
**Respostas:** `201` (draft com fontes e opções de imagem) · `400` · `401` · `502`.

### `POST /api/articles/generate-auto`
Geração por **busca automática** (apenas o tema). O Perplexity Sonar pesquisa a web; as URLs são filtradas contra concorrentes; o rascunho é ancorado nas fontes válidas. Também gera 4 opções de imagem.
**Corpo:** `{ "theme": "...", "keywords": ["..."] }`
**Respostas:** `201` · `422` se nenhuma fonte não-concorrente for encontrada · `400` · `401` · `502`.

### `POST /api/articles/[id]/generate-image`
Gera **4 novas opções** de imagem (Nano Banana 2) em paralelo, faz upload no Vercel Blob e as associa ao artigo (a 1ª vira capa). Descarta do Blob as opções anteriores não usadas.
**Respostas:** `200` (artigo com novas opções) · `404` · `401` · `502` (sem corromper o artigo).

---

## Chatbot do blog

### `POST /api/chat`
Público (sem auth). Recebe o histórico da conversa e responde dúvidas sobre os **artigos publicados**, com contexto montado dinamicamente do banco e escopo limitado (recusa educada fora do tema). Resposta em texto simples, sem markdown.
**Corpo:** `{ "messages": [{ "role": "user"|"assistant", "content": "..." }] }` (histórico limitado às últimas mensagens; tetos de tamanho por mensagem).
**Respostas:** `200` `{ "reply": "..." }` · `400` entrada inválida · `502` falha da IA (com mensagem amigável).

---

## Rotas públicas (blog) — sem autenticação

Servem apenas artigos `published` e visíveis (respeitando o agendamento `publishAt`).

### `GET /blog`
Listagem paginada dos artigos publicados (SSR). Query `?page=`. Inclui o chatbot flutuante.

### `GET /blog/[slug]`
Página do artigo: HTML semântico, SEO (meta, canonical, JSON-LD), imagem de capa com crédito, imagens no corpo (marcadores renderizados), seção "Fontes e referências", e o chatbot. Slug de rascunho, agendado ainda invisível, ou inexistente → 404.

---

## Rotas de SEO (geradas pelo Next)

### `GET /sitemap.xml`
Sitemap dinâmico — reflete os artigos publicados e visíveis em runtime.

### `GET /robots.txt`
Permite indexação, bloqueia `/admin`, aponta o sitemap.

---

## Proteção de rotas

Páginas `/admin/*` (exceto login) são protegidas por `src/proxy.ts`, que verifica o JWT no edge. As rotas de API de escrita verificam o token no início de cada handler.