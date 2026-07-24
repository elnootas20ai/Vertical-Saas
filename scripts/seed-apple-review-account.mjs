/**
 * Cuenta demo para revisores Apple (TestFlight / App Store).
 * Acceso SaaS con plan Pro activo — vertical delivery.
 *
 * Uso (producción, vía VPS):
 *   node scripts/remote-seed-apple-review-account.mjs
 *
 * Local / SSH en el VPS:
 *   NODE_ENV=production node scripts/seed-apple-review-account.mjs
 *
 * Opcional:
 *   APPLE_REVIEW_EMAIL=... APPLE_REVIEW_PASSWORD=... (mín. 8 caracteres)
 *   APPLE_REVIEW_RECREATE=1  → soft-delete cuenta/negocios previos del email y crea una nueva
 */
import '../config/env.js';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

const ACCOUNTS_DB = 'accounts';
const BUSINESSES_DB = 'businesses';
const SALES_POINTS_DB = 'bbddsaas-sales-points';
const DELIVERY_DB = 'bbddsaas-delivery';

const REVIEW_EMAIL = String(process.env.APPLE_REVIEW_EMAIL || 'apple-review@vertialapp.com')
  .trim()
  .toLowerCase();
const REVIEW_PASSWORD = String(process.env.APPLE_REVIEW_PASSWORD || 'VertialApple2026!').trim();
const BUSINESS_NAME = 'Vertial Demo Delivery';
const BUSINESS_TYPE = 'delivery';
const RECREATE = String(process.env.APPLE_REVIEW_RECREATE || '1').trim() !== '0';

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

