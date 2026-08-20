import {
  createSubscription,
  activateSubscription,
  getSubscription,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  getPayment,
  verifyWebhookSignature,
  resolvePlatformApiKey,
  resolveWebhookApiKey,
  getDefaultMode,
  createPayment,
} from '../services/monei.js';
import {
  findAccountByUserId,
  saveAccount,
  writeChangelog,
} from '../services/couchdb.js';
import logger from '../services/logger.js';
import { sanitizePaymentErrorForClient, PUBLIC_PAYMENT_UNAVAILABLE } from '../utils/paymentErrorMessages.js';
import { sendAdminAlert } from '../services/adminAlerts.js';
import {
  notifyPaymentFailed,
  notifySubscriptionSuspended,
} from '../services/adminBusinessAlerts.js';
import {
  sendPaymentSuccessNotification,
  sendPaymentFailedNotification,
  sendGracePeriodNotification,
  sendSuspensionNotification,
} from '../services/subscriptionLifecycle.js';
import { withServiceAgreementPendingAfterPayment } from '../shared/onboarding/resumePath.js';
import { PLAN_ADDON_CATALOG } from '../shared/billing/planAddons.js';
import {
  applyAddonToAccount,
  canPurchaseAddon,
  resolveAddonAmountCents,
} from '../services/subscriptionAddons.js';
import {
  appendSubscriptionHistory,
  isBlockingSubscriptionStatus,
} from '../services/subscriptionAdminActivation.js';
import {
  applyBillingExemptOverride,
  mapMoneiStatusToAppStatus,
  shouldApplyMoneiWebhookUpdate,
} from '../services/moneiSubscriptionSync.js';
import { isAdminPlanLocked } from '../shared/billing/adminPlanLock.js';
import { recordSubscriptionPaymentInvoice } from '../services/subscriptionBillingInvoice.js';
import { getTransferPaymentInstructions } from '../services/transferPaymentConfig.js';
import {
  buildTransferPaymentConcept,
  shouldBlockSubscriptionAccess,
} from '../shared/billing/subscriptionAccess.js';
import { quoteSubscriptionFromAccount } from '../shared/billing/subscriptionQuote.js';
import { isTenantAccountOwner } from '../services/businessAccess.js';

const APP_URL = process.env.APP_URL || 'http://localhost:3005';

function forbidInvitedFromBilling(account, res) {
  if (isTenantAccountOwner(account)) return false;
  res.status(403).json({
    ok: false,
    error: 'Solo el creador de la cuenta puede gestionar la suscripción y la facturación',
    code: 'OWNER_ONLY',
  });
  return true;
}

const PLAN_CATALOG = {
  basic: { name: 'Básico', monthlyPrice: 4900, annualPrice: 47040 },
  normal: { name: 'Normal', monthlyPrice: 14900, annualPrice: 143040 },
  pro: { name: 'Pro', monthlyPrice: 34900, annualPrice: 335040 },
};

export { PLAN_CATALOG, PLAN_ADDON_CATALOG };

export async function getBillingCapabilities(_req, res) {
  return res.json({
    ok: true,
    skipMonei: isSkipMoneiSubscription(),
  });
}

/** Alinea plan en cuenta con metadata de MONEI (createSubscription guarda planId / billingMode). */
function subscriptionPlanFieldsFromMoneiMetadata(metadata) {
  const raw = metadata && typeof metadata === 'object' ? metadata : {};
  const planId = String(raw.planId || '').trim();
  const row = PLAN_CATALOG[planId];
  if (!row) return {};
  return { selectedPlanId: planId, planName: row.name };
}

import { isSkipMoneiSubscription } from '../shared/billing/skipMonei.js';

function isSubscriptionReactivation(previousStatus) {
  return isBlockingSubscriptionStatus(previousStatus);
}

function buildActivatedSubscriptionFields(sub, planId, planName, billingMode) {
  const now = new Date();
  const periodEnd = new Date(now);
  if (billingMode === 'annual') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }
  const graceEnd = new Date(periodEnd);
  graceEnd.setDate(graceEnd.getDate() + 7);
  return {
    ...sub,
    status: 'subscription_active',
    selectedPlanId: planId,
    planName,
    billingMode,
    cancelAtPeriodEnd: false,
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    gracePeriodEndsAt: graceEnd.toISOString(),
    lastPaymentAt: now.toISOString(),
  };
}

