// Capa ilustrativa do artigo (imagem + crédito do modelo). Extraído para ser
// reusado nos DOIS lugares que mostram a capa: dentro do ArticleBody (coluna de
// leitura — mobile/tablet e prévia do editor) e como HERO largo no topo da
// página do artigo no desktop. Uma fonte única do markup do crédito, então as
// duas capas nunca divergem.
//
// `figureClassName`/`imgClassName` deixam o chamador controlar espaçamento e
// forma (ex.: hero mais largo e mais arredondado no desktop). Sem src, não
// renderiza nada (capa é opcional).

export function CoverImage({
  src,
  title,
  credit,
  sourceUrl,
  figureClassName,
  imgClassName = "w-full rounded-xl border border-kanglu-nude object-cover",
}: {
  src?: string | null;
  title: string;
  credit?: string | null;
  sourceUrl?: string | null;
  figureClassName?: string;
  imgClassName?: string;
}) {
  if (!src) return null;

  return (
    <figure className={figureClassName}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={`Ilustração do artigo: ${title}`} className={imgClassName} />
      {credit && (
        <figcaption className="mt-2 text-xs text-kanglu-bordo/50">
          Crédito da imagem:{" "}
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-kanglu-orange hover:underline"
            >
              {credit}
            </a>
          ) : (
            credit
          )}
        </figcaption>
      )}
    </figure>
  );
}
