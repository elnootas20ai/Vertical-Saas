#!/usr/bin/env node
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');

async function info(db) {
  const r = await fetch(`${COUCH}/${encodeURIComponent(db)}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return r.json();
}

const cat = await info('bbddsaas-catalog');
console.log('catalog', { doc_count: cat.doc_count, disk: cat.disk_size, data: cat.data_size });

const t0 = Date.now();
const all = await fetch(`${COUCH}/${encodeURIComponent('bbddsaas-catalog')}/_all_docs?include_docs=false&limit=1`, {
  headers: { Authorization: AUTH },
});
await all.json();
console.log('all_docs probe ms', Date.now() - t0);

const t1 = Date.now();
const find = await fetch(`${COUCH}/${encodeURIComponent('bbddsaas-catalog')}/_find`, {
  method: 'POST',
  headers: { Authorization: AUTH, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({
    selector: { type: 'brand', business_id: 'ed846f31-aee7-4568-ac03-fa25ff3ad773' },
    limit: 50,
  }),
});
const found = await find.json();
console.log('find brands ms', Date.now() - t1, 'docs', (found.docs || []).length, 'warn', found.warning);
