import { displayBrandName } from './brandLabels';

export {
  normalizeReportCategory,
  reportCategoryLabel,
  lineCountsAsBrandSale,
  lineRevenueAmount,
  lineQuantity,
  attributeOrderRevenueByBrand,
  attributeOrderUnitsByBrand,
  accumulateDeliveredOrderLines,
  roundRevenueMap,
  SHARED_REPORT_CATEGORY_KEYS,
} from '../../../shared/delivery/orderLineRevenueSplit.js';

export function brandDisplayName(
  brandId: string,
  labels: Record<string, string> | null | undefined,
): string {
  return displayBrandName(brandId, labels);
}
