import { cookies } from "next/headers";
import { z } from "zod";
import { signToken, AUTH_COOKIE } from "@/lib/auth";

const loginInput = z.object({
  email: z.email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

// 7 dias, em segundos — casa com a validade do JWT (arquivo 3).
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = loginInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Dados inválidos", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    return Response.json(
      { error: "Credenciais de admin não configuradas" },
      { status: 500 },
    );
  }

  // Credencial errada é 401 — não revelamos se foi o e-mail ou a senha.
  if (email !== adminEmail || password !== adminPassword) {
    return Response.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  const token = await signToken(email);

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, token, {
    httpOnly: true, // JS do cliente não lê — mitiga XSS roubando o token
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // exige HTTPS em prod
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  return Response.json({ ok: true, email });
}
