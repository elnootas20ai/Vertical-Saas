import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Car,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { VEHICLE_STATUS_TOKEN, type VehicleStatus } from '../DesignTokens';
import { VehicleListCard } from './VehicleListCard';
import {
  VEHICLE_SORT_OPTIONS,
  vehicleEstimatedMargin,
  vehicleListStatusLabel,
  type VehicleListItem,
  type VehicleSortKey,
} from './vehiclesListData';

type VehiclesListPanelProps = {
  vehicles: VehicleListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

type StatusFilter = VehicleStatus | 'all';
type BrandFilter = string;
type LocationFilter = string;

const STATUS_FILTER_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'listo', label: 'Disponible' },
  { id: 'reservado', label: 'Reservado' },
  { id: 'preparacion', label: 'En preparación' },
  { id: 'entrada', label: 'Entrada' },
  { id: 'vendido', label: 'Vendido' },
];

function sortVehicles(items: VehicleListItem[], sortKey: VehicleSortKey): VehicleListItem[] {
  const sorted = [...items];
  switch (sortKey) {
    case 'priceAsc':
      return sorted.sort((a, b) => a.price - b.price);
    case 'priceDesc':
      return sorted.sort((a, b) => b.price - a.price);
    case 'daysAsc':
      return sorted.sort((a, b) => a.daysInStock - b.daysInStock);
    case 'daysDesc':
      return sorted.sort((a, b) => b.daysInStock - a.daysInStock);
    case 'marginDesc':
      return sorted.sort((a, b) => vehicleEstimatedMargin(b) - vehicleEstimatedMargin(a));
    case 'recent':
    default:
      return sorted.sort((a, b) => a.daysInStock - b.daysInStock);
  }
}

function matchesSearch(vehicle: VehicleListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    vehicle.brand,
    vehicle.model,
    vehicle.plate,
    vehicle.location,
    String(vehicle.year),
    vehicleListStatusLabel(vehicle.status),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function VehiclesListPanel({
  vehicles = [],
  selectedId,
  onSelect,
}: VehiclesListPanelProps) {
  const safeVehicles = vehicles ?? [];
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [brandFilter, setBrandFilter] = useState<BrandFilter>('all');
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all');
  const [sortKey, setSortKey] = useState<VehicleSortKey>('recent');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const brands = useMemo(
    () => [...new Set(safeVehicles.map((v) => v.brand))].sort(),
    [safeVehicles],
  );
  const locations = useMemo(
    () => [...new Set(safeVehicles.map((v) => v.location))].sort(),
    [safeVehicles],
  );

  const filteredVehicles = useMemo(() => {
    const filtered = safeVehicles.filter((vehicle) => {
      if (!matchesSearch(vehicle, search)) return false;
      if (statusFilter !== 'all' && vehicle.status !== statusFilter) return false;
      if (brandFilter !== 'all' && vehicle.brand !== brandFilter) return false;
      if (locationFilter !== 'all' && vehicle.location !== locationFilter) return false;
      return true;
    });
    return sortVehicles(filtered, sortKey);
  }, [safeVehicles, search, statusFilter, brandFilter, locationFilter, sortKey]);

  const statusCounts = useMemo(() => {
    const base = safeVehicles.filter((v) => matchesSearch(v, search));
    const counts: Partial<Record<VehicleStatus, number>> = {};
    for (const v of base) {
      counts[v.status] = (counts[v.status] ?? 0) + 1;
    }
    return counts;
  }, [safeVehicles, search]);

  const activeFiltersCount =
    (statusFilter !== 'all' ? 1 : 0)
    + (brandFilter !== 'all' ? 1 : 0)
    + (locationFilter !== 'all' ? 1 : 0);

  const clearFilters = () => {
    setStatusFilter('all');
    setBrandFilter('all');
    setLocationFilter('all');
  };

  const isEmptyStock = safeVehicles.length === 0;
  const hasNoResults = !isEmptyStock && filteredVehicles.length === 0;

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
              placeholder="Buscar marca, modelo, matrícula…"
              disabled={isEmptyStock}
              className="h-10 w-full rounded-xl border border-gray-200/80 bg-white pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200/80 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-gray-700"
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
              onChange={(e) => setSortKey(e.target.value as VehicleSortKey)}
              disabled={isEmptyStock}
              className="h-8 appearance-none rounded-lg border border-gray-200/80 bg-white py-0 pl-2.5 pr-7 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              aria-label="Ordenar"
            >
              {VEHICLE_SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ArrowUpDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>

          {activeFiltersCount > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
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
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Marca
              </span>
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="all">Todas</option>
                {brands.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Ubicación
              </span>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="all">Todas</option>
                {locations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : !isEmptyStock ? (
          <div className="flex flex-wrap gap-1.5">
            {(['listo', 'reservado', 'preparacion'] as VehicleStatus[]).map((status) => {
              const count = statusCounts[status] ?? 0;
              if (count === 0) return null;
              const token = VEHICLE_STATUS_TOKEN[status];
              const active = statusFilter === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(active ? 'all' : status)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    active
                      ? `${token.badgeBg} ${token.badgeText} border-transparent`
                      : 'border-gray-200/80 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                  }`}
                >
                  {vehicleListStatusLabel(status)}
                  <span className="tabular-nums opacity-80">{count}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {filteredVehicles.length}
            <span className="font-normal text-gray-500 dark:text-gray-400">
              {' '}
              de {safeVehicles.length} vehículos
            </span>
          </span>
          {statusCounts.listo ? (
            <>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span>{statusCounts.listo} disponibles</span>
            </>
          ) : null}
          {statusCounts.reservado ? (
            <>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span>{statusCounts.reservado} reservados</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {isEmptyStock ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
              <Car className="h-6 w-6 text-gray-400" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No hay vehículos</p>
            <p className="mt-1 max-w-[220px] text-xs text-gray-500">
              Añade el primer vehículo para empezar a gestionar tu stock.
            </p>
          </div>
        ) : hasNoResults ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center dark:border-gray-700 dark:bg-gray-900">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Sin resultados</p>
            <p className="mt-1 text-xs text-gray-500">Prueba otro término o limpia los filtros.</p>
          </div>
        ) : (
          filteredVehicles.map((vehicle) => (
            <VehicleListCard
              key={vehicle.id}
              vehicle={vehicle}
              selected={selectedId === vehicle.id}
              onSelect={() => onSelect(vehicle.id)}
            />
          ))
        )}
      </div>

      {filteredVehicles.length > 0 ? (
        <div className="shrink-0 border-t border-gray-200/80 px-4 py-3 dark:border-gray-800">
          <p className="text-center text-[11px] text-gray-400">
            Mostrando {filteredVehicles.length} vehículo{filteredVehicles.length !== 1 ? 's' : ''}
          </p>
        </div>
      ) : null}
    </aside>
  );
}
