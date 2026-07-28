/**
 * Core — export Excel acumulativo de cierres de caja TPV.
 * Sirve a cualquier vertical (delivery, restaurant, …) desde la sesión `TpvRegisterSession`.
 * Las columnas de apps delivery solo se añaden por plataforma si hay algún valor ≠ 0.
 */
import * as XLSX from 'xlsx';
import type { TpvRegisterSession } from './deliveryApi';
import { AGGREGATOR_PLATFORMS, type AggregatorPlatformDef } from './deliveryIntegrationsUi';
import { localCalendarDayKey } from './tpvCajaScope';

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function fmtNum(n: number): number {
  return round2(n);
}

function fmtDay(iso: string | undefined): string {
  const raw = String(iso || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return localCalendarDayKey(d);
}

function fmtTime(iso: string | undefined): string {
  const raw = String(iso || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function channelCash(session: TpvRegisterSession, channel: string): number {
  return round2(Number(session.aggregatorClosingCash?.[channel] || 0));
}

function channelCard(session: TpvRegisterSession, channel: string): number {
  return round2(Number(session.aggregatorClosingCard?.[channel] || 0));
}

function channelFood(
  session: TpvRegisterSession,
  channel: string,
  key: 'pizza' | 'burger' | 'taco',
): number {
  return Math.max(0, Math.floor(Number(session.productClosingCounts?.byChannel?.[channel]?.[key] || 0)));
}

function platformHasNonZeroData(sessions: TpvRegisterSession[], channel: string): boolean {
  for (const s of sessions) {
    if (channelCash(s, channel) > 0) return true;
    if (channelCard(s, channel) > 0) return true;
    if (round2(Number(s.aggregatorClosingTotals?.[channel] || 0)) > 0) return true;
    if (channelFood(s, channel, 'pizza') > 0) return true;
    if (channelFood(s, channel, 'burger') > 0) return true;
    if (channelFood(s, channel, 'taco') > 0) return true;
  }
  return false;
}

/**
 * Solo plataformas con algún importe/unidades ≠ 0 en el lote a exportar.
 * Evita columnas Glovo/Uber/Just Eat/Flipdish llenas de ceros.
 */
export function selectAggregatorPlatformsForExcel(
  sessions: TpvRegisterSession[],
): AggregatorPlatformDef[] {
  return AGGREGATOR_PLATFORMS.filter((p) => platformHasNonZeroData(sessions, p.channel));
}

/**
 * Quita basura técnica de notas de cierre para el Excel (IDs de sesión TPV).
 * Conserva el texto humano. Ej.: `tpvreg-…`, `tpvrge.…`, `tpv_session:…`.
 */
export function sanitizeClosingNotesForExcel(raw: string | null | undefined): string {
  let s = String(raw ?? '');
  // Notas de sync financiero primero (incluye el id embebido)
  s = s.replace(/\btpv_session:[^\s;,)]*/gi, '');
  // Sesión CouchDB: tpvreg-<uuid> (también tpvrge.… / puntos si el ID se truncó al copiar)
  s = s.replace(/\btpvr(?:eg|ge)[-.][a-z0-9][a-z0-9.-]*/gi, '');
  // Restos tipo orders_synced:12.50 pegados a notas técnicas
  s = s.replace(/\borders_synced:[^\s;,)]*/gi, '');
  s = s.replace(/\s{2,}/g, ' ').replace(/^[\s.,;:·|/\-–—]+|[\s.,;:·|/\-–—]+$/g, '').trim();
  return s;
}

export type CajaClosingsExcelOptions = {
  fileName?: string;
  /**
   * `true` → incluir apps (solo plataformas con datos).
   * `false` → nunca columnas de apps.
   * omitido → auto (plataformas con datos).
   */
  includeAggregatorApps?: boolean;
};

/** Cabecera + filas de la hoja principal (sin escribir archivo). Útil en tests. */
export function buildAccumulatedCajaClosingsAoa(
  sessions: TpvRegisterSession[],
  opts?: Pick<CajaClosingsExcelOptions, 'includeAggregatorApps'>,
): { header: string[]; rows: unknown[][]; platforms: AggregatorPlatformDef[] } {
  const closed = sessions
    .filter((s) => String(s.status || '').toLowerCase() !== 'open')
    .slice()
    .sort((a, b) => String(a.openedAt || '').localeCompare(String(b.openedAt || '')));

  const platforms =
    opts?.includeAggregatorApps === false
      ? []
      : selectAggregatorPlatformsForExcel(closed);
  const includeApps = platforms.length > 0;

  const header = [
    'Fecha',
    'Apertura',
    'Cierre',
    'Tienda',
    'Terminal',
    'Quien abrió',
    'Estado',
    'Validación',
    'Pizzas',
    'Burgers',
    'Tacos',
    'Unidades',
    'Efectivo TPV (cobros)',
    'Tarjeta TPV (cobros)',
    'Bizum TPV',
    'Online TPV',
    'Otros TPV',
    'Cobros TPV total',
    ...(includeApps
      ? platforms.flatMap((p) => [
          `${p.label} pizzas`,
          `${p.label} burgers`,
          `${p.label} tacos`,
          `${p.label} efectivo`,
          `${p.label} tarjeta`,
        ])
      : []),
    ...(includeApps ? ['Efectivo apps total', 'Tarjeta apps total'] : []),
    'Fondo inicial',
    'Esperado en caja',
    'Contado',
    'Diferencia',
    'Notas cierre',
  ];

  const rows: unknown[][] = [header];

  for (const s of closed) {
    const pizza = Math.max(0, Math.floor(Number(s.productClosingCounts?.pizza || 0)));
    const burger = Math.max(0, Math.floor(Number(s.productClosingCounts?.burger || 0)));
    const taco = Math.max(0, Math.floor(Number(s.productClosingCounts?.taco || 0)));
    const method = s.summary?.salesByMethod || {
      efectivo: 0,
      tarjeta: 0,
      bizum: 0,
      online: 0,
      otro: 0,
    };
    const tpvCash = round2(Number(method.efectivo || 0));
    const tpvCard = round2(Number(method.tarjeta || 0));
    const tpvBizum = round2(Number(method.bizum || 0));
    const tpvOnline = round2(Number(method.online || 0));
    const tpvOther = round2(Number(method.otro || 0));
    const tpvTotal = round2(Number(s.summary?.totalSales || tpvCash + tpvCard + tpvBizum + tpvOnline + tpvOther));

    let appsCash = 0;
    let appsCard = 0;
    const appCols: unknown[] = [];
    if (includeApps) {
      for (const p of platforms) {
        const ch = p.channel;
        const cash = channelCash(s, ch);
        const card = channelCard(s, ch);
        appsCash += cash;
        appsCard += card;
        appCols.push(
          channelFood(s, ch, 'pizza'),
          channelFood(s, ch, 'burger'),
          channelFood(s, ch, 'taco'),
          fmtNum(cash),
          fmtNum(card),
        );
      }
      appCols.push(fmtNum(appsCash), fmtNum(appsCard));
    }

    const statusLabel =
      s.status === 'closed'
        ? 'Cerrada'
        : s.status === 'pending_review'
          ? 'Pendiente revisión'
          : String(s.status || '');
    const validation =
      s.closingValidationStatus === 'validated'
        ? 'Validada'
        : s.closingValidationStatus === 'rejected'
          ? 'Rechazada'
          : s.closingValidationStatus === 'pending'
            ? 'Pendiente'
            : '';

    rows.push([
      fmtDay(s.openedAt),
      fmtTime(s.openedAt),
      fmtTime(s.closedAt),
      s.pointOfSaleName || '',
      s.terminalName || '',
      s.workerName || s.openedBy || '',
      statusLabel,
      validation,
      pizza,
      burger,
      taco,
      pizza + burger + taco,
      fmtNum(tpvCash),
      fmtNum(tpvCard),
      fmtNum(tpvBizum),
      fmtNum(tpvOnline),
      fmtNum(tpvOther),
      fmtNum(tpvTotal),
      ...appCols,
      fmtNum(Number(s.initialCashAmount || 0)),
      fmtNum(Number(s.expectedCash || 0)),
      fmtNum(Number(s.finalCashAmount || 0)),
      fmtNum(Number(s.difference || 0)),
      sanitizeClosingNotesForExcel(s.closingNotes),
    ]);
  }

  return { header, rows, platforms };
}

/**
 * Excel acumulativo: una fila por cierre (histórico completo, no un archivo por día).
 */
export function downloadAccumulatedCajaClosingsExcel(
  sessions: TpvRegisterSession[],
  opts?: CajaClosingsExcelOptions,
): { rows: number } {
  const { header, rows, platforms } = buildAccumulatedCajaClosingsAoa(sessions, opts);
  const includeApps = platforms.length > 0;
  const closedCount = rows.length - 1;

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = header.map((h) => ({ wch: Math.min(28, Math.max(12, String(h).length + 2)) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Cierres acumulados');

  const closed = sessions
    .filter((s) => String(s.status || '').toLowerCase() !== 'open')
    .slice()
    .sort((a, b) => String(a.openedAt || '').localeCompare(String(b.openedAt || '')));

  const byDay = new Map<string, {
    pizza: number;
    burger: number;
    taco: number;
    tpv: number;
    appsCash: number;
    appsCard: number;
    expected: number;
    counted: number;
    closes: number;
  }>();
  for (const s of closed) {
    const day = fmtDay(s.openedAt) || 'sin-fecha';
    const cur = byDay.get(day) || {
      pizza: 0,
      burger: 0,
      taco: 0,
      tpv: 0,
      appsCash: 0,
      appsCard: 0,
      expected: 0,
      counted: 0,
      closes: 0,
    };
    cur.pizza += Math.max(0, Math.floor(Number(s.productClosingCounts?.pizza || 0)));
    cur.burger += Math.max(0, Math.floor(Number(s.productClosingCounts?.burger || 0)));
    cur.taco += Math.max(0, Math.floor(Number(s.productClosingCounts?.taco || 0)));
    cur.tpv += round2(Number(s.summary?.totalSales || 0));
    if (includeApps) {
      for (const p of platforms) {
        cur.appsCash += channelCash(s, p.channel);
        cur.appsCard += channelCard(s, p.channel);
      }
    }
    cur.expected += round2(Number(s.expectedCash || 0));
    cur.counted += round2(Number(s.finalCashAmount || 0));
    cur.closes += 1;
    byDay.set(day, cur);
  }

  const dayHeader = [
    'Fecha',
    'Cierres',
    'Pizzas',
    'Burgers',
    'Tacos',
    'Unidades',
    'Cobros TPV',
    ...(includeApps ? ['Efectivo apps', 'Tarjeta apps'] : []),
    'Esperado caja',
    'Contado',
    'Diferencia',
  ];
  const dayRows: unknown[][] = [dayHeader];
  for (const day of [...byDay.keys()].sort()) {
    const d = byDay.get(day)!;
    dayRows.push([
      day,
      d.closes,
      d.pizza,
      d.burger,
      d.taco,
      d.pizza + d.burger + d.taco,
      fmtNum(d.tpv),
      ...(includeApps ? [fmtNum(d.appsCash), fmtNum(d.appsCard)] : []),
      fmtNum(d.expected),
      fmtNum(d.counted),
      fmtNum(d.counted - d.expected),
    ]);
  }
  const wsDay = XLSX.utils.aoa_to_sheet(dayRows);
  wsDay['!cols'] = dayHeader.map(() => ({ wch: 14 }));
  XLSX.utils.book_append_sheet(wb, wsDay, 'Resumen por día');

  const stamp = localCalendarDayKey(new Date());
  const fileName = opts?.fileName || `cierres-caja-acumulado-${stamp}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { rows: closedCount };
}
