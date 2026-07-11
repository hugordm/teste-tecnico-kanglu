import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";

// O segredo precisa ser bytes para o jose (HS256). Resolvemos uma vez só.
function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Falha barulhenta na inicialização é melhor que um 500 misterioso depois.
    throw new Error("JWT_SECRET não definido no ambiente");
  }
  return new TextEncoder().encode(secret);
}

export const AUTH_COOKIE = "token";

export interface AuthPayload extends JWTPayload {
  email: string;
}

/**
 * Assina um JWT HS256 identificando o admin logado.
 * Validade de 7 dias — é um painel interno, não precisa de refresh token.
 */
export async function signToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

/**
 * Extrai e valida o crachá da requisição. Aceita das duas formas:
 *   1. Header `Authorization: Bearer <jwt>`  (clientes de API / curl)
 *   2. Cookie httpOnly `token`               (navegador)
 * O header tem prioridade. Retorna o payload se válido, ou `null` — nunca
 * lança, para o chamador poder responder 401 de forma limpa.
 */
export async function getAuth(req: Request): Promise<AuthPayload | null> {
  const token = await readToken(req);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify<AuthPayload>(token, getSecret());
    return payload;
  } catch {
    // Assinatura inválida, expirado, malformado — tudo cai aqui como "sem crachá".
    return null;
  }
}

async function readToken(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  // cookies() é async no Next 16.
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE)?.value ?? null;
}
