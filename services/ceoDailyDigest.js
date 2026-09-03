/**
 * Resumen al CEO al cerrar caja (push corto + campana larga).
 * Se dispara en cada cierre TPV — no a una hora fija.
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
import {
  buildStoreDigestBlock,
  fmtDayEs,
  formatCeoDailyCampanaBody,
  formatCeoDailyCampanaPreview,
  formatCeoDailyPushBody,
  mergeStoreDigestBlocks,
  money,
  shortStoreLabel,
  shortBrandLabel,
  brandFoodUnitsLine,
  attachBrandFoodUnits,
} from '../shared/caja/ceoDailyDigestFormat.js';

export {
  buildStoreDigestBlock,
  formatCeoDailyCampanaBody,
  formatCeoDailyCampanaPreview,
  formatCeoDailyPushBody,
  mergeStoreDigestBlocks,
  shortStoreLabel,
  shortBrandLabel,
  brandFoodUnitsLine,
  attachBrandFoodUnits,
};

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

function sessionDayKey(session) {
  const raw = session?.closedAt || session?.openedAt || session?.createdAt;
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return madridDayKey(d);
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
 * Emite resumen para un negocio + día (una o varias sesiones).
 * @param {{ dedupKey?: string, pushTitle?: string, collapseId?: string }} [opts]
 * @returns {Promise<{ sent: boolean, reason?: string, stores?: number, recipients?: number }>}
 */
export async function emitCeoDailyDigestForBusiness({
  business,
  dayKey,
  sessionsForBusiness,
  dedupKey: dedupKeyOverride,
  pushTitle,
  title: titleOverride,
  collapseId,
} = {}) {
  const businessId = bareId(business?._id || business?.id);
  if (!businessId || !dayKey) return { sent: false, reason: 'missing_ids' };

  const storeBlocks = mergeStoreDigestBlocks(
    (sessionsForBusiness || []).map((s) => buildStoreDigestBlock(s)).filter(Boolean),
  );
  if (!storeBlocks.length) return { sent: false, reason: 'no_stores' };

  const bizName = String(business.name || business.companyName || '').trim();
  const storeLabel = storeBlocks.length === 1 ? storeBlocks[0].name : '';
  const pushBody = formatCeoDailyPushBody(storeBlocks);
  const campanaBody = formatCeoDailyCampanaBody(storeBlocks, dayKey, { businessName: bizName });
  const listPreview = formatCeoDailyCampanaPreview(storeBlocks);
  const title = String(titleOverride || '').trim()
    || (storeLabel
      ? `Resumen · ${storeLabel} · ${fmtDayEs(dayKey)}`
      : `Resumen del día · ${fmtDayEs(dayKey)}${bizName ? ` · ${bizName}` : ''}`);

  const recipients = await filterManagementRecipientIds(
    resolveCeoDailyDigestRecipients(business),
  );
  if (!recipients.length) return { sent: false, reason: 'no_recipients' };

  const dedupKey = String(dedupKeyOverride || `ceo-daily-digest:${businessId}:${dayKey}`).trim();
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
      storeLabel: storeLabel || undefined,
      listPreview,
    },
  });

  if (!created.length) {
    return { sent: false, reason: 'dedup_or_empty' };
  }

  const pushHeadline = String(pushTitle || (storeLabel ? `Resumen · ${storeLabel}` : `Resumen · ${fmtDayEs(dayKey)}`)).trim();
  const collapse = String(collapseId || `ceo-digest-${dedupKey}`).slice(0, 64);

  for (const uid of recipients) {
    sendPushToUser(
      fakeReq,
      uid,
      {
        title: 'Vertial',
        body: pushBody,
        data: {
          route,
          notificationId: String(created.find((n) => n.user_id === uid || n.userId === uid)?.id || ''),
          ruleId: CEO_DAILY_DIGEST_RULE_ID,
          title: pushHeadline,
        },
        collapseId: collapse,
      },
      {
        ruleId: CEO_DAILY_DIGEST_RULE_ID,
        category: CEO_DAILY_DIGEST_RULE_ID,
        channels: ['push'],
      },
    ).catch((err) => {
      logger.warn(
        { tag: 'CEO_DAILY_DIGEST', err: err?.message, userId: uid },
        'Push resumen CEO falló',
      );
    });
  }

  return { sent: true, stores: storeBlocks.length, recipients: recipients.length };
}

/**
 * Al cerrar una caja TPV: UNA sola campana + push
 * (resumen del turno + OK o descuadre). No emite avisos aparte.
 */
export async function emitCeoDigestForClosedSession({ business, session } = {}) {
  if (!session?._id || session.status !== 'closed') {
    return { sent: false, reason: 'not_closed' };
  }
  const businessId = bareId(business?._id || business?.id || session.business_id || session.businessId);
  if (!businessId) return { sent: false, reason: 'missing_business' };

  let full = business;
  if (!full || !resolveCeoDailyDigestRecipients(full).length) {
    full = (await findBusinessById(fakeReq, businessId).catch(() => null)) || business;
  }
  if (!full) return { sent: false, reason: 'business_not_found' };

  const dayKey = sessionDayKey(session) || madridDayKey();
  const sessionId = String(session._id).trim();
  const store = shortStoreLabel(
    session.pointOfSaleName || session.salesPointName || session.pdvName || 'Tienda',
  );
  const diff = money(session.difference);
  const hasDiscrepancy = Math.abs(diff) >= 0.01;
  const pushTitle = hasDiscrepancy
    ? `Cierre con descuadre · ${store}`
    : `Cierre OK · ${store}`;

  try {
    const result = await emitCeoDailyDigestForBusiness({
      business: full,
      dayKey,
      sessionsForBusiness: [session],
      dedupKey: `ceo-close-digest:${sessionId}`,
      collapseId: `ceo-close-${sessionId}`.slice(0, 64),
      pushTitle,
      title: pushTitle,
    });
    if (result.sent) {
      logger.info(
        {
          tag: 'CEO_DAILY_DIGEST',
          businessId,
          sessionId,
          dayKey,
          stores: result.stores,
          recipients: result.recipients,
          discrepancy: hasDiscrepancy,
        },
        'Cierre unificado emitido (resumen + OK/descuadre)',
      );
    }
    return result;
  } catch (err) {
    logger.warn(
      { tag: 'CEO_DAILY_DIGEST', businessId, sessionId, err: err?.message },
      'Error resumen CEO al cerrar caja',
    );
    return { sent: false, reason: 'error' };
  }
}

/**
 * Recorre negocios y emite digests del día (uso manual / ops).
 * En producción el disparo normal es al cerrar caja.
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

/** Ya no programa a las 23:50: el resumen sale al cerrar caja. */
export function startCeoDailyDigestScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  logger.info(
    { tag: 'CEO_DAILY_DIGEST', mode: 'on_register_close' },
    'Resumen CEO: se emite al cerrar caja (sin hora fija)',
  );
}
