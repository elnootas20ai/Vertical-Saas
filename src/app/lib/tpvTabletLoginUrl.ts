import { AUTH_PATHS } from './authEntryPaths';

export function normalizeTpvTabletCode(raw: unknown): string {
  return String(raw || '').trim().toUpperCase();
}

export function buildTpvTabletLoginUrl(terminalCode?: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const base = `${origin}${AUTH_PATHS.tpvTabletLogin}`;
  const code = normalizeTpvTabletCode(terminalCode);
  if (!code) return base;
  const url = new URL(base);
  url.searchParams.set('code', code);
  return url.toString();
}

type NavigateFn = (
  path: string,
  options?: { state?: { terminalCode: string } },
) => void;

/** Abre la pantalla de activación TPV tablet (fuera del panel SaaS). */
export function openTpvTabletLogin(
  terminalCode: string,
  mode: 'tab' | 'navigate' = 'tab',
  navigate?: NavigateFn,
): void {
  const code = normalizeTpvTabletCode(terminalCode);
  if (!code) return;

  if (mode === 'tab' && typeof window !== 'undefined') {
    const opened = window.open(buildTpvTabletLoginUrl(code), '_blank', 'noopener,noreferrer');
    if (opened) return;
  }

  if (navigate) {
    navigate(AUTH_PATHS.tpvTabletLogin, { state: { terminalCode: code } });
    return;
  }

  if (typeof window !== 'undefined') {
    window.location.assign(buildTpvTabletLoginUrl(code));
  }
}
