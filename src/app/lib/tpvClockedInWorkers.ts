import { getApiBase } from './apiBase';
import { getAuthHeaders, type AuthUser } from './authApi';
import { listClockins } from './clockinsApi';

export interface TpvClockedInWorker {
  id: string;
  name: string;
  status: 'active' | 'break';
}

export function getWorkerInitials(name: string): string {
  const parts = String(name || '').split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

export function isMemberAssignedToStore(
  member: AuthUser,
  ownerUserId: string,
  pdvId: string,
  workCenterId: string,
): boolean {
  const ref = String(member.employment?.salesPointId || '').trim();
  const isOwner = ownerUserId === member.user_id;
  if (isOwner && !ref) return true;
  if (!ref) return false;
  return ref === pdvId || ref === workCenterId || ref === `wc:${workCenterId}`;
}

async function fetchBusinessUsers(businessId: string): Promise<AuthUser[]> {
  const res = await fetch(
    `${getApiBase()}/api/auth/users?businessId=${encodeURIComponent(businessId)}`,
    { headers: getAuthHeaders() },
  );
  const data = (await res.json().catch(() => ({}))) as { users?: AuthUser[]; error?: string };
  if (!res.ok) throw new Error(data.error || 'No se pudo cargar el equipo');
  return data.users || [];
}

/** Trabajadores fichados hoy en la tienda (activos o en descanso). */
export async function loadClockedInStoreWorkers(
  businessId: string,
  ownerUserId: string,
  pdvId: string,
  workCenterId: string,
): Promise<TpvClockedInWorker[]> {
  if (!businessId) return [];
  const today = new Date().toISOString().slice(0, 10);
  const [users, records] = await Promise.all([
    fetchBusinessUsers(businessId),
    listClockins(businessId, { date: today }),
  ]);
  const teamIds = new Set(
    users
      .filter(
        (u) =>
          u.status !== 'inactive' &&
          isMemberAssignedToStore(u, ownerUserId, pdvId, workCenterId),
      )
      .map((u) => u.user_id),
  );
  const byId = new Map<string, TpvClockedInWorker>();
  for (const r of records) {
    if (!teamIds.has(r.member_id)) continue;
    if (r.status !== 'active' && r.status !== 'break') continue;
    byId.set(r.member_id, {
      id: r.member_id,
      name: r.member_name || 'Trabajador',
      status: r.status,
    });
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function pickDefaultOrderTaker(workers: TpvClockedInWorker[]): string | null {
  if (workers.length === 0) return null;
  const active = workers.find((w) => w.status === 'active');
  return active?.id || workers[0].id;
}
