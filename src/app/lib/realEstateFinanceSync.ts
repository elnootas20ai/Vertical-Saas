/**
 * Inmobiliaria → Finanzas (Visión / Ingresos-Gastos / EBITDA / Impuestos).
 * Contratos activos y tasaciones completadas generan cobros (idempotente).
 * Si Verifactu está habilitado, emite factura una vez por cobro principal.
 */
import { createFinanceMovementInCouch, listFinanceMovements, updateFinanceMovementInCouch } from './financeApi';
import type { FinanceMovementScope } from './financeScope';
import { getVerifactuSettings, issueVerifactuRecord, listVerifactuRecords } from './verifactuApi';
import {
  reAppraisalRef,
  reContractRentRef,
  reContractSaleRef,
  reGrossToBaseTax,
  resolveContractHonorarios,
} from './realEstateFinanceAmounts';

export {
  reAppraisalRef,
  reContractRentRef,
  reContractSaleRef,
  reGrossToBaseTax,
  resolveContractHonorarios,
} from './realEstateFinanceAmounts';

export type ReContractFinanceLike = {
  _id: string;
  referencia?: string;
  propiedad?: string;
  cliente?: string;
  clienteNif?: string;
  tipo?: string;
  fechaInicio?: string;
  importeMensual?: number;
  importeTotal?: number;
  /** Honorarios de la agencia. Si falta: alquiler → renta mensual; venta → importe total. */
  honorarios?: number;
  estado?: string;
};

export type ReAppraisalFinanceLike = {
  _id: string;
  propiedad?: string;
  solicitante?: string;
  solicitanteNif?: string;
  fecha?: string;
  honorarios?: number;
  estado?: string;
};

