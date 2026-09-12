import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  listCatalogItemsRequest,
  type CatalogItem,
} from '../../../lib/deliveryApi';
import {
  productCostingStatus,
  resolveProductUnitCost,
} from '../../../lib/catalogCosting';
import { filterCatalogItemsForBusinessScope } from '../../../lib/catalogBusinessScope';
import type { StoreIngredient } from '../../../lib/catalogCustomization';
import { formatMoneyEs, formatNumberEs } from '../../../lib/formatNumberEs';
import { localCalendarDayKey } from '../../../lib/tpvCajaScope';
import type { DiningOrder } from '../../../lib/salaApi';
import type { Brand } from '../../../lib/brandsApi';
import { filterBilledOrders } from '../restaurantReports';

type Period = 'week' | 'month';

type Props = {
  orders: DiningOrder[];
  userId: string;
  businessId: string;
  brands: Brand[];
  accountBusinessCount?: number;
};

type MarginRow = {
  key: string;
  name: string;
  units: number;
  revenue: number;
  cost: number | null;
  margin: number | null;
  marginPct: number | null;
};

function fold(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function dayKey(order: DiningOrder): string {
  return String(order.paidAt || order.closedAt || order.createdAt || '').slice(0, 10);
}

function inPeriod(order: DiningOrder, period: Period): boolean {
  const raw = dayKey(order);
  if (!raw) return false;
  const current = localCalendarDayKey();
  if (period === 'month') return raw.slice(0, 7) === current.slice(0, 7);
  const currentMs = new Date(`${current}T12:00:00`).getTime();
  const rowMs = new Date(`${raw}T12:00:00`).getTime();
  return Number.isFinite(rowMs) && rowMs >= currentMs - 6 * 86_400_000 && rowMs <= currentMs;
}

export function RestaurantProductMarginPanel({
  orders,
  userId,
  businessId,
  brands,
  accountBusinessCount = 1,
}: Props) {
  const [period, setPeriod] = useState<Period>('week');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void listCatalogItemsRequest(userId)
      .then((items) => {
        if (!cancelled) setCatalog(items || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el escandallo');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, userId]);

  const result = useMemo(() => {
    const scopedCatalog = filterCatalogItemsForBusinessScope(catalog, businessId, brands, {
      accountBusinessCount,
      activeBusinessType: 'restaurant',
    });
    const products = scopedCatalog.filter((item) => item.module !== 'stock');
    const stock = scopedCatalog.filter((item) => item.module === 'stock');
    const byProductId = new Map<string, CatalogItem>();
    const byProductName = new Map<string, CatalogItem>();
    for (const item of products) {
      const id = String(item.id || item._id || '').trim();
      if (id) byProductId.set(id, item);
      const name = fold(item.name);
      if (name && !byProductName.has(name)) byProductName.set(name, item);
    }

    const ingredients = new Map<string, StoreIngredient>();
    const stockByStoreIngredientId = new Map<
      string,
      Pick<CatalogItem, 'costPrice' | 'customFields'> & { lastPurchasePrice?: number }
    >();
    const inventoryCostByCatalogId = new Map<string, number>();
    for (const item of stock) {
      const id = String(item.id || item._id || '').trim();
      const ingredientId = String(item.customFields?.storeIngredientId || id).trim();
      const unitCost = Number(item.lastPurchasePrice ?? item.costPrice) || 0;
      if (id) inventoryCostByCatalogId.set(id, unitCost);
      if (ingredientId) {
        stockByStoreIngredientId.set(ingredientId, item);
        ingredients.set(ingredientId, {
          id: ingredientId,
          name: item.name,
          baseCost: unitCost,
          unit: String(item.unit || 'ud'),
        });
      }
    }

    const rows = new Map<string, MarginRow>();
    const billed = filterBilledOrders(orders, businessId).filter((order) => inPeriod(order, period));
    for (const order of billed) {
      for (const comanda of order.comandas || []) {
        if (comanda.status === 'cancelled') continue;
        for (const line of comanda.items || []) {
          if (line.status === 'cancelled') continue;
          const quantity = Number(line.quantity) || 0;
          if (quantity <= 0) continue;
          const key = String(line.productId || fold(line.name));
          const product =
            byProductId.get(String(line.productId || '').trim())
            || byProductName.get(fold(line.name))
            || null;
          const revenue = quantity * (Number(line.price) || 0);
          const status = product ? productCostingStatus(product) : 'none';
          const unitCost = product && status !== 'none'
            ? resolveProductUnitCost(
                product,
                ingredients,
                brands,
                inventoryCostByCatalogId,
                { stockByStoreIngredientId },
              )
            : null;
          const cost = unitCost != null && Number.isFinite(unitCost) ? unitCost * quantity : null;
          const previous = rows.get(key) || {
            key,
            name: line.name || product?.name || 'Producto',
            units: 0,
            revenue: 0,
            cost: cost == null ? null : 0,
            margin: null,
            marginPct: null,
          };
          previous.units += quantity;
          previous.revenue += revenue;
          previous.cost = previous.cost != null && cost != null ? previous.cost + cost : null;
          rows.set(key, previous);
        }
      }
    }

    const ranked = [...rows.values()]
      .map((row) => {
        const margin = row.cost == null ? null : row.revenue - row.cost;
        return {
          ...row,
          margin,
          marginPct: margin != null && row.revenue > 0 ? (margin / row.revenue) * 100 : null,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
    return {
      rows: ranked.slice(0, 12),
      missing: ranked.filter((row) => row.cost == null).length,
    };
  }, [accountBusinessCount, businessId, brands, catalog, orders, period]);

  if (loading) {
    return (
      <div className="flex min-h-28 items-center justify-center text-sm text-stone-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Calculando margen real…
      </div>
    );
  }

  if (error) {
    return <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-xl bg-stone-100 p-1 dark:bg-stone-800">
          {(['week', 'month'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                period === value
                  ? 'bg-white text-blue-700 shadow-sm dark:bg-stone-700 dark:text-blue-300'
                  : 'text-stone-500'
              }`}
            >
              {value === 'week' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
        {result.missing > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {result.missing} sin escandallo
          </span>
        ) : null}
      </div>

      {result.rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-400">Sin productos cobrados en el periodo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="text-left text-stone-500">
              <tr>
                <th className="pb-2 font-semibold">Producto</th>
                <th className="pb-2 text-right font-semibold">Uds.</th>
                <th className="pb-2 text-right font-semibold">Ventas</th>
                <th className="pb-2 text-right font-semibold">Coste</th>
                <th className="pb-2 text-right font-semibold">Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {result.rows.map((row) => (
                <tr key={row.key}>
                  <td className="py-2 font-semibold text-stone-800 dark:text-stone-100">{row.name}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumberEs(row.units)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{formatMoneyEs(row.revenue)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {row.cost == null ? '—' : formatMoneyEs(row.cost)}
                  </td>
                  <td className={`py-2 text-right font-bold tabular-nums ${
                    row.margin != null && row.margin < 0 ? 'text-rose-600' : 'text-emerald-700'
                  }`}>
                    {row.margin == null
                      ? 'Sin escandallo'
                      : `${formatMoneyEs(row.margin)} · ${formatNumberEs(row.marginPct || 0, { maxFraction: 1 })} %`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
