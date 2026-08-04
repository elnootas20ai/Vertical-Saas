import type { Vehicle } from '../context/AppContext';
import type { VehicleAcquisition } from './vehicleAcquisitionApi';
import { buildVehicleLabel } from './compraventaMappers';
import type { FiscalFormInput, PurchaseOrigin, SellerId } from './compraventaFiscalCalculator';
import { defaultFiscalForm, normalizeFiscalForm } from './compraventaFiscalCalculator';

export type FiscalPrefillOption = {
  key: string;
  vehicleId: string;
  acquisitionId?: string;
  label: string;
  subtitle: string;
};

const EU_HINTS = /\b(alemania|german|francia|france|portugal|italia|italy|ue|europa|intracomunit|importación ue)\b/i;

function guessOriginFromText(...parts: Array<string | undefined>): PurchaseOrigin {
  const text = parts.filter(Boolean).join(' ').toLowerCase();
  if (EU_HINTS.test(text)) return 'eu';
  if (/\b(uk|reino unido|suiza|usa|marruecos|andorra|importación|aduana|dua)\b/i.test(text)) {
    return 'outside_eu';
  }
  return 'spain';
}

function mapSeller(origin: PurchaseOrigin, acquisition?: VehicleAcquisition | null): SellerId {
  if (origin === 'outside_eu') return 'import_any';
  if (origin === 'eu') {
    if (acquisition?.sellerType === 'empresa') return 'eu_company_vat';
    return 'eu_private';
  }
  if (acquisition?.sellerType === 'empresa') return 'company_vat';
  if (acquisition?.acquisitionType === 'compra_empresa') return 'company_vat';
  return 'private';
}

function vehicleFirstRegistration(vehicle: Vehicle): string {
  // Nunca inventar con purchaseDate (fecha de compra ≠ 1ª matriculación).
  // Sin dato fiable dejamos vacío: el motor marca nuevo/usado como "Indica fecha y km".
  const raw = (vehicle as { firstRegistrationDate?: string; firstRegistration?: string }).firstRegistrationDate
    || (vehicle as { firstRegistrationDate?: string; firstRegistration?: string }).firstRegistration
    || '';
  if (raw && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return '';
}

export function buildFiscalPrefillOptions(
  vehicles: Vehicle[],
  acquisitions: VehicleAcquisition[],
): FiscalPrefillOption[] {
  const acquisitionByVehicle = new Map<string, VehicleAcquisition>();
  for (const acq of acquisitions) {
    if (!acq.vehicleId) continue;
    const prev = acquisitionByVehicle.get(acq.vehicleId);
    if (!prev || String(acq.acquisitionDate || acq.createdAt) > String(prev.acquisitionDate || prev.createdAt)) {
      acquisitionByVehicle.set(acq.vehicleId, acq);
    }
  }

  return vehicles
    .filter((v) => v.status !== 'vendido' && v.status !== 'entregado')
    .map((vehicle) => {
      const acq = acquisitionByVehicle.get(vehicle.id);
      const label = buildVehicleLabel(vehicle);
      const subtitle = acq
        ? `Compra ${acq.sellerName || 'registrada'} · ${(acq.costCompra || vehicle.purchasePrice || 0).toLocaleString('es-ES')} €`
        : `Stock · ${(vehicle.purchasePrice || 0).toLocaleString('es-ES')} €`;
      return {
        key: acq ? `${vehicle.id}:${acq.id}` : vehicle.id,
        vehicleId: vehicle.id,
        acquisitionId: acq?.id,
        label,
        subtitle,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

export function buildFiscalFormFromStock(
  vehicle: Vehicle,
  acquisition?: VehicleAcquisition | null,
  ccaa = 'ES-MD',
): FiscalFormInput {
  const origin = guessOriginFromText(
    acquisition?.notes,
    acquisition?.internalNotes,
    acquisition?.sellerAddress,
    vehicle.notes,
  );
  const seller = mapSeller(origin, acquisition);
  const purchasePrice = acquisition?.costCompra || vehicle.purchasePrice || 0;

  return {
    ...defaultFiscalForm(ccaa),
    ccaa,
    vehicleId: vehicle.id,
    acquisitionId: acquisition?.id || '',
    origin,
    seller,
    brand: vehicle.brand || '',
    model: vehicle.model || '',
    plate: vehicle.registrationPlate || acquisition?.registrationPlate || '',
    firstRegistration: vehicleFirstRegistration(vehicle),
    mileage: vehicle.mileage != null ? String(vehicle.mileage) : '',
    purchasePrice: purchasePrice > 0 ? String(purchasePrice) : '',
    includeSale: Boolean(vehicle.salePrice && vehicle.salePrice > 0),
    salePrice: vehicle.salePrice && vehicle.salePrice > 0 ? String(vehicle.salePrice) : '',
    saleClient: 'private_spain',
  };
}

export function resolvePrefillSelection(
  options: FiscalPrefillOption[],
  vehicles: Vehicle[],
  acquisitions: VehicleAcquisition[],
  vehicleId?: string | null,
  acquisitionId?: string | null,
): FiscalFormInput | null {
  if (!vehicleId) return null;
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return null;
  const acquisition = acquisitionId
    ? acquisitions.find((a) => a.id === acquisitionId)
    : acquisitions.find((a) => a.vehicleId === vehicleId);
  return buildFiscalFormFromStock(vehicle, acquisition);
}

export function ensureSellerMatchesOrigin(form: FiscalFormInput): FiscalFormInput {
  return normalizeFiscalForm(form);
}
