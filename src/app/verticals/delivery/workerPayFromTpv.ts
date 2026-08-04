/**
 * Pagos a trabajadores desde caja TPV (salida «Pago trabajador»)
 * + consumos a descontar de nómina — resumen del mes en curso.
 */
import type { StaffConsumption, TpvRegisterSession, TpvRegisterTransaction } from '../../lib/deliveryApi';
import { localCalendarDayKey } from '../../lib/tpvCajaScope';

export function isTpvWorkerPayTx(tx: {
  type?: string;
  description?: string;
}): boolean {
  if (String(tx.type || '') !== 'cash_out') return false;
  return /^pago\s*trabajador/i.test(String(tx.description || '').trim());
}

function foldDay(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return localCalendarDayKey(d);
}

/** Nombre embebido en «Pago trabajador · Ana · nota». */
export function workerNameFromPayDescription(description: string): string {
  const raw = String(description || '').trim();
  const m = raw.match(/^pago\s*trabajador\s*[·•\-–—:]\s*(.+)$/i);
  if (!m) return '';
  const rest = m[1].trim();
  if (!rest) return '';
  const parts = rest.split(/\s*[·•]\s*/).map((p) => p.trim()).filter(Boolean);
  return parts[0] || rest;
}

function workerKeyOf(workerId: string, workerName: string): string {
  const id = String(workerId || '').replace(/^account:/, '').trim();
  if (id) return `id:${id}`;
  const name = String(workerName || '').trim().toLowerCase();
  return name ? `name:${name}` : 'unknown';
}

export type WorkerPayRecentItem = {
  id: string;
  date: string;
  amount: number;
  workerId: string;
  workerName: string;
  description: string;
  pointOfSaleName: string;
};

export type WorkerPayMonthRow = {
  workerKey: string;
  workerId: string;
  workerName: string;
  /** € salidos de caja como pago trabajador este mes. */
  paidTotal: number;
  payCount: number;
  /** € consumos con paymentMode payroll_deduction este mes. */
  payrollDeductionTotal: number;
  /**
   * Adelanto neto del mes: pagado en caja − a descontar de nómina.
   * Es lo que “cuenta” hacia el cierre de mes (dinero ya dado vs descuentos).
   */
  netAdvanced: number;
};

export type WorkerPayMonthSummary = {
  monthKey: string;
  paidTotal: number;
  payCount: number;
  payrollDeductionTotal: number;
  netAdvanced: number;
  byWorker: WorkerPayMonthRow[];
  recent: WorkerPayRecentItem[];
};

function emptySummary(monthKey: string): WorkerPayMonthSummary {
  return {
    monthKey,
    paidTotal: 0,
    payCount: 0,
    payrollDeductionTotal: 0,
    netAdvanced: 0,
    byWorker: [],
    recent: [],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Agrega salidas TPV «Pago trabajador» del mes + descuentos de nómina (consumos).
 */
export function buildWorkerPayMonthSummary(
  sessions: TpvRegisterSession[],
  monthKey: string,
  consumptions: StaffConsumption[] = [],
): WorkerPayMonthSummary {
  const mk = String(monthKey || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(mk)) return emptySummary(mk || '');

  type Acc = {
    workerId: string;
    workerName: string;
    paidTotal: number;
    payCount: number;
    payrollDeductionTotal: number;
  };
  const byKey = new Map<string, Acc>();
  const recent: WorkerPayRecentItem[] = [];

  const bump = (workerId: string, workerName: string): Acc => {
    const key = workerKeyOf(workerId, workerName);
    let row = byKey.get(key);
    if (!row) {
      row = {
        workerId: String(workerId || '').trim(),
        workerName: String(workerName || '').trim() || 'Sin nombre',
        paidTotal: 0,
        payCount: 0,
        payrollDeductionTotal: 0,
      };
      byKey.set(key, row);
    } else if (workerName && (!row.workerName || row.workerName === 'Sin nombre')) {
      row.workerName = workerName;
    } else if (workerId && !row.workerId) {
      row.workerId = workerId;
    }
    return row;
  };

  for (const session of sessions || []) {
    const posName = String(session.pointOfSaleName || '').trim();
    const txs: TpvRegisterTransaction[] = Array.isArray(session.transactions)
      ? session.transactions
      : [];
    for (const tx of txs) {
      if (!isTpvWorkerPayTx(tx)) continue;
      const day = foldDay(tx.date);
      if (!day || day.slice(0, 7) !== mk) continue;
      const amount = Number(tx.amount) || 0;
      if (amount <= 0) continue;
      const workerId = String(tx.workerId || '').trim();
      const workerName =
        String(tx.workerName || '').trim() ||
        workerNameFromPayDescription(String(tx.description || '')) ||
        'Sin nombre';
      const row = bump(workerId, workerName);
      row.paidTotal = round2(row.paidTotal + amount);
      row.payCount += 1;
      recent.push({
        id: String(tx.id || `${session._id}:${tx.date}:${amount}`),
        date: String(tx.date || ''),
        amount: round2(amount),
        workerId,
        workerName,
        description: String(tx.description || ''),
        pointOfSaleName: posName,
      });
    }
  }

  for (const c of consumptions || []) {
    if (String(c.paymentMode || '') !== 'payroll_deduction') continue;
    const day = foldDay(c.createdAt);
    if (!day || day.slice(0, 7) !== mk) continue;
    const amount = Number(c.total) || 0;
    if (amount <= 0) continue;
    const workerId = String(c.workerId || '').trim();
    const workerName = String(c.workerName || '').trim() || 'Sin nombre';
    const row = bump(workerId, workerName);
    row.payrollDeductionTotal = round2(row.payrollDeductionTotal + amount);
  }

  const byWorker: WorkerPayMonthRow[] = [...byKey.entries()]
    .map(([workerKey, row]) => ({
      workerKey,
      workerId: row.workerId,
      workerName: row.workerName,
      paidTotal: row.paidTotal,
      payCount: row.payCount,
      payrollDeductionTotal: row.payrollDeductionTotal,
      netAdvanced: round2(row.paidTotal - row.payrollDeductionTotal),
    }))
    .sort((a, b) => b.paidTotal - a.paidTotal || a.workerName.localeCompare(b.workerName, 'es'));

  recent.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const paidTotal = round2(byWorker.reduce((s, r) => s + r.paidTotal, 0));
  const payCount = byWorker.reduce((s, r) => s + r.payCount, 0);
  const payrollDeductionTotal = round2(
    byWorker.reduce((s, r) => s + r.payrollDeductionTotal, 0),
  );

  return {
    monthKey: mk,
    paidTotal,
    payCount,
    payrollDeductionTotal,
    netAdvanced: round2(paidTotal - payrollDeductionTotal),
    byWorker,
    recent: recent.slice(0, 8),
  };
}
