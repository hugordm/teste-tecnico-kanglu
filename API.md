# Documentação da API — Kanglu

Referência de todas as rotas da aplicação. As rotas de escrita exigem autenticação (JWT em cookie `httpOnly` ou header `Authorization: Bearer <token>`). As rotas públicas do blog não exigem autenticação.

**Convenção de status HTTP:**

| Código | Significado |
|---|---|
| `200` | Sucesso |
| `201` | Recurso criado |
| `400` | Dados malformados (falha de validação de schema) |
| `401` | Não autenticado (sem token válido) |
| `404` | Recurso não encontrado |
| `422` | Regra de negócio violada (ex.: publicar sem fonte) |
| `502` | Falha na geração por IA (com fallback amigável) |

---

## Autenticação

### `POST /api/auth/login`

Autentica o admin e devolve um JWT em cookie `httpOnly`.

**Corpo:**
```json
{ "email": "admin@kanglu.test", "password": "kanglu123" }
```

**Respostas:**
- `200` — `{ "ok": true, "email": "..." }` + cookie `token` setado
- `401` — `{ "error": "Credenciais inválidas" }`

O 401 é genérico de propósito (não distingue e-mail errado de senha errada), para não dar pistas a tentativas de adivinhação.

---

## Artigos (admin)

Todas as rotas abaixo exigem autenticação (`401` se ausente).

### `GET /api/articles`

Lista todos os artigos (qualquer status). Aceita filtro por status.

**Query params:**
- `status` (opcional): `draft` | `in_review` | `published` | `archived`. Um valor inválido retorna `400`.

**Respostas:**
- `200` — array de artigos com suas `sources`
- `400` — status inválido
- `401` — não autenticado

### `POST /api/articles`

Cria um artigo manualmente. Nasce sempre como `draft`.

**Corpo (campos principais):**
```json
{
  "title": "...",
  "content": "... (markdown)",
  "excerpt": "...",
  "metaTitle": "...",
  "metaDescription": "...",
  "sources": [{ "title": "...", "url": "https://..." }]
}
```

**Respostas:**
- `201` — o artigo criado (com slug único gerado e status `draft`)
- `400` — dados inválidos (ex.: título com menos de 3 caracteres, URL de fonte inválida)
- `401` — não autenticado

O `status` não pode ser enviado neste endpoint — todo artigo nasce `draft`.

### `GET /api/articles/[id]`

Retorna um artigo específico com suas fontes.

**Respostas:**
- `200` — o artigo
- `404` — não encontrado
- `401` — não autenticado

### `PATCH /api/articles/[id]`

Edita um artigo. Permite mudar entre `draft`, `in_review` e `archived` — **não permite** setar `published` (publicação só pelo endpoint dedicado).

**Corpo:** qualquer subconjunto dos campos do artigo. As fontes, se enviadas, substituem o conjunto atual (`deleteMany` + `create`).

**Respostas:**
- `200` — o artigo atualizado
- `400` — dados inválidos (inclui tentativa de setar `status: "published"`)
- `404` — não encontrado
- `401` — não autenticado

### `DELETE /api/articles/[id]`

Remove um artigo (as fontes caem junto via `onDelete: Cascade`).

**Respostas:**
- `200` — `{ "ok": true }`
- `404` — não encontrado
- `401` — não autenticado

### `POST /api/articles/[id]/publish`

**O "portão" de publicação.** É o único caminho para o status `published`. Valida as fontes antes de publicar.

**Regras:**
- Exige ao menos 1 fonte com URL `http`/`https` válida.
- Se não houver fonte válida, retorna `422` e o artigo permanece no estado atual.
- É idempotente: republicar um artigo já publicado devolve `200` e preserva o `publishedAt` original.

**Respostas:**
- `200` — o artigo publicado
- `422` — `{ "error": "...", "code": "NO_VALID_SOURCE" }`
- `404` — não encontrado
- `401` — não autenticado

### `POST /api/articles/generate`

Gera um rascunho assistido por IA a partir de um tema e URLs de referência.

**Corpo:**
```json
{
  "theme": "Tema do artigo (obrigatório)",
  "keywords": ["palavra1", "palavra2"],
  "urls": ["https://fonte1.com", "https://fonte2.com"]
}
```

**Fluxo interno:** extrai o texto das URLs (com timeout e resiliência) → gera o rascunho com o modelo de IA (prompt anti-invenção) → cria o artigo como `draft` com `aiAssisted: true`, `aiModel` e as fontes preenchidas.

**Respostas:**
- `201` — o rascunho criado (`draft`)
- `400` — dados inválidos (ex.: tema ausente)
- `401` — não autenticado
- `502` — falha na geração (`{ "error": "Geração indisponível..." }`). Nesse caso nenhum artigo é criado; a criação manual continua disponível.

---

## Rotas públicas (blog)

Sem autenticação. Servem apenas artigos com status `published` — rascunhos nunca vazam.

### `GET /blog`

Página de listagem dos artigos publicados (paginada). Renderizada no servidor (Server Component). Aceita `?page=` na query.

### `GET /blog/[slug]`

Página de um artigo publicado. HTML semântico (`<article>`, `<h1>`, `<time>`), metadados de SEO gerados dinamicamente, JSON-LD `BlogPosting`, e a seção "Fontes e referências". Um slug de rascunho ou inexistente retorna 404.

---

## Rotas de SEO (geradas pelo Next)

### `GET /sitemap.xml`

Sitemap dinâmico (`src/app/sitemap.ts`). Reflete os artigos publicados no banco em tempo real. Inclui `/`, `/blog` e cada `/blog/{slug}` publicado.

### `GET /robots.txt`

Robots dinâmico (`src/app/robots.ts`). Permite indexação geral, bloqueia `/admin` e aponta o sitemap.

---

## Proteção de rotas

As páginas `/admin/*` (exceto `/admin/login`) são protegidas por `src/proxy.ts`, que verifica o JWT no edge e redireciona para o login (com `?next=`) quando não autenticado. As rotas de API verificam o token individualmente no início de cada handler.
