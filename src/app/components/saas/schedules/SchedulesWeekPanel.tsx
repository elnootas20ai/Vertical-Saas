import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Copy, Pencil, Users, Zap } from 'lucide-react';
import type { ScheduleTemplate, Weekday } from '../../../lib/schedulesApi';
import { WEEKDAYS } from '../../../lib/schedulesApi';
import type { VacationRequest, LeaveType } from '../../../lib/vacationsApi';
import { LEAVE_TYPE_SHORT_ES, LEAVE_TYPE_CHIP_CLASS } from '../../../lib/vacationsApi';
import type { CompanyHoliday } from '../../../lib/companyHolidaysApi';
import type { AvailabilityBlock } from '../../../lib/availabilityBlocksApi';
import { getHolidayForDate } from '../../../lib/companyHolidaysApi';
import { getMemberBlocksForDate, BLOCK_REASON_COLORS } from '../../../lib/availabilityBlocksApi';
import { ROLE_BADGE } from '../../../lib/schedulesDisplay';

export interface WeekMember {
  user_id: string;
  fullName: string;
  role: string;
}

/** Asignación visual a evento (origen: centro de eventos / planificación). */
export type WeekMemberEventAssignment = {
  eventId: string;
  eventName: string;
  eventDate?: string;
};

interface Props {
  members: WeekMember[];
  schedules: ScheduleTemplate[];
  templates: { _id: string; name: string; color: string }[];
  vacations: VacationRequest[];
  holidays: CompanyHoliday[];
  blocks: AvailabilityBlock[];
  weekDates: Date[];
  weekStart: string;
  weekOffset: number;
  dayLabels: Record<Weekday, string>;
  lang: string;
  leaveLabels: Record<string, string>;
  canManage: boolean;
  saving: boolean;
  blockLabels: Record<string, string>;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onEditMember: (memberId: string) => void;
  onBulkAssign?: () => void;
  onAutoAssign?: () => void;
  hasRules?: boolean;
  /** Solo vertical eventos: nombre del evento al lado del trabajador. */
  memberEventById?: Record<string, WeekMemberEventAssignment | null>;
}

function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Prioriza aprobada sobre pendiente si hay solape. */
function leaveOnDay(vacations: VacationRequest[], memberId: string, dateStr: string): VacationRequest | null {
  const hits = vacations.filter(
    (v) =>
      v.member_id === memberId
      && (v.status === 'approved' || v.status === 'pending')
      && dateStr >= v.startDate
      && dateStr <= v.endDate,
  );
  if (!hits.length) return null;
  return hits.find((v) => v.status === 'approved') || hits[0];
}

function leaveChip(
  leave: VacationRequest,
  leaveLabels: Record<string, string>,
): { className: string; label: string; title: string } {
  const type = (leave.leaveType || 'other') as LeaveType;
  const full = leaveLabels[type] || LEAVE_TYPE_SHORT_ES[type] || leave.leaveType || 'Ausencia';
  const short = LEAVE_TYPE_SHORT_ES[type] || full.slice(0, 8);
  if (leave.status === 'pending') {
    return {
      className: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 ring-1 ring-amber-300/80 dark:ring-amber-700',
      label: short,
      title: `${full} · Pendiente de aprobar`,
    };
  }
  return {
    className: LEAVE_TYPE_CHIP_CLASS[type] || LEAVE_TYPE_CHIP_CLASS.other,
    label: short,
    title: full,
  };
}

