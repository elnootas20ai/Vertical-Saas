#!/usr/bin/env node
/**
 * DISARMINK — alinear precios bebidas / cervezas / vino con carta Tiana (foto Gloria 30-jul-2026).
 *
 *   node scripts/fix-disarmink-bebidas-precios-tiana.mjs
 *   node scripts/fix-disarmink-bebidas-precios-tiana.mjs --apply
 */
import { randomUUID } from 'node:crypto';

const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DB = 'bbddsaas-catalog';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const PAU_USER = '13e49ef6-183a-4afa-a17b-7730917fe685';
const APPLY = process.argv.includes('--apply');

/** Precios objetivo (foto Tiana). */
const TARGETS = [
  // Refrescos
  { key: 'coca', price: 1.9, category: 'Bebidas', name: 'Coca-Cola', match: (n) => /^coca[\s-]*cola$/.test(n) || n === 'cocacola' },
  { key: 'coca0', price: 1.9, category: 'Bebidas', name: 'Coca-Cola 0', match: (n) => (/coca/.test(n) && (/\b0\b/.test(n) || /zero/.test(n))) && !/2\s*l|\b2l\b|33/.test(n) },
  { key: 'fanta_naranja', price: 1.9, category: 'Bebidas', name: 'Fanta Naranja', match: (n) => /fanta/.test(n) && /naranja/.test(n) && !/2\s*l|\b2l\b/.test(n) },
  { key: 'fanta_limon', price: 1.9, category: 'Bebidas', name: 'Fanta Limón', match: (n) => /fanta/.test(n) && /limon/.test(n) && !/2\s*l|\b2l\b/.test(n) },
  { key: 'nestea', price: 1.9, category: 'Bebidas', name: 'Nestea', match: (n) => /^nestea/.test(n) && !/2\s*l|\b2l\b/.test(n) },
  {
    key: 'aquarius_limon',
    price: 1.9,
    category: 'Bebidas',
    name: 'Aquarius Limón',
    match: (n) => /aquarius/.test(n) && /limon/.test(n) && !/50\s*cl|1[,.]5|2\s*l/.test(n),
  },
  {
    key: 'aquarius_naranja',
    price: 1.9,
    category: 'Bebidas',
    name: 'Aquarius Naranja',
    match: (n) => /aquarius/.test(n) && /naranja/.test(n) && !/50\s*cl|1[,.]5|2\s*l/.test(n),
  },
  {
    key: 'agua',
    price: 1.2,
    category: 'Bebidas',
    name: 'Agua',
    // Solo la línea de carta «Agua» / «Agua 50cl»; no tocar otras aguas.
    match: (n) => n === 'agua' || n === 'agua 50cl' || n === 'agua mineral',
  },
  { key: 'coca_2l', price: 3.5, category: 'Bebidas', name: 'Coca-Cola 2L', match: (n) => /coca/.test(n) && /2\s*l|\b2l\b|2\s*litros?/.test(n) },
  { key: 'fanta_naranja_2l', price: 3.5, category: 'Bebidas', name: 'Fanta Naranja 2L', match: (n) => /fanta/.test(n) && /naranja/.test(n) && /2\s*l|\b2l\b/.test(n) },
  { key: 'fanta_limon_2l', price: 3.5, category: 'Bebidas', name: 'Fanta Limón 2L', match: (n) => /fanta/.test(n) && /limon/.test(n) && /2\s*l|\b2l\b/.test(n) },

  // Cervezas
  { key: 'estrella', price: 1.9, category: 'Cervezas', name: 'Estrella Damm', match: (n) => /estrella/.test(n) && !/galicia|00|0,0|0\.0/.test(n) },
  { key: 'voll', price: 2.2, category: 'Cervezas', name: 'Voll Damm', match: (n) => /voll\s*damm|volldamm|voll\s*dam\b/.test(n) },
  { key: 'moretti', price: 2.95, category: 'Cervezas', name: 'Moretti', match: (n) => /moretti/.test(n) },
  {
    key: 'peroni',
    price: 2.95,
    category: 'Cervezas',
    name: 'Peroni',
    // OJO: no capturar «Pepperoni» (pizza).
    match: (n) => (/\bperoni\b/.test(n) || n === 'peroni') && !/pepperoni/.test(n),
  },
  { key: 'moritz00', price: 2.2, category: 'Cervezas', name: 'Moritz 0,0', match: (n) => /moritz/.test(n) && /0[,.]?\s*0|sin\s*alcohol|0\.0/.test(n) },
  { key: 'amstel', price: 2.2, category: 'Cervezas', name: 'Amstel Radler', match: (n) => /amstel/.test(n) && /radler/.test(n) },
  { key: 'desperados', price: 3.5, category: 'Cervezas', name: 'Desperados', match: (n) => /desperados/.test(n) },
  { key: 'cerdos_vol', price: 3.5, category: 'Cervezas', name: 'Cerdos Vol', match: (n) => /cerdos?\s*vol|voladores|cerdos\s*voladores/.test(n) || n === 'cerdos vol' },
  { key: 'nina_barbuda', price: 3.5, category: 'Cervezas', name: 'Niña Barbuda', match: (n) => /nina\s*barbuda|niña\s*barbuda/.test(n) },

  // Vinos
  { key: 'vino_blanco', price: 8.25, category: 'Vinos', name: 'Botella Vino Blanco', match: (n) => /vino/.test(n) && /blanco/.test(n) },
  { key: 'vino_tinto', price: 8.25, category: 'Vinos', name: 'Botella Vino Negro', match: (n) => /vino/.test(n) && (/negro|tinto|rojo/.test(n)) },
  { key: 'lambrusco', price: 6.95, category: 'Vinos', name: 'Lambrusco', match: (n) => /lambrusco/.test(n) },
];

