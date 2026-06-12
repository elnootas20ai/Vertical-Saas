import type { FinanceMovementRecord } from './financeTypes';

/** Etiquetas de ámbito en movimientos financieros (empresa → tienda → PDV). */
export interface FinanceMovementScope {
  businessId?: string;
  businessName?: string;
  workCenterId?: string;
  workCenterName?: string;
  pointOfSaleId?: string;
  pointOfSaleName?: string;
  brandId?: string;
  brandName?: string;
}

export type EbitdaScopeFilter =
  | { level: 'all' }
  | { level: 'business'; businessId: string }
  | { level: 'store'; businessId?: string; workCenterId: string };

export function movementMatchesEbitdaScope(
  movement: FinanceMovementRecord,
  scope: EbitdaScopeFilter,
): boolean {
  if (scope.level === 'all') return true;
  if (scope.level === 'business') {
    const bid = String(movement.businessId || '').trim();
    if (!bid) return false;
    return bid === scope.businessId;
  }
  const wcId = String(movement.workCenterId || '').trim();
  if (!wcId) return false;
  if (wcId !== scope.workCenterId) return false;
  if (scope.businessId) {
    const bid = String(movement.businessId || '').trim();
    if (bid && bid !== scope.businessId) return false;
  }
  return true;
}

export function filterMovementsByEbitdaScope(
  movements: FinanceMovementRecord[],
  scope: EbitdaScopeFilter,
): FinanceMovementRecord[] {
  return movements.filter((m) => movementMatchesEbitdaScope(m, scope));
}

export function scopeFieldsFromMovement(movement: FinanceMovementRecord): FinanceMovementScope {
  return {
    businessId: movement.businessId,
    businessName: movement.businessName,
    workCenterId: movement.workCenterId,
    workCenterName: movement.workCenterName,
    pointOfSaleId: movement.pointOfSaleId,
    pointOfSaleName: movement.pointOfSaleName,
    brandId: movement.brandId,
    brandName: movement.brandName,
  };
}
