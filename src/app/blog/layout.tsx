import { BlogChat } from "@/components/blog-chat";

// Layout da área pública do blog. Existe só para injetar o chatbot flutuante em
// TODAS as rotas /blog/* (listagem e artigo) — e em NENHUMA outra (home, admin).
// Não altera o markup das páginas: o <BlogChat/> é position:fixed e sobrepõe.
export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <BlogChat />
    </>
  );
}
