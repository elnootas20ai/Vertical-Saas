/** Scope PDV/terminal del TPV carnicería (compartido básculas + TPV). */

import {
  listPointsOfSaleRequest,
  createPointOfSaleRequest,
  type PointOfSale,
} from './deliveryApi';

export const BUTCHER_TPV_PDV_LS = 'butcher_tpv_pdv_id';
export const BUTCHER_TPV_TERMINAL_LS = 'butcher_tpv_terminal_id';
const BUTCHER_PDV_NAME = 'Mostrador carnicería';

export function persistButcherTpvIds(pdvId: string, terminalId: string) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(BUTCHER_TPV_PDV_LS, pdvId);
  localStorage.setItem(BUTCHER_TPV_TERMINAL_LS, terminalId);
}

export function readButcherTpvIds(): { pdvId: string; terminalId: string } {
  if (typeof localStorage === 'undefined') {
    return { pdvId: '', terminalId: '' };
  }
  return {
    pdvId: localStorage.getItem(BUTCHER_TPV_PDV_LS) || '',
    terminalId: localStorage.getItem(BUTCHER_TPV_TERMINAL_LS) || '',
  };
}

function pickTerminal(pdv: PointOfSale, preferredTerminalId?: string) {
  const terminals = pdv.terminals || [];
  return (
    terminals.find((t) => t.id === preferredTerminalId)
    || terminals.find((t) => t.active !== false)
    || terminals[0]
  );
}

/** Lista PDVs activos (para selector multi-mostrador). */
export async function listButcherPdvOptions(userId: string): Promise<PointOfSale[]> {
  const list = await listPointsOfSaleRequest(userId, { includeInactive: false }).catch(() => [] as PointOfSale[]);
  return list.filter((p) => p.active !== false);
}

/** Cambia el PDV activo del TPV carnicería. */
export async function selectButcherTpvPdv(
  userId: string,
  pdvId: string,
): Promise<{ pdv: PointOfSale; terminalId: string }> {
  const list = await listPointsOfSaleRequest(userId, { includeInactive: true }).catch(() => [] as PointOfSale[]);
  const pdv = list.find((p) => p._id === pdvId);
  if (!pdv) throw new Error('Punto de venta no encontrado');
  const terminal = pickTerminal(pdv);
  if (!terminal?.id) {
    throw new Error('El punto de venta no tiene terminal TPV. Crea uno en Ajustes → Tienda.');
  }
  persistButcherTpvIds(pdv._id, terminal.id);
  return { pdv, terminalId: terminal.id };
}

/** Asegura PDV + terminal reales (crea «Mostrador carnicería» si no hay). */
export async function ensureButcherTpvTarget(userId: string, preferredPdvId?: string): Promise<{
  pdv: PointOfSale;
  terminalId: string;
}> {
  const list = await listPointsOfSaleRequest(userId, { includeInactive: true }).catch(() => [] as PointOfSale[]);
  const saved = readButcherTpvIds();
  const wantId = preferredPdvId || saved.pdvId;
  let pdv =
    list.find((p) => p._id === wantId)
    || list.find((p) => /carnicer/i.test(String(p.name || '')) || /BUTCHER|CARN/i.test(String(p.code || '')))
    || list.find((p) => (p.terminals || []).some((t) => t.active !== false))
    || null;

  if (!pdv) {
    pdv = await createPointOfSaleRequest(userId, {
      name: BUTCHER_PDV_NAME,
      code: 'CARN-01',
      address: '',
      active: true,
      preserveDisplayName: true,
    } as Partial<PointOfSale>);
  }

  const terminal = pickTerminal(pdv, saved.terminalId);

  if (!terminal?.id) {
    throw new Error('El punto de venta no tiene terminal TPV. Crea uno en Ajustes → Tienda.');
  }

  persistButcherTpvIds(pdv._id, terminal.id);
  return { pdv, terminalId: terminal.id };
}
