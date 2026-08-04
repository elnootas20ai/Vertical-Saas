import { useEffect, useState } from 'react';
import { ChevronDown, Clock, Copy, Globe, Info, Sparkles, Store } from 'lucide-react';
import { toast } from 'sonner';
import type { BusinessHoursConfig, WeekSchedule } from '../../../lib/settingsApi';
import {
  applyHoursToOpenDays,
  cloneWeekSchedule,
  countOpenScheduleDays,
  DEFAULT_BUSINESS_HOURS_CONFIG,
  getBusinessHoursIssue,
  getBusinessHoursPresetSchedule,
  normalizeScheduleTimeValue,
  patchScheduleDays,
  SCHEDULE_DAY_LABELS_ES,
  type BusinessHoursPresetId,
  type ScheduleDayKey,
  WEEKDAY_KEYS,
  WEEKEND_KEYS,
} from '../../../lib/businessHoursUtils';
import { VERTIAL_BTN_PRIMARY } from '../../../lib/vertialUiTokens';

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
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  label: string;
  /** Si el valor viene vacío/roto, mostramos y emitimos este HH:mm (nunca "--"). */
  fallback?: string;
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

  const selectClass =
    'h-10 min-w-[3.25rem] appearance-none rounded-lg border-0 bg-transparent px-1.5 text-center text-base font-semibold tabular-nums text-stone-900 outline-none disabled:opacity-45 dark:text-stone-100';

  return (
    <label className="inline-flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</span>
      <span
        className={`inline-flex items-center gap-0.5 rounded-xl border-2 bg-white px-2 py-0.5 dark:bg-stone-900 ${
          disabled
            ? 'border-stone-100 opacity-60 dark:border-stone-800'
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
        <span className="pb-0.5 text-base font-bold text-stone-400" aria-hidden>
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
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <TimeField value={from} onChange={onFrom} disabled={disabled} label="Apertura" fallback="09:00" />
      <span className="mb-2.5 select-none text-base font-semibold leading-none text-stone-300 dark:text-stone-600" aria-hidden>
        →
      </span>
      <TimeField value={to} onChange={onTo} disabled={disabled} label="Cierre" fallback="19:00" />
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
        Configúralo bien: el resto parte de aquí.
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
  const isDense = wizard || compact;

  if (wizard) {
    return (
      <div className="w-full min-w-0 space-y-3">
        <StoreHoursBanner storeLabel={storeLabel} />
        {hoursIssue ? (
          <div
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
            role="alert"
          >
            {hoursIssue}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2 dark:border-stone-700 dark:bg-stone-900/40">
          {storeLabel ? (
            <>
              <Store className="h-4 w-4 shrink-0 text-stone-500" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                {storeLabel}
              </span>
            </>
          ) : null}
          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-200">
            {openDayCount} días abiertos
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-left transition-colors hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500"
            >
              <span className="block text-xs font-semibold leading-tight text-gray-900 dark:text-gray-100">{p.label}</span>
              <span className="mt-0.5 block text-[10px] leading-tight text-gray-500 dark:text-gray-400">{p.hint}</span>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Días abiertos (L–D)</p>
            <div className="flex gap-1">
              {ALL_DAYS.map((day) => {
                const open = config.schedule[day].open;
                return (
                  <button
                    key={day}
                    type="button"
                    title={`${WEEKDAY_LABELS[day]} — ${open ? 'Abierto' : 'Cerrado'}`}
                    onClick={() => toggleDayOpen(day)}
                    className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold transition-colors ${
                      open
                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                    }`}
                  >
                    {WEEKDAY_SHORT[day]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ScheduleBlock
              dense
              title="Lunes a viernes"
              subtitle="Entre semana"
              open={weekdayGroup.open}
              mixed={weekdayGroup.mixed}
              mixedHint="Hay días entre semana con horario distinto."
              from={weekdayGroup.from}
              to={weekdayGroup.to}
              onToggleOpen={() => setWeekdays({ open: !weekdayGroup.open })}
              onFrom={(from) => setWeekdays({ from })}
              onTo={(to) => setWeekdays({ to })}
              switchId="weekdays-open"
            />
            <ScheduleBlock
              dense
              title="Sábado y domingo"
              subtitle="Fin de semana"
              open={weekendGroup.open}
              mixed={weekendGroup.mixed}
              mixedHint="Sábado y domingo no coinciden."
              from={weekendGroup.from}
              to={weekendGroup.to}
              onToggleOpen={() => setWeekend({ open: !weekendGroup.open })}
              onFrom={(from) => setWeekend({ from })}
              onTo={(to) => setWeekend({ to })}
              switchId="weekend-open"
            />
          </div>

          <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Misma hora en todos los abiertos</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TimeRangeRow from={quickFrom} to={quickTo} onFrom={setQuickFrom} onTo={setQuickTo} />
              <button
                type="button"
                onClick={applyQuickToOpenDays}
                className={`${VERTIAL_BTN_PRIMARY} !min-h-9 !px-3 !py-1.5 !text-xs`}
              >
                <Copy className="h-3.5 w-3.5" />
                Aplicar
              </button>
            </div>
          </div>

          {showMixedHint ? (
            <p className="mt-2 text-[11px] leading-snug text-amber-900 dark:text-amber-100">
              Algún día va distinto —{' '}
              <button type="button" className="font-semibold underline" onClick={() => setShowDayDetail(true)}>
                ajustar por día
              </button>
              .
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowTimezone((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <Globe className="h-3.5 w-3.5 shrink-0" />
            Zona: <span className="font-semibold text-gray-800 dark:text-gray-200">{config.timezone}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowDayDetail((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {showDayDetail ? 'Ocultar por día' : 'Ajustar por día'}
          </button>
        </div>

        {showTimezone ? (
          <select
            value={config.timezone}
            onChange={(e) => onChange({ ...config, timezone: e.target.value })}
            className="h-9 w-full max-w-xs rounded-lg border border-gray-300 bg-white px-2 text-xs outline-none focus:border-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        ) : null}

        {showDayDetail ? (
          <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 bg-white px-3 py-1 dark:border-gray-700 dark:bg-gray-800">
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
