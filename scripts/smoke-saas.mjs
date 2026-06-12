#!/usr/bin/env node
/**
 * Smoke test SaaS — comprobar rutas críticas antes/después de deploy.
 *
 * Flujo:
 *   health → login → negocios → tiendas por empresa (delivery) → finanzas por titular
 *
 * Uso:
 *   npm run smoke:saas
 *   VERIFY_API_BASE=https://vertialapp.com npm run smoke:saas
 *
 * Requiere en .env.development / .env (o deploy/local-values.env):
 *   SAAS_LOGIN_EMAIL, SAAS_LOGIN_PASSWORD
 *
 * Opcional:
 *   VERIFY_API_BASE / SMOKE_API_BASE  (default http://127.0.0.1:3001)
 *   SMOKE_SAAS_MIN_STORES=1           exige ≥N tiendas en cada negocio delivery
 *   SMOKE_SAAS_SKIP_FINANCE=1         omitir GET /api/finance/:userId
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import {
  filterWorkCentersForBusinessScope,
  isDeliveryBusinessType,
  listWorkCentersForSmoke,
  normalizeBusinessScopeId,
  normalizeTenantUserId,
  resolveBusinessDataUserId,
} from './lib/saasSmokeHelpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.development') });
dotenv.config({ path: path.join(root, '.env') });

const localValuesPath = path.join(root, 'deploy', 'local-values.env');
if (existsSync(localValuesPath)) {
  dotenv.config({ path: localValuesPath });
}

const BASE = String(process.env.SMOKE_API_BASE || process.env.VERIFY_API_BASE || 'http://127.0.0.1:3001').replace(/\/+$/, '');
const EMAIL = String(process.env.SAAS_LOGIN_EMAIL || '').trim().toLowerCase();
const PASSWORD = String(process.env.SAAS_LOGIN_PASSWORD || '').trim();
const COUCH_PREFIX = process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial';
const WC_DB = `${COUCH_PREFIX}-sales-points`;
const MIN_STORES = Math.max(0, Number(process.env.SMOKE_SAAS_MIN_STORES || 0));
const SKIP_FINANCE = process.env.SMOKE_SAAS_SKIP_FINANCE === '1';

const outcomes = [];
const started = Date.now();

function ok(step, detail = '') {
  outcomes.push({ step, ok: true, detail });
  console.log(`  OK   ${step}${detail ? ` — ${detail}` : ''}`);
}

function fail(step, detail = '') {
  outcomes.push({ step, ok: false, detail });
  console.error(`  FAIL ${step}${detail ? ` — ${detail}` : ''}`);
}

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
  console.log('\n[smoke:saas] ─────────────────────────────────────');
  console.log(`[smoke:saas] API ${BASE}`);
  console.log(`[smoke:saas] min tiendas delivery: ${MIN_STORES} · finanzas: ${SKIP_FINANCE ? 'off' : 'on'}`);

  if (!EMAIL || !PASSWORD) {
    fail('config', 'Faltan SAAS_LOGIN_EMAIL y SAAS_LOGIN_PASSWORD en .env');
    summarize(false);
    process.exit(1);
  }

  // ── Health ────────────────────────────────────────────────────────────────
  const health = await api('/health');
  if (!health.data?.ok) {
    fail('health', `Backend no responde (${health.status})`);
    summarize(false);
    process.exit(1);
  }
  ok('health', health.data?.checks?.couchdb?.ok ? 'CouchDB OK' : 'sin check couch');

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = login.data?.accessToken;
  const user = login.data?.user;
  if (!token || !user?.user_id) {
    fail('login', login.data?.error || `HTTP ${login.status}`);
    summarize(false);
    process.exit(1);
  }
  ok('login', user.email || user.user_id);

  // ── Negocios ──────────────────────────────────────────────────────────────
  const bizRes = await api(`/api/businesses/user/${encodeURIComponent(user.user_id)}`, { token });
  const businesses = bizRes.data?.businesses || [];
  if (!Array.isArray(businesses) || businesses.length === 0) {
    fail('businesses', 'Sin negocios en la cuenta de prueba');
    summarize(false);
    process.exit(1);
  }
  ok('businesses', `${businesses.length} empresa(s)`);

  const accountBusinessCount = businesses.length;

  // ── CouchDB tiendas (una lectura) ─────────────────────────────────────────
  await api(`/api/couch/db/${encodeURIComponent(WC_DB)}`, { method: 'PUT', token }).catch(() => null);
  const docsRes = await api(`/api/couch/docs/${encodeURIComponent(WC_DB)}`, { token });
  if (docsRes.status !== 200) {
    fail('work-centers-db', docsRes.data?.error || `HTTP ${docsRes.status}`);
  } else {
    ok('work-centers-db', `${(docsRes.data?.docs || []).length} doc(s) en ${WC_DB}`);
  }
  const allWcDocs = docsRes.data?.docs || [];

  // ── Por empresa: tiendas + finanzas ───────────────────────────────────────
  const financeUserIdsChecked = new Set();

  for (const business of businesses) {
    const name = String(business.name || business.business_id || '?').trim();
    const bid = normalizeBusinessScopeId(business.business_id || business.id);
    const dataUserId = resolveBusinessDataUserId(user, business);
    const isDelivery = isDeliveryBusinessType(business.businessType);

    if (!bid) {
      fail(`business:${name}`, 'Sin business_id');
      continue;
    }
    if (!dataUserId) {
      fail(`business:${name}`, 'No se pudo resolver dataUserId');
      continue;
    }

    if (isDelivery) {
      const listed = listWorkCentersForSmoke(allWcDocs, dataUserId, business);
      const scoped = filterWorkCentersForBusinessScope(listed, bid, { accountBusinessCount });
      const retail = scoped.filter(
        (wc) => wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen',
      );

      if (MIN_STORES > 0 && retail.length < MIN_STORES) {
        fail(
          `stores:${name}`,
          `Esperaba ≥${MIN_STORES} tienda(s), hay ${retail.length} (${retail.map((w) => w.name).join(', ') || 'ninguna'})`,
        );
      } else {
        ok(
          `stores:${name}`,
          `${retail.length} tienda(s) retail · dataUserId=${dataUserId.slice(0, 8)}…`,
        );
      }
    } else {
      ok(`stores:${name}`, 'no delivery — tiendas omitidas');
    }

    if (!SKIP_FINANCE) {
      const financeId = normalizeTenantUserId(dataUserId);
      if (!financeUserIdsChecked.has(financeId)) {
        financeUserIdsChecked.add(financeId);
        const fin = await api(`/api/finance/${encodeURIComponent(financeId)}`, { token });
        if (fin.status === 200 && fin.data?.ok === true && Array.isArray(fin.data?.movements)) {
          ok(`finance:${financeId.slice(0, 8)}…`, `${fin.data.movements.length} movimiento(s)`);
        } else {
          fail(
            `finance:${financeId.slice(0, 8)}…`,
            fin.data?.error || `HTTP ${fin.status}`,
          );
        }
      }
    }
  }

  // ── Resumen ───────────────────────────────────────────────────────────────
  const allOk = outcomes.every((o) => o.ok);
  summarize(allOk);
  process.exit(allOk ? 0 : 1);
}

function summarize(allOk) {
  const ms = Date.now() - started;
  const passed = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.filter((o) => !o.ok).length;
  console.log('[smoke:saas] ─────────────────────────────────────');
  if (allOk) {
    console.log(`[smoke:saas] PASS ${passed}/${outcomes.length} (${ms}ms)\n`);
  } else {
    console.error(`[smoke:saas] FAIL ${failed} error(es), ${passed} OK (${ms}ms)\n`);
  }
}

main().catch((err) => {
  console.error('[smoke:saas] Error inesperado:', err?.message || err);
  process.exit(1);
});
