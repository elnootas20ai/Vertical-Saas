#!/usr/bin/env node
/**
 * Enlaza Pol Muñoz Luis a hoypecamos → BADALONA con horario 19:00–23:30.
 *
 *   node scripts/fix-link-pol-badalona.mjs           # dry-run
 *   node scripts/fix-link-pol-badalona.mjs --apply
 */
import '../config/env.js';

const APPLY = process.argv.includes('--apply');
const POL_EMAIL = 'munozluis.pol@gmail.com';
const BID = 'ed846f31-aee7-4568-ac03-fa25ff3ad773'; // hoypecamos (Pau)
const OWNER_ID = '13e49ef6-183a-4afa-a17b-7730917fe685';
const BADALONA_WC = 'wc-16361270-5794-4b95-89e5-644685f36e24';
const BADALONA_NAME = 'BADALONA';
const SHIFT_START = '19:00';
const SHIFT_END = '23:30';
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const WEEKS_AHEAD = 4;

function couchBaseUrl() {
  const raw = String(process.env.COUCHDB_URL || '').trim();
  const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw || '127.0.0.1:5984'}`;
  const u = new URL(href);
  const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
  return `${u.origin}${pathPart}`.replace(/\/+$/, '');
}

const BASE = couchBaseUrl();
const AUTH = `Basic ${Buffer.from(
  `${process.env.COUCHDB_USER || ''}:${process.env.COUCHDB_PASSWORD || ''}`,
).toString('base64')}`;
const prefix = (process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial')
  .toLowerCase()
  .replace(/[^a-z0-9_$()+-]+/g, '-')
  .replace(/^-+|-+$/g, '');
const SCHEDULES_DB = `${prefix}-schedules`;

async function couch(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path}: ${data.error || res.status} ${data.reason || ''}`);
  }
  return data;
}

