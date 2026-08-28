#!/usr/bin/env node
import fs from 'node:fs';

const envText = fs.readFileSync('.env', 'utf8');
const get = (k) => {
  const m = envText.match(new RegExp(`^${k}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
};

// Mirror app naming loosely
const prefix = (get('DB_PREFIX') || get('VITE_DB_PREFIX') || get('COUCHDB_DB') || 'vertial')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-');
const candidates = [
  get('VITE_CATALOG_DB'),
  get('CATALOG_DB'),
  `${prefix}-catalog`,
  'bbddsaas-catalog',
  'vertial-catalog',
].filter(Boolean);

const url = (get('COUCHDB_URL') || 'http://127.0.0.1:5984').replace(/\/$/, '');
const user = get('COUCHDB_USER') || 'admin';
const pass = get('COUCHDB_PASSWORD') || '';
const auth = Buffer.from(`${user}:${pass}`).toString('base64');

console.log({ url, prefix, candidates });

for (const db of [...new Set(candidates)]) {
  const res = await fetch(`${url}/${encodeURIComponent(db)}/_find`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      selector: {
        type: 'catalog_item',
        $or: [{ name: 'masa' }, { name: 'Masa' }, { name: 'MASA' }],
      },
      limit: 30,
      fields: ['_id', 'name', 'module', 'user_id', 'deletedAt', 'stockQuantity', 'isStockItem'],
    }),
  });
  const data = await res.json().catch(() => ({}));
  console.log(`\nDB ${db} status=${res.status} n=${(data.docs || []).length}`);
  if (Array.isArray(data.docs) && data.docs.length) {
    console.log(JSON.stringify(data.docs, null, 2));
  } else if (data.error) {
    console.log(data);
  }

  const resStock = await fetch(`${url}/${encodeURIComponent(db)}/_find`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      selector: { type: 'catalog_item', module: 'stock' },
      limit: 3,
      fields: ['_id', 'name', 'module'],
    }),
  });
  const stock = await resStock.json().catch(() => ({}));
  console.log(`  stock sample n=${(stock.docs || []).length}`, (stock.docs || []).map((d) => d.name));
}
