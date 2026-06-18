import type { AuthUser } from './authApi';
import { listClockins, type ClockinRecord } from './clockinsApi';
import { deriveEffectiveClockinStatus, isClockinPresent } from './clockinStatus';
import { pickPreferredMemberClockin, todayDateStr, clockinValidForRegisterSession } from './clockinHistoryUtils';
import { normalizeClockinUserId } from './clockinUserId';

export {
  clockinBelongsToLocalDay,
  clockinValidForRegisterSession,
} from './clockinHistoryUtils';
export type { TpvClockedInWorker } from './tpvActiveStaff';
export {
  buildTpvActiveStaff,
  clockinIdsMatch,
  getWorkerInitials,
  pickDefaultOrderTaker,
  pickDefaultOrderTakerForSession,
} from './tpvActiveStaff';
import type { TpvClockedInWorker } from './tpvActiveStaff';

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
  if (!storedPdv) return false;
  return (
    storedPdv === pdvId
    || storedPdv === workCenterId
    || storedPdv === `wc:${workCenterId}`
    || storedPdv === `wc:${pdvId}`
    || (workCenterId && storedPdv === pdvId)
  );
}

/** Trabajadores fichados hoy en la tienda (activos o en descanso). */
export async function loadClockedInStoreWorkers(
  businessId: string,
  _ownerUserId: string,
  pdvId: string,
  workCenterId: string,
  sessionOpenedAt?: string | null,
): Promise<TpvClockedInWorker[]> {
  if (!businessId || !pdvId) return [];
  const dayKey = todayDateStr();
  const records = await listClockins(businessId, {
    date: dayKey,
    salesPointId: pdvId,
    workCenterId: workCenterId || undefined,
    storeScope: true,
  });
  const bestRecordByMember = new Map<string, ClockinRecord>();
  for (const r of records) {
    const mid = normalizeClockinUserId(r.member_id);
    if (!mid) continue;
    if (!clockinValidForRegisterSession(r, sessionOpenedAt, dayKey)) continue;
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
