/**
 * Cuenta Vertial de prueba para certificación Uber Eats (sandbox/TEST).
 * No usa uriel@admin.com ni el negocio de Pauroyo.
 *
 * Uso (producción vía VPS):
 *   node scripts/remote-seed-uber-test-account.mjs
 *
 * Local / SSH en el VPS:
 *   NODE_ENV=production node scripts/seed-uber-test-account.mjs
 *
 * Opcional:
 *   UBER_TEST_EMAIL=ubertest@vertial.com
 *   UBER_TEST_PASSWORD=... (mín. 8)
 *   UBER_TEST_RECREATE=1
 */
import '../config/env.js';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

const ACCOUNTS_DB = 'accounts';
const BUSINESSES_DB = 'businesses';
const SALES_POINTS_DB = 'bbddsaas-sales-points';
const DELIVERY_DB = 'bbddsaas-delivery';
const CATALOG_DB = 'bbddsaas-catalog';

const TEST_EMAIL = String(process.env.UBER_TEST_EMAIL || 'ubertest@vertial.com')
  .trim()
  .toLowerCase();
const TEST_PASSWORD = String(
  process.env.UBER_TEST_PASSWORD || `UberTest-${crypto.randomBytes(4).toString('hex')}!`,
).trim();
const BUSINESS_NAME = 'Vertial Uber Test';
const BUSINESS_TYPE = 'delivery';
const RECREATE = String(process.env.UBER_TEST_RECREATE || '1').trim() !== '0';