function monthKey(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

function round2(n: number): number {
  return Number((Number(n) || 0).toFixed(2));
}

async function maybeIssueVerifactu(opts: {
  businessId: string;
  recipientName: string;
  recipientNif?: string;
  issueDate: string;
  description: string;
  unitPriceGross: number;
  notes: string;
  dedupeKey: string;
}): Promise<boolean> {
  const businessId = String(opts.businessId || '').trim();
  if (!businessId || opts.unitPriceGross <= 0) return false;
  try {
    const settings = await getVerifactuSettings(businessId);
    if (!settings?.enabled) return false;

    const year = Number(opts.issueDate.slice(0, 4)) || new Date().getFullYear();
    const existing = await listVerifactuRecords(businessId, { year });
    if (existing.some((r) => String(r.notes || '').includes(opts.dedupeKey))) {
      return true;
    }

    const pricesIncludeTax = settings.pricesIncludeTax !== false;
    const taxRate = Number(settings.defaultTaxRate) || 21;
    await issueVerifactuRecord(businessId, {
      issueDate: opts.issueDate,
      recipientName: opts.recipientName || 'Cliente',
      recipientNif: opts.recipientNif || undefined,
      notes: `${opts.notes} · ${opts.dedupeKey}`,
      lines: [
        {
          description: opts.description,
          quantity: 1,
          unitPrice: round2(opts.unitPriceGross),
          taxRate,
          discountPercent: 0,
        },
      ],
    });
    // pricesIncludeTax lo aplica el motor servidor; no duplicamos lógica aquí.
    void pricesIncludeTax;
    return true;
  } catch {
    return false;
  }
}

/**
 * Contrato activo → cobro en Finanzas.
 * Alquiler: un cobro por mes en curso. Venta: un cobro único.
 */
export async function ensureRealEstateContractFinance(
  userId: string,
  contract: ReContractFinanceLike,
  scope: FinanceMovementScope = {},
): Promise<{ synced: boolean; verifactu: boolean }> {
  if (!userId || !contract?._id) return { synced: false, verifactu: false };
  if (String(contract.estado || '').toLowerCase() !== 'activo') {
    return { synced: false, verifactu: false };
  }

  const honorarios = resolveContractHonorarios(contract);
  const amounts = reGrossToBaseTax(honorarios, 21);
  if (!amounts) return { synced: false, verifactu: false };

  const tipo = String(contract.tipo || 'alquiler').toLowerCase();
  const prop = String(contract.propiedad || '').trim() || 'Inmueble';
  const cliente = String(contract.cliente || '').trim() || 'Cliente';
  const refLabel = String(contract.referencia || contract._id).trim();
  const dateStr = String(contract.fechaInicio || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const ym = monthKey();

  const reference = tipo === 'venta'
    ? reContractSaleRef(contract._id)
    : reContractRentRef(contract._id, ym);

  const concept = tipo === 'venta'
    ? `Honorarios venta inmobiliaria — ${prop} · ${cliente} (${refLabel})`
    : `Honorarios alquiler inmobiliaria — ${prop} · ${cliente} (${refLabel} · ${ym})`;

  const financeScope: FinanceMovementScope = {
    businessId: scope.businessId || '',
    businessName: scope.businessName || '',
    workCenterId: scope.workCenterId,
    workCenterName: scope.workCenterName,
    salesPointId: scope.salesPointId,
    salesPointName: scope.salesPointName,
  };

  let synced = false;
  try {
    const movements = await listFinanceMovements(userId, financeScope.businessId || undefined);
    const existing = movements.find(
      (m) =>
        m.reference === reference
        || (m.source === 'realestate_contract' && m.sourceRef === `${contract._id}:${tipo === 'venta' ? 'sale' : ym}`),
    );

    const payload = {
      type: 'cobro' as const,
      user_id: userId,
      concept,
      reference,
      category: 'comisiones',
      amountBase: amounts.amountBase,
      taxRate: amounts.taxRate,
      date: tipo === 'venta' ? dateStr : `${ym}-01`,
      companyName: cliente,
      payMethod: 'transferencia',
      notes: `realestate_contract:${contract._id}`,
      status: 'pending' as const,
      source: 'realestate_contract',
      sourceRef: `${contract._id}:${tipo === 'venta' ? 'sale' : ym}`,
      ...financeScope,
    };

    if (existing && existing.status !== 'paid') {
      await updateFinanceMovementInCouch(userId, { ...existing, ...payload });
    } else if (!existing) {
      await createFinanceMovementInCouch(userId, payload);
    }
    synced = true;
  } catch {
    return { synced: false, verifactu: false };
  }

  let verifactu = false;
  if (synced && financeScope.businessId) {
    verifactu = await maybeIssueVerifactu({
      businessId: financeScope.businessId,
      recipientName: cliente,
      recipientNif: contract.clienteNif,
      issueDate: tipo === 'venta' ? dateStr : `${ym}-01`,
      description: concept,
      unitPriceGross: amounts.totalAmount,
      notes: `Contrato ${refLabel}`,
      dedupeKey: `re_contract:${contract._id}:${tipo === 'venta' ? 'sale' : ym}`,
    });
  }

  return { synced, verifactu };
}

/** Tasación completada con honorarios → cobro servicios. */
export async function ensureRealEstateAppraisalFinance(
  userId: string,
  appraisal: ReAppraisalFinanceLike,
  scope: FinanceMovementScope = {},
): Promise<{ synced: boolean; verifactu: boolean }> {
  if (!userId || !appraisal?._id) return { synced: false, verifactu: false };
  if (String(appraisal.estado || '').toLowerCase() !== 'completada') {
    return { synced: false, verifactu: false };
  }
  const honorarios = Number(appraisal.honorarios) || 0;
  const amounts = reGrossToBaseTax(honorarios, 21);
  if (!amounts) return { synced: false, verifactu: false };

  const prop = String(appraisal.propiedad || '').trim() || 'Inmueble';
  const cliente = String(appraisal.solicitante || '').trim() || 'Cliente';
  const dateStr = String(appraisal.fecha || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const reference = reAppraisalRef(appraisal._id);
  const concept = `Honorarios tasación — ${prop} · ${cliente}`;

  const financeScope: FinanceMovementScope = {
    businessId: scope.businessId || '',
    businessName: scope.businessName || '',
    workCenterId: scope.workCenterId,
    workCenterName: scope.workCenterName,
    salesPointId: scope.salesPointId,
    salesPointName: scope.salesPointName,
  };

  let synced = false;
  try {
    const movements = await listFinanceMovements(userId, financeScope.businessId || undefined);
    const existing = movements.find(
      (m) =>
        m.reference === reference
        || (m.source === 'realestate_appraisal' && m.sourceRef === appraisal._id),
    );
    const payload = {
      type: 'cobro' as const,
      user_id: userId,
      concept,
      reference,
      category: 'servicios',
      amountBase: amounts.amountBase,
      taxRate: amounts.taxRate,
      date: dateStr,
      companyName: cliente,
      payMethod: 'transferencia',
      notes: `realestate_appraisal:${appraisal._id}`,
      status: 'pending' as const,
      source: 'realestate_appraisal',
      sourceRef: appraisal._id,
      ...financeScope,
    };
    if (existing && existing.status !== 'paid') {
      await updateFinanceMovementInCouch(userId, { ...existing, ...payload });
    } else if (!existing) {
      await createFinanceMovementInCouch(userId, payload);
    }
    synced = true;
  } catch {
    return { synced: false, verifactu: false };
  }

  let verifactu = false;
  if (synced && financeScope.businessId) {
    verifactu = await maybeIssueVerifactu({
      businessId: financeScope.businessId,
      recipientName: cliente,
      recipientNif: appraisal.solicitanteNif,
      issueDate: dateStr,
      description: concept,
      unitPriceGross: amounts.totalAmount,
      notes: `Tasación ${appraisal._id}`,
      dedupeKey: `re_appraisal:${appraisal._id}`,
    });
  }

  return { synced, verifactu };
}
