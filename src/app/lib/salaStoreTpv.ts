import { findTerminalForRoom } from './salaRoomTerminal';
import { pickDefaultActivePdvId } from './deliveryOpsPdvSelection';
import type { SalaRoom } from './salaStudioTypes';

type PdvLike = {
  _id: string;
  name?: string;
  code?: string;
  terminalCode?: string;
  terminals?: Array<{
    id: string;
    code?: string;
    name?: string;
    active?: boolean;
    salaRoomId?: string;
  }>;
};

type SessionLike = {
  pointOfSaleId?: string;
  status?: string;
  openedAt?: string;
};

export type SalaTpvDisplay = {
  pdvId: string;
  pdvLabel: string;
  terminalCode: string;
  terminalId: string;
  terminalLabel: string;
  cajaOpen: boolean;
  cajaOpenedAt?: string;
  /** Usa el terminal compartido de la tienda (no uno exclusivo de sala). */
  sharedWithStore: boolean;
};

function pdvDisplayLabel(p: Pick<PdvLike, 'name' | 'code'>): string {
  const code = String(p.code || '').trim();
  const name = String(p.name || '').trim();
  if (name && code) return `${name} · ${code}`;
  return name || code || 'Punto de venta';
}

function isSessionOpen(session: SessionLike | null | undefined): boolean {
  return Boolean(session && String(session.status || '').toLowerCase() === 'open');
}

/** Código de 6 caracteres para activar la tablet TPV (p. ej. K7M2NP). */
function isTabletActivationCode(code: string): boolean {
  return /^[A-Z2-9]{6}$/.test(String(code || '').trim().toUpperCase());
}

function resolveCopyableTpvCode(
  pdv: PdvLike,
  terminal: { code?: string } | undefined,
  roomHasOwnTerminal: boolean,
): string {
  const termCode = String(terminal?.code || '').trim().toUpperCase();
  const pdvCode = String(pdv.terminalCode || '').trim().toUpperCase();

  if (roomHasOwnTerminal && isTabletActivationCode(termCode)) return termCode;
  if (isTabletActivationCode(pdvCode)) return pdvCode;
  if (isTabletActivationCode(termCode)) return termCode;

  return pdvCode || termCode;
}

export function resolveParentPdvFromScope(
  parentPdvId: string,
  rooms: SalaRoom[],
  pointsOfSale: PdvLike[],
): PdvLike | null {
  const pdvs = pointsOfSale.filter((p) => (p as { active?: boolean }).active !== false);
  if (pdvs.length === 0) return null;

  const preferredId = String(parentPdvId || '').trim();
  if (preferredId) {
    const hit = pdvs.find((p) => p._id === preferredId);
    if (hit) return hit;
  }

  const linkedId = String(rooms.find((r) => String(r.pdvId || '').trim())?.pdvId || '').trim();
  if (linkedId) {
    const hit = pdvs.find((p) => p._id === linkedId);
    if (hit) return hit;
  }

  const defaultId = pickDefaultActivePdvId(pdvs);
  return defaultId ? pdvs.find((p) => p._id === defaultId) || null : null;
}

function sessionMatchesPdv(
  session: SessionLike,
  pdv: PdvLike,
): boolean {
  const sp = String(session.pointOfSaleId || '').trim();
  const pdvId = String(pdv._id || '').trim();
  const wcId = String((pdv as { workCenterId?: string }).workCenterId || '').trim();
  if (!sp) return false;
  if (sp === pdvId) return true;
  if (wcId && sp === wcId) return true;
  return false;
}

export function resolveSalaTpvDisplay(
  pdv: PdvLike,
  room: SalaRoom | null | undefined,
  sessions: SessionLike[],
): SalaTpvDisplay {
  const pdvLabel = pdvDisplayLabel(pdv);
  const roomTerminal = room ? findTerminalForRoom(pdv, room) : undefined;
  const activeTerminals = (pdv.terminals || []).filter((t) => t.active !== false);
  const storeDefault =
    activeTerminals.find((t) => String(t.code || '').trim().toUpperCase() === 'TABLET')
    || activeTerminals.find((t) => !String(t.salaRoomId || '').trim())
    || activeTerminals[0];
  const terminal = roomTerminal || storeDefault;
  const terminalCode = resolveCopyableTpvCode(pdv, terminal, Boolean(roomTerminal));
  const openMatches = sessions.filter(
    (s) => isSessionOpen(s) && sessionMatchesPdv(s, pdv),
  );
  const openSession =
    openMatches.length === 0
      ? undefined
      : [...openMatches].sort((a, b) =>
          String(b.openedAt || '').localeCompare(String(a.openedAt || '')),
        )[0];
  return {
    pdvId: pdv._id,
    pdvLabel,
    terminalCode,
    terminalId: String(terminal?.id || '').trim(),
    terminalLabel: String(terminal?.name || pdvLabel).trim(),
    cajaOpen: Boolean(openSession),
    cajaOpenedAt: openSession?.openedAt,
    sharedWithStore: !roomTerminal,
  };
}
