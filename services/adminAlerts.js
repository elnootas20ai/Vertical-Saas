import logger from './logger.js';
import { sendEmail } from './email.js';

function getAdminEmail() {
  return (
    process.env.ALERTS_ADMIN_EMAIL ||
    process.env.DEFAULT_CONTACT_EMAIL ||
    process.env.AFFILIATE_EMAIL ||
    ''
  )
    .toString()
    .trim();
}

const lastSentAtByKey = new Map();

export function shouldSendAdminAlert(key, cooldownMs) {
  const now = Date.now();
  const last = lastSentAtByKey.get(key) || 0;
  if (now - last < cooldownMs) return false;
  lastSentAtByKey.set(key, now);
  return true;
}

export async function sendAdminAlert({ key, subject, html, cooldownMs = 30 * 60_000 }) {
  const to = getAdminEmail();
  if (!to) {
    logger.warn({ tag: 'ADMIN_ALERT', key }, 'ADMIN alert omitida: falta ALERTS_ADMIN_EMAIL/DEFAULT_CONTACT_EMAIL');
    return { ok: false, skipped: true, reason: 'no_admin_email' };
  }
  if (!shouldSendAdminAlert(key, cooldownMs)) {
    return { ok: true, skipped: true, reason: 'cooldown' };
  }

  try {
    await sendEmail({ to, subject, html, _skipAdminAlert: true });
    logger.info({ tag: 'ADMIN_ALERT', key, to }, 'ADMIN alert enviada');
    return { ok: true };
  } catch (err) {
    logger.error({ tag: 'ADMIN_ALERT', key, to, err: err?.message }, 'Fallo enviando ADMIN alert');
    return { ok: false, error: err };
  }
}

