/**
 * Solo lectura: tiendas/PDV de uriel@admin y por qué el TPV puede no cargar.
 *   node scripts/diag-admin-tpv-stores.mjs
 * Remoto: node scripts/remote-diag-admin-tpv-stores.mjs
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env') });

const EMAIL = String(process.env.DIAG_EMAIL || 'uriel@admin.com').trim().toLowerCase();
const req = { headers: {}, cookies: {} };

const {
  findAccountByEmail,
  listOwnerBusinessesForUser,
  listWorkCenterIdsForBusiness,
  listScopedPointsOfSaleForBusiness,
  listPointsOfSaleByUser,
  findWorkCenterById,
  getWorkCentersDbName,
  getAllDocuments,
  ensureDatabase,
} = await import('../services/couchdb.js');

function norm(v) {
  return String(v || '').replace(/^business:/, '').trim();
}

function expectsTpv(businessType) {
  const t = String(businessType || '').trim();
  return (
    t === 'delivery'
    || t === 'restaurant'
    || t === 'iceCreamShop'
    || t === 'events'
    || t === 'butcherShop'
  );
}

async function main() {
  console.log(`\n[diag-admin-tpv-stores] email=${EMAIL}\n`);

  const account = await findAccountByEmail(req, EMAIL);
  if (!account) {
    console.log('FAIL: cuenta no encontrada');
    process.exit(1);
  }
  const userId = String(account.user_id || '').trim();
  console.log('Cuenta:', { user_id: userId, email: account.email });

  const businesses = await listOwnerBusinessesForUser(req, userId);
  console.log(`Empresas: ${businesses.length}`);

  const allPdvs = await listPointsOfSaleByUser(req, userId);
  console.log(`PDV totales del user: ${allPdvs.length}\n`);

  const wcDb = getWorkCentersDbName();
  await ensureDatabase(req, wcDb);
  const allWcDocs = await getAllDocuments(req, wcDb);
  const userWcs = allWcDocs.filter(
    (d) =>
      d?.type === 'sales_point'
      && !d?.deletedAt
      && (String(d.user_id || '') === userId
        || String(d.user_id || '').replace(/^account:/, '') === userId),
  );

  const problems = [];

  for (const biz of businesses) {
    const bid = norm(biz.business_id || biz.id);
    const btype = String(biz.businessType || '').trim() || '(sin tipo)';
    const wantTpv = expectsTpv(btype);

    console.log('─'.repeat(72));
    console.log(`${biz.name || '—'} | type=${btype} | id=${bid}`);
    console.log(`  TPV de venta esperado: ${wantTpv ? 'SÍ' : 'NO'}`);

    const wcIds = await listWorkCenterIdsForBusiness(req, userId, bid);
    const scopedPdvs = await listScopedPointsOfSaleForBusiness(req, userId, bid, {
      includeInactive: true,
    });

    const centers = [];
    for (const id of wcIds) {
      const wc = await findWorkCenterById(req, id);
      if (wc) centers.push(wc);
    }

    // También centros del user con businessId = bid que listWorkCenterIds pudiera omitir
    for (const wc of userWcs) {
      if (norm(wc.businessId || wc.business_id) !== bid) continue;
      if (!centers.some((c) => c._id === wc._id)) centers.push(wc);
    }

    console.log(`  Centros en scope: ${centers.length} | PDV en scope: ${scopedPdvs.length}`);

    if (wantTpv && centers.length === 0) {
      problems.push({ biz: biz.name, type: btype, store: '(ninguna)', why: 'sin centros de trabajo' });
    }

    for (const wc of centers) {
      const centerType = String(wc.centerType || '').trim() || '(vacío)';
      const linked = scopedPdvs.filter((p) => String(p.workCenterId || '') === wc._id);
      const pdv = linked[0] || allPdvs.find((p) => String(p.workCenterId || '') === wc._id);
      const code = String(pdv?.terminalCode || pdv?.code || '').trim();
      const issues = [];

      if (wantTpv) {
        if (centerType === 'oficina') issues.push('tipo oficina → no es TPV de venta');
        if (!pdv) issues.push('sin PDV enlazado');
        if (pdv && pdv.active === false) issues.push('PDV inactive');
        if (pdv && !code) issues.push('sin terminalCode');
        if (pdv && !String(pdv.workCenterId || '').trim()) issues.push('PDV sin workCenterId');
      } else if (centerType === 'oficina' || btype === 'lawyer') {
        // expected
      } else if (!pdv && wantTpv === false) {
        // ok
      }

      const status = issues.length ? `⚠ ${issues.join('; ')}` : 'OK';
      console.log(
        `  · ${wc.name || '—'} | centerType=${centerType} | pdv=${pdv?.name || '—'} | code=${code || '—'} | ${status}`,
      );

      if (issues.length) {
        problems.push({ biz: biz.name, type: btype, store: wc.name || wc._id, why: issues.join('; ') });
      }
    }

    // PDVs scoped without matching WC name visibility
    for (const p of scopedPdvs) {
      const wcId = String(p.workCenterId || '').trim();
      if (wcId && !centers.some((c) => c._id === wcId)) {
        const orphan = `PDV ${p.name || p._id} apunta a WC inexistente ${wcId}`;
        console.log(`  · ⚠ ${orphan}`);
        problems.push({ biz: biz.name, type: btype, store: p.name || p._id, why: orphan });
      }
    }
  }

  // PDVs del user fuera de cualquier empresa resuelta
  console.log('\n' + '═'.repeat(72));
  console.log('RESUMEN problemas TPV:');
  if (problems.length === 0) {
    console.log('(ninguno estructural claro en PDV/centros)');
  } else {
    for (const p of problems) {
      console.log(`- [${p.type}] ${p.biz} · ${p.store}: ${p.why}`);
    }
  }
  console.log('');
}

main().catch((e) => {
  console.error('ERROR', e?.stack || e?.message || e);
  process.exit(1);
});
