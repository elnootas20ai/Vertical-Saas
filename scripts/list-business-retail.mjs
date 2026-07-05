#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, '..', '.env') });

const bid = process.argv[2] || 'a86b537e-0c4d-4b43-9baf-6a5681ceb2d1';
const req = { headers: {}, cookies: {} };
const couch = await import('../services/couchdb.js');

const wcs = await couch.getAllDocuments(req, couch.getWorkCentersDbName());
console.log('--- WC for business', bid, '---');
for (const wc of wcs) {
  if (wc.deletedAt || wc.type !== 'sales_point') continue;
  const b = String(wc.businessId || wc.business_id || '').replace(/^business:/, '');
  if (b !== bid) continue;
  console.log(JSON.stringify({ _id: wc._id, name: wc.name, centerType: wc.centerType, user_id: wc.user_id }));
}

const docs = await couch.getAllDocuments(req, couch.getDeliveryDbName());
console.log('--- PDV linked ---');
for (const p of docs) {
  if (p.type !== 'point_of_sale' || p.deletedAt) continue;
  const wc = wcs.find((w) => w._id === p.workCenterId);
  const b = String(wc?.businessId || wc?.business_id || '').replace(/^business:/, '');
  if (b !== bid && !String(p.name || '').toLowerCase().includes('vertial')) continue;
  if (b !== bid) continue;
  console.log(JSON.stringify({ _id: p._id, name: p.name, code: p.code, terminalCode: p.terminalCode, workCenterId: p.workCenterId, terminals: p.terminals?.length || 0 }));
}