function extractPaymentRedirectUrl(payment) {
  return (
    payment?.nextAction?.redirectUrl
    || payment?.redirectUrl
    || payment?.paymentUrl
    || null
  );
}

/**
 * POST /api/subscriptions/create
 * Crea una suscripción MONEI con 14 días de prueba y la activa.
 * Devuelve la redirectUrl para que el frontend redirija al usuario.
 */
export async function createAndActivate(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }

    const { planId = 'basic', billingMode = 'monthly' } = req.body || {};

    const plan = PLAN_CATALOG[planId];
    if (!plan) {
      return res.status(400).json({ ok: false, error: `Plan no válido: ${planId}` });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    if (forbidInvitedFromBilling(account, res)) return;

    if (isSkipMoneiSubscription()) {
      const now = new Date().toISOString();
      const reactivating = isSubscriptionReactivation(account.subscription?.status);
      await saveAccount(req, {
        ...account,
        subscription: buildActivatedSubscriptionFields(
          {
            ...account.subscription,
            moneiSubscriptionId: '',
            moneiPaymentId: null,
            moneiSubscriptionStatus: 'SKIPPED',
          },
          planId,
          plan.name,
          billingMode,
        ),
        updatedAt: now,
      });
      logger.warn(
        { userId, planId, billingMode, reactivating },
        '[MONEI] SKIP_MONEI_SUBSCRIPTION activo: plan guardado en cuenta sin pasarela',
      );
      return res.json({
        ok: true,
        redirectUrl: null,
        subscriptionId: 'skip-monei',
        paymentId: null,
        skippedMonei: true,
        reactivated: reactivating,
      });
    }

    const userApiKey = resolvePlatformApiKey();
    const maskedKey = userApiKey && userApiKey.length > 12
      ? `${userApiKey.slice(0, 8)}...${userApiKey.slice(-4)}`
      : '(no key)';
    logger.info(
      { userId, maskedKey, mode: getDefaultMode() },
      `[MONEI][CREATE] Usando API key: ${maskedKey} (mode: ${getDefaultMode()})`,
    );

    if (account.subscription?.moneiSubscriptionId) {
      try {
        const existing = await getSubscription(account.subscription.moneiSubscriptionId, userApiKey);
        if (existing.status === 'ACTIVE' || existing.status === 'TRIALING') {
          return res.status(409).json({
            ok: false,
            error: 'Ya tienes una suscripción activa.',
            moneiStatus: existing.status,
          });
        }
      } catch {
        // suscripción anterior no existe o fue cancelada, podemos crear una nueva
      }
    }

    const isAnnual = billingMode === 'annual';
    const amount = isAnnual ? plan.annualPrice : plan.monthlyPrice;
    const interval = isAnnual ? 'year' : 'month';
    const reactivating = isSubscriptionReactivation(account.subscription?.status);
    const trialPeriodDays = reactivating ? 0 : 14;

    const baseUrl = APP_URL.replace(/\/$/, '');
    const callbackUrl = `${baseUrl}/api/subscriptions/webhook/status`;
    const paymentCallbackUrl = `${baseUrl}/api/subscriptions/webhook/payment`;

    logger.info({ callbackUrl, paymentCallbackUrl }, '[MONEI][CREATE] Callback URLs registradas');

    const moneiSubscription = await createSubscription({
      amount,
      currency: 'EUR',
      interval,
      intervalCount: 1,
      trialPeriodDays,
      description: `Vertial ${plan.name} (${isAnnual ? 'anual' : 'mensual'})${reactivating ? ' — reactivación' : ''}`,
      customerName: account.fullName || `${account.firstName} ${account.lastName}`.trim(),
      customerEmail: account.email,
      callbackUrl,
      paymentCallbackUrl,
      metadata: {
        userId,
        planId,
        billingMode,
      },
      apiKey: userApiKey,
    });

    const completeUrl = `${baseUrl}/saas/settings/facturacion?subscription_complete=true&subscription_id=${moneiSubscription.id}`;
    const cancelUrl = `${baseUrl}/saas/settings/facturacion?subscription_cancelled=true`;

    const activation = await activateSubscription(moneiSubscription.id, {
      completeUrl,
      cancelUrl,
      allowedPaymentMethods: ['card'],
      apiKey: userApiKey,
    });

    const redirectUrl = activation?.nextAction?.redirectUrl;
    if (!redirectUrl) {
      logger.error({ activation }, '[MONEI] activateSubscription no devolvió redirectUrl');
      return res.status(502).json({ ok: false, error: PUBLIC_PAYMENT_UNAVAILABLE });
    }

    await saveAccount(req, {
      ...account,
      subscription: {
        ...account.subscription,
        moneiSubscriptionId: moneiSubscription.id,
        moneiPaymentId: activation.id || null,
        selectedPlanId: planId,
        planName: plan.name,
        billingMode,
        status: 'trial_active',
      },
      updatedAt: new Date().toISOString(),
    });

    // Aviso interno: paquete seleccionado (50/150/350) y modo (mensual/anual).
    sendAdminAlert({
      key: `plan_selected:${userId}:${moneiSubscription.id}`,
      subject: `💳 Plan seleccionado: ${plan.name} (${billingMode})`,
      html: `<p><b>Plan seleccionado</b></p>
<ul>
  <li><b>Usuario</b>: ${escapeHtml(account.fullName || account.email || userId)}</li>
  <li><b>Email</b>: ${escapeHtml(account.email || '')}</li>
  <li><b>Plan</b>: ${escapeHtml(planId)} (${escapeHtml(plan.name)})</li>
  <li><b>Modo</b>: ${escapeHtml(billingMode)}</li>
  <li><b>Importe</b>: ${(amount / 100).toFixed(2)}€ / ${escapeHtml(interval)}</li>
  <li><b>MONEI subscription</b>: ${escapeHtml(moneiSubscription.id)}</li>
</ul>`,
      cooldownMs: 0,
    }).catch(() => null);

    return res.json({
      ok: true,
      redirectUrl,
      subscriptionId: moneiSubscription.id,
      paymentId: activation.id,
    });
  } catch (error) {
    logger.error(error, '[MONEI] Error creando suscripción');
    return res.status(500).json({
      ok: false,
      error: sanitizePaymentErrorForClient(
        error instanceof Error ? error.message : 'Error al crear la suscripción',
      ),
    });
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * GET /api/subscriptions/status
 * Devuelve el estado actual de la suscripción MONEI del usuario.
 */
export async function getStatus(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const moneiSubId = account.subscription?.moneiSubscriptionId;
    if (!moneiSubId) {
      return res.json({
        ok: true,
        subscription: account.subscription || null,
        moneiSubscription: null,
      });
    }

    const userApiKey = resolvePlatformApiKey();
    let moneiSubscription = null;
    try {
      moneiSubscription = await getSubscription(moneiSubId, userApiKey);
    } catch {
      logger.warn(`[MONEI] No se pudo obtener suscripción ${moneiSubId}`);
    }

    return res.json({
      ok: true,
      subscription: account.subscription,
      moneiSubscription,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: sanitizePaymentErrorForClient(
        error instanceof Error ? error.message : 'Error al obtener estado de suscripción',
      ),
    });
  }
}

