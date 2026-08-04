import {
  ArrowRight,
  CalendarRange,
  Clock,
  FileText,
  Loader2,
  Receipt,
  Umbrella,
  Users,
  AlertTriangle,
} from 'lucide-react';
import type { TeamDashboardSnapshot } from '../../lib/teamDashboardApi';

type Props = {
  snapshot: TeamDashboardSnapshot | null;
  loading?: boolean;
  onOpenTeam: () => void;
  onOpenClockins: () => void;
  onOpenSchedules: () => void;
  onOpenPayroll: () => void;
  onOpenRequests?: () => void;
};

function Metric({
  value,
  label,
  tone,
}: {
  value: string | number;
  label: string;
  tone: 'green' | 'blue' | 'amber' | 'slate' | 'violet' | 'rose';
}) {
  const tones = {
    green: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
    slate: 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
    violet: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400',
    rose: 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400',
  };
  return (
    <div className={`text-center p-3 rounded-xl ${tones[tone]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] font-medium uppercase opacity-80">{label}</p>
    </div>
  );
}

export function TeamRrhhDashboardWidget({
  snapshot,
  loading = false,
  onOpenTeam,
  onOpenClockins,
  onOpenSchedules,
  onOpenPayroll,
  onOpenRequests,
}: Props) {
  const s = snapshot;
  const openRequests = onOpenRequests || onOpenSchedules;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-violet-500" />
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Equipo y RRHH</p>
          {s && s.scheduleAlertsCount + s.pendingVacationRequests > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold rounded-full bg-red-500 text-white">
              {s.scheduleAlertsCount + s.pendingVacationRequests}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenTeam}
          className="flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
        >
          Ver equipo <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            Cargando equipo…
          </div>
        ) : !s ? (
          <p className="text-sm text-gray-500 text-center py-6">Sin datos de equipo</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric value={s.clockedInNow} label="Fichados ahora" tone="green" />
              <Metric value={s.onVacationToday} label="Vacaciones hoy" tone="blue" />
              <Metric value={s.onAbsenceToday} label="Ausencias hoy" tone="amber" />
              <Metric value={s.noShiftToday} label="Sin turno hoy" tone="slate" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric value={s.pendingVacationRequests} label="Vac. pendientes" tone="rose" />
              <Metric value={s.payslipsThisMonth} label="Nóminas mes" tone="violet" />
              <Metric value={s.membersWithoutSchedule} label="Sin horario" tone="amber" />
              <Metric value={s.scheduleAlertsCount} label="Alertas RRHH" tone="rose" />
            </div>

            {(s.onVacationNames.length > 0 || s.onAbsenceNames.length > 0) && (
              <div className="flex flex-wrap gap-1.5 text-xs">
                {s.onVacationNames.map((name) => (
                  <span
                    key={`vac-${name}`}
                    className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 font-medium"
                  >
                    {name.split(' ')[0]} · vacaciones
                  </span>
                ))}
                {s.onAbsenceNames.map((name) => (
                  <span
                    key={`abs-${name}`}
                    className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 font-medium"
                  >
                    {name.split(' ')[0]} · ausente
                  </span>
                ))}
              </div>
            )}

            {s.pendingVacationRequests > 0 && (
              <button
                type="button"
                onClick={openRequests}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-rose-800 dark:text-rose-200">
                  <Umbrella className="w-4 h-4" />
                  Revisar {s.pendingVacationRequests} solicitud{s.pendingVacationRequests === 1 ? '' : 'es'} RRHH
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-rose-600" />
              </button>
            )}
            {s.scheduleAlertsCount > 0 && (
              <button
                type="button"
                onClick={onOpenSchedules}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4" />
                  Revisar alertas de horarios
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-amber-600" />
              </button>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
              <QuickLink icon={<Clock className="w-3.5 h-3.5" />} label="Fichajes" onClick={onOpenClockins} />
              <QuickLink icon={<Umbrella className="w-3.5 h-3.5" />} label="Solicitudes" onClick={openRequests} />
              <QuickLink icon={<CalendarRange className="w-3.5 h-3.5" />} label="Horarios" onClick={onOpenSchedules} />
              <QuickLink icon={<Receipt className="w-3.5 h-3.5" />} label="Nóminas" onClick={onOpenPayroll} />
              <QuickLink icon={<FileText className="w-3.5 h-3.5" />} label="Equipo" onClick={onOpenTeam} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function QuickLink({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}

export function TeamRrhhCompactRow({
  snapshot,
}: {
  snapshot: TeamDashboardSnapshot | null;
}) {
  if (!snapshot) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
      <CompactPill label="Fichados" value={snapshot.clockedInNow} />
      <CompactPill label="Vacaciones" value={snapshot.onVacationToday} />
      <CompactPill label="Ausencias" value={snapshot.onAbsenceToday} />
      <CompactPill label="Vac. pend." value={snapshot.pendingVacationRequests} highlight={snapshot.pendingVacationRequests > 0} />
      <CompactPill label="Nóminas mes" value={snapshot.payslipsThisMonth} />
      <CompactPill label="Alertas RRHH" value={snapshot.scheduleAlertsCount} highlight={snapshot.scheduleAlertsCount > 0} />
    </div>
  );
}

function CompactPill({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl px-3 py-2 border ${
        highlight
          ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
          : 'border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40'
      }`}
    >
      <p className="text-[9px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-black text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
    </div>
  );
}
