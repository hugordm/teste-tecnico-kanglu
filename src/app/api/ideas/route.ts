import { getAuth } from "@/lib/auth";
import { suggestIdeas, IdeasError } from "@/lib/ideas";
import { z } from "zod";

// Usa o SDK fetch (OpenRouter) no runtime Node, alinhado às outras rotas de IA.
export const runtime = "nodejs";

/**
 * Entrada do POST /api/ideas. Só `theme` (opcional): vazio → pautas gerais do
 * nicho; preenchido → pautas focadas nele. Teto de tamanho contém abuso trivial.
 */
const ideasInput = z.object({
  theme: z.string().trim().max(200).optional(),
});

/**
 * POST /api/ideas  (protegido)
 *
 * Sugere ~5 TÍTULOS de artigos no nicho da Kanglu (modelo barato, flash-lite).
 * Não cria nada — as pautas são efêmeras no cliente; o editor edita/descarta e
 * manda a escolhida para o gerador por tema.
 *
 * Contratos de falha:
 *   - 401 sem crachá.
 *   - 400 se o corpo for inválido.
 *   - 502 (amigável) se a IA falhar (IdeasError).
 */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = ideasInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Dados inválidos", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const { ideas } = await suggestIdeas({ theme: parsed.data.theme });
    return Response.json({ ideas });
  } catch (err) {
    if (err instanceof IdeasError) {
      console.warn(`[ideas] sugestão falhou: ${err.message}`);
      return Response.json(
        {
          error: "Não foi possível sugerir pautas agora. Tente novamente em instantes.",
        },
        { status: 502 },
      );
    }
    throw err; // erro inesperado (bug nosso): handler padrão
  }
}
