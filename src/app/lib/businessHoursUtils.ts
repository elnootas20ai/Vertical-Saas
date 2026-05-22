import type { BusinessHoursConfig } from './settingsApi';

export const DEFAULT_BUSINESS_HOURS_CONFIG: BusinessHoursConfig = {
  timezone: 'Europe/Madrid',
  schedule: {
    monday: { open: true, from: '09:00', to: '19:00' },
    tuesday: { open: true, from: '09:00', to: '19:00' },
    wednesday: { open: true, from: '09:00', to: '19:00' },
    thursday: { open: true, from: '09:00', to: '19:00' },
    friday: { open: true, from: '09:00', to: '19:00' },
    saturday: { open: true, from: '10:00', to: '14:00' },
    sunday: { open: false, from: '10:00', to: '14:00' },
  },
  holidays: [],
  lunchBreak: { enabled: false, from: '14:00', to: '16:00' },
};

import type { WorkCenter } from './workCentersApi';

export function isRetailWorkCenter(centerType: WorkCenter['centerType']): boolean {
  return centerType === 'punto_de_venta' || centerType === 'almacen';
}

export function hasValidBusinessHoursConfig(
  hours: BusinessHoursConfig | null | undefined,
): boolean {
  if (!hours?.schedule) return false;
  return Object.values(hours.schedule).some(
    (d) =>
      d &&
      d.open &&
      typeof d.from === 'string' &&
      typeof d.to === 'string' &&
      d.from.trim() &&
      d.to.trim() &&
      d.from !== d.to,
  );
}

/** Al menos una tienda retail activa con horario válido. */
export function anyActiveRetailStoreHasOpeningHours(workCenters: WorkCenter[]): boolean {
  return workCenters.some(
    (wc) =>
      wc.active !== false &&
      isRetailWorkCenter(wc.centerType) &&
      hasValidBusinessHoursConfig(wc.openingHours),
  );
}
