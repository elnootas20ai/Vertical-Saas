export const SHARED_REPORT_CATEGORY_KEYS: ReadonlySet<string>;

export function normalizeReportCategory(category: string | null | undefined): string;
export function reportCategoryLabel(categoryKey: string): string;
export function lineCountsAsBrandSale(item: {
  brandIds?: string[];
  category?: string;
}): boolean;
export function lineRevenueAmount(item: {
  total?: number;
  unitPrice?: number;
  quantity?: number;
}): number;
export function accumulateDeliveredOrderLines(
  order: { items?: Array<{ brandIds?: string[]; category?: string; total?: number; unitPrice?: number; quantity?: number }> },
  revenueByBrand: Record<string, number>,
  revenueByCategory: Record<string, number>,
): void;
export function roundRevenueMap(map: Record<string, number>): Record<string, number>;
