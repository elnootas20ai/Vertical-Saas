#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, '..', '.env') });

const req = { headers: {}, cookies: {} };
const couch = await import('../services/couchdb.js');

const businesses = (await couch.listAllBusinesses(req)).filter((b) => !b.deletedAt);
console.log('--- BUSINESSES ---');
for (const b of businesses) {
  console.log(`${b.name} | ${b.businessType || '?'} | ${b.business_id} | owner=${b.owner_user_id}`);
}

console.log('\n--- ALL PDV (name, code, terminalCode) ---');
const docs = await couch.getAllDocuments(req, couch.getDeliveryDbName());
for (const p of docs) {
  if (p.type !== 'point_of_sale' || p.deletedAt || p.active === false) continue;
  console.log(`${p.name} | code=${p.code || '-'} | tablet=${p.terminalCode || '-'} | wc=${p.workCenterId || '-'} | user=${p.user_id}`);
}
