/** Origen API de producción para builds nativos (TestFlight / Play Store). */
export const NATIVE_PRODUCTION_API_ORIGIN = 'https://vertialapp.com';

/** Orígenes que no deben usarse nunca como API en app nativa empaquetada. */
export function isUnsafeNativeApiOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) {
      return true;
    }
    if (host.startsWith('10.')) return true;
    if (host.startsWith('192.168.')) return true;
    const private172 = /^172\.(\d+)\./.exec(host);
    if (private172) {
      const second = Number(private172[1]);
      if (second >= 16 && second <= 31) return true;
    }
    if (u.protocol !== 'https:') return true;
    return false;
  } catch {
    return true;
  }
}

export function enforceNativeProductionApiOrigin(origin: string): string {
  const trimmed = origin.replace(/\/+$/, '');
  if (!trimmed || isUnsafeNativeApiOrigin(trimmed)) {
    return NATIVE_PRODUCTION_API_ORIGIN;
  }
  return trimmed;
}
