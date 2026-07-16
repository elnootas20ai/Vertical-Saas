import { findAccountByUserId } from '../services/couchdb.js';
import { shouldBlockSubscriptionAccess } from '../shared/billing/subscriptionAccess.js';
import { isVertialSuperAdminEmail } from '../utils/superAdmin.js';
import logger from '../services/logger.js';

/**
 * Prefijos API permitidos con suscripción bloqueada (alta, pago, soporte, setup).
 * El resto de rutas privadas reciben 403.
 */
const SUBSCRIPTION_API_ALLOWLIST = [
  '/api/auth',
  '/api/v2/auth',
  '/api/subscriptions',
  '/api/v2/subscriptions',
  '/api/admin',
  '/api/v2/admin',
  '/api/support',
  '/api/v2/support',
  '/api/monei-connect',
  '/api/businesses',
  '/api/v2/businesses',
  '/api/groups',
  '/api/v2/groups',
  '/api/notifications',
  '/api/v2/notifications',
  '/api/setup-progress',
  '/api/v2/setup-progress',
  '/api/sse',
  '/api/push',
  '/api/v2/push',
  '/api/docs',
  '/api/affiliate',
  '/api/portal',
  '/api/booking',
  '/api/embed',
  '/api/delivery-webhooks',
  '/api/public',
  '/api/sign',
];

function normalizeApiPath(req) {
  return String(req.originalUrl || req.url || '')
    .split('?')[0]
    .replace(/\/+$/, '') || '/';
}

export function isSubscriptionApiAllowlisted(req) {
  const path = normalizeApiPath(req);
  return SUBSCRIPTION_API_ALLOWLIST.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Gate central: si la cuenta empresa no tiene acceso de pago/admin, 403.
 * Debe ir después de requireAuth / requireAuthAndEmailVerified.
 */
export async function requireActiveSubscription(req, res, next) {
  try {
    if (isSubscriptionApiAllowlisted(req)) return next();

    const authUser = req.authUser;
    if (!authUser?.userId) return next();

    if (isVertialSuperAdminEmail(authUser.email)) return next();

    const account = await findAccountByUserId(req, authUser.userId);
    if (!account) return next();

    // Trabajadores: el acceso operativo lo gobierna el dueño / membresía.
    if (account.accountType === 'user' || !account.subscription) return next();

    if (!shouldBlockSubscriptionAccess(account.subscription)) return next();

    return res.status(403).json({
      ok: false,
      error: 'Suscripción requerida. Completa el pago para acceder a Vertial.',
      code: 'SUBSCRIPTION_REQUIRED',
      redirectTo: '/saas/subscription',
    });
  } catch (err) {
    logger.error(
      { err: err?.message, userId: req.authUser?.userId },
      '[License] Error en requireActiveSubscription',
    );
    return next();
  }
}
