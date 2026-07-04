import { createFinanceMovementInCouch, listFinanceMovements, updateFinanceMovementInCouch } from './financeApi';
import type { FinanceMovementScope } from './financeScope';
import type { WorkCenter } from './workCentersApi';

function currentMonthKey(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

function rentDueDateForMonth(monthKey: string, contractStartDate?: string): string {
  const day = contractStartDate ? new Date(contractStartDate).getDate() : 1;
  const safeDay = Number.isFinite(day) && day >= 1 && day <= 28 ? day : 1;
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, safeDay).toISOString().slice(0, 10);
}

/** Renta mensual con IVA 21% incluido en el importe indicado. */
export function rentAmountsFromMonthlyTotal(monthlyTotal: number) {
  const gross = Number(monthlyTotal) || 0;
  if (gross <= 0) return null;
  const amountBase = Number((gross / 1.21).toFixed(2));
  return { amountBase, taxRate: 21, totalAmount: gross };
}

export async function ensureRentFinanceFromWorkCenter(
  userId: string,
  workCenter: WorkCenter,
  scope: FinanceMovementScope = {},
): Promise<{ monthlySynced: boolean; depositSynced: boolean }> {
  if (!userId || workCenter.ownership !== 'alquiler') {
    return { monthlySynced: false, depositSynced: false };
  }

  const monthly = Number(workCenter.contract?.monthlyPrice || 0);
  const deposit = Number(workCenter.contract?.deposit || 0);
  const monthKey = currentMonthKey();
  const landlord = String(workCenter.contract?.landlord || '').trim();
  const financeScope: FinanceMovementScope = {
    businessId: scope.businessId || workCenter.businessId || '',
    businessName: scope.businessName || '',
    workCenterId: workCenter._id,
    workCenterName: workCenter.name,
  };

  let monthlySynced = false;
  let depositSynced = false;

  try {
    const movements = await listFinanceMovements(userId, financeScope.businessId || undefined);
    const monthlyRef = `RENT-${workCenter._id}-${monthKey}`;
    const amounts = rentAmountsFromMonthlyTotal(monthly);

    if (amounts) {
      const existing = movements.find((m) => m.reference === monthlyRef && m.type === 'pago');
      const payload = {
        type: 'pago' as const,
        user_id: userId,
        concept: `Alquiler ${workCenter.name}${landlord ? ` — ${landlord}` : ''} (${monthKey})`,
        reference: monthlyRef,
        category: 'alquiler',
        amountBase: amounts.amountBase,
        taxRate: amounts.taxRate,
        date: `${monthKey}-01`,
        dueDate: rentDueDateForMonth(monthKey, workCenter.contract?.startDate),
        companyName: landlord,
        payMethod: 'transferencia',
        notes: `Contrato local ${workCenter._id}`,
        status: 'pending' as const,
        source: 'rent_contract',
        sourceRef: workCenter._id,
        ...financeScope,
      };

      if (existing && existing.status !== 'paid') {
        await updateFinanceMovementInCouch(userId, { ...existing, ...payload });
      } else if (!existing) {
        await createFinanceMovementInCouch(userId, payload);
      }
      monthlySynced = true;
    }

    if (deposit > 0) {
      const depRef = `RENT-DEP-${workCenter._id}`;
      const existingDep = movements.find((m) => m.reference === depRef);
      if (!existingDep) {
        const depAmounts = rentAmountsFromMonthlyTotal(deposit) || {
          amountBase: deposit,
          taxRate: 0,
          totalAmount: deposit,
        };
        await createFinanceMovementInCouch(userId, {
          type: 'pago',
          user_id: userId,
          concept: `Fianza alquiler ${workCenter.name}`,
          reference: depRef,
          category: 'alquiler',
          amountBase: depAmounts.amountBase,
          taxRate: depAmounts.taxRate,
          date: workCenter.contract?.startDate || new Date().toISOString().slice(0, 10),
          companyName: landlord,
          payMethod: 'transferencia',
          notes: `Fianza contrato ${workCenter._id}`,
          status: 'pending',
          source: 'rent_contract',
          sourceRef: `${workCenter._id}:deposit`,
          ...financeScope,
        });
        depositSynced = true;
      }
    }
  } catch {
    // finanzas opcional; el local ya quedó guardado
  }

  return { monthlySynced, depositSynced };
}
