/**
 * Verificación E2E TPV tablet: login admin → PDV con terminalCode → activate.
 * Uso: node scripts/verify-tpv-tablet.mjs
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.development') });
dotenv.config({ path: path.join(root, '.env') });

const BASE = process.env.VERIFY_API_BASE || 'http://127.0.0.1:3001';
const EMAIL = String(process.env.SAAS_LOGIN_EMAIL || '').trim().toLowerCase();
const PASSWORD = String(process.env.SAAS_LOGIN_PASSWORD || '').trim();
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

function dataUserId(user, business) {
  const selfId = String(user?.user_id || '').trim();
  const ownerId = String(business?.owner_user_id || '').trim();
  if (!ownerId || ownerId === selfId) return selfId;
  const members = business?.members || [];
  if (members.some((m) => String(m.user_id || '').trim() === selfId)) return ownerId;
  return selfId;
}

async function main() {
  console.log(`[verify-tpv-tablet] API ${BASE}`);

  if (!EMAIL || !PASSWORD) {
    console.error('FAIL — Faltan SAAS_LOGIN_EMAIL / SAAS_LOGIN_PASSWORD');
    process.exit(1);
  }

  const health = await api('/health');
  if (!health.data?.ok) {
    console.error('FAIL — Backend no responde');
    process.exit(1);
  }
  console.log('OK  health');

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = login.data?.accessToken;
  const admin = login.data?.user;
  if (!token || !admin?.user_id) {
    console.error('FAIL — login', login.data?.error || login.status);
    process.exit(1);
  }
  console.log('OK  login', admin.email);

  const bizRes = await api(`/api/businesses/user/${encodeURIComponent(admin.user_id)}`, { token });
  const businesses = bizRes.data?.businesses || [];
  const business =
    businesses.find((b) => b.businessType === 'delivery') ||
    businesses[0];
  if (!business?.business_id) {
    console.error('FAIL — sin negocios');
    process.exit(1);
  }
  const uid = dataUserId(admin, business);
  console.log('OK  business', business.name, '· dataUserId=', uid);

  const listPdv = await api(`/api/delivery/points-of-sale/${encodeURIComponent(uid)}`, { token });
  const pdvs = (listPdv.data?.pointsOfSale || []).filter((p) => p.active !== false);
  const pdv = pdvs.find((p) => p.terminalCode && p.workCenterId) || pdvs[0];
  if (!pdv?._id) {
    console.error('FAIL — sin PDV activo');
    process.exit(1);
  }
  if (!pdv.terminalCode) {
    console.error('FAIL — PDV sin terminalCode tras listado');
    process.exit(1);
  }
  console.log('OK  pdv', pdv.name, '· terminalCode=', pdv.terminalCode);

  const activate = await api('/api/auth/tpv-tablet/activate', {
    method: 'POST',
    body: { terminalCode: pdv.terminalCode },
  });
  if (!activate.data?.ok || !activate.data?.accessToken) {
    console.error('FAIL — tpv-tablet/activate', activate.data?.error || activate.data?.code || activate.status);
    process.exit(1);
  }
  console.log('OK  tpv-tablet/activate →', activate.data.redirectTo);
  console.log('OK  worker session', activate.data.user?.fullName || activate.data.user?.email);
  console.log('OK  binding pdv', activate.data.pointOfSale?.name);

  const switchRes = await api('/api/auth/tpv-tablet/switch', {
    method: 'POST',
    body: { terminalCode: pdv.terminalCode },
  });
  if (!switchRes.data?.ok) {
    console.error('FAIL — tpv-tablet/switch', switchRes.data?.error || switchRes.status);
    process.exit(1);
  }
  console.log('OK  tpv-tablet/switch');

  console.log('\n[verify-tpv-tablet] Todo OK');
}

main().catch((err) => {
  console.error('FAIL —', err?.message || err);
  process.exit(1);
});
