/**
 * Health check rápido de cuenta en CouchDB (ejecutar en VPS).
 * node scripts/health-check-user.mjs [--user=UUID]
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const USER =
  process.argv.find((a) => a.startsWith('--user='))?.slice('--user='.length) ||
  '4e1a9f0b-7687-47f7-a366-9c5c766398ea';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=50000`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function isTpvConfigurable(item) {
  const cat = `${item.category || ''} ${item.name || ''}`.toLowerCase();
  if (item.customFields?.halfHalf === true || /mitad\s*y\s*mitad/i.test(item.name || '')) return false;
  if (item.customFields?.buildYourOwn === true) return false;
  if (/bebida|postre|complemento|entrante|ensalada|bebidas|postres|combo/.test(cat)) return false;
  if (/pizza|pizzas|burger|hamburguesa|top burger|calzone|bowl/.test(cat)) return true;
  return false;
}

function hasIngredients(item) {
  const raw = String(item.customFields?.ingredients || '').trim();
  if (!raw || raw.toLowerCase() === 'ver carta') return false;
  return raw.split(/[,;\n]/).some((s) => s.trim() && s.trim().toLowerCase() !== 'ver carta');
}

async function main() {
  const [businesses, workCenters, pdvs, catalog, accounts] = await Promise.all([
    allDocs('businesses'),
    allDocs('bbddsaas-sales-points'),
    allDocs('bbddsaas-delivery'),
    allDocs('bbddsaas-catalog'),
    allDocs('accounts'),
  ]);

  const myBiz = businesses.filter((b) => String(b.owner_user_id || '') === USER);
  const myWc = workCenters.filter((w) => String(w.user_id || '') === USER && !w.deletedAt);
  const myPdv = pdvs.filter(
    (p) => (p.type === 'point_of_sale' || p.docType === 'point_of_sale') && String(p.user_id || '') === USER,
  );
  const myCat = catalog.filter(
    (c) => c.type === 'catalog_item' && String(c.user_id || '') === USER && !c.deletedAt && c.active !== false,
  );
  const account = accounts.find((a) => String(a.user_id || a._id || '') === USER);

  const configurable = myCat.filter(isTpvConfigurable);
  const ingOk = configurable.filter(hasIngredients);
  const ingFail = configurable.filter((c) => !hasIngredients(c));

  console.log('\n=== HEALTH CHECK ===');
  console.log('user_id:', USER);
  console.log('email:', account?.email || '(no encontrada)');
  console.log('empresas:', myBiz.length ? myBiz.map((b) => `${b.name} (${b.business_id || b._id})`).join(' | ') : 'NINGUNA');
  console.log('tiendas:', myWc.length ? myWc.map((w) => `${w.name} [${w._id}] bid=${w.businessId || w.business_id || '?'}`).join(' | ') : 'NINGUNA');
  console.log(
    'PDV:',
    myPdv.length
      ? myPdv.map((p) => `${p.name} code=${p.code || p.terminalCode} active=${p.active !== false} wc=${p.workCenterId || '?'}`).join(' | ')
      : 'NINGUNO',
  );
  console.log('catálogo activo:', myCat.length, 'productos');
  console.log('TPV configurables:', configurable.length, '| con ingredientes:', ingOk.length, '| sin:', ingFail.length);

  if (ingFail.length) {
    console.log('\nFALTAN ingredientes:');
    for (const c of ingFail) console.log(`  • [${c.category}] ${c.name}`);
  }

  const wcIds = new Set(myWc.map((w) => w._id));
  const orphanPdv = myPdv.filter((p) => p.workCenterId && !wcIds.has(p.workCenterId));
  if (orphanPdv.length) {
    console.log('\nPDV huérfanos (WC no existe):', orphanPdv.map((p) => p.name).join(', '));
  }

  const bidSet = new Set(myBiz.map((b) => String(b.business_id || b._id || '').trim()));
  const wcBadBid = myWc.filter((w) => {
    const bid = String(w.businessId || w.business_id || '').trim();
    return bid && bidSet.size > 0 && !bidSet.has(bid);
  });
  if (wcBadBid.length) {
    console.log('\nTiendas con businessId distinto a tus empresas:');
    for (const w of wcBadBid) console.log(`  • ${w.name} bid=${w.businessId || w.business_id}`);
  }

  const ok =
    myBiz.length > 0 &&
    myWc.length > 0 &&
    myPdv.some((p) => p.active !== false) &&
    ingFail.length === 0 &&
    orphanPdv.length === 0;

  console.log('\nRESULTADO:', ok ? '✅ TODO OK — puedes avanzar' : '⚠️  Revisar puntos arriba');
  console.log('');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
