import { beforeEach, describe, expect, it, vi } from 'vitest';

const listCatalogItemsRequest = vi.fn(async () => []);
const getLowStockReportRequest = vi.fn(async () => ({ items: [], total: 0 }));
const getSalesForecastRequest = vi.fn(async () => ({ forecast: [], weeksAnalyzed: 4 }));
const getSuggestionsRequest = vi.fn(async () => ({ suggestions: [], bySupplier: [], totalItems: 0 }));
const listPurchaseOrdersRequest = vi.fn(async () => []);
const getPurchaseKpisRequest = vi.fn(async () => ({
  pendingOrders: 0,
  pendingValue: 0,
  monthlySpend: 0,
  lowStockCount: 0,
  criticalProducts: 0,
  overdueDeliveries: 0,
  upcomingDeliveries: [],
  totalOrders: 0,
  receivedThisMonth: 0,
}));

vi.mock('../src/app/lib/deliveryApi.ts', () => ({ listCatalogItemsRequest }));
vi.mock('../src/app/lib/purchaseOrderApi.ts', () => ({
  getLowStockReportRequest,
  getSalesForecastRequest,
  getSuggestionsRequest,
  listPurchaseOrdersRequest,
  getPurchaseKpisRequest,
}));

describe('stock informes business scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('propaga empresa y número de empresas a todas las consultas de compras', async () => {
    const { loadStockInforme } = await import(
      '../src/app/verticals/delivery/informes/loaders/loadStockInformes.ts'
    );
    const ctx = {
      userId: 'user-1',
      businessId: 'biz-1',
      accountBusinessCount: 3,
    };
    const scope = { businessId: 'biz-1', accountBusinessCount: 3 };

    await loadStockInforme('stock-estado', ctx);
    await loadStockInforme('stock-alertas', ctx);
    await loadStockInforme('stock-rotacion', ctx);
    await loadStockInforme('stock-compras-proveedor', ctx);
    await loadStockInforme('stock-punto-pedido', ctx);

    expect(listCatalogItemsRequest).toHaveBeenCalledWith('user-1', 'stock', scope);
    expect(getLowStockReportRequest).toHaveBeenCalledWith('user-1', scope);
    expect(getSalesForecastRequest).toHaveBeenCalledWith('user-1', scope);
    expect(listPurchaseOrdersRequest).toHaveBeenCalledWith('user-1', scope);
    expect(getPurchaseKpisRequest).toHaveBeenCalledWith('user-1', scope);
    expect(getSuggestionsRequest).toHaveBeenCalledWith('user-1', scope);
  });
});
