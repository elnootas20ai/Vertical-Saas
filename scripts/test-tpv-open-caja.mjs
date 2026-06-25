#!/usr/bin/env node
/** E2E: activate tablet + abrir caja. VERIFY_API_BASE + SAAS_LOGIN_* */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, '..', '.env.development') });
dotenv.config({ path: path.join(root, '..', '.env') });
dotenv.config({ path: path.join(root, '..', 'deploy', 'local-values.env') });

const BASE = String(process.env.VERIFY_API_BASE || 'https://vertialapp.com').replace(/\/+$/, '');
const EMAIL = String(process.env.SAAS_LOGIN_EMAIL || '').trim();
const PASS = String(process.env.SAAS_LOGIN_PASSWORD || '').trim();
const CODE = String(process.argv[2] || process.env.TPV_DIAG_CODE || '').trim().toUpperCase();

async function api(route, { method = 'GET', body, token } = {}) {
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

async function main() {
  console.log(`[test-tpv-open] API ${BASE}`);

  const act = await api('/api/auth/tpv-tablet/activate', {
    method: 'POST',
    body: { terminalCode: CODE },
  });
  console.log('activate:', act.status, act.data?.error || act.data?.ok);
  if (!act.data?.ok) {
    process.exit(1);
  }

  const pdv = act.data.pointOfSale;
  const binding = act.data.terminalBinding;
  const dataUserId = binding?.dataUserId || pdv?.user_id;
  const businessId = binding?.businessId || act.data.business?.business_id;
  const token = act.data.accessToken;

  console.log('pdv', pdv?._id, pdv?.name);
  console.log('business', businessId, act.data.business?.name);
  console.log('dataUserId', dataUserId);

  const open = await api(`/api/delivery/tpv-sessions/${encodeURIComponent(dataUserId)}`, {
    method: 'POST',
    token,
    body: {
      session: {
        business_id: businessId,
        pointOfSaleId: pdv._id,
        pointOfSaleName: pdv.name,
        terminalId: `tablet-${pdv._id}`,
        terminalName: 'Tablet',
        workerName: act.data.user?.fullName || 'Test',
        openingCashCount: { c500: 0, c200: 0, c100: 0, c50: 0, c20: 0, c10: 0, c5: 0, c2: 0, c1: 0, b500: 0, b200: 0, b100: 0, b50: 0, b20: 0, b10: 0, b5: 0 },
        initialCashAmount: 0,
        status: 'open',
        transactions: [],
        cashCounts: [],
        incidents: [],
        linkedOrderIds: [],
        salesByChannel: {},
      },
    },
  });

  console.log('open-caja:', open.status, open.data?.error || open.data?.ok);
  if (!open.data?.ok) process.exit(1);
  console.log('OK session', open.data.session?._id);
}

if (!CODE) {
  console.error('Uso: node scripts/test-tpv-open-caja.mjs CODIGO');
  process.exit(1);
}
if (!EMAIL || !PASS) {
  console.error('Faltan SAAS_LOGIN_EMAIL / SAAS_LOGIN_PASSWORD');
}

main().catch((e) => {
  console.error('FAIL', e?.message || e);
  process.exit(1);
});
