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

/** Burbujas TPV: fichados en tienda + quien abrió caja si aún no aparece en nómina. */
export function buildTpvActiveStaff(
  session: { workerId?: string; workerName?: string } | null | undefined,
  storeClockins: TpvClockedInWorker[],
): TpvClockedInWorker[] {
  const list = [...storeClockins];
  const openerId = normalizeClockinUserId(session?.workerId);
  const openerName = String(session?.workerName || '').trim();
  if (openerId && openerName && !list.some((w) => clockinIdsMatch(w.id, openerId))) {
    list.push({ id: openerId, name: openerName, status: 'active' });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function pickDefaultOrderTaker(workers: TpvClockedInWorker[]): string | null {
  if (workers.length === 0) return null;
  const active = workers.find((w) => w.status === 'active');
  return active?.id || workers[0].id;
}

/** Quién atiende por defecto: fichado activo, o quien abrió caja si no hay fichajes. */
export function pickDefaultOrderTakerForSession(
  session: { workerId?: string; workerName?: string } | null | undefined,
  storeClockins: TpvClockedInWorker[],
): string | null {
  const fromClockins = pickDefaultOrderTaker(storeClockins);
  if (fromClockins) return fromClockins;
  const openerId = normalizeClockinUserId(session?.workerId);
  if (openerId && String(session?.workerName || '').trim()) return openerId;
  return null;
}
