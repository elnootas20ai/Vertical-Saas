import {
  listCatalogItemsRequest,
} from '../../../../lib/deliveryApi';
import { listRecipesRequest } from '../../../../lib/recipeApi';
import {
  getLowStockReportRequest,
  getSalesForecastRequest,
  getSuggestionsRequest,
  listPurchaseOrdersRequest,
  getPurchaseKpisRequest,
} from '../../../../lib/purchaseOrderApi';
import { getWasteSummaryRequest, listWasteRequest } from '../../../../lib/wasteApi';
import { inventoryStatus, inventoryStatusLabel, computeInventoryStats } from '../../../../lib/inventoryUtils';
import { getTopSuppliersBySpend } from '../../../../lib/purchasesFinanceIntegration';
import { listFinanceMovements } from '../../../../lib/financeApi';
import type { DeliveryInformeId } from '../deliveryInformesCatalog';
import {
  type InformeBuildResult,
  type InformeLoadCtx,
  euro,
  round2,
  lastDaysRange,
  emptyResult,
} from './informeTypes';

export async function loadStockInforme(
  id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult | null> {
  if (!id.startsWith('stock-')) return null;
  ctx.onProgress?.(20, 'Cargando stock…');

  if (id === 'stock-estado') {
    const items = await listCatalogItemsRequest(ctx.userId, 'stock');
    const stats = computeInventoryStats(items);
    const rows = items.map((it) => ({
      Articulo: it.name || it.id,
      Stock: Number(it.stockQuantity || 0),
      Minimo: Number(it.minStock || 0),
      Estado: inventoryStatusLabel(inventoryStatus(it)),
      CosteUnit: round2(Number(it.costPrice || 0)),
      Valor: round2(Number(it.stockQuantity || 0) * Number(it.costPrice || 0)),
    }));
    return {
      rows,
      summary: `Stock: ${stats.total} arts · OK ${stats.ok} · bajo ${stats.low} · sin stock ${stats.out} · valor ~${euro(stats.estimatedValue)} €.`,
    };
  }

  if (id === 'stock-alertas') {
    const low = await getLowStockReportRequest(ctx.userId);
    const rows = (low.items || []).map((it: any) => ({
      Articulo: it.name || it.itemName || it.id,
      Stock: it.stockQuantity ?? it.qty ?? 0,
      Minimo: it.minStock ?? it.min ?? 0,
      Deficit: it.deficit ?? Math.max(0, Number(it.minStock || 0) - Number(it.stockQuantity || 0)),
      Proveedor: it.supplierName || '',
    }));
    return {
      rows,
      summary: `Alertas de rotura / bajo mínimo: ${rows.length} artículos.`,
    };
  }

  if (id === 'stock-rotacion') {
    const forecast = await getSalesForecastRequest(ctx.userId);
    const rows = (forecast.forecast || []).map((f: any) => ({
      Articulo: f.name || f.itemName || f.id,
      MediaSemanal: round2(f.weeklyAvg || f.avgWeekly || 0),
      SemanasStock: round2(f.weeksOfStock || 0),
      StockActual: f.stockQuantity ?? f.stock ?? '',
    }));
    return {
      rows,
      summary: `Rotación aproximada (semanas de stock). Análisis ${forecast.weeksAnalyzed || '—'} semanas.`,
    };
  }

  if (id === 'stock-compras-proveedor') {
    const orders = await listPurchaseOrdersRequest(ctx.userId);
    const bySup = new Map<string, { count: number; total: number }>();
    for (const o of orders) {
      const name = (o as any).supplierName || (o as any).supplierId || 'Sin proveedor';
      const prev = bySup.get(name) || { count: 0, total: 0 };
      prev.count += 1;
      prev.total += Number((o as any).totalAmount || (o as any).total || 0);
      bySup.set(name, prev);
    }
    const rows = [...bySup.entries()]
      .map(([Proveedor, v]) => ({
        Proveedor,
        Pedidos: v.count,
        Importe: round2(v.total),
      }))
      .sort((a, b) => b.Importe - a.Importe);
    let kpisHint = '';
    try {
      const kpis = await getPurchaseKpisRequest(ctx.userId);
      kpisHint = ` KPIs compras disponibles.`;
      void kpis;
    } catch { /* optional */ }
    return {
      rows,
      summary: `Compras por proveedor (${orders.length} pedidos).${kpisHint}`,
    };
  }

  if (id === 'stock-dependencia-proveedores') {
    ctx.onProgress?.(40, 'Analizando dependencia…');
    const movements = await listFinanceMovements(ctx.userId, ctx.businessId);
    const top = getTopSuppliersBySpend(movements, 15);
    const totalSpend = top.reduce((s, t) => s + Number(t.totalSpend || 0), 0) || 1;
    const rows = top.map((t, i) => ({
      Posicion: i + 1,
      Proveedor: t.supplierName,
      Importe: round2(t.totalSpend),
      Movimientos: t.movementCount,
      Pct: round2((t.totalSpend / totalSpend) * 100),
      UltimaFecha: t.lastDate || '',
    }));
    const top3 = rows.slice(0, 3).reduce((s, r) => s + Number(r.Pct || 0), 0);
    return {
      rows,
      summary: `Dependencia proveedores (pagos finanzas): top 3 ≈ ${top3.toFixed(1)}%.`,
    };
  }

  if (id === 'stock-punto-pedido') {
    const sug = await getSuggestionsRequest(ctx.userId);
    const items = (sug as any).items || (sug as any).suggestions || [];
    const rows = items.map((it: any) => ({
      Articulo: it.name || it.itemName || '',
      Stock: it.stockQuantity ?? it.stock ?? '',
      Sugerido: it.suggestedQty ?? it.qty ?? it.reorderQuantity ?? '',
      SemanasStock: it.weeksOfStock ?? '',
      Proveedor: it.supplierName || '',
    }));
    return {
      rows,
      summary: `Punto de pedido / sugerencias de compra: ${rows.length} líneas.`,
    };
  }

  if (id === 'stock-escandallo') {
    const recipes = await listRecipesRequest(ctx.userId);
    if (!recipes.length) return emptyResult('No hay escandallos/recetas registrados.');
    const rows = recipes.map((r: any) => ({
      Receta: r.name || r.productName || r.id,
      Coste: round2(r.totalCost || r.cost || r.unitCost || 0),
      PVP: round2(r.salePrice || r.pvp || 0),
      MargenPct: round2(r.marginPct || r.foodCostPercent || 0),
      Porciones: r.portions || r.yield || '',
      Activa: r.active === false ? 'No' : 'Sí',
    }));
    return {
      rows,
      summary: `Escandallos: ${rows.length} recetas con coste/margen.`,
    };
  }

  if (id === 'stock-reductores') {
    const { from, to } = lastDaysRange(30);
    try {
      const summary = await getWasteSummaryRequest(ctx.userId, { dateFrom: from, dateTo: to });
      const list = await listWasteRequest(ctx.userId, { dateFrom: from, dateTo: to } as any);
      const rows = (list || []).map((w: any) => ({
        Fecha: w.date || w.createdAt || '',
        Articulo: w.itemName || w.name || '',
        Cantidad: w.quantity ?? w.qty ?? '',
        Coste: round2(w.cost || w.totalCost || 0),
        Motivo: w.reason || w.motive || '',
      }));
      const totalCost = rows.reduce((s, r) => s + Number(r.Coste), 0);
      return {
        rows,
        summary: `Mermas/reductores 30d: ${rows.length} regs · coste ${euro(totalCost)} €${summary ? ` · resumen cargado` : ''}.`,
      };
    } catch {
      return emptyResult('No hay datos de mermas/reductores en el periodo.');
    }
  }

  return null;
}
