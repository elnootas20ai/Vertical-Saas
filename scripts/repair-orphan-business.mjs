/**
 * Repara business huérfano b41d7afb... para user 4e1a9f0b... (pizzas/pizzerias).
 * node scripts/repair-orphan-business.mjs [--apply]
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const USER = '4e1a9f0b-7687-47f7-a366-9c5c766398ea';
const BID = 'b41d7afb-7f1d-41f9-912b-3d635dd96e55';
const APPLY = process.argv.includes('--apply');

async function getDoc(db, id) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/${encodeURIComponent(id)}`, {
    headers: { Authorization: AUTH },
  });
  if (!res.ok) return null;
  return res.json();
}

async function putDoc(db, doc) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/${encodeURIComponent(doc._id)}`, {
    method: 'PUT',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

async function main() {
  const existing = await getDoc('businesses', `business:${BID}`);
  if (existing) {
    console.log('Business ya existe:', existing.name);
    process.exit(0);
  }

  const now = new Date().toISOString();
  const business = {
    _id: `business:${BID}`,
    type: 'business',
    business_id: BID,
    owner_user_id: USER,
    name: 'pizzas grandes',
    legalName: 'pizzas grandes',
    businessType: 'delivery',
    active: true,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  console.log('Crear business huérfano:', JSON.stringify(business, null, 2));

  if (!APPLY) {
    console.log('\nSimulación. Usa --apply para guardar.\n');
    process.exit(0);
  }

  const r = await putDoc('businesses', business);
  if (!r.ok) {
    console.error('FAIL', r.data);
    process.exit(1);
  }
  console.log('OK business creado:', BID);

  const wc = await getDoc('bbddsaas-sales-points', 'wc-dcd787b1-d225-4c23-b71a-42feb0e91738');
  if (wc && String(wc.businessId || '') === BID) {
    console.log('Tienda pizzerias ya enlazada a', BID);
  }

  console.log('\nHecho. Recarga la app (Ctrl+F5).\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
