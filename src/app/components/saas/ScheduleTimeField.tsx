import { normalizeScheduleTimeValue } from '../../lib/businessHoursUtils';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

function splitHhMm(value: string): { hour: string; minute: string } {
  const n = normalizeScheduleTimeValue(value);
  if (!n) return { hour: '', minute: '' };
  const [hour, minute] = n.split(':');
  return { hour, minute };
}

/** Selector HH:mm en 24 h (evita el type=time de Windows que confunde 5 con 05:00 AM). */
export function ScheduleTimeField({
  label,
  value,
  onChange,
  disabled,
  compact,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** Filas densas de horarios RRHH */
  compact?: boolean;
}) {
  const { hour, minute } = splitHhMm(value);
  const minuteChoices =
    minute && !MINUTE_OPTIONS.includes(minute)
      ? [...MINUTE_OPTIONS, minute].sort()
      : MINUTE_OPTIONS;

  const emit = (nextHour: string, nextMinute: string) => {
    if (!nextHour || !nextMinute) {
      onChange('');
      return;
    }
    onChange(`${nextHour}:${nextMinute}`);
  };

  const selectClass = compact
    ? 'h-8 min-w-[2.75rem] appearance-none rounded-md border-0 bg-transparent px-1 text-center text-sm font-semibold tabular-nums text-stone-900 outline-none disabled:opacity-45 dark:text-stone-100'
    : 'h-10 min-w-[3.25rem] appearance-none rounded-lg border-0 bg-transparent px-1.5 text-center text-base font-semibold tabular-nums text-stone-900 outline-none disabled:opacity-45 dark:text-stone-100';

  return (
    <label className="inline-flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-stone-400">{label}</span>
      <span
        className={`inline-flex items-center gap-0.5 rounded-xl border bg-white dark:bg-stone-900 ${
          compact ? 'border-stone-200 px-1.5 py-0.5 dark:border-stone-600' : 'border-2 border-stone-200 px-2 py-0.5 dark:border-stone-700'
        } ${
          disabled
            ? 'opacity-60'
            : 'focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-blue-500/20'
        }`}
      >
        <select
          aria-label={`${label} — hora`}
          disabled={disabled}
          value={hour}
          onChange={(e) => emit(e.target.value, minute || '00')}
          className={selectClass}
        >
          <option value="">--</option>
          {HOUR_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="pb-0.5 text-sm font-bold text-stone-400" aria-hidden>
          :
        </span>
        <select
          aria-label={`${label} — minutos`}
          disabled={disabled}
          value={minute}
          onChange={(e) => emit(hour || '09', e.target.value)}
          className={selectClass}
        >
          <option value="">--</option>
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
