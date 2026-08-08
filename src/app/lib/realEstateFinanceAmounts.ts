/** Helpers puros (sin API) para sync inmobiliaria → Finanzas. */

export function reGrossToBaseTax(gross: number, taxRate = 21) {
  const total = Number((Number(gross) || 0).toFixed(2));
  if (total <= 0) return null;
  if (taxRate <= 0) return { amountBase: total, taxRate: 0, totalAmount: total };
  const amountBase = Number((total / (1 + taxRate / 100)).toFixed(2));
  return { amountBase, taxRate, totalAmount: total };
}

export function resolveContractHonorarios(contract: {
  honorarios?: number;
  tipo?: string;
  importeMensual?: number;
  importeTotal?: number;
}): number {
  const explicit = Number(contract.honorarios);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const tipo = String(contract.tipo || '').toLowerCase();
  if (tipo === 'alquiler') return Number(contract.importeMensual) || 0;
  return Number(contract.importeTotal) || 0;
}

export function reContractSaleRef(contractId: string): string {
  return `RE-SALE-${contractId}`;
}

export function reContractRentRef(contractId: string, ym: string): string {
  return `RE-RENT-${contractId}-${ym}`;
}

export function reAppraisalRef(appraisalId: string): string {
  return `RE-APP-${appraisalId}`;
}
