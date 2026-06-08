import { useEffect, useState } from 'react';
import { ChevronDown, Clock, Copy, Globe, Sparkles, Store } from 'lucide-react';
import { toast } from 'sonner';
import type { BusinessHoursConfig, WeekSchedule } from '../../../lib/settingsApi';
import {
  applyHoursToOpenDays,
  cloneWeekSchedule,
  countOpenScheduleDays,
  DEFAULT_BUSINESS_HOURS_CONFIG,
  getBusinessHoursIssue,
  getBusinessHoursPresetSchedule,
  patchScheduleDays,
  SCHEDULE_DAY_LABELS_ES,
  type BusinessHoursPresetId,
  type ScheduleDayKey,
  WEEKDAY_KEYS,
  WEEKEND_KEYS,
} from '../../../lib/businessHoursUtils';

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
};

function firstOpenDayHours(schedule: WeekSchedule): { from: string; to: string } {
  for (const day of ALL_DAYS) {
    if (schedule[day].open) return { from: schedule[day].from, to: schedule[day].to };
  }
  return { from: '09:00', to: '19:00' };
}

function groupHours(schedule: WeekSchedule, days: readonly ScheduleDayKey[]) {
  const first = schedule[days[0]];
  const allSameOpen = days.every((d) => schedule[d].open === first.open);
  const allSameTimes =
    days.every((d) => schedule[d].from === first.from && schedule[d].to === first.to);
  return {
    open: days.some((d) => schedule[d].open),
    from: allSameTimes ? first.from : first.from,
    to: allSameTimes ? first.to : first.to,
    mixed: !allSameOpen || !allSameTimes,
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
        open ? 'bg-gray-900 dark:bg-gray-100' : 'bg-gray-200 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform dark:bg-gray-900 ${
          open ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function TimeField({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <label className="udar-time-field-wrap">
      <span className="sr-only">{label}</span>
      <input
        type="time"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="udar-time-input"
      />
    </label>
  );
}

function TimeRangeRow({
  from,
  to,
  onFrom,
  onTo,
  disabled,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <TimeField value={from} onChange={onFrom} disabled={disabled} label="Hora de apertura" />
      <span className="select-none text-base font-semibold leading-none text-gray-300 dark:text-gray-500" aria-hidden>
        —
      </span>
      <TimeField value={to} onChange={onTo} disabled={disabled} label="Hora de cierre" />
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
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        open
          ? 'border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800/80'
          : 'border-dashed border-gray-200 bg-gray-50/90 dark:border-gray-700 dark:bg-gray-900/30'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold leading-snug text-gray-900 dark:text-gray-100">{title}</p>
          <p className="text-sm leading-snug text-gray-500 dark:text-gray-400">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{open ? 'Abierto' : 'Cerrado'}</span>
          <OpenClosedSwitch open={open} onToggle={onToggleOpen} id={switchId} />
        </div>
      </div>
      {open ? (
        <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-700">
          <TimeRangeRow from={from} to={to} onFrom={onFrom} onTo={onTo} />
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-400">Sin apertura en este tramo.</p>
      )}
      {mixed && open ? (
        <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">
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
              ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
              : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
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

export function BusinessHoursEditor({ config, onChange, storeLabel, compact = false }: Props) {
  const [quickFrom, setQuickFrom] = useState(() => firstOpenDayHours(config.schedule).from);
  const [quickTo, setQuickTo] = useState(() => firstOpenDayHours(config.schedule).to);
  const [showDayDetail, setShowDayDetail] = useState(false);
  const [showTimezone, setShowTimezone] = useState(!compact);

  useEffect(() => {
    const { from, to } = firstOpenDayHours(config.schedule);
    setQuickFrom(from);
    setQuickTo(to);
  }, [config.schedule]);

  const publishSchedule = (schedule: WeekSchedule) => {
    onChange({ ...config, schedule: cloneWeekSchedule(schedule) });
  };

  const updateDay = (day: ScheduleDayKey, field: 'open' | 'from' | 'to', value: string | boolean) => {
    const nextDay = { ...config.schedule[day], [field]: value };
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
    publishSchedule(applyHoursToOpenDays(config.schedule, quickFrom, quickTo));
    toast.success(`Horario aplicado a ${openCount} día${openCount === 1 ? '' : 's'} abierto${openCount === 1 ? '' : 's'}.`);
  };

  const weekdayGroup = groupHours(config.schedule, WEEKDAY_KEYS);
  const weekendGroup = groupHours(config.schedule, WEEKEND_KEYS);

  const setWeekdays = (patch: Partial<{ open: boolean; from: string; to: string }>) => {
    const next = patchScheduleDays(config.schedule, WEEKDAY_KEYS, patch);
    if (patch.open === false && countOpenScheduleDays(next) === 0) {
      toast.error('Debe quedar al menos un día abierto.');
      return;
    }
    publishSchedule(next);
  };

  const setWeekend = (patch: Partial<{ open: boolean; from: string; to: string }>) => {
    const next = patchScheduleDays(config.schedule, WEEKEND_KEYS, patch);
    if (patch.open === false && countOpenScheduleDays(next) === 0) {
      toast.error('Debe quedar al menos un día abierto.');
      return;
    }
    publishSchedule(next);
  };

  const openDayCount = countOpenScheduleDays(config.schedule);
  const hoursIssue = getBusinessHoursIssue(config);
  const showMixedHint = weekdayGroup.mixed || weekendGroup.mixed;

  return (
    <div className={`w-full min-w-0 ${compact ? 'space-y-4' : 'mx-auto max-w-2xl space-y-5'}`}>
      {hoursIssue ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
          role="alert"
        >
          {hoursIssue}
        </div>
      ) : null}

      {storeLabel ? (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-gray-800">
            <Store className="h-4 w-4 text-gray-700 dark:text-gray-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500 dark:text-gray-400">Tienda</p>
            <p className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">{storeLabel}</p>
          </div>
          <p className="shrink-0 text-right text-xs text-gray-500">
            <span className="block text-base font-bold text-gray-900 dark:text-gray-100">{openDayCount}</span>
            días abiertos
          </p>
        </div>
      ) : null}

      <section className="space-y-2">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">1 · Plantilla rápida</p>
        <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'}`}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="min-w-0">
                <span className="block text-base font-semibold leading-snug text-gray-900 dark:text-gray-100">{p.label}</span>
                <span className="block text-sm leading-snug text-gray-500 dark:text-gray-400">{p.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">2 · Horario habitual</p>
          <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            Entre semana y fin de semana. Pulsa una letra (L–D) para abrir o cerrar ese día.
          </p>
        </div>

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
                    ? 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
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

        <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
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

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-900/50">
          <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Unificar horario</p>
          <p className="mt-0.5 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            Aplica la misma franja a todos los días que ya están abiertos.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <TimeRangeRow from={quickFrom} to={quickTo} onFrom={setQuickFrom} onTo={setQuickTo} />
            <button
              type="button"
              onClick={applyQuickToOpenDays}
              className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 sm:w-auto dark:bg-gray-100 dark:text-gray-900"
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

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <button
          type="button"
          onClick={() => setShowDayDetail((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-900/40"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-gray-500" />
            <div className="min-w-0">
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">3 · Ajustar por día</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Opcional, si un día va distinto</p>
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${showDayDetail ? 'rotate-180' : ''}`}
          />
        </button>
        {showDayDetail ? (
          <div className="border-t border-gray-100 px-4 pb-2 pt-1 dark:border-gray-700">
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
    </div>
  );
}

export { DEFAULT_BUSINESS_HOURS_CONFIG };
