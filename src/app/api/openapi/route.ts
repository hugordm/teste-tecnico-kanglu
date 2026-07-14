import { buildOpenApiDocument } from "@/lib/openapi";

// Espelha o import graph das libs de geração (Prisma etc.): força runtime Node.
export const runtime = "nodejs";

/**
 * GET /api/openapi  (PÚBLICO)
 *
 * Devolve o documento OpenAPI 3.1 da API em JSON. É a spec que o Scalar consome
 * em `/api-doc`. Pública de propósito: a doc não é segredo (o `API.md` já é
 * público no repo) e não contém credenciais. Os endpoints que ela descreve
 * seguem protegidos por auth — o "Try it out" só funciona logado.
 */
export function GET() {
  return Response.json(buildOpenApiDocument());
}
