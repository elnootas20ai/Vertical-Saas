#!/usr/bin/env node
/**
 * Sella business_id en PDVs delivery del admin según centro de trabajo / nombre.
 * Soft-delete duplicados numerados (ej. "tiana - 239") que ensucian el scope.
 */
import '../config/env.js';

const base = String(process.env.COUCHDB_URL || '').replace(/\/+$/, '');
const auth =
  'Basic ' +
  Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64');
const ADMIN = 'e94ccc03-5399-40a8-8e92-740bd66f38e0';
const MODO = '33821959-ae50-4e52-bfea-ea2b145faeac';
const BODE = '16487cd6-cccd-42bf-9d96-db415af456ea';
const VERT = 'a86b537e-0c4d-4b43-9baf-6a5681ceb2d1';
const APPLY = process.argv.includes('--apply');
const prefix = String(process.env.COUCHDB_DB || process.env.VITE_COUCHDB_DB || 'bbddsaas').toLowerCase();

async function couch(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function allDocs(db) {
  const data = await couch('GET', `/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=50000`);
  if (data.error) return [];
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function guessBiz(name, wcBiz) {
  if (wcBiz) return wcBiz;
  const n = String(name || '').toLowerCase();
  if (n.startsWith('bodegeta')) return BODE;
  if (n.startsWith('can arnau')) return VERT;
  if (n.startsWith('tiana') || n.startsWith('prueba') || n.startsWith('badalona') || n.startsWith('modomio')) {
    return MODO;
  }
  return '';
}

function isNumberedDuplicate(name) {
  return /\s-\s*\d+\s*$/.test(String(name || '').trim());
}

async function main() {
  console.log(APPLY ? '=== APPLY ===' : '=== DRY ===');
  const deliveryDb = `${prefix}-delivery`;
  const wcDbs = [`${prefix}-sales-points`, 'udar-sales-points', 'vertial-sales-points'];

  const wcById = new Map();
  for (const db of wcDbs) {
    for (const d of await allDocs(db)) {
      if ((d.type === 'sales_point' || d.type === 'work_center') && !d.deletedAt) {
        wcById.set(d._id, d);
      }
    }
  }

  const pdvs = (await allDocs(deliveryDb)).filter(
    (d) => d.type === 'point_of_sale' && !d.deletedAt && String(d.user_id || '') === ADMIN,
  );
  console.log('PDVs admin activos:', pdvs.length);

  let stamped = 0;
  let softDeleted = 0;
  for (const p of pdvs) {
    const wc = p.workCenterId ? wcById.get(p.workCenterId) : null;
    const wcBiz = String(wc?.businessId || wc?.business_id || '').trim();
    const target = guessBiz(p.name, wcBiz);
    const current = String(p.businessId || p.business_id || '').trim();

    if (isNumberedDuplicate(p.name)) {
      softDeleted += 1;
      if (APPLY) {
        await couch('PUT', `/${encodeURIComponent(deliveryDb)}/${encodeURIComponent(p._id)}`, {
          ...p,
          deletedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedReason: 'scope-cleanup: duplicado numerado',
        });
      }
      continue;
    }

    if (target && current !== target) {
      stamped += 1;
      console.log(`stamp ${p.name}: ${current || '(vacío)'} → ${target.slice(0, 8)}`);
      if (APPLY) {
        await couch('PUT', `/${encodeURIComponent(deliveryDb)}/${encodeURIComponent(p._id)}`, {
          ...p,
          business_id: target,
          businessId: target,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  // Asegurar WCs canónicos en bbddsaas-sales-points (DB activa del backend)
  const activeWcDb = `${prefix}-sales-points`;
  const udar = (await allDocs('udar-sales-points')).filter(
    (d) => d.type === 'sales_point' && !d.deletedAt && String(d.user_id || '') === ADMIN,
  );
  console.log('WCs admin en udar:', udar.length);
  for (const w of udar) {
    const existing = await couch('GET', `/${encodeURIComponent(activeWcDb)}/${encodeURIComponent(w._id)}`);
    if (existing && !existing.error && !existing.deletedAt) {
      const bid = String(w.businessId || w.business_id || '').trim();
      const cur = String(existing.businessId || existing.business_id || '').trim();
      if (bid && cur !== bid) {
        console.log(`wc sync biz ${w.name}: ${cur || '(vacío)'} → ${bid.slice(0, 8)}`);
        if (APPLY) {
          await couch('PUT', `/${encodeURIComponent(activeWcDb)}/${encodeURIComponent(w._id)}`, {
            ...existing,
            businessId: bid,
            business_id: bid,
            updatedAt: new Date().toISOString(),
          });
        }
      }
      continue;
    }
    console.log(`wc copy → ${activeWcDb}: ${w.name}`);
    if (APPLY) {
      const { _rev, ...rest } = w;
      await couch('PUT', `/${encodeURIComponent(activeWcDb)}/${encodeURIComponent(w._id)}`, {
        ...rest,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  console.log(`\nResumen: stamp=${stamped} softDeleteDuplicates=${softDeleted}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
