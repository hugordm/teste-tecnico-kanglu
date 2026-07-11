// Wrapper único das chamadas do admin. Centraliza o padrão "fetch → JSON →
// erro com a mensagem do servidor", pra cada página só precisar de try/catch +
// toast. Lança ApiError (com status) para quem quiser reagir a códigos
// específicos — ex.: 422 do portão de publicação, 502 da geração por IA.

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type JsonBody = Record<string, unknown>;

/**
 * Faz a requisição enviando/recebendo JSON. `credentials: "same-origin"`
 * garante que o cookie httpOnly de sessão vá junto. Em !ok, extrai a mensagem
 * de erro do corpo (`{ error }`) e lança ApiError com o status.
 */
export async function apiFetch<T = unknown>(
  input: string,
  options: { method?: string; body?: JsonBody } = {},
): Promise<T> {
  const { method = "GET", body } = options;

  let res: Response;
  try {
    res = await fetch(input, {
      method,
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Falha de rede antes de qualquer resposta HTTP.
    throw new ApiError("Falha de conexão. Verifique sua rede.", 0);
  }

  // 204/sem corpo: devolve undefined tipado.
  const text = await res.text();
  const data = text ? (JSON.parse(text) as JsonBody) : {};

  if (!res.ok) {
    const message =
      (typeof data.error === "string" && data.error) ||
      `Erro ${res.status}`;
    const code = typeof data.code === "string" ? data.code : undefined;
    throw new ApiError(message, res.status, code);
  }

  return data as T;
}
