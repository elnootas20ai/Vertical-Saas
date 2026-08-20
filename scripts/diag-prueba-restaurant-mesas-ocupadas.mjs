/**
 * Solo lectura: mesas ocupadas en demo restaurant prod.
 * node scripts/remote-run-script.mjs diag-prueba-restaurant-mesas-ocupadas.mjs
 */
import '../config/env.js';

const EMAIL = 'prueba-restaurant@test.local';
const OWNER_HINT = '5e36c59f-6e27-4843-8f16-e5a6d721eff0';

function couchBaseUrl() {
  const raw = String(process.env.COUCHDB_URL || '').trim();
  if (!raw) return '';
  try {
    const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw}`;
    const u = new URL(href);
    const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
    return `${u.origin}${pathPart}`.replace(/\/+$/, '');
  } catch {
    return raw.replace(/^(https?:\/\/)(?:[^/@]+)@/i, '$1').replace(/\/+$/, '');
  }
}

const BASE = couchBaseUrl();
const AUTH =
  process.env.COUCHDB_USER && process.env.COUCHDB_PASSWORD
    ? `Basic ${Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64')}`
    : '';

async function couchJson(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${res.status} ${typeof data === 'object' ? JSON.stringify(data) : text}`);
  return data;
}

async function findAll(db, selector, limit = 500) {
  const data = await couchJson('POST', `/${db}/_find`, { selector, limit });
  return data?.docs || [];
}

function prefix() {
  return String(process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_$()+\-/]/g, '-');
}

function slimTable(t) {
  return {
    _id: t._id,
    name: t.name,
    number: t.number,
    status: t.status,
    currentGuests: t.currentGuests ?? null,
    occupiedAt: t.occupiedAt || '',
    businessId: t.businessId || t.business_id || '',
    roomId: t.roomId || '',
    zone: t.zone || '',
    active: t.active,
    visible: t.visible,
    updatedAt: t.updatedAt || '',
  };
}

function slimOrder(o) {
  const itemCount = (o.comandas || []).reduce(
    (s, c) => s + (c.items || []).reduce((n, i) => n + (Number(i.quantity) || 0), 0),
    0,
  );
  return {
    _id: o._id,
    status: o.status,
    tableId: o.tableId || '',
    tableName: o.tableName || o.tableNumber || '',
    total: o.total ?? 0,
    guests: o.guests ?? null,
    itemCount,
    businessId: o.businessId || o.business_id || '',
    createdAt: o.createdAt || '',
    updatedAt: o.updatedAt || '',
  };
}

async function main() {
  if (!BASE || !AUTH) {
    console.error('Falta CouchDB env');
    process.exit(1);
  }
  const salaDb = String(process.env.VITE_SALA_DB || `${prefix()}-sala`);
  const accounts = await findAll('accounts', { type: 'account', email: EMAIL }, 5);
  const acc = accounts.find((a) => !a.deletedAt) || accounts[0];
  const ownerId = acc?.user_id || OWNER_HINT;
  console.log(JSON.stringify({ email: EMAIL, ownerId, salaDb }, null, 2));

  const tables = await findAll(salaDb, { type: 'dining_table', user_id: ownerId }, 500);
  const orders = await findAll(salaDb, { type: 'dining_order', user_id: ownerId }, 500);
  const occupiedStatuses = new Set(['occupied', 'pending_order', 'served', 'pending_payment']);
  const occupiedTables = tables.filter((t) => !t.deletedAt && occupiedStatuses.has(String(t.status || '')));
  const openOrders = orders.filter((o) =>
    !o.deletedAt && ['open', 'served', 'pending_payment'].includes(String(o.status || '')),
  );

  console.log('\n--- tablas por status ---');
  const byStatus = {};
  for (const t of tables.filter((x) => !x.deletedAt)) {
    const s = String(t.status || '—');
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  console.log(JSON.stringify({ total: tables.length, byStatus, occupiedFlag: occupiedTables.length }, null, 2));

  console.log('\n--- mesas con status ocupado ---');
  console.log(JSON.stringify(occupiedTables.map(slimTable), null, 2));

  console.log('\n--- comandas abiertas ---');
  console.log(JSON.stringify(openOrders.map(slimOrder), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
