import type { FiscalFormInput, FiscalResult } from './compraventaFiscalCalculator';

export type FiscalHistoryEntry = {
  id: string;
  savedAt: string;
  form: FiscalFormInput;
  summary: {
    vehicleLabel: string;
    origin: string;
    seller: string;
    regimeLabel: string;
    invoiceTotal: number | null;
    vat303: number | null;
    rebuEligible: boolean;
  };
};

const STORAGE_PREFIX = 'vertial.compraventa.fiscal.v1';

function storageKey(businessId: string): string {
  return `${STORAGE_PREFIX}.${businessId || 'default'}`;
}

export function loadFiscalHistory(businessId: string): FiscalHistoryEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(businessId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FiscalHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFiscalHistory(businessId: string, entries: FiscalHistoryEntry[]): void {
  localStorage.setItem(storageKey(businessId), JSON.stringify(entries.slice(0, 50)));
}

export function appendFiscalHistoryEntry(
  businessId: string,
  form: FiscalFormInput,
  result: FiscalResult,
  originLabel: string,
  sellerLabel: string,
): FiscalHistoryEntry {
  const entry: FiscalHistoryEntry = {
    id: `fiscal-${Date.now()}`,
    savedAt: new Date().toISOString(),
    form: { ...form },
    summary: {
      vehicleLabel: result.vehicleLabel,
      origin: originLabel,
      seller: sellerLabel,
      regimeLabel: result.sale?.regimeLabel ?? result.purchase?.operationLabel ?? 'Consulta compra',
      invoiceTotal: result.sale?.invoiceTotal ?? null,
      vat303: result.sale?.vatQuota303 ?? result.purchase?.vatNetEffect ?? null,
      rebuEligible: result.purchase?.rebuEligible ?? false,
    },
  };
  const prev = loadFiscalHistory(businessId);
  saveFiscalHistory(businessId, [entry, ...prev.filter((e) => e.id !== entry.id)]);
  return entry;
}

export function removeFiscalHistoryEntry(businessId: string, entryId: string): void {
  const next = loadFiscalHistory(businessId).filter((e) => e.id !== entryId);
  saveFiscalHistory(businessId, next);
}
