import type { CatalogItem, DeliveryOrderItem } from './deliveryApi';
import type { BrandBillingTaxPolicy } from './brandBillingConfig';

export {
  VALID_ES_VAT_RATES,
  LEGACY_ES_FINANCE_TAX_RATE,
  DEFAULT_ES_TAX_POLICY,
  normalizeEsTaxRate,
  normalizeEsTaxPolicy,
  inferTaxRateFromCategory,
  resolveCatalogItemTaxRate,
  calcLinesTaxBreakdown,
  calcOrderFinanceTaxAmounts,
  calcRefundFinanceTaxAmounts,
  saleLineOptsFromTaxPolicy,
} from '../../../shared/tax/spainVat.js';

import {
  VALID_ES_VAT_RATES as VAT_RATES,
  resolveCatalogItemTaxRate as resolveCatalogItemTaxRateCore,
} from '../../../shared/tax/spainVat.js';
import type { BrandBillingTaxPolicy as Policy } from './brandBillingConfig';

/**
 * Copia taxRate a la línea solo si el producto del catálogo lo tiene definido
 * y la política está activa. Si no, deja la línea igual (cliente sin cambios).
 */
export function withOrderLineTaxRate(
  line: DeliveryOrderItem,
  catalogItem: Pick<CatalogItem, 'taxRate' | 'category'> | null | undefined,
  policy?: Policy | null,
): DeliveryOrderItem {
  if (!policy || policy.enabled !== true) return line;
  const explicit = Number(catalogItem?.taxRate);
  if (!(Number.isFinite(explicit) && VAT_RATES.includes(explicit))) return line;
  const taxRate = resolveCatalogItemTaxRateCore(
    {
      taxRate: catalogItem?.taxRate,
      category: line.category || catalogItem?.category,
    },
    policy,
  );
  return { ...line, taxRate };
}
