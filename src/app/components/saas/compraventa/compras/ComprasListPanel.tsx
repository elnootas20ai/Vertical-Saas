import { useMemo, useState } from 'react';
import { ArrowUpDown, Search, ShoppingCart, SlidersHorizontal, X } from 'lucide-react';
import { ComprasListCard } from './ComprasListCard';
import {
  COMPRA_SORT_OPTIONS,
  PURCHASE_STATUS_FILTER_OPTIONS,
  type CompraListItem,
  type CompraSortKey,
  type PurchaseStatus,
} from './comprasListData';

type ComprasListPanelProps = {
  purchases: CompraListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function sortPurchases(items: CompraListItem[], sortKey: CompraSortKey): CompraListItem[] {
  const sorted = [...items];
  return sorted.sort((a, b) => {
    switch (sortKey) {
      case 'priceAsc':
        return a.purchasePrice - b.purchasePrice;
      case 'priceDesc':
        return b.purchasePrice - a.purchasePrice;
      case 'dateAsc':
        return a.purchaseDate.localeCompare(b.purchaseDate);
      case 'dateDesc':
        return b.purchaseDate.localeCompare(a.purchaseDate);
      case 'recent':
      default:
        return b.purchaseDate.localeCompare(a.purchaseDate);
    }
  });
}

export function ComprasListPanel({
  purchases = [],
  selectedId,
  onSelect,
}: ComprasListPanelProps) {
  const safePurchases = purchases ?? [];
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PurchaseStatus | 'all'>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<CompraSortKey>('recent');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const suppliers = useMemo(
    () => [...new Set(safePurchases.map((p) => p.supplierName).filter(Boolean))].sort(),
    [safePurchases],
  );

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = safePurchases.filter((purchase) => {
      if (statusFilter !== 'all' && purchase.status !== statusFilter) return false;
      if (supplierFilter !== 'all' && purchase.supplierName !== supplierFilter) return false;
      if (!q) return true;
      const haystack = [
        purchase.vehicleLabel,
        purchase.supplierName,
        purchase.status,
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
    return sortPurchases(filtered, sortKey);
  }, [safePurchases, search, statusFilter, supplierFilter, sortKey]);

  const activeFiltersCount =
    (statusFilter !== 'all' ? 1 : 0) + (supplierFilter !== 'all' ? 1 : 0);

  const isEmptyStock = safePurchases.length === 0;

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-gray-200/80 bg-[#fafafa] dark:border-gray-800 dark:bg-gray-950/60">
      <div className="shrink-0 space-y-3 border-b border-gray-200/80 p-4 dark:border-gray-800">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar vehículo, proveedor…"
              disabled={isEmptyStock}
              className="h-10 w-full rounded-xl border border-gray-200/80 bg-white pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200/80 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            disabled={isEmptyStock}
            className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              filtersOpen || activeFiltersCount > 0
                ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                : 'border-gray-200/80 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900'
            }`}
            aria-label="Filtros"
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFiltersCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                {activeFiltersCount}
              </span>
            ) : null}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as CompraSortKey)}
              disabled={isEmptyStock}
              className="h-8 appearance-none rounded-lg border border-gray-200/80 bg-white py-0 pl-2.5 pr-7 text-xs font-medium text-gray-700 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              aria-label="Ordenar"
            >
              {COMPRA_SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <ArrowUpDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
          {activeFiltersCount > 0 ? (
            <button
              type="button"
              onClick={() => { setStatusFilter('all'); setSupplierFilter('all'); }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <X className="h-3 w-3" />
              Limpiar
            </button>
          ) : null}
        </div>

        {filtersOpen && !isEmptyStock ? (
          <div className="grid gap-2 rounded-xl border border-gray-200/80 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Estado
              </span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as PurchaseStatus | 'all')}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                {PURCHASE_STATUS_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Proveedor
              </span>
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="all">Todos</option>
                {suppliers.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <p className="text-xs text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {filteredPurchases.length}
          </span>
          {' '}de {safePurchases.length} compras
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {isEmptyStock ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
              <ShoppingCart className="h-6 w-6 text-gray-400" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No hay compras</p>
            <p className="mt-1 max-w-[220px] text-xs text-gray-500">
              Registra la primera compra de vehículo para empezar.
            </p>
          </div>
        ) : filteredPurchases.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center dark:border-gray-700 dark:bg-gray-900">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Sin resultados</p>
            <p className="mt-1 text-xs text-gray-500">Prueba otro término o limpia los filtros.</p>
          </div>
        ) : (
          filteredPurchases.map((purchase) => (
            <ComprasListCard
              key={purchase.id}
              purchase={purchase}
              selected={selectedId === purchase.id}
              onSelect={() => onSelect(purchase.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