/**
 * POST /api/subscriptions/cancel
 * Cancela la suscripción MONEI del usuario.
 */
export async function cancelUserSubscription(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    if (forbidInvitedFromBilling(account, res)) return;

    const moneiSubId = account.subscription?.moneiSubscriptionId;
    if (!moneiSubId) {
      return res.status(400).json({ ok: false, error: 'No hay suscripción activa' });
    }

    const userApiKey = resolvePlatformApiKey();
    await cancelSubscription(moneiSubId, userApiKey);

    const updatedAccount = await saveAccount(req, {
      ...account,
      subscription: {
        ...account.subscription,
        status: 'suspended',
        cancelAtPeriodEnd: true,
      },
      updatedAt: new Date().toISOString(),
    });

    await writeChangelog(req, {
      entity: 'subscription',
      entityId: moneiSubId,
      entityLabel: account.fullName,
      action: 'cancel',
      actorUserId: userId,
      actorName: account.fullName,
      changes: { status: { before: account.subscription?.status, after: 'suspended' } },
      metadata: { moneiSubscriptionId: moneiSubId },
    });

    notifySubscriptionSuspended(updatedAccount, { source: 'cancel_api' });

    return res.json({ ok: true, subscription: updatedAccount.subscription });
  } catch (error) {
    logger.error(error, '[MONEI] Error cancelando suscripción');
    return res.status(500).json({
      ok: false,
      error: sanitizePaymentErrorForClient(
        error instanceof Error ? error.message : 'Error al cancelar la suscripción',
      ),
    });
  }
}

