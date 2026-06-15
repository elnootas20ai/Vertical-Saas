import { listUsersRequest, type AuthUser } from './authApi';
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

/** Equipo visible para fichar en TPV tablet / gerente en tienda (sin exigir asignación previa). */
export function filterUsersForStoreClockin(
  users: AuthUser[],
  ownerUserId: string,
  pdvId: string,
  workCenterId: string,
  relaxStoreAssignment: boolean,
): AuthUser[] {
  return users.filter((u) => {
    if (u.status === 'inactive') return false;
    if (relaxStoreAssignment) return true;
    return isMemberAssignedToStore(u, ownerUserId, pdvId, workCenterId);
  });
}

export function clockinRecordMatchesStore(
  record: { sales_point_id?: string },
  pdvId: string,
  workCenterId: string,
): boolean {
  const storedPdv = String(record.sales_point_id || '').trim();
  if (!storedPdv) return true;
  return (
    storedPdv === pdvId
    || storedPdv === workCenterId
    || storedPdv === `wc:${workCenterId}`
    || (workCenterId && storedPdv === `wc:${pdvId}`)
  );
}

async function fetchBusinessUsers(businessId: string): Promise<AuthUser[]> {
  const data = await listUsersRequest(businessId);
  return data.users || [];
}
/** Trabajadores fichados hoy en la tienda (activos o en descanso). */
export async function loadClockedInStoreWorkers(
  businessId: string,
  ownerUserId: string,
  pdvId: string,
  workCenterId: string,
  options?: { relaxStoreAssignment?: boolean },
): Promise<TpvClockedInWorker[]> {
  if (!businessId || !pdvId) return [];
  const today = new Date().toISOString().slice(0, 10);
  const relax = options?.relaxStoreAssignment ?? false;
  const [users, records] = await Promise.all([
    fetchBusinessUsers(businessId),
    listClockins(businessId, {
      date: today,
      salesPointId: pdvId,
      workCenterId: workCenterId || undefined,
      storeScope: true,
    }),
  ]);
  const teamIds = new Set(
    filterUsersForStoreClockin(users, ownerUserId, pdvId, workCenterId, relax)
      .map((u) => u.user_id),
  );
  const byId = new Map<string, TpvClockedInWorker>();
  for (const r of records) {
    if (!teamIds.has(r.member_id)) continue;
    if (r.status !== 'active' && r.status !== 'break') continue;
    if (!clockinRecordMatchesStore(r, pdvId, workCenterId)) continue;
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
