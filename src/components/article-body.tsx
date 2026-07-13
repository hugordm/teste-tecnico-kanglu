import { ArticleMarkdown } from "@/components/article-markdown";
import { TableOfContents } from "@/components/table-of-contents";
import { CoverImage } from "@/components/cover-image";
import { extractHeadings } from "@/lib/toc";
import { formatReadingTime } from "@/lib/reading-time";

// Render COMPARTILHADO do corpo do artigo (capa + conteúdo) entre o blog público
// (/blog/[slug]) e a PRÉVIA do editor admin. Fonte única da aparência: como as
// duas telas usam este mesmo componente, capa e corpo nunca mais divergem — foi
// justamente a divergência (prévia sem o bloco da capa) que causava a capa a não
// aparecer na prévia. Sem "use client": puro, roda como Server Component no blog
// (bom pra SEO) e também dentro do Client Component do editor.

// Formata datas em pt-BR ("13 de julho de 2026"). Criado uma vez no módulo.
const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function ArticleBody({
  title,
  content,
  ogImage,
  imageCredit,
  imageSourceUrl,
  publishedAt,
  tocInline = "always",
}: {
  title: string;
  content: string;
  ogImage?: string | null;
  imageCredit?: string | null;
  imageSourceUrl?: string | null;
  publishedAt?: Date | null;
  // Onde o índice inline (no topo do corpo) aparece:
  // - "always": sempre (mobile/tablet e prévia do editor).
  // - "mobileOnly": some no desktop (lg+), onde a página do artigo mostra o
  //   índice numa sidebar sticky. Assim só há UM índice visível por breakpoint.
  tocInline?: "always" | "mobileOnly";
}) {
  // Extração ÚNICA dos headings: a mesma lista alimenta o índice (links) e os
  // ids das âncoras no corpo (passada ao ArticleMarkdown), então cada item do
  // índice cai exatamente na sua seção. Roda no content cru — o pipeline de
  // imagens não é tocado.
  const headings = extractHeadings(content);

  // Tempo de leitura calculado do próprio content — como ArticleBody é
  // compartilhado, aparece no blog público e na prévia sem duplicar lógica.
  const readingTime = formatReadingTime(content);

  return (
    <>
      {/* Cabeçalho meta: data (quando houver) · tempo de leitura. Discreto, no
          mesmo tom da data. A data só entra quando `publishedAt` é passado (blog
          público); na prévia, que não tem data, mostra só o tempo de leitura. */}
      <p className="mt-3 text-sm text-kanglu-bordo/50">
        {publishedAt && (
          <>
            <time dateTime={publishedAt.toISOString()}>
              {dateFmt.format(publishedAt)}
            </time>
            {" · "}
          </>
        )}
        {readingTime}
      </p>

      {/* Imagem ilustrativa no topo, com crédito do modelo logo abaixo. Só
          aparece quando o artigo tem imagem (capa é opcional). Fica na coluna de
          leitura em todos os tamanhos. */}
      <CoverImage
        src={ogImage}
        title={title}
        credit={imageCredit}
        sourceUrl={imageSourceUrl}
        figureClassName="mt-8"
      />

      {/* Índice do artigo ("Neste artigo:") — só aparece com 2+ seções. Usa a
          mesma lista de headings passada ao corpo, então os links batem com as
          âncoras. Fica no topo do corpo (depois da capa). Quando `tocInline` é
          "mobileOnly", some no desktop (lg+) — lá a página do artigo mostra o
          índice numa sidebar sticky. */}
      {headings.length >= 2 && (
        <div className={`mt-8${tocInline === "mobileOnly" ? " lg:hidden" : ""}`}>
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
