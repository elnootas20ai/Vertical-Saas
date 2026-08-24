import { useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import type { DeliveryInformeEntry } from './deliveryInformesCatalog';
import {
  currentInformePeriod,
  informePeriodLabel,
  INFORME_MONTH_LABELS_FULL,
  INFORME_MONTH_LABELS_SHORT,
  isFutureInformePeriod,
  type InformePeriod,
} from './loaders/informeTypes';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../../lib/vertialUiTokens';

function NivelBadge({ nivel }: { nivel?: DeliveryInformeEntry['nivel'] }) {
  if (!nivel || nivel === 'base') return null;
  if (nivel === 'normal') {
    return (
      <span className="rounded-full bg-rose-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        NORMAL
      </span>
    );
  }
  return (
    <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      PRO
    </span>
  );
}

export function DeliveryInformePeriodPicker({
  entry,
  onBack,
  onConfirm,
}: {
  entry: DeliveryInformeEntry;
  onBack: () => void;
  onConfirm: (period: InformePeriod) => void;
}) {
  const now = currentInformePeriod();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);

  const period = useMemo<InformePeriod>(() => ({ year, month }), [year, month]);
  const periodLabel = informePeriodLabel(period);
  const isFuture = isFutureInformePeriod(period);
  const isCurrentMonth = year === now.year && month === now.month;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-medium text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
      >
        ← Volver al catálogo
      </button>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
        <div className="border-b border-stone-100 bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-blue-50/80 px-5 py-5 dark:border-stone-800 dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-blue-950/30">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">{entry.title}</h2>
                <NivelBadge nivel={entry.nivel} />
              </div>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{entry.description}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-800 dark:bg-stone-900/80 dark:text-blue-300">
              <CalendarRange className="h-3.5 w-3.5" />
              Periodo mensual
            </span>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              ¿De qué mes quieres el informe?
            </p>
            <p className="mt-1 text-sm font-medium text-stone-700 dark:text-stone-200">
              Selecciona el mes y el año. El informe incluirá solo datos de ese periodo.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 text-stone-600 transition-colors hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-700 dark:border-stone-700 dark:text-stone-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/40"
              aria-label="Año anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <p className="text-base font-bold tabular-nums text-stone-900 dark:text-stone-100">{year}</p>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              disabled={year >= now.year}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 text-stone-600 transition-colors hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:text-stone-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/40"
              aria-label="Año siguiente"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {INFORME_MONTH_LABELS_SHORT.map((short, idx) => {
              const m = idx + 1;
              const selected = month === m;
              const future = isFutureInformePeriod({ year, month: m });
              const current = year === now.year && m === now.month;
              return (
                <button
                  key={short}
                  type="button"
                  disabled={future}
                  onClick={() => setMonth(m)}
                  className={`relative flex min-h-[4.5rem] flex-col items-center justify-center rounded-2xl border px-2 py-3 text-center transition-all ${
                    selected
                      ? 'border-blue-500 bg-blue-50 shadow-sm shadow-blue-500/10 dark:border-blue-500 dark:bg-blue-950/40'
                      : future
                        ? 'cursor-not-allowed border-stone-100 bg-stone-50/50 opacity-40 dark:border-stone-800 dark:bg-stone-900/40'
                        : 'border-stone-200 bg-white hover:border-blue-200 hover:bg-blue-50/40 dark:border-stone-700 dark:bg-stone-900 dark:hover:border-blue-800 dark:hover:bg-blue-950/30'
                  }`}
                >
                  <span className={`text-sm font-bold ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-stone-800 dark:text-stone-100'}`}>
                    {short}
                  </span>
                  <span className="mt-0.5 hidden text-[10px] text-stone-500 sm:block dark:text-stone-400">
                    {INFORME_MONTH_LABELS_FULL[idx]}
                  </span>
                  {current && (
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" title="Mes actual" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-stone-100 bg-stone-50/80 px-4 py-3 dark:border-stone-800 dark:bg-stone-950/50">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Periodo seleccionado</p>
            <p className="mt-0.5 text-base font-bold text-stone-900 dark:text-stone-100">{periodLabel}</p>
            {isCurrentMonth && (
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">Mes en curso — datos hasta hoy.</p>
            )}
            {isFuture && (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">No puedes generar informes de meses futuros.</p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onBack} className={VERTIAL_BTN_SECONDARY}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={isFuture}
              onClick={() => onConfirm(period)}
              className={VERTIAL_BTN_PRIMARY}
            >
              Generar informe · {periodLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
