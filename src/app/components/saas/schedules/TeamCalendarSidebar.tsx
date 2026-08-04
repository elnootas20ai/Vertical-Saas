import { MapPin, Users } from 'lucide-react';
import type { ScheduleTemplate } from '../../../lib/schedulesApi';
import type { WorkerAssignment } from '../../../lib/authApi';
import {
  getTeamMemberCalendarColor,
  resolveMemberStoreLabel,
} from '../../../lib/teamCalendarColors';

type Member = {
  user_id: string;
  fullName: string;
  role?: string;
  employment?: {
    salesPointId?: string;
    assignments?: WorkerAssignment[];
  };
};

type Props = {
  members: Member[];
  schedules: ScheduleTemplate[];
  allSchedules?: ScheduleTemplate[];
  workCenters?: Array<{ _id?: string; id?: string; name?: string }>;
  weekStart?: string;
  storeFilterLabel?: string;
};

function resolveSchedule(
  memberId: string,
  weekStart: string | undefined,
  schedules: ScheduleTemplate[],
  allSchedules?: ScheduleTemplate[],
): ScheduleTemplate | null {
  const pool = allSchedules && allSchedules.length > 0 ? allSchedules : schedules;
  if (weekStart) {
    const exact = pool.find((s) => s.member_id === memberId && s.week_start === weekStart);
    if (exact) return exact;
  }
  return (
    schedules.find((s) => s.member_id === memberId)
    || pool.find((s) => s.member_id === memberId)
    || null
  );
}

/** Panel derecho: equipo de la tienda con color automático. */
export function TeamCalendarSidebar({
  members,
  schedules,
  allSchedules,
  workCenters = [],
  weekStart,
  storeFilterLabel,
}: Props) {
  return (
    <aside className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900 lg:sticky lg:top-4">
      <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40">
            <Users className="h-4 w-4 text-[#2563EB]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">Equipo</h3>
            <p className="text-[11px] text-stone-500 truncate">
              {storeFilterLabel || 'Tu tienda'}
            </p>
          </div>
        </div>
      </div>

      {members.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-stone-400">
          Nadie en este filtro
        </div>
      ) : (
        <ul className="max-h-56 divide-y divide-stone-100 overflow-y-auto dark:divide-stone-800 sm:max-h-72 lg:max-h-[min(70vh,560px)]">
          {members.map((m) => {
            const color = getTeamMemberCalendarColor(m.user_id);
            const sched = resolveSchedule(m.user_id, weekStart, schedules, allSchedules);
            const store = resolveMemberStoreLabel({
              scheduleWorkCenterId: sched?.work_center_id,
              scheduleWorkCenterName: sched?.work_center_name,
              employmentSalesPointId: m.employment?.salesPointId,
              assignments: m.employment?.assignments,
              workCenters,
              fallbackLabel: storeFilterLabel,
            });
            return (
              <li key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: color.hex }}
                >
                  {m.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                    {m.fullName}
                  </p>
                  <p className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5 truncate">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {store || 'Sin tienda asignada'}
                  </p>
                </div>
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white dark:ring-stone-900"
                  style={{ backgroundColor: color.hex }}
                  title="Color en calendario"
                />
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
