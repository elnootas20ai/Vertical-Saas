/**
 * Cuenta admin del SaaS sin pasar por el registro web: documento en BD `accounts`.
 * SAAS_AUTO_BOOTSTRAP=true → al arrancar: crea la cuenta si no existe.
 * Si ya existe: solo actualiza contraseña si SAAS_BOOTSTRAP_FORCE_SYNC=true (una vez y quítalo).
 *
 * Panel /saas/admin: usuario con role Admin (esta cuenta lleva role Admin).
 */
import { v4 as uuidv4 } from 'uuid';
import logger from './logger.js';
import {
  ACCOUNTS_DB,
  ensureDatabase,
  findAccountByEmail,
  saveAccount,
  hashPassword,
  normalizeEmail,
} from './couchdb.js';

const INIT_REQ = null;

function truthy(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function addDays(dateIso, amount) {
  const date = new Date(dateIso);
  date.setDate(date.getDate() + amount);
  return date.toISOString();
}

export async function runSaasBootstrapIfEnabled() {
  if (!truthy(process.env.SAAS_AUTO_BOOTSTRAP)) return;

  const forceSync = truthy(process.env.SAAS_BOOTSTRAP_FORCE_SYNC);

  const email = normalizeEmail(process.env.SAAS_LOGIN_EMAIL || '');
  const password = String(process.env.SAAS_LOGIN_PASSWORD || '').trim();
  const firstName = String(process.env.SAAS_LOGIN_FIRST_NAME || 'Admin').trim();
  const lastName = String(process.env.SAAS_LOGIN_LAST_NAME || '').trim();
  const company = String(process.env.SAAS_LOGIN_COMPANY || 'Vertial').trim();

  if (!email || !password) {
    logger.warn(
      { tag: 'SAAS_BOOTSTRAP' },
      'SAAS_AUTO_BOOTSTRAP activo: definen SAAS_LOGIN_EMAIL y SAAS_LOGIN_PASSWORD',
    );
    return;
  }
  if (password.length < 8) {
    logger.warn({ tag: 'SAAS_BOOTSTRAP' }, 'SAAS_LOGIN_PASSWORD debe tener al menos 8 caracteres');
    return;
  }

  try {
    await ensureDatabase(INIT_REQ, ACCOUNTS_DB);
    const existing = await findAccountByEmail(INIT_REQ, email);
    const now = new Date().toISOString();
    const passHash = hashPassword(password);

    if (existing) {
      if (!forceSync) {
        logger.info({ tag: 'SAAS_BOOTSTRAP', email }, 'Cuenta ya existe; sin cambios (usa SAAS_BOOTSTRAP_FORCE_SYNC=true una vez para fijar clave desde env)');
        return;
      }
      await saveAccount(INIT_REQ, {
        ...existing,
        password,
        passwordHash: passHash,
        failedLoginAttempts: 0,
        lockUntil: null,
        updatedAt: now,
        role: existing.role || 'Admin',
        status: existing.status || 'active',
      });
      logger.info({ tag: 'SAAS_BOOTSTRAP', email }, 'Contraseña sincronizada desde env (FORCE_SYNC)');
      return;
    }

    const userId = uuidv4();
    const doc = {
      _id: `account:${userId}`,
      type: 'account',
      user_id: userId,
      email,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
      phone: '',
      avatar: '',
      accountType: 'company',
      role: 'Admin',
      status: 'active',
      inviteStatus: 'accepted',
      invitedBy: '',
      companyName: company,
      onboardingCompleted: true,
      onboardingData: { source: 'saas-auto-bootstrap' },
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
      password,
      passwordHash: passHash,
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

    await saveAccount(INIT_REQ, doc);
    logger.info({ tag: 'SAAS_BOOTSTRAP', email }, 'Cuenta admin SaaS creada (sin registro web)');
  } catch (err) {
    logger.error(
      { tag: 'SAAS_BOOTSTRAP', err: err instanceof Error ? err.message : String(err) },
      'No se pudo crear/sincronizar cuenta SaaS (revisa COUCHDB_* y credenciales Couch)',
    );
  }
}
