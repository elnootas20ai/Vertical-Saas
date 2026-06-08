import React from 'react';
import { ChevronLeft, ChevronRight, Copy, Pencil, Users, Zap } from 'lucide-react';
import type { ScheduleTemplate, Weekday } from '../../../lib/schedulesApi';
import { WEEKDAYS } from '../../../lib/schedulesApi';
import type { VacationRequest } from '../../../lib/vacationsApi';
import type { CompanyHoliday } from '../../../lib/companyHolidaysApi';
import type { AvailabilityBlock } from '../../../lib/availabilityBlocksApi';
import { getHolidayForDate } from '../../../lib/companyHolidaysApi';
import { getMemberBlocksForDate, BLOCK_REASON_LABELS, BLOCK_REASON_COLORS } from '../../../lib/availabilityBlocksApi';
import { ROLE_BADGE } from '../../../lib/schedulesDisplay';

export interface WeekMember {
  user_id: string;
  fullName: string;
  role: string;
}

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
}: Props) {
  const formatDate = (d: Date) => d.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
  const isToday = (date: Date) => {
    const n = new Date();
    return date.getDate() === n.getDate() && date.getMonth() === n.getMonth() && date.getFullYear() === n.getFullYear();
  };

  const getSchedule = (id: string) => schedules.find((s) => s.member_id === id);
  const withSchedule = members.filter((m) => getSchedule(m.user_id)).length;
  const onVacationThisWeek = new Set(
    vacations
      .filter((v) => v.status === 'approved' && v.startDate <= weekDates[6]?.toISOString().slice(0, 10) && v.endDate >= weekStart)
      .map((v) => v.member_id),
  );

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
              {withSchedule}/{members.length} con horario · {onVacationThisWeek.size} de vacaciones esta semana
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

        <div className="px-4 py-2 flex flex-wrap gap-3 text-[10px] text-gray-500 border-b border-gray-100 dark:border-gray-700/60">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-400" /> Turno</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500" /> Vacaciones</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-400" /> Festivo</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-violet-400" /> Bloqueo</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase w-44">Miembro</th>
                {WEEKDAYS.map((day, i) => {
                  const dateStr = weekDates[i].toISOString().slice(0, 10);
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
                      const dateStr = weekDates[i].toISOString().slice(0, 10);
                      const shift = sched?.weekly?.[day];
                      const vac = vacations.find(
                        (v) => v.member_id === member.user_id && v.status === 'approved' && dateStr >= v.startDate && dateStr <= v.endDate,
                      );
                      const blk = getMemberBlocksForDate(blocks, member.user_id, dateStr)[0];
                      const hol = getHolidayForDate(dateStr, holidays);
                      if (vac) {
                        return (
                          <td key={day} className="px-2 py-3 text-center">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                              Vac.
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
