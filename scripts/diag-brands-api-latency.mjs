#!/usr/bin/env node
/**
 * Mide GET /api/brands/:businessId en el VPS (login smoke).
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.development') });

const API = process.env.SMOKE_API_BASE || 'http://127.0.0.1:3000';
const email = process.env.SAAS_LOGIN_EMAIL || process.env.SMOKE_EMAIL || 'uriel@admin.com';
const password = process.env.SAAS_LOGIN_PASSWORD || process.env.SMOKE_PASSWORD || '';
const BUSINESS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

async function login() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`login ${res.status} ${data.error || ''}`);
  return data.token || data.accessToken || data.jwt;
}

const token = await login();
const t0 = Date.now();
const res = await fetch(`${API}/api/brands/${BUSINESS}`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
});
const ms = Date.now() - t0;
const data = await res.json().catch(() => ({}));
console.log({ status: res.status, ms, brands: (data.brands || []).length, ok: data.ok });

const t1 = Date.now();
const res2 = await fetch(`${API}/api/brands/${BUSINESS}`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
});
console.log({ status: res2.status, ms: Date.now() - t1, note: '2nd call' });
