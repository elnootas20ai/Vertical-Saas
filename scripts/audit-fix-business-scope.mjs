#!/usr/bin/env node
/**
 * Auditoría + reparación: pedidos/PDV del admin deben coincidir con la empresa
 * del PDV o, si no hay PDV, con modomio (delivery).
 */
import '../config/env.js';

const base = String(process.env.COUCHDB_URL || '').replace(/\/+$/, '');
const auth =
  'Basic ' +
  Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64');
const ADMIN = 'e94ccc03-5399-40a8-8e92-740bd66f38e0';
const MODO = '33821959-ae50-4e52-bfea-ea2b145faeac';
const APPLY = process.argv.includes('--apply');

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

async function main() {
  console.log(APPLY ? '=== APPLY ===' : '=== AUDIT (usa --apply para reparar) ===');

  const businesses = (await allDocs('businesses')).filter(
    (b) => b.type === 'business' && !b.deletedAt && b.owner_user_id === ADMIN,
  );
  console.log('\nEmpresas admin activas:');
  for (const b of businesses) {
    console.log(`- ${b.name} | ${b.businessType} | ${b.business_id}`);
  }

  const sps = (await allDocs('bbddsaas-sales-points')).filter(
    (d) => d.type === 'sales_point' && !d.deletedAt && d.user_id === ADMIN,
  );
  console.log('\nPDV admin (bbddsaas-sales-points):');
  const pdvBiz = {};
  for (const s of sps) {
    const bid = s.businessId || s.business_id || '?';
    pdvBiz[bid] = (pdvBiz[bid] || 0) + 1;
    console.log(`- ${s.name} → ${bid}`);
  }

  const orders = (await allDocs('bbddsaas-delivery')).filter(
    (d) => d.type === 'delivery_order' && !d.deletedAt && d.user_id === ADMIN,
  );
  const byBiz = {};
  for (const o of orders) {
    const bid = o.business_id || o.businessId || '(vacío)';
    byBiz[bid] = (byBiz[bid] || 0) + 1;
  }
  console.log('\nPedidos admin por empresa:', byBiz);

  const catalog = (await allDocs('bbddsaas-catalog')).filter(
    (d) => d.user_id === ADMIN && !d.deletedAt && (d.type === 'catalog_item' || d.type === 'brand'),
  );
  const catBy = {};
  for (const c of catalog) {
    const bid = c.business_id || c.businessId || '(vacío)';
    const key = `${c.type}:${bid}`;
    catBy[key] = (catBy[key] || 0) + 1;
  }
  console.log('\nCatálogo/marcas admin:', catBy);

  // Pedidos cuyo business_id no existe o está borrado → reparar a MODO si son pizza/delivery
  const activeIds = new Set(businesses.map((b) => b.business_id));
  const orphanOrders = orders.filter((o) => {
    const bid = o.business_id || o.businessId || '';
    return !bid || !activeIds.has(bid);
  });
  console.log(`\nPedidos huérfanos (empresa inexistente/borrada): ${orphanOrders.length}`);

  if (APPLY && orphanOrders.length) {
    for (const o of orphanOrders) {
      const next = {
        ...o,
        business_id: MODO,
        businessId: MODO,
        updatedAt: new Date().toISOString(),
        scopeFixedAt: new Date().toISOString(),
        scopeFixedFrom: o.business_id || o.businessId || '(empty)',
      };
      await couch('PUT', `/bbddsaas-delivery/${encodeURIComponent(o._id)}`, next);
      console.log('  ✓', o.orderNumber || o._id, '→ modomio');
    }
  }

  // Detectar pedidos en empresa distinta al PDV (por salesPointId)
  const pdvMap = new Map(sps.map((s) => [s._id, s]));
  let mismatch = 0;
  for (const o of orders) {
    const pdv = pdvMap.get(String(o.salesPointId || '').trim());
    if (!pdv) continue;
    const pdvBid = String(pdv.businessId || pdv.business_id || '').trim();
    const orderBid = String(o.business_id || o.businessId || '').trim();
    if (pdvBid && orderBid && pdvBid !== orderBid) {
      mismatch += 1;
      if (APPLY) {
        const next = {
          ...o,
          business_id: pdvBid,
          businessId: pdvBid,
          updatedAt: new Date().toISOString(),
          scopeFixedAt: new Date().toISOString(),
          scopeFixedFrom: orderBid,
        };
        await couch('PUT', `/bbddsaas-delivery/${encodeURIComponent(o._id)}`, next);
        console.log('  ✓ mismatch', o.orderNumber, orderBid.slice(0, 8), '→', pdvBid.slice(0, 8));
      } else if (mismatch <= 8) {
        console.log('  mismatch', o.orderNumber, 'order=', orderBid.slice(0, 8), 'pdv=', pdvBid.slice(0, 8), pdv.name);
      }
    }
  }
  console.log(`Pedidos con business_id ≠ PDV: ${mismatch}`);
  console.log('\nListo.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
