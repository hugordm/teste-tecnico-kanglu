"use client";

import { useEffect, useState } from "react";

// Mensagens rotativas durante a geração de artigo (loading de ~10-20s). Dão
// sensação de progresso e imersão no lugar de um texto estático. As mensagens
// NÃO refletem a etapa real — é só uma sequência plausível enquanto o loading
// está ativo; ao chegar na última, fica nela até a resposta chegar.
//
// Reutilizável pelas duas telas de geração. O componente assume que só fica
// montado ENQUANTO o loading está ativo — renderize-o com `{loading && ...}`.
// Assim, cada nova geração o remonta do zero (index 0), sem precisar resetar
// estado no efeito.

/** Sequência do fluxo por tema com busca web (/admin/generate-auto). */
export const GENERATE_AUTO_MESSAGES = [
  "Pesquisando o tema…",
  "Buscando fontes confiáveis…",
  "Analisando o conteúdo…",
  "Escrevendo o artigo…",
  "Gerando as imagens…",
  "Finalizando…",
];

/** Sequência do fluxo com URLs fornecidas (/admin/generate). */
export const GENERATE_URLS_MESSAGES = [
  "Lendo as fontes fornecidas…",
  "Extraindo o conteúdo…",
  "Escrevendo o artigo…",
  "Gerando as imagens…",
  "Finalizando…",
];

export function LoadingMessages({
  messages,
  intervalMs = 2500,
  className = "text-sm text-kanglu-bordo/50",
}: {
  messages: string[];
  intervalMs?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Para na última mensagem — fica em "Finalizando…" até a resposta chegar.
    if (index >= messages.length - 1) return;
    // setState só em callback assíncrono (timer), nunca síncrono no efeito.
    const t = setTimeout(() => setIndex((i) => i + 1), intervalMs);
    return () => clearTimeout(t);
  }, [index, messages.length, intervalMs]);

  // `key={index}` remonta o <span> a cada troca, então o fade-in toca de novo.
  return (
    <span key={index} className={`animate-message-fade ${className}`}>
      {messages[index]}
    </span>
  );
}
