/**
 * Demo bar/restaurante local — cuenta + tienda + PDV (Sala, TPV, caja).
 *
 * Uso:
 *   node scripts/seed-demo-bar-local.mjs
 *
 * Variables opcionales:
 *   BAR_DEMO_EMAIL=prueba-bar@test.local
 *   BAR_DEMO_PASSWORD=Bar2026!
 *   BAR_DEMO_RECREATE=1  → borra cuenta previa del mismo email
 */
import '../config/env.js';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

const ACCOUNTS_DB = 'accounts';
const BUSINESSES_DB = 'businesses';
const SALES_POINTS_DB = 'bbddsaas-sales-points';
const DELIVERY_DB = 'bbddsaas-delivery';

const BAR_EMAIL = String(process.env.BAR_DEMO_EMAIL || 'prueba-bar@test.local')
  .trim()
  .toLowerCase();
const BAR_PASSWORD = String(process.env.BAR_DEMO_PASSWORD || 'Bar2026!').trim();
const BUSINESS_NAME = 'Demo Bar Local';
const BUSINESS_TYPE = 'restaurant';
const RESTAURANT_FORMAT = 'bar';
const RECREATE = String(process.env.BAR_DEMO_RECREATE || '1').trim() !== '0';

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
  const res = await fetch(`${COUCH}${path}`, {
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

const COUCH = BASE;

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
    deletedAt: now,
    updatedAt: now,
  });
}

async function hardDeleteAccount(doc) {
  if (!doc?._id) return;
  await couchJson('DELETE', `/${ACCOUNTS_DB}/${encodeURIComponent(doc._id)}?rev=${encodeURIComponent(doc._rev)}`);
}

async function ensureDb(db) {
  try {
    await couchJson('PUT', `/${db}`);
  } catch (e) {
    if (!/already exists|file_exists/i.test(String(e.message))) throw e;
  }
}

async function ensureRetailForBusiness(ownerId, businessId, now) {
  const wcId = `wc-demo-bar-${businessId.slice(0, 8)}`;
  let existingWc = null;
  try {
    existingWc = await couchJson('GET', `/${SALES_POINTS_DB}/${encodeURIComponent(wcId)}`);
  } catch {
    existingWc = null;
  }

  const wcDoc = {
    _id: wcId,
    _rev: existingWc?._rev,
    id: wcId,
    type: 'sales_point',
    user_id: ownerId,
    businessId,
    business_id: businessId,
    name: 'Bar Demo',
    centerType: 'punto_de_venta',
    ownership: 'propiedad',
    address: 'Calle Bar Demo 1',
    city: 'Barcelona',
    active: true,
    expectedStaffCount: 2,
    createdAt: existingWc?.createdAt || now,
    updatedAt: now,
    deletedAt: null,
  };
  await couchJson('PUT', `/${SALES_POINTS_DB}/${encodeURIComponent(wcId)}`, wcDoc);

  const pdvId = `pdv-demo-bar-${businessId.slice(0, 8)}`;
  let existingPdv = null;
  try {
    existingPdv = await couchJson('GET', `/${DELIVERY_DB}/${encodeURIComponent(pdvId)}`);
  } catch {
    existingPdv = null;
  }

  const pdvDoc = {
    _id: pdvId,
    _rev: existingPdv?._rev,
    type: 'point_of_sale',
    user_id: ownerId,
    businessId,
    business_id: businessId,
    workCenterId: wcId,
    name: 'Bar Demo',
    code: 'BARDEMO',
    active: true,
    address: 'Calle Bar Demo 1',
    city: 'Barcelona',
    terminals: existingPdv?.terminals?.length
      ? existingPdv.terminals
      : [
          {
            id: `term-bar-${businessId.slice(0, 8)}`,
            name: 'Tablet Bar',
            active: true,
          },
        ],
    createdAt: existingPdv?.createdAt || now,
    updatedAt: now,
    deletedAt: null,
  };
  await couchJson('PUT', `/${DELIVERY_DB}/${encodeURIComponent(pdvId)}`, pdvDoc);

  return { wcId, pdvId };
}

