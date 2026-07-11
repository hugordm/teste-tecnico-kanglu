"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE } from "@/lib/auth";

/**
 * Encerra a sessão do admin. Server Action (não é rota de API): pode ser
 * chamada direto de um Client Component. Apaga o cookie httpOnly — que o JS do
 * cliente não consegue tocar — e volta pro login.
 */
export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
  redirect("/admin/login");
}
