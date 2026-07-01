import { useMemo, useState } from 'react';
import { ArrowUpDown, Search, SlidersHorizontal, TrendingUp, X } from 'lucide-react';
import { VentasListCard } from './VentasListCard';
import {
  SALE_STATUS_FILTER_OPTIONS,
  VENTA_SORT_OPTIONS,
  type SaleStatus,
  type VentaListItem,
  type VentaSortKey,
} from './ventasListData';

type VentasListPanelProps = {
  sales: VentaListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function sortSales(items: VentaListItem[], sortKey: VentaSortKey): VentaListItem[] {
  const sorted = [...items];
  return sorted.sort((a, b) => {
    switch (sortKey) {
      case 'priceAsc':
        return a.salePrice - b.salePrice;
      case 'priceDesc':
        return b.salePrice - a.salePrice;
      case 'dateAsc':
        return a.saleDate.localeCompare(b.saleDate);
      case 'dateDesc':
        return b.saleDate.localeCompare(a.saleDate);
      case 'recent':
      default:
        return b.saleDate.localeCompare(a.saleDate);
    }
  });
}

export function VentasListPanel({
  sales = [],
  selectedId,
  onSelect,
}: VentasListPanelProps) {
  const safeSales = sales ?? [];
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SaleStatus | 'all'>('all');
  const [sellerFilter, setSellerFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<VentaSortKey>('recent');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const sellers = useMemo(
    () => [...new Set(safeSales.map((s) => s.sellerName).filter(Boolean))].sort() as string[],
    [safeSales],
  );

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = safeSales.filter((sale) => {
      if (statusFilter !== 'all' && sale.status !== statusFilter) return false;
      if (sellerFilter !== 'all' && sale.sellerName !== sellerFilter) return false;
      if (!q) return true;
      const haystack = [
        sale.vehicleLabel,
        sale.clientName,
        sale.sellerName ?? '',
        sale.status,
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
    return sortSales(filtered, sortKey);
  }, [safeSales, search, statusFilter, sellerFilter, sortKey]);

  const activeFiltersCount =
    (statusFilter !== 'all' ? 1 : 0) + (sellerFilter !== 'all' ? 1 : 0);

  const isEmptyStock = safeSales.length === 0;

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
              placeholder="Buscar vehículo, cliente…"
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
              onChange={(e) => setSortKey(e.target.value as VentaSortKey)}
              disabled={isEmptyStock}
              className="h-8 appearance-none rounded-lg border border-gray-200/80 bg-white py-0 pl-2.5 pr-7 text-xs font-medium text-gray-700 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              aria-label="Ordenar"
            >
              {VENTA_SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <ArrowUpDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
          {activeFiltersCount > 0 ? (
            <button
              type="button"
              onClick={() => { setStatusFilter('all'); setSellerFilter('all'); }}
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
                onChange={(e) => setStatusFilter(e.target.value as SaleStatus | 'all')}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                {SALE_STATUS_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Vendedor
              </span>
              <select
                value={sellerFilter}
                onChange={(e) => setSellerFilter(e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="all">Todos</option>
                {sellers.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <p className="text-xs text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {filteredSales.length}
          </span>
          {' '}de {safeSales.length} ventas
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {isEmptyStock ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
              <TrendingUp className="h-6 w-6 text-gray-400" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No hay ventas</p>
            <p className="mt-1 max-w-[220px] text-xs text-gray-500">
              Registra la primera venta para empezar a gestionar reservas y entregas.
            </p>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center dark:border-gray-700 dark:bg-gray-900">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Sin resultados</p>
            <p className="mt-1 text-xs text-gray-500">Prueba otro término o limpia los filtros.</p>
          </div>
        ) : (
          filteredSales.map((sale) => (
            <VentasListCard
              key={sale.id}
              sale={sale}
              selected={selectedId === sale.id}
              onSelect={() => onSelect(sale.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