/**
 * POST /api/subscriptions/confirm
 * El frontend llama tras el redirect de MONEI para confirmar el estado.
 */
export async function confirmSubscription(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }

    const { subscriptionId, paymentId } = req.body || {};
    if (!subscriptionId) {
      return res.status(400).json({ ok: false, error: 'subscriptionId requerido' });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    if (forbidInvitedFromBilling(account, res)) return;

    const userApiKey = resolvePlatformApiKey();
    const moneiSub = await getSubscription(subscriptionId, userApiKey);
    let paymentInfo = null;
    if (paymentId) {
      try {
        paymentInfo = await getPayment(paymentId, userApiKey);
      } catch { /* ignore */ }
    }

    const moneiStatus = moneiSub.status;
    let appStatus = account.subscription?.status || 'trial_active';

    if (shouldApplyMoneiWebhookUpdate(account, subscriptionId, moneiStatus)) {
      appStatus = mapMoneiStatusToAppStatus(moneiStatus, appStatus);
    }
    appStatus = applyBillingExemptOverride(appStatus, account.subscription);

    const now = new Date();
    const fromMoneiMeta = isAdminPlanLocked(account.subscription)
      ? {}
      : subscriptionPlanFieldsFromMoneiMetadata(moneiSub.metadata);
    const updatedAccount = await saveAccount(req, {
      ...account,
      subscription: {
        ...account.subscription,
        status: appStatus,
        moneiSubscriptionId: subscriptionId,
        moneiSubscriptionStatus: moneiStatus,
        lastPaymentAt: paymentInfo?.status === 'SUCCEEDED' ? now.toISOString() : account.subscription?.lastPaymentAt,
        ...fromMoneiMeta,
      },
      updatedAt: now.toISOString(),
    });

    return res.json({
      ok: true,
      subscription: updatedAccount.subscription,
      moneiSubscription: moneiSub,
    });
  } catch (error) {
    logger.error(error, '[MONEI] Error confirmando suscripción');
    return res.status(500).json({
      ok: false,
      error: sanitizePaymentErrorForClient(
        error instanceof Error ? error.message : 'Error al confirmar la suscripción',
      ),
    });
  }
}

/**
 * POST /api/subscriptions/webhook/status
 * Webhook MONEI para cambios de estado de suscripción.
 * No requiere autenticación JWT (viene de MONEI).
 */
export async function webhookSubscriptionStatus(req, res) {
  try {
    logger.info(
      {
        method: req.method,
        url: req.originalUrl,
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
        contentType: req.headers['content-type'],
        moneiSignature: req.headers['monei-signature'] || '(MISSING)',
        userAgent: req.headers['user-agent'],
        allHeaders: Object.keys(req.headers),
        hasBody: !!req.body,
        bodyKeys: req.body ? Object.keys(req.body) : [],
        hasRawBody: !!req.rawBody,
        bodyPreview: JSON.stringify(req.body || {}).slice(0, 500),
      },
      '[MONEI][WEBHOOK /status] Petición entrante recibida',
    );

    const signature = req.headers['monei-signature'];
    const webhookKey = resolveWebhookApiKey(req.body);
    if (!verifyWebhookSignature(req.rawBody || '', signature, webhookKey)) {
      logger.error('[MONEI][WEBHOOK /status] Firma inválida — devolviendo 401');
      return res.status(401).json({ error: 'Firma inválida' });
    }

    const payload = req.body || {};
    const subscriptionId = payload.id;
    const moneiStatus = payload.status;
    const metadata = payload.metadata || {};
    const userId = metadata.userId;

    logger.info({ subscriptionId, moneiStatus, userId, fullPayload: payload }, '[MONEI] Webhook suscripción recibido');

    if (!subscriptionId || !userId) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      logger.warn(`[MONEI] Webhook: usuario ${userId} no encontrado`);
      return res.status(200).json({ ok: true, skipped: true });
    }

    let appStatus = account.subscription?.status || 'trial_active';
    if (shouldApplyMoneiWebhookUpdate(account, subscriptionId, moneiStatus)) {
      appStatus = mapMoneiStatusToAppStatus(moneiStatus, appStatus);
    }
    appStatus = applyBillingExemptOverride(appStatus, account.subscription);

    const fromWebhookMeta = isAdminPlanLocked(account.subscription)
      ? {}
      : subscriptionPlanFieldsFromMoneiMetadata(metadata);

    const previousStatus = account.subscription?.status;
    let accountToSave = {
      ...account,
      subscription: {
        ...account.subscription,
        status: appStatus,
        moneiSubscriptionStatus: moneiStatus,
        ...fromWebhookMeta,
      },
      updatedAt: new Date().toISOString(),
    };
    if (appStatus === 'subscription_active' && previousStatus !== 'subscription_active') {
      accountToSave = withServiceAgreementPendingAfterPayment(accountToSave);
    }

    const updatedAccount = await saveAccount(req, accountToSave);

    if (appStatus !== previousStatus) {
      if (appStatus === 'subscription_active') {
        sendPaymentSuccessNotification(updatedAccount).catch(() => null);
      } else if (appStatus === 'payment_failed') {
        sendPaymentFailedNotification(updatedAccount).catch(() => null);
        notifyPaymentFailed(updatedAccount, { source: 'subscription_webhook' });
      } else if (appStatus === 'grace_period') {
        sendGracePeriodNotification(updatedAccount).catch(() => null);
      } else if (appStatus === 'suspended') {
        sendSuspensionNotification(updatedAccount).catch(() => null);
        notifySubscriptionSuspended(updatedAccount, { source: 'subscription_webhook' });
      }
    }

    logger.info({ subscriptionId, moneiStatus, appStatus }, '[MONEI] Suscripción actualizada via webhook');
    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error(error, '[MONEI] Error procesando webhook de suscripción');
    return res.status(200).json({ ok: true });
  }
}

