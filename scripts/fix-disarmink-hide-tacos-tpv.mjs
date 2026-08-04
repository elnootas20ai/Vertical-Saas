#!/usr/bin/env node
/**
 * DISARMINK (Tiana / Badalona) — quitar Tacos del TPV.
 * Solo active:false en marca Tacos + ítems taco / Menú Taco. No borra docs.
 *
 *   node scripts/fix-disarmink-hide-tacos-tpv.mjs
 *   node scripts/fix-disarmink-hide-tacos-tpv.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DB = 'bbddsaas-catalog';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const APPLY = process.argv.includes('--apply');

const TARGET_IDS = [
  'brand-eff95625-061b-42a8-9ee7-7dbf3ddfffcf', // marca Tacos
  'catitem-df5b69f5-84a8-4c6d-bad1-1a842de5a610', // Steak Taco
  'catitem-80433078-e861-4cb2-a0fd-b50debcb772a', // Taco Crispy
  'catitem-62adde6c-0fec-4394-a221-beb12fa6051a', // Taco Hot BBQ
  'catitem-d9dc6b72-f24d-4837-a79e-0cdf27abcdf7', // Taco Mixto
  'catitem-c9294002-a419-4151-90ca-e705de27fe6a', // Taco Vegano
  'catitem-86d41243-b2db-4150-b7f4-6078643d5ddb', // Menú Taco
];

async function couch(method, path, body) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error || res.status} ${data.reason || ''}`);
  return data;
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

console.log(APPLY ? '=== APPLY hide Tacos TPV ===' : '=== DRY hide Tacos TPV ===');

let changed = 0;
for (const id of TARGET_IDS) {
  const d = await couch('GET', `/${DB}/${encodeURIComponent(id)}`);
  if (bid(d) !== DISARMINK) throw new Error(`${id} biz=${bid(d)} (esperado DISARMINK)`);
  if (d.deletedAt) {
    console.log('SKIP soft-deleted', d.name || id);
    continue;
  }

  const before = {
    name: d.name,
    type: d.type,
    category: d.category ?? null,
    itemType: d.itemType ?? null,
    active: d.active,
  };
  const needs = d.active !== false;
  console.log(needs ? 'HIDE' : 'OK  ', before);

  if (!APPLY || !needs) continue;

  const next = {
    ...d,
    active: false,
    updatedAt: new Date().toISOString(),
  };
  await couch('PUT', `/${DB}/${encodeURIComponent(id)}`, next);
  changed += 1;
  console.log('  → active:false');
}

console.log(APPLY ? `Hecho. Actualizados: ${changed}` : 'Dry-run OK. Usa --apply para escribir.');
