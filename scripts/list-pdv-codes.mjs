#!/usr/bin/env node
/** Lista PDV por nombre/código. node scripts/list-pdv-codes.mjs [filtro] */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, '..', '.env') });

const filter = String(process.argv[2] || '').trim().toLowerCase();
const req = { headers: {}, cookies: {} };
const couch = await import('../services/couchdb.js');

const docs = await couch.getAllDocuments(req, couch.getDeliveryDbName());
const pdvs = docs.filter((d) => d?.type === 'point_of_sale' && !d?.deletedAt);

for (const p of pdvs) {
  const hay = !filter
    || String(p.name || '').toLowerCase().includes(filter)
    || String(p.code || '').toLowerCase().includes(filter)
    || String(p.terminalCode || '').toLowerCase().includes(filter);
  if (!hay) continue;
  console.log(JSON.stringify({
    _id: p._id,
    name: p.name,
    code: p.code,
    terminalCode: p.terminalCode,
    active: p.active !== false,
    user_id: p.user_id,
    workCenterId: p.workCenterId,
    terminals: (p.terminals || []).map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      active: t.active !== false,
      salaRoomId: t.salaRoomId,
    })),
  }));
}
