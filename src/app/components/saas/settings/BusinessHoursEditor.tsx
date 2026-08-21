import { useEffect, useState } from 'react';
import { ChevronDown, Clock, Copy, Globe, Info, Sparkles, Store } from 'lucide-react';
import { toast } from 'sonner';
import type { BusinessHoursConfig, WeekSchedule } from '../../../lib/settingsApi';
import {
  applyHoursToOpenDays,
  cloneWeekSchedule,
  countOpenScheduleDays,
  ensureOpenDayTimes,
  DEFAULT_BUSINESS_HOURS_CONFIG,
  getBusinessHoursIssue,
  getBusinessHoursPresetSchedule,
  isOvernightScheduleWindow,
  normalizeScheduleTimeValue,
  patchScheduleDays,
  SCHEDULE_DAY_LABELS_ES,
  type BusinessHoursPresetId,
  type ScheduleDayKey,
  WEEKDAY_KEYS,
  WEEKEND_KEYS,
} from '../../../lib/businessHoursUtils';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY, VERTIAL_SURFACE } from '../../../lib/vertialUiTokens';

const WEEKDAY_LABELS = SCHEDULE_DAY_LABELS_ES;

const ALL_DAYS = [...WEEKDAY_KEYS, ...WEEKEND_KEYS] as ScheduleDayKey[];

const WEEKDAY_SHORT: Record<ScheduleDayKey, string> = {
  monday: 'L',
  tuesday: 'M',
  wednesday: 'X',
  thursday: 'J',
  friday: 'V',
  saturday: 'S',
  sunday: 'D',
};

const PRESETS: { id: BusinessHoursPresetId; label: string; hint: string }[] = [
  { id: 'retail', label: 'Comercio habitual', hint: 'L–V 9–19 · Sáb 10–14' },
  { id: 'extended', label: 'Jornada amplia', hint: 'Todos los días 8–22' },
  { id: 'mornings', label: 'Solo mañanas', hint: 'L–S 8–14' },
];

const TIMEZONE_OPTIONS = [
  'Europe/Madrid',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'America/New_York',
  'America/Mexico_City',
  'America/Bogota',
  'America/Buenos_Aires',
  'UTC',
];

type Props = {
  config: BusinessHoursConfig;
  onChange: (config: BusinessHoursConfig) => void;
  storeLabel?: string;
  compact?: boolean;
  /** Alta PDV: layout denso en modal sin scroll. */
  wizard?: boolean;
};

function firstOpenDayHours(schedule: WeekSchedule): { from: string; to: string } {
  for (const day of ALL_DAYS) {
    if (schedule[day].open) {
      return {
        from: normalizeScheduleTimeValue(schedule[day].from, '09:00'),
        to: normalizeScheduleTimeValue(schedule[day].to, '19:00'),
      };
    }
  }
  return { from: '09:00', to: '19:00' };
}

function groupHours(schedule: WeekSchedule, days: readonly ScheduleDayKey[]) {
  const openDays = days.filter((d) => schedule[d].open);
  const ref = openDays.length > 0 ? schedule[openDays[0]] : schedule[days[0]];
  const allSameOpen = days.every((d) => schedule[d].open === schedule[days[0]].open);
  const allSameTimes = openDays.every(
    (d) => schedule[d].from === ref.from && schedule[d].to === ref.to,
  );
  return {
    open: openDays.length > 0,
    from: normalizeScheduleTimeValue(ref.from, '09:00'),
    to: normalizeScheduleTimeValue(ref.to, '19:00'),
    mixed: !allSameOpen || (openDays.length > 0 && !allSameTimes),
  };
}

