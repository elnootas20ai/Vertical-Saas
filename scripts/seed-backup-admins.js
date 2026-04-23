import 'dotenv/config';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

const COUCH_URL = process.env.COUCHDB_URL || 'http://localhost:5984';
const COUCH_USER = process.env.COUCHDB_USER;
const COUCH_PASS = process.env.COUCHDB_PASSWORD;
if (!COUCH_USER || !COUCH_PASS) {
  console.error('❌ Falta COUCHDB_USER o COUCHDB_PASSWORD en .env');
  process.exit(1);
}
const ACCOUNTS_DB = 'accounts';

const AUTH_HEADER = 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next.toISOString();
}

async function couch(method, path, body) {
  const res = await fetch(`${COUCH_URL}${path}`, {
    method,
    headers: {
      Authorization: AUTH_HEADER,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const ADMINS = [
  { email: 'admin2@gmail.com', firstName: 'Admin2', lastName: 'Backup' },
  { email: 'admin3@gmail.com', firstName: 'Admin3', lastName: 'Backup' },
  { email: 'admin4@gmail.com', firstName: 'Admin4', lastName: 'Backup' },
];

const PASSWORD = process.env.ADMIN_SEED_PASSWORD;
if (!PASSWORD) {
  console.error('❌ Falta ADMIN_SEED_PASSWORD en .env');
  process.exit(1);
}

async function main() {
  await couch('PUT', `/${ACCOUNTS_DB}`);

  for (const { email, firstName, lastName } of ADMINS) {
    const existing = await couch('POST', `/${ACCOUNTS_DB}/_find`, {
      selector: { type: 'account', email },
      limit: 1,
    });

    if (existing?.docs?.length > 0) {
      console.log(`⚠️  ${email} ya existe — saltando.`);
      continue;
    }

    const userId = uuidv4();
    const now = new Date().toISOString();

    const doc = {
      _id: `account:${userId}`,
      type: 'account',
      user_id: userId,
      email,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      phone: '',
      avatar: '',
      role: 'Admin',
      status: 'active',
      inviteStatus: 'accepted',
      invitedBy: '',
      companyName: 'UDAR Edge',
      onboardingCompleted: true,
      onboardingData: { source: 'seed' },
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
      password: PASSWORD,
      passwordHash: hashPassword(PASSWORD),
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

    if (result.ok) {
      console.log(`✅ ${email} creado — user_id: ${userId}`);
    } else {
      console.error(`❌ Error creando ${email}:`, result);
    }
  }
}

main().catch(console.error);
