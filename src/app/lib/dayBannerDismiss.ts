/**
 * Cierre de banners “hasta mañana”: guardamos el día local (YYYY-MM-DD).
 * Tras medianoche el día cambia y el banner puede volver a mostrarse.
 */

export { localCalendarDayKey } from './tpvCajaScope';
import { localCalendarDayKey } from './tpvCajaScope';

export function isBannerDismissedForLocalToday(storageKey: string): boolean {
  if (!storageKey) return false;
  try {
    return localStorage.getItem(storageKey) === localCalendarDayKey();
  } catch {
    return false;
  }
}

export function dismissBannerForRestOfLocalDay(storageKey: string): void {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, localCalendarDayKey());
  } catch {
    /* ignore */
  }
}
