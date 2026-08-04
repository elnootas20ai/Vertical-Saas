/**
 * Mapea el resultado OCR (permiso / ficha / contrato) a un borrador de vehículo.
 */
import type { OcrResult } from './ocrApi';
import type { VehicleDocType } from './vehicleApi';

export type VehicleOcrDraft = {
  brand: string;
  model: string;
  version: string;
  year: string;
  registrationPlate: string;
  vin: string;
  mileage: string;
  color: string;
  fuelType: string;
  transmission: string;
  power: string;
  purchasePrice: string;
  salePrice: string;
  notes: string;
  ownerName: string;
  ownerNif: string;
  documentType: string | null;
  documentTypeLabel: string | null;
  confidenceScore: number | null;
};

const FUEL_ALIASES: Record<string, string> = {
  gasolina: 'gasolina',
  gasoline: 'gasolina',
  petrol: 'gasolina',
  diesel: 'diesel',
  diésel: 'diesel',
  gasóleo: 'diesel',
  gasoleo: 'diesel',
  hibrido: 'hibrido',
  híbrido: 'hibrido',
  hybrid: 'hibrido',
  'híbrido enchufable': 'hibrido',
  phev: 'hibrido',
  electrico: 'electrico',
  eléctrico: 'electrico',
  electric: 'electrico',
  ev: 'electrico',
  glp: 'glp',
  gpl: 'glp',
  gnc: 'otro',
  otro: 'otro',
};

const TRANSMISSION_ALIASES: Record<string, string> = {
  manual: 'manual',
  mt: 'manual',
  automatico: 'automatico',
  automático: 'automatico',
  automatic: 'automatico',
  at: 'automatico',
  'cvt': 'automatico',
  semiauto: 'semiauto',
  'semi-auto': 'semiauto',
  'semi automático': 'semiauto',
  'semi automatico': 'semiauto',
  dct: 'semiauto',
};

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizePlate(value: unknown): string {
  return cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeVin(value: unknown): string {
  return cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeFuel(value: unknown): string {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return '';
  if (FUEL_ALIASES[raw]) return FUEL_ALIASES[raw];
  for (const [key, mapped] of Object.entries(FUEL_ALIASES)) {
    if (raw.includes(key)) return mapped;
  }
  return 'otro';
}

function normalizeTransmission(value: unknown): string {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return '';
  if (TRANSMISSION_ALIASES[raw]) return TRANSMISSION_ALIASES[raw];
  for (const [key, mapped] of Object.entries(TRANSMISSION_ALIASES)) {
    if (raw.includes(key)) return mapped;
  }
  return '';
}

function yearFromOcr(value: unknown): string {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 1950 && n <= new Date().getFullYear() + 1) {
    return String(Math.round(n));
  }
  const match = cleanText(value).match(/(19|20)\d{2}/);
  return match ? match[0] : '';
}

function numberField(value: unknown): string {
  if (value == null || value === '') return '';
  const n = Number(String(value).replace(/[^\d.,-]/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return '';
  return String(Math.round(n));
}

/** Campos extra que el prompt vehicle puede devolver además del tipo OcrResult base. */
export type VehicleOcrExtras = OcrResult & {
  vehicleColor?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  power?: number | string | null;
  mileage?: number | string | null;
  version?: string | null;
  bodyType?: string | null;
  doors?: number | string | null;
};

export function mapOcrResultToVehicleDraft(ocr: VehicleOcrExtras | null | undefined): VehicleOcrDraft {
  const brand = cleanText(ocr?.vehicleBrand);
  const model = cleanText(ocr?.vehicleModel);
  const version = cleanText(ocr?.version);
  const color = cleanText(ocr?.vehicleColor);
  const ownerName = cleanText(ocr?.ownerName);
  const ownerNif = cleanText(ocr?.ownerNif);
  const plate = normalizePlate(ocr?.registrationPlate);
  const vin = normalizeVin(ocr?.vin);
  const year = yearFromOcr(ocr?.vehicleYear);
  const fuelType = normalizeFuel(ocr?.fuelType);
  const transmission = normalizeTransmission(ocr?.transmission);
  const power = numberField(ocr?.power);
  const mileage = numberField(ocr?.mileage);

  const noteParts: string[] = [];
  if (ownerName) noteParts.push(`Titular OCR: ${ownerName}${ownerNif ? ` (${ownerNif})` : ''}`);
  if (ocr?.documentTypeLabel) noteParts.push(`Doc: ${ocr.documentTypeLabel}`);
  if (ocr?.documentNumber) noteParts.push(`Nº doc: ${ocr.documentNumber}`);
  if (ocr?.date) noteParts.push(`Fecha doc: ${ocr.date}`);
  if (ocr?.bodyType) noteParts.push(`Carrocería: ${cleanText(ocr.bodyType)}`);
  if (ocr?.doors) noteParts.push(`Puertas: ${cleanText(ocr.doors)}`);
  if (ocr?.notes) noteParts.push(cleanText(ocr.notes));

  const purchaseFromTotal =
    ocr?.total != null && Number(ocr.total) > 0 ? String(Math.round(Number(ocr.total))) : '';

  return {
    brand,
    model,
    version,
    year: year || String(new Date().getFullYear()),
    registrationPlate: plate,
    vin,
    mileage,
    color,
    fuelType,
    transmission,
    power,
    purchasePrice: purchaseFromTotal,
    salePrice: '',
    notes: noteParts.join('\n'),
    ownerName,
    ownerNif,
    documentType: ocr?.documentType ?? null,
    documentTypeLabel: ocr?.documentTypeLabel ?? null,
    confidenceScore:
      typeof ocr?.confidenceScore === 'number' && Number.isFinite(ocr.confidenceScore)
        ? ocr.confidenceScore
        : null,
  };
}

export function resolveOcrVehicleDocType(documentType: string | null | undefined): VehicleDocType {
  const t = String(documentType || '').toLowerCase();
  if (t === 'permiso_circulacion') return 'permiso_circulacion';
  if (t === 'ficha_tecnica') return 'ficha_tecnica';
  if (t === 'itv') return 'itv';
  if (t === 'seguro') return 'seguro';
  if (t.includes('contrato')) return 'contrato_compraventa';
  if (t.includes('factura')) return 'factura_compra';
  return 'otro';
}

export function emptyVehicleOcrDraft(): VehicleOcrDraft {
  return {
    brand: '',
    model: '',
    version: '',
    year: String(new Date().getFullYear()),
    registrationPlate: '',
    vin: '',
    mileage: '',
    color: '',
    fuelType: '',
    transmission: '',
    power: '',
    purchasePrice: '',
    salePrice: '',
    notes: '',
    ownerName: '',
    ownerNif: '',
    documentType: null,
    documentTypeLabel: null,
    confidenceScore: null,
  };
}
