export const DEFAULT_SHARED_CATEGORY_KEYS: string[];
export const SHARED_REPORT_CATEGORY_KEYS: ReadonlySet<string>;

export type BrandRevenueSplitOptions = {
  monoBrandTakesAll?: boolean;
  /** majority = lo compartido entero a la marca dominante del ticket */
  sharedSplitMode?: 'majority' | 'by_units' | 'equal';
};

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
export function lineQuantity(item: { quantity?: number }): number;

export function normalizeSharedSplitMode(raw: unknown): 'majority';

export function pickMajorityBrandId(
  presentBrandIds: string[],
  brandedUnits: Record<string, number> | null | undefined,
  brandedRevenue?: Record<string, number> | null,
): string;

export function splitSharedAmount(
  presentBrandIds: string[],
  brandedUnits: Record<string, number> | null | undefined,
  shared: number,
  mode?: 'majority' | 'by_units' | 'equal',
  brandedRevenue?: Record<string, number> | null,
): Record<string, number>;

export function attributeOrderRevenueByBrand(
  order: {
    items?: Array<{
      brandIds?: string[];
      category?: string;
      total?: number;
      unitPrice?: number;
      quantity?: number;
    }>;
  },
  options?: BrandRevenueSplitOptions,
): {
  byBrand: Record<string, number>;
  unbranded: number;
  byCategory: Record<string, number>;
  presentBrandIds: string[];
};

export function attributeOrderUnitsByBrand(
  order: {
    items?: Array<{
      brandIds?: string[];
      quantity?: number;
      total?: number;
      unitPrice?: number;
    }>;
  },
  options?: BrandRevenueSplitOptions,
): Record<string, number>;

export function accumulateDeliveredOrderLines(
  order: {
    items?: Array<{
      brandIds?: string[];
      category?: string;
      total?: number;
      unitPrice?: number;
      quantity?: number;
    }>;
  },
  revenueByBrand: Record<string, number>,
  revenueByCategory: Record<string, number>,
  options?: BrandRevenueSplitOptions,
): void;
export function roundRevenueMap(map: Record<string, number>): Record<string, number>;
