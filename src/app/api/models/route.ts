import { getAuth } from "@/lib/auth";
import { getCuratedModels } from "@/lib/models";

/**
 * GET /api/models  (protegido)
 *
 * Lista CURADA de modelos da OpenRouter (texto + imagem) + os defaults, para os
 * seletores das telas de geração. A curadoria/cache/fallback vivem em lib/models
 * (cache de 6h; se a API falhar, cai num conjunto fixo). Só admin autenticado lê.
 */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }
  const models = await getCuratedModels();
  return Response.json(models);
}
