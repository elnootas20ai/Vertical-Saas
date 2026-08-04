import React, { useMemo } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Timer } from 'lucide-react';
import type { ScheduleTemplate, Weekday } from '../../../lib/schedulesApi';
import { WEEKDAYS } from '../../../lib/schedulesApi';
import type { EnrichedClockinRecord } from '../../../lib/clockinsApi';
import type { ScheduleAlert } from '../../../lib/scheduleAlertsApi';
import { ALERT_SEVERITY_CONFIG } from '../../../lib/scheduleAlertsApi';
import { ROLE_BADGE } from '../../../lib/schedulesDisplay';

interface Member {
  user_id: string;
  fullName: string;
  role: string;
}

interface Props {
  members: Member[];
  schedules: ScheduleTemplate[];
  clockins: EnrichedClockinRecord[];
  comparisonDate: string;
  lang: string;
  alerts: ScheduleAlert[];
  onDateChange: (date: string) => void;
  onAlertAction: (alert: ScheduleAlert) => void;
}

function getTimeDiffMin(scheduled: string, actualIso: string): number {
  const [sh, sm] = scheduled.split(':').map(Number);
  const a = new Date(actualIso);
  return a.getHours() * 60 + a.getMinutes() - (sh * 60 + sm);
}

export function SchedulesControlPanel({
  members,
  schedules,
  clockins,
  comparisonDate,
  lang,
  alerts,
  onDateChange,
  onAlertAction,
}: Props) {
  const comparisonDay = useMemo(() => {
    const d = new Date(`${comparisonDate}T12:00:00`);
    return WEEKDAYS[(d.getDay() + 6) % 7] as Weekday;
  }, [comparisonDate]);

  const rows = useMemo(() => {
    return members.map((m) => {
      const sched = schedules.find((s) => s.member_id === m.user_id);
      const shift = sched?.weekly?.[comparisonDay];
      const rec = clockins.find((c) => c.member_id === m.user_id && !c.roster_placeholder);
      const ci = rec?.entries?.find((e) => e.type === 'clock_in');
      const co = rec?.entries?.find((e) => e.type === 'clock_out');
      const dI = shift?.enabled && ci ? getTimeDiffMin(shift.start, ci.time) : null;
      const dO = shift?.enabled && co ? getTimeDiffMin(shift.end, co.time) : null;
      let st: 'ok' | 'late' | 'early' | 'absent' | 'no-schedule' = 'no-schedule';
      if (shift?.enabled) {
        if (!rec || !ci) st = 'absent';
        else if (dI !== null && dI > 5) st = 'late';
        else if (dO !== null && dO < -5) st = 'early';
        else st = 'ok';
      }
      return { member: m, shift, ci, co, dI, dO, st };
    });
  }, [members, schedules, clockins, comparisonDay]);

  const summary = useMemo(() => {
    const withSchedule = rows.filter((r) => r.shift?.enabled).length;
    const ok = rows.filter((r) => r.st === 'ok').length;
    const late = rows.filter((r) => r.st === 'late').length;
    const absent = rows.filter((r) => r.st === 'absent').length;
    return { withSchedule, ok, late, absent };
  }, [rows]);

  const statusCfg: Record<string, { l: string; c: string }> = {
    ok: { l: 'Correcto', c: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    late: { l: 'Retraso', c: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    early: { l: 'Salida anticipada', c: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    absent: { l: 'Sin fichar', c: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    'no-schedule': { l: 'Sin horario', c: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={comparisonDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-sm"
          />
          {comparisonDate !== today && (
            <button type="button" onClick={() => onDateChange(today)} className="px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
              Hoy
            </button>
          )}
          <p className="text-xs text-gray-500 ml-auto">
            {summary.withSchedule} con turno · {summary.ok} ok · {summary.late} retrasos · {summary.absent} ausencias
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/80 flex items-center gap-2">
          <Timer className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Horario vs fichaje real</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/50 dark:bg-gray-900/30">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase">Miembro</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">Previsto</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">Fichaje</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">Δ entrada</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">Δ salida</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {rows.map(({ member, shift, ci, co, dI, dO, st }) => (
                <tr key={member.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/20">
                  <td className="px-4 py-2.5">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{member.fullName}</p>
                    <span className={`inline-flex mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${ROLE_BADGE[member.role] || ROLE_BADGE.Usuario}`}>{member.role}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-sm tabular-nums">{shift?.enabled ? `${shift.start}–${shift.end}` : '—'}</td>
                  <td className="px-4 py-2.5 text-center text-sm tabular-nums">
                    {ci
                      ? `${new Date(ci.time).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}${co ? `–${new Date(co.time).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}` : ''}`
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {dI !== null ? (
                      <span className={`text-xs font-semibold tabular-nums ${dI > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {dI > 0 ? '+' : ''}{dI}m
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {dO !== null ? (
                      <span className={`text-xs font-semibold tabular-nums ${dO < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {dO > 0 ? '+' : ''}{dO}m
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusCfg[st].c}`}>{statusCfg[st].l}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/80 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Anomalías detectadas</h3>
        </div>
        {!alerts.length ? (
          <div className="py-12 text-center text-gray-400">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-400 opacity-80" />
            <p className="text-sm">Sin anomalías esta semana</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {alerts.map((a) => (
              <div key={a.id} className={`px-4 py-3 flex items-start gap-3 ${ALERT_SEVERITY_CONFIG[a.severity]?.cls || ''}`}>
                {a.severity === 'critical' ? (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : a.severity === 'warning' ? (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs opacity-80 mt-0.5">{a.description}</p>
                </div>
                {a.date && <span className="text-xs tabular-nums opacity-70 shrink-0">{a.date}</span>}
                <button type="button" onClick={() => onAlertAction(a)} className="text-xs font-semibold underline shrink-0">
                  {a.actionLabel}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