async function allDocs(db) {
  const data = await couch('GET', `/${encodeURIComponent(db)}/_all_docs?include_docs=true`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

async function ensureDb(db) {
  const res = await fetch(`${BASE}/${encodeURIComponent(db)}`, {
    method: 'PUT',
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data.error !== 'file_exists') {
    throw new Error(`ensureDb ${db}: ${data.error || res.status}`);
  }
}

function minutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

function defaultTenMinBreak(start, end) {
  const startMin = minutes(start);
  let endMin = minutes(end);
  if (endMin <= startMin) endMin += 24 * 60;
  const workLen = endMin - startMin;
  const mid = startMin + Math.floor(workLen / 2);
  const bh = Math.floor(mid / 60) % 24;
  const bm = mid % 60;
  const breakStart = `${String(bh).padStart(2, '0')}:${String(bm).padStart(2, '0')}`;
  const endBreak = mid + 10;
  const eh = Math.floor(endBreak / 60) % 24;
  const em = endBreak % 60;
  const breakEnd = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  return { breakStart, breakEnd };
}

function buildWeekly() {
  const brk = defaultTenMinBreak(SHIFT_START, SHIFT_END);
  const day = {
    enabled: true,
    start: SHIFT_START,
    end: SHIFT_END,
    ...brk,
  };
  const weekly = {};
  for (const d of WEEKDAYS) weekly[d] = { ...day };
  return weekly;
}

function computeWeeklyHours(weekly) {
  let total = 0;
  for (const day of WEEKDAYS) {
    const s = weekly?.[day];
    if (!s?.enabled) continue;
    const work = minutes(s.end) - minutes(s.start);
    const brk = minutes(s.breakEnd) - minutes(s.breakStart);
    total += Math.max(0, work - Math.max(0, brk));
  }
  return Math.round((total / 60) * 100) / 100;
}

function getMonday(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

function addDaysIso(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

async function main() {
  console.log(APPLY ? '=== APPLY ===' : '=== DRY-RUN ===');
  console.log(`Couch: ${BASE} · schedules: ${SCHEDULES_DB}`);

  const [accounts, businesses] = await Promise.all([allDocs('accounts'), allDocs('businesses')]);
  const pol = accounts.find(
    (a) => a?.type === 'account' && String(a.email || '').toLowerCase() === POL_EMAIL,
  );
  if (!pol) throw new Error(`No encuentro cuenta ${POL_EMAIL}`);

  const biz = businesses.find(
    (b) => String(b.business_id || '').replace(/^business:/, '') === BID && !b.deletedAt,
  );
  if (!biz) throw new Error('No encuentro empresa hoypecamos');

  const pauWorker = accounts.find(
    (a) => String(a.email || '').toLowerCase() === 'hoypecamos@gmail.com',
  );
  const permissions = pauWorker?.permissions || pol.permissions || {};

  const weekly = buildWeekly();
  const weeklyHours = computeWeeklyHours(weekly);
  const workday = weeklyHours >= 35 ? 'completa' : weeklyHours >= 18 ? 'media' : 'parcial';
  const templateId = `shift_template:${BID}:cena-badalona-1900-2330`;
  const now = new Date().toISOString();

  console.log('Pol:', {
    user_id: pol.user_id,
    email: pol.email,
    linkedBusinessId: pol.linkedBusinessId || '(vacío)',
    nextLinked: BID,
    nextStore: BADALONA_NAME,
    schedule: `${SHIFT_START}-${SHIFT_END} · todos los días · ${weeklyHours} h/sem (${workday})`,
  });

  const alreadyMember = (biz.members || []).some((m) => m.user_id === pol.user_id);
  console.log('Ya es miembro:', alreadyMember);

  if (!APPLY) {
    console.log('Sin escritura. Usa --apply para enlazar.');
    return;
  }

  await ensureDb(SCHEDULES_DB);

  // 1) Plantilla de horario
  let existingTemplate = null;
  try {
    existingTemplate = await couch('GET', `/${encodeURIComponent(SCHEDULES_DB)}/${encodeURIComponent(templateId)}`);
  } catch {
    existingTemplate = null;
  }
  const templateDoc = {
    _id: templateId,
    ...(existingTemplate?._rev ? { _rev: existingTemplate._rev } : {}),
    type: 'shift_template',
    business_id: BID,
    name: 'Cena Badalona 19:00–23:30',
    color: '#2563eb',
    weekly,
    weeklyHours,
    createdAt: existingTemplate?.createdAt || now,
    updatedAt: now,
  };
  await couch('PUT', `/${encodeURIComponent(SCHEDULES_DB)}/${encodeURIComponent(templateId)}`, templateDoc);
  console.log('✓ plantilla horario', templateId);

  // 2) Cuenta Pol
  const employment = {
    ...(pol.employment && typeof pol.employment === 'object' ? pol.employment : {}),
    salesPointId: BADALONA_WC,
    workday,
    hoursPerWeek: weeklyHours,
    position: pol.employment?.position || 'Mostrador / Atención',
    schedule: `${SHIFT_START}-${SHIFT_END}`,
  };
  const updatedPol = {
    ...pol,
    accountType: 'user',
    linkedBusinessId: BID,
    invitedBy: pol.invitedBy || OWNER_ID,
    inviteStatus: 'accepted',
    role: pol.role || 'Usuario',
    permissions,
    landingPage: pol.landingPage || '/saas/worker/tasks',
    employment,
    companyName: biz.name || 'hoypecamos',
    pendingTeamInvite: null,
    updatedAt: now,
  };
  await couch('PUT', `/accounts/${encodeURIComponent(pol._id)}`, updatedPol);
  console.log('✓ cuenta linkedBusinessId + employment.salesPointId');

  // 3) Miembro en empresa
  const memberPayload = {
    user_id: pol.user_id,
    fullName: pol.fullName || 'Pol Muñoz Luis',
    email: pol.email,
    role: 'Usuario',
    branch_id: null,
    permissions,
    employment,
    joinedAt: alreadyMember
      ? (biz.members || []).find((m) => m.user_id === pol.user_id)?.joinedAt || now
      : now,
  };
  const nextMembers = alreadyMember
    ? (biz.members || []).map((m) => (m.user_id === pol.user_id ? { ...m, ...memberPayload } : m))
    : [...(biz.members || []), memberPayload];
  await couch('PUT', `/businesses/${encodeURIComponent(biz._id)}`, {
    ...biz,
    members: nextMembers,
    updatedAt: now,
  });
  console.log('✓ miembro en hoypecamos');

  // 4) Horarios 4 semanas
  const baseMonday = getMonday();
  let weeks = 0;
  for (let i = 0; i < WEEKS_AHEAD; i += 1) {
    const weekStart = addDaysIso(baseMonday, i * 7);
    const id = `schedule:${BID}:${pol.user_id}:${weekStart}`;
    let existing = null;
    try {
      existing = await couch('GET', `/${encodeURIComponent(SCHEDULES_DB)}/${encodeURIComponent(id)}`);
    } catch {
      existing = null;
    }
    const doc = {
      _id: id,
      ...(existing?._rev ? { _rev: existing._rev } : {}),
      type: 'schedule',
      business_id: BID,
      member_id: pol.user_id,
      member_name: pol.fullName || 'Pol Muñoz Luis',
      week_start: weekStart,
      work_center_id: BADALONA_WC,
      work_center_name: BADALONA_NAME,
      weekly,
      weeklyHours,
      template_id: templateId,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await couch('PUT', `/${encodeURIComponent(SCHEDULES_DB)}/${encodeURIComponent(id)}`, doc);
    weeks += 1;
  }
  console.log(`✓ horarios aplicados: ${weeks} semanas desde ${baseMonday}`);
  console.log('Listo. Pol → hoypecamos / BADALONA / 19:00–23:30 (todos los días).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
