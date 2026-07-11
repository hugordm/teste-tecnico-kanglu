import Image from "next/image";
import Link from "next/link";

// Cabeçalho da marca no blog público: a logo (imagem) leva de volta à home.
// Mesma imagem usada no painel admin; centralizada num container max-w-5xl.
export function SiteHeader() {
  return (
    <header className="border-b border-kanglu-nude bg-kanglu-cream">
      <div className="mx-auto flex w-full max-w-5xl items-center px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center" aria-label="Kanglu — página inicial">
          <Image
            src="/kanglu-logo.png"
            alt="Kanglu"
            width={360}
            height={96}
            priority
            className="h-8 w-auto"
          />
        </Link>
      </div>
    </header>
  );
}
