import { describe, expect, it } from 'vitest';
import {
  STOCK_ANALYTICS_KPI_IDS,
  STOCK_ANALYTICS_BLOCK_IDS,
} from '../services/stockAnalyticsService.js';

describe('stockAnalyticsService meta', () => {
  it('expone KPIs esperados para carga progresiva', () => {
    expect(STOCK_ANALYTICS_KPI_IDS).toEqual([
      'food_cost_pct',
      'gross_margin',
      'waste_on_sales_pct',
      'inventory_variance',
      'recipe_coverage',
      'operating_margin',
    ]);
  });

  it('expone bloques de informe por fases', () => {
    expect(STOCK_ANALYTICS_BLOCK_IDS).toContain('waste_overview');
    expect(STOCK_ANALYTICS_BLOCK_IDS).toContain('waste_by_ingredient');
    expect(STOCK_ANALYTICS_BLOCK_IDS).toContain('inventory_variance_table');
    expect(STOCK_ANALYTICS_BLOCK_IDS).toContain('escandallo_products');
    expect(STOCK_ANALYTICS_BLOCK_IDS).toContain('pnl_summary');
    expect(STOCK_ANALYTICS_BLOCK_IDS).toContain('period_comparison');
    expect(STOCK_ANALYTICS_BLOCK_IDS).toContain('weekly_evolution');
    expect(STOCK_ANALYTICS_BLOCK_IDS).toContain('pdv_pnl');
  });
});
