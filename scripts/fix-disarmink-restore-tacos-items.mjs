#!/usr/bin/env node
/**
 * DISARMINK — reactivar ítems taco / Menú Taco (Blackburger).
 * La marca pestaña "Tacos" se deja active:false.
 *
 *   node scripts/fix-disarmink-restore-tacos-items.mjs
 *   node scripts/fix-disarmink-restore-tacos-items.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DB = 'bbddsaas-catalog';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const APPLY = process.argv.includes('--apply');

const RESTORE_IDS = [
  'catitem-df5b69f5-84a8-4c6d-bad1-1a842de5a610', // Steak Taco
  'catitem-80433078-e861-4cb2-a0fd-b50debcb772a', // Taco Crispy
  'catitem-62adde6c-0fec-4394-a221-beb12fa6051a', // Taco Hot BBQ
  'catitem-d9dc6b72-f24d-4837-a79e-0cdf27abcdf7', // Taco Mixto
  'catitem-c9294002-a419-4151-90ca-e705de27fe6a', // Taco Vegano
  'catitem-86d41243-b2db-4150-b7f4-6078643d5ddb', // Menú Taco
];

const BRAND_TACOS = 'brand-eff95625-061b-42a8-9ee7-7dbf3ddfffcf';

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

console.log(APPLY ? '=== APPLY restore taco items ===' : '=== DRY restore taco items ===');

let changed = 0;
for (const id of RESTORE_IDS) {
  const d = await couch('GET', `/${DB}/${encodeURIComponent(id)}`);
  if (bid(d) !== DISARMINK) throw new Error(`${id} biz=${bid(d)}`);
  const needs = d.active === false;
  console.log(needs ? 'RESTORE' : 'OK     ', d.name, { active: d.active, brandIds: d.brandIds });
  if (!APPLY || !needs) continue;
  await couch('PUT', `/${DB}/${encodeURIComponent(id)}`, {
    ...d,
    active: true,
    updatedAt: new Date().toISOString(),
  });
  changed += 1;
  console.log('  → active:true');
}

const brand = await couch('GET', `/${DB}/${encodeURIComponent(BRAND_TACOS)}`);
console.log('brand Tacos stays', { active: brand.active, name: brand.name });
if (APPLY && brand.active !== false) {
  await couch('PUT', `/${DB}/${encodeURIComponent(BRAND_TACOS)}`, {
    ...brand,
    active: false,
    updatedAt: new Date().toISOString(),
  });
  console.log('  → brand forced active:false');
}

console.log(APPLY ? `Hecho. Items restaurados: ${changed}` : 'Dry-run OK. Usa --apply para escribir.');
