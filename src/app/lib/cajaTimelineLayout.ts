/**
 * Core — posicionamiento de barras 00:00–24:00 para el timeline de Caja.
 */
import type { TpvRegisterSession } from './deliveryApi';
import {
  isTpvRegisterSessionFromPriorCalendarDay,
  localCalendarDayKey,
  localDayBoundsForKey,
} from './tpvCajaScope';

export type CajaTimelineBarKind = 'live' | 'closed' | 'warn';

export type CajaTimelineBar = {
  sessionId: string;
  kind: CajaTimelineBarKind;
  /** % desde 00:00 del día seleccionado */
  leftPct: number;
  /** % de ancho sobre las 24h */
  widthPct: number;
  label: string;
  title: string;
};

export type CajaTimelineTrack = {
  pdvId: string;
  storeName: string;
  subLabel: string;
  bars: CajaTimelineBar[];
};

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Minutos 0–1440 → porcentaje 0–100 */
export function minutesToPct(minutes: number): number {
  return clamp((minutes / 1440) * 100, 0, 100);
}

export function nowMinutesOfDay(now = new Date()): number {
  return minutesOfDay(now);
}

export function formatClock(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatMoneyEs(n: number): string {
  return `${n.toFixed(2).replace('.', ',')}€`;
}

function barKindForSession(session: TpvRegisterSession, selectedDate: string, now: Date): CajaTimelineBarKind {
  if (session.status === 'open' && isTpvRegisterSessionFromPriorCalendarDay(session, now)) {
    return 'warn';
  }
  if (session.status === 'open') return 'live';
  // Cerrada pero abierta otro día y activa ese día = arrastrada histórica
  const openKey = localCalendarDayKey(new Date(session.openedAt));
  if (openKey && openKey !== selectedDate && session.status === 'closed') {
    return 'closed';
  }
  return 'closed';
}

function barLabel(session: TpvRegisterSession, kind: CajaTimelineBarKind): string {
  const worker = String(session.workerName || '—').split(' ')[0] || '—';
  if (kind === 'warn') return `arrastrada · ${worker}`;
  if (kind === 'live') return `${worker} · en curso`;
  return worker;
}

function barTitle(session: TpvRegisterSession, kind: CajaTimelineBarKind, selectedDate: string): string {
  const open = formatClock(session.openedAt);
  if (kind === 'warn') {
    const day = new Date(session.openedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    return `Arrastrada desde el ${day} · ${open} hasta ahora`;
  }
  if (kind === 'live') return `Desde ${open} · en curso`;
  const close = formatClock(session.closedAt);
  const openKey = localCalendarDayKey(new Date(session.openedAt));
  if (openKey !== selectedDate) {
    return `${open} (${openKey}) – ${close}`;
  }
  return `${open} – ${close}`;
}

/**
 * Intervalo del turno recortado al día seleccionado (minutos 0–1440).
 * Sesiones abiertas de días previos: 0 → ahora (si el día es hoy) o 0→1440.
 */
export function sessionBarRangeOnDay(
  session: TpvRegisterSession,
  selectedDate: string,
  now = new Date(),
): { startMin: number; endMin: number } | null {
  const openedAt = session.openedAt ? new Date(session.openedAt) : null;
  if (!openedAt || Number.isNaN(openedAt.getTime())) return null;

  const dayBounds = localDayBoundsForKey(selectedDate);
  const dayStart = new Date(dayBounds.from).getTime();
  const dayEnd = new Date(dayBounds.to).getTime();
  const openMs = openedAt.getTime();
  const closeMs = session.status === 'open'
    ? now.getTime()
    : (session.closedAt ? new Date(session.closedAt).getTime() : now.getTime());

  if (!Number.isFinite(closeMs) || closeMs < dayStart || openMs > dayEnd) return null;

  const clippedStart = Math.max(openMs, dayStart);
  const clippedEnd = Math.min(closeMs, dayEnd);
  if (clippedEnd <= clippedStart) return null;

  const startMin = (clippedStart - dayStart) / 60000;
  let endMin = (clippedEnd - dayStart) / 60000;

  // Sesión abierta: hasta "ahora" si es el día de hoy
  if (session.status === 'open' && selectedDate === localCalendarDayKey(now)) {
    endMin = Math.max(endMin, minutesOfDay(now));
  }

  // Ancho mínimo visual (~12 min ≈ 0.8%)
  if (endMin - startMin < 12) endMin = startMin + 12;

  return {
    startMin: clamp(startMin, 0, 1440),
    endMin: clamp(endMin, 0, 1440),
  };
}

export function buildCajaTimelineTracks(
  sessions: TpvRegisterSession[],
  selectedDate: string,
  now = new Date(),
): CajaTimelineTrack[] {
  const byPdv = new Map<string, TpvRegisterSession[]>();
  for (const s of sessions) {
    const id = String(s.pointOfSaleId || '_sin_tienda').trim();
    const list = byPdv.get(id) || [];
    list.push(s);
    byPdv.set(id, list);
  }

  const tracks: CajaTimelineTrack[] = [];
  for (const [pdvId, list] of byPdv) {
    const storeName = list[0]?.pointOfSaleName || 'Tienda';
    const terminals = [...new Set(list.map((s) => s.terminalName).filter(Boolean))];
    const codeHint = pdvId !== '_sin_tienda' && pdvId.length <= 12 ? pdvId.slice(0, 8) : '';
    const subLabel = [codeHint, terminals[0]].filter(Boolean).join(' · ') || '—';

    const bars: CajaTimelineBar[] = [];
    for (const session of list) {
      const range = sessionBarRangeOnDay(session, selectedDate, now);
      if (!range) continue;
      const kind = barKindForSession(session, selectedDate, now);
      const leftPct = minutesToPct(range.startMin);
      const widthPct = Math.max(0.9, minutesToPct(range.endMin) - leftPct);
      bars.push({
        sessionId: session._id,
        kind,
        leftPct,
        widthPct,
        label: barLabel(session, kind),
        title: barTitle(session, kind, selectedDate),
      });
    }

    if (bars.length === 0) continue;
    tracks.push({ pdvId, storeName, subLabel, bars });
  }

  return tracks.sort((a, b) => a.storeName.localeCompare(b.storeName, 'es'));
}
