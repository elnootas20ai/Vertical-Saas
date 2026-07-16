/**
 * Analytics first-party de la web pública (landing).
 * Agrega por día en accounts DB para no guardar eventos crudos.
 */
import { ACCOUNTS_DB, ensureDatabase, getDocument, putDocument } from './couchdb.js';
import logger from './logger.js';

const DOC_PREFIX = 'web_analytics:';
const MAX_PATH_KEYS = 40;
const MAX_EVENT_KEYS = 40;
const MAX_REFERRER_KEYS = 30;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function emptyDay(date) {
  return {
    _id: `${DOC_PREFIX}${date}`,
    type: 'web_analytics_day',
    date,
    pageviews: 0,
    uniqueVisitors: 0,
    visitorIds: [],
    paths: {},
    events: {},
    referrers: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function bumpMap(map, key, maxKeys) {
  const k = String(key || 'unknown').slice(0, 120);
  if (!map[k] && Object.keys(map).length >= maxKeys) {
    map._other = (map._other || 0) + 1;
    return;
  }
  map[k] = (map[k] || 0) + 1;
}

function normalizePath(path) {
  const raw = String(path || '/').trim() || '/';
  try {
    const u = new URL(raw, 'https://vertial.local');
    return (u.pathname || '/').slice(0, 120) || '/';
  } catch {
    return raw.startsWith('/') ? raw.slice(0, 120) : `/${raw.slice(0, 119)}`;
  }
}

function normalizeReferrer(ref) {
  const raw = String(ref || '').trim();
  if (!raw) return 'direct';
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '');
    return host.slice(0, 80) || 'direct';
  } catch {
    return 'direct';
  }
}

async function saveWithConflictRetry(req, mutator, date = todayUtc()) {
  await ensureDatabase(req, ACCOUNTS_DB);
  const id = `${DOC_PREFIX}${date}`;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const existing = await getDocument(req, ACCOUNTS_DB, id);
    const doc = existing && existing.type === 'web_analytics_day'
      ? { ...existing }
      : emptyDay(date);

    if (!doc.paths || typeof doc.paths !== 'object') doc.paths = {};
    if (!doc.events || typeof doc.events !== 'object') doc.events = {};
    if (!doc.referrers || typeof doc.referrers !== 'object') doc.referrers = {};
    if (!Array.isArray(doc.visitorIds)) doc.visitorIds = [];

    mutator(doc);
    doc.updatedAt = new Date().toISOString();
    doc.type = 'web_analytics_day';
    doc.date = date;
    doc._id = id;

    // Cap visitor id list (unique count already stored).
    if (doc.visitorIds.length > 5000) {
      doc.visitorIds = doc.visitorIds.slice(-2000);
    }

    try {
      await putDocument(req, ACCOUNTS_DB, id, doc);
      return doc;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/conflict/i.test(msg)) throw err;
    }
  }

  throw new Error('No se pudo guardar analytics (conflictos)');
}

/**
 * @param {import('express').Request} req
 * @param {{ name: string, path?: string, referrer?: string, visitorId?: string }} event
 */
export async function recordWebAnalyticsEvent(req, event) {
  const name = String(event?.name || '').trim().slice(0, 64);
  if (!name) return;

  const path = normalizePath(event.path);
  const referrer = normalizeReferrer(event.referrer);
  const visitorId = String(event.visitorId || '').trim().slice(0, 64);

  await saveWithConflictRetry(req, (doc) => {
    if (name === 'pageview') {
      doc.pageviews = Number(doc.pageviews || 0) + 1;
      bumpMap(doc.paths, path, MAX_PATH_KEYS);
      bumpMap(doc.referrers, referrer, MAX_REFERRER_KEYS);
      if (visitorId && !doc.visitorIds.includes(visitorId)) {
        doc.visitorIds.push(visitorId);
        doc.uniqueVisitors = doc.visitorIds.length;
      }
      return;
    }

    bumpMap(doc.events, name, MAX_EVENT_KEYS);
    if (path && path !== '/') bumpMap(doc.paths, path, MAX_PATH_KEYS);
  });
}

function daysBack(n) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function topEntries(map, limit = 8) {
  return Object.entries(map || {})
    .filter(([k]) => k !== '_other')
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count: Number(count) || 0 }));
}

/**
 * @param {import('express').Request} req
 * @param {{ days?: number }} opts
 */
export async function getWebAnalyticsSummary(req, opts = {}) {
  const days = Math.min(90, Math.max(1, Number(opts.days) || 30));
  await ensureDatabase(req, ACCOUNTS_DB);

  const dates = daysBack(days);
  const series = [];

  let pageviews = 0;
  let uniqueVisitors = 0;
  const paths = {};
  const events = {};
  const referrers = {};

  for (const date of dates) {
    const doc = await getDocument(req, ACCOUNTS_DB, `${DOC_PREFIX}${date}`);
    const dayViews = Number(doc?.pageviews || 0);
    const dayUniques = Number(doc?.uniqueVisitors || 0);
    pageviews += dayViews;
    uniqueVisitors += dayUniques;

    for (const [k, v] of Object.entries(doc?.paths || {})) {
      paths[k] = (paths[k] || 0) + Number(v || 0);
    }
    for (const [k, v] of Object.entries(doc?.events || {})) {
      events[k] = (events[k] || 0) + Number(v || 0);
    }
    for (const [k, v] of Object.entries(doc?.referrers || {})) {
      referrers[k] = (referrers[k] || 0) + Number(v || 0);
    }

    series.push({
      date,
      pageviews: dayViews,
      uniqueVisitors: dayUniques,
      events: Number(
        Object.values(doc?.events || {}).reduce((a, b) => a + Number(b || 0), 0),
      ),
    });
  }

  series.reverse();

  return {
    days,
    totals: {
      pageviews,
      uniqueVisitors,
      ctaClicks: Number(events.cta_register || 0)
        + Number(events.cta_sales || 0)
        + Number(events.cta_login || 0)
        + Number(events.cta_plan || 0),
      eventsTotal: Object.values(events).reduce((a, b) => a + Number(b || 0), 0),
    },
    series,
    topPaths: topEntries(paths),
    topEvents: topEntries(events),
    topReferrers: topEntries(referrers),
  };
}

export async function safeRecordWebAnalyticsEvent(req, event) {
  try {
    await recordWebAnalyticsEvent(req, event);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[webAnalytics] record failed');
  }
}
