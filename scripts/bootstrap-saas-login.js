/**
 * Crea o actualiza la cuenta con la que **entras al SaaS** (email + contraseña del login).
 * El superadmin del front (SUPERADMIN_EMAIL en SaasRoot) debe ser el mismo email si quieres ese rol.
 * Los datos están en la base CouchDB `accounts` (no uses la interfaz web de Couch para esto).
 *
 * Requiere en .env la conexión HTTP al servidor CouchDB (las mismas vars que el backend):
 *   COUCHDB_URL, COUCHDB_USER, COUCHDB_PASSWORD
 * Y el usuario de la aplicación:
 *   SAAS_LOGIN_EMAIL, SAAS_LOGIN_PASSWORD
 *
 * Uso: node scripts/bootstrap-saas-login.js
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

const ACCOUNTS_DB = 'accounts';

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

const COUCH_USER = process.env.COUCHDB_USER;
const COUCH_PASS = process.env.COUCHDB_PASSWORD;
const BASE = couchBaseUrl();

const LOGIN_EMAIL = String(process.env.SAAS_LOGIN_EMAIL || '').trim().toLowerCase();
const LOGIN_PASSWORD = String(process.env.SAAS_LOGIN_PASSWORD || '').trim();
const FIRST_NAME = String(process.env.SAAS_LOGIN_FIRST_NAME || 'Usuario').trim();
const LAST_NAME = String(process.env.SAAS_LOGIN_LAST_NAME || '').trim();
const COMPANY = String(process.env.SAAS_LOGIN_COMPANY || 'Mi empresa').trim();

if (!BASE) {
  console.error('❌ Falta COUCHDB_URL');
  process.exit(1);
}
if (!COUCH_USER || !COUCH_PASS) {
  console.error('❌ Falta COUCHDB_USER o COUCHDB_PASSWORD');
  process.exit(1);
}
if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
  console.error('❌ Falta SAAS_LOGIN_EMAIL o SAAS_LOGIN_PASSWORD');
  process.exit(1);
}
if (LOGIN_PASSWORD.length < 8) {
  console.error('❌ SAAS_LOGIN_PASSWORD debe tener al menos 8 caracteres');
  process.exit(1);
}

const AUTH_HEADER = `Basic ${Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64')}`;

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

async function couchJson(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: AUTH_HEADER,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function main() {
  await couchJson('PUT', `/${ACCOUNTS_DB}`);

  const found = await couchJson('POST', `/${ACCOUNTS_DB}/_find`, {
    selector: { type: 'account', email: LOGIN_EMAIL },
    limit: 1,
  });

  const now = new Date().toISOString();
  const newHash = hashPassword(LOGIN_PASSWORD);

  if (found?.docs?.length > 0) {
    const prev = found.docs[0];
    const updated = {
      ...prev,
      password: LOGIN_PASSWORD,
      passwordHash: newHash,
      failedLoginAttempts: 0,
      lockUntil: null,
      updatedAt: now,
      status: prev.status || 'active',
    };
    const result = await couchJson('PUT', `/${ACCOUNTS_DB}/${encodeURIComponent(prev._id)}`, updated);
    if (!result?.ok) {
      console.error('❌ No se pudo actualizar la cuenta:', result);
      process.exit(1);
    }
    console.log('✅ Contraseña de acceso a la app actualizada.');
    console.log(`   Email: ${LOGIN_EMAIL}`);
    console.log('   Entra en el SaaS con ese email y SAAS_LOGIN_PASSWORD del .env.');
    return;
  }

  const userId = uuidv4();
  const doc = {
    _id: `account:${userId}`,
    type: 'account',
    user_id: userId,
    email: LOGIN_EMAIL,
    firstName: FIRST_NAME,
    lastName: LAST_NAME,
    fullName: `${FIRST_NAME} ${LAST_NAME}`.trim(),
    phone: '',
    avatar: '',
    accountType: 'company',
    role: 'Admin',
    status: 'active',
    inviteStatus: 'accepted',
    invitedBy: '',
    companyName: COMPANY,
    onboardingCompleted: true,
    onboardingData: { source: 'bootstrap-saas-login' },
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
    password: LOGIN_PASSWORD,
    passwordHash: newHash,
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

  const result = await couchJson('PUT', `/${ACCOUNTS_DB}/account:${userId}`, doc);
  if (!result?.ok) {
    console.error('❌ No se pudo crear la cuenta:', result);
    process.exit(1);
  }

  console.log('✅ Cuenta de acceso a la app creada.');
  console.log(`   Email: ${LOGIN_EMAIL}`);
  console.log('   Usa ese email y la contraseña de SAAS_LOGIN_PASSWORD para iniciar sesión.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