const TEAM_PERMISSION_KEYS = [
  'vehicles', 'clients', 'sales', 'reservations', 'documents', 'finance', 'ancove', 'team',
  'fleet', 'delivery', 'cash_register', 'cleaning_materials', 'acquisitions', 'butcher_waste',
  'butcher_purchases', 'reports', 'scrapyard_docs', 'scrapyard', 'workshop',
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

function buildAdminPermissions() {
  return Object.fromEntries(TEAM_PERMISSION_KEYS.map((k) => [k, { view: true, edit: true }]));
}

async function findAccountsByEmail(email) {
  const data = await couchJson('POST', `/${ACCOUNTS_DB}/_find`, {
    selector: { type: 'account', email },
    limit: 25,
  });
  return data?.docs || [];
}

async function findBusinessesForOwner(ownerId) {
  const data = await couchJson('POST', `/${BUSINESSES_DB}/_find`, {
    selector: { type: 'business', owner_user_id: ownerId },
    limit: 25,
  });
  return data?.docs || [];
}

async function softDeleteDoc(db, doc, now) {
  if (!doc?._id || doc.deletedAt) return;
  await couchJson('PUT', `/${db}/${encodeURIComponent(doc._id)}`, {
    ...doc,
    status: doc.status === 'accepted' ? 'accepted' : 'inactive',
    deletedAt: now,
    updatedAt: now,
  });
  console.log(`[soft-delete] ${db}/${doc._id}`);
}

async function ensureDb(db) {
  try {
    await couchJson('PUT', `/${db}`);
  } catch (e) {
    if (!/already exists|file_exists/i.test(String(e.message))) throw e;
  }
}

async function upsertCatalogItem({ ownerId, id, sku, name, category, unitPrice, now }) {
  let existing = null;
  try {
    existing = await couchJson('GET', `/${CATALOG_DB}/${encodeURIComponent(id)}`);
  } catch {
    existing = null;
  }
  const doc = {
    _id: id,
    _rev: existing?._rev,
    type: 'catalog_item',
    id,
    sku,
    user_id: ownerId,
    module: 'catalog',
    itemType: 'product',
    vertical: 'delivery',
    name,
    description: `${name} (Uber TEST)`,
    category,
    unitPrice,
    costPrice: Math.round(unitPrice * 0.4 * 100) / 100,
    taxRate: 10,
    stockQuantity: 100,
    minStock: 0,
    unit: 'ud',
    active: true,
    available: true,
    webVisible: true,
    salesChannels: [
      { channelId: 'ubereats', channelName: 'Uber Eats', customPrice: null },
      { channelId: 'tpv', channelName: 'TPV', customPrice: null },
    ],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deletedAt: null,
  };
  await couchJson('PUT', `/${CATALOG_DB}/${encodeURIComponent(id)}`, doc);
}

async function main() {
  if (!BASE || !AUTH) {
    console.error('Faltan COUCHDB_URL, COUCHDB_USER o COUCHDB_PASSWORD');
    process.exit(1);
  }
  if (!TEST_EMAIL || TEST_PASSWORD.length < 8) {
    console.error('Email vacío o contraseña < 8 caracteres');
    process.exit(1);
  }

  for (const db of [ACCOUNTS_DB, BUSINESSES_DB, SALES_POINTS_DB, DELIVERY_DB, CATALOG_DB]) {
    await ensureDb(db);
  }

  const now = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 365 * 86400000).toISOString();
  const adminPerms = buildAdminPermissions();
  const passwordHash = hashPassword(TEST_PASSWORD);

  const existingAccounts = await findAccountsByEmail(TEST_EMAIL);
  if (RECREATE && existingAccounts.length) {
    console.log(`\n[recreate] Soft-delete de ${existingAccounts.length} cuenta(s) (${TEST_EMAIL})…`);
    for (const acc of existingAccounts) {
      if (acc.deletedAt) continue;
      const businesses = await findBusinessesForOwner(acc.user_id);
      for (const b of businesses) {
        await softDeleteDoc(BUSINESSES_DB, b, now);
      }
      await softDeleteDoc(ACCOUNTS_DB, acc, now);
    }
  }

  const reuse = !RECREATE
    ? (existingAccounts.find((a) => !a.deletedAt) || null)
    : null;
  const ownerId = reuse?.user_id || uuidv4();
  let business = reuse
    ? (await findBusinessesForOwner(ownerId)).find((b) => !b.deletedAt) || null
    : null;
  const businessId = business?.business_id || uuidv4();

  const owner = {
    _id: reuse?._id || `account:${ownerId}`,
    _rev: reuse?._rev,
    type: 'account',
    user_id: ownerId,
    email: TEST_EMAIL,
    firstName: 'Uber',
    lastName: 'Test',
    fullName: 'Uber Test Vertial',
    phone: '+34600999001',
    avatar: '',
    accountType: 'company',
    role: 'Admin',
    status: 'active',
    inviteStatus: 'accepted',
    invitedBy: '',
    companyName: BUSINESS_NAME,
    onboardingCompleted: true,
    onboardingData: { businessType: BUSINESS_TYPE, source: 'uber-test-seed' },
    provider: 'email',
    permissions: adminPerms,
    employment: {},
    recentActivity: [],
    lastLoginAt: '',
    emailVerified: true,
    failedLoginAttempts: 0,
    lockUntil: null,
    requireLoginOtp: false,
    paymentSummary: null,
    subscription: {
      status: 'subscription_active',
      planName: 'Pro',
      selectedPlanId: 'pro',
      trialEndsAt: periodEnd,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      gracePeriodEndsAt: periodEnd,
      lastPaymentAt: now,
      cancelAtPeriodEnd: false,
      billingExempt: true,
    },
    landingPage: '/saas/dashboard',
    linkedBusinessId: businessId,
    username: '',
    referralCode: '',
    referredByAffiliateId: '',
    passwordHash,
    createdAt: reuse?.createdAt || now,
    updatedAt: now,
    deletedAt: null,
  };

  const savedOwner = await couchJson('PUT', `/${ACCOUNTS_DB}/${encodeURIComponent(owner._id)}`, owner);

  const member = {
    user_id: ownerId,
    fullName: owner.fullName,
    email: owner.email,
    role: 'Admin',
    branch_id: null,
    permissions: adminPerms,
    joinedAt: business?.members?.[0]?.joinedAt || now,
  };

  if (!business) {
    business = {
      _id: `business:${businessId}`,
      type: 'business',
      business_id: businessId,
      owner_user_id: ownerId,
      group_id: null,
      businessType: BUSINESS_TYPE,
      name: BUSINESS_NAME,
      legalName: BUSINESS_NAME,
      taxId: 'B11111111',
      address: 'Calle Uber Test 1',
      city: 'Madrid',
      phone: owner.phone,
      email: owner.email,
      logo: '',
      companyCode: 'UBERTEST',
      branches: [],
      members: [member],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  } else {
    business = {
      ...business,
      name: BUSINESS_NAME,
      legalName: BUSINESS_NAME,
      businessType: BUSINESS_TYPE,
      owner_user_id: ownerId,
      email: owner.email,
      phone: owner.phone,
      members: [member],
      updatedAt: now,
      deletedAt: null,
    };
  }
  await couchJson('PUT', `/${BUSINESSES_DB}/${encodeURIComponent(business._id)}`, business);

  const wcId = `wc-uber-test-${businessId.slice(0, 8)}`;
  let existingWc = null;
  try {
    existingWc = await couchJson('GET', `/${SALES_POINTS_DB}/${encodeURIComponent(wcId)}`);
  } catch {
    existingWc = null;
  }
  await couchJson('PUT', `/${SALES_POINTS_DB}/${encodeURIComponent(wcId)}`, {
    _id: wcId,
    _rev: existingWc?._rev,
    id: wcId,
    type: 'sales_point',
    user_id: ownerId,
    businessId,
    business_id: businessId,
    name: 'Uber Test Tienda',
    centerType: 'punto_de_venta',
    ownership: 'propiedad',
    address: 'Calle Uber Test 1',
    city: 'Madrid',
    active: true,
    expectedStaffCount: 1,
    createdAt: existingWc?.createdAt || now,
    updatedAt: now,
    deletedAt: null,
  });

  const pdvId = `pdv-uber-test-${businessId.slice(0, 8)}`;
  let existingPdv = null;
  try {
    existingPdv = await couchJson('GET', `/${DELIVERY_DB}/${encodeURIComponent(pdvId)}`);
  } catch {
    existingPdv = null;
  }
  await couchJson('PUT', `/${DELIVERY_DB}/${encodeURIComponent(pdvId)}`, {
    _id: pdvId,
    _rev: existingPdv?._rev,
    type: 'point_of_sale',
    user_id: ownerId,
    businessId,
    business_id: businessId,
    workCenterId: wcId,
    name: 'Uber Test PDV',
    code: 'UBERPDV',
    active: true,
    address: 'Calle Uber Test 1',
    city: 'Madrid',
    terminals: [{ id: `term-uber-${businessId.slice(0, 8)}`, name: 'Tablet Uber Test', active: true }],
    createdAt: existingPdv?.createdAt || now,
    updatedAt: now,
    deletedAt: null,
  });

  const catalogSeed = [
    { sku: 'UBER-BURGER', name: 'Burger Test', category: 'Comidas', unitPrice: 9.5 },
    { sku: 'UBER-PIZZA', name: 'Pizza Test', category: 'Comidas', unitPrice: 11 },
    { sku: 'UBER-COLA', name: 'Cola Test', category: 'Bebidas', unitPrice: 2.5 },
    { sku: 'UBER-FRIES', name: 'Patatas Test', category: 'Extras', unitPrice: 3.5 },
  ];
  for (const item of catalogSeed) {
    await upsertCatalogItem({
      ownerId,
      id: `catitem-uber-test-${item.sku.toLowerCase()}`,
      sku: item.sku,
      name: item.name,
      category: item.category,
      unitPrice: item.unitPrice,
      now,
    });
  }

  console.log('\n=== Cuenta Uber TEST lista ===\n');
  console.log(`Email:       ${TEST_EMAIL}`);
  console.log(`Contraseña:  ${TEST_PASSWORD}`);
  console.log(`Plan:        Pro (billingExempt)`);
  console.log(`Vertical:    delivery`);
  console.log(`Negocio:     ${BUSINESS_NAME}`);
  console.log(`business_id: ${businessId}`);
  console.log(`user_id:     ${ownerId}`);
  console.log(`wc:          ${wcId}`);
  console.log(`pdv:         ${pdvId}`);
  console.log(`catálogo:    ${catalogSeed.length} productos Uber`);
  console.log(`rev cuenta:  ${savedOwner.rev}`);
  console.log('\nSiguiente: login → Integraciones → Conectar Uber (merchant TEST).\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