/**
 * POST /api/subscriptions/webhook/payment
 * Webhook MONEI para notificaciones de pago recurrente.
 * No requiere autenticación JWT.
 */
export async function webhookPaymentStatus(req, res) {
  try {
    logger.info(
      {
        method: req.method,
        url: req.originalUrl,
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
        contentType: req.headers['content-type'],
        moneiSignature: req.headers['monei-signature'] || '(MISSING)',
        userAgent: req.headers['user-agent'],
        allHeaders: Object.keys(req.headers),
        hasBody: !!req.body,
        bodyKeys: req.body ? Object.keys(req.body) : [],
        hasRawBody: !!req.rawBody,
        bodyPreview: JSON.stringify(req.body || {}).slice(0, 500),
      },
      '[MONEI][WEBHOOK /payment] Petición entrante recibida',
    );

    const signature = req.headers['monei-signature'];
    const webhookKey = resolveWebhookApiKey(req.body);
    if (!verifyWebhookSignature(req.rawBody || '', signature, webhookKey)) {
      logger.error('[MONEI][WEBHOOK /payment] Firma inválida — devolviendo 401');
      return res.status(401).json({ error: 'Firma inválida' });
    }

    const payment = req.body || {};
    const paymentId = payment.id;
    const paymentStatus = payment.status;
    const subscriptionId = payment.subscriptionId;
    const metadata = payment.metadata || {};
    const userId = metadata.userId;
    const purchaseType = metadata.purchaseType || metadata.type;
    const addonId = metadata.addonId;

    logger.info(
      { paymentId, paymentStatus, subscriptionId, userId, purchaseType, addonId, fullPayment: payment },
      '[MONEI] Webhook pago recibido',
    );

    if (purchaseType === 'addon' && addonId && userId) {
      const account = await findAccountByUserId(req, userId);
      if (!account) {
        return res.status(200).json({ ok: true, skipped: true });
      }

      const now = new Date();
      if (paymentStatus === 'SUCCEEDED') {
        const patched = applyAddonToAccount(account, addonId, metadata.quantity || 1);
        await saveAccount(req, {
          ...patched,
          updatedAt: now.toISOString(),
        });
        await writeChangelog(req, {
          entity: 'subscription_addon',
          entityId: addonId,
          entityLabel: account.fullName || account.email,
          action: 'purchase',
          actorUserId: userId,
          actorName: account.fullName || account.email,
          changes: {
            addonId: { before: null, after: addonId },
            extraPointOfSaleSlots: {
              before: account.subscription?.extraPointOfSaleSlots ?? 0,
              after: patched.subscription?.extraPointOfSaleSlots ?? 0,
            },
            extraCommercialBrandSlots: {
              before: account.subscription?.extraCommercialBrandSlots ?? 0,
              after: patched.subscription?.extraCommercialBrandSlots ?? 0,
            },
          },
          metadata: { paymentId, billingMode: metadata.billingMode || 'monthly' },
        });
        sendPaymentSuccessNotification({ ...account, subscription: patched.subscription }).catch(() => null);
        void recordSubscriptionPaymentInvoice(req, {
          userId,
          paymentId,
          amountCents: payment.amount,
          planId: account.subscription?.selectedPlanId || '',
          planName: account.subscription?.planName || '',
          billingMode: metadata.billingMode || account.subscription?.billingMode || 'monthly',
          description: `Ampliación ${addonId} — MONEI`,
        });
        logger.info({ paymentId, userId, addonId }, '[MONEI] Ampliación aplicada tras pago');
      } else if (paymentStatus === 'FAILED') {
        sendPaymentFailedNotification(account).catch(() => null);
        notifyPaymentFailed(account, { source: 'addon_payment_webhook' });
      }

      return res.status(200).json({ ok: true });
    }

    if (!subscriptionId) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    if (!userId) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const now = new Date();

    if (paymentStatus === 'SUCCEEDED') {
      const reactivated = isBlockingSubscriptionStatus(account.subscription?.status);
      const periodFields = reactivated
        ? buildActivatedSubscriptionFields(
            account.subscription || {},
            account.subscription?.selectedPlanId || 'basic',
            account.subscription?.planName || 'Básico',
            account.subscription?.billingMode || 'monthly',
          )
        : account.subscription || {};

      const updatedAccount = await saveAccount(
        req,
        withServiceAgreementPendingAfterPayment({
          ...account,
          subscription: {
            ...periodFields,
            status: 'subscription_active',
            moneiSubscriptionStatus: 'ACTIVE',
            lastPaymentAt: now.toISOString(),
            cancelAtPeriodEnd: false,
          },
          updatedAt: now.toISOString(),
        }),
      );
      sendPaymentSuccessNotification(updatedAccount).catch(() => null);
      void recordSubscriptionPaymentInvoice(req, {
        userId,
        paymentId,
        amountCents: payment.amount,
        planId: account.subscription?.selectedPlanId || metadata.planId || '',
        planName: account.subscription?.planName || '',
        billingMode: account.subscription?.billingMode || metadata.billingMode || 'monthly',
      });
      logger.info({ paymentId, userId, reactivated }, '[MONEI] Pago recurrente exitoso');
    } else if (paymentStatus === 'FAILED') {
      const updatedAccount = await saveAccount(req, {
        ...account,
        subscription: {
          ...account.subscription,
          status: 'payment_failed',
        },
        updatedAt: now.toISOString(),
      });
      sendPaymentFailedNotification(updatedAccount).catch(() => null);
      notifyPaymentFailed(updatedAccount, { source: 'payment_webhook' });
      logger.warn({ paymentId, userId }, '[MONEI] Pago recurrente fallido');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error(error, '[MONEI] Error procesando webhook de pago');
    return res.status(200).json({ ok: true });
  }
}

/**
 * POST /api/subscriptions/addons/purchase
 * Contrata una ampliación (PDV, marca, empresa). Con MONEI redirige al pago; en SKIP aplica al instante.
 */
export async function purchaseAddon(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }

    const { addonId, billingMode = 'monthly', quantity = 1 } = req.body || {};
    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    if (forbidInvitedFromBilling(account, res)) return;

    const validation = canPurchaseAddon(account, addonId);
    if (!validation.ok) {
      return res.status(403).json({ ok: false, error: validation.error, code: validation.code });
    }

    const amount = resolveAddonAmountCents(addonId, billingMode);
    if (!amount) {
      return res.status(400).json({ ok: false, error: 'Ampliación no válida' });
    }

    const addon = PLAN_ADDON_CATALOG[addonId];
    const qty = Math.max(1, Math.min(99, Math.floor(Number(quantity) || 1)));

    if (isSkipMoneiSubscription()) {
      let patched = account;
      for (let i = 0; i < qty; i += 1) {
        patched = applyAddonToAccount(patched, addonId, 1);
      }
      const saved = await saveAccount(req, {
        ...patched,
        updatedAt: new Date().toISOString(),
      });
      await writeChangelog(req, {
        entity: 'subscription_addon',
        entityId: addonId,
        entityLabel: account.fullName || account.email,
        action: 'grant_skip_monei',
        actorUserId: userId,
        actorName: account.fullName || account.email,
        metadata: { addonId, quantity: qty, billingMode },
      });
      return res.json({
        ok: true,
        skippedMonei: true,
        subscription: saved.subscription,
        addonId,
        quantity: qty,
      });
    }

    const userApiKey = resolvePlatformApiKey();
    const baseUrl = APP_URL.replace(/\/$/, '');
    const completeUrl = `${baseUrl}/saas/settings/facturacion?addon_complete=true&addon_id=${encodeURIComponent(addonId)}`;
    const cancelUrl = `${baseUrl}/saas/settings/facturacion?addon_cancelled=true`;

    const payment = await createPayment({
      amount: amount * qty,
      currency: 'EUR',
      orderId: `addon_${addonId}_${userId}_${Date.now()}`,
      description: `Vertial — ${addon.name}${qty > 1 ? ` x${qty}` : ''}`,
      customer: {
        name: account.fullName || `${account.firstName} ${account.lastName}`.trim(),
        email: account.email,
      },
      completeUrl,
      cancelUrl,
      callbackUrl: `${baseUrl}/api/subscriptions/webhook/payment`,
      apiKey: userApiKey,
      metadata: {
        userId,
        addonId,
        purchaseType: 'addon',
        billingMode,
        quantity: qty,
      },
    });

    const redirectUrl = extractPaymentRedirectUrl(payment);
    if (!redirectUrl) {
      logger.error({ payment }, '[MONEI] createPayment addon sin redirectUrl');
      return res.status(502).json({ ok: false, error: PUBLIC_PAYMENT_UNAVAILABLE });
    }

    return res.json({
      ok: true,
      redirectUrl,
      paymentId: payment.id,
      addonId,
      amount: amount * qty,
      billingMode,
    });
  } catch (error) {
    logger.error(error, '[MONEI] Error comprando ampliación');
    return res.status(500).json({
      ok: false,
      error: sanitizePaymentErrorForClient(
        error instanceof Error ? error.message : 'Error al contratar la ampliación',
      ),
    });
  }
}

