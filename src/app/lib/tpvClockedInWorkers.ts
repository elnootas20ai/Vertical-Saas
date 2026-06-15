import { listUsersRequest, type AuthUser } from './authApi';
import { listClockins, type ClockinRecord } from './clockinsApi';
import { deriveEffectiveClockinStatus, isClockinPresent } from './clockinStatus';
import { pickPreferredMemberClockin } from './clockinHistoryUtils';
import { normalizeClockinUserId } from './clockinUserId';

export interface TpvClockedInWorker {
  id: string;
  name: string;
  status: 'active' | 'break';
}

export function clockinIdsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeClockinUserId(a);
  const right = normalizeClockinUserId(b);
  return Boolean(left && right && left === right);
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
  const isOwner = clockinIdsMatch(ownerUserId, member.user_id);
  if (isOwner && !ref) return true;
  const role = String(member.role || '').trim();
  if ((role === 'Admin' || role === 'Gerente') && !ref) return true;
  if (!ref) return false;
  return ref === pdvId || ref === workCenterId || ref === `wc:${workCenterId}` || ref === `wc:${pdvId}`;
}

/** Solo trabajadores asignados a este PDV/centro (y owner/admin sin tienda fija). */
export function filterUsersForStoreClockin(
  users: AuthUser[],
  ownerUserId: string,
  pdvId: string,
  workCenterId: string,
): AuthUser[] {
  return users.filter((u) => {
    if (u.status === 'inactive') return false;
    return isMemberAssignedToStore(u, ownerUserId, pdvId, workCenterId);
  });
}

export function clockinRecordMatchesStore(
  record: { sales_point_id?: string },
  pdvId: string,
  workCenterId: string,
): boolean {
  const storedPdv = String(record.sales_point_id || '').trim();
  // Sin tienda explícita no cuenta en el TPV de un PDV concreto (evita mezclar fichajes).
  if (!storedPdv) return false;
  return (
    storedPdv === pdvId
    || storedPdv === workCenterId
    || storedPdv === `wc:${workCenterId}`
    || storedPdv === `wc:${pdvId}`
    || (workCenterId && storedPdv === pdvId)
  );
}

/** Equipo operativo en TPV: quien abrió caja + fichajes de ESTA tienda (sin bloquear por nómina global). */
export function buildTpvActiveStaff(
  session: { workerId?: string; workerName?: string } | null | undefined,
  storeClockins: TpvClockedInWorker[],
): TpvClockedInWorker[] {
  const byId = new Map<string, TpvClockedInWorker>();
  const openerId = normalizeClockinUserId(session?.workerId);
  const openerName = String(session?.workerName || '').trim();
  if (openerId && openerName) {
    byId.set(openerId, { id: openerId, name: openerName, status: 'active' });
  }
  for (const worker of storeClockins) {
    byId.set(worker.id, worker);
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
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
): Promise<TpvClockedInWorker[]> {
  if (!businessId || !pdvId) return [];
  const today = new Date().toISOString().slice(0, 10);
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
    filterUsersForStoreClockin(users, ownerUserId, pdvId, workCenterId)
      .map((u) => normalizeClockinUserId(u.user_id))
      .filter(Boolean),
  );
  const bestRecordByMember = new Map<string, ClockinRecord>();
  for (const r of records) {
    const mid = normalizeClockinUserId(r.member_id);
    if (!mid || !teamIds.has(mid)) continue;
    if (!clockinRecordMatchesStore(r, pdvId, workCenterId)) continue;
    const prev = bestRecordByMember.get(mid);
    bestRecordByMember.set(mid, prev ? pickPreferredMemberClockin(prev, r) : r);
  }
  const byId = new Map<string, TpvClockedInWorker>();
  for (const [mid, r] of bestRecordByMember) {
    const effective = deriveEffectiveClockinStatus(r);
    if (!isClockinPresent(effective)) continue;
    byId.set(mid, {
      id: mid,
      name: r.member_name || 'Trabajador',
      status: effective === 'break' ? 'break' : 'active',
    });
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function pickDefaultOrderTaker(workers: TpvClockedInWorker[]): string | null {
  if (workers.length === 0) return null;
  const active = workers.find((w) => w.status === 'active');
  return active?.id || workers[0].id;
}
