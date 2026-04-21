import { createFinanceMovementInCouch, listFinanceMovements } from './financeApi';
import type { SaleRecord } from './salesTypes';

function refKey(saleId: string) {
  return `VENTA-${saleId}`;
}

export async function hasSaleIncomeMovement(userId: string, saleId: string): Promise<boolean> {
  try {
    const movements = await listFinanceMovements(userId);
    return movements.some(
      (m) =>
        (m.source === 'sale' && m.sourceRef === saleId) ||
        m.reference === refKey(saleId) ||
        m.notes?.includes(`sale:${saleId}`),
    );
  } catch {
    return false;
  }
}

export async function ensureSaleIncomeFromClosure(userId: string, sale: SaleRecord): Promise<boolean> {
  if (!userId || sale.financeIncomeCreated) {
    if (await hasSaleIncomeMovement(userId, sale.id)) return true;
  }
  if (await hasSaleIncomeMovement(userId, sale.id)) return true;

  const base = Number((sale.totalPrice / 1.21).toFixed(2));
  const dateStr = (sale.closureData?.closedAt || new Date().toISOString()).slice(0, 10);

  await createFinanceMovementInCouch(userId, {
    type: 'cobro',
    user_id: userId,
    concept: `Venta vehículo — ${sale.vehicleName} (${sale.vehiclePlate}) · ${sale.clientName}`,
    reference: refKey(sale.id),
    category: 'venta_vehiculo',
    amountBase: base,
    taxRate: 21,
    date: dateStr,
    payMethod: sale.paymentMethod || 'transferencia',
    notes: sale.closureData?.closureNotes || `sale:${sale.id}`,
    status: 'paid',
    source: 'sale',
    sourceRef: sale.id,
  });

  return true;
}

export async function ensureCommissionExpense(userId: string, sale: SaleRecord): Promise<void> {
  const amount = sale.closureData?.commissionAmount;
  if (!amount || amount <= 0 || !userId) return;

  const ref = `COM-${sale.id}`;
  const movements = await listFinanceMovements(userId);
  if (movements.some((m) => m.reference === ref)) return;

  const dateStr = (sale.closureData?.closedAt || new Date().toISOString()).slice(0, 10);

  await createFinanceMovementInCouch(userId, {
    type: 'pago',
    user_id: userId,
    concept: `Comisión venta — ${sale.vehicleName} → ${sale.closureData?.commissionAgent || '—'}`,
    reference: ref,
    category: 'comisiones',
    amountBase: amount,
    taxRate: 0,
    date: dateStr,
    payMethod: 'transferencia',
    notes: `sale:${sale.id}`,
    status: 'paid',
    source: 'sale',
    sourceRef: sale.id,
  });
}
