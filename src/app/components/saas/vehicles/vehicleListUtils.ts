import type { VehicleStatus } from '../DesignTokens';
import { vehicleEstimatedMargin, vehicleListStatusLabel, type VehicleListItem, type VehicleSortKey } from './vehiclesListData';

/** Filtros combinables del listado — extensible a Compras/Ventas/CRM. */
export type VehicleListFilters = {
  search: string;
  status: VehicleStatus | 'all';
  brand: string;
  fuelType: string;
  transmission: string;
  year: string;
};

export const EMPTY_VEHICLE_LIST_FILTERS: VehicleListFilters = {
  search: '',
  status: 'all',
  brand: 'all',
  fuelType: 'all',
  transmission: 'all',
  year: 'all',
};

export function countActiveVehicleFilters(filters: VehicleListFilters): number {
  let count = 0;
  if (filters.status !== 'all') count += 1;
  if (filters.brand !== 'all') count += 1;
  if (filters.fuelType !== 'all') count += 1;
  if (filters.transmission !== 'all') count += 1;
  if (filters.year !== 'all') count += 1;
  return count;
}

export function matchesVehicleSearch(vehicle: VehicleListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    vehicle.plate,
    vehicle.vin,
    vehicle.brand,
    vehicle.model,
    vehicle.version,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function matchesVehicleFilters(vehicle: VehicleListItem, filters: VehicleListFilters): boolean {
  if (!matchesVehicleSearch(vehicle, filters.search)) return false;
  if (filters.status !== 'all' && vehicle.status !== filters.status) return false;
  if (filters.brand !== 'all' && vehicle.brand !== filters.brand) return false;
  if (filters.fuelType !== 'all' && (vehicle.fuelType || '') !== filters.fuelType) return false;
  if (filters.transmission !== 'all' && (vehicle.transmission || '') !== filters.transmission) return false;
  if (filters.year !== 'all' && String(vehicle.year) !== filters.year) return false;
  return true;
}

function compareStrings(a: string, b: string, direction: 'asc' | 'desc'): number {
  const result = a.localeCompare(b, 'es', { sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

function compareNumbers(a: number, b: number, direction: 'asc' | 'desc'): number {
  return direction === 'asc' ? a - b : b - a;
}

export function sortVehicleList(items: VehicleListItem[], sortKey: VehicleSortKey): VehicleListItem[] {
  const sorted = [...items];
  const [field, direction] = sortKey.includes('_')
    ? (sortKey.split('_') as [string, 'asc' | 'desc'])
    : ['recent', 'desc'];

  const dir = direction === 'asc' ? 'asc' : 'desc';

  switch (field) {
    case 'brand':
      return sorted.sort((a, b) => compareStrings(a.brand, b.brand, dir) || compareStrings(a.model, b.model, dir));
    case 'model':
      return sorted.sort((a, b) => compareStrings(a.model, b.model, dir) || compareStrings(a.brand, b.brand, dir));
    case 'year':
      return sorted.sort((a, b) => compareNumbers(a.year, b.year, dir));
    case 'purchasePrice':
      return sorted.sort((a, b) => compareNumbers(a.purchasePrice, b.purchasePrice, dir));
    case 'salePrice':
      return sorted.sort((a, b) => compareNumbers(a.price, b.price, dir));
    case 'km':
      return sorted.sort((a, b) => compareNumbers(a.km, b.km, dir));
    case 'createdAt':
      return sorted.sort((a, b) => {
        const aTime = a.createdAt?.getTime() ?? 0;
        const bTime = b.createdAt?.getTime() ?? 0;
        return compareNumbers(aTime, bTime, dir);
      });
    case 'margin':
      return sorted.sort((a, b) => compareNumbers(vehicleEstimatedMargin(a), vehicleEstimatedMargin(b), dir));
    case 'days':
      return sorted.sort((a, b) => compareNumbers(a.daysInStock, b.daysInStock, dir));
    case 'recent':
    default:
      return sorted.sort((a, b) => {
        const aTime = a.createdAt?.getTime() ?? 0;
        const bTime = b.createdAt?.getTime() ?? 0;
        return bTime - aTime;
      });
  }
}

export function filterAndSortVehicles(
  vehicles: VehicleListItem[],
  filters: VehicleListFilters,
  sortKey: VehicleSortKey,
): VehicleListItem[] {
  const filtered = vehicles.filter((v) => matchesVehicleFilters(v, filters));
  return sortVehicleList(filtered, sortKey);
}

export function buildVehicleFilterOptions(vehicles: VehicleListItem[]) {
  return {
    brands: [...new Set(vehicles.map((v) => v.brand).filter(Boolean))].sort(),
    fuelTypes: [...new Set(vehicles.map((v) => v.fuelType).filter(Boolean))].sort() as string[],
    transmissions: [...new Set(vehicles.map((v) => v.transmission).filter(Boolean))].sort() as string[],
    years: [...new Set(vehicles.map((v) => String(v.year)).filter(Boolean))].sort((a, b) => Number(b) - Number(a)),
  };
}

export function countVehiclesByStatus(vehicles: VehicleListItem[], search: string): Partial<Record<VehicleStatus, number>> {
  const base = vehicles.filter((v) => matchesVehicleSearch(v, search));
  const counts: Partial<Record<VehicleStatus, number>> = {};
  for (const v of base) {
    counts[v.status] = (counts[v.status] ?? 0) + 1;
  }
  return counts;
}

export { vehicleListStatusLabel };
