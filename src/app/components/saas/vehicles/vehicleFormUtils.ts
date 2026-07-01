import type { Vehicle } from '../../../context/AppContext';

const EDITABLE_KEYS = [
  'brand',
  'model',
  'version',
  'year',
  'registrationPlate',
  'vin',
  'mileage',
  'color',
  'fuelType',
  'transmission',
  'power',
  'purchasePrice',
  'salePrice',
  'notes',
  'location',
] as const satisfies readonly (keyof Vehicle)[];

export function pickVehicleChanges(original: Vehicle, next: Partial<Vehicle>): Partial<Vehicle> {
  const updates: Partial<Vehicle> = {};
  for (const key of EDITABLE_KEYS) {
    const nextValue = next[key];
    if (nextValue === undefined) continue;
    const originalValue = original[key];
    if (JSON.stringify(nextValue) !== JSON.stringify(originalValue)) {
      (updates as Record<string, unknown>)[key] = nextValue;
    }
  }
  return updates;
}
