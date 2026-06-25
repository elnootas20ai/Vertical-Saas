import { useMemo, useState } from 'react';
import { ArrowRight, BarChart3, Store, Tag } from 'lucide-react';
import type { PortfolioBusiness, PortfolioBrand } from '../../hooks/usePortfolioOverview';
import { fmtEuro, fmtPercent } from '../../lib/portfolioMetrics';

type ViewMode = 'brand' | 'store';

export function PortfolioBrandStoreBilling({
  row,
  onOpenBrands,
  onOpenStores,
}: {
  row: PortfolioBusiness;
  onOpenBrands: () => void;
  onOpenStores: () => void;
}) {
  const [view, setView] = useState<ViewMode>('brand');
  const billing = row.billing;
  const brandById = useMemo(() => new Map(row.brands.map((b) => [b.id, b])), [row.brands]);
  const storeById = useMemo(() => new Map(row.stores.map((s) => [s.id, s])), [row.stores]);

  const shareSegments = useMemo(() => {
    const withRevenue = row.brands.filter((b) => b.revenueMonth > 0);
    const total = billing?.totalRevenueMonth ?? row.metrics.revenueMonth;
    if (total <= 0) return [];
    return withRevenue.map((b) => ({
      id: b.id,
      name: b.name,
      color: b.primaryColor || '#6366f1',
      percent: total > 0 ? (b.revenueMonth / total) * 100 : 0,
      amount: b.revenueMonth,
    }));
  }, [row.brands, billing?.totalRevenueMonth, row.metrics.revenueMonth]);

  if (!row.isDelivery) {
    return (
      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 p-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          El desglose por marca y tienda está disponible para negocios de delivery con tiendas configuradas.
        </p>
      </section>
    );
  }

  const totalMonth = billing?.totalRevenueMonth ?? row.metrics.revenueMonth;
  const totalToday = billing?.totalRevenueToday ?? row.metrics.revenueToday;
  const deliveredMonth = billing?.totalDeliveredMonth ?? row.metrics.deliveredMonth;
  const hasActivity = totalMonth > 0 || deliveredMonth > 0 || row.stores.some((s) => s.hasPdv);

  return (
    <section className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 bg-gradient-to-br from-white via-indigo-50/30 to-white dark:from-gray-900 dark:via-indigo-950/20 dark:to-gray-900 overflow-hidden">
      <div className="px-4 sm:px-5 py-4 border-b border-indigo-100/80 dark:border-indigo-900/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-500 shrink-0" />
              Facturación delivery — marca y tienda
            </h4>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
              Ingresos de pedidos entregados este mes, repartidos por línea comercial (marca) y centro de trabajo (tienda) dentro de{' '}
              <span className="font-semibold text-gray-700 dark:text-gray-300">{row.business.name}</span>.
            </p>
          </div>
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-0.5 shrink-0">
            <ViewToggle active={view === 'brand'} onClick={() => setView('brand')} icon={<Tag className="w-3 h-3" />}>
              Por marca
            </ViewToggle>
            <ViewToggle active={view === 'store'} onClick={() => setView('store')} icon={<Store className="w-3 h-3" />}>
              Por tienda
            </ViewToggle>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <KpiChip label="Facturación mes" value={fmtEuro(totalMonth)} highlight />
          <KpiChip label="Hoy" value={fmtEuro(totalToday)} />
          <KpiChip label="Entregados mes" value={String(deliveredMonth)} />
          <KpiChip label="Tiendas / marcas" value={`${row.storeCount} · ${row.brandCount}`} />
        </div>

        {shareSegments.length > 0 ? (
          <div className="mt-4">
            <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-200/80 dark:bg-gray-700">
              {shareSegments.map((seg) => (
                <div
                  key={seg.id}
                  title={`${seg.name}: ${fmtEuro(seg.amount)} (${fmtPercent(seg.percent)})`}
                  className="h-full transition-all min-w-[2px]"
                  style={{ width: `${Math.max(seg.percent, 0.5)}%`, backgroundColor: seg.color }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {shareSegments.map((seg) => (
                <span key={seg.id} className="inline-flex items-center gap-1.5 text-[10px] text-gray-600 dark:text-gray-400">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{seg.name}</span>
                  <span className="tabular-nums">{fmtPercent(seg.percent)}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="px-4 sm:px-5 py-4">
        {!hasActivity && row.brands.length === 0 && row.stores.length === 0 ? (
          <EmptyBilling onOpenStores={onOpenStores} onOpenBrands={onOpenBrands} mode="setup" />
        ) : !hasActivity ? (
          <EmptyBilling onOpenStores={onOpenStores} onOpenBrands={onOpenBrands} mode="no-sales" />
        ) : view === 'brand' ? (
          <BrandTable brands={row.brands} storeById={storeById} onOpenBrands={onOpenBrands} />
        ) : (
          <StoreTable row={row} brandById={brandById} onOpenStores={onOpenStores} />
        )}

        {billing && billing.unbrandedRevenueMonth > 0 ? (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span className="font-semibold text-gray-600 dark:text-gray-300">{fmtEuro(billing.unbrandedRevenueMonth)}</span>{' '}
            corresponden a líneas sin marca (bebidas, complementos, etc.) — no aparecen en el desglose por marca.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function ViewToggle({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
        active
          ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-sm'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function KpiChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl px-3 py-2 border ${
        highlight
          ? 'border-emerald-200 bg-emerald-50/90 dark:border-emerald-800 dark:bg-emerald-950/30'
          : 'border-gray-100 bg-white/80 dark:border-gray-700 dark:bg-gray-800/60'
      }`}
    >
      <p className="text-[9px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p
        className={`text-sm font-black tabular-nums ${
          highlight ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function BrandTable({
  brands,
  storeById,
  onOpenBrands,
}: {
  brands: PortfolioBrand[];
  storeById: Map<string, { name: string; city?: string; hasPdv: boolean }>;
  onOpenBrands: () => void;
}) {
  const sorted = [...brands].sort((a, b) => b.revenueMonth - a.revenueMonth);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Qué marca factura y en qué tiendas</p>
        <button type="button" onClick={onOpenBrands} className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1">
          Gestionar marcas <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-800">
              <th className="pb-2 pr-3 font-bold">Marca</th>
              <th className="pb-2 pr-3 text-right">Facturación</th>
              <th className="pb-2 pr-3 text-right">Entregas</th>
              <th className="pb-2 pr-3 text-right">% empresa</th>
              <th className="pb-2">Tiendas donde factura</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((brand) => (
              <BrandRow key={brand.id} brand={brand} storeById={storeById} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BrandRow({
  brand,
  storeById,
}: {
  brand: PortfolioBrand;
  storeById: Map<string, { name: string; city?: string; hasPdv: boolean }>;
}) {
  const hasSales = brand.revenueMonth > 0 || brand.deliveredMonth > 0;
  const storeCells = brand.storeBreakdown.length > 0
    ? brand.storeBreakdown
    : brand.linkedStoreNames.map((name, i) => ({
        storeId: brand.linkedStoreIds[i] || `_${i}`,
        storeName: name,
        revenueMonth: 0,
        revenueToday: 0,
        deliveredMonth: 0,
        deliveredToday: 0,
      }));

  return (
    <>
      <tr className="border-b border-gray-50 dark:border-gray-800/80 align-top">
        <td className="py-3 pr-3">
          <div className="flex items-start gap-2">
            <span
              className="w-3 h-3 rounded-full mt-0.5 shrink-0 ring-2 ring-white dark:ring-gray-900"
              style={{ backgroundColor: brand.primaryColor || '#8b5cf6' }}
            />
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {brand.name}
                {brand.isDefault ? (
                  <span className="ml-1.5 text-[9px] font-bold uppercase text-violet-600 dark:text-violet-400">default</span>
                ) : null}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {brand.operatesAllStores
                  ? 'Todas las tiendas de la empresa'
                  : brand.linkedStoreNames.length > 0
                    ? `En ${brand.linkedStoreNames.length} tienda${brand.linkedStoreNames.length !== 1 ? 's' : ''}`
                    : 'Sin tiendas asignadas'}
              </p>
            </div>
          </div>
        </td>
        <td className="py-3 pr-3 text-right tabular-nums">
          <p className={`font-bold ${hasSales ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
            {fmtEuro(brand.revenueMonth)}
          </p>
          {brand.revenueToday > 0 ? (
            <p className="text-[10px] text-gray-500">Hoy {fmtEuro(brand.revenueToday)}</p>
          ) : null}
        </td>
        <td className="py-3 pr-3 text-right tabular-nums font-semibold text-gray-800 dark:text-gray-200">
          {brand.deliveredMonth}
        </td>
        <td className="py-3 pr-3 text-right tabular-nums text-indigo-600 dark:text-indigo-400 font-semibold">
          {brand.sharePercent > 0 ? fmtPercent(brand.sharePercent) : '—'}
        </td>
        <td className="py-3">
          {!brand.active ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-200 text-gray-600">Inactiva</span>
          ) : storeCells.length === 0 ? (
            <span className="text-[11px] text-amber-600 dark:text-amber-400">Asigna tiendas en Ajustes → Marca</span>
          ) : (
            <ul className="space-y-1.5">
              {storeCells.map((cell) => {
                const meta = storeById.get(cell.storeId);
                const cellHasSales = cell.revenueMonth > 0 || cell.deliveredMonth > 0;
                return (
                  <li
                    key={cell.storeId}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg bg-white/70 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/80 px-2.5 py-1.5"
                  >
                    <span className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[10rem] sm:max-w-none">
                      {cell.storeName || meta?.name || 'Tienda'}
                      {meta?.city ? (
                        <span className="font-normal text-gray-400 ml-1">· {meta.city}</span>
                      ) : null}
                    </span>
                    <span className="text-[11px] tabular-nums shrink-0">
                      {cellHasSales ? (
                        <>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{fmtEuro(cell.revenueMonth)}</span>
                          <span className="text-gray-400 mx-1">·</span>
                          <span className="text-gray-600 dark:text-gray-400">{cell.deliveredMonth} entregas</span>
                        </>
                      ) : (
                        <span className="text-gray-400">Sin ventas este mes</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </td>
      </tr>
    </>
  );
}

function StoreTable({
  row,
  brandById,
  onOpenStores,
}: {
  row: PortfolioBusiness;
  brandById: Map<string, PortfolioBrand>;
  onOpenStores: () => void;
}) {
  const billingStores = row.billing?.stores ?? [];
  const fallbackStores = row.stores.filter((s) => s.hasPdv);
  const rows =
    billingStores.length > 0
      ? billingStores.map((bs) => ({
          storeId: bs.storeId,
          name: row.stores.find((s) => s.id === bs.storeId)?.name || 'Tienda',
          city: row.stores.find((s) => s.id === bs.storeId)?.city,
          hasPdv: true,
          revenueMonth: bs.revenueMonth,
          revenueToday: bs.revenueToday,
          deliveredMonth: bs.deliveredMonth,
          activeOrders: bs.activeOrders,
          sharePercent: bs.sharePercent,
          brands: bs.brands,
        }))
      : fallbackStores.map((s) => ({
          storeId: s.id,
          name: s.name,
          city: s.city,
          hasPdv: s.hasPdv,
          revenueMonth: s.delivery.revenueMonth,
          revenueToday: 0,
          deliveredMonth: s.delivery.deliveredMonth,
          activeOrders: s.delivery.activeOrders,
          sharePercent: 0,
          brands: [] as Array<{ brandId: string; revenueMonth: number; deliveredMonth: number }>,
        }));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Qué tienda factura y con qué marcas</p>
        <button type="button" onClick={onOpenStores} className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1">
          Gestionar tiendas <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((store) => (
          <article
            key={store.storeId}
            className="rounded-xl border border-emerald-100 dark:border-emerald-900/50 bg-white dark:bg-gray-800/80 p-3.5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <h5 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{store.name}</h5>
                <p className="text-[10px] text-gray-500">
                  {[store.city, store.hasPdv ? 'PDV activo' : null].filter(Boolean).join(' · ') || 'Centro de trabajo'}
                </p>
              </div>
              {store.sharePercent > 0 ? (
                <span className="text-[10px] font-bold tabular-nums px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 shrink-0">
                  {fmtPercent(store.sharePercent)}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] mb-3">
              <span>
                <span className="text-gray-500">Mes </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{fmtEuro(store.revenueMonth)}</span>
              </span>
              {store.revenueToday > 0 ? (
                <span>
                  <span className="text-gray-500">Hoy </span>
                  <span className="font-semibold tabular-nums">{fmtEuro(store.revenueToday)}</span>
                </span>
              ) : null}
              <span>
                <span className="text-gray-500">Entregas </span>
                <span className="font-semibold tabular-nums">{store.deliveredMonth}</span>
              </span>
              {store.activeOrders > 0 ? (
                <span>
                  <span className="text-gray-500">En curso </span>
                  <span className="font-semibold text-amber-600 tabular-nums">{store.activeOrders}</span>
                </span>
              ) : null}
            </div>
            {store.brands.length > 0 ? (
              <ul className="space-y-1 border-t border-gray-100 dark:border-gray-700 pt-2">
                {store.brands.map((b) => {
                  const brand = brandById.get(b.brandId);
                  return (
                    <li key={b.brandId} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: brand?.primaryColor || '#8b5cf6' }}
                        />
                        <span className="font-medium text-gray-800 dark:text-gray-200 truncate">{brand?.name || 'Marca'}</span>
                      </span>
                      <span className="tabular-nums shrink-0 font-semibold text-emerald-600 dark:text-emerald-400">
                        {fmtEuro(b.revenueMonth)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[10px] text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-2">
                Sin desglose por marca este mes (revisa catálogo y brandIds en productos).
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function EmptyBilling({
  mode,
  onOpenBrands,
  onOpenStores,
}: {
  mode: 'setup' | 'no-sales';
  onOpenBrands: () => void;
  onOpenStores: () => void;
}) {
  if (mode === 'setup') {
    return (
      <div className="text-center py-8 px-4">
        <Store className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Configura marcas y tiendas</p>
        <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
          Crea al menos una tienda (PDV) y una marca comercial para ver aquí el reparto de facturación.
        </p>
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          <button type="button" onClick={onOpenStores} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">
            Crear tienda
          </button>
          <button type="button" onClick={onOpenBrands} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-bold">
            Crear marca
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="text-center py-8 px-4">
      <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Sin entregas este mes</p>
      <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
        Cuando haya pedidos entregados, verás aquí cuánto factura cada marca en cada tienda.
      </p>
    </div>
  );
}
