#!/usr/bin/env node
/**
 * Solo lectura: pizzas del turno Badalona / Pau (hoy).
 * Compara conteo sistema vs líneas de cada pedido.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const BADALONA_HINT = /badalona|royo|amor/i;

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=100000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function localDayKey(d = new Date()) {
  // Europe/Madrid approx via local VPS timezone
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayKeyFromIso(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return localDayKey(d);
}

function isHalfHalf(category, name) {
  const blob = `${fold(category)} ${fold(name)}`.trim();
  return /mitad\s*y\s*mitad|half\s*(and|&|-)?\s*half|halfhalf/.test(blob);
}

function classify(category, name) {
  const cat = fold(category);
  const nm = fold(name);
  if (/taco/.test(cat) || /\btacos?\b/.test(nm)) return 'taco';
  if (/burger|hamburg|smash/.test(cat) || /burger|hamburg|smash/.test(nm)) return 'burger';
  if (/postre|dessert|helado|tiramisu/.test(cat)) return null;
  if (/nutella/.test(nm) && /pizza/.test(nm)) return null;
  if (/pizza|calzone|premium|especialidad/.test(cat) || /pizza|calzone/.test(nm) || isHalfHalf(category, name)) {
    return 'pizza';
  }
  return null;
}

function pizzaUnitsFromLabel(category, name) {
  const blob = `${fold(category)} ${fold(name)}`.trim();
  if (!blob) return null;
  if (/\bfamiliar\b|\bfamily\b/.test(blob)) return 3;
  if (/\bduos?\b/.test(blob)) return 2;
  if (/combo\s*modomm?io|modomm?io\s*combo/.test(blob)) return 1;
  if (/\bindividual(es)?\b|\bestandar\b/.test(blob)) return 1;
  return null;
}

function parseComboExtra(raw) {
  let s = String(raw || '').trim();
  if (!s.startsWith('▸') && !s.startsWith('>')) return null;
  s = s.replace(/^[▸>]\s*/, '').trim();
  if (!s) return null;
  const m = s.match(/^(.*?)\s*[×x]\s*(\d+)\s*$/i);
  if (m) return { name: m[1].trim(), units: Math.max(1, Number(m[2]) || 1) };
  return { name: s, units: 1 };
}

function isSideExtra(name) {
  return /bebida|refresco|agua|coca|fanta|sprite|cerveza|vino|cafe|te\b|patata|frita|complemento|acompan|postre|helado|tiramisu|nugget|alita|ensalada|salad|dip|salsa|brownie|cookie|batido|smoothie|zumo|nestea|aquarius|red.?bull|monster|maiz|pan\b|aros|tequeno|salchipapa|chicken\s*balls?/.test(
    fold(name),
  );
}

function countItem(item) {
  const qty = Math.max(1, Number(item.quantity) || 1);
  const out = { pizza: 0, burger: 0, taco: 0, notes: [] };
  const sizeUnits = pizzaUnitsFromLabel(item.category, item.name);
  const family = classify(item.category, item.name);
  const extras = Array.isArray(item.extras) ? item.extras : [];

  if (isHalfHalf(item.category, item.name)) {
    out.pizza += qty;
    out.notes.push(`mitad→${qty} pizza`);
    return out;
  }

  if (sizeUnits != null) {
    const pizzaMenu = family === 'pizza' || sizeUnits >= 1;
    let fromExtras = 0;
    for (const ex of extras) {
      const part = parseComboExtra(ex);
      if (!part) continue;
      if (isSideExtra(part.name)) continue;
      const partFamily = classify('', part.name);
      if (partFamily === 'pizza') {
        out.pizza += part.units * qty;
        fromExtras += part.units * qty;
        out.notes.push(`extra ${part.name}×${part.units}`);
      } else if (partFamily === 'burger') out.burger += part.units * qty;
      else if (partFamily === 'taco') out.taco += part.units * qty;
      else if (pizzaMenu) {
        out.pizza += part.units * qty;
        fromExtras += part.units * qty;
        out.notes.push(`extra-as-pizza ${part.name}×${part.units}`);
      }
    }
    if (out.pizza === 0 && fromExtras === 0) {
      out.pizza += sizeUnits * qty;
      out.notes.push(`fallback menu sizeUnits=${sizeUnits}`);
    }
    return out;
  }

  if (family === 'pizza') {
    out.pizza += qty * (sizeUnits || 1);
    out.notes.push(`carta ${item.name}`);
  } else if (family === 'burger') out.burger += qty;
  else if (family === 'taco') out.taco += qty;
  return out;
}

function isCancelled(o) {
  const st = fold(o.status || o.orderStatus || '');
  return /cancel|anulad|void|deleted|devuel/.test(st) || Boolean(o.deletedAt) || Boolean(o.cancelledAt);
}

const today = localDayKey();
console.log('Hoy VPS:', today);

