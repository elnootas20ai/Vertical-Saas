/**
 * Color estable por trabajador para el calendario de equipo.
 * Misma persona → mismo color siempre (hash del user_id).
 */

import type { WorkerAssignment } from './authApi';
import { salesPointRefsMatch } from './clockinsMemberStore';
import { getPrimarySiteAssignment } from './workerStoreAssignment';

export type TeamMemberCalendarColor = {
  hex: string;
  bg: string;
  text: string;
  border: string;
};

const TEAM_PALETTE: TeamMemberCalendarColor[] = [
  { hex: '#2563EB', bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-800 dark:text-blue-200', border: 'border-blue-300 dark:border-blue-700' },
  { hex: '#0D9488', bg: 'bg-teal-100 dark:bg-teal-950/50', text: 'text-teal-800 dark:text-teal-200', border: 'border-teal-300 dark:border-teal-700' },
  { hex: '#059669', bg: 'bg-emerald-100 dark:bg-emerald-950/50', text: 'text-emerald-800 dark:text-emerald-200', border: 'border-emerald-300 dark:border-emerald-700' },
  { hex: '#D97706', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-900 dark:text-amber-200', border: 'border-amber-300 dark:border-amber-700' },
  { hex: '#E11D48', bg: 'bg-rose-100 dark:bg-rose-950/40', text: 'text-rose-800 dark:text-rose-200', border: 'border-rose-300 dark:border-rose-700' },
  { hex: '#0284C7', bg: 'bg-sky-100 dark:bg-sky-950/50', text: 'text-sky-800 dark:text-sky-200', border: 'border-sky-300 dark:border-sky-700' },
  { hex: '#4F46E5', bg: 'bg-indigo-100 dark:bg-indigo-950/50', text: 'text-indigo-800 dark:text-indigo-200', border: 'border-indigo-300 dark:border-indigo-700' },
  { hex: '#C2410C', bg: 'bg-orange-100 dark:bg-orange-950/40', text: 'text-orange-900 dark:text-orange-200', border: 'border-orange-300 dark:border-orange-700' },
  { hex: '#0F766E', bg: 'bg-cyan-100 dark:bg-cyan-950/40', text: 'text-cyan-900 dark:text-cyan-200', border: 'border-cyan-300 dark:border-cyan-700' },
  { hex: '#B45309', bg: 'bg-yellow-100 dark:bg-yellow-950/40', text: 'text-yellow-900 dark:text-yellow-200', border: 'border-yellow-300 dark:border-yellow-700' },
  { hex: '#BE123C', bg: 'bg-pink-100 dark:bg-pink-950/40', text: 'text-pink-800 dark:text-pink-200', border: 'border-pink-300 dark:border-pink-700' },
  { hex: '#1D4ED8', bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-900 dark:text-blue-100', border: 'border-blue-200 dark:border-blue-800' },
];

function hashId(id: string): number {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function getTeamMemberCalendarColor(userId: string): TeamMemberCalendarColor {
  const idx = hashId(userId) % TEAM_PALETTE.length;
  return TEAM_PALETTE[idx];
}

export function resolveMemberStoreLabel(options: {
  scheduleWorkCenterId?: string | null;
  scheduleWorkCenterName?: string | null;
  employmentSalesPointId?: string | null;
  assignments?: WorkerAssignment[] | null;
  workCenters?: Array<{ _id?: string; id?: string; name?: string }>;
  fallbackLabel?: string | null;
}): string {
  const named = String(options.scheduleWorkCenterName || '').trim();
  if (named) return named;

  const assignment = getPrimarySiteAssignment(options.assignments);
  const assignName = String(assignment?.entityName || '').trim();
  if (assignName) return assignName;

  const refs = [
    String(options.scheduleWorkCenterId || '').trim(),
    String(options.employmentSalesPointId || '').trim(),
    String(assignment?.entityId || '').trim(),
  ].filter(Boolean);

  for (const ref of refs) {
    const wc = (options.workCenters || []).find((w) => {
      const id = String(w._id || w.id || '').trim();
      return id && salesPointRefsMatch(id, ref);
    });
    if (wc?.name) return String(wc.name).trim();
  }

  if (refs.length > 0) {
    return String(options.fallbackLabel || '').trim() || 'Tienda de la contratación';
  }

  return String(options.fallbackLabel || '').trim();
}
