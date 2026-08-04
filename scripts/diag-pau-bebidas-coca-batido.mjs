#!/usr/bin/env node
/**
 * Solo lectura: localizar batido chocolate + cocas en negocios de Pau.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DB = 'bbddsaas-catalog';
const BIZ = {
  modomio: '33821959-ae50-4e52-bfea-ea2b145faeac',
  disarmink: 'ed846f31-aee7-4568-ac03-fa25ff3ad773',
};
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';

async function couch(method, path) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.error || res.status}`);
  return data;
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function priceOf(d) {
  const n = Number(d.unitPrice ?? d.price ?? d.basePrice ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function labelBiz(id) {
  if (id === BIZ.modomio) return 'modomio';
  if (id === BIZ.disarmink) return 'disarmink';
  return id.slice(0, 8);
}

const all = await couch('GET', `/${DB}/_all_docs?include_docs=true&limit=80000`);
const docs = (all.rows || []).map((r) => r.doc).filter((d) => d?.type === 'catalog_item');

const pauish = docs.filter((d) => {
  const b = bid(d);
  return b === BIZ.modomio || b === BIZ.disarmink || String(d.user_id || '') === PAU;
});

console.log('items pauish', pauish.length);

const batidos = pauish.filter((d) => {
  const n = fold(d.name);
  return n.includes('batido') || n.includes('chocolate');
});
console.log('\n=== batido / chocolate ===');
for (const d of batidos) {
  console.log({
    biz: labelBiz(bid(d)),
    id: d._id,
    name: d.name,
    price: priceOf(d),
    del: d.deletedAt || null,
    active: d.active,
  });
}

const cocas = pauish.filter((d) => /coca|coke|zero/i.test(fold(d.name)));
console.log('\n=== coca / zero / coke ===');
for (const d of cocas.sort((a, b) => fold(a.name).localeCompare(fold(b.name)))) {
  console.log({
    biz: labelBiz(bid(d)),
    id: d._id,
    name: d.name,
    price: priceOf(d),
    del: d.deletedAt || null,
    active: d.active,
    cat: d.category,
  });
}

const priced = pauish.filter((d) => {
  if (d.deletedAt) return false;
  const p = priceOf(d);
  return Math.abs(p - 1.9) < 0.02 || Math.abs(p - 2.5) < 0.02 || Math.abs(p - 2.2) < 0.02;
});
console.log('\n=== items a 1.90 / 2.20 / 2.50 (vivos) ===');
for (const d of priced.sort((a, b) => priceOf(a) - priceOf(b) || fold(a.name).localeCompare(fold(b.name)))) {
  const n = fold(d.name);
  if (!/coca|zero|batido|refresco|bebida|fanta|nestea|aquarius|sprite/i.test(n) && !/bebida/i.test(String(d.category || ''))) {
    continue;
  }
  console.log({
    biz: labelBiz(bid(d)),
    name: d.name,
    price: priceOf(d),
    cat: d.category,
    id: d._id,
  });
}
