export const WORKSHOP_DATA_CHANGED = 'workshop:data-changed';

export type WorkshopScope = { businessId?: string };

export function notifyWorkshopDataChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WORKSHOP_DATA_CHANGED));
}
