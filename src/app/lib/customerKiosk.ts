export type CustomerKioskLock = {
  token: string;
  webSlug: string;
  salesPointId: string;
  salesPointName: string;
  storeName: string;
};

const STORAGE_KEY = 'vertial:customer-kiosk-lock';

export function writeCustomerKioskLock(value: CustomerKioskLock): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function readCustomerKioskLock(): CustomerKioskLock | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null') as CustomerKioskLock | null;
    return value?.token && value?.salesPointId ? value : null;
  } catch {
    return null;
  }
}
