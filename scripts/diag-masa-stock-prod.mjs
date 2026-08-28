#!/usr/bin/env node
/**
 * Busca artículos stock llamados «masa» en CouchDB (prod/local).
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.development') });

const COUCH = (process.env.COUCHDB_URL || process.env.VITE_COUCHDB_URL || 'http://127.0.0.1:5984').replace(/\/$/, '');
const USER = process.env.COUCHDB_USER || process.env.VITE_COUCHDB_USER || 'admin';
const PASS = process.env.COUCHDB_PASSWORD || process.env.VITE_COUCHDB_PASSWORD || '';
const DB = process.env.VITE_CATALOG_DB || process.env.CATALOG_DB || 'vertial-catalog';

const auth = Buffer.from(`${USER}:${PASS}`).toString('base64');

async function findMasa() {
  const res = await fetch(`${COUCH}/${encodeURIComponent(DB)}/_find`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      selector: {
        type: 'catalog_item',
        module: 'stock',
        name: { $regex: '(?i)masa' },
      },
      limit: 50,
      fields: ['_id', 'name', 'user_id', 'module', 'deletedAt', 'stockQuantity', 'isStockItem', 'business_id', 'updatedAt'],
    }),
  });
  const data = await res.json().catch(() => ({}));
  console.log(JSON.stringify({ status: res.status, docs: data.docs || data }, null, 2));
}

await findMasa();
