const STORAGE_KEY = 'vertial.sala.openTpvTerminal';

export function writeSalaTpvLaunch(terminalId: string): void {
  const id = String(terminalId || '').trim();
  if (!id) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function consumeSalaTpvLaunch(): string | null {
  try {
    const id = String(sessionStorage.getItem(STORAGE_KEY) || '').trim();
    sessionStorage.removeItem(STORAGE_KEY);
    return id || null;
  } catch {
    return null;
  }
}
