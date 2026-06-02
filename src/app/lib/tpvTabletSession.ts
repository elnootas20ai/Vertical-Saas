export interface TpvTabletBinding {
  terminalCode: string;
  pdvId: string;
  workCenterId: string;
  businessId: string;
  dataUserId: string;
  pdvName?: string;
  businessName?: string;
  boundAt: string;
}

const STORAGE_KEY = 'vertial_tpv_tablet_binding';

export function readTpvTabletBinding(): TpvTabletBinding | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TpvTabletBinding;
    if (!parsed?.terminalCode || !parsed?.pdvId || !parsed?.businessId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeTpvTabletBinding(binding: Omit<TpvTabletBinding, 'boundAt'> & { boundAt?: string }): void {
  try {
    const payload: TpvTabletBinding = {
      ...binding,
      terminalCode: String(binding.terminalCode || '').trim().toUpperCase(),
      boundAt: binding.boundAt || new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function clearTpvTabletBinding(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function isTpvTabletBound(): boolean {
  return readTpvTabletBinding() !== null;
}
