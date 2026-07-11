import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { extractMany } from "@/lib/extract";
import { generateDraft, AiError } from "@/lib/ai";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/articles/[id]/regenerate  (protegido)
 *
 * Refaz o conteúdo de um RASCUNHO reusando o mesmo pipeline da geração manual
 * (`generateDraft`), a partir do que sobrou da origem do artigo: o `title` (como
 * tema) + as `sources` já salvas. Como a Source guarda só título+URL (não o
 * texto extraído), re-baixamos as URLs na hora com `extractMany` — resiliente:
 * URL morta é ignorada, não quebra o fluxo.
 *
 * SOBRESCREVE apenas `content` e `excerpt` (mantém título, slug, status, SEO e
 * fontes intactos). Não cria artigo novo, não publica.
 *
 * Contratos de falha:
 *   - 404 se o artigo não existe.
 *   - 409 se o artigo não é um rascunho (só regeneramos draft).
 *   - 502 se a geração falhar (AiError) — nada é sobrescrito.
 */
export async function POST(req: Request, { params }: Params) {
  const auth = await getAuth(req);
  if (!auth) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params; // params é Promise no Next 16
  const existing = await prisma.article.findUnique({
    where: { id },
    include: { sources: true },
  });
  if (!existing) {
    return Response.json({ error: "Artigo não encontrado" }, { status: 404 });
  }
  if (existing.status !== "draft") {
    return Response.json(
      { error: "Só é possível regenerar rascunhos." },
      { status: 409 },
    );
  }

  // Re-extrai as fontes já salvas (só temos URL+título no banco). Resiliente:
  // fonte fora do ar é ignorada; se não sobrar nenhuma, o gerador escreve de
  // forma conceitual a partir só do título, sem inventar dados.
  const sources = await extractMany(existing.sources.map((s) => s.url));

  // Geração é o ponto que pode falhar de verdade (API externa). Isolada no try
  // pra virar 502 amigável em vez de 500 cru — e nada é sobrescrito se falhar.
  let result;
  try {
    result = await generateDraft({ theme: existing.title, sources });
  } catch (err) {
    if (err instanceof AiError) {
      console.warn(`[regenerate] geração falhou: ${err.message}`);
      return Response.json(
        {
          error:
            "Geração indisponível, tente novamente em instantes.",
        },
        { status: 502 },
      );
    }
    // Erro inesperado (bug nosso, não da API): re-lança pro handler padrão.
    throw err;
  }

  const { draft, model } = result;

  // SOBRESCREVE só o miolo. Título/slug/status/SEO/fontes ficam como estão —
  // o reviewer decide o resto. Reafirma a rastreabilidade de IA.
  const article = await prisma.article.update({
    where: { id },
    data: {
      content: draft.content,
      excerpt: draft.excerpt,
      aiAssisted: true,
      aiModel: model,
    },
    include: { sources: true },
  });

  return Response.json({ article });
}
