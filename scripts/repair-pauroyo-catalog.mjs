/**
 * Diagnóstico y reparación segura del catálogo Modomio / Pau Royo.
 * NO elige productos del combo — solo deja visible bebidas/complementos y confirma estructura de menús.
 *
 * Uso:
 *   node scripts/repair-pauroyo-catalog.mjs --search modomio
 *   node scripts/repair-pauroyo-catalog.mjs pau.royo.del.amor@gmail.com
 *   node scripts/repair-pauroyo-catalog.mjs --search modomio --apply
 */
import '../config/env.js';

const DB_PREFIX = String(process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial').trim();
const ACCOUNTS_DB = 'accounts';
const BUSINESSES_DB = 'businesses';
const CATALOG_DB = process.env.VITE_CATALOG_DB || `${DB_PREFIX}-catalog`;

const APPLY = process.argv.includes('--apply');

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
  if (!res.ok) {
    throw new Error(typeof data === 'object' && data?.reason ? data.reason : `${res.status} ${text}`);
  }
  return data;
}

function normEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isUniversalCategory(category) {
  const c = fold(category);
  return (
    c === 'bebidas' ||
    c === 'bebida' ||
    c === 'complementos' ||
    c === 'complemento' ||
    c === 'extras' ||
    c === 'postres' ||
    c === 'postre' ||
    c === 'salsas' ||
    c === 'otros' ||
    c === 'sides' ||
    c === 'entrantes' ||
    c === 'refrescos' ||
    c === 'cervezas'
  );
}

function isComboItem(doc) {
  if (doc.itemType === 'combo') return true;
  const cat = fold(doc.category);
  return cat === 'combos' || cat === 'combo' || cat === 'menus' || cat === 'menu';
}

const DEFAULT_COMBO_STRUCTURE = [
  { slotKind: 'main', label: 'Pizza o burger', required: true, expectedCount: 1 },
  { slotKind: 'side', label: 'Complemento', required: true, expectedCount: 1 },
  { slotKind: 'drink', label: 'Bebida', required: true, expectedCount: 1 },
];

function parseArgs() {
  let email = '';
  let search = '';
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--search' && process.argv[i + 1]) search = process.argv[++i];
    else if (!a.startsWith('--') && !email) email = a;
  }
  return { email, search };
}

async function listDocs(db, filter) {
  const data = await couchJson('GET', `/${db}/_all_docs?include_docs=true`);
  return (data.rows || []).map((r) => r.doc).filter((d) => d && !d.deletedAt && filter(d));
}

async function main() {
  if (!BASE || !AUTH) {
    console.error('Faltan COUCHDB_URL, COUCHDB_USER o COUCHDB_PASSWORD');
    process.exit(1);
  }

  const { email, search } = parseArgs();
  const accounts = await listDocs(ACCOUNTS_DB, (d) => d.type === 'account');
  let account = email ? accounts.find((a) => normEmail(a.email) === normEmail(email)) : null;
  if (!account && search) {
    const q = fold(search);
    account = accounts.find(
      (a) =>
        fold(a.companyName).includes(q) ||
        fold(a.fullName).includes(q) ||
        fold(a.email).includes(q),
    );
  }
  if (!account) {
    console.error('Cuenta no encontrada. Usa --search modomio o el email.');
    process.exit(1);
  }

  const userId = String(account.user_id || '').trim();
  console.log(`\nCuenta: ${account.fullName || account.email} (${userId})`);
  console.log(`Modo: ${APPLY ? 'APLICAR cambios' : 'solo diagnóstico (añade --apply)'}`);

  const businesses = await listDocs(
    BUSINESSES_DB,
    (d) => d.type === 'business' && String(d.owner_user_id || '') === userId,
  );
  const deliveryBiz = businesses.find((b) => String(b.businessType || '') === 'delivery');
  const deliveryId = String(deliveryBiz?.business_id || '').replace(/^business:/, '').trim();
  console.log(`Empresas: ${businesses.length} · delivery: ${deliveryBiz?.name || '—'} (${deliveryId || 'sin id'})`);

  const catalog = await listDocs(
    CATALOG_DB,
    (d) => d.type === 'catalog_item' && String(d.user_id || '') === userId && (d.module || 'catalog') === 'catalog',
  );
  console.log(`Productos catálogo: ${catalog.length}`);

  const byCat = new Map();
  for (const item of catalog) {
    const cat = String(item.category || '(vacío)').trim();
    byCat.set(cat, (byCat.get(cat) || 0) + 1);
  }
  console.log('Categorías:', [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}(${v})`).join(', '));

  const missingBusinessId = catalog.filter((i) => !String(i.business_id || i.businessId || '').trim());
  const universalNoBiz = missingBusinessId.filter((i) => isUniversalCategory(i.category));
  const combos = catalog.filter(isComboItem);
  const combosNeedStructure = combos.filter((c) => {
    const cf = c.customFields || {};
    return !cf.comboStructureConfirmed && !(Array.isArray(cf.comboStructure) && cf.comboStructure.length > 0);
  });

  console.log(`Sin business_id: ${missingBusinessId.length} (universales: ${universalNoBiz.length})`);
  console.log(`Combos/menús: ${combos.length} · sin estructura confirmada: ${combosNeedStructure.length}`);

  if (!APPLY) {
    console.log('\nReparación propuesta (--apply):');
    console.log(`  · Asignar business_id=${deliveryId || '?'} a productos sin él`);
    console.log('  · Confirmar comboStructure en menús (NO elige pizza/bebida concretas)');
    console.log('\nNo se modifica nada. Ejecuta con --apply si cuadra.');
    return;
  }

  if (!deliveryId) {
    console.error('No hay empresa delivery — abortando.');
    process.exit(1);
  }

  let patched = 0;
  for (const item of catalog) {
    let changed = false;
    const next = { ...item, customFields: { ...(item.customFields || {}) } };

    if (!String(next.business_id || next.businessId || '').trim()) {
      next.business_id = deliveryId;
      changed = true;
    }

    if (isComboItem(next)) {
      next.itemType = 'combo';
      if (!Array.isArray(next.customFields.comboStructure) || next.customFields.comboStructure.length === 0) {
        next.customFields.comboStructure = DEFAULT_COMBO_STRUCTURE;
        changed = true;
      }
      if (next.customFields.comboStructureConfirmed !== true) {
        next.customFields.comboStructureConfirmed = true;
        changed = true;
      }
    }

    if (!changed) continue;
    next.updatedAt = new Date().toISOString();
    await couchJson('PUT', `/${CATALOG_DB}/${encodeURIComponent(next._id)}`, next);
    patched += 1;
    console.log(`  ✓ ${next.name} (${next.category || '—'})`);
  }

  console.log(`\nListo: ${patched} documento(s) actualizado(s).`);
  console.log('Entra en Catálogo → Combos y elige pizza + complemento + bebida en cada menú.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
