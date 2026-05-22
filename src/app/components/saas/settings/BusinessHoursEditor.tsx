import { Clock, Globe, Store } from 'lucide-react';
import type { BusinessHoursConfig, WeekSchedule } from '../../../lib/settingsApi';
import { DEFAULT_BUSINESS_HOURS_CONFIG } from '../../../lib/businessHoursUtils';

const WEEKDAY_LABELS: Record<keyof WeekSchedule, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

const WEEKDAYS = Object.keys(WEEKDAY_LABELS) as (keyof WeekSchedule)[];

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

export function BusinessHoursEditor({ config, onChange, storeLabel, compact = false }: Props) {
  const updateDay = (day: keyof WeekSchedule, field: 'open' | 'from' | 'to', value: string | boolean) => {
    onChange({
      ...config,
      schedule: {
        ...config.schedule,
        [day]: { ...config.schedule[day], [field]: value },
      },
    });
  };

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

      <div
        className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 ${compact ? 'p-3' : 'p-6'}`}
      >
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h3 className={`font-bold text-gray-900 dark:text-gray-100 ${compact ? 'text-sm' : ''}`}>
            Zona horaria
          </h3>
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

      <div
        className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 ${compact ? 'p-3' : 'p-6'}`}
      >
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h3 className={`font-bold text-gray-900 dark:text-gray-100 ${compact ? 'text-sm' : ''}`}>
            Horario semanal
          </h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Marca al menos un día abierto con hora de inicio y fin.
        </p>
        <div className="space-y-2">
          {WEEKDAYS.map((day) => {
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
                <div className="w-24 shrink-0">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div
                      role="switch"
                      aria-checked={d.open}
                      tabIndex={0}
                      onClick={() => updateDay(day, 'open', !d.open)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          updateDay(day, 'open', !d.open);
                        }
                      }}
                      className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative ${d.open ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-600'}`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${d.open ? 'translate-x-4' : 'translate-x-0.5'}`}
                      />
                    </div>
                    <span
                      className={`text-xs font-semibold ${d.open ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`}
                    >
                      {WEEKDAY_LABELS[day]}
                    </span>
                  </label>
                </div>
                {d.open ? (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      type="time"
                      value={d.from}
                      onChange={(e) => updateDay(day, 'from', e.target.value)}
                      className="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-sm w-full max-w-[7rem]"
                    />
                    <span className="text-gray-400 text-sm">—</span>
                    <input
                      type="time"
                      value={d.to}
                      onChange={(e) => updateDay(day, 'to', e.target.value)}
                      className="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-sm w-full max-w-[7rem]"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 italic">Cerrado</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_BUSINESS_HOURS_CONFIG };
