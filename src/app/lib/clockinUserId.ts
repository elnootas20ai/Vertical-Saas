/** Misma normalización que el backend (account:uuid → uuid). */
export function normalizeClockinUserId(id: string | null | undefined): string {
  return String(id || '').trim().replace(/^account:/, '');
}
