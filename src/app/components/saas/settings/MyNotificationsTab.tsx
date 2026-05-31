import { useEffect, useState } from 'react';
import {
  Bell,
  BellOff,
  Clock,
  Coffee,
  LogIn,
  LogOut,
  AlertTriangle,
  Loader2,
  Check,
  Save,
  Users,
  UserCheck,
  FileCheck,
} from 'lucide-react';
import {
  type NotificationPreferences,
  type ClockinNotificationPreferences,
  type TeamNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationPreferencesRequest,
  updateNotificationPreferencesRequest,
} from '../../../lib/authApi';

type ClockinPrefKey = keyof ClockinNotificationPreferences;
type TeamPrefKey = keyof TeamNotificationPreferences;

interface ClockinPrefOption {
  key: ClockinPrefKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

interface TeamPrefOption {
  key: TeamPrefKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

const CLOCKIN_OPTIONS: ClockinPrefOption[] = [
  {
    key: 'onEntry',
    label: 'Entrada puntual',
    description: 'Te avisa cuando un trabajador ficha entrada dentro del horario.',
    icon: LogIn,
    accent: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  },
  {
    key: 'onLate',
    label: 'Retraso al entrar',
    description: 'Aviso cuando alguien ficha entrada 5 minutos o más tarde de su turno.',
    icon: AlertTriangle,
    accent: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  },
  {
    key: 'onEarlyEntry',
    label: 'Entrada anticipada',
    description: 'Notifica si alguien ficha 30 minutos o más antes de su turno.',
    icon: Clock,
    accent: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
  },
  {
    key: 'onExit',
    label: 'Salida',
    description: 'Te avisa al fichar salida (puntual o con horas extra).',
    icon: LogOut,
    accent: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  },
  {
    key: 'onEarlyExit',
    label: 'Salida anticipada',
    description: 'Alerta cuando alguien se va 10 minutos o más antes de finalizar su turno.',
    icon: AlertTriangle,
    accent: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
  },
  {
    key: 'onBreaks',
    label: 'Inicio y fin de descansos',
    description: 'Cada vez que un trabajador entra o vuelve de un descanso. Puede ser ruidoso.',
    icon: Coffee,
    accent: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800',
  },
  {
    key: 'onLongBreak',
    label: 'Descanso prolongado',
    description: 'Solo cuando un descanso supera 15 minutos el tiempo previsto.',
    icon: Coffee,
    accent: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
  },
];

const TEAM_OPTIONS: TeamPrefOption[] = [
  {
    key: 'onIdentityCompleted',
    label: 'Identidad completada',
    description: 'Cuando un trabajador rellena DNI, teléfono y dirección (paso 1 de la ficha).',
    icon: UserCheck,
    accent: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800',
  },
  {
    key: 'onWorkerProfileCompleted',
    label: 'Ficha de nómina completada',
    description: 'Cuando añade IBAN, Seguridad Social, banco y contacto de emergencia (paso 2).',
    icon: FileCheck,
    accent: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800',
  },
];

function PrefToggle({
  active,
  label,
  onToggle,
}: {
  active: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 transition-colors ${
        active
          ? 'bg-blue-600 border-blue-600'
          : 'bg-gray-200 dark:bg-gray-700 border-gray-200 dark:border-gray-700'
      }`}
      role="switch"
      aria-checked={active}
      aria-label={`${active ? 'Desactivar' : 'Activar'} ${label}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
          active ? 'translate-x-5' : 'translate-x-0.5'
        } mt-[1px]`}
      />
    </button>
  );
}

export function MyNotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [originalPrefs, setOriginalPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    getNotificationPreferencesRequest()
      .then((p) => {
        setPrefs(p);
        setOriginalPrefs(p);
      })
      .catch((err: Error) => setError(err.message || 'No se pudieron cargar tus preferencias'))
      .finally(() => setLoading(false));
  }, []);

  const toggleClockinPref = (key: ClockinPrefKey) => {
    setPrefs((prev) => ({
      ...prev,
      clockin: { ...prev.clockin, [key]: !prev.clockin[key] },
    }));
  };

  const toggleTeamPref = (key: TeamPrefKey) => {
    setPrefs((prev) => ({
      ...prev,
      team: { ...prev.team, [key]: !prev.team[key] },
    }));
  };

  const hasChanges = JSON.stringify(prefs) !== JSON.stringify(originalPrefs);
  const totalActive =
    Object.values(prefs.clockin).filter(Boolean).length
    + Object.values(prefs.team).filter(Boolean).length;
  const totalOptions = CLOCKIN_OPTIONS.length + TEAM_OPTIONS.length;

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const saved = await updateNotificationPreferencesRequest(prefs);
      setPrefs(saved);
      setOriginalPrefs(saved);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-blue-500" />
            Mis notificaciones
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Decide qué eventos quieres recibir en tu campanario. Tus preferencias son personales:
            no afectan a lo que reciben otros gerentes de tu empresa.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {totalActive} de {totalOptions} activos
          </span>
          {success && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="w-4 h-4" />
              Guardado
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar cambios
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 flex items-center gap-3">
          <Users className="w-5 h-5 text-violet-500" />
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Ficha del equipo</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Avisos cuando un trabajador completa pasos de su ficha personal.
            </p>
          </div>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {TEAM_OPTIONS.map((option) => {
            const active = prefs.team[option.key];
            const Icon = option.icon;
            return (
              <div
                key={option.key}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors"
              >
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-xl border-2 ${option.accent} shrink-0`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {option.label}
                  </span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {option.description}
                  </p>
                </div>
                <PrefToggle
                  active={active}
                  label={option.label}
                  onToggle={() => toggleTeamPref(option.key)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 flex items-center gap-3">
          <Clock className="w-5 h-5 text-purple-500" />
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Fichajes del equipo</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Avisos cuando un miembro de tu equipo entra, sale o pausa.
            </p>
          </div>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {CLOCKIN_OPTIONS.map((option) => {
            const active = prefs.clockin[option.key];
            const Icon = option.icon;
            return (
              <div
                key={option.key}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors"
              >
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-xl border-2 ${option.accent} shrink-0`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {option.label}
                  </span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {option.description}
                  </p>
                </div>
                <PrefToggle
                  active={active}
                  label={option.label}
                  onToggle={() => toggleClockinPref(option.key)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 px-5 py-4 flex items-start gap-3">
        <BellOff className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
        <div className="text-xs text-gray-500 dark:text-gray-400">
          <strong className="text-gray-700 dark:text-gray-300">¿Demasiado ruido?</strong> Si solo
          quieres enterarte de los problemas, deja activos «Retraso al entrar», «Salida anticipada»
          y «Descanso prolongado». Las entradas y salidas puntuales seguirán quedando registradas en
          la pestaña Fichajes sin enviarte notificación.
        </div>
      </div>
    </div>
  );
}
