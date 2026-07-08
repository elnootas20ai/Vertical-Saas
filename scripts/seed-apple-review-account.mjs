/**
 * Cuenta demo para revisores Apple (TestFlight / App Store).
 * Acceso completo al dashboard SaaS con plan Pro activo.
 *
 * Uso (producción):
 *   NODE_ENV=production node scripts/seed-apple-review-account.mjs
 *
 * Opcional:
 *   APPLE_REVIEW_EMAIL=... APPLE_REVIEW_PASSWORD=... (mín. 8 caracteres)
 */
import '../config/env.js';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

const ACCOUNTS_DB = 'accounts';
const BUSINESSES_DB = 'businesses';

const REVIEW_EMAIL = String(process.env.APPLE_REVIEW_EMAIL || 'apple-review@vertialapp.com')
  .trim()
  .toLowerCase();
const REVIEW_PASSWORD = String(process.env.APPLE_REVIEW_PASSWORD || 'VertialApple2026!').trim();
const BUSINESS_NAME = 'Vertial Demo Restaurante';

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

function buildAdminPermissions() {
  return Object.fromEntries(TEAM_PERMISSION_KEYS.map((k) => [k, { view: true, edit: true }]));
}

async function findAccountByEmail(email) {
  const data = await couchJson('POST', `/${ACCOUNTS_DB}/_find`, {
    selector: { type: 'account', email },
    limit: 1,
  });
  return data?.docs?.[0] || null;
}

async function findBusinessForOwner(ownerId) {
  const data = await couchJson('POST', `/${BUSINESSES_DB}/_find`, {
    selector: { type: 'business', owner_user_id: ownerId },
    limit: 1,
  });
  return data?.docs?.[0] || null;
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

  for (const db of [ACCOUNTS_DB, BUSINESSES_DB]) {
    try {
      await couchJson('PUT', `/${db}`);
    } catch (e) {
      if (!/already exists|file_exists/i.test(String(e.message))) throw e;
    }
  }

  const now = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 365 * 86400000).toISOString();
  const adminPerms = buildAdminPermissions();
  const passwordHash = hashPassword(REVIEW_PASSWORD);

  const existing = await findAccountByEmail(REVIEW_EMAIL);
  const ownerId = existing?.user_id || uuidv4();
  let business = existing ? await findBusinessForOwner(ownerId) : null;
  const businessId = business?.business_id || uuidv4();

  const owner = {
    _id: existing?._id || `account:${ownerId}`,
    _rev: existing?._rev,
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
    onboardingData: { businessType: 'restaurant', source: 'apple-review-seed' },
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
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const savedOwner = await couchJson('PUT', `/${ACCOUNTS_DB}/${encodeURIComponent(owner._id)}`, owner);

  if (!business) {
    business = {
      _id: `business:${businessId}`,
      type: 'business',
      business_id: businessId,
      owner_user_id: ownerId,
      group_id: null,
      businessType: 'restaurant',
      name: BUSINESS_NAME,
      legalName: BUSINESS_NAME,
      taxId: 'B00000000',
      address: 'Calle Demo 1',
      city: 'Madrid',
      phone: owner.phone,
      email: owner.email,
      logo: '',
      companyCode: 'APPLE01',
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
  } else {
    business = {
      ...business,
      name: BUSINESS_NAME,
      legalName: BUSINESS_NAME,
      businessType: 'restaurant',
      owner_user_id: ownerId,
      email: owner.email,
      phone: owner.phone,
      members: [
        {
          user_id: ownerId,
          fullName: owner.fullName,
          email: owner.email,
          role: 'Admin',
          branch_id: null,
          permissions: adminPerms,
          joinedAt: business.members?.[0]?.joinedAt || now,
        },
      ],
      updatedAt: now,
    };
  }

  await couchJson('PUT', `/${BUSINESSES_DB}/${encodeURIComponent(business._id)}`, business);

  console.log('\n=== Cuenta Apple Review lista ===\n');
  console.log(`Email:       ${REVIEW_EMAIL}`);
  console.log(`Contraseña:  ${REVIEW_PASSWORD}`);
  console.log(`Plan:        Pro (subscription_active)`);
  console.log(`Vertical:    restaurant → /saas/dashboard`);
  console.log(`business_id: ${businessId}`);
  console.log(`user_id:     ${ownerId}`);
  console.log(`rev cuenta:  ${savedOwner.rev}`);
  console.log('\nPega email + contraseña en TestFlight → Notas para la revisión.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