async function main() {
  if (!BASE || !AUTH) {
    console.error('Faltan COUCHDB_URL, COUCHDB_USER o COUCHDB_PASSWORD');
    process.exit(1);
  }
  if (!REVIEW_EMAIL || REVIEW_PASSWORD.length < 8) {
    console.error('Email vacío o contraseña < 8 caracteres');
    process.exit(1);
  }

  for (const db of [ACCOUNTS_DB, BUSINESSES_DB, SALES_POINTS_DB, DELIVERY_DB]) {
    await ensureDb(db);
  }

  const now = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 365 * 86400000).toISOString();
  const adminPerms = buildAdminPermissions();
  const passwordHash = hashPassword(REVIEW_PASSWORD);

  const existingAccounts = await findAccountsByEmail(REVIEW_EMAIL);
  const activeExisting = existingAccounts.find((a) => !a.deletedAt) || null;

  if (RECREATE && existingAccounts.length) {
    console.log(`\n[recreate] Soft-delete de ${existingAccounts.length} cuenta(s) previas (${REVIEW_EMAIL})…`);
    for (const acc of existingAccounts) {
      if (acc.deletedAt) continue;
      const businesses = await findBusinessesForOwner(acc.user_id);
      for (const b of businesses) {
        await softDeleteDoc(BUSINESSES_DB, b, now);
      }
      await softDeleteDoc(ACCOUNTS_DB, acc, now);
    }
  }

  const reuse = !RECREATE && activeExisting ? activeExisting : null;
  const ownerId = reuse?.user_id || uuidv4();
  let business = reuse ? (await findBusinessesForOwner(ownerId)).find((b) => !b.deletedAt) || null : null;
  const businessId = business?.business_id || uuidv4();

  const owner = {
    _id: reuse?._id || `account:${ownerId}`,
    _rev: reuse?._rev,
    type: 'account',
    user_id: ownerId,
    email: REVIEW_EMAIL,
    firstName: 'Apple',
    lastName: 'Reviewer',
    fullName: 'Apple Reviewer',
    phone: '+34600000000',
    avatar: '',
    accountType: 'company',
    role: 'Admin',
    status: 'active',
    inviteStatus: 'accepted',
    invitedBy: '',
    companyName: BUSINESS_NAME,
    onboardingCompleted: true,
    onboardingData: { businessType: BUSINESS_TYPE, source: 'apple-review-seed' },
    provider: 'email',
    permissions: adminPerms,
    employment: {},
    recentActivity: [],
    lastLoginAt: '',
    emailVerified: true,
    failedLoginAttempts: 0,
    lockUntil: null,
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
      taxId: 'B00000000',
      address: 'Calle Demo Delivery 1',
      city: 'Madrid',
      phone: owner.phone,
      email: owner.email,
      logo: '',
      companyCode: 'APPLE01',
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
      address: business.address || 'Calle Demo Delivery 1',
      members: [member],
      updatedAt: now,
      deletedAt: null,
    };
  }

  await couchJson('PUT', `/${BUSINESSES_DB}/${encodeURIComponent(business._id)}`, business);

  // Tienda + PDV mínimos para que delivery no salga “sin tienda”
  const wcId = `wc-apple-review-${businessId.slice(0, 8)}`;
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
    name: 'Demo Delivery Tienda',
    centerType: 'punto_de_venta',
    ownership: 'propiedad',
    address: 'Calle Demo Delivery 1',
    city: 'Madrid',
    active: true,
    expectedStaffCount: 2,
    createdAt: existingWc?.createdAt || now,
    updatedAt: now,
    deletedAt: null,
  };
  await couchJson('PUT', `/${SALES_POINTS_DB}/${encodeURIComponent(wcId)}`, wcDoc);

  const pdvId = `pdv-apple-review-${businessId.slice(0, 8)}`;
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
    name: 'Demo Delivery PDV',
    code: 'APPLEPDV',
    active: true,
    address: 'Calle Demo Delivery 1',
    city: 'Madrid',
    terminals: [
      {
        id: `term-apple-${businessId.slice(0, 8)}`,
        name: 'Tablet Review',
        active: true,
      },
    ],
    createdAt: existingPdv?.createdAt || now,
    updatedAt: now,
    deletedAt: null,
  };
  await couchJson('PUT', `/${DELIVERY_DB}/${encodeURIComponent(pdvId)}`, pdvDoc);

  // ── Afiliado demo (opcional) ───────────────────────────────────────────────
  const AFFILIATES_DB = 'affiliates';
  await ensureDb(AFFILIATES_DB);

  const AFFILIATE_CODE = String(process.env.APPLE_REVIEW_AFFILIATE_CODE || 'APPLEAFF').trim().toUpperCase();
  const REFERRAL_CODE = String(process.env.APPLE_REVIEW_REFERRAL_CODE || 'REFAPPLE').trim().toUpperCase();
  const AFFILIATE_EMAIL = String(process.env.APPLE_REVIEW_AFFILIATE_EMAIL || 'apple-affiliate@vertialapp.com')
    .trim()
    .toLowerCase();

  const existingAffByCode = await couchJson('POST', `/${AFFILIATES_DB}/_find`, {
    selector: { type: 'affiliate', affiliateCode: AFFILIATE_CODE },
    limit: 1,
  }).then((d) => d?.docs?.[0] || null).catch(() => null);

  const existingAffByEmail = existingAffByCode
    ? null
    : await couchJson('POST', `/${AFFILIATES_DB}/_find`, {
        selector: { type: 'affiliate', email: AFFILIATE_EMAIL },
        limit: 1,
      }).then((d) => d?.docs?.[0] || null).catch(() => null);

  const existingAff = existingAffByCode || existingAffByEmail;
  const affiliateId = existingAff?._id || `affiliate:apple-review:${AFFILIATE_CODE.toLowerCase()}`;

  const affiliateDoc = {
    _id: affiliateId,
    _rev: existingAff?._rev,
    type: 'affiliate',
    user_id: ownerId,
    name: 'Apple Affiliate Reviewer',
    email: AFFILIATE_EMAIL,
    phone: '+34600000001',
    whatsapp: '+34600000001',
    company: 'Vertial Demo Partners',
    website: 'https://vertialapp.com',
    verticals: ['delivery'],
    affiliateCode: AFFILIATE_CODE,
    referralCode: REFERRAL_CODE,
    commissionRate: 20,
    status: 'accepted',
    notes: 'Cuenta demo App Store Review',
    message: 'apple-review-seed',
    linkedAccountUserId: ownerId,
    portalAccessMode: 'code',
    accountLinked: true,
    createdAt: existingAff?.createdAt || now,
    updatedAt: now,
  };

  await couchJson('PUT', `/${AFFILIATES_DB}/${encodeURIComponent(affiliateDoc._id)}`, affiliateDoc);

  console.log('\n=== Cuenta Apple Review lista (delivery) ===\n');
  console.log('— Empresa —');
  console.log(`Email:       ${REVIEW_EMAIL}`);
  console.log(`Contraseña:  ${REVIEW_PASSWORD}`);
  console.log(`Plan:        Pro (subscription_active)`);
  console.log(`Vertical:    delivery → Entry → Empresa → login → dashboard`);
  console.log(`business_id: ${businessId}`);
  console.log(`user_id:     ${ownerId}`);
  console.log(`wc:          ${wcId}`);
  console.log(`pdv:         ${pdvId}`);
  console.log(`rev cuenta:  ${savedOwner.rev}`);
  console.log('\n— Afiliado —');
  console.log(`Código:      ${AFFILIATE_CODE}`);
  console.log(`Email (info): ${AFFILIATE_EMAIL}`);
  console.log(`Path:        Entry → Afiliado → Iniciar sesión → código ${AFFILIATE_CODE}`);
  console.log('\nPega esto en App Store Connect → App Review Information / Notes.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
