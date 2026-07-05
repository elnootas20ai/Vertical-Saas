#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, '..', '.env') });

const req = { headers: {}, cookies: {} };
const couch = await import('../services/couchdb.js');

const businesses = (await couch.listAllBusinesses(req)).filter((b) => !b.deletedAt);
for (const b of businesses) {
  if (!String(b.name || '').toLowerCase().includes('bodeg')) continue;
  console.log('BUSINESS', JSON.stringify({ id: b.business_id, name: b.name, type: b.businessType, owner: b.owner_user_id }));
}

const wcs = await couch.getAllDocuments(req, couch.getWorkCentersDbName());
for (const wc of wcs) {
  if (wc.deletedAt || wc.type !== 'sales_point') continue;
  if (!String(wc.name || '').toLowerCase().includes('bodeg')) continue;
  console.log('WC', JSON.stringify({ _id: wc._id, name: wc.name, businessId: wc.businessId || wc.business_id, user_id: wc.user_id, centerType: wc.centerType }));
}

const docs = await couch.getAllDocuments(req, couch.getDeliveryDbName());
for (const p of docs) {
  if (p.type !== 'point_of_sale' || p.deletedAt) continue;
  if (!String(p.name || '').toLowerCase().includes('bodeg') && !String(p.code || '').toLowerCase().includes('bodeg')) continue;
  console.log('PDV', JSON.stringify({ _id: p._id, name: p.name, code: p.code, terminalCode: p.terminalCode, user_id: p.user_id, workCenterId: p.workCenterId, active: p.active !== false }));
}