export function SchedulesWeekPanel({
  members,
  schedules,
  templates,
  vacations,
  holidays,
  blocks,
  weekDates,
  weekStart,
  weekOffset,
  dayLabels,
  lang,
  leaveLabels,
  canManage,
  saving,
  blockLabels,
  onPrevWeek,
  onNextWeek,
  onToday,
  onEditMember,
  onBulkAssign,
  onAutoAssign,
  hasRules,
  memberEventById,
}: Props) {
  const formatDate = (d: Date) => d.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
  const isToday = (date: Date) => {
    const n = new Date();
    return date.getDate() === n.getDate() && date.getMonth() === n.getMonth() && date.getFullYear() === n.getFullYear();
  };

  const weekEndIso = weekDates[6] ? isoLocal(weekDates[6]) : weekStart;

  const getSchedule = (id: string) =>
    schedules.find((s) => s.member_id === id && s.week_start === weekStart)
    || schedules.find((s) => s.member_id === id && !s.week_start)
    || schedules.find((s) => s.member_id === id);
  const withSchedule = members.filter((m) => getSchedule(m.user_id)).length;

  const weekLeaves = useMemo(() => {
    return vacations.filter(
      (v) =>
        (v.status === 'approved' || v.status === 'pending')
        && v.startDate <= weekEndIso
        && v.endDate >= weekStart
        && members.some((m) => m.user_id === v.member_id),
    );
  }, [vacations, weekStart, weekEndIso, members]);

  const awaySummary = useMemo(() => {
    const byMember = new Map<string, { name: string; items: { type: string; status: string }[] }>();
    for (const v of weekLeaves) {
      const member = members.find((m) => m.user_id === v.member_id);
      if (!member) continue;
      const typeLabel = leaveLabels[v.leaveType] || v.leaveType;
      const cur = byMember.get(v.member_id) || { name: member.fullName, items: [] };
      cur.items.push({ type: typeLabel, status: v.status });
      byMember.set(v.member_id, cur);
    }
    return Array.from(byMember.values());
  }, [weekLeaves, members, leaveLabels]);

  const approvedAwayCount = new Set(
    weekLeaves.filter((v) => v.status === 'approved').map((v) => v.member_id),
  ).size;
  const pendingAwayCount = new Set(
    weekLeaves.filter((v) => v.status === 'pending').map((v) => v.member_id),
  ).size;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-gray-100 dark:border-gray-700/80">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onPrevWeek} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Semana anterior">
              <ChevronLeft className="w-5 h-5 text-gray-500" />
            </button>
            <button type="button" onClick={onNextWeek} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Semana siguiente">
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </button>
            {weekOffset !== 0 && (
              <button type="button" onClick={onToday} className="px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded-lg hover:bg-amber-100">
                Esta semana
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-gray-900 dark:text-white capitalize">
              {formatDate(weekDates[0])} — {formatDate(weekDates[6])}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {withSchedule}/{members.length} con horario
              {approvedAwayCount > 0 ? ` · ${approvedAwayCount} ausente${approvedAwayCount === 1 ? '' : 's'}` : ''}
              {pendingAwayCount > 0 ? ` · ${pendingAwayCount} pendiente${pendingAwayCount === 1 ? '' : 's'}` : ''}
              {canManage ? ' · Clic en una fila para editar' : ''}
            </p>
          </div>
          {canManage && templates.length > 0 && (
            <div className="flex flex-wrap gap-2 shrink-0">
              {onBulkAssign && (
                <button type="button" onClick={onBulkAssign} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl">
                  <Copy className="w-3.5 h-3.5" /> Masiva
                </button>
              )}
              {hasRules && onAutoAssign && (
                <button type="button" onClick={onAutoAssign} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-xl hover:bg-amber-100 disabled:opacity-50">
                  <Zap className="w-3.5 h-3.5" /> Auto-asignar
                </button>
              )}
            </div>
          )}
        </div>

        {awaySummary.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/60 bg-slate-50/80 dark:bg-slate-900/40">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Quién falta esta semana</p>
            <ul className="flex flex-wrap gap-2">
              {awaySummary.map((row) => {
                const parts = row.items.map((it) =>
                  it.status === 'pending' ? `${it.type} (pend.)` : it.type,
                );
                return (
                  <li
                    key={row.name}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-800 dark:text-gray-200"
                  >
                    <span className="font-semibold">{row.name}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-600 dark:text-gray-400">{parts.join(', ')}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="px-4 py-2 flex flex-wrap gap-3 text-[10px] text-gray-500 border-b border-gray-100 dark:border-gray-700/60">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-400" /> Turno</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500" /> Vacaciones</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-sky-500" /> Asuntos propios</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-orange-500" /> Baja / otros</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded ring-1 ring-amber-400 bg-amber-100" /> Pendiente</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-400" /> Festivo</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-violet-400" /> Bloqueo</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase w-44">Miembro</th>
                {WEEKDAYS.map((day, i) => {
                  const dateStr = isoLocal(weekDates[i]);
                  const hol = getHolidayForDate(dateStr, holidays);
                  return (
                    <th
                      key={day}
                      className={`px-2 py-3 text-center text-xs font-semibold uppercase ${
                        isToday(weekDates[i])
                          ? 'text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-900/10'
                          : hol
                            ? 'text-rose-500 dark:text-rose-400 bg-rose-50/30 dark:bg-rose-900/10'
                            : 'text-gray-400'
                      }`}
                    >
                      <div>{dayLabels[day]?.slice(0, 3)}</div>
                      <div className="text-[10px] font-normal mt-0.5">{weekDates[i].getDate()}</div>
                    </th>
                  );
                })}
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-400 uppercase">H/sem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {members.map((member) => {
                const sched = getSchedule(member.user_id);
                const tmpl = sched?.template_id ? templates.find((t) => t._id === sched.template_id) : null;
                return (
                  <tr
                    key={member.user_id}
                    onClick={() => canManage && onEditMember(member.user_id)}
                    className={`transition-colors ${canManage ? 'cursor-pointer hover:bg-amber-50/40 dark:hover:bg-amber-950/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/20'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0">
                          {member.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{member.fullName}</p>
                          {memberEventById && (
                            <p
                              className={`text-[11px] mt-0.5 truncate ${
                                memberEventById[member.user_id]?.eventName
                                  ? 'font-medium text-cyan-700 dark:text-cyan-300'
                                  : 'text-gray-400 dark:text-gray-500'
                              }`}
                              title={memberEventById[member.user_id]?.eventName || 'Sin evento'}
                            >
                              {memberEventById[member.user_id]?.eventName || 'Sin evento'}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${ROLE_BADGE[member.role] || ROLE_BADGE.Usuario}`}>
                              {member.role}
                            </span>
                            {tmpl && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tmpl.color }} />
                                {tmpl.name}
                              </span>
                            )}
                          </div>
                        </div>
                        {canManage && <Pencil className="w-3.5 h-3.5 text-gray-300 ml-auto shrink-0 opacity-0 group-hover:opacity-100" />}
                      </div>
                    </td>
                    {WEEKDAYS.map((day, i) => {
                      const dateStr = isoLocal(weekDates[i]);
                      const shift = sched?.weekly?.[day];
                      const vac = leaveOnDay(vacations, member.user_id, dateStr);
                      const blk = getMemberBlocksForDate(blocks, member.user_id, dateStr)[0];
                      const hol = getHolidayForDate(dateStr, holidays);
                      if (vac) {
                        const chip = leaveChip(vac, leaveLabels);
                        return (
                          <td key={day} className="px-2 py-3 text-center">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold max-w-[76px] truncate ${chip.className}`}
                              title={chip.title}
                            >
                              {chip.label}
                            </span>
                          </td>
                        );
                      }
                      if (blk) {
                        return (
                          <td key={day} className="px-2 py-3 text-center">
                            <span
                              className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold max-w-[72px] truncate"
                              style={{ backgroundColor: `${BLOCK_REASON_COLORS[blk.reason]}20`, color: BLOCK_REASON_COLORS[blk.reason] }}
                              title={blockLabels[blk.reason]}
                            >
                              {blockLabels[blk.reason]?.slice(0, 8) || blk.reason}
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td
                          key={day}
                          className={`px-2 py-3 text-center ${isToday(weekDates[i]) ? 'bg-amber-50/30 dark:bg-amber-900/5' : hol ? 'bg-rose-50/20 dark:bg-rose-900/5' : ''}`}
                        >
                          {shift?.enabled ? (
                            <div className="text-xs tabular-nums">
                              <span className="font-semibold text-gray-900 dark:text-white">{shift.start}</span>
                              <span className="text-gray-400 mx-0.5">–</span>
                              <span className="font-semibold text-gray-900 dark:text-white">{shift.end}</span>
                              {shift.end && shift.start && shift.end < shift.start ? (
                                <span className="ml-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">+1</span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-center">
                      <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">{sched ? `${sched.weeklyHours}h` : '—'}</span>
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-gray-400 text-sm">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    No hay miembros en el equipo
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
