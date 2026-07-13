import { ArticleMarkdown } from "@/components/article-markdown";
import { TableOfContents } from "@/components/table-of-contents";
import { extractHeadings } from "@/lib/toc";

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
  // Extração ÚNICA dos headings: a mesma lista alimenta o índice (links) e os
  // ids das âncoras no corpo (passada ao ArticleMarkdown), então cada item do
  // índice cai exatamente na sua seção. Roda no content cru — o pipeline de
  // imagens não é tocado.
  const headings = extractHeadings(content);

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

      {/* Índice do artigo ("Neste artigo:") — só aparece com 2+ seções. Usa a
          mesma lista de headings passada ao corpo, então os links batem com as
          âncoras. Antes do corpo, depois da capa. */}
      {headings.length >= 2 && (
        <div className="mt-8">
          <TableOfContents entries={headings} />
        </div>
      )}

      {/* Corpo em markdown, estilizado com as cores da marca. Imagens do corpo
          (marcador [[imagem:URL]]) usam o título no alt. Recebe os `headings` já
          extraídos pra atribuir os ids das âncoras sem re-extrair. */}
      <div className="mt-8">
        <ArticleMarkdown content={content} title={title} headings={headings} />
      </div>
    </>
  );
}
