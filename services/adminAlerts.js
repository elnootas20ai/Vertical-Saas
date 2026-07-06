import logger from './logger.js';
import { sendEmail } from './email.js';
import { getAdminInbox } from './adminInbox.js';
import { adminAlertSeverityForKey, wrapAdminAlertHtml } from './adminAlertEmail.js';

/** Infraestructura: no enviar por correo en dev local (evita falsos positivos al reiniciar/backup). */
const OPS_ALERT_KEYS = new Set([
  'spike_5xx',
  'ram_high',
  'disk_low',
  'couchdb_down',
  'couchdb_recovered',
  'email_send_fail',
  'backup_failed',
  'backup_stale',
]);

/**
 * Alertas admin por correo:
 * - Negocio (registro, plan, etc.): siempre activas si hay ALERTS_ADMIN_EMAIL
 * - Infraestructura (RAM, Couch, pico 5xx, backup): solo producción salvo ALERTS_OPS_IN_DEV=true
 * - Apagar todo: ALERTS_ADMIN_ENABLED=false
 */
export function isAdminAlertsEnabled(key = '') {
  const flag = String(process.env.ALERTS_ADMIN_ENABLED ?? '').trim().toLowerCase();
  if (flag === 'false' || flag === '0') return false;

  const baseKey = String(key || '').split(':')[0];
  const isOps = OPS_ALERT_KEYS.has(baseKey);
  const isProd = process.env.NODE_ENV === 'production';

  if (isOps) {
    if (isProd) return true;
    const opsInDev = String(process.env.ALERTS_OPS_IN_DEV ?? '').trim().toLowerCase();
    return opsInDev === 'true' || opsInDev === '1';
  }

  return true;
}

const lastSentAtByKey = new Map();

export function shouldSendAdminAlert(key, cooldownMs) {
  const now = Date.now();
  const last = lastSentAtByKey.get(key) || 0;
  if (now - last < cooldownMs) return false;
  lastSentAtByKey.set(key, now);
  return true;
}

export async function sendAdminAlert({
  key,
  subject,
  html,
  cooldownMs = 30 * 60_000,
  severity,
  skipWrap = false,
}) {
  if (!isAdminAlertsEnabled(key)) {
    return { ok: true, skipped: true, reason: 'disabled_env' };
  }

  const to = getAdminInbox();
  if (!to) {
    logger.warn({ tag: 'ADMIN_ALERT', key }, 'ADMIN alert omitida: falta ALERTS_ADMIN_EMAIL');
    return { ok: false, skipped: true, reason: 'no_admin_email' };
  }
  if (!shouldSendAdminAlert(key, cooldownMs)) {
    return { ok: true, skipped: true, reason: 'cooldown' };
  }

  const envTag = process.env.NODE_ENV === 'production' ? '' : `[${process.env.NODE_ENV || 'dev'}] `;
  const taggedSubject =
    process.env.NODE_ENV === 'production' || subject.startsWith('[')
      ? subject
      : `${envTag}${subject}`;

  const resolvedSeverity = severity || adminAlertSeverityForKey(key);
  const outboundHtml = skipWrap ? html : wrapAdminAlertHtml(taggedSubject, html, resolvedSeverity);

  try {
    await sendEmail({ to, subject: taggedSubject, html: outboundHtml, _skipAdminAlert: true });
    logger.info({ tag: 'ADMIN_ALERT', key, to, env: process.env.NODE_ENV || 'development' }, 'ADMIN alert enviada');
    return { ok: true };
  } catch (err) {
    logger.error({ tag: 'ADMIN_ALERT', key, to, err: err?.message }, 'Fallo enviando ADMIN alert');
    return { ok: false, error: err };
  }
}
