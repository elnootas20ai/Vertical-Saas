/**
 * Evita que scripts (smoke/diag/deploy) disparen el OTP del admin.
 *
 * uriel@admin.com = login manual (cuando algo falla y entras tú).
 * Nunca se usa en deploy/smoke salvo SMOKE_ALLOW_ADMIN_OTP_LOGIN=1.
 *
 * Smoke de deploy: SMOKE_SAAS_EMAIL / SMOKE_SAAS_PASSWORD (cuenta de prueba).
 * SAAS_LOGIN_* con email no-admin también vale; si es admin → se ignora.
 */
import { isVertialSuperAdminEmail } from '../../utils/superAdmin.js';

export function isLocalApiBase(base) {
  const u = String(base || '').trim().toLowerCase();
  if (!u) return true;
  try {
    const host = new URL(u.includes('://') ? u : `http://${u}`).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
  } catch {
    return /localhost|127\.0\.0\.1/.test(u);
  }
}

/**
 * Credenciales seguras para smoke/deploy (nunca admin por defecto).
 * @returns {{ email: string, password: string, source: string } | null}
 */
export function resolveSmokeSaasCredentials(env = process.env) {
  const allowAdmin = String(env.SMOKE_ALLOW_ADMIN_OTP_LOGIN || '').trim() === '1';

  const smokeEmail = String(env.SMOKE_SAAS_EMAIL || env.SMOKE_EMAIL || '').trim().toLowerCase();
  const smokePass = String(env.SMOKE_SAAS_PASSWORD || env.SMOKE_PASSWORD || '').trim();
  if (smokeEmail && smokePass) {
    if (isVertialSuperAdminEmail(smokeEmail) && !allowAdmin) {
      return null;
    }
    return { email: smokeEmail, password: smokePass, source: 'SMOKE_SAAS_*' };
  }

  const loginEmail = String(env.SAAS_LOGIN_EMAIL || '').trim().toLowerCase();
  const loginPass = String(env.SAAS_LOGIN_PASSWORD || '').trim();
  if (!loginEmail || !loginPass) return null;

  // Admin SaaS: solo login manual / bootstrap — no smoke de deploy.
  if (isVertialSuperAdminEmail(loginEmail) && !allowAdmin) {
    return null;
  }

  return {
    email: loginEmail,
    password: loginPass,
    source: allowAdmin && isVertialSuperAdminEmail(loginEmail)
      ? 'SAAS_LOGIN_* (admin opt-in)'
      : 'SAAS_LOGIN_*',
  };
}

/**
 * @returns {{ blocked: false } | { blocked: true, reason: string }}
 */
export function assertSafeSaasLogin({ apiBase, email, allowEnv = 'SMOKE_ALLOW_ADMIN_OTP_LOGIN' } = {}) {
  const em = String(email || '').trim().toLowerCase();
  const base = String(apiBase || '').trim() || '(sin base)';
  const allowed = String(process.env[allowEnv] || '').trim() === '1';

  if (!em || !isVertialSuperAdminEmail(em)) {
    return { blocked: false };
  }
  if (allowed) {
    return { blocked: false };
  }

  return {
    blocked: true,
    reason:
      `Omitido: ${em} es solo login manual (OTP Gmail), no smoke/deploy. ` +
      `Usa SMOKE_SAAS_EMAIL/PASSWORD de prueba o ${allowEnv}=1 solo a propósito. API=${base}`,
  };
}