const [delivery] = await Promise.all([allDocs('bbddsaas-delivery')]);

const sessions = delivery.filter(
  (d) =>
    d?.type === 'tpv_register_session' &&
    !d?.deletedAt &&
    (d.user_id === PAU || BADALONA_HINT.test(String(d.pointOfSaleName || ''))),
);

const todaySessions = sessions
  .filter((s) => dayKeyFromIso(s.openedAt) === today || dayKeyFromIso(s.closedAt) === today)
  .sort((a, b) => String(b.openedAt || '').localeCompare(String(a.openedAt || '')));

console.log(`\n=== Sesiones Pau/Badalona hoy (${todaySessions.length}) ===`);
for (const s of todaySessions) {
  console.log({
    id: s._id,
    status: s.status,
    openedAt: s.openedAt,
    closedAt: s.closedAt || null,
    pdv: s.pointOfSaleName || s.pointOfSaleId,
    worker: s.workerName,
    productClosingCounts: s.productClosingCounts || null,
    linked: (s.linkedOrderIds || []).length,
    txs: (s.transactions || []).length,
  });
}

const open =
  todaySessions.find(
    (s) =>
      String(s.status) === 'open' &&
      (BADALONA_HINT.test(String(s.pointOfSaleName || '')) ||
        String(s.pointOfSaleId || '').includes('594a8503')),
  ) ||
  todaySessions.find((s) => String(s.status) === 'open') ||
  todaySessions[0];
if (!open) {
  console.log('Sin sesión hoy. Últimas 5 Badalona:');
  for (const s of sessions
    .filter((x) => BADALONA_HINT.test(String(x.pointOfSaleName || '')) || String(x.pointOfSaleId || '').includes('594a8503'))
    .sort((a, b) => String(b.openedAt || '').localeCompare(String(a.openedAt || '')))
    .slice(0, 5)) {
    console.log(s._id, s.status, s.openedAt, s.pointOfSaleName, s.productClosingCounts);
  }
  process.exit(0);
}

const pdvId = String(open.pointOfSaleId || '').trim();
const openedAt = open.openedAt;
const closedAt = open.closedAt || null;

const orders = delivery.filter((d) => {
  if (d?.type !== 'delivery_order' && d?.type !== 'order') return false;
  if (d.deletedAt) return false;
  if (isCancelled(d)) return false;
  const oid = String(d.salesPointId || d.pointOfSaleId || d.pdvId || '').trim();
  if (pdvId && oid && oid !== pdvId) {
    // también por nombre
    if (!BADALONA_HINT.test(String(d.salesPointName || ''))) return false;
  }
  const t = d.createdAt || d.orderedAt || d.updatedAt;
  if (!t) return false;
  if (openedAt && String(t) < String(openedAt)) return false;
  if (closedAt && String(t) > String(closedAt)) return false;
  // mismo día de apertura
  if (dayKeyFromIso(t) !== dayKeyFromIso(openedAt) && dayKeyFromIso(t) !== today) return false;
  return true;
});

// Prefer linked ids if present
const linked = new Set((open.linkedOrderIds || []).map(String));
const scoped =
  linked.size > 0
    ? delivery.filter((d) => linked.has(String(d._id || d.id || '')) && !isCancelled(d) && !d.deletedAt)
    : orders;

console.log(`\n=== Sesión activa ${open._id} ===`);
console.log(`PDV=${open.pointOfSaleName} opened=${open.openedAt}`);
console.log(`Pedidos en scope: ${scoped.length} (linked=${linked.size || 'n/a'})`);

let total = { pizza: 0, burger: 0, taco: 0 };
for (const o of scoped.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))) {
  const items = Array.isArray(o.items) ? o.items : [];
  let op = { pizza: 0, burger: 0, taco: 0 };
  console.log(`\n--- ${o._id} #${o.orderNumber || o.code || ''} ch=${o.channel || o.source || '?'} st=${o.status} ---`);
  for (const it of items) {
    const c = countItem(it);
    op.pizza += c.pizza;
    op.burger += c.burger;
    op.taco += c.taco;
    console.log(
      `  · qty=${it.quantity} [${it.category || ''}] ${it.name} → 🍕${c.pizza} 🍔${c.burger} 🌮${c.taco}` +
        (c.notes.length ? ` (${c.notes.join('; ')})` : ''),
    );
    if (Array.isArray(it.extras) && it.extras.length) {
      console.log('    extras:', JSON.stringify(it.extras));
    }
  }
  total.pizza += op.pizza;
  total.burger += op.burger;
  total.taco += op.taco;
  console.log(`  pedido = 🍕${op.pizza} 🍔${op.burger} 🌮${op.taco}`);
}

console.log('\n=== TOTAL SISTEMA (lógica actual) ===');
console.log(total);
console.log('productClosingCounts guardado:', open.productClosingCounts || null);
