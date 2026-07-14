"use client";

import { useState } from "react";

// Botões de compartilhar do artigo (fim da página pública). Discreto e
// editorial (estilo Medium): "Compartilhar:" + uma linha de ícones em
// MONOCROMÁTICO na cor da marca (bordô → laranja no hover), sem as cores de
// cada rede, sem barra flutuante. As redes são simples links de share (abrem em
// nova aba); só o "copiar link" precisa de cliente (navigator.clipboard), então
// o bloco todo é um Client Component pequeno.
//
// A URL recebida já é ABSOLUTA (canônica de produção, montada no server com a
// base do site.ts) — aqui só encodamos para os parâmetros de cada rede.

export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const encUrl = encodeURIComponent(url);
  const encTitle = encodeURIComponent(title);
  const encTitleUrl = encodeURIComponent(`${title} ${url}`);

  // Redes: só links (server-safe por natureza; aqui viram <a> no cliente junto
  // do botão de copiar). Ordem: os canais mais usados primeiro.
  const networks: { name: string; href: string; icon: React.ReactNode }[] = [
    {
      name: "WhatsApp",
      href: `https://wa.me/?text=${encTitleUrl}`,
      icon: <IconWhatsApp />,
    },
    {
      name: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encUrl}`,
      icon: <IconLinkedIn />,
    },
    {
      name: "X (Twitter)",
      href: `https://twitter.com/intent/tweet?text=${encTitle}&url=${encUrl}`,
      icon: <IconX />,
    },
    {
      name: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encUrl}`,
      icon: <IconFacebook />,
    },
    {
      name: "E-mail",
      href: `mailto:?subject=${encTitle}&body=${encTitleUrl}`,
      icon: <IconEmail />,
    },
  ];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      // Volta ao estado normal depois de 2s. Se o usuário copiar de novo antes
      // disso, o novo setCopied(true) só reforça — sem timer acumulado relevante.
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard indisponível (contexto inseguro / permissão negada): não
      // quebramos a página — o usuário ainda pode copiar da barra de endereço.
    }
  }

  const btnBase =
    "flex h-9 w-9 items-center justify-center rounded-full text-kanglu-bordo/55 transition-colors hover:bg-kanglu-orange/10 hover:text-kanglu-orange focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kanglu-orange";

  return (
    <section
      aria-label="Compartilhar este artigo"
      className="mt-12 border-t border-kanglu-nude pt-6"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-semibold text-kanglu-bordo">
          Compartilhar:
        </span>

        <div className="flex flex-wrap items-center gap-1">
          {networks.map((n) => (
            <a
              key={n.name}
              href={n.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Compartilhar no ${n.name}`}
              title={`Compartilhar no ${n.name}`}
              className={btnBase}
            >
              {n.icon}
            </a>
          ))}

          <button
            type="button"
            onClick={copyLink}
            aria-label="Copiar link do artigo"
            title="Copiar link"
            className={btnBase}
          >
            {copied ? <IconCheck /> : <IconLink />}
          </button>
        </div>

        {/* Feedback do copiar — região viva sempre no DOM: a troca de texto é
            anunciada por leitores de tela. min-w evita "pulo" de layout. */}
        <span
          aria-live="polite"
          className="min-w-[4.5rem] text-sm font-medium text-kanglu-orange"
        >
          {copied ? "Copiado!" : ""}
        </span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ícones das redes: paths do Simple Icons (CC0), monocromáticos via
// currentColor — herdam a cor da marca do botão (bordô/laranja), NÃO a cor
// oficial de cada rede. aria-hidden: o aria-label do botão já dá o significado.
// ---------------------------------------------------------------------------
function brandIconProps() {
  return {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    className: "h-[18px] w-[18px]",
    "aria-hidden": true,
  };
}

function IconWhatsApp() {
  return (
    <svg {...brandIconProps()}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function IconLinkedIn() {
  return (
    <svg {...brandIconProps()}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function IconX() {
  return (
    <svg {...brandIconProps()}>
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

function IconFacebook() {
  return (
    <svg {...brandIconProps()}>
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  );
}

// E-mail e utilitários (link/check): traço (stroke), mesmo tamanho visual.
function utilIconProps() {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-[18px] w-[18px]",
    "aria-hidden": true,
  };
}

function IconEmail() {
  return (
    <svg {...utilIconProps()}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg {...utilIconProps()}>
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg {...utilIconProps()}>
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}
