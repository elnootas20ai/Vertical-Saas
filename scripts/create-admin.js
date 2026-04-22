import 'dotenv/config';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

const COUCH_URL = process.env.COUCHDB_URL || process.env.VITE_COUCHDB_URL || 'http://localhost:5984';
const COUCH_USER = process.env.COUCHDB_USER || process.env.VITE_COUCHDB_USER;
const COUCH_PASS = process.env.COUCHDB_PASSWORD || process.env.VITE_COUCHDB_PASSWORD;

if (!COUCH_USER || !COUCH_PASS) {
  console.error('Missing COUCHDB_USER/COUCHDB_PASSWORD (or VITE_COUCHDB_USER/VITE_COUCHDB_PASSWORD)');
  process.exit(1);
}

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '').trim();
const ADMIN_FIRST_NAME = String(process.env.ADMIN_FIRST_NAME || 'Admin').trim();
const ADMIN_LAST_NAME = String(process.env.ADMIN_LAST_NAME || 'Udar').trim();
const ADMIN_COMPANY = String(process.env.ADMIN_COMPANY || 'UDAR Edge').trim();
const ACCOUNTS_DB = 'accounts';

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing ADMIN_EMAIL or ADMIN_PASSWORD');
  process.exit(1);
}

if (ADMIN_PASSWORD.length < 8) {
  console.error('ADMIN_PASSWORD must be at least 8 characters');
  process.exit(1);
}

const AUTH_HEADER = 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function addDays(dateIso, amount) {
  const date = new Date(dateIso);
  date.setDate(date.getDate() + amount);
  return date.toISOString();
}

async function couch(method, path, body) {
  const response = await fetch(`${COUCH_URL}${path}`, {
    method,
    headers: {
      Authorization: AUTH_HEADER,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

async function main() {
  await couch('PUT', `/${ACCOUNTS_DB}`);

  const existing = await couch('POST', `/${ACCOUNTS_DB}/_find`, {
    selector: { type: 'account', email: ADMIN_EMAIL },
    limit: 1,
  });

  if (existing?.docs?.length > 0) {
    console.error(`Account already exists for ${ADMIN_EMAIL}`);
    process.exit(1);
  }

  const userId = uuidv4();
  const now = new Date().toISOString();

  const doc = {
    _id: `account:${userId}`,
    type: 'account',
    user_id: userId,
    email: ADMIN_EMAIL,
    firstName: ADMIN_FIRST_NAME,
    lastName: ADMIN_LAST_NAME,
    fullName: `${ADMIN_FIRST_NAME} ${ADMIN_LAST_NAME}`.trim(),
    phone: '',
    avatar: '',
    accountType: 'company',
    role: 'Admin',
    status: 'active',
    inviteStatus: 'accepted',
    invitedBy: '',
    companyName: ADMIN_COMPANY,
    onboardingCompleted: true,
    onboardingData: { source: 'create-admin-script' },
    provider: 'email',
    permissions: {
      vehicles: { read: true, write: true, delete: true },
      clients: { read: true, write: true, delete: true },
      sales: { read: true, write: true, delete: true },
      documents: { read: true, write: true, delete: true },
      finance: { read: true, write: true, delete: true },
      ancove: { read: true, write: true, delete: true },
      team: { read: true, write: true, delete: true },
    },
    employment: {},
    recentActivity: [],
    lastLoginAt: '',
    emailVerified: true,
    password: ADMIN_PASSWORD,
    passwordHash: hashPassword(ADMIN_PASSWORD),
    paymentSummary: null,
    subscription: {
      status: 'trial_active',
      planName: 'Basic',
      selectedPlanId: 'basic',
      trialEndsAt: addDays(now, 365),
      currentPeriodStart: now,
      currentPeriodEnd: addDays(now, 365),
      gracePeriodEndsAt: addDays(now, 365),
      lastPaymentAt: '',
      cancelAtPeriodEnd: false,
    },
    createdAt: now,
    updatedAt: now,
  };

  const result = await couch('PUT', `/${ACCOUNTS_DB}/account:${userId}`, doc);

  if (!result?.ok) {
    console.error('Failed creating admin:', result);
    process.exit(1);
  }

  console.log('Admin created successfully');
  console.log(`email: ${ADMIN_EMAIL}`);
  console.log(`user_id: ${userId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
