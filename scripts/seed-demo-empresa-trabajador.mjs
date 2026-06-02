/**
 * Crea cuenta empresa (delivery) + trabajador enlazado al mismo negocio.
 * Uso: node scripts/seed-demo-empresa-trabajador.mjs
 */
import '../config/env.js';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

const ACCOUNTS_DB = 'accounts';
const BUSINESSES_DB = 'businesses';

const EMPRESA_EMAIL = 'prueba-empresa@test.local';
const EMPRESA_PASSWORD = 'Empresa2026!';
const TRABAJADOR_EMAIL = 'prueba-trabajador@test.local';
const TRABAJADOR_PASSWORD = 'Trabajador2026!';
const BUSINESS_NAME = 'Demo Delivery';

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

function buildWorkerPermissions() {
  const base = Object.fromEntries(TEAM_PERMISSION_KEYS.map((k) => [k, { view: false, edit: false }]));
  for (const key of ['delivery', 'cash_register']) {
    base[key] = { view: true, edit: true };
  }
  return base;
}

function buildAdminPermissions() {
  const base = Object.fromEntries(TEAM_PERMISSION_KEYS.map((k) => [k, { view: true, edit: true }]));
  return base;
}

async function deleteAccountByEmail(email) {
  const target = String(email || '').trim().toLowerCase();
  const data = await couchJson('GET', `/${ACCOUNTS_DB}/_all_docs?include_docs=true`);
  const matches = (data.rows || [])
    .map((r) => r.doc)
    .filter((d) => d?.type === 'account' && !d.deletedAt && String(d.email || '').toLowerCase() === target);
  for (const doc of matches) {
    await couchJson('DELETE', `/${ACCOUNTS_DB}/${encodeURIComponent(doc._id)}?rev=${encodeURIComponent(doc._rev)}`);
  }
  return matches.length;
}

