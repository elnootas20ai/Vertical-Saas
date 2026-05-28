import { useEffect, useState } from 'react';
import { ChevronDown, Clock, Globe, Store } from 'lucide-react';
import type { BusinessHoursConfig, WeekSchedule } from '../../../lib/settingsApi';
import {
  applyHoursToOpenDays,
  countOpenScheduleDays,
  DEFAULT_BUSINESS_HOURS_CONFIG,
  getBusinessHoursPresetSchedule,
  hasValidBusinessHoursConfig,
  patchScheduleDays,
  type BusinessHoursPresetId,
  type ScheduleDayKey,
  WEEKDAY_KEYS,
  WEEKEND_KEYS,
} from '../../../lib/businessHoursUtils';

const WEEKDAY_LABELS: Record<ScheduleDayKey, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

const ALL_DAYS = [...WEEKDAY_KEYS, ...WEEKEND_KEYS] as ScheduleDayKey[];

const PRESETS: { id: BusinessHoursPresetId; label: string }[] = [
  { id: 'retail', label: 'Comercio habitual' },
  { id: 'extended', label: 'Jornada amplia' },
  { id: 'mornings', label: 'Solo mañanas' },
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
  /** Nombre de la tienda mostrado arriba del formulario */
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

function canApplySchedule(config: BusinessHoursConfig, schedule: WeekSchedule): boolean {
  return hasValidBusinessHoursConfig({ ...config, schedule });
}

function DayToggle({
  checked,
  onChange,
  label,
  compact,
  shortLabel,
}: {
  checked: boolean;
  onChange: (open: boolean) => void;
  label: string;
  compact?: boolean;
  shortLabel?: boolean;
}) {
  const widthClass = shortLabel ? (compact ? 'w-[4.5rem]' : 'w-20') : compact ? 'w-[5.5rem]' : 'w-28';
  return (
    <label className={`flex items-center gap-2 cursor-pointer shrink-0 ${widthClass}`}>
      <div
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative ${checked ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-600'}`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
      </div>
      <span
        className={`font-semibold ${compact ? 'text-xs' : 'text-sm'} ${checked ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`}
      >
        {label}
      </span>
    </label>
  );
}

function TimeRangeInputs({
  from,
  to,
  onFrom,
  onTo,
  disabled,
  compact,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const inputClass = `px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-sm w-full max-w-[7rem] disabled:opacity-50 ${compact ? '' : 'px-3 py-1.5'}`;
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <input
        type="time"
        value={from}
        disabled={disabled}
        onChange={(e) => onFrom(e.target.value)}
        className={inputClass}
      />
      <span className="text-gray-400 text-sm">—</span>
      <input
        type="time"
        value={to}
        disabled={disabled}
        onChange={(e) => onTo(e.target.value)}
        className={inputClass}
      />
    </div>
  );
}

export function BusinessHoursEditor({ config, onChange, storeLabel, compact = false }: Props) {
  const [quickFrom, setQuickFrom] = useState(() => firstOpenDayHours(config.schedule).from);
  const [quickTo, setQuickTo] = useState(() => firstOpenDayHours(config.schedule).to);
  const [showDayDetail, setShowDayDetail] = useState(!compact);
  const [showTimezone, setShowTimezone] = useState(!compact);

  useEffect(() => {
    const { from, to } = firstOpenDayHours(config.schedule);
    setQuickFrom(from);
    setQuickTo(to);
  }, [config.schedule]);

  const updateSchedule = (schedule: WeekSchedule) => {
    if (!canApplySchedule(config, schedule)) return;
    onChange({ ...config, schedule });
  };

  const updateDay = (day: ScheduleDayKey, field: 'open' | 'from' | 'to', value: string | boolean) => {
    const nextDay = { ...config.schedule[day], [field]: value };
    const next = { ...config.schedule, [day]: nextDay };
    if (field === 'open' && value === false && countOpenScheduleDays(next) === 0) return;
    updateSchedule(next);
  };

  const applyPreset = (id: BusinessHoursPresetId) => {
    const schedule = getBusinessHoursPresetSchedule(id);
    const { from, to } = firstOpenDayHours(schedule);
    setQuickFrom(from);
    setQuickTo(to);
    onChange({ ...config, schedule });
  };

  const applyQuickToOpenDays = () => {
    updateSchedule(applyHoursToOpenDays(config.schedule, quickFrom, quickTo));
  };

  const weekdayGroup = groupHours(config.schedule, WEEKDAY_KEYS);
  const weekendGroup = groupHours(config.schedule, WEEKEND_KEYS);

  const setWeekdays = (patch: Partial<{ open: boolean; from: string; to: string }>) => {
    const next = patchScheduleDays(config.schedule, WEEKDAY_KEYS, patch);
    if (patch.open === false && countOpenScheduleDays(next) === 0) return;
    updateSchedule(next);
  };

  const setWeekend = (patch: Partial<{ open: boolean; from: string; to: string }>) => {
    const next = patchScheduleDays(config.schedule, WEEKEND_KEYS, patch);
    if (patch.open === false && countOpenScheduleDays(next) === 0) return;
    updateSchedule(next);
  };

  const cardClass = `bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 ${compact ? 'p-3' : 'p-6'}`;
  const titleClass = `font-bold text-gray-900 dark:text-gray-100 ${compact ? 'text-sm' : ''}`;

  return (
    <div className={compact ? 'space-y-3' : 'space-y-6 max-w-3xl'}>
      {storeLabel ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2">
          <Store className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/80 dark:text-amber-200/80">
              Horario de apertura
            </p>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{storeLabel}</p>
          </div>
        </div>
      ) : null}

      <div className={cardClass}>
        <p className={`text-xs text-gray-500 dark:text-gray-400 mb-2 ${compact ? '' : 'mb-3'}`}>
          Elige una plantilla o ajusta los bloques. Puedes personalizar día a día al final.
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 text-gray-800 dark:text-gray-200 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cardClass}>
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h3 className={titleClass}>Horario rápido</h3>
        </div>
        <div className={`flex flex-wrap items-end gap-2 ${compact ? '' : 'gap-3'}`}>
          <TimeRangeInputs
            from={quickFrom}
            to={quickTo}
            onFrom={setQuickFrom}
            onTo={setQuickTo}
            compact={compact}
          />
          <button
            type="button"
            onClick={applyQuickToOpenDays}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-90 transition-opacity"
          >
            Aplicar a días abiertos
          </button>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
          Solo actualiza los días que ya tienes marcados como abiertos.
        </p>
      </div>

      <div className={cardClass}>
        <h3 className={`${titleClass} mb-3`}>Por grupos</h3>
        <div className="space-y-2">
          <div
            className={`flex items-center gap-3 p-2.5 rounded-lg border ${
              weekdayGroup.open
                ? 'border-gray-200 dark:border-gray-700'
                : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50'
            }`}
          >
            <DayToggle
              checked={weekdayGroup.open}
              onChange={(open) => setWeekdays({ open })}
              label="L–V"
              compact={compact}
              shortLabel
            />
            {weekdayGroup.open ? (
              <TimeRangeInputs
                from={weekdayGroup.from}
                to={weekdayGroup.to}
                onFrom={(from) => setWeekdays({ from })}
                onTo={(to) => setWeekdays({ to })}
                compact={compact}
              />
            ) : (
              <span className="text-xs text-gray-400 italic">Cerrado</span>
            )}
            {weekdayGroup.mixed && weekdayGroup.open ? (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0">Mixto</span>
            ) : null}
          </div>

          <div
            className={`flex items-center gap-3 p-2.5 rounded-lg border ${
              weekendGroup.open
                ? 'border-gray-200 dark:border-gray-700'
                : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50'
            }`}
          >
            <DayToggle
              checked={weekendGroup.open}
              onChange={(open) => setWeekend({ open })}
              label="S–D"
              compact={compact}
              shortLabel
            />
            {weekendGroup.open ? (
              <TimeRangeInputs
                from={weekendGroup.from}
                to={weekendGroup.to}
                onFrom={(from) => setWeekend({ from })}
                onTo={(to) => setWeekend({ to })}
                compact={compact}
              />
            ) : (
              <span className="text-xs text-gray-400 italic">Cerrado</span>
            )}
            {weekendGroup.mixed && weekendGroup.open ? (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0">Mixto</span>
            ) : null}
          </div>
        </div>
      </div>

      {compact && !showTimezone ? (
        <button
          type="button"
          onClick={() => setShowTimezone(true)}
          className="text-xs font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1"
        >
          <Globe className="w-3.5 h-3.5" />
          Zona horaria ({config.timezone})
        </button>
      ) : (
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <h3 className={titleClass}>Zona horaria</h3>
          </div>
          <select
            value={config.timezone}
            onChange={(e) => onChange({ ...config, timezone: e.target.value })}
            className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 focus:border-blue-500 outline-none text-sm bg-white dark:bg-gray-800"
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={cardClass}>
        <button
          type="button"
          onClick={() => setShowDayDetail((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <h3 className={titleClass}>Ajustar día a día</h3>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-gray-500 transition-transform ${showDayDetail ? 'rotate-180' : ''}`}
          />
        </button>
        {showDayDetail ? (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 mb-3">
              Para horarios distintos entre días (p. ej. viernes hasta tarde).
            </p>
            <div className="space-y-2">
              {ALL_DAYS.map((day) => {
                const d = config.schedule[day];
                return (
                  <div
                    key={day}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                      d.open
                        ? 'border-gray-200 dark:border-gray-700'
                        : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50'
                    }`}
                  >
                    <DayToggle
                      checked={d.open}
                      onChange={(open) => updateDay(day, 'open', open)}
                      label={WEEKDAY_LABELS[day]}
                      compact={compact}
                    />
                    {d.open ? (
                      <TimeRangeInputs
                        from={d.from}
                        to={d.to}
                        onFrom={(from) => updateDay(day, 'from', from)}
                        onTo={(to) => updateDay(day, 'to', to)}
                        compact={compact}
                      />
                    ) : (
                      <span className="text-xs text-gray-400 italic">Cerrado</span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export { DEFAULT_BUSINESS_HOURS_CONFIG };
