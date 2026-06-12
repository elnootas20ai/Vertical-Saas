import { createFinanceMovementInCouch, listFinanceMovements } from './financeApi';
import type { TpvRegisterSession } from './deliveryApi';
import type { FinanceMovementScope } from './financeScope';

function sessionRef(sessionId: string) {
  return `TPV-${sessionId}`;
}

export async function hasTpvSessionFinanceMovement(userId: string, sessionId: string): Promise<boolean> {
  try {
    const movements = await listFinanceMovements(userId);
    return movements.some(
      (m) =>
        m.reference === sessionRef(sessionId) ||
        (m.source === 'tpv_session' && m.sourceRef === sessionId),
    );
  } catch {
    return false;
  }
}

/** Registra el ingreso de un cierre TPV validado en finanzas (una vez por sesión). */
export async function ensureTpvSessionIncome(
  userId: string,
  session: TpvRegisterSession,
  scope: FinanceMovementScope = {},
): Promise<boolean> {
  if (!userId || session.closingValidationStatus !== 'validated') return false;
  if (await hasTpvSessionFinanceMovement(userId, session._id)) return true;

  const totalSales = Number(session.summary?.totalSales ?? 0);
  if (totalSales <= 0) return false;

  const dateStr = (session.closedAt || new Date().toISOString()).slice(0, 10);
  const base = Number((totalSales / 1.21).toFixed(2));
  const pdv = session.pointOfSaleName || 'PDV';
  const terminal = session.terminalName || 'TPV';

  await createFinanceMovementInCouch(userId, {
    type: 'cobro',
    user_id: userId,
    concept: `Cierre caja ${pdv} · ${terminal} (${session.workerName || 'equipo'})`,
    reference: sessionRef(session._id),
    category: 'ventas',
    amountBase: base,
    taxRate: 21,
    date: dateStr,
    payMethod: 'mixto',
    notes: `tpv_session:${session._id}`,
    status: 'paid',
    source: 'tpv_session',
    sourceRef: session._id,
    businessId: scope.businessId,
    businessName: scope.businessName,
    workCenterId: scope.workCenterId,
    workCenterName: scope.workCenterName,
    pointOfSaleId: scope.pointOfSaleId || session.pointOfSaleId,
    pointOfSaleName: scope.pointOfSaleName || session.pointOfSaleName,
  });

  return true;
}
