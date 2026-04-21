import {
  createSubscription,
  activateSubscription,
  getSubscription,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  getPayment,
  verifyWebhookSignature,
  resolveApiKey,
  getDefaultMode,
} from '../services/monei.js';
import {
  findAccountByUserId,
  saveAccount,
  writeChangelog,
} from '../services/couchdb.js';
import logger from '../services/logger.js';
import {
  sendPaymentSuccessNotification,
  sendPaymentFailedNotification,
  sendGracePeriodNotification,
  sendSuspensionNotification,
} from '../services/subscriptionLifecycle.js';

const APP_URL = process.env.APP_URL || 'http://localhost:3005';

const PLAN_CATALOG = {
  basic: { name: 'Básico', monthlyPrice: 4900, annualPrice: 47040 },
  normal: { name: 'Normal', monthlyPrice: 14900, annualPrice: 143040 },
  pro: { name: 'Pro', monthlyPrice: 34900, annualPrice: 335040 },
};

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

    const userApiKey = await resolveApiKey(req, userId);
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
            error: 'Ya tienes una suscripción activa en MONEI.',
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

    const baseUrl = APP_URL.replace(/\/$/, '');
    const callbackUrl = `${baseUrl}/api/subscriptions/webhook/status`;
    const paymentCallbackUrl = `${baseUrl}/api/subscriptions/webhook/payment`;

    logger.info({ callbackUrl, paymentCallbackUrl }, '[MONEI][CREATE] Callback URLs registradas');

    const moneiSubscription = await createSubscription({
      amount,
      currency: 'EUR',
      interval,
      intervalCount: 1,
      trialPeriodDays: 14,
      description: `UDAR ${plan.name} (${isAnnual ? 'anual' : 'mensual'})`,
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
      return res.status(502).json({ ok: false, error: 'MONEI no devolvió URL de pago' });
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
      error: error instanceof Error ? error.message : 'Error al crear la suscripción',
    });
  }
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

    const userApiKey = await resolveApiKey(req, userId);
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
      error: error instanceof Error ? error.message : 'Error al obtener estado de suscripción',
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

    const moneiSubId = account.subscription?.moneiSubscriptionId;
    if (!moneiSubId) {
      return res.status(400).json({ ok: false, error: 'No hay suscripción MONEI activa' });
    }

    const userApiKey = await resolveApiKey(req, userId);
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

    return res.json({ ok: true, subscription: updatedAccount.subscription });
  } catch (error) {
    logger.error(error, '[MONEI] Error cancelando suscripción');
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cancelar la suscripción',
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

    const userApiKey = await resolveApiKey(req, userId);
    const moneiSub = await getSubscription(subscriptionId, userApiKey);
    let paymentInfo = null;
    if (paymentId) {
      try {
        paymentInfo = await getPayment(paymentId, userApiKey);
      } catch { /* ignore */ }
    }

    const moneiStatus = moneiSub.status;
    let appStatus = account.subscription?.status || 'trial_active';

    if (moneiStatus === 'ACTIVE') appStatus = 'subscription_active';
    else if (moneiStatus === 'TRIALING') appStatus = 'trial_active';
    else if (moneiStatus === 'PAST_DUE') appStatus = 'payment_failed';
    else if (moneiStatus === 'PAUSED') appStatus = 'grace_period';
    else if (moneiStatus === 'CANCELLED') appStatus = 'suspended';

    const now = new Date();
    const updatedAccount = await saveAccount(req, {
      ...account,
      subscription: {
        ...account.subscription,
        status: appStatus,
        moneiSubscriptionId: subscriptionId,
        moneiSubscriptionStatus: moneiStatus,
        lastPaymentAt: paymentInfo?.status === 'SUCCEEDED' ? now.toISOString() : account.subscription?.lastPaymentAt,
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
      error: error instanceof Error ? error.message : 'Error al confirmar la suscripción',
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
    if (!verifyWebhookSignature(req.rawBody || '', signature)) {
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
    if (moneiStatus === 'ACTIVE') appStatus = 'subscription_active';
    else if (moneiStatus === 'TRIALING') appStatus = 'trial_active';
    else if (moneiStatus === 'PAST_DUE') appStatus = 'payment_failed';
    else if (moneiStatus === 'PAUSED') appStatus = 'grace_period';
    else if (moneiStatus === 'CANCELLED') appStatus = 'suspended';

    const updatedAccount = await saveAccount(req, {
      ...account,
      subscription: {
        ...account.subscription,
        status: appStatus,
        moneiSubscriptionStatus: moneiStatus,
      },
      updatedAt: new Date().toISOString(),
    });

    const previousStatus = account.subscription?.status;
    if (appStatus !== previousStatus) {
      if (appStatus === 'subscription_active') {
        sendPaymentSuccessNotification(updatedAccount).catch(() => null);
      } else if (appStatus === 'payment_failed') {
        sendPaymentFailedNotification(updatedAccount).catch(() => null);
      } else if (appStatus === 'grace_period') {
        sendGracePeriodNotification(updatedAccount).catch(() => null);
      } else if (appStatus === 'suspended') {
        sendSuspensionNotification(updatedAccount).catch(() => null);
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
    if (!verifyWebhookSignature(req.rawBody || '', signature)) {
      logger.error('[MONEI][WEBHOOK /payment] Firma inválida — devolviendo 401');
      return res.status(401).json({ error: 'Firma inválida' });
    }

    const payment = req.body || {};
    const paymentId = payment.id;
    const paymentStatus = payment.status;
    const subscriptionId = payment.subscriptionId;

    logger.info({ paymentId, paymentStatus, subscriptionId, fullPayment: payment }, '[MONEI] Webhook pago recibido');

    if (!subscriptionId) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const metadata = payment.metadata || {};
    const userId = metadata.userId;

    if (!userId) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const now = new Date();

    if (paymentStatus === 'SUCCEEDED') {
      const updatedAccount = await saveAccount(req, {
        ...account,
        subscription: {
          ...account.subscription,
          status: 'subscription_active',
          moneiSubscriptionStatus: 'ACTIVE',
          lastPaymentAt: now.toISOString(),
        },
        updatedAt: now.toISOString(),
      });
      sendPaymentSuccessNotification(updatedAccount).catch(() => null);
      logger.info({ paymentId, userId }, '[MONEI] Pago recurrente exitoso');
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
      logger.warn({ paymentId, userId }, '[MONEI] Pago recurrente fallido');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error(error, '[MONEI] Error procesando webhook de pago');
    return res.status(200).json({ ok: true });
  }
}
