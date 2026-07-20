"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Datepicker de data + hora com formato brasileiro (dd/mm/yyyy HH:mm), calendário
// em pt-BR e a identidade Kanglu — substitui o <input type="datetime-local">
// nativo (que mostrava mm/dd/yyyy e calendário em inglês).
//
// CONTRATO DE FUSO (crítico, não alterar): este componente é CONTROLADO por uma
// string local no MESMO formato do datetime-local — "YYYY-MM-DDTHH:mm" (horário
// local, sem fuso) — ou "" quando não há agendamento. Quem monta/consome essa
// string (isoToLocalInput / localInputToIso no editor) continua intacto: o valor
// que entra e sai daqui é byte-a-byte o mesmo de antes, então a conversão
// local↔UTC não muda. Internamente só manipulamos componentes de relógio de
// parede (ano/mês/dia/hora/min) como INTEIROS — nenhuma aritmética de Date/fuso
// toca no valor emitido, então não há como introduzir drift de fuso.

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
// Cabeçalho de dias da semana começando no domingo (getDay() === 0).
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const pad = (n: number) => String(n).padStart(2, "0");

type Parsed = {
  year: number;
  month: number; // 0-11
  day: number;
  hour: number;
  minute: number;
};

/** "YYYY-MM-DDTHH:mm" -> partes inteiras, ou null se vazio/malformado. */
function parseValue(value: string): Parsed | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]) - 1,
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}

