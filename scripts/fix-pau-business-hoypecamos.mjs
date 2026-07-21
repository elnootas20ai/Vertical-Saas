/**
 * Renombra la empresa delivery de Pau (Badalona/Modomio) a «hoypecamos»
 * y la deja como empresa activa (antes salía PAUNILPOL SL por linkedBusinessId).
 *
 * Uso VPS: node scripts/fix-pau-business-hoypecamos.mjs [--apply]
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773'; // delivery Badalona/Tiana Modomio
const PAUNILPOL = '7ec4e689-f1d6-4149-86b2-bf582ebc2c0c'; // events (MILONGA) — no tocar nombre
const APPLY = process.argv.includes('--apply');

async function couch(method, path, body) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error || res.status} ${data.reason || ''}`);
  return data;
}

async function allDocs(db) {
  const data = await couch('GET', `/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=80000`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function bid(d) {
  return String(d.business_id || d.businessId || d._id || '')
    .replace(/^business:/, '')
    .trim();
}

async function main() {
  const [businesses, accounts, delivery] = await Promise.all([
    allDocs('businesses'),
    allDocs('accounts'),
    allDocs('bbddsaas-delivery'),
  ]);

  const biz = businesses.find((b) => bid(b) === DISARMINK);
  const account = accounts.find((a) => String(a.user_id) === PAU);
  if (!biz) throw new Error('No encuentro empresa DISARMINK / delivery');
  if (!account) throw new Error('No encuentro cuenta Pau');

  const pauPdvs = delivery.filter(
    (d) =>
      d.type === 'point_of_sale' &&
      !d.deletedAt &&
      String(d.user_id) === PAU &&
      /badalona|modomio tiana|tiana/i.test(String(d.name || '')),
  );

  console.log(APPLY ? '=== APPLY ===' : '=== DRY ===');
  console.log('Empresa delivery:', {
    _id: biz._id,
    name: biz.name,
    legalName: biz.legalName,
    nextName: 'hoypecamos',
  });
  console.log('Cuenta Pau:', {
    companyName: account.companyName,
    linkedBusinessId: account.linkedBusinessId || account.businessId,
    nextLinked: DISARMINK,
    nextCompanyName: 'hoypecamos',
  });
  console.log(
    'PDVs a fijar business_id:',
    pauPdvs.map((p) => ({
      name: p.name,
      _id: p._id,
      business_id: p.business_id || null,
      nextBusinessId: DISARMINK,
    })),
  );

  // Confirmar que PAUNILPOL no se renombra
  const events = businesses.find((b) => bid(b) === PAUNILPOL);
  console.log('PAUNILPOL (eventos, sin cambios de nombre):', events?.name);

  if (!APPLY) {
    console.log('No se escribe. Usa --apply');
    return;
  }

  const now = new Date().toISOString();

  await couch('PUT', `/businesses/${encodeURIComponent(biz._id)}`, {
    ...biz,
    name: 'hoypecamos',
    // legalName fiscal se mantiene; solo el nombre comercial en UI
    updatedAt: now,
  });
  console.log('✓ business name → hoypecamos');

  await couch('PUT', `/accounts/${encodeURIComponent(account._id)}`, {
    ...account,
    companyName: 'hoypecamos',
    linkedBusinessId: DISARMINK,
    businessId: DISARMINK,
    updatedAt: now,
  });
  console.log('✓ account linkedBusinessId → delivery hoypecamos');

  for (const p of pauPdvs) {
    const current = String(p.business_id || p.businessId || '')
      .replace(/^business:/, '')
      .trim();
    if (current === DISARMINK) {
      console.log('· PDV ya ok', p.name);
      continue;
    }
    await couch('PUT', `/bbddsaas-delivery/${encodeURIComponent(p._id)}`, {
      ...p,
      business_id: DISARMINK,
      businessId: DISARMINK,
      updatedAt: now,
    });
    console.log('✓ PDV business_id', p.name, p._id);
  }

  console.log('Listo. En sidebar debe verse «hoypecamos» (no PAUNILPOL SL) al entrar en Badalona/Modomio.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
