#!/usr/bin/env node
/**
 * Solo lectura: coherencia Carta → Ingredientes TPV → Almacén (cuenta Mati).
 * node scripts/audit-mati-carta-ingredientes-almacen.mjs
 *
 * En VPS: carga COUCHDB_* desde /opt/vertial/Vertial/.env
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvFile(ENV_PATH);

const COUCH = String(process.env.COUCHDB_URL || process.env.COUCH_URL || 'http://127.0.0.1:5984').replace(
  /\/$/,
  '',
);
const USER = process.env.COUCHDB_USER || 'admin';
const PASS = process.env.COUCHDB_PASSWORD || '';
const PREFIX = String(process.env.COUCHDB_DB || process.env.VITE_COUCHDB_DB || 'BBDDsaas').toLowerCase();
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

const EMAIL_NEEDLES = ['mati.vertial', 'mati@', 'matias'];
const KNOWN_UIDS = [
  'f9e580d9-ca94-4b95-8c83-45f785a190f2',
  '79e28923-5db1-498d-b340-6871232bf5e4',
];

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseIngNames(raw) {
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((n) => {
      const k = fold(n);
      return k && !['ver carta', 'ver menu', 'ver menú', 'n/a', '-', '—'].includes(k);
    });
}

async function couch(pathname) {
  const res = await fetch(`${COUCH}${pathname}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${pathname}: ${data.error || res.status}`);
  return data;
}

async function allDocs(db) {
  const data = await couch(`/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=100000`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function isSellableCarta(item) {
  if (!item || item.deletedAt || item.active === false) return false;
  if ((item.module || 'catalog') !== 'catalog') return false;
  if (item.itemType && item.itemType !== 'product' && item.itemType !== 'combo') return false;
  return true;
}

function isWarehouseStock(item) {
  if (!item || item.deletedAt || item.active === false) return false;
  if (item.itemType && item.itemType !== 'product') return false;
  const mod = String(item.module || 'catalog');
  const sc = String(item.stockCategory || '');
  if (mod === 'stock') return true;
  if (['ingredient', 'beverage', 'packaging', 'cleaning', 'consumable'].includes(sc)) return true;
  if (sc === 'finished_product') return false;
  if (item.isStockItem === true && mod === 'catalog') return false; // plato con control stock ≠ almacén
  return false;
}

function recipeNames(item) {
  const out = [];
  const recipe = item.customFields?.costingRecipe;
  if (Array.isArray(recipe)) {
    for (const line of recipe) {
      const n = String(line?.name || '').trim();
      if (n) out.push(n);
    }
  }
  out.push(...parseIngNames(item.customFields?.ingredients));
  return out;
}

async function main() {
  console.log('[audit-mati] solo lectura', { couch: COUCH, prefix: PREFIX });

  const accounts = await allDocs('accounts');
  const hits = accounts.filter((d) => {
    if (!d || d._deleted) return false;
    const blob = `${d.email || ''} ${d.fullName || ''} ${d.name || ''} ${d.businessName || ''}`.toLowerCase();
    if (EMAIL_NEEDLES.some((n) => blob.includes(n))) return true;
    const uid = String(d.userId || d._id || '').replace(/^account:/, '');
    return KNOWN_UIDS.includes(uid);
  });

  if (hits.length === 0) {
    console.log(JSON.stringify({ ok: false, error: 'No se encontró cuenta Mati' }, null, 2));
    process.exit(2);
  }

  const reports = [];

  for (const acc of hits) {
    const uid = String(acc.userId || acc._id || '').replace(/^account:/, '');
    const email = acc.email || '';
    const name = acc.fullName || acc.name || '';

    const businessesDb = await allDocs('businesses').catch(() => []);
    const businesses = businessesDb.filter(
      (b) =>
        b &&
        !b._deleted &&
        !b.deletedAt &&
        (String(b.owner_user_id || '') === uid ||
          (b.members || []).some((m) => String(m.user_id || '') === uid)),
    );

    let cfg = null;
    try {
      cfg = await couch(`/${encodeURIComponent(`${PREFIX}-delivery`)}/dlvconf-${uid}`);
    } catch {
      cfg = null;
    }
    const storeIngredients = Array.isArray(cfg?.storeIngredients) ? cfg.storeIngredients : [];
    const ingNames = new Set(
      storeIngredients.map((i) => fold(i.name)).filter(Boolean),
    );

    const catalogDb = `${PREFIX}-catalog`;
    const allCatalog = (await allDocs(catalogDb)).filter(
      (d) => d && d.type === 'catalog_item' && String(d.user_id || '') === uid && !d.deletedAt,
    );

    const carta = allCatalog.filter(isSellableCarta);
    const almacen = allCatalog.filter(isWarehouseStock);
    const cartaWithStockFlag = carta.filter((i) => i.isStockItem === true);

    const namesFromCarta = new Set();
    const cartaSinIng = [];
    for (const item of carta) {
      const names = recipeNames(item);
      if (names.length === 0 && item.itemType !== 'combo') {
        cartaSinIng.push({ id: item._id, name: item.name, category: item.category });
      }
      for (const n of names) namesFromCarta.add(fold(n));
    }

    const inCartaNotInTpv = [...namesFromCarta].filter((n) => !ingNames.has(n)).sort();
    const inTpvNotInCarta = [...ingNames].filter((n) => !namesFromCarta.has(n)).sort();

    const almacenByName = new Map();
    for (const s of almacen) {
      almacenByName.set(fold(s.name), s);
    }
    const tpvWithoutWarehouse = [...ingNames].filter((n) => !almacenByName.has(n)).sort();
    const warehouseOrphans = [...almacenByName.keys()]
      .filter((n) => !ingNames.has(n) && !namesFromCarta.has(n))
      .sort();

    reports.push({
      account: { uid, email, name, businessName: acc.businessName || null },
      businesses: businesses.map((b) => ({
        id: b._id,
        name: b.name,
        type: b.businessType,
      })),
      counts: {
        cartaProductos: carta.length,
        ingredientesTpv: storeIngredients.length,
        almacenReal: almacen.length,
        cartaConIsStockItem: cartaWithStockFlag.length,
      },
      gaps: {
        nombresEnCartaSinIngredienteTpv: inCartaNotInTpv.length,
        ingredientesTpvSinAparecerEnCarta: inTpvNotInCarta.length,
        ingredientesTpvSinArticuloAlmacen: tpvWithoutWarehouse.length,
        almacenSinLigarATpvNiCarta: warehouseOrphans.length,
        productosCartaSinRecetaNiChips: cartaSinIng.length,
      },
      samples: {
        cartaSinIng: cartaSinIng.slice(0, 15),
        nombresEnCartaSinIngredienteTpv: inCartaNotInTpv.slice(0, 25),
        ingredientesTpvSinArticuloAlmacen: tpvWithoutWarehouse.slice(0, 25),
        almacenSinLigarATpvNiCarta: warehouseOrphans.slice(0, 25),
        ingredientesTpvMuestra: storeIngredients.slice(0, 20).map((i) => i.name),
        almacenMuestra: almacen.slice(0, 20).map((i) => ({
          name: i.name,
          module: i.module,
          stockCategory: i.stockCategory,
        })),
      },
      verdict: (() => {
        const issues = [];
        if (storeIngredients.length === 0 && namesFromCarta.size > 0) {
          issues.push('Hay nombres en carta/recetas pero ingredientes TPV está vacío');
        }
        if (inCartaNotInTpv.length > 0) {
          issues.push(`${inCartaNotInTpv.length} nombre(s) de carta no están en Ingredientes TPV`);
        }
        if (tpvWithoutWarehouse.length > 0) {
          issues.push(`${tpvWithoutWarehouse.length} ingrediente(s) TPV sin artículo de almacén`);
        }
        if (cartaWithStockFlag.length > 0) {
          issues.push(
            `${cartaWithStockFlag.length} producto(s) de carta tienen isStockItem (pueden confundir almacén)`,
          );
        }
        if (issues.length === 0) {
          return {
            ok: true,
            summary: 'Carta ↔ ingredientes ↔ almacén encaja razonablemente (sin huecos graves).',
          };
        }
        return { ok: false, summary: issues.join(' · ') };
      })(),
    });
  }

  console.log(JSON.stringify({ ok: true, reports }, null, 2));
}

main().catch((err) => {
  console.error('[audit-mati] ERROR', err?.message || err);
  process.exit(1);
});
