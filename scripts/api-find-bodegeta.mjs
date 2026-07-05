#!/usr/bin/env node
/** PDV vía API autenticada (misma ruta que la app). */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, '..', '.env') });

const API = String(process.env.VERIFY_API_BASE || process.env.VITE_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const EMAIL = String(process.env.SAAS_LOGIN_EMAIL || '').trim();
const PASSWORD = String(process.env.SAAS_LOGIN_PASSWORD || '').trim();
const filter = String(process.argv[2] || 'bodeg').toLowerCase();

async function api(pathname, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const login = await api('/api/auth/login', {
  method: 'POST',
  body: { email: EMAIL, password: PASSWORD },
});
const token = login.data?.accessToken;
const userId = login.data?.user?.user_id;
if (!token || !userId) {
  console.error('Login failed', login.data);
  process.exit(1);
}

const bizRes = await api('/api/businesses', { token });
const businesses = bizRes.data?.businesses || [];
for (const b of businesses) {
  if (!String(b.name || '').toLowerCase().includes(filter)) continue;
  console.log('BUSINESS', b.name, b.business_id, b.businessType);
}

const pdvRes = await api(`/api/delivery/points-of-sale/${encodeURIComponent(userId)}?includeInactive=true`, { token });
const pdvs = pdvRes.data?.pointsOfSale || [];
for (const p of pdvs) {
  if (!String(p.name || '').toLowerCase().includes(filter) && !String(p.code || '').toLowerCase().includes(filter)) continue;
  console.log('PDV', JSON.stringify({
    name: p.name,
    code: p.code,
    terminalCode: p.terminalCode,
    _id: p._id,
    workCenterId: p.workCenterId,
    active: p.active !== false,
    terminals: (p.terminals || []).map((t) => ({ code: t.code, name: t.name, id: t.id })),
  }));
}

for (const code of process.argv.slice(3)) {
  const test = await api('/api/auth/tpv-tablet/activate', {
    method: 'POST',
    body: { terminalCode: code },
  });
  console.log('TEST', code, test.status, test.data?.error || test.data?.ok);
}
