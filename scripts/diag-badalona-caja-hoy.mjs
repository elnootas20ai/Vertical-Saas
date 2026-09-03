/**
 * Solo lectura — cierre + notif/push Badalona hoy.
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');
const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const BADALONA = /badalona/i;

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.reason || data.error || res.status}`);
  return data;
}

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function madridDay(iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso || Date.now()));
}

const today = madridDay();
const delivery = await couch('/bbddsaas-delivery/_all_docs?include_docs=true');
const sessions = (delivery.rows || [])
  .map((r) => r.doc)
  .filter(Boolean)
  .filter((d) => {
    if (d.deletedAt) return false;
    if (d.type !== 'tpv_register_session' && !String(d._id || '').startsWith('tpvreg-')) return false;
    const name = String(d.pointOfSaleName || d.salesPointName || d.pdvName || '');
    if (!BADALONA.test(name)) return false;
    const day = madridDay(d.closedAt || d.openedAt || d.createdAt);
    return day === today || d.status === 'open';
  })
  .sort((a, b) => String(b.openedAt || '').localeCompare(String(a.openedAt || '')));

const notifsDb = await couch('/notifications/_all_docs?include_docs=true');
const notifs = (notifsDb.rows || []).map((r) => r.doc).filter(Boolean);

const out = [];
for (const s of sessions.slice(0, 5)) {
  const dedup = `ceo-close-digest:${s._id}`;
  const related = notifs.filter((d) => {
    const id = String(d._id || '');
    return id.includes(s._id) || String(d.dedupKey || '') === dedup;
  });
  const ceo = related.find((d) => String(d.category || '') === 'ceo_daily_digest')
    || notifs.find((d) => String(d._id || '').includes(`ceo-close-digest:${s._id}`));

  out.push({
    session: {
      id: s._id,
      name: s.pointOfSaleName || s.salesPointName,
      status: s.status,
      worker: s.workerName,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      difference: money(s.difference),
      counted: money(s.finalCashAmount),
      expected: money(s.expectedCash),
      fondo: money(s.initialCashAmount),
      enLocal: money(
        s.nextDayInitialCash != null && s.nextDayInitialCash !== ''
          ? s.nextDayInitialCash
          : s.finalCashAmount,
      ),
      methods: s.summary?.salesByMethod || null,
      totalSales: money(s.summary?.totalSales),
      products: s.productClosingCounts || null,
      apps: {
        totals: s.aggregatorClosingTotals || {},
        cash: s.aggregatorClosingCash || {},
        card: s.aggregatorClosingCard || {},
      },
    },
    pushTitleInApp: ceo?.title || null,
    pushBody: ceo ? String(ceo.message || '').split('\n') : null,
    notifCreatedAt: ceo?.createdAt || null,
    notifUser: ceo?.user_id || ceo?.userId || null,
    relatedTitles: related.map((d) => ({ id: d._id, title: d.title, cat: d.category, at: d.createdAt })),
  });
}

console.log(JSON.stringify({ mode: 'READ_ONLY', today, count: sessions.length, out }, null, 2));
