import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import {
  generateAndUploadArticleImageOptions,
  deleteArticleImages,
} from "@/lib/article-image";

// O upload pro Blob usa o SDK do Node (Buffer), então fixamos o runtime nodejs.
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/articles/[id]/generate-image  (protegido) — "Gerar novamente"
 *
 * Gera 4 novas opções de capa via Nano Banana 2 Lite (OpenRouter) EM PARALELO,
 * hospeda no Vercel Blob e as coloca em `imageOptions`; a 1ª que der certo vira
 * a capa padrão (`ogImage`) + `imageCredit`. Antes de gerar, APAGA do Blob as
 * imagens anteriores que serão substituídas (as opções pendentes + a capa atual,
 * quando forem do nosso Blob) — evita acumular lixo.
 *
 * Contratos de falha — NENHUM corrompe o artigo (só damos update DEPOIS de ter
 * as URLs em mãos):
 *   - 401 se não autenticado.
 *   - 404 se o artigo não existe.
 *   - 502 se TODAS as gerações/uploads falharem (mensagem amigável).
 */
export async function POST(req: Request, { params }: Params) {
  const auth = await getAuth(req);
  if (!auth) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params; // params é Promise no Next 16
  const existing = await prisma.article.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Artigo não encontrado" }, { status: 404 });
  }

  // Geração + upload são os pontos que podem falhar de verdade (APIs externas).
  // Isolados no try pra virar 502 amigável em vez de 500 cru — e, crucialmente,
  // o artigo só é tocado no update lá embaixo, depois de tudo dar certo.
  let urls: string[];
  let credit: string;
  try {
    ({ urls, credit } = await generateAndUploadArticleImageOptions(
      id,
      existing.title,
    ));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[generate-image] geração de opções falhou: ${msg}`);
    return Response.json(
      { error: "Não foi possível gerar as imagens agora. Tente novamente." },
      { status: 502 },
    );
  }

  // As novas opções deram certo → agora sim apagamos as anteriores do Blob (as
  // opções pendentes + a capa que estava em uso, se for do nosso Blob). Feito
  // DEPOIS de gerar as novas: se a geração falhasse, o artigo continuaria com as
  // imagens antigas intactas. deleteArticleImages nunca lança.
  await deleteArticleImages([...existing.imageOptions, existing.ogImage ?? ""]);

  // Só aqui tocamos o artigo: novas opções + a 1ª como capa padrão.
  const article = await prisma.article.update({
    where: { id },
    data: { ogImage: urls[0], imageCredit: credit, imageOptions: urls },
    include: { sources: true },
  });

  return Response.json({ article });
}