async function main() {
  if (!BASE || !AUTH) {
    console.error('Faltan COUCHDB_URL, COUCHDB_USER o COUCHDB_PASSWORD');
    process.exit(1);
  }

  for (const db of [ACCOUNTS_DB, BUSINESSES_DB]) {
    try {
      await couchJson('PUT', `/${db}`);
    } catch (e) {
      if (!/already exists|file_exists/i.test(String(e.message))) throw e;
    }
  }

  for (const email of [EMPRESA_EMAIL, TRABAJADOR_EMAIL]) {
    const n = await deleteAccountByEmail(email);
    if (n) console.log(`Eliminada cuenta previa: ${email}`);
  }

  const now = new Date().toISOString();
  const ownerId = uuidv4();
  const businessId = uuidv4();
  const adminPerms = buildAdminPermissions();

  const owner = {
    _id: `account:${ownerId}`,
    type: 'account',
    user_id: ownerId,
    email: EMPRESA_EMAIL,
    firstName: 'Demo',
    lastName: 'Empresa',
    fullName: 'Demo Empresa',
    phone: '+34600000001',
    avatar: '',
    accountType: 'company',
    role: 'Admin',
    status: 'active',
    inviteStatus: 'accepted',
    invitedBy: '',
    companyName: BUSINESS_NAME,
    onboardingCompleted: true,
    onboardingData: { businessType: 'delivery', source: 'seed-demo-pair' },
    provider: 'email',
    permissions: adminPerms,
    employment: {},
    recentActivity: [],
    lastLoginAt: '',
    emailVerified: true,
    paymentSummary: null,
    subscription: {
      status: 'trial_active',
      planName: 'Pro',
      selectedPlanId: 'pro',
      trialEndsAt: new Date(Date.now() + 365 * 86400000).toISOString(),
      currentPeriodStart: now,
      currentPeriodEnd: new Date(Date.now() + 365 * 86400000).toISOString(),
      gracePeriodEndsAt: new Date(Date.now() + 368 * 86400000).toISOString(),
      lastPaymentAt: '',
      cancelAtPeriodEnd: false,
    },
    landingPage: '/saas/dashboard',
    linkedBusinessId: '',
    username: '',
    referralCode: '',
    referredByAffiliateId: '',
    passwordHash: hashPassword(EMPRESA_PASSWORD),
    createdAt: now,
    updatedAt: now,
  };

  await couchJson('PUT', `/${ACCOUNTS_DB}/${encodeURIComponent(owner._id)}`, owner);

  const business = {
    _id: `business:${businessId}`,
    type: 'business',
    business_id: businessId,
    owner_user_id: ownerId,
    group_id: null,
    businessType: 'delivery',
    name: BUSINESS_NAME,
    legalName: BUSINESS_NAME,
    taxId: 'B12345678',
    address: 'Calle Demo 1',
    city: 'Madrid',
    phone: owner.phone,
    email: owner.email,
    logo: '',
    companyCode: 'DEMO01',
    branches: [],
    members: [
      {
        user_id: ownerId,
        fullName: owner.fullName,
        email: owner.email,
        role: 'Admin',
        branch_id: null,
        permissions: adminPerms,
        joinedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  const savedBusiness = await couchJson('PUT', `/${BUSINESSES_DB}/${encodeURIComponent(business._id)}`, business);
  business._rev = savedBusiness.rev;

  const workerPerms = buildWorkerPermissions();
  const workerId = uuidv4();
  const worker = {
    _id: `account:${workerId}`,
    type: 'account',
    user_id: workerId,
    email: TRABAJADOR_EMAIL,
    firstName: 'Demo',
    lastName: 'Trabajador',
    fullName: 'Demo Trabajador',
    phone: '+34600000002',
    avatar: '',
    accountType: 'user',
    role: 'Usuario',
    status: 'active',
    inviteStatus: 'accepted',
    invitedBy: ownerId,
    companyName: BUSINESS_NAME,
    onboardingCompleted: true,
    onboardingData: { source: 'seed-demo-pair' },
    provider: 'email',
    permissions: workerPerms,
    employment: {},
    recentActivity: [],
    lastLoginAt: '',
    emailVerified: true,
    paymentSummary: null,
    subscription: null,
    landingPage: '/saas/worker/tasks',
    linkedBusinessId: businessId,
    username: '',
    referralCode: '',
    referredByAffiliateId: '',
    passwordHash: hashPassword(TRABAJADOR_PASSWORD),
    createdAt: now,
    updatedAt: now,
  };

  await couchJson('PUT', `/${ACCOUNTS_DB}/${encodeURIComponent(worker._id)}`, worker);

  business.members.push({
    user_id: workerId,
    fullName: worker.fullName,
    email: worker.email,
    role: 'Usuario',
    branch_id: null,
    permissions: workerPerms,
    joinedAt: now,
  });
  business.updatedAt = new Date().toISOString();
  const savedBusiness2 = await couchJson('PUT', `/${BUSINESSES_DB}/${encodeURIComponent(business._id)}`, business);
  business._rev = savedBusiness2.rev;

  console.log('\n=== Cuentas demo creadas ===\n');
  console.log('EMPRESA (gerente)');
  console.log(`  Email:       ${EMPRESA_EMAIL}`);
  console.log(`  Contraseña:  ${EMPRESA_PASSWORD}`);
  console.log(`  user_id:     ${ownerId}`);
  console.log(`  Entrada:     /auth/login → gate / dashboard`);
  console.log('');
  console.log('TRABAJADOR (enlazado a la empresa)');
  console.log(`  Email:       ${TRABAJADOR_EMAIL}`);
  console.log(`  Contraseña:  ${TRABAJADOR_PASSWORD}`);
  console.log(`  user_id:     ${workerId}`);
  console.log(`  Entrada:     /auth/worker-login → /saas/worker/tasks`);
  console.log('');
  console.log('NEGOCIO');
  console.log(`  Nombre:      ${BUSINESS_NAME}`);
  console.log(`  business_id: ${businessId}`);
  console.log(`  Tipo:        delivery`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
