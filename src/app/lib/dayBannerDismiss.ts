/**
 * Cierre de banners “hasta mañana”: guardamos el día local (YYYY-MM-DD).
 * Tras medianoche el día cambia y el banner puede volver a mostrarse.
 */

export function localCalendarDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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