function OpenClosedSwitch({ open, onToggle, id }: { open: boolean; onToggle: () => void; id: string }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={open}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        open ? 'bg-[#2563EB]' : 'bg-stone-200 dark:bg-stone-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          open ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

function splitHhMm(value: string): { hour: string; minute: string } {
  const n = normalizeScheduleTimeValue(value);
  if (!n) return { hour: '', minute: '' };
  const [hour, minute] = n.split(':');
  return { hour, minute };
}

function TimeField({
  value,
  onChange,
  disabled,
  label,
  fallback = '09:00',
  large = false,
  dense = false,
  hideLabel = false,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  label: string;
  /** Si el valor viene vacío/roto, mostramos y emitimos este HH:mm (nunca "--"). */
  fallback?: string;
  /** Controles más grandes (wizard PDV). */
  large?: boolean;
  /** Ultra compacto (una línea por día). */
  dense?: boolean;
  hideLabel?: boolean;
}) {
  const normalized = normalizeScheduleTimeValue(value, fallback) || fallback;
  const { hour, minute } = splitHhMm(normalized);
  const safeHour = hour || '09';
  const safeMinute = minute || '00';
  const minuteChoices =
    safeMinute && !MINUTE_OPTIONS.includes(safeMinute)
      ? [...MINUTE_OPTIONS, safeMinute].sort()
      : MINUTE_OPTIONS;

  const emit = (nextHour: string, nextMinute: string) => {
    const h = nextHour || '09';
    const m = nextMinute || '00';
    onChange(`${h}:${m}`);
  };

  const selectClass = dense
    ? 'h-8 min-w-[2.75rem] appearance-none rounded border-0 bg-transparent px-1 text-center text-sm font-semibold tabular-nums text-stone-900 outline-none disabled:opacity-45 dark:text-stone-100'
    : large
      ? 'h-12 min-w-[3.75rem] appearance-none rounded-lg border-0 bg-transparent px-2 text-center text-lg font-semibold tabular-nums text-stone-900 outline-none disabled:opacity-45 dark:text-stone-100'
      : 'h-10 min-w-[3.25rem] appearance-none rounded-lg border-0 bg-transparent px-1.5 text-center text-base font-semibold tabular-nums text-stone-900 outline-none disabled:opacity-45 dark:text-stone-100';

  return (
    <label className={`inline-flex flex-col ${dense ? 'gap-0' : 'gap-1'}`}>
      {!hideLabel ? (
        <span
          className={`font-medium uppercase tracking-wide text-stone-500 ${
            dense ? 'sr-only' : large ? 'text-xs' : 'text-[11px]'
          }`}
        >
          {label}
        </span>
      ) : null}
      <span
        className={`inline-flex items-center gap-0.5 bg-white dark:bg-stone-900 ${
          dense ? 'rounded-lg border px-1 py-0' : large ? 'rounded-xl border-2 px-2.5 py-1' : 'rounded-xl border-2 px-2 py-0.5'
        } ${
          disabled
            ? 'border-stone-100 opacity-60 dark:border-stone-800'
            : dense
              ? 'border-stone-200 focus-within:border-blue-500 dark:border-stone-700'
              : 'border-stone-200 focus-within:border-[var(--v-blue,#2563eb)] focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-stone-700'
        }`}
      >
        <select
          aria-label={`${label} — hora`}
          disabled={disabled}
          value={safeHour}
          onChange={(e) => emit(e.target.value, safeMinute)}
          className={selectClass}
        >
          {HOUR_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span
          className={`font-bold text-stone-400 ${dense ? 'text-sm' : large ? 'text-lg pb-0.5' : 'text-base pb-0.5'}`}
          aria-hidden
        >
          :
        </span>
        <select
          aria-label={`${label} — minutos`}
          disabled={disabled}
          value={safeMinute}
          onChange={(e) => emit(safeHour, e.target.value)}
          className={selectClass}
        >
          {minuteChoices.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

function TimeRangeRow({
  from,
  to,
  onFrom,
  onTo,
  disabled,
  large = false,
  dense = false,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  disabled?: boolean;
  large?: boolean;
  dense?: boolean;
}) {
  const overnight = isOvernightScheduleWindow(from, to);
  return (
    <div className="space-y-1">
      <div
        className={`flex flex-wrap items-end ${
          dense ? 'items-center gap-1.5' : large ? 'gap-x-4 gap-y-3' : 'gap-x-3 gap-y-2'
        }`}
      >
        <TimeField
          value={from}
          onChange={onFrom}
          disabled={disabled}
          label="Apertura"
          fallback="09:00"
          large={large}
          dense={dense}
          hideLabel={dense}
        />
        <span
          className={`select-none font-semibold leading-none text-stone-300 dark:text-stone-600 ${
            dense ? 'text-sm' : large ? 'mb-3 text-xl' : 'mb-2.5 text-base'
          }`}
          aria-hidden
        >
          –
        </span>
        <TimeField
          value={to}
          onChange={onTo}
          disabled={disabled}
          label="Cierre"
          fallback="19:00"
          large={large}
          dense={dense}
          hideLabel={dense}
        />
      </div>
      {overnight ? (
        <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
          Cruza medianoche → cierra al día siguiente
        </p>
      ) : null}
    </div>
  );
}

function StoreHoursBanner({ storeLabel }: { storeLabel?: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 dark:border-blue-900/50 dark:bg-blue-950/30">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--v-blue,#2563eb)]" />
      <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-200">
        <span className="font-semibold text-stone-900 dark:text-stone-100">
          Horario de {storeLabel || 'la tienda'}
        </span>
        {' — '}
        es la base de los turnos de trabajadores, plantillas de horario y fichaje.
        Puedes poner franjas que cruzan medianoche (p. ej. 20:00–06:00): cuentan en el día de apertura.
      </p>
    </div>
  );
}

function ScheduleBlock({
  title,
  subtitle,
  open,
  mixed,
  mixedHint,
  from,
  to,
  onToggleOpen,
  onFrom,
  onTo,
  switchId,
  dense = false,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  mixed: boolean;
  mixedHint: string;
  from: string;
  to: string;
  onToggleOpen: () => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  switchId: string;
  dense?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border ${
        dense ? 'p-3' : 'p-4'
      } ${
        open
          ? 'border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800/80'
          : 'border-dashed border-gray-200 bg-gray-50/90 dark:border-gray-700 dark:bg-gray-900/30'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={`font-semibold leading-snug text-gray-900 dark:text-gray-100 ${dense ? 'text-sm' : 'text-base'}`}>
            {title}
          </p>
          {!dense ? (
            <p className="text-sm leading-snug text-gray-500 dark:text-gray-400">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`font-medium text-gray-600 dark:text-gray-300 ${dense ? 'text-xs' : 'text-sm'}`}>
            {open ? 'Abierto' : 'Cerrado'}
          </span>
          <OpenClosedSwitch open={open} onToggle={onToggleOpen} id={switchId} />
        </div>
      </div>
      {open ? (
        <div className={`border-t border-gray-100 dark:border-gray-700 ${dense ? 'mt-2 pt-2' : 'mt-3 pt-3'}`}>
          <TimeRangeRow from={from} to={to} onFrom={onFrom} onTo={onTo} />
        </div>
      ) : dense ? null : (
        <p className="mt-2 text-xs text-gray-400">Sin apertura en este tramo.</p>
      )}
      {mixed && open ? (
        <p
          className={`rounded-lg bg-amber-50 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100 ${
            dense ? 'mt-2 px-2 py-1.5 text-xs leading-snug' : 'mt-2.5 px-3 py-2.5 text-sm leading-relaxed'
          }`}
        >
          {mixedHint}
        </p>
      ) : null}
    </div>
  );
}

function DayScheduleRow({
  day,
  open,
  from,
  to,
  onToggle,
  onFrom,
  onTo,
}: {
  day: ScheduleDayKey;
  open: boolean;
  from: string;
  to: string;
  onToggle: (open: boolean) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <div
      className={`border-b border-gray-100 py-3 last:border-0 dark:border-gray-700/80 ${open ? '' : 'opacity-55'}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
            open
              ? 'bg-blue-600 text-white'
              : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400'
          }`}
        >
          {WEEKDAY_SHORT[day]}
        </span>
        <span className="min-w-0 flex-1 text-base font-semibold text-gray-900 dark:text-gray-100">
          {WEEKDAY_LABELS[day]}
        </span>
        <OpenClosedSwitch open={open} onToggle={() => onToggle(!open)} id={`day-${day}`} />
      </div>
      {open ? (
        <div className="mt-3 pl-[3.25rem]">
          <TimeRangeRow from={from} to={to} onFrom={onFrom} onTo={onTo} />
        </div>
      ) : (
        <p className="mt-1.5 pl-[3.25rem] text-sm text-gray-400">Cerrado</p>
      )}
    </div>
  );
}

/** Fila densa: día + horas + switch en una sola línea. */
function WizardDayRow({
  day,
  open,
  from,
  to,
  onToggle,
  onFrom,
  onTo,
}: {
  day: ScheduleDayKey;
  open: boolean;
  from: string;
  to: string;
  onToggle: (open: boolean) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  const fromLabel = normalizeScheduleTimeValue(from, '09:00') || '09:00';
  const toLabel = normalizeScheduleTimeValue(to, '21:00') || '21:00';
  return (
    <div
      className={`flex min-h-10 items-center gap-2 border-b border-stone-100 px-2.5 py-1.5 last:border-b-0 dark:border-stone-800 ${
        open ? '' : 'bg-stone-50/70 dark:bg-stone-950/30'
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
          open
            ? 'bg-[#2563EB] text-white'
            : 'bg-stone-200 text-stone-500 dark:bg-stone-800 dark:text-stone-400'
        }`}
      >
        {WEEKDAY_SHORT[day]}
      </span>
      <span className="w-[5.5rem] shrink-0 truncate text-sm font-medium text-stone-900 dark:text-stone-100 sm:w-24">
        {WEEKDAY_LABELS[day]}
      </span>
      <div className="min-w-0 flex-1">
        {open ? (
          <TimeRangeRow dense from={fromLabel} to={toLabel} onFrom={onFrom} onTo={onTo} />
        ) : (
          <span className="text-xs text-stone-400">Cerrado</span>
        )}
      </div>
      <OpenClosedSwitch
        id={`wizard-day-${day}`}
        open={open}
        onToggle={() => onToggle(!open)}
      />
    </div>
  );
}

export function BusinessHoursEditor({ config, onChange, storeLabel, compact = false, wizard = false }: Props) {
  const [quickFrom, setQuickFrom] = useState(() => firstOpenDayHours(config.schedule).from);
  const [quickTo, setQuickTo] = useState(() => firstOpenDayHours(config.schedule).to);
  /** En modal/compacto el detalle por día va abierto: evita horas rotas del agrupado. */
  const [showDayDetail, setShowDayDetail] = useState(compact);
  const [showTimezone, setShowTimezone] = useState(!compact && !wizard);

  useEffect(() => {
    const { from, to } = firstOpenDayHours(config.schedule);
    setQuickFrom(from);
    setQuickTo(to);
  }, [config.schedule]);

  const publishSchedule = (schedule: WeekSchedule) => {
    onChange({ ...config, schedule: cloneWeekSchedule(schedule) });
  };

  const updateDay = (day: ScheduleDayKey, field: 'open' | 'from' | 'to', value: string | boolean) => {
    const cur = config.schedule[day];
    let nextDay = { ...cur, [field]: value };
    if (field === 'open' && value === true) {
      nextDay = ensureOpenDayTimes({ ...nextDay, open: true });
    }
    if (field === 'from' && typeof value === 'string') {
      nextDay = ensureOpenDayTimes({ ...nextDay, open: true, from: value }, { to: '19:00' });
    }
    if (field === 'to' && typeof value === 'string') {
      nextDay = ensureOpenDayTimes({ ...nextDay, open: true, to: value }, { from: '09:00' });
    }
    const next = { ...config.schedule, [day]: nextDay };
    if (field === 'open' && value === false && countOpenScheduleDays(next) === 0) {
      toast.error('Debe quedar al menos un día abierto.');
      return;
    }
    publishSchedule(next);
  };

  const toggleDayOpen = (day: ScheduleDayKey) => {
    updateDay(day, 'open', !config.schedule[day].open);
  };

  const applyPreset = (id: BusinessHoursPresetId) => {
    const schedule = getBusinessHoursPresetSchedule(id);
    const { from, to } = firstOpenDayHours(schedule);
    setQuickFrom(from);
    setQuickTo(to);
    publishSchedule(schedule);
  };

  const applyQuickToOpenDays = () => {
    const openCount = countOpenScheduleDays(config.schedule);
    if (openCount === 0) {
      toast.error('Primero activa al menos un día.');
      return;
    }
    if (!quickFrom.trim() || !quickTo.trim() || quickFrom === quickTo) {
      toast.error('La hora de cierre debe ser distinta de la de apertura.');
      return;
    }
    const ok = window.confirm(
      `¿Aplicar a todo el horario?\n\nSe pondrá ${quickFrom}–${quickTo} en los ${openCount} día${openCount === 1 ? '' : 's'} abierto${openCount === 1 ? '' : 's'}.`,
    );
    if (!ok) return;
    publishSchedule(applyHoursToOpenDays(config.schedule, quickFrom, quickTo));
    toast.success(`Horario aplicado a ${openCount} día${openCount === 1 ? '' : 's'} abierto${openCount === 1 ? '' : 's'}.`);
  };

  const weekdayGroup = groupHours(config.schedule, WEEKDAY_KEYS);
  const weekendGroup = groupHours(config.schedule, WEEKEND_KEYS);

  const setWeekdays = (patch: Partial<{ open: boolean; from: string; to: string }>) => {
    // Al tocar apertura o cierre del bloque, guardar SIEMPRE el par completo
    // (si no, un día se quedaba con una hora vacía y bloqueaba el avance).
    const timePatch =
      patch.from !== undefined || patch.to !== undefined
        ? {
            from: patch.from ?? weekdayGroup.from,
            to: patch.to ?? weekdayGroup.to,
            ...(patch.open !== undefined ? { open: patch.open } : { open: true as const }),
          }
        : patch;
    const next = patchScheduleDays(config.schedule, WEEKDAY_KEYS, timePatch);
    if (timePatch.open === false && countOpenScheduleDays(next) === 0) {
      toast.error('Debe quedar al menos un día abierto.');
      return;
    }
    publishSchedule(next);
  };

  const setWeekend = (patch: Partial<{ open: boolean; from: string; to: string }>) => {
    const timePatch =
      patch.from !== undefined || patch.to !== undefined
        ? {
            from: patch.from ?? weekendGroup.from,
            to: patch.to ?? weekendGroup.to,
            ...(patch.open !== undefined ? { open: patch.open } : { open: true as const }),
          }
        : patch;
    const next = patchScheduleDays(config.schedule, WEEKEND_KEYS, timePatch);
    if (timePatch.open === false && countOpenScheduleDays(next) === 0) {
      toast.error('Debe quedar al menos un día abierto.');
      return;
    }
    publishSchedule(next);
  };

  const openDayCount = countOpenScheduleDays(config.schedule);
  const hoursIssue = getBusinessHoursIssue(config);
  const showMixedHint = weekdayGroup.mixed || weekendGroup.mixed;
  const isDense = wizard || compact;
  const lunchBreak = config.lunchBreak || DEFAULT_BUSINESS_HOURS_CONFIG.lunchBreak;

  // Auto-abrir detalle por día fuera del wizard cuando hay mixto (compact).
  useEffect(() => {
    if (compact && showMixedHint) setShowDayDetail(true);
  }, [compact, showMixedHint]);

  if (wizard) {
    const renderDayList = (days: readonly ScheduleDayKey[]) =>
      days.map((day) => {
        const d = config.schedule[day];
        return (
          <WizardDayRow
            key={day}
            day={day}
            open={d.open}
            from={d.from}
            to={d.to}
            onToggle={(open) => updateDay(day, 'open', open)}
            onFrom={(from) => updateDay(day, 'from', from)}
            onTo={(to) => updateDay(day, 'to', to)}
          />
        );
      });

    return (
      <div className="flex w-full min-w-0 flex-col gap-2.5">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Horario · {storeLabel || 'tienda'}
            </p>
            <p className="text-[11px] text-stone-500">L–D · abre / cierra · horas</p>
          </div>
          {hoursIssue ? (
            <p className="max-w-[55%] text-right text-[11px] font-medium text-rose-600 dark:text-rose-300">
              {hoursIssue}
            </p>
          ) : (
            <p className="text-[11px] text-stone-400">{openDayCount} abiertos</p>
          )}
        </div>

        {/* Barra rápida */}
        <div className={`${VERTIAL_SURFACE} flex flex-wrap items-center gap-2 px-2.5 py-2`}>
          <TimeRangeRow dense from={quickFrom} to={quickTo} onFrom={setQuickFrom} onTo={setQuickTo} />
          <button
            type="button"
            onClick={applyQuickToOpenDays}
            className={`${VERTIAL_BTN_PRIMARY} !min-h-8 !rounded-lg !px-2.5 !text-xs`}
          >
            Aplicar a abiertos
          </button>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.hint}
                onClick={() => applyPreset(p.id)}
                className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-[10px] font-medium text-stone-600 hover:border-blue-300 hover:text-blue-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Días: L–V + finde en un bloque */}
        <div className={`${VERTIAL_SURFACE} overflow-hidden`}>
          <p className="border-b border-stone-100 bg-stone-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:border-stone-800 dark:bg-stone-950/40">
            Lunes – viernes
          </p>
          {renderDayList(WEEKDAY_KEYS)}
          <p className="border-y border-stone-100 bg-stone-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:border-stone-800 dark:bg-stone-950/40">
            Fin de semana
          </p>
          {renderDayList(WEEKEND_KEYS)}
        </div>

        {/* Ajustes compactos */}
        <div className={`${VERTIAL_SURFACE} space-y-2 px-2.5 py-2`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
            Ajustes
          </p>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-stone-300 text-blue-600 focus:ring-blue-500"
              checked={Boolean(lunchBreak.enabled)}
              onChange={(e) =>
                onChange({
                  ...config,
                  lunchBreak: {
                    ...lunchBreak,
                    enabled: e.target.checked,
                    from: lunchBreak.from || '14:00',
                    to: lunchBreak.to || '17:00',
                  },
                })
              }
            />
            <span className="text-xs font-medium text-stone-800 dark:text-stone-200">
              Horario partido
              <span className="ml-1 font-normal text-stone-400">(cierra al mediodía)</span>
            </span>
          </label>
          {lunchBreak.enabled ? (
            <div className="flex flex-wrap items-center gap-2 pl-5">
              <span className="text-[11px] text-stone-500">Pausa</span>
              <TimeRangeRow
                dense
                from={lunchBreak.from || '14:00'}
                to={lunchBreak.to || '17:00'}
                onFrom={(from) =>
                  onChange({ ...config, lunchBreak: { ...lunchBreak, enabled: true, from } })
                }
                onTo={(to) =>
                  onChange({ ...config, lunchBreak: { ...lunchBreak, enabled: true, to } })
                }
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Globe className="h-3.5 w-3.5 shrink-0 text-stone-400" />
            <span className="text-[11px] text-stone-500">Zona</span>
            <select
              value={config.timezone}
              onChange={(e) => onChange({ ...config, timezone: e.target.value })}
              className="h-8 min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 text-xs outline-none focus:border-blue-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full min-w-0 ${isDense ? 'space-y-4' : 'mx-auto max-w-2xl space-y-5'}`}>
      <StoreHoursBanner storeLabel={storeLabel} />

      {hoursIssue ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
          role="alert"
        >
          {hoursIssue}
        </div>
      ) : null}

      {storeLabel ? (
        <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50/80 px-4 py-3 dark:border-stone-700 dark:bg-stone-900/40">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-stone-800">
            <Store className="h-4 w-4 text-stone-700 dark:text-stone-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-stone-500 dark:text-stone-400">Tienda</p>
            <p className="truncate text-sm font-bold text-stone-900 dark:text-stone-100">{storeLabel}</p>
          </div>
          <p className="shrink-0 text-right text-xs text-stone-500">
            <span className="block text-base font-bold text-stone-900 dark:text-stone-100">{openDayCount}</span>
            días abiertos
          </p>
        </div>
      ) : null}

      <section className="space-y-2">
        <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">1 · Plantilla rápida</p>
        <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'}`}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:border-stone-600 dark:bg-stone-800 dark:hover:border-blue-700"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-stone-400" />
              <span className="min-w-0">
                <span className="block text-base font-semibold leading-snug text-stone-900 dark:text-stone-100">{p.label}</span>
                <span className="block text-sm leading-snug text-stone-500 dark:text-stone-400">{p.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800">
        <div>
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">
            {compact ? '2 · Horario por día (L–D)' : '2 · Horario habitual'}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            {compact
              ? 'Activa cada día y elige apertura / cierre. Los minutos van de 5 en 5.'
              : 'Entre semana y fin de semana. Pulsa una letra (L–D) para abrir o cerrar ese día.'}
          </p>
        </div>

        {!compact ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {ALL_DAYS.map((day) => {
                const open = config.schedule[day].open;
                return (
                  <button
                    key={day}
                    type="button"
                    title={`${WEEKDAY_LABELS[day]} — ${open ? 'Abierto (clic para cerrar)' : 'Cerrado (clic para abrir)'}`}
                    onClick={() => toggleDayOpen(day)}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                      open
                        ? 'bg-[var(--v-blue,#2563eb)] text-white hover:bg-[#1d4ed8]'
                        : 'bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-400 dark:hover:bg-stone-600'
                    }`}
                  >
                    {WEEKDAY_SHORT[day]}
                  </button>
                );
              })}
            </div>

            {showMixedHint ? (
              <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-100">
                Algún día tiene horario distinto: usa{' '}
                <button
                  type="button"
                  className="font-semibold underline underline-offset-2"
                  onClick={() => setShowDayDetail(true)}
                >
                  «Ajustar por día»
                </button>{' '}
                o unifica con el bloque de abajo.
              </p>
            ) : null}

            <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
              <ScheduleBlock
                title="Lunes a viernes"
                subtitle="Entre semana"
                open={weekdayGroup.open}
                mixed={weekdayGroup.mixed}
                mixedHint="Hay días entre semana con horario distinto. Revísalo abajo en «Por día»."
                from={weekdayGroup.from}
                to={weekdayGroup.to}
                onToggleOpen={() => setWeekdays({ open: !weekdayGroup.open })}
                onFrom={(from) => setWeekdays({ from })}
                onTo={(to) => setWeekdays({ to })}
                switchId="weekdays-open"
              />
              <ScheduleBlock
                title="Sábado y domingo"
                subtitle="Fin de semana"
                open={weekendGroup.open}
                mixed={weekendGroup.mixed}
                mixedHint="Sábado y domingo no coinciden. Revísalo abajo en «Por día»."
                from={weekendGroup.from}
                to={weekendGroup.to}
                onToggleOpen={() => setWeekend({ open: !weekendGroup.open })}
                onFrom={(from) => setWeekend({ from })}
                onTo={(to) => setWeekend({ to })}
                switchId="weekend-open"
              />
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-stone-100 bg-stone-50/60 px-3 py-1 dark:border-stone-700 dark:bg-stone-900/40">
            {ALL_DAYS.map((day) => {
              const d = config.schedule[day];
              return (
                <DayScheduleRow
                  key={day}
                  day={day}
                  open={d.open}
                  from={d.from}
                  to={d.to}
                  onToggle={(open) => updateDay(day, 'open', open)}
                  onFrom={(from) => updateDay(day, 'from', from)}
                  onTo={(to) => updateDay(day, 'to', to)}
                />
              );
            })}
          </div>
        )}

        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-600 dark:bg-stone-900/50">
          <p className="text-base font-semibold text-stone-900 dark:text-stone-100">Unificar horario</p>
          <p className="mt-0.5 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
            Aplica la misma franja a todos los días que ya están abiertos.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <TimeRangeRow from={quickFrom} to={quickTo} onFrom={setQuickFrom} onTo={setQuickTo} />
            <button
              type="button"
              onClick={applyQuickToOpenDays}
              className={`${VERTIAL_BTN_PRIMARY} w-full sm:w-auto !min-h-10`}
            >
              <Copy className="h-4 w-4" />
              Copiar a días abiertos
            </button>
          </div>
        </div>
      </section>

      {compact && !showTimezone ? (
        <button
          type="button"
          onClick={() => setShowTimezone(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <span>
            Zona horaria: <span className="font-semibold text-gray-800 dark:text-gray-200">{config.timezone}</span>
          </span>
        </button>
      ) : (
        <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-2 flex items-center gap-2">
            <Globe className="h-4 w-4 text-gray-500" />
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Zona horaria</p>
          </div>
          <select
            value={config.timezone}
            onChange={(e) => onChange({ ...config, timezone: e.target.value })}
            className="h-10 w-full max-w-sm rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </section>
      )}

      {!compact ? (
        <section className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800">
          <button
            type="button"
            onClick={() => setShowDayDetail((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-stone-50 dark:hover:bg-stone-900/40"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-stone-500" />
              <div className="min-w-0">
                <p className="text-base font-semibold text-stone-900 dark:text-stone-100">3 · Ajustar por día</p>
                <p className="text-sm text-stone-500 dark:text-stone-400">Opcional, si un día va distinto</p>
              </div>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-stone-500 transition-transform ${showDayDetail ? 'rotate-180' : ''}`}
            />
          </button>
          {showDayDetail ? (
            <div className="border-t border-stone-100 px-4 pb-2 pt-1 dark:border-stone-700">
              {ALL_DAYS.map((day) => {
                const d = config.schedule[day];
                return (
                  <DayScheduleRow
                    key={day}
                    day={day}
                    open={d.open}
                    from={d.from}
                    to={d.to}
                    onToggle={(open) => updateDay(day, 'open', open)}
                    onFrom={(from) => updateDay(day, 'from', from)}
                    onTo={(to) => updateDay(day, 'to', to)}
                  />
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export { DEFAULT_BUSINESS_HOURS_CONFIG };
