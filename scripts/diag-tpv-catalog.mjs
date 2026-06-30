#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, '.env') });

const BASE = String(process.env.VERIFY_API_BASE || 'https://vertialapp.com').replace(/\/+$/, '');

function scopeFilter(items, businessId, brands, accountBusinessCount, activeBusinessType) {
  const brandIds = new Set(brands.map((b) => String(b._id || '').trim()).filter(Boolean));
  const universal = (cat) => {
    const c = String(cat || '').trim().toLowerCase();
    return ['bebidas', 'bebida', 'complementos', 'complemento', 'extras', 'postres', 'postre', 'salsas', 'otros'].includes(c);
  };
  return items.filter((item) => {
    const ib = String(item.business_id || '').replace(/^business:/, '').trim();
    const itemBrandIds = (item.brandIds ?? []).map((id) => String(id).trim()).filter(Boolean);
    if (ib) return ib === businessId;
    if (itemBrandIds.length > 0) return itemBrandIds.some((id) => brandIds.has(id));
    if (universal(item.category)) {
      if (ib) return ib === businessId;
      if (accountBusinessCount !== undefined && accountBusinessCount >= 2) {
        return activeBusinessType === 'delivery';
      }
      return brandIds.size > 0;
    }
    if (accountBusinessCount !== undefined && accountBusinessCount >= 2) return false;
    return brandIds.size > 0;
  });
}

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

console.log(`\n[diag-tpv-catalog] API ${BASE}`);
console.log(`userId: ${userId}`);

const bizRes = await api(`/api/businesses/user/${encodeURIComponent(userId)}`, { token });
const businesses = bizRes.data?.businesses || [];
console.log(`businesses: ${businesses.length}`);

const tpvRes = await api(`/api/delivery/catalog/${encodeURIComponent(userId)}?view=tpv`, { token });
const rawItems = tpvRes.data?.items || [];
console.log(`raw tpv items: ${rawItems.length} (HTTP ${tpvRes.status})`);

for (const b of businesses) {
  const bid = String(b.business_id || b.id || '').replace(/^business:/, '').trim();
  const brandsRes = await api(`/api/brands/${encodeURIComponent(bid)}`, { token });
  const brands = brandsRes.data?.brands || [];
  for (const accountN of [undefined, 0, 2]) {
    const scoped = scopeFilter(rawItems, bid, brands, accountN);
    const sellable = scoped.filter(
      (i) => (i.itemType === 'product' || i.itemType === 'combo') && i.active !== false,
    );
    console.log(
      `  ${b.name} (${b.businessType}) brands=${brands.length} accountN=${accountN ?? 'undef'} => scoped=${scoped.length} sellable=${sellable.length}`,
    );
  }
}

const deliveryBiz = businesses.find((b) => String(b.businessType || '').trim() === 'delivery');
const cleaningBiz = businesses.find((b) => String(b.businessType || '').trim() !== 'delivery');
if (deliveryBiz && cleaningBiz) {
  const deliveryId = String(deliveryBiz.business_id || deliveryBiz.id || '').replace(/^business:/, '').trim();
  const cleaningId = String(cleaningBiz.business_id || cleaningBiz.id || '').replace(/^business:/, '').trim();
  const deliveryBrands = (await api(`/api/brands/${encodeURIComponent(deliveryId)}`, { token })).data?.brands || [];
  const wrongScope = scopeFilter(rawItems, cleaningId, deliveryBrands, 2);
  const fixedScope = scopeFilter(rawItems, deliveryId, deliveryBrands, 2);
  console.log(`fix simulation wrongBiz=${wrongScope.length} deliveryBiz=${fixedScope.length}`);
  if (fixedScope.length === 0) {
    console.error('[diag-tpv-catalog] FAIL: delivery business has 0 sellable products');
    process.exit(1);
  }
  if (wrongScope.length > 0 && cleaningId !== deliveryId) {
    console.log('[diag-tpv-catalog] note: wrong business id would still show products if brands passed');
  }
}

console.log('[diag-tpv-catalog] OK');
