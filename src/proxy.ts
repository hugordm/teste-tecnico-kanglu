import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// No Next 16 o antigo `middleware.ts` foi renomeado para `proxy.ts`. Roda antes
// de renderizar a rota — é onde barramos o acesso ao painel antes mesmo de o
// HTML do admin existir. Compatível com o edge runtime (jose usa WebCrypto).

const AUTH_COOKIE = "token"; // espelha AUTH_COOKIE de src/lib/auth.ts
const LOGIN_PATH = "/admin/login";

// O segredo é lido a cada request (o proxy pode rodar isolado, sem globals
// compartilhados) — mas é barato. TextEncoder é global no edge.
function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET não definido no ambiente");
  return new TextEncoder().encode(secret);
}

/** True se o cookie contém um JWT válido (assinatura + expiração conferidas). */
async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    // Assinatura inválida, expirado ou malformado → tratado como não autenticado.
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const authed = await isAuthenticated(req);
  const isLoginPage = pathname === LOGIN_PATH;

  // Já logado tentando ver o login: manda direto pro painel.
  if (isLoginPage) {
    if (authed) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    return NextResponse.next();
  }

  // Qualquer outra rota /admin/* exige sessão. Sem ela, vai pro login e
  // guarda o destino em ?next= para voltar depois de autenticar.
  if (!authed) {
    const loginUrl = new URL(LOGIN_PATH, req.url);
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Só intercepta o painel. O blog público e as rotas de API ficam de fora
// (a API já se protege sozinha via getAuth).
export const config = {
  matcher: ["/admin/:path*"],
};
