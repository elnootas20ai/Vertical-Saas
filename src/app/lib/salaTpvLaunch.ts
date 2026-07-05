const TERMINAL_KEY = 'vertial.sala.openTpvTerminal';
const PDV_KEY = 'vertial.sala.openTpvPdv';
const TABLE_KEY = 'vertial.sala.openTpvTable';

export type SalaTpvOpenTablePayload = {
  tableId: string;
  orderId?: string;
};

export function writeSalaTpvLaunch(terminalId: string, pdvId?: string): void {
  const id = String(terminalId || '').trim();
  const pdv = String(pdvId || '').trim();
  try {
    if (id) sessionStorage.setItem(TERMINAL_KEY, id);
    if (pdv) sessionStorage.setItem(PDV_KEY, pdv);
  } catch {
    /* ignore */
  }
}

export function consumeSalaTpvPdvLaunch(): string | null {
  try {
    const id = String(sessionStorage.getItem(PDV_KEY) || '').trim();
    sessionStorage.removeItem(PDV_KEY);
    return id || null;
  } catch {
    return null;
  }
}

export function consumeSalaTpvLaunch(): string | null {
  try {
    const id = String(sessionStorage.getItem(TERMINAL_KEY) || '').trim();
    sessionStorage.removeItem(TERMINAL_KEY);
    return id || null;
  } catch {
    return null;
  }
}

export function writeSalaTpvOpenTable(payload: SalaTpvOpenTablePayload): void {
  const tableId = String(payload.tableId || '').trim();
  if (!tableId) return;
  try {
    sessionStorage.setItem(
      TABLE_KEY,
      JSON.stringify({
        tableId,
        orderId: String(payload.orderId || '').trim() || undefined,
      }),
    );
  } catch {
    /* ignore */
  }
}

export function consumeSalaTpvOpenTable(): SalaTpvOpenTablePayload | null {
  try {
    const raw = sessionStorage.getItem(TABLE_KEY);
    sessionStorage.removeItem(TABLE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SalaTpvOpenTablePayload;
    const tableId = String(parsed?.tableId || '').trim();
    if (!tableId) return null;
    return {
      tableId,
      orderId: String(parsed.orderId || '').trim() || undefined,
    };
  } catch {
    return null;
  }
}

export function peekSalaTpvOpenTable(): SalaTpvOpenTablePayload | null {
  try {
    const raw = sessionStorage.getItem(TABLE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SalaTpvOpenTablePayload;
    const tableId = String(parsed?.tableId || '').trim();
    if (!tableId) return null;
    return {
      tableId,
      orderId: String(parsed.orderId || '').trim() || undefined,
    };
  } catch {
    return null;
  }
}
