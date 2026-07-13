import { ArticleMarkdown } from "@/components/article-markdown";

// Render COMPARTILHADO do corpo do artigo (capa + conteúdo) entre o blog público
// (/blog/[slug]) e a PRÉVIA do editor admin. Fonte única da aparência: como as
// duas telas usam este mesmo componente, capa e corpo nunca mais divergem — foi
// justamente a divergência (prévia sem o bloco da capa) que causava a capa a não
// aparecer na prévia. Sem "use client": puro, roda como Server Component no blog
// (bom pra SEO) e também dentro do Client Component do editor.

export function ArticleBody({
  title,
  content,
  ogImage,
  imageCredit,
  imageSourceUrl,
}: {
  title: string;
  content: string;
  ogImage?: string | null;
  imageCredit?: string | null;
  imageSourceUrl?: string | null;
}) {
  return (
    <>
      {/* Imagem ilustrativa no topo, com crédito do modelo logo abaixo. Só
          aparece quando o artigo tem imagem — do contrário o layout segue normal
          (imagem é opcional). */}
      {ogImage && (
        <figure className="mt-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ogImage}
            alt={`Ilustração do artigo: ${title}`}
            className="w-full rounded-xl border border-kanglu-nude object-cover"
          />
          {imageCredit && (
            <figcaption className="mt-2 text-xs text-kanglu-bordo/50">
              Crédito da imagem:{" "}
              {imageSourceUrl ? (
                <a
                  href={imageSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-kanglu-orange hover:underline"
                >
                  {imageCredit}
                </a>
              ) : (
                imageCredit
              )}
            </figcaption>
          )}
        </figure>
      )}

      {/* Corpo em markdown, estilizado com as cores da marca. Imagens do corpo
          (marcador [[imagem:URL]]) usam o título no alt. */}
      <div className="mt-8">
        <ArticleMarkdown content={content} title={title} />
      </div>
    </>
  );
}
