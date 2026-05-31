/**
 * Crea una cuenta de trabajador de prueba en CouchDB local.
 *
 * Uso:
 *   node scripts/seed-test-worker.mjs
 *   node scripts/seed-test-worker.mjs --email otro@test.local --password MiClave123
 */
import '../config/env.js';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

const ACCOUNTS_DB = 'accounts';
const BUSINESSES_DB = 'businesses';

const DEFAULT_EMAIL = 'trabajador@test.local';
const DEFAULT_PASSWORD = 'Test1234!';
const DEFAULT_BUSINESS_ID = '4b9e6940-ca84-45ed-9045-c8d2b189d164'; // modomio (delivery)

const TEAM_PERMISSION_KEYS = [
  'vehicles', 'clients', 'sales', 'reservations', 'documents', 'finance', 'ancove', 'team',
  'fleet', 'delivery', 'cash_register', 'cleaning_materials', 'acquisitions', 'butcher_waste',
  'butcher_purchases', 'reports', 'scrapyard_docs', 'scrapyard',
];

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function buildWorkerPermissions() {
  const base = Object.fromEntries(TEAM_PERMISSION_KEYS.map((k) => [k, { view: false, edit: false }]));
  for (const key of ['vehicles', 'clients', 'sales', 'delivery', 'cash_register']) {
    base[key] = { view: true, edit: true };
  }
  base.clients = { view: true, edit: false };
  return base;
}

function couchBaseUrl() {
  const raw = String(process.env.COUCHDB_URL || '').trim();
  if (!raw) return '';
  try {
    const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw}`;
    const u = new URL(href);
    const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
    return `${u.origin}${pathPart}`.replace(/\/+$/, '');
  } catch {
    return raw.replace(/^(https?:\/\/)(?:[^/@]+)@/i, '$1').replace(/\/+$/, '');
  }
}

const BASE = couchBaseUrl();
const AUTH =
  process.env.COUCHDB_USER && process.env.COUCHDB_PASSWORD
    ? `Basic ${Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64')}`
    : '';

async function couchJson(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(typeof data === 'object' && data?.reason ? data.reason : `${res.status} ${text}`);
  }
  return data;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD, businessId: DEFAULT_BUSINESS_ID };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--email') out.email = String(args[i + 1] || '').trim().toLowerCase();
    if (args[i] === '--password') out.password = String(args[i + 1] || '');
    if (args[i] === '--business-id') out.businessId = String(args[i + 1] || '').trim();
  }
  return out;
}

async function findAccountByEmail(email) {
  const data = await couchJson('GET', `/${ACCOUNTS_DB}/_all_docs?include_docs=true`);
  return (data.rows || [])
    .map((r) => r.doc)
    .find((d) => d?.type === 'account' && !d.deletedAt && String(d.email || '').toLowerCase() === email);
}

async function findAdminAccount() {
  const data = await couchJson('GET', `/${ACCOUNTS_DB}/_all_docs?include_docs=true`);
  return (data.rows || [])
    .map((r) => r.doc)
    .find((d) => d?.type === 'account' && !d.deletedAt && String(d.email || '').toLowerCase() === 'uriel@admin.com');
}

async function findBusiness(businessId) {
  return couchJson('GET', `/${BUSINESSES_DB}/${encodeURIComponent(`business:${businessId}`)}`);
}

async function main() {
  if (!BASE || !AUTH) {
    console.error('Faltan COUCHDB_URL, COUCHDB_USER o COUCHDB_PASSWORD en .env');
    process.exit(1);
  }

  const { email, password, businessId } = parseArgs();
  if (!email || !password) {
    console.error('Email y contraseña son obligatorios');
    process.exit(1);
  }

  const admin = await findAdminAccount();
  if (!admin?.user_id) {
    console.error('No se encontró uriel@admin.com en accounts');
    process.exit(1);
  }

  const business = await findBusiness(businessId);
  if (!business?.business_id) {
    console.error(`No se encontró el negocio ${businessId}`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const permissions = buildWorkerPermissions();
  const existing = await findAccountByEmail(email);

  let worker;
  if (existing) {
    worker = {
      ...existing,
      accountType: 'user',
      role: 'Usuario',
      status: 'active',
      inviteStatus: 'accepted',
      invitedBy: admin.user_id,
      companyName: business.name || '',
      linkedBusinessId: business.business_id,
      landingPage: '/saas/worker',
      emailVerified: true,
      onboardingCompleted: true,
      permissions,
      passwordHash: hashPassword(password),
      updatedAt: now,
    };
    await couchJson('PUT', `/${ACCOUNTS_DB}/${encodeURIComponent(worker._id)}`, worker);
    console.log('Cuenta existente actualizada como trabajador.');
  } else {
    const userId = uuidv4();
    worker = {
      _id: `account:${userId}`,
      type: 'account',
      user_id: userId,
      email,
      firstName: 'Ana',
      lastName: 'Trabajadora',
      fullName: 'Ana Trabajadora',
      phone: '',
      avatar: '',
      accountType: 'user',
      role: 'Usuario',
      status: 'active',
      inviteStatus: 'accepted',
      invitedBy: admin.user_id,
      companyName: business.name || '',
      onboardingCompleted: true,
      onboardingData: { source: 'seed-test-worker' },
      provider: 'email',
      permissions,
      employment: {},
      recentActivity: [],
      lastLoginAt: '',
      emailVerified: true,
      paymentSummary: null,
      subscription: null,
      landingPage: '/saas/worker',
      linkedBusinessId: business.business_id,
      username: '',
      referralCode: '',
      referredByAffiliateId: '',
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
    };
    await couchJson('PUT', `/${ACCOUNTS_DB}/${encodeURIComponent(worker._id)}`, worker);
    console.log('Cuenta de trabajador creada.');
  }

  const members = Array.isArray(business.members) ? [...business.members] : [];
  if (!members.some((m) => m.user_id === worker.user_id)) {
    members.push({
      user_id: worker.user_id,
      fullName: worker.fullName,
      email: worker.email,
      role: 'Usuario',
      branch_id: null,
      permissions,
      joinedAt: now,
    });
    await couchJson('PUT', `/${BUSINESSES_DB}/${encodeURIComponent(business._id)}`, {
      ...business,
      members,
      updatedAt: now,
    });
    console.log(`Añadida al equipo de "${business.name}".`);
  } else {
    console.log(`Ya era miembro de "${business.name}".`);
  }

  console.log('\n--- Credenciales de prueba ---');
  console.log(`Email:      ${email}`);
  console.log(`Contraseña: ${password}`);
  console.log(`Empresa:    ${business.name} (${business.businessType || '—'})`);
  console.log(`Entrada:    /saas/worker`);
  console.log(`user_id:    ${worker.user_id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
