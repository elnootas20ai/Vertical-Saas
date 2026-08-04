/**
 * Alertas admin de negocio (trial, pago, invites) — siempre activas si hay ALERTS_ADMIN_EMAIL.
 */
import { sendAdminAlert } from './adminAlerts.js';
import { escapeAdminHtml } from './adminAlertEmail.js';

function accountBits(account = {}) {
  const email = String(account.email || '').trim();
  const name = String(account.fullName || account.firstName || '').trim();
  const company = String(account.companyName || '').trim();
  const userId = String(account.user_id || '').trim();
  const plan = String(account.subscription?.planName || account.subscription?.selectedPlanId || '').trim();
  return { email, name, company, userId, plan };
}

function accountListHtml(account) {
  const a = accountBits(account);
  return `<ul>
  <li><b>Empresa</b>: ${escapeAdminHtml(a.company || '—')}</li>
  <li><b>Usuario</b>: ${escapeAdminHtml(a.name || '—')}</li>
  <li><b>Email</b>: ${escapeAdminHtml(a.email || '—')}</li>
  <li><b>Plan</b>: ${escapeAdminHtml(a.plan || '—')}</li>
  <li><b>User ID</b>: ${escapeAdminHtml(a.userId || '—')}</li>
</ul>`;
}

export function notifyInviteEmailFailed({
  toEmail,
  companyName = '',
  invitedBy = '',
  errorMessage = '',
  resend = false,
}) {
  const label = String(toEmail || 'sin-email').trim().toLowerCase();
  return sendAdminAlert({
    key: `invite_email_fail:${label}`,
    subject: resend
      ? `✉️ Fallo reenviando invitación: ${label}`
      : `✉️ Fallo enviando invitación: ${label}`,
    html: `<p><b>La invitación se creó pero el correo no se envió.</b></p>
<ul>
  <li><b>Destinatario</b>: ${escapeAdminHtml(label)}</li>
  <li><b>Empresa</b>: ${escapeAdminHtml(companyName || '—')}</li>
  <li><b>Invitado por</b>: ${escapeAdminHtml(invitedBy || '—')}</li>
  <li><b>Error</b>: ${escapeAdminHtml(errorMessage || 'desconocido')}</li>
</ul>
<p>Reenvía desde Equipo o revisa SMTP (noreply).</p>`,
    cooldownMs: 2 * 60_000,
    severity: 'warning',
  }).catch(() => null);
}

export function notifyTrialExpiring(account, daysLeft) {
  const a = accountBits(account);
  const days = Math.max(0, Math.ceil(Number(daysLeft) || 0));
  return sendAdminAlert({
    key: `trial_expiring:${a.userId || a.email}`,
    subject: `⏳ Trial por acabar (${days}d): ${a.company || a.email}`,
    html: `<p><b>Trial a punto de acabar</b> · ${days} día${days === 1 ? '' : 's'} restantes.</p>
${accountListHtml(account)}
<p>Fin trial: ${escapeAdminHtml(account.subscription?.trialEndsAt || '—')}</p>`,
    cooldownMs: 20 * 60 * 60_000,
    severity: 'warning',
  }).catch(() => null);
}

export function notifyTrialExpired(account) {
  const a = accountBits(account);
  return sendAdminAlert({
    key: `trial_expired:${a.userId || a.email}`,
    subject: `⏰ Trial acabado sin pago: ${a.company || a.email}`,
    html: `<p><b>Trial expirado</b> — aún no hay suscripción activa.</p>
${accountListHtml(account)}
<p>Fin trial: ${escapeAdminHtml(account.subscription?.trialEndsAt || '—')}</p>`,
    cooldownMs: 20 * 60 * 60_000,
    severity: 'warning',
  }).catch(() => null);
}

export function notifyPaymentFailed(account, { source = 'webhook' } = {}) {
  const a = accountBits(account);
  return sendAdminAlert({
    key: `payment_failed:${a.userId || a.email}`,
    subject: `💳 Pago fallido: ${a.company || a.email}`,
    html: `<p><b>Pago / cobro fallido</b> (${escapeAdminHtml(source)}).</p>
${accountListHtml(account)}
<p>Estado: ${escapeAdminHtml(account.subscription?.status || 'payment_failed')}</p>`,
    cooldownMs: 30 * 60_000,
    severity: 'critical',
  }).catch(() => null);
}

export function notifySubscriptionSuspended(account, { source = 'webhook' } = {}) {
  const a = accountBits(account);
  return sendAdminAlert({
    key: `subscription_suspended:${a.userId || a.email}`,
    subject: `🚫 Suscripción suspendida/cancelada: ${a.company || a.email}`,
    html: `<p><b>Cuenta suspendida o cancelada</b> (${escapeAdminHtml(source)}).</p>
${accountListHtml(account)}`,
    cooldownMs: 30 * 60_000,
    severity: 'critical',
  }).catch(() => null);
}