/**
 * GET /api/subscriptions/transfer-instructions
 * Datos de transferencia + plan/concepto para la pantalla de activación.
 */
export async function getTransferInstructions(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    if (forbidInvitedFromBilling(account, res)) return;

    const sub = account.subscription || {};
    const quote = quoteSubscriptionFromAccount(account);
    const planId = quote.planId;
    const plan = PLAN_CATALOG[planId] || PLAN_CATALOG.basic;
    const concept =
      String(sub.paymentConcept || '').trim() || buildTransferPaymentConcept(userId);
    const bank = getTransferPaymentInstructions();

    return res.json({
      ok: true,
      companyName: account.companyName || account.fullName || '',
      email: account.email || '',
      subscription: {
        status: sub.status || 'pending_payment',
        planName: sub.planName || quote.planName || plan.name,
        selectedPlanId: planId,
        billingMode: quote.billingMode,
        paymentConcept: concept,
        paymentSentAt: sub.paymentSentAt || '',
        currentPeriodEnd: sub.currentPeriodEnd || '',
        billingExempt: Boolean(sub.billingExempt),
        quotedMonthlyEquivalentEuros: quote.monthlyEquivalentEuros,
        quotedAmountDueEuros: quote.amountDueEuros,
      },
      plan: {
        id: planId,
        name: quote.planName || plan.name,
        monthlyPriceCents: plan.monthlyPrice,
        monthlyPriceEuros: plan.monthlyPrice / 100,
        annualPriceCents: plan.annualPrice,
        annualPriceEuros: plan.annualPrice / 100,
      },
      quote: {
        billingMode: quote.billingMode,
        billingLabel: quote.billingLabel,
        periodLabel: quote.periodLabel,
        monthlyEquivalentEuros: quote.monthlyEquivalentEuros,
        amountDueEuros: quote.amountDueEuros,
        amountDueCents: quote.amountDueCents,
        listMonthlyEuros: quote.listMonthlyEuros,
        baseMonthlyEuros: quote.baseMonthlyEuros,
        extrasMonthlyEuros: quote.extrasMonthlyEuros,
        extras: quote.extras,
        included: quote.included,
        lines: quote.lines,
        formulaNote: quote.formulaNote,
      },
      transfer: bank,
      accessBlocked: shouldBlockSubscriptionAccess(sub),
    });
  } catch (error) {
    logger.error(error, '[Subscription] Error cargando instrucciones de transferencia');
    return res.status(500).json({ ok: false, error: 'Error al cargar datos de pago' });
  }
}

