/**
 * Escanea CouchDB en el VPS por «pizzas grandes» / «pizzerias».
 * Uso en VPS: node scripts/scan-prod-pizzas.mjs
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=10000`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

async function main() {
  const [businesses, workCenters, accounts, pdvs] = await Promise.all([
    allDocs('businesses'),
    allDocs('bbddsaas-sales-points'),
    allDocs('accounts'),
    allDocs('bbddsaas-delivery'),
  ]);

  const pizzaBiz = businesses.filter((b) => /pizza|pizzer/i.test(String(b.name || '')));
  const pizzaWc = workCenters.filter(
    (wc) =>
      wc.type === 'sales_point' &&
      !wc.deletedAt &&
      /pizza|pizzer/i.test(String(wc.name || '')),
  );
  const pdvDocs = pdvs.filter((d) => d.type === 'point_of_sale' || d.docType === 'point_of_sale');

  console.log('\n=== EMPRESAS pizza/pizzer ===');
  for (const b of pizzaBiz) {
    console.log(JSON.stringify({
      name: b.name,
      business_id: b.business_id || b._id,
      owner_user_id: b.owner_user_id,
      businessType: b.businessType,
    }));
  }

  console.log('\n=== TIENDAS (work centers) ===');
  for (const wc of pizzaWc) {
    console.log(JSON.stringify({
      _id: wc._id,
      name: wc.name,
      businessId: wc.businessId || wc.business_id || null,
      user_id: wc.user_id,
      centerType: wc.centerType,
      address: wc.address || null,
    }));
  }

  console.log('\n=== PDV delivery enlazados ===');
  for (const wc of pizzaWc) {
    const linked = pdvDocs.filter((p) => String(p.workCenterId || '') === wc._id);
    for (const p of linked) {
      console.log(JSON.stringify({ pdv: p.name, code: p.code, wc: wc.name, user_id: p.user_id, active: p.active }));
    }
    if (!linked.length) console.log(JSON.stringify({ wc: wc.name, pdv: 'NINGUNO' }));
  }

  const owners = new Set(pizzaBiz.map((b) => String(b.owner_user_id || '').trim()).filter(Boolean));
  console.log('\n=== CUENTAS (email) ===');
  for (const a of accounts) {
    const uid = String(a.user_id || a._id || '').trim();
    if (!owners.has(uid)) continue;
    console.log(JSON.stringify({ email: a.email, user_id: uid }));
  }

  // Simular filtro Ajustes → Tienda
  console.log('\n=== SIMULACIÓN filtro Ajustes ===');
  for (const b of pizzaBiz) {
    const bid = String(b.business_id || b._id || '').trim();
    const ownerBiz = businesses.filter((x) => String(x.owner_user_id || '') === String(b.owner_user_id || ''));
    const accountN = ownerBiz.length;
    const uid = String(b.owner_user_id || '').trim();
    const accountWcs = workCenters.filter(
      (wc) => wc.type === 'sales_point' && !wc.deletedAt && String(wc.user_id || '') === uid,
    );
    const active = accountWcs.filter((wc) => !wc.deletedAt);
    const mine = active.filter((wc) => String(wc.businessId || wc.business_id || '').trim() === bid);
    const mineRetail = mine.filter((wc) => wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen');
    let scoped = mine;
    if (mineRetail.length === 0) {
      const legacy = active.filter(
        (wc) =>
          !(wc.businessId || wc.business_id) &&
          (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
      );
      scoped = [...mine, ...legacy];
    }
    console.log(
      JSON.stringify({
        empresa: b.name,
        bid,
        empresasCuenta: accountN,
        visibleEnAjustes: scoped.map((x) => x.name),
      }),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
