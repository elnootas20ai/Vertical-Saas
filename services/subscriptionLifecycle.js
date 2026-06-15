import {
  saveAccount,
  getAllDocuments,
  ACCOUNTS_DB,
} from './couchdb.js';
import {
  sendEmail,
  buildWelcomeTrialEmail,
  buildTrialExpiringEmail,
  buildTrialExpiredEmail,
  buildPaymentFailedEmail,
  buildGracePeriodEmail,
  buildSuspensionEmail,
  buildPaymentSuccessEmail,
} from './email.js';
import logger from './logger.js';

const TRIAL_DAYS = 14;
const GRACE_HOURS = 72;
const APP_URL = (process.env.APP_URL || 'http://localhost:3005').replace(/\/+$/, '');
const BILLING_URL = `${APP_URL}/saas/settings/facturacion`;

/**
 * SUBSCRIPTION_LIFECYCLE_EMAILS=false → no envía trial/gracia/suspensión/etc. (evita rebotes en staging).
 * Por defecto: activo.
 */
function subscriptionLifecycleOutboundEnabled() {
  const v = String(process.env.SUBSCRIPTION_LIFECYCLE_EMAILS ?? 'true').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no';
}

/** Dominios que no reciben correo real en Internet (.local, localhost). */
function isDeliverableSubscriptionEmail(email) {
  const e = String(email ?? '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return false;
  const domain = e.slice(at + 1);
  if (!domain) return false;
  if (domain === 'localhost' || domain.endsWith('.local')) return false;
  return true;
}

/**
 * @returns {Promise<boolean>} true si se ejecutó el envío
 */
async function sendSubscriptionLifecycleOutbound(email, userId, sendFn) {
  if (!subscriptionLifecycleOutboundEnabled()) {
    logger.debug({ tag: 'LIFECYCLE', email, userId }, 'Emails ciclo de vida desactivados (SUBSCRIPTION_LIFECYCLE_EMAILS)');
    return false;
  }
  if (!isDeliverableSubscriptionEmail(email)) {
    logger.info({ tag: 'LIFECYCLE', email, userId }, 'Email ciclo de vida omitido (dominio no entregable)');
    return false;
  }
  await sendFn();
  return true;
}

function daysBetween(dateA, dateB) {
  return (dateB.getTime() - dateA.getTime()) / 86400000;
}

/**
 * Sends a welcome / trial-started email for a new company account.
 * Call this from the registration flow after creating the account.
 */
export async function sendWelcomeEmail(account) {
  try {
    const { subject, html } = buildWelcomeTrialEmail(
      account.email,
      account.fullName || account.firstName || '',
      TRIAL_DAYS,
    );
    const sent = await sendSubscriptionLifecycleOutbound(account.email, account.user_id, () =>
      sendEmail({ to: account.email, subject, html }));
    if (sent) logger.info({ tag: 'LIFECYCLE', userId: account.user_id }, 'Welcome trial email sent');
  } catch (err) {
    logger.error({ tag: 'LIFECYCLE', err: err?.message, userId: account.user_id }, 'Failed to send welcome email');
  }
}

/**
 * Sends payment success email when MONEI confirms payment.
 */
export async function sendPaymentSuccessNotification(account) {
  try {
    const planName = account.subscription?.planName || 'Vertial';
    const billingMode = account.subscription?.billingMode || 'monthly';
    const { subject, html } = buildPaymentSuccessEmail(
      account.email,
      account.fullName || account.firstName || '',
      planName,
      billingMode,
    );
    const sent = await sendSubscriptionLifecycleOutbound(account.email, account.user_id, () =>
      sendEmail({ to: account.email, subject, html }));
    if (sent) logger.info({ tag: 'LIFECYCLE', userId: account.user_id }, 'Payment success email sent');
  } catch (err) {
    logger.error({ tag: 'LIFECYCLE', err: err?.message, userId: account.user_id }, 'Failed to send payment success email');
  }
}

/**
 * Sends payment failed email.
 */
export async function sendPaymentFailedNotification(account) {
  try {
    const { subject, html } = buildPaymentFailedEmail(
      account.email,
      account.fullName || account.firstName || '',
      BILLING_URL,
    );
    await sendEmail({ to: account.email, subject, html });
    logger.info({ tag: 'LIFECYCLE', userId: account.user_id }, 'Payment failed email sent');
  } catch (err) {
    logger.error({ tag: 'LIFECYCLE', err: err?.message, userId: account.user_id }, 'Failed to send payment failed email');
  }
}

/**
 * Sends grace period email.
 */
export async function sendGracePeriodNotification(account) {
  try {
    const { subject, html } = buildGracePeriodEmail(
      account.email,
      account.fullName || account.firstName || '',
      account.subscription?.gracePeriodEndsAt,
      BILLING_URL,
    );
    await sendEmail({ to: account.email, subject, html });
    logger.info({ tag: 'LIFECYCLE', userId: account.user_id }, 'Grace period email sent');
  } catch (err) {
    logger.error({ tag: 'LIFECYCLE', err: err?.message, userId: account.user_id }, 'Failed to send grace period email');
  }
}

/**
 * Sends suspension email.
 */
export async function sendSuspensionNotification(account) {
  try {
    const { subject, html } = buildSuspensionEmail(
      account.email,
      account.fullName || account.firstName || '',
      BILLING_URL,
    );
    await sendEmail({ to: account.email, subject, html });
    logger.info({ tag: 'LIFECYCLE', userId: account.user_id }, 'Suspension email sent');
  } catch (err) {
    logger.error({ tag: 'LIFECYCLE', err: err?.message, userId: account.user_id }, 'Failed to send suspension email');
  }
}

/**
 * Main lifecycle cron — runs periodically to transition subscription states
 * and send emails at each milestone.
 *
 * State transitions:
 *   trial_active  → trial_expiring  (≤3 days left)
 *   trial_expiring → trial_expired  (trialEndsAt passed)
 *   trial_expired  → grace_period   (immediate, give 72h)
 *   grace_period   → suspended      (gracePeriodEndsAt passed)
 *   payment_failed → grace_period   (immediate, give 72h)
 */
export async function runSubscriptionLifecycle() {
  const fakeReq = { headers: {} };
  let processed = 0;
  let transitioned = 0;

  try {
    const allAccounts = await getAllDocuments(fakeReq, ACCOUNTS_DB);
    const companyAccounts = allAccounts.filter(
      (a) => a.type === 'account' && !a.deletedAt && a.subscription && !a.invitedBy,
    );

    const now = new Date();

    for (const account of companyAccounts) {
      const sub = account.subscription;
      if (!sub) continue;
      if (sub.billingExempt) continue;
      if (sub.status === 'subscription_active') continue;
      processed++;

      const status = sub.status;
      const trialEndsAt = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
      const gracePeriodEndsAt = sub.gracePeriodEndsAt ? new Date(sub.gracePeriodEndsAt) : null;

      let newStatus = null;
      let emailFn = null;

      if (status === 'trial_active' && trialEndsAt) {
        const daysLeft = daysBetween(now, trialEndsAt);
        if (daysLeft <= 0) {
          newStatus = 'trial_expired';
          emailFn = async () => {
            const { subject, html } = buildTrialExpiredEmail(account.email, account.fullName, BILLING_URL);
            await sendEmail({ to: account.email, subject, html });
          };
        } else if (daysLeft <= 3) {
          newStatus = 'trial_expiring';
          emailFn = async () => {
            const { subject, html } = buildTrialExpiringEmail(
              account.email,
              account.fullName,
              Math.ceil(daysLeft),
              BILLING_URL,
            );
            await sendEmail({ to: account.email, subject, html });
          };
        }
      } else if (status === 'trial_expiring' && trialEndsAt) {
        const daysLeft = daysBetween(now, trialEndsAt);
        if (daysLeft <= 0) {
          newStatus = 'trial_expired';
          emailFn = async () => {
            const { subject, html } = buildTrialExpiredEmail(account.email, account.fullName, BILLING_URL);
            await sendEmail({ to: account.email, subject, html });
          };
        }
      } else if (status === 'trial_expired') {
        const graceEnd = new Date(now.getTime() + GRACE_HOURS * 3600000);
        newStatus = 'grace_period';
        emailFn = async () => {
          const { subject, html } = buildGracePeriodEmail(
            account.email,
            account.fullName,
            graceEnd.toISOString(),
            BILLING_URL,
          );
          await sendEmail({ to: account.email, subject, html });
        };
        await saveAccount(fakeReq, {
          ...account,
          subscription: {
            ...sub,
            status: 'grace_period',
            gracePeriodEndsAt: graceEnd.toISOString(),
          },
          updatedAt: now.toISOString(),
        });
        transitioned++;
        try { await emailFn(); } catch (e) {
          logger.error({ tag: 'LIFECYCLE', err: e?.message }, 'Email error in trial_expired→grace_period');
        }
        continue;
      } else if (status === 'payment_failed') {
        if (!gracePeriodEndsAt || gracePeriodEndsAt < now) {
          const graceEnd = new Date(now.getTime() + GRACE_HOURS * 3600000);
          newStatus = 'grace_period';
          await saveAccount(fakeReq, {
            ...account,
            subscription: {
              ...sub,
              status: 'grace_period',
              gracePeriodEndsAt: graceEnd.toISOString(),
            },
            updatedAt: now.toISOString(),
          });
          transitioned++;
          try {
            const { subject, html } = buildGracePeriodEmail(
              account.email,
              account.fullName,
              graceEnd.toISOString(),
              BILLING_URL,
            );
            await sendEmail({ to: account.email, subject, html });
          } catch (e) {
            logger.error({ tag: 'LIFECYCLE', err: e?.message }, 'Email error in payment_failed→grace');
          }
          continue;
        }
      } else if (status === 'grace_period' && gracePeriodEndsAt) {
        if (gracePeriodEndsAt <= now) {
          newStatus = 'suspended';
          emailFn = async () => {
            const { subject, html } = buildSuspensionEmail(account.email, account.fullName, BILLING_URL);
            await sendEmail({ to: account.email, subject, html });
          };
        }
      }

      if (newStatus && newStatus !== status) {
        const updates = { status: newStatus };

        await saveAccount(fakeReq, {
          ...account,
          subscription: { ...sub, ...updates },
          updatedAt: now.toISOString(),
        });
        transitioned++;

        if (emailFn) {
          try { await emailFn(); } catch (e) {
            logger.error({ tag: 'LIFECYCLE', err: e?.message, userId: account.user_id }, 'Email send error in lifecycle');
          }
        }

        logger.info(
          { tag: 'LIFECYCLE', userId: account.user_id, from: status, to: newStatus },
          `Subscription transitioned: ${status} → ${newStatus}`,
        );
      }
    }

    if (transitioned > 0) {
      logger.info({ tag: 'LIFECYCLE', processed, transitioned }, 'Subscription lifecycle run completed');
    }
  } catch (err) {
    logger.error({ tag: 'LIFECYCLE', err: err?.message }, 'Subscription lifecycle run failed');
  }
}

const LIFECYCLE_INTERVAL_MS = 60 * 60 * 1000;

export function startSubscriptionLifecycle() {
  setTimeout(() => runSubscriptionLifecycle().catch(() => null), 25000);
  setInterval(() => runSubscriptionLifecycle().catch(() => null), LIFECYCLE_INTERVAL_MS);
  logger.info({ tag: 'LIFECYCLE', intervalMs: LIFECYCLE_INTERVAL_MS }, 'Subscription lifecycle scheduler started');
}
