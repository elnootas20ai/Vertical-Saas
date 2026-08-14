/**
 * Panel dashboard: ranking de productos vendidos + margen escandallo.
 * Carga catálogo/ingredientes solo al montar (lazy panel).
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Layers, Loader2 } from 'lucide-react';
import { listBrandsRequest, type Brand } from '../../lib/brandsApi';
import { commercialLineBrands } from '../../lib/deliveryCatalogImportLogic';
import { sortBrandsForDisplay } from '../../lib/brandUtils';
import {
  filterCatalogItemsForBusinessScope,
} from '../../lib/catalogBusinessScope';
import {
  normalizeStoreIngredients,
  unifyStoreIngredientsFromConfig,
  type StoreIngredient,
} from '../../lib/catalogCustomization';
import {
  getDeliveryConfigRequest,
  listCatalogItemsRequest,
  type CatalogItem,
  type DeliveryOrder,
} from '../../lib/deliveryApi';
import { applyVertialDefaultsToStoreIngredients } from '../../lib/vertialDefaultCosts';
import { formatMoneyEs, formatNumberEs, formatQtyEs } from '../../lib/formatNumberEs';
import {
  buildSoldProductMarginRanking,
  type SoldMarginPeriod,
  type SoldMarginRankRow,
} from './soldProductMarginRanking';

type BrandLike = {
  _id: string;
  name?: string | null;
  deliveryLineKind?: string | null;
  active?: boolean;
};

type Props = {
  orders: DeliveryOrder[];
  userId: string;
  businessId?: string | null;
  /** Marcas ya cargadas en el dashboard (evita fetch extra si vienen). */
  brands?: BrandLike[];
  accountBusinessCount?: number;
  businessType?: string | null;
};

const PERIODS: Array<{ id: SoldMarginPeriod; label: string }> = [
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
];

function marginTone(row: SoldMarginRankRow): string {
  if (!row.hasEscandallo || row.marginPct == null) {
    return 'text-amber-700 dark:text-amber-300';
  }
  if (row.marginPct < 0) return 'text-rose-600 dark:text-rose-400';
  if (row.marginPct < 15) return 'text-amber-700 dark:text-amber-300';
  return 'text-emerald-700 dark:text-emerald-400';
}

export function DeliverySoldProductMarginPanel({
  orders,
  userId,
  businessId,
  brands: brandsProp,
  accountBusinessCount = 1,
  businessType,
}: Props) {
  const [period, setPeriod] = useState<SoldMarginPeriod>('week');
  const [storeId, setStoreId] = useState<string>('');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [ingredients, setIngredients] = useState<StoreIngredient[]>([]);
  const [brandsLocal, setBrandsLocal] = useState<BrandLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const brands = brandsProp && brandsProp.length > 0 ? brandsProp : brandsLocal;

  useEffect(() => {
    let cancelled = false;
    const uid = String(userId || '').trim();
    if (!uid) {
      setLoading(false);
      setError('Sin usuario');
      return;
    }
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const needBrands = !(brandsProp && brandsProp.length > 0) && Boolean(businessId);
        const seedBrands = (brandsProp || []) as Brand[];
        const [items, config, brandList] = await Promise.all([
          listCatalogItemsRequest(uid, 'catalog'),
          getDeliveryConfigRequest(uid),
          needBrands
            ? listBrandsRequest(String(businessId)).catch(() => [] as Brand[])
            : Promise.resolve(seedBrands),
        ]);
        if (cancelled) return;

        const lineBrands = sortBrandsForDisplay(
          commercialLineBrands(needBrands ? brandList : seedBrands.length ? seedBrands : brandList),
        );
        if (!(brandsProp && brandsProp.length > 0)) {
          setBrandsLocal(lineBrands);
        }

        const scoped = businessId
          ? filterCatalogItemsForBusinessScope(items, String(businessId), lineBrands, {
              accountBusinessCount,
              activeBusinessType: businessType,
            })
          : items;

        const brandIds = lineBrands.map((b) => String(b._id || '').trim()).filter(Boolean);
        const baseIngredients = normalizeStoreIngredients(
          unifyStoreIngredientsFromConfig(config, brandIds),
        );
        const { items: withDefaults } = applyVertialDefaultsToStoreIngredients(
          baseIngredients,
          lineBrands,
        );

        setCatalog(scoped);
        setIngredients(withDefaults);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el escandallo');
          setCatalog([]);
          setIngredients([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Solo al montar / cambio de tenant: no re-fetch al cambiar periodo.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- brandsProp intencional estable
  }, [userId, businessId, accountBusinessCount, businessType]);

  const ranking = useMemo(
    () =>
      buildSoldProductMarginRanking({
        orders,
        period,
        storeId: storeId || null,
        catalog,
        storeIngredients: ingredients,
        brands: brands.map((b) => ({
          _id: String(b._id || ''),
          deliveryLineKind: b.deliveryLineKind || undefined,
        })),
      }),
    [orders, period, storeId, catalog, ingredients, brands],
  );

  const topRows = ranking.rows.slice(0, 25);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                period === p.id
                  ? 'bg-[var(--v-blue,#2563eb)] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-900/60 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="shrink-0 font-semibold">Tienda</span>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="min-w-0 max-w-[220px] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">Total (todas)</option>
            {ranking.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando costes de escandallo…
        </div>
      ) : error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </p>
      ) : ranking.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 px-3 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          No hay productos vendidos en este periodo.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Productos</p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {formatNumberEs(ranking.rows.length, { maxFraction: 0 })}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Venta</p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {formatMoneyEs(ranking.totalRevenue)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Margen*</p>
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                {formatMoneyEs(ranking.totalMargin)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Sin escandallo</p>
              <p className={`text-sm font-bold ${ranking.missingEscandalloCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-gray-100'}`}>
                {formatNumberEs(ranking.missingEscandalloCount, { maxFraction: 0 })}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-gray-400">
            * Margen solo de productos con escandallo. Combos incluidos. Top {formatNumberEs(topRows.length, { maxFraction: 0 })} de {formatNumberEs(ranking.rows.length, { maxFraction: 0 })}.
          </p>

          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500 dark:bg-gray-900/50 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 font-bold">#</th>
                  <th className="px-3 py-2 font-bold">Producto</th>
                  <th className="px-3 py-2 text-right font-bold">Uds</th>
                  <th className="px-3 py-2 text-right font-bold">Venta</th>
                  <th className="px-3 py-2 text-right font-bold">Coste</th>
                  <th className="px-3 py-2 text-right font-bold">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {topRows.map((row, idx) => (
                  <tr key={row.key} className="bg-white dark:bg-gray-800">
                    <td className="px-3 py-2 font-semibold text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{row.name}</span>
                        {row.isCombo ? (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                            <Layers className="h-2.5 w-2.5" />
                            Combo
                          </span>
                        ) : null}
                        {!row.hasEscandallo ? (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Falta escandallo
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                      {formatQtyEs(row.units)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-800 dark:text-gray-200">
                      {formatMoneyEs(row.revenue)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500 dark:text-gray-400">
                      {row.hasEscandallo && row.cost != null ? formatMoneyEs(row.cost) : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right font-bold tabular-nums ${marginTone(row)}`}>
                      {row.hasEscandallo && row.margin != null ? (
                        <>
                          {formatMoneyEs(row.margin)}
                          {row.marginPct != null ? (
                            <span className="ml-1 text-[10px] font-semibold opacity-80">
                              ({formatNumberEs(row.marginPct, { minFraction: 1, maxFraction: 1 })}%)
                            </span>
                          ) : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
