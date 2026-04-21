import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Coffee,
  Globe,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import type { BusinessHoursConfig, Holiday, WeekSchedule } from '../../../lib/settingsApi';
import { getBusinessHours, saveBusinessHours } from '../../../lib/settingsApi';

interface Props {
  userId: string;
}

const WEEKDAY_LABELS: Record<keyof WeekSchedule, string> = {
  monday:    'Lunes',
  tuesday:   'Martes',
  wednesday: 'Miércoles',
  thursday:  'Jueves',
  friday:    'Viernes',
  saturday:  'Sábado',
  sunday:    'Domingo',
};

const WEEKDAYS = Object.keys(WEEKDAY_LABELS) as (keyof WeekSchedule)[];

const TIMEZONE_OPTIONS = [
  'Europe/Madrid',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/Bogota',
  'America/Buenos_Aires',
  'America/Santiago',
  'Asia/Dubai',
  'Asia/Tokyo',
  'UTC',
];

const DEFAULT_CONFIG: BusinessHoursConfig = {
  timezone: 'Europe/Madrid',
  schedule: {
    monday:    { open: true,  from: '09:00', to: '19:00' },
    tuesday:   { open: true,  from: '09:00', to: '19:00' },
    wednesday: { open: true,  from: '09:00', to: '19:00' },
    thursday:  { open: true,  from: '09:00', to: '19:00' },
    friday:    { open: true,  from: '09:00', to: '19:00' },
    saturday:  { open: true,  from: '10:00', to: '14:00' },
    sunday:    { open: false, from: '10:00', to: '14:00' },
  },
  holidays: [],
  lunchBreak: { enabled: false, from: '14:00', to: '16:00' },
};

export function BusinessHoursTab({ userId }: Props) {
  const [config, setConfig] = useState<BusinessHoursConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [newHoliday, setNewHoliday] = useState<Holiday>({ date: '', name: '', recurring: false });

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getBusinessHours(userId)
      .then(setConfig)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const updateDay = (day: keyof WeekSchedule, field: 'open' | 'from' | 'to', value: string | boolean) => {
    setConfig((c) => ({
      ...c,
      schedule: {
        ...c.schedule,
        [day]: { ...c.schedule[day], [field]: value },
      },
    }));
  };

  const addHoliday = () => {
    if (!newHoliday.date || !newHoliday.name.trim()) return;
    setConfig((c) => ({ ...c, holidays: [...c.holidays, { ...newHoliday }] }));
    setNewHoliday({ date: '', name: '', recurring: false });
  };

  const removeHoliday = (idx: number) => {
    setConfig((c) => ({ ...c, holidays: c.holidays.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await saveBusinessHours(userId, config);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Timezone */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Zona horaria</h3>
        </div>
        <select
          value={config.timezone}
          onChange={(e) => setConfig((c) => ({ ...c, timezone: e.target.value }))}
          className="w-full max-w-xs px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm bg-white dark:bg-gray-800"
        >
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      {/* Weekly schedule */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Horario semanal</h3>
        </div>
        <div className="space-y-3">
          {WEEKDAYS.map((day) => {
            const d = config.schedule[day];
            const isWeekend = day === 'saturday' || day === 'sunday';
            return (
              <div key={day} className={`flex items-center gap-4 p-3 rounded-xl border transition-colors ${d.open ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800'}`}>
                <div className="w-28 shrink-0">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div
                      onClick={() => updateDay(day, 'open', !d.open)}
                      className={`w-10 h-5 rounded-full transition-colors cursor-pointer relative ${d.open ? 'bg-blue-500' : 'bg-gray-200'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white dark:bg-gray-800 shadow transition-transform ${d.open ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className={`text-sm font-semibold ${d.open ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
                      {WEEKDAY_LABELS[day]}
                    </span>
                  </label>
                </div>
                {d.open ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="time"
                      value={d.from}
                      onChange={(e) => updateDay(day, 'from', e.target.value)}
                      className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 outline-none text-sm"
                    />
                    <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>
                    <input
                      type="time"
                      value={d.to}
                      onChange={(e) => updateDay(day, 'to', e.target.value)}
                      className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 outline-none text-sm"
                    />
                    {isWeekend && d.open && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">Fin de semana</span>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-gray-400 dark:text-gray-500 italic">Cerrado</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lunch break */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Coffee className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Pausa para comer</h3>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setConfig((c) => ({ ...c, lunchBreak: { ...c.lunchBreak, enabled: !c.lunchBreak.enabled } }))}
              className={`w-10 h-5 rounded-full transition-colors cursor-pointer relative ${config.lunchBreak.enabled ? 'bg-blue-500' : 'bg-gray-200'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white dark:bg-gray-800 shadow transition-transform ${config.lunchBreak.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Activar pausa</span>
          </label>
          {config.lunchBreak.enabled && (
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={config.lunchBreak.from}
                onChange={(e) => setConfig((c) => ({ ...c, lunchBreak: { ...c.lunchBreak, from: e.target.value } }))}
                className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 outline-none text-sm"
              />
              <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>
              <input
                type="time"
                value={config.lunchBreak.to}
                onChange={(e) => setConfig((c) => ({ ...c, lunchBreak: { ...c.lunchBreak, to: e.target.value } }))}
                className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 outline-none text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* Holidays */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Festivos y días especiales</h3>
        </div>

        <div className="flex items-end gap-3 mb-4 flex-wrap">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Fecha</label>
            <input
              type="date"
              value={newHoliday.date}
              onChange={(e) => setNewHoliday((h) => ({ ...h, date: e.target.value }))}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 outline-none text-sm"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Nombre</label>
            <input
              type="text"
              value={newHoliday.name}
              onChange={(e) => setNewHoliday((h) => ({ ...h, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 outline-none text-sm"
              placeholder="Día de Navidad"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Anual</label>
            <div
              onClick={() => setNewHoliday((h) => ({ ...h, recurring: !h.recurring }))}
              className={`w-10 h-5 rounded-full transition-colors cursor-pointer relative ${newHoliday.recurring ? 'bg-blue-500' : 'bg-gray-200'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white dark:bg-gray-800 shadow transition-transform ${newHoliday.recurring ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </div>
          <button
            onClick={addHoliday}
            disabled={!newHoliday.date || !newHoliday.name.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-sm font-semibold text-blue-700 transition-colors disabled:opacity-40"
          >
            <Plus className="w-4 h-4" />
            Añadir
          </button>
        </div>

        {config.holidays.length > 0 ? (
          <div className="space-y-2">
            {config.holidays
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((h, idx) => (
                <div key={idx} className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition-colors">
                  <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{h.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(h.date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {h.recurring && <span className="ml-2 text-blue-600">· Anual</span>}
                    </p>
                  </div>
                  <button onClick={() => removeHoliday(idx)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-gray-400 dark:text-gray-500 hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No hay festivos configurados</p>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
          <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
          <p className="text-sm text-green-700">Horarios guardados correctamente</p>
        </div>
      )}

      <button
        onClick={() => void handleSave()}
        disabled={saving}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
      >
        <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
        {saving ? 'Guardando...' : 'Guardar horarios'}
      </button>
    </div>
  );
}
