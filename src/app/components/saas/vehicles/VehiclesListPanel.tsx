import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Archive,
  Car,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { VEHICLE_STATUS_TOKEN, type VehicleStatus } from '../DesignTokens';
import { VehicleListCard } from './VehicleListCard';
import {
  VEHICLE_SORT_OPTIONS,
  type VehicleListItem,
  type VehicleSortKey,
} from './vehiclesListData';
import {
  buildVehicleFilterOptions,
  countActiveVehicleFilters,
  countVehiclesByStatus,
  EMPTY_VEHICLE_LIST_FILTERS,
  filterAndSortVehicles,
  vehicleListStatusLabel,
  type VehicleListFilters,
} from './vehicleListUtils';
import { VEHICLE_MODULE_STATUS_OPTIONS } from './vehicleStatusMap';

type VehiclesListPanelProps = {
  vehicles: VehicleListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  viewMode?: 'active' | 'archived';
  onViewModeChange?: (mode: 'active' | 'archived') => void;
  archivedCount?: number;
};

const FUEL_FILTER_LABELS: Record<string, string> = {
  gasolina: 'Gasolina',
  diesel: 'Diésel',
  hibrido: 'Híbrido',
  electrico: 'Eléctrico',
  glp: 'GLP',
  otro: 'Otro',
};

const TRANSMISSION_FILTER_LABELS: Record<string, string> = {
  manual: 'Manual',
  automatico: 'Automático',
  semiauto: 'Semiautomático',
};

const STATUS_FILTER_OPTIONS: { id: VehicleStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos' },
  ...VEHICLE_MODULE_STATUS_OPTIONS.map((o) => ({ id: o.value, label: o.label })),
];

const QUICK_STATUS_CHIPS: VehicleStatus[] = ['listo', 'reservado', 'vendido', 'entregado'];

export function VehiclesListPanel({
  vehicles = [],
  selectedId,
  onSelect,
  viewMode = 'active',
  onViewModeChange,
  archivedCount = 0,
}: VehiclesListPanelProps) {
  const safeVehicles = vehicles ?? [];
  const [filters, setFilters] = useState<VehicleListFilters>(EMPTY_VEHICLE_LIST_FILTERS);
  const [sortKey, setSortKey] = useState<VehicleSortKey>('createdAt_desc');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filterOptions = useMemo(() => buildVehicleFilterOptions(safeVehicles), [safeVehicles]);

  const filteredVehicles = useMemo(
    () => filterAndSortVehicles(safeVehicles, filters, sortKey),
    [safeVehicles, filters, sortKey],
  );

  const statusCounts = useMemo(
    () => countVehiclesByStatus(safeVehicles, filters.search),
    [safeVehicles, filters.search],
  );

  const activeFiltersCount = countActiveVehicleFilters(filters);

  const clearFilters = () => setFilters(EMPTY_VEHICLE_LIST_FILTERS);

  const setFilter = <K extends keyof VehicleListFilters>(key: K, value: VehicleListFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const isEmptyStock = safeVehicles.length === 0;
  const hasNoResults = !isEmptyStock && filteredVehicles.length === 0;
  const isArchivedView = viewMode === 'archived';

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-gray-200/80 bg-[#fafafa] dark:border-gray-800 dark:bg-gray-950/60">
      <div className="shrink-0 space-y-3 border-b border-gray-200/80 p-4 dark:border-gray-800">
        {onViewModeChange ? (
          <div className="flex rounded-xl border border-gray-200/80 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
            <button
              type="button"
              onClick={() => onViewModeChange('active')}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                viewMode === 'active'
                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Activos
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('archived')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                viewMode === 'archived'
                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Archive className="h-3.5 w-3.5" />
              Archivados
              {archivedCount > 0 ? (
                <span className="tabular-nums opacity-80">({archivedCount})</span>
              ) : null}
            </button>
          </div>
        ) : null}

        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              placeholder="Matrícula, VIN, marca, modelo…"
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
              className="h-8 max-w-[200px] appearance-none rounded-lg border border-gray-200/80 bg-white py-0 pl-2.5 pr-7 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
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

        {filtersOpen && !isEmptyStock && !isArchivedView ? (
          <div className="grid gap-2 rounded-xl border border-gray-200/80 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Estado</span>
              <select
                value={filters.status}
                onChange={(e) => setFilter('status', e.target.value as VehicleStatus | 'all')}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Marca</span>
              <select
                value={filters.brand}
                onChange={(e) => setFilter('brand', e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="all">Todas</option>
                {filterOptions.brands.map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Combustible</span>
              <select
                value={filters.fuelType}
                onChange={(e) => setFilter('fuelType', e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="all">Todos</option>
                {filterOptions.fuelTypes.map((fuel) => (
                  <option key={fuel} value={fuel}>{FUEL_FILTER_LABELS[fuel] || fuel}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Cambio</span>
              <select
                value={filters.transmission}
                onChange={(e) => setFilter('transmission', e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="all">Todos</option>
                {filterOptions.transmissions.map((tx) => (
                  <option key={tx} value={tx}>{TRANSMISSION_FILTER_LABELS[tx] || tx}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Año</span>
              <select
                value={filters.year}
                onChange={(e) => setFilter('year', e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="all">Todos</option>
                {filterOptions.years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
          </div>
        ) : !isEmptyStock && !isArchivedView ? (
          <div className="flex flex-wrap gap-1.5">
            {QUICK_STATUS_CHIPS.map((status) => {
              const count = statusCounts[status] ?? 0;
              if (count === 0) return null;
              const token = VEHICLE_STATUS_TOKEN[status];
              const active = filters.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilter('status', active ? 'all' : status)}
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
              {' '}de {safeVehicles.length} vehículos
            </span>
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {isEmptyStock ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
              <Car className="h-6 w-6 text-gray-400" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {isArchivedView ? 'No hay vehículos archivados' : 'No hay vehículos'}
            </p>
            <p className="mt-1 max-w-[220px] text-xs text-gray-500">
              {isArchivedView
                ? 'Los vehículos archivados aparecerán aquí para consulta y restauración.'
                : 'Añade el primer vehículo para empezar a gestionar tu stock.'}
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
