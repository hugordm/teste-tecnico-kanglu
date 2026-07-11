import { ToastProvider } from "./_components/toast";

// Layout de todo o /admin. O ToastProvider precisa envolver as páginas para
// que qualquer ação (salvar, publicar, gerar…) possa emitir toasts. O acesso
// em si é protegido no src/proxy.ts, antes de chegar aqui.
//
// O cabeçalho (logo + sair) NÃO fica aqui de propósito: a página de login
// (/admin/login) também vive sob este layout e não deve mostrar o shell do
// painel. Cada página autenticada monta seu próprio <AdminHeader>.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}