async function main() {
  if (!BASE || !AUTH) {
    console.error('Faltan COUCHDB_URL, COUCHDB_USER o COUCHDB_PASSWORD');
    process.exit(1);
  }
  if (!BAR_EMAIL || BAR_PASSWORD.length < 8) {
    console.error('Email vacío o contraseña < 8 caracteres');
    process.exit(1);
  }

  for (const db of [ACCOUNTS_DB, BUSINESSES_DB, SALES_POINTS_DB, DELIVERY_DB]) {
    await ensureDb(db);
  }

  const now = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 365 * 86400000).toISOString();
  const adminPerms = buildAdminPermissions();
  const passwordHash = hashPassword(BAR_PASSWORD);

  const existingAccounts = await findAccountsByEmail(BAR_EMAIL);

  if (RECREATE && existingAccounts.length) {
    for (const acc of existingAccounts) {
      const businesses = await findBusinessesForOwner(acc.user_id);
      for (const b of businesses) {
        await softDeleteDoc(BUSINESSES_DB, b, now);
      }
      await hardDeleteAccount(acc);
    }
  }

  const activeExisting = RECREATE ? null : existingAccounts.find((a) => !a.deletedAt) || null;
  const ownerId = activeExisting?.user_id || uuidv4();
  let business = activeExisting ? (await findBusinessesForOwner(ownerId)).find((b) => !b.deletedAt) || null : null;
  const businessId = business?.business_id || uuidv4();

  const owner = {
    _id: activeExisting?._id || `account:${ownerId}`,
    _rev: activeExisting?._rev,
    type: 'account',
    user_id: ownerId,
    email: BAR_EMAIL,
    firstName: 'Demo',
    lastName: 'Bar',
    fullName: 'Demo Bar',
    phone: '+34600000101',
    avatar: '',
    accountType: 'company',
    role: 'Admin',
    status: 'active',
    inviteStatus: 'accepted',
    invitedBy: '',
    companyName: BUSINESS_NAME,
    onboardingCompleted: true,
    onboardingData: {
      businessType: BUSINESS_TYPE,
      restaurantFormat: RESTAURANT_FORMAT,
      source: 'demo-bar-local-seed',
    },
    provider: 'email',
    permissions: adminPerms,
    employment: {},
    recentActivity: [],
    lastLoginAt: '',
    emailVerified: true,
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
    },
    landingPage: '/saas/dashboard',
    linkedBusinessId: businessId,
    username: '',
    referralCode: '',
    referredByAffiliateId: '',
    passwordHash: activeExisting?.passwordHash || passwordHash,
    createdAt: activeExisting?.createdAt || now,
    updatedAt: now,
    deletedAt: null,
  };

  await couchJson('PUT', `/${ACCOUNTS_DB}/${encodeURIComponent(owner._id)}`, owner);

  if (!business) {
    business = {
      _id: `business:${businessId}`,
      type: 'business',
      business_id: businessId,
      owner_user_id: ownerId,
      group_id: null,
      businessType: BUSINESS_TYPE,
      restaurantFormat: RESTAURANT_FORMAT,
      name: BUSINESS_NAME,
      legalName: BUSINESS_NAME,
      taxId: 'B00000002',
      address: 'Calle Bar Demo 1',
      city: 'Barcelona',
      phone: owner.phone,
      email: owner.email,
      logo: '',
      companyCode: 'BARDEMO',
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
      deletedAt: null,
    };
  } else {
    business = {
      ...business,
      name: BUSINESS_NAME,
      legalName: BUSINESS_NAME,
      businessType: BUSINESS_TYPE,
      restaurantFormat: RESTAURANT_FORMAT,
      owner_user_id: ownerId,
      email: owner.email,
      phone: owner.phone,
      updatedAt: now,
      deletedAt: null,
    };
  }

  await couchJson('PUT', `/${BUSINESSES_DB}/${encodeURIComponent(business._id)}`, business);

  const retail = await ensureRetailForBusiness(ownerId, businessId, now);

  console.log('\n=== Demo Bar local lista ===\n');
  console.log(`Email:              ${BAR_EMAIL}`);
  console.log(`Contraseña:         ${BAR_PASSWORD}`);
  console.log(`Negocio:            ${BUSINESS_NAME}`);
  console.log(`Tipo:               restaurant (${RESTAURANT_FORMAT})`);
  console.log(`business_id:        ${businessId}`);
  console.log(`Bar / tienda:       ${retail.wcId}`);
  console.log(`PDV:                ${retail.pdvId} (código BARDEMO)`);
  console.log('\nEntra en http://localhost:3015 → Empresa → login.');
  console.log('Rutas útiles: /saas/sala · /saas/caja/tpv · Dashboard bar/restaurante.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
