import type { EnrichedClockinRecord } from './clockinsApi';

export function resolveClockinMemberName(
  record: EnrichedClockinRecord,
  members?: { user_id: string; fullName?: string; email?: string }[],
): string {
  const local = members?.find((m) => m.user_id === record.member_id);
  for (const candidate of [local?.fullName, record.member_name, local?.email, record.member_email]) {
    const value = String(candidate || '').trim();
    if (!value) continue;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value)) continue;
    return value;
  }
  return 'Miembro del equipo';
}

export const ROLE_BADGE: Record<string, string> = {
  Admin: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Gerente: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Comercial: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Administración: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  Taller: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Usuario: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

export const STATUS_ORDER: Record<string, number> = {
  active: 0,
  break: 1,
  completed: 2,
  offline: 3,
};
