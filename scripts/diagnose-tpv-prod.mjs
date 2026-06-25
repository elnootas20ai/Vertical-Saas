#!/usr/bin/env node
/** Diagnóstico TPV tablet en producción. node scripts/diagnose-tpv-prod.mjs [CODIGO] */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, '..', '.env') });

const code = String(process.argv[2] || process.env.TPV_DIAG_CODE || 'MTKGFH').trim().toUpperCase();
const req = { headers: {}, cookies: {} };

const couch = await import('../services/couchdb.js');

function norm(v) {
  return String(v || '').replace(/^business:/, '').trim();
}

async function main() {
  console.log(`\n[diagnose-tpv] código=${code}\n`);

  const pdv = await couch.findPointOfSaleByTerminalCode(req, code);
  if (!pdv) {
    console.log('FAIL: no existe PDV activo con terminalCode/code =', code);
    process.exit(1);
  }

  console.log('PDV:', {
    _id: pdv._id,
    name: pdv.name,
    user_id: pdv.user_id,
    workCenterId: pdv.workCenterId || '(vacío)',
    terminalCode: pdv.terminalCode,
    active: pdv.active !== false,
  });

  const wc = pdv.workCenterId ? await couch.findWorkCenterById(req, pdv.workCenterId) : null;
  console.log('WC:', wc
    ? { _id: wc._id, name: wc.name, businessId: wc.businessId || wc.business_id || '(vacío)', user_id: wc.user_id }
    : pdv.workCenterId ? '(ID huérfano — no existe)' : '(sin workCenterId)');

  const biz = await couch.resolveBusinessDocumentForPointOfSale(req, pdv);
  console.log('Empresa resuelta:', biz ? { id: biz.business_id, name: biz.name, owner: biz.owner_user_id } : null);

  const ownerId = String(pdv.user_id || '').trim();
  const owned = await couch.listOwnerBusinessesForUser(req, ownerId);
  console.log('Empresas del titular del PDV:', owned.map((b) => `${b.name} (${b.business_id})`).join(' | ') || '(ninguna)');

  for (const b of owned) {
    const bid = norm(b.business_id);
    const scoped = await couch.listScopedPointsOfSaleForBusiness(req, ownerId, bid);
    const hit = scoped.some((p) => p._id === pdv._id);
    console.log(`  scope ${b.name}: ${hit ? 'OK' : 'NO'} (${scoped.length} PDV)`);
    const acc = await couch.acceptPointOfSaleInBusinessScope(req, ownerId, pdv, bid);
    console.log(`  accept ${b.name}: ${acc ? 'OK' : 'NO'}`);
  }

  const account = await couch.findAccountByUserId(req, ownerId);
  console.log('Cuenta titular PDV:', account ? { user_id: account.user_id, email: account.email } : '(no encontrada)');

  console.log('\n[diagnose-tpv] fin\n');
}

main().catch((e) => {
  console.error('ERROR', e?.message || e);
  process.exit(1);
});
