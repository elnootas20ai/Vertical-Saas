/**
 * Evita que scripts (smoke/diag/deploy) disparen el OTP del admin.
 *
 * Login con contraseña correcta en uriel@admin.com → envía código a Gmail
 * (también si el backend local usa SMTP real).
 *
 * Opt-in explícito: SMOKE_ALLOW_ADMIN_OTP_LOGIN=1
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
      `Bloqueado: login script de admin (${em}) contra ${base} dispararía el correo OTP. ` +
      `Usa otra cuenta de prueba o ${allowEnv}=1 solo a propósito.`,
  };
}
