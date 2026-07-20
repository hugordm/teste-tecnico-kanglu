// ---------------------------------------------------------------------------
// Regras do agendamento (publishAt) — puras, sem I/O.
//
// Módulo próprio (e não dentro de lib/validation) por um motivo concreto:
// validation.ts importa o Prisma, então é servidor-only. O editor do admin é um
// Client Component e precisa das MESMAS regras para avisar o usuário antes de
// mandar o request. Estas funções não tocam banco nem `server-only`, então
// rodam nos dois lados — uma definição só, zero risco de cliente e servidor
// discordarem sobre o que é "passado".
//
// A trava de verdade continua sendo a do servidor; o cliente só antecipa o erro.
// ---------------------------------------------------------------------------

/**
 * Tolerância ao comparar um agendamento com o "agora".
 *
 * O picker tem granularidade de MINUTO: escolher o minuto corrente às 16:20:45
 * produz 16:20:00 — 45s "no passado" sem que o usuário tenha feito nada errado.
 * Some a isso o tempo entre montar o payload e o request chegar, e o relógio do
 * cliente, que pode adiantar/atrasar alguns segundos em relação ao do servidor.
 * 60s absorve os três sem abrir brecha real: 16:15 quando são 16:20 continua
 * rejeitado, que é o caso do bug.
 */
const PUBLISH_AT_GRACE_MS = 60_000;

/** Mensagem única — mesma frase no cliente e no servidor. */
export const PUBLISH_AT_PAST_MESSAGE =
  "A data de agendamento não pode estar no passado. Escolha uma data e hora futuras.";

/**
 * O instante `publishAt` está no passado em relação a `now`?
 *
 * `now` é sempre injetado pelo chamador — no servidor, `new Date()` do MOMENTO
 * DO REQUEST (nunca um "agora" capturado no carregamento da tela, que numa aba
 * aberta há horas validaria contra um passado remoto).
 *
 * Comparação por timestamp (`getTime`), nunca por string: os dois lados são
 * instantes absolutos, então o fuso não entra na conta. A string do picker já
 * foi convertida de horário local para UTC antes de virar Date (localInputToIso
 * no editor + z.coerce.date no schema), e um instante é o mesmo instante em
 * qualquer fuso — é justamente por isso que comparar texto seria errado.
 */
export function isPastSchedule(publishAt: Date, now: Date): boolean {
  return publishAt.getTime() < now.getTime() - PUBLISH_AT_GRACE_MS;
}

/**
 * O agendamento MUDOU em relação ao que está gravado?
 *
 * Existe porque a trava vale para DEFINIR um agendamento, não para editar um
 * artigo que já tem um. Todo artigo do cron fica com `publishAt` no passado
 * depois das 09:00 — e o editor reenvia o campo em TODO save (o payload é
 * completo, não um delta). Sem esta comparação, salvar uma vírgula num artigo
 * antigo passaria a dar 400, quebrando a edição de tudo que o cron já publicou.
 *
 * Só um agendamento efetivamente novo (ou alterado) precisa estar no futuro;
 * reenviar o mesmo valor é um no-op e passa direto, no passado ou não.
 */
export function isScheduleChanged(
  next: Date | null,
  prev: Date | null,
): boolean {
  if (next === null || prev === null) return next !== prev;
  return next.getTime() !== prev.getTime();
}