/** Partes inteiras -> "YYYY-MM-DDTHH:mm" (mesmo shape do datetime-local). */
function compose(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

/** Exibição pt-BR: "dd/mm/yyyy HH:mm". */
function formatDisplay(p: Parsed): string {
  return `${pad(p.day)}/${pad(p.month + 1)}/${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}

// --- Bloqueio de passado (disablePast) -------------------------------------
//
// Toda a comparação abaixo é feita em RELÓGIO DE PAREDE LOCAL, com inteiros —
// o mesmo referencial da string que o componente controla. É o que mantém o
// contrato de fuso intacto: o `new Date()` do navegador dá a hora local do
// usuário, e a string emitida também é local; a conversão para UTC continua
// acontecendo só lá fora (localInputToIso). Nada aqui compara texto de data,
// que seria errado justamente por ignorar fuso.
//
// O servidor revalida de qualquer forma (ver isPastSchedule em lib/validation):
// isto é conveniência de UI, não a trava de segurança.

/** Partes locais do "agora" — recalculadas a cada render, nunca congeladas. */
function nowParts(): Parsed {
  const d = new Date();
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}

/** Chave ordenável de um dia (YYYYMMDD) — compara datas sem montar Date. */
function dayKey(year: number, month: number, day: number): number {
  return year * 10000 + month * 100 + day;
}

/** Minutos desde a meia-noite — compara horários dentro do mesmo dia. */
function minutesOfDay(hour: number, minute: number): number {
  return hour * 60 + minute;
}

export function DateTimePicker({
  value,
  onChange,
  id,
  disablePast = false,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  /**
   * Impede ESCOLHER um instante no passado: dias anteriores a hoje ficam
   * desabilitados e, em hoje, as horas/minutos já passados também.
   *
   * Não mexe no valor que chega por props: um artigo já agendado para o passado
   * (todo artigo do cron depois das 09:00) continua exibindo a sua data e pode
   * ser salvo como está — o que fica bloqueado é trocá-la por outra no passado.
   */
  disablePast?: boolean;
}) {
  const parsed = useMemo(() => parseValue(value), [value]);

  const [open, setOpen] = useState(false);
  // Mês exibido na grade. Inicia no mês da data selecionada ou no mês atual.
  const [view, setView] = useState(() => {
    if (parsed) return { year: parsed.year, month: parsed.month };
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  // Hora usada ao escolher um dia quando ainda NÃO há data selecionada (a string
  // vazia não guarda hora). Com data selecionada, a hora vem de `parsed`.
  const [pendingTime, setPendingTime] = useState({ hour: 9, minute: 0 });

  const wrapRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou apertar Esc — comportamento padrão de popover.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Hora "corrente" para compor a string: da data selecionada, ou a pendente.
  const curHour = parsed ? parsed.hour : pendingTime.hour;
  const curMinute = parsed ? parsed.minute : pendingTime.minute;

  // "Agora" local, relido a cada render (o componente re-renderiza a cada
  // interação): abrir o painel de manhã e usá-lo à tarde não deixa horários
  // vencidos habilitados. O servidor confere de novo no request, então nem essa
  // janela de segundos importa.
  const now = nowParts();
  const todayKey = dayKey(now.year, now.month, now.day);

  /** Um dia da grade está bloqueado? (só com disablePast, e só antes de hoje) */
  function isDayDisabled(day: number): boolean {
    return disablePast && dayKey(view.year, view.month, day) < todayKey;
  }

  // O dia SELECIONADO é hoje / é anterior a hoje? Governa os selects de hora:
  // em hoje, escondemos os horários já passados; num dia anterior a hoje
  // (situação só possível com um agendamento antigo que veio do banco) não há
  // horário válido nenhum, então os selects ficam travados — o caminho é
  // escolher primeiro um dia daqui pra frente.
  const selectedKey = parsed ? dayKey(parsed.year, parsed.month, parsed.day) : null;
  const selectedIsToday = selectedKey === todayKey;
  const timeLocked = disablePast && selectedKey !== null && selectedKey < todayKey;

  /** Hora bloqueada: só em hoje, e só se a hora inteira já passou. */
  function isHourDisabled(hour: number): boolean {
    if (!disablePast || !selectedIsToday) return false;
    return hour < now.hour;
  }

  /** Minuto bloqueado: só em hoje, dentro da hora corrente, se já passou. */
  function isMinuteDisabled(minute: number): boolean {
    if (!disablePast || !selectedIsToday || curHour !== now.hour) return false;
    return minute < now.minute;
  }

  /**
   * Hora/minuto a usar ao selecionar `day`: a atual, ou a de AGORA se aquele dia
   * for hoje e a hora corrente já tiver passado. Sem isto, ter 08:00 escolhido e
   * clicar em "hoje" às 16:20 produziria 16:20 → 08:00, um instante passado que
   * o servidor recusaria — o clamp resolve na origem em vez de dar erro depois.
   */
  function timeForDay(year: number, month: number, day: number) {
    const isToday = dayKey(year, month, day) === todayKey;
    if (
      disablePast &&
      isToday &&
      minutesOfDay(curHour, curMinute) < minutesOfDay(now.hour, now.minute)
    ) {
      return { hour: now.hour, minute: now.minute };
    }
    return { hour: curHour, minute: curMinute };
  }

  function openPopover() {
    // Ao abrir, salta a grade para o mês da data já selecionada (bom UX).
    if (parsed) setView({ year: parsed.year, month: parsed.month });
    setOpen(true);
  }

  function goPrevMonth() {
    // Virada de ano tratada: janeiro (0) -> dezembro (11) do ano anterior.
    setView((v) =>
      v.month === 0
        ? { year: v.year - 1, month: 11 }
        : { year: v.year, month: v.month - 1 },
    );
  }
  function goNextMonth() {
    // Virada de ano tratada: dezembro (11) -> janeiro (0) do ano seguinte.
    setView((v) =>
      v.month === 11
        ? { year: v.year + 1, month: 0 }
        : { year: v.year, month: v.month + 1 },
    );
  }

  function selectDay(day: number) {
    if (isDayDisabled(day)) return; // o botão já está disabled; guarda dupla
    const { hour, minute } = timeForDay(view.year, view.month, day);
    onChange(compose(view.year, view.month, day, hour, minute));
  }

  function selectToday() {
    const t = nowParts();
    setView({ year: t.year, month: t.month });
    const { hour, minute } = timeForDay(t.year, t.month, t.day);
    onChange(compose(t.year, t.month, t.day, hour, minute));
  }

  function changeHour(hour: number) {
    // Trocar para a hora corrente de hoje pode deixar o minuto no passado
    // (16:20 agora, minuto escolhido 05 → 16:05). Puxa o minuto para o de agora
    // nesse caso; nos demais, mantém o que estava.
    const minute =
      disablePast && selectedIsToday && hour === now.hour && curMinute < now.minute
        ? now.minute
        : curMinute;
    if (parsed) {
      onChange(compose(parsed.year, parsed.month, parsed.day, hour, minute));
    } else {
      setPendingTime({ hour, minute });
    }
  }
  function changeMinute(minute: number) {
    if (parsed) {
      onChange(compose(parsed.year, parsed.month, parsed.day, curHour, minute));
    } else {
      setPendingTime((t) => ({ ...t, minute }));
    }
  }

  // Layout da grade: quantas células em branco antes do dia 1, e quantos dias
  // tem o mês. Usamos SÓ para desenhar — o valor emitido vem de inteiros, nunca
  // de um Date. `new Date(y, m, 1)` no cliente é horário local, consistente aqui.
  const firstWeekday = new Date(view.year, view.month, 1).getDay(); // 0=domingo
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();

  // Voltar mês é inútil (e enganoso) quando o mês exibido já é o atual ou
  // anterior a ele: não há um único dia selecionável para trás. O mês anterior
  // ainda é ALCANÇÁVEL quando o valor que veio do banco está lá (o artigo
  // agendado antigo abre no mês dele) — só não dá pra afundar mais.
  const prevMonthDisabled =
    disablePast &&
    view.year * 12 + view.month <= now.year * 12 + now.month;

  return (
    <div className="relative" ref={wrapRef}>
      {/* Campo/gatilho: mostra a data formatada em pt-BR ou o placeholder. */}
      <button
        type="button"
        id={id}
        onClick={() => (open ? setOpen(false) : openPopover())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-kanglu-nude bg-kanglu-cream/40 px-3 py-2 text-left text-kanglu-bordo outline-none focus:border-kanglu-orange"
      >
        <span className={parsed ? "" : "text-kanglu-bordo/40"}>
          {parsed ? formatDisplay(parsed) : "Selecione data e hora"}
        </span>
        <span aria-hidden className="ml-2 text-kanglu-orange">
          📅
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Selecionar data e hora"
          className="absolute left-0 z-20 mt-2 w-72 max-w-[calc(100vw-2.5rem)] max-h-[80vh] overflow-y-auto rounded-xl border border-kanglu-nude bg-white p-3 shadow-lg"
        >
          {/* Navegação de mês/ano */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={goPrevMonth}
              aria-label="Mês anterior"
              disabled={prevMonthDisabled}
              className="rounded-lg px-2 py-1 text-lg text-kanglu-bordo hover:bg-kanglu-cream disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            >
              ‹
            </button>
            <span className="font-heading text-sm font-semibold text-kanglu-bordo">
              {MONTHS[view.month]} {view.year}
            </span>
            <button
              type="button"
              onClick={goNextMonth}
              aria-label="Próximo mês"
              className="rounded-lg px-2 py-1 text-lg text-kanglu-bordo hover:bg-kanglu-cream"
            >
              ›
            </button>
          </div>

          {/* Cabeçalho de dias da semana */}
          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-kanglu-bordo/50">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="py-1">
                {w}
              </span>
            ))}
          </div>

          {/* Grade de dias — células em branco antes do dia 1 (sem dias de meses
              vizinhos, então não há dia "de fora" clicável por engano). */}
          <div className="mt-1 grid grid-cols-7 gap-1 text-center text-sm">
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const isSelected =
                parsed &&
                parsed.year === view.year &&
                parsed.month === view.month &&
                parsed.day === day;
              const isToday =
                now.year === view.year &&
                now.month === view.month &&
                now.day === day;
              // Dia no passado: não clicável. Continua VISÍVEL (e marcado, se for
              // o agendamento antigo do artigo) — o valor não some, só não pode
              // ser reescolhido.
              const disabled = isDayDisabled(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  disabled={disabled}
                  title={disabled ? "Data no passado" : undefined}
                  aria-pressed={isSelected || undefined}
                  className={`rounded-lg py-1.5 transition-colors ${
                    isSelected
                      ? "bg-kanglu-orange font-semibold text-white"
                      : disabled
                        ? "cursor-not-allowed text-kanglu-bordo/25"
                        : isToday
                          ? "text-kanglu-bordo ring-1 ring-kanglu-orange/40 hover:bg-kanglu-cream"
                          : "text-kanglu-bordo hover:bg-kanglu-cream"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Hora e minuto */}
          <div className="mt-3 flex items-center gap-2 border-t border-kanglu-nude pt-3">
            <span className="text-sm font-medium text-kanglu-bordo">Hora</span>
            <select
              aria-label="Hora"
              value={curHour}
              disabled={timeLocked}
              onChange={(e) => changeHour(Number(e.target.value))}
              className="rounded-lg border border-kanglu-nude bg-kanglu-cream/40 px-2 py-1 text-sm text-kanglu-bordo outline-none focus:border-kanglu-orange disabled:cursor-not-allowed disabled:opacity-50"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h} disabled={isHourDisabled(h)}>
                  {pad(h)}
                </option>
              ))}
            </select>
            <span className="text-kanglu-bordo">:</span>
            <select
              aria-label="Minuto"
              value={curMinute}
              disabled={timeLocked}
              onChange={(e) => changeMinute(Number(e.target.value))}
              className="rounded-lg border border-kanglu-nude bg-kanglu-cream/40 px-2 py-1 text-sm text-kanglu-bordo outline-none focus:border-kanglu-orange disabled:cursor-not-allowed disabled:opacity-50"
            >
              {Array.from({ length: 60 }, (_, mi) => (
                <option key={mi} value={mi} disabled={isMinuteDisabled(mi)}>
                  {pad(mi)}
                </option>
              ))}
            </select>
          </div>

          {/* Só aparece no caso do agendamento antigo (data já passada vinda do
              banco): explica por que os selects estão travados e o que fazer. */}
          {timeLocked && (
            <p className="mt-2 text-xs text-kanglu-bordo/50">
              Este agendamento já passou. Escolha um dia a partir de hoje para
              mudar o horário.
            </p>
          )}

          {/* Ações rápidas */}
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={selectToday}
              className="text-sm font-medium text-kanglu-orange hover:underline"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-kanglu-orange px-3 py-1 text-sm font-semibold text-white hover:bg-kanglu-orange/90"
            >
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
