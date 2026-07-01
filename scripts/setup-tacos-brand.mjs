#!/usr/bin/env node
/**
 * Crea marca Tacos, mueve productos mal asignados a BlackBurger y genera escandallos.
 * Uso: node scripts/setup-tacos-brand.mjs [--dry-run]
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, '.env') });

const BASE = String(process.env.VERIFY_API_BASE || 'https://vertialapp.com').replace(/\/+$/, '');
const DRY = process.argv.includes('--dry-run');

async function api(route, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isTacoProduct(item) {
  const hay = fold([item.name, item.category, item.sku].join(' '));
  return /\btaco?s?\b|tortilla|burrito|quesadilla|nachos|guacamole|mexican/.test(hay);
}

const loginRes = await api('/api/auth/login', {
  method: 'POST',
  body: { email: process.env.SAAS_LOGIN_EMAIL, password: process.env.SAAS_LOGIN_PASSWORD },
});
const token = loginRes.data?.accessToken;
const userId = loginRes.data?.user?.user_id;
if (!token || !userId) {
  console.error('Login failed', loginRes.status, loginRes.data?.error);
  process.exit(1);
}

const bizRes = await api(`/api/businesses/user/${encodeURIComponent(userId)}`, { token });
const deliveryBiz = (bizRes.data?.businesses || []).find((b) => b.businessType === 'delivery');
const businessId = String(deliveryBiz?.business_id || deliveryBiz?.id || '').replace(/^business:/, '').trim();
if (!businessId) {
  console.error('No delivery business');
  process.exit(1);
}

console.log(`\n[setup-tacos] business=${businessId} dry=${DRY}`);

const brandsRes = await api(`/api/brands/${encodeURIComponent(businessId)}`, { token });
let brands = brandsRes.data?.brands || [];
console.log(`brands: ${brands.map((b) => b.name).join(', ')}`);

let tacosBrand = brands.find((b) => fold(b.name) === 'tacos' || b.deliveryLineKind === 'tacos_mexican');

if (!tacosBrand) {
  console.log('Creating Tacos brand…');
  if (!DRY) {
    const created = await api(`/api/brands/${encodeURIComponent(businessId)}`, {
      token,
      method: 'POST',
      body: {
        brand: {
          name: 'Tacos',
          active: true,
          deliveryLineKind: 'tacos_mexican',
          shortCode: 'TAC',
          primaryColor: '#16A34A',
          catalogCategories: ['Tacos', 'Complementos', 'Bebidas'],
        },
      },
    });
    if (!created.data?.brand) {
      console.error('Create brand failed', created.status, created.data);
      process.exit(1);
    }
    tacosBrand = created.data.brand;
    brands = [...brands, tacosBrand];
    console.log(`Created: ${tacosBrand._id} ${tacosBrand.name}`);
  } else {
    tacosBrand = { _id: 'dry-tacos', name: 'Tacos' };
  }
} else {
  console.log(`Tacos brand exists: ${tacosBrand._id}`);
  if (!tacosBrand.deliveryLineKind && !DRY) {
    const updated = await api(
      `/api/brands/${encodeURIComponent(businessId)}/${encodeURIComponent(tacosBrand._id)}`,
      {
        token,
        method: 'PUT',
        body: {
          brand: {
            ...tacosBrand,
            deliveryLineKind: 'tacos_mexican',
            catalogCategories: ['Tacos', 'Complementos', 'Bebidas'],
            active: true,
          },
        },
      },
    );
    if (updated.data?.brand) tacosBrand = updated.data.brand;
    console.log('Updated Tacos brand line kind');
  }
}

const blackBrand = brands.find((b) => /black\s*burger|blackburger/.test(fold(b.name)));
const catalogRes = await api(`/api/delivery/catalog/${encodeURIComponent(userId)}`, { token });
const items = catalogRes.data?.items || [];

const toMove = items.filter((item) => {
  if (!isTacoProduct(item)) return false;
  const ids = item.brandIds || [];
  if (blackBrand && ids.includes(blackBrand._id)) return true;
  if (ids.length === 0) return true;
  return false;
});

console.log(`\nTaco products to move to Tacos brand: ${toMove.length}`);
for (const item of toMove) {
  console.log(`  - ${item.name} (${item.category}) [${item._id}]`);
}

if (toMove.length > 0 && !DRY && tacosBrand._id !== 'dry-tacos') {
  const patches = toMove.map((item) => ({
    _id: item._id,
    brandIds: [tacosBrand._id],
    business_id: businessId,
    vertical: 'delivery',
  }));
  const patchRes = await api(`/api/delivery/catalog/${encodeURIComponent(userId)}/bulk-patch`, {
    token,
    method: 'POST',
    body: { items: patches },
  });
  console.log(`bulk-patch: updated=${patchRes.data?.updated ?? 0} errors=${patchRes.data?.errors ?? 0}`);
}

if (!DRY && tacosBrand._id !== 'dry-tacos') {
  console.log('\nEscandallo: usa Catálogo → Escandallos → «Generar escandallos (todas las marcas)» tras el deploy.');
}

console.log('\n[setup-tacos] Done');
