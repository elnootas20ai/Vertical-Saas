import { normalizeBusinessScopeId } from './deliverySetup';
import { filterPurchaseDocsByBusinessScope, purchaseListQuery } from './purchaseBusinessScope';
import type { DiningTable } from './salaApi';

export type SalaBusinessScopeOptions = {
  businessId?: string | null;
  accountBusinessCount?: number;
};

/** Mesas de la empresa activa (legacy sin businessId solo con una empresa). */
export function filterSalaTablesByBusinessScope(
  tables: DiningTable[],
  businessId?: string | null,
  accountBusinessCount = 1,
): DiningTable[] {
  return filterPurchaseDocsByBusinessScope(tables, businessId, accountBusinessCount);
}

export function salaTablesListQuery(opts?: SalaBusinessScopeOptions): string {
  return purchaseListQuery(opts?.businessId, opts?.accountBusinessCount);
}

export function normalizeSalaTableBusinessId(value: string | null | undefined): string {
  return normalizeBusinessScopeId(value);
}