async function couch(method, path, body) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error || res.status} ${data.reason || ''}`);
  return data;
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function priceOf(d) {
  const n = Number(d.unitPrice ?? d.price ?? d.basePrice ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function approx(a, b, tol = 0.005) {
  return Math.abs(Number(a) - Number(b)) <= tol;
}

function scoreKeep(d) {
  let s = 0;
  if (!d.deletedAt) s += 100;
  if (d.active !== false) s += 20;
  if (priceOf(d) > 0) s += 10;
  if (!/33cl/.test(fold(d.name))) s += 5; // preferir nombre limpio tipo carta
  return s;
}

async function put(doc) {
  return couch('PUT', `/${DB}/${encodeURIComponent(doc._id)}`, doc);
}

const all = await couch('GET', `/${DB}/_all_docs?include_docs=true&limit=80000`);
const docs = (all.rows || [])
  .map((r) => r.doc)
  .filter((d) => d?.type === 'catalog_item' && bid(d) === DISARMINK);

const live = docs.filter((d) => !d.deletedAt);
const template = live.find((d) => /bebida|cerveza|vino|refresco/i.test(String(d.category || ''))) || live[0];

console.log(APPLY ? '=== APPLY Disarmink precios Tiana ===' : '=== DRY Disarmink precios Tiana ===');
console.log(`Catálogo vivo: ${live.length}`);

const actions = [];

for (const t of TARGETS) {
  const matches = live.filter((d) => t.match(fold(d.name)));
  matches.sort((a, b) => scoreKeep(b) - scoreKeep(a));

  if (!matches.length) {
    actions.push({
      type: 'create',
      target: t,
      doc: {
        _id: `catitem-${randomUUID()}`,
        type: 'catalog_item',
        name: t.name,
        category: t.category,
        unitPrice: t.price,
        price: t.price,
        active: true,
        available: true,
        isStockItem: false,
        module: 'catalog',
        stockCategory: 'finished_product',
        business_id: DISARMINK,
        businessId: DISARMINK,
        user_id: template?.user_id || PAU_USER,
        brandId: template?.brandId || template?.brand_id || undefined,
        brand_id: template?.brand_id || template?.brandId || undefined,
        taxRate: template?.taxRate ?? 10,
        unit: 'ud',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
    });
    continue;
  }

  const keep = matches[0];
  const dups = matches.slice(1);

  if (!approx(priceOf(keep), t.price) || keep.active === false) {
    actions.push({ type: 'price', target: t, doc: keep, from: priceOf(keep), to: t.price });
  } else {
    actions.push({ type: 'ok', target: t, doc: keep, from: priceOf(keep) });
  }

  // Duplicados vivos del mismo producto: soft-delete (evitar 2 cocas / 2 fantas)
  for (const d of dups) {
    // No borrar variantes distintas que el match capturó de más por error
    // (p.ej. coca 33cl vs coca): si el nombre es claramente otra variante 2L, ya están separados por match.
    actions.push({ type: 'soft-delete', target: t, doc: d, reason: `duplicado de ${t.key}` });
  }
}

// Soft-delete extras conocidos que ensucian TPV: Coca/Zero/Fanta 33cl a precio distinto cuando ya hay versión limpia
const junkMatchers = [
  (n) => /coca/.test(n) && /33cl/.test(n) && !/2\s*l|\b2l\b/.test(n),
  (n) => /fanta/.test(n) && /33cl/.test(n) && !/2\s*l|\b2l\b/.test(n),
  (n) => /nestea/.test(n) && /33cl/.test(n),
];
for (const d of live) {
  const n = fold(d.name);
  if (!junkMatchers.some((fn) => fn(n))) continue;
  // Si ya hay acción sobre este id, skip
  if (actions.some((a) => a.doc?._id === d._id)) continue;
  actions.push({ type: 'soft-delete', target: { key: 'junk_33cl', name: d.name }, doc: d, reason: 'variante 33cl duplicada (carta usa nombre limpio)' });
}

console.log('\n— Plan —');
for (const a of actions) {
  if (a.type === 'ok') {
    console.log(`OK      ${a.target.name.padEnd(24)} ${a.from}€  (${a.doc._id})`);
  } else if (a.type === 'price') {
    console.log(`PRECIO  ${a.target.name.padEnd(24)} ${a.from} → ${a.to}  (${a.doc._id})`);
  } else if (a.type === 'create') {
    console.log(`CREAR   ${a.target.name.padEnd(24)} ${a.target.price}€  (${a.doc._id})`);
  } else if (a.type === 'soft-delete') {
    console.log(`BORRAR  ${String(a.doc.name).padEnd(24)} ${priceOf(a.doc)}€  (${a.doc._id}) · ${a.reason}`);
  }
}

const writes = actions.filter((a) => a.type !== 'ok');
console.log(`\nCambios: ${writes.length} (OK sin tocar: ${actions.length - writes.length})`);

if (!APPLY) {
  console.log('Dry-run OK. Pasa --apply para guardar.');
  process.exit(0);
}

const now = new Date().toISOString();
for (const a of actions) {
  if (a.type === 'ok') continue;
  if (a.type === 'price') {
    const next = {
      ...a.doc,
      name: a.target.name, // alinear nombre con carta
      category: a.doc.category || a.target.category,
      unitPrice: a.to,
      price: a.to,
      active: true,
      available: true,
      deletedAt: null,
      updatedAt: now,
    };
    const saved = await put(next);
    console.log('priced', a.doc._id, a.to, saved.rev);
  } else if (a.type === 'create') {
    const saved = await put({ ...a.doc, updatedAt: now });
    console.log('created', a.doc._id, saved.rev);
  } else if (a.type === 'soft-delete') {
    const saved = await put({
      ...a.doc,
      deletedAt: now,
      active: false,
      available: false,
      updatedAt: now,
    });
    console.log('deleted', a.doc._id, saved.rev);
  }
}

console.log('\nHecho. Recarga TPV Disarmink (Ctrl+Shift+R).');
