/**
 * Remount bar/restaurante: solo con «Rehacer mapa» o ?reset=1.
 * Si ya hay mesas, nunca se fuerza el asistente solo.
 */

const KEY_PREFIX = 'vertial.restaurant.professionalRemount:v1:';

function normalizeBusinessId(value: string | null | undefined): string {
  return String(value || '').replace(/^business:/, '').trim();
}

function keyFor(businessId: string): string {
  return `${KEY_PREFIX}${normalizeBusinessId(businessId)}`;
}

export function markRestaurantSalaRemountDone(businessId: string): void {
  const bid = normalizeBusinessId(businessId);
  if (!bid || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(keyFor(bid), 'done');
  } catch {
    /* ignore */
  }
}

export function markRestaurantSalaRemountWiped(businessId: string): void {
  const bid = normalizeBusinessId(businessId);
  if (!bid || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(keyFor(bid), 'wiped');
  } catch {
    /* ignore */
  }
}

/** Limpia flag (antes de wipe explícito). */
export function clearRestaurantSalaRemountDone(businessId: string): void {
  const bid = normalizeBusinessId(businessId);
  if (!bid || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(keyFor(bid));
  } catch {
    /* ignore */
  }
}

/**
 * Solo true con reset explícito (?reset=1 / Rehacer mapa).
 * Nunca borra un local ya montado al entrar en Sala.
 */
export function shouldForceRestaurantSalaRemount(
  _businessId: string,
  wantReset: boolean,
): boolean {
  return wantReset;
}
