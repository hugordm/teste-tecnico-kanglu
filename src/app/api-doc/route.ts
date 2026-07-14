import { ApiReference } from "@scalar/nextjs-api-reference";

// Documentação interativa da API (Scalar). Escolhido em vez do swagger-ui-react
// porque este renderiza FORA da árvore React (route handler → HTML), evitando o
// conflito do swagger-ui com o React 19 (que removeu `ReactDOM.findDOMNode`).
//
// PÚBLICO: a doc em si não é sensível (o `API.md` já é público). O "Try it out"
// usa o cookie JWT de mesma origem, então só testa os endpoints protegidos se o
// admin estiver logado; deslogado, eles respondem 401 (honesto).
//
// A spec vem de `GET /api/openapi` (gerada a partir dos schemas Zod reais).
export const GET = ApiReference({
  url: "/api/openapi",
  metaData: { title: "Kanglu — API (Swagger interativo)" },
});
