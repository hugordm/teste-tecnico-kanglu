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

export function DateTimePicker({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
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
    onChange(compose(view.year, view.month, day, curHour, curMinute));
  }

  function selectToday() {
    const now = new Date();
    setView({ year: now.getFullYear(), month: now.getMonth() });
    onChange(
      compose(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        curHour,
        curMinute,
      ),
    );
  }

  function changeHour(hour: number) {
    if (parsed) {
      onChange(compose(parsed.year, parsed.month, parsed.day, hour, curMinute));
    } else {
      setPendingTime((t) => ({ ...t, hour }));
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
  const today = new Date();

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
              className="rounded-lg px-2 py-1 text-lg text-kanglu-bordo hover:bg-kanglu-cream"
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
                today.getFullYear() === view.year &&
                today.getMonth() === view.month &&
                today.getDate() === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  aria-pressed={isSelected || undefined}
                  className={`rounded-lg py-1.5 transition-colors ${
                    isSelected
                      ? "bg-kanglu-orange font-semibold text-white"
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
              onChange={(e) => changeHour(Number(e.target.value))}
              className="rounded-lg border border-kanglu-nude bg-kanglu-cream/40 px-2 py-1 text-sm text-kanglu-bordo outline-none focus:border-kanglu-orange"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {pad(h)}
                </option>
              ))}
            </select>
            <span className="text-kanglu-bordo">:</span>
            <select
              aria-label="Minuto"
              value={curMinute}
              onChange={(e) => changeMinute(Number(e.target.value))}
              className="rounded-lg border border-kanglu-nude bg-kanglu-cream/40 px-2 py-1 text-sm text-kanglu-bordo outline-none focus:border-kanglu-orange"
            >
              {Array.from({ length: 60 }, (_, mi) => (
                <option key={mi} value={mi}>
                  {pad(mi)}
                </option>
              ))}
            </select>
          </div>

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