/**
 * POST /api/subscriptions/notify-transfer-payment
 * El cliente avisa que ha transferido. NO activa la licencia.
 */
export async function notifyTransferPayment(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    if (forbidInvitedFromBilling(account, res)) return;

    if (account.accountType === 'user' || !account.subscription) {
      return res.status(400).json({
        ok: false,
        error: 'Solo la cuenta empresa puede avisar del pago de la suscripción.',
      });
    }

    const sub = account.subscription;
    if (sub.status === 'subscription_active' || sub.status === 'trial_active' || sub.status === 'trial_expiring') {
      return res.json({
        ok: true,
        alreadyActive: true,
        subscription: sub,
        message: 'Tu suscripción ya está activa.',
      });
    }

    const now = new Date().toISOString();
    const concept =
      String(sub.paymentConcept || '').trim() || buildTransferPaymentConcept(userId);
    const planId = String(sub.selectedPlanId || 'basic').toLowerCase();
    const plan = PLAN_CATALOG[planId] || PLAN_CATALOG.basic;

    const quoteBefore = quoteSubscriptionFromAccount(account);
    const nextSub = appendSubscriptionHistory(
      {
        ...sub,
        status: 'payment_sent',
        selectedPlanId: quoteBefore.planId,
        planName: quoteBefore.planName,
        billingMode: quoteBefore.billingMode,
        quotedMonthlyEquivalentEuros: quoteBefore.monthlyEquivalentEuros,
        quotedAmountDueEuros: quoteBefore.amountDueEuros,
        quotedAmountDueCents: quoteBefore.amountDueCents,
        paymentConcept: concept,
        paymentSentAt: now,
        paymentProvider: sub.paymentProvider || 'bank_transfer',
      },
      {
        at: now,
        action: 'payment_sent',
        by: userId,
        note: 'Cliente indicó que realizó la transferencia',
      },
    );

    const updatedAccount = await saveAccount(req, {
      ...account,
      subscription: nextSub,
      updatedAt: now,
    });

    await writeChangelog(req, {
      entity: 'subscription',
      entityId: account.user_id,
      entityLabel: account.fullName || account.email,
      action: 'payment_sent',
      actorUserId: userId,
      actorName: account.fullName || account.email,
      changes: {
        status: { before: sub.status, after: 'payment_sent' },
        paymentSentAt: { before: sub.paymentSentAt || null, after: now },
      },
      metadata: { paymentConcept: concept, planId },
    });

    const quote = quoteSubscriptionFromAccount({ ...account, subscription: nextSub });
    const amountLabel = `${quote.amountDueEuros.toFixed(2)} €/${quote.periodLabel} (${quote.billingLabel})`;
    await sendAdminAlert({
      key: `payment_sent:${userId}`,
      subject: `Pago avisado: ${account.companyName || account.email}`,
      html: `
        <p>Un cliente ha indicado que realizó la transferencia.</p>
        <ul>
          <li><strong>Empresa:</strong> ${account.companyName || '—'}</li>
          <li><strong>Titular:</strong> ${account.fullName || '—'}</li>
          <li><strong>Email:</strong> ${account.email || '—'}</li>
          <li><strong>Plan:</strong> ${quote.planName} · ${amountLabel}</li>
          <li><strong>Cuota equiv.:</strong> ${quote.monthlyEquivalentEuros.toFixed(2)} €/mes</li>
          <li><strong>Concepto:</strong> ${concept}</li>
          <li><strong>Fecha aviso:</strong> ${now}</li>
        </ul>
        <p>Revisa el ingreso y activa la suscripción en Administración → Licencias / Clientes.</p>
      `,
      cooldownMs: 2 * 60_000,
      severity: 'business',
    });

    logger.info(
      { userId, concept, planId },
      '[Subscription] Aviso de transferencia registrado',
    );

    return res.json({
      ok: true,
      subscription: updatedAccount.subscription,
      message:
        'Hemos recibido tu aviso. Comprobaremos la transferencia lo antes posible. Recibirás acceso automáticamente una vez validado el pago.',
    });
  } catch (error) {
    logger.error(error, '[Subscription] Error registrando aviso de transferencia');
    return res.status(500).json({ ok: false, error: 'No se pudo registrar el aviso de pago' });
  }
}
