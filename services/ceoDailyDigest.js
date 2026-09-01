/**
 * Resumen diario al CEO — push corto (platos + €) + campana larga (marcas, cobros, en local).
 * Aplica a todos los negocios con caja TPV (delivery / restaurant / events).
 * Si no hay cierres ese día: aviso corto «Sin cierres…».
 */
import {
  BUSINESSES_DB,
  getDeliveryDbName,
  getAllDocuments,
  ensureDatabase,
  findBusinessById,
} from './couchdb.js';
import {
  emitPositiveAlert,
  fakeReq,
  filterManagementRecipientIds,
  isAlertEmailAdminRole,
} from './alertEmitter.js';
import { sendPushToUser } from './pushService.js';
import logger from './logger.js';

export const CEO_DAILY_DIGEST_RULE_ID = 'ceo_daily_digest';

const CAJA_BUSINESS_TYPES = new Set(['delivery', 'restaurant', 'events', 'food', 'heladeria']);

function bareId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

/**
 * Solo CEO (titular) + Administrador. No gerentes, encargados ni trabajadores.
 */
export function resolveCeoDailyDigestRecipients(business) {
  const recipients = new Set();
  const ownerId = String(business?.owner_user_id || '').trim();
  if (ownerId) recipients.add(ownerId);
  for (const m of business?.members || []) {
    const uid = String(m?.user_id || '').trim();
    if (!uid) continue;
    if (isAlertEmailAdminRole(m.role)) recipients.add(uid);
  }
  return Array.from(recipients);
}

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function fmtEs(n) {
  return money(n).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDayEs(dayKey) {
  const m = String(dayKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dayKey;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** YYYY-MM-DD en Europe/Madrid */
export function madridDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** minutos desde 00:00 Madrid */
export function madridMinutesOfDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

export function parseDigestTimeToMinutes(raw) {
  const s = String(raw || '23:50').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 23 * 60 + 50;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return h * 60 + min;
}

export function shortStoreLabel(name) {
  let s = String(name || 'Tienda').trim();
  s = s.replace(/^LOCAL\s+/i, '');
  const cut = s.split('·')[0].trim();
  return cut || s || 'Tienda';
}

function sessionDayKey(session) {
  const raw = session?.closedAt || session?.openedAt || session?.createdAt;
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return madridDayKey(d);
}

function brandEurosFromSession(session) {
  const labels = session.closingBrandLabels || {};
  const brandTpv = session.closingBrandTpvTotals || {};
  const brandApps = session.aggregatorClosingBrandTotals || {};
  const ids = new Set([
    ...Object.keys(brandTpv),
    ...Object.values(brandApps).flatMap((m) => Object.keys(m || {})),
  ]);
  const rows = [];
  for (const id of ids) {
    const tpv = brandTpv[id] || {};
    let euros = money(Number(tpv.efectivo || 0) + Number(tpv.tarjeta || 0));
    for (const ch of Object.values(brandApps)) {
      euros = money(euros + Number(ch?.[id] || 0));
    }
    if (euros <= 0) continue;
    rows.push({
      id,
      name: String(labels[id] || id).trim() || id.slice(0, 8),
      euros,
    });
  }
  rows.sort((a, b) => b.euros - a.euros);
  return rows;
}

function sumMap(m) {
  return money(Object.values(m || {}).reduce((a, n) => a + (Number(n) || 0), 0));
}

/**
 * Bloque por tienda (sesión cerrada).
 * @returns {object|null}
 */
export function buildStoreDigestBlock(session) {
  if (!session || session.status !== 'closed') return null;
  const name = shortStoreLabel(
    session.pointOfSaleName || session.salesPointName || session.pdvName || 'Tienda',
  );
  const method = session.summary?.salesByMethod || {};
  const efectivoTpv = money(method.efectivo);
  const tarjetaTpv = money(method.tarjeta);
  const aggCash = sumMap(session.aggregatorClosingCash);
  const aggCard = sumMap(session.aggregatorClosingCard);
  const apps = money(sumMap(session.aggregatorClosingTotals) || aggCash + aggCard);
  const tpv = money(Number(session.summary?.totalSales || 0));
  const cobrado = money(tpv + apps);
  const counts = session.productClosingCounts || {};
  const pizza = Math.max(0, Math.floor(Number(counts.pizza || 0)));
  const burger = Math.max(0, Math.floor(Number(counts.burger || 0)));
  const taco = Math.max(0, Math.floor(Number(counts.taco || 0)));
  const cashIn = money(session.summary?.totalCashIn);
  const cashOut = money(session.summary?.totalCashOut);
  const counted = money(session.finalCashAmount);
  const enLocal = money(
    session.nextDayInitialCash != null && session.nextDayInitialCash !== ''
      ? session.nextDayInitialCash
      : counted,
  );
  const retirado = money(Math.max(0, counted - enLocal));
  const difference = money(session.difference);

  return {
    name,
    brands: brandEurosFromSession(session),
    pizza,
    burger,
    taco,
    efectivo: money(efectivoTpv + aggCash),
    tarjeta: money(tarjetaTpv + aggCard),
    cobrado,
    cashIn,
    cashOut,
    enLocal,
    retirado,
    difference,
  };
}

function unitsLine(b) {
  const parts = [];
  if (b.pizza) parts.push(`${b.pizza} pizza${b.pizza === 1 ? '' : 's'}`);
  if (b.burger) parts.push(`${b.burger} burger${b.burger === 1 ? '' : 's'}`);
  if (b.taco) parts.push(`${b.taco} taco${b.taco === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** Push corto: platos + total por tienda */
export function formatCeoDailyPushBody(blocks, { emptyMessage } = {}) {
  if (!blocks?.length) {
    return emptyMessage || 'Sin cierres de caja hoy';
  }
  return blocks
    .map((b) => {
      const units = unitsLine(b);
      if (units) return `${b.name} ${units} · ${fmtEs(b.cobrado)} €`;
      return `${b.name} ${fmtEs(b.cobrado)} €`;
    })
    .join('\n');
}

/** Campana larga */
export function formatCeoDailyCampanaBody(blocks, dayKey, { businessName } = {}) {
  const header = `Resumen del día · ${fmtDayEs(dayKey)}`;
  if (!blocks?.length) {
    const biz = businessName ? ` (${businessName})` : '';
    return `${header}\n\nSin cierres de caja registrados hoy${biz}.`;
  }

  const out = [header, ''];
  for (const b of blocks) {
    out.push(String(b.name || 'Tienda').toUpperCase());
    for (const br of b.brands || []) {
      out.push(`${br.name}  ${fmtEs(br.euros)} €`);
    }
    const units = unitsLine(b);
    if (units) out.push(units);
    out.push(
      `Cobrado ${fmtEs(b.cobrado)} € (tarjeta ${fmtEs(b.tarjeta)} · efectivo ${fmtEs(b.efectivo)})`,
    );
    out.push(`En local ${fmtEs(b.enLocal)} €`);
    if (b.retirado > 0) out.push(`Retirado ${fmtEs(b.retirado)} €`);
    if (b.cashIn > 0 || b.cashOut > 0) {
      const bits = [];
      if (b.cashIn > 0) bits.push(`Entradas ${fmtEs(b.cashIn)} €`);
      if (b.cashOut > 0) bits.push(`Salidas ${fmtEs(b.cashOut)} €`);
      out.push(bits.join(' · '));
    }
    if (Math.abs(b.difference) >= 0.01) {
      out.push(`Descuadre ${fmtEs(b.difference)} €`);
    }
    out.push('');
  }

  out.push('TOTAL EMPRESA');
  const facturado = money(blocks.reduce((a, b) => a + Number(b.cobrado || 0), 0));
  out.push(`Facturado ${fmtEs(facturado)} €`);
  for (const b of blocks) {
    out.push(`En local · ${b.name}  ${fmtEs(b.enLocal)} €`);
  }
  return out.join('\n').trim();
}

function cajaRouteForBusiness(business) {
  const t = String(business?.businessType || '').trim();
  if (t === 'events') return '/saas/vertical/eventos/tpv';
  if (t === 'restaurant') return '/saas/caja';
  return '/saas/vertical/delivery/caja';
}

function businessUsesCaja(business) {
  const t = String(business?.businessType || '').trim().toLowerCase();
  if (CAJA_BUSINESS_TYPES.has(t)) return true;
  // verticales multi: si tiene delivery en módulos
  const mods = business?.enabledModules || business?.modules || [];
  if (Array.isArray(mods) && mods.some((m) => /delivery|restaurant|tpv|caja/i.test(String(m)))) {
    return true;
  }
  return false;
}

async function loadClosedSessionsForDay(dayKey) {
  const db = getDeliveryDbName();
  await ensureDatabase(fakeReq, db);
  const docs = await getAllDocuments(fakeReq, db);
  return (docs || []).filter((d) => {
    if (!d || d.deletedAt) return false;
    if (d.type !== 'tpv_register_session') return false;
    if (d.status !== 'closed') return false;
    return sessionDayKey(d) === dayKey;
  });
}

async function listActiveBusinesses() {
  await ensureDatabase(fakeReq, BUSINESSES_DB);
  const docs = await getAllDocuments(fakeReq, BUSINESSES_DB);
  return (docs || []).filter(
    (d) => d?.type === 'business' && !d?.deletedAt && d?.status !== 'deleted',
  );
}

/**
 * Emite resumen para un negocio + día.
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
export async function emitCeoDailyDigestForBusiness({
  business,
  dayKey,
  sessionsForBusiness,
} = {}) {
  const businessId = bareId(business?._id || business?.id);
  if (!businessId || !dayKey) return { sent: false, reason: 'missing_ids' };

  const blocks = (sessionsForBusiness || [])
    .map((s) => buildStoreDigestBlock(s))
    .filter(Boolean)
    // una línea por tienda: si hay varios turnos, sumar cobrado/uds en el mismo label
    .reduce((acc, block) => {
      const key = block.name.toLowerCase();
      const prev = acc.get(key);
      if (!prev) {
        acc.set(key, { ...block });
        return acc;
      }
      prev.cobrado = money(prev.cobrado + block.cobrado);
      prev.efectivo = money(prev.efectivo + block.efectivo);
      prev.tarjeta = money(prev.tarjeta + block.tarjeta);
      prev.pizza += block.pizza;
      prev.burger += block.burger;
      prev.taco += block.taco;
      prev.cashIn = money(prev.cashIn + block.cashIn);
      prev.cashOut = money(prev.cashOut + block.cashOut);
      prev.enLocal = block.enLocal; // último cierre = dinero que queda
      prev.retirado = money(prev.retirado + block.retirado);
      prev.difference = money(prev.difference + block.difference);
      const brandMap = new Map((prev.brands || []).map((b) => [b.name, b]));
      for (const br of block.brands || []) {
        const ex = brandMap.get(br.name);
        if (ex) ex.euros = money(ex.euros + br.euros);
        else brandMap.set(br.name, { ...br });
      }
      prev.brands = Array.from(brandMap.values()).sort((a, b) => b.euros - a.euros);
      return acc;
    }, new Map());

  const storeBlocks = Array.from(blocks.values());
  const bizName = String(business.name || business.companyName || '').trim();
  const pushBody = formatCeoDailyPushBody(storeBlocks);
  const campanaBody = formatCeoDailyCampanaBody(storeBlocks, dayKey, { businessName: bizName });
  const title = `Resumen del día · ${fmtDayEs(dayKey)}${bizName ? ` · ${bizName}` : ''}`;

  const recipients = await filterManagementRecipientIds(
    resolveCeoDailyDigestRecipients(business),
  );
  if (!recipients.length) return { sent: false, reason: 'no_recipients' };

  const dedupKey = `ceo-daily-digest:${businessId}:${dayKey}`;
  const route = cajaRouteForBusiness(business);

  const created = await emitPositiveAlert({
    userIds: recipients,
    businessId,
    category: CEO_DAILY_DIGEST_RULE_ID,
    source: 'caja',
    title,
    message: campanaBody,
    entityId: businessId,
    entityType: 'business',
    route,
    dedupKey,
    metadata: {
      ruleId: CEO_DAILY_DIGEST_RULE_ID,
      dayKey,
      storeCount: storeBlocks.length,
    },
  });

  if (!created.length) {
    return { sent: false, reason: 'dedup_or_empty' };
  }

  for (const uid of recipients) {
    sendPushToUser(
      fakeReq,
      uid,
      {
        title: `Resumen · ${fmtDayEs(dayKey)}`,
        body: pushBody,
        data: {
          route,
          notificationId: String(created.find((n) => n.user_id === uid || n.userId === uid)?.id || ''),
          ruleId: CEO_DAILY_DIGEST_RULE_ID,
        },
        collapseId: `ceo-digest-${businessId}-${dayKey}`,
      },
      {
        ruleId: CEO_DAILY_DIGEST_RULE_ID,
        category: CEO_DAILY_DIGEST_RULE_ID,
        channels: ['push'],
      },
    ).catch(() => null);
  }

  return { sent: true, stores: storeBlocks.length, recipients: recipients.length };
}

/**
 * Recorre negocios y emite digests del día (idempotente por dedup).
 */
export async function runCeoDailyDigests(dayKey = madridDayKey()) {
  const sessions = await loadClosedSessionsForDay(dayKey);
  const byBiz = new Map();
  for (const s of sessions) {
    const bid = bareId(s.business_id || s.businessId);
    if (!bid) continue;
    if (!byBiz.has(bid)) byBiz.set(bid, []);
    byBiz.get(bid).push(s);
  }

  const businesses = await listActiveBusinesses();
  let sent = 0;
  let skipped = 0;

  for (const business of businesses) {
    const bid = bareId(business._id || business.id);
    if (!bid) continue;
    const sess = byBiz.get(bid) || [];
    if (!sess.length && !businessUsesCaja(business)) {
      skipped += 1;
      continue;
    }
    try {
      // Asegurar owner cargado
      const full = (await findBusinessById(fakeReq, bid).catch(() => null)) || business;
      const result = await emitCeoDailyDigestForBusiness({
        business: full,
        dayKey,
        sessionsForBusiness: sess,
      });
      if (result.sent) sent += 1;
      else skipped += 1;
    } catch (err) {
      skipped += 1;
      logger.warn(
        { tag: 'CEO_DAILY_DIGEST', businessId: bid, err: err?.message },
        'Error emitiendo resumen diario CEO',
      );
    }
  }

  logger.info(
    { tag: 'CEO_DAILY_DIGEST', dayKey, sent, skipped, sessions: sessions.length },
    'Ciclo resumen diario CEO',
  );
  return { dayKey, sent, skipped, sessions: sessions.length };
}

let schedulerStarted = false;

export function startCeoDailyDigestScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const digestMinutes = parseDigestTimeToMinutes(
    process.env.CEO_DAILY_DIGEST_TIME || '23:50',
  );
  const intervalMs = Number(process.env.CEO_DAILY_DIGEST_INTERVAL_MS || 10 * 60_000);
  const sentDays = new Set();

  const tick = () => {
    const day = madridDayKey();
    const mins = madridMinutesOfDay();
    if (mins < digestMinutes) return;
    if (sentDays.has(day)) return;
    sentDays.add(day);
    runCeoDailyDigests(day).catch((err) => {
      sentDays.delete(day);
      logger.warn({ tag: 'CEO_DAILY_DIGEST', err: err?.message }, 'Fallo scheduler digest CEO');
    });
  };

  setTimeout(tick, 60_000);
  setInterval(tick, intervalMs);
  logger.info(
    {
      tag: 'CEO_DAILY_DIGEST',
      digestTime: process.env.CEO_DAILY_DIGEST_TIME || '23:50',
      intervalMs,
    },
    'Scheduler resumen diario CEO iniciado',
  );
}
