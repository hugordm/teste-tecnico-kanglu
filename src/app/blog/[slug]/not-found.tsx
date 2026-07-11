import Link from "next/link";

/**
 * 404 do blog. Renderiza quando um artigo chama notFound() — slug inexistente
 * OU um rascunho/in_review (que, por segurança, respondem igual a inexistente).
 * Identidade Kanglu: fundo creme, título bordô, ação em laranja.
 */
export default function ArticleNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-5 py-24 text-center">
      <p className="font-heading text-6xl font-bold text-kanglu-orange">404</p>

      <h1 className="mt-6 font-heading text-2xl font-bold text-kanglu-bordo sm:text-3xl">
        Artigo não encontrado
      </h1>
      <p className="mt-3 max-w-md text-kanglu-bordo/70">
        O conteúdo que você procura não existe, foi removido ou ainda não foi
        publicado.
      </p>

      <Link
        href="/blog"
        className="mt-8 rounded-lg bg-kanglu-orange px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-kanglu-orange/90"
      >
        Ver todos os artigos
      </Link>
    </main>
  );
}
