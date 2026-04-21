import {
  listPayments,
  listSubscriptions,
  getSubscription,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  getPayment,
  createPayment,
  refundPayment,
  isTestMode,
  getFallbackApiKey,
  getDefaultMode,
  getMoneiCredentials,
} from '../services/monei.js';
import {
  listAccounts,
  findAccountByUserId,
  saveAccount,
  writeChangelog,
} from '../services/couchdb.js';
import logger from '../services/logger.js';

const MONEI_COMMISSION_PERCENT = 0.8;

function requireAdmin(req) {
  if (req.authUser?.role !== 'Admin') {
    return { ok: false, status: 403, error: 'Solo administradores' };
  }
  return null;
}

function resolveAdminMode(req) {
  const qMode = req.query?.mode;
  if (qMode === 'live' || qMode === 'test') return qMode;
  return getDefaultMode();
}

export async function getMoneiConfig(req, res) {
  try {
    const denied = requireAdmin(req);
    if (denied) return res.status(denied.status).json(denied);

    const live = getMoneiCredentials('live');
    const test = getMoneiCredentials('test');
    const currentMode = getDefaultMode();

    const activeKey = getFallbackApiKey(currentMode);
    const maskedKey = activeKey
      ? `${activeKey.slice(0, 12)}${'•'.repeat(Math.max(0, activeKey.length - 16))}${activeKey.slice(-4)}`
      : '';

    return res.json({
      ok: true,
      currentMode,
      maskedKey,
      fullKey: activeKey || '',
      testMode: currentMode === 'test',
      commissionPercent: MONEI_COMMISSION_PERCENT,
      live: {
        hasApiKey: live.hasApiKey,
        hasPublicKey: live.hasPublicKey,
      },
      test: {
        hasApiKey: test.hasApiKey,
        hasPublicKey: test.hasPublicKey,
      },
    });
  } catch (error) {
    logger.error(error, '[AdminMonei] Error obteniendo config');
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function getPaymentsList(req, res) {
  try {
    const denied = requireAdmin(req);
    if (denied) return res.status(denied.status).json(denied);

    const mode = resolveAdminMode(req);
    const { limit = 100, offset = 0, status, startDate, endDate } = req.query;
    const apiKey = getFallbackApiKey(mode);

    const result = await listPayments({
      limit: Number(limit),
      offset: Number(offset),
      status: status || undefined,
      startDate: startDate ? Number(startDate) : undefined,
      endDate: endDate ? Number(endDate) : undefined,
      sort: '-createdAt',
      apiKey,
    });

    return res.json({ ok: true, mode, ...result });
  } catch (error) {
    logger.error(error, '[AdminMonei] Error listando pagos');
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function getSubscriptionsList(req, res) {
  try {
    const denied = requireAdmin(req);
    if (denied) return res.status(denied.status).json(denied);

    const mode = resolveAdminMode(req);
    const { limit = 100, offset = 0, status } = req.query;
    const apiKey = getFallbackApiKey(mode);

    const result = await listSubscriptions({
      limit: Number(limit),
      offset: Number(offset),
      status: status || undefined,
      apiKey,
    });

    return res.json({ ok: true, mode, ...result });
  } catch (error) {
    logger.error(error, '[AdminMonei] Error listando suscripciones');
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function adminGetPayment(req, res) {
  try {
    const denied = requireAdmin(req);
    if (denied) return res.status(denied.status).json(denied);

    const { id } = req.params;
    const mode = resolveAdminMode(req);
    const apiKey = getFallbackApiKey(mode);
    const payment = await getPayment(id, apiKey);
    return res.json({ ok: true, mode, payment });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function adminGetSubscription(req, res) {
  try {
    const denied = requireAdmin(req);
    if (denied) return res.status(denied.status).json(denied);

    const { id } = req.params;
    const mode = resolveAdminMode(req);
    const apiKey = getFallbackApiKey(mode);
    const subscription = await getSubscription(id, apiKey);
    return res.json({ ok: true, mode, subscription });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function adminCancelSubscription(req, res) {
  try {
    const denied = requireAdmin(req);
    if (denied) return res.status(denied.status).json(denied);

    const { id } = req.params;
    const mode = resolveAdminMode(req);
    const apiKey = getFallbackApiKey(mode);
    const result = await cancelSubscription(id, apiKey);
    return res.json({ ok: true, mode, result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function adminPauseSubscription(req, res) {
  try {
    const denied = requireAdmin(req);
    if (denied) return res.status(denied.status).json(denied);

    const { id } = req.params;
    const mode = resolveAdminMode(req);
    const apiKey = getFallbackApiKey(mode);
    const result = await pauseSubscription(id, apiKey);
    return res.json({ ok: true, mode, result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function adminResumeSubscription(req, res) {
  try {
    const denied = requireAdmin(req);
    if (denied) return res.status(denied.status).json(denied);

    const { id } = req.params;
    const mode = resolveAdminMode(req);
    const apiKey = getFallbackApiKey(mode);
    const result = await resumeSubscription(id, apiKey);
    return res.json({ ok: true, mode, result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function adminRefundPayment(req, res) {
  try {
    const denied = requireAdmin(req);
    if (denied) return res.status(denied.status).json(denied);

    const { id } = req.params;
    const { amount, reason } = req.body || {};
    const mode = resolveAdminMode(req);
    const apiKey = getFallbackApiKey(mode);
    const result = await refundPayment(id, { amount, reason, apiKey });
    return res.json({ ok: true, mode, result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function adminTestPayment(req, res) {
  try {
    const denied = requireAdmin(req);
    if (denied) return res.status(denied.status).json(denied);

    const { amount = 100, description = 'Test payment', orderId, mode } =
      req.body || {};
    const resolvedMode = mode === 'live' ? 'live' : 'test';
    const apiKey = getFallbackApiKey(resolvedMode);

    if (!apiKey) {
      return res.status(400).json({
        ok: false,
        error: `No hay API key configurada para modo ${resolvedMode.toUpperCase()}. Revisa .env`,
      });
    }

    const APP_URL = process.env.APP_URL || 'http://localhost:3005';
    const baseUrl = APP_URL.replace(/\/$/, '');

    const payment = await createPayment({
      amount: Number(amount),
      currency: 'EUR',
      orderId: orderId || `${resolvedMode}_${Date.now()}`,
      description,
      completeUrl: `${baseUrl}/saas/admin?payment_test=complete`,
      cancelUrl: `${baseUrl}/saas/admin?payment_test=cancel`,
      callbackUrl: `${baseUrl}/api/subscriptions/webhook/payment`,
      apiKey,
    });

    return res.json({ ok: true, payment, mode: resolvedMode });
  } catch (error) {
    logger.error(error, '[AdminMonei] Error creando pago de prueba');
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function adminGrantFreeMonths(req, res) {
  try {
    const denied = requireAdmin(req);
    if (denied) return res.status(denied.status).json(denied);

    const { userId, months } = req.body || {};

    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId es requerido' });
    }
    if (![1, 2].includes(Number(months))) {
      return res.status(400).json({ ok: false, error: 'months debe ser 1 o 2' });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const now = new Date();
    const numMonths = Number(months);
    const sub = account.subscription || {};
    const previousStatus = sub.status;

    const baseDate = sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now
      ? new Date(sub.currentPeriodEnd)
      : now;

    const newPeriodEnd = new Date(baseDate);
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + numMonths);

    const newGracePeriodEnd = new Date(newPeriodEnd);
    newGracePeriodEnd.setDate(newGracePeriodEnd.getDate() + 7);

    const previousFreeMonths = Array.isArray(sub.freeMonthsHistory) ? sub.freeMonthsHistory : [];

    const updatedAccount = await saveAccount(req, {
      ...account,
      subscription: {
        ...sub,
        status: 'subscription_active',
        currentPeriodEnd: newPeriodEnd.toISOString(),
        gracePeriodEndsAt: newGracePeriodEnd.toISOString(),
        freeMonthsHistory: [
          ...previousFreeMonths,
          {
            months: numMonths,
            grantedAt: now.toISOString(),
            grantedBy: req.authUser?.userId || 'admin',
            previousPeriodEnd: sub.currentPeriodEnd || null,
            newPeriodEnd: newPeriodEnd.toISOString(),
          },
        ],
      },
      updatedAt: now.toISOString(),
    });

    await writeChangelog(req, {
      entity: 'subscription',
      entityId: account.user_id,
      entityLabel: account.fullName || account.email,
      action: 'grant_free_months',
      actorUserId: req.authUser?.userId || 'admin',
      actorName: req.authUser?.fullName || 'Admin',
      changes: {
        status: { before: previousStatus, after: 'subscription_active' },
        currentPeriodEnd: { before: sub.currentPeriodEnd || null, after: newPeriodEnd.toISOString() },
        freeMonths: { before: null, after: numMonths },
      },
      metadata: { months: numMonths, userId },
    });

    logger.info(
      { userId, months: numMonths, newPeriodEnd: newPeriodEnd.toISOString() },
      `[Admin] Concedidos ${numMonths} mes(es) gratis a ${account.fullName || account.email}`,
    );

    return res.json({
      ok: true,
      subscription: updatedAccount.subscription,
      grantedMonths: numMonths,
      newPeriodEnd: newPeriodEnd.toISOString(),
    });
  } catch (error) {
    logger.error(error, '[Admin] Error concediendo meses gratis');
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function getDashboardStats(req, res) {
  try {
    const denied = requireAdmin(req);
    if (denied) return res.status(denied.status).json(denied);

    const mode = resolveAdminMode(req);
    const apiKey = getFallbackApiKey(mode);

    const [paymentsResult, subscriptionsResult] = await Promise.allSettled([
      listPayments({ limit: 1000, sort: '-createdAt', apiKey }),
      listSubscriptions({ limit: 1000, apiKey }),
    ]);

    const payments =
      paymentsResult.status === 'fulfilled'
        ? Array.isArray(paymentsResult.value)
          ? paymentsResult.value
          : paymentsResult.value?.data || []
        : [];
    const subscriptions =
      subscriptionsResult.status === 'fulfilled'
        ? Array.isArray(subscriptionsResult.value)
          ? subscriptionsResult.value
          : subscriptionsResult.value?.data || []
        : [];

    const succeededPayments = payments.filter(
      (p) => p.status === 'SUCCEEDED',
    );
    const totalRevenue = succeededPayments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0,
    );
    const commissionAmount = Math.round(
      (totalRevenue * MONEI_COMMISSION_PERCENT) / 100,
    );
    const netRevenue = totalRevenue - commissionAmount;

    const activeSubscriptions = subscriptions.filter(
      (s) => s.status === 'ACTIVE' || s.status === 'TRIALING',
    );
    const pastDueSubscriptions = subscriptions.filter(
      (s) => s.status === 'PAST_DUE',
    );
    const cancelledSubscriptions = subscriptions.filter(
      (s) => s.status === 'CANCELLED',
    );
    const pausedSubscriptions = subscriptions.filter(
      (s) => s.status === 'PAUSED',
    );

    const monthlyRecurring = activeSubscriptions.reduce((sum, s) => {
      if (s.interval === 'month') return sum + (s.amount || 0);
      if (s.interval === 'year') return sum + Math.round((s.amount || 0) / 12);
      if (s.interval === 'week') return sum + (s.amount || 0) * 4;
      if (s.interval === 'day') return sum + (s.amount || 0) * 30;
      return sum;
    }, 0);

    const paymentsByDate = {};
    for (const p of succeededPayments) {
      const date = p.createdAt
        ? new Date(p.createdAt * 1000).toISOString().slice(0, 10)
        : null;
      if (date) {
        if (!paymentsByDate[date])
          paymentsByDate[date] = { date, count: 0, amount: 0 };
        paymentsByDate[date].count += 1;
        paymentsByDate[date].amount += p.amount || 0;
      }
    }
    const dailyData = Object.values(paymentsByDate).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    let accounts = [];
    try {
      accounts = await listAccounts(req);
    } catch {
      /* ignore */
    }

    const usersWithSubscription = accounts.filter(
      (a) => a.subscription?.moneiSubscriptionId,
    );
    const activeUsers = accounts.filter(
      (a) =>
        a.subscription?.status === 'subscription_active' ||
        a.subscription?.status === 'trial_active',
    );
    const unpaidUsers = accounts.filter(
      (a) =>
        a.subscription?.status === 'payment_failed' ||
        a.subscription?.status === 'suspended',
    );
    const noSubscriptionUsers = accounts.filter(
      (a) => !a.subscription?.moneiSubscriptionId,
    );

    const forecastMonths = 6;
    const forecast = [];
    for (let i = 1; i <= forecastMonths; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      forecast.push({
        month: d.toISOString().slice(0, 7),
        projected: monthlyRecurring,
        projectedNet:
          monthlyRecurring -
          Math.round((monthlyRecurring * MONEI_COMMISSION_PERCENT) / 100),
      });
    }

    return res.json({
      ok: true,
      mode,
      stats: {
        totalPayments: payments.length,
        succeededPayments: succeededPayments.length,
        totalRevenue,
        commissionAmount,
        commissionPercent: MONEI_COMMISSION_PERCENT,
        netRevenue,
        activeSubscriptions: activeSubscriptions.length,
        pastDueSubscriptions: pastDueSubscriptions.length,
        cancelledSubscriptions: cancelledSubscriptions.length,
        pausedSubscriptions: pausedSubscriptions.length,
        totalSubscriptions: subscriptions.length,
        monthlyRecurring,
        totalUsers: accounts.length,
        activeUsers: activeUsers.length,
        unpaidUsers: unpaidUsers.length,
        noSubscriptionUsers: noSubscriptionUsers.length,
        usersWithSubscription: usersWithSubscription.length,
      },
      dailyData,
      forecast,
      subscriptions,
      payments: succeededPayments.slice(0, 200),
      userBreakdown: {
        active: activeUsers.map((a) => ({
          userId: a.user_id || a._id,
          fullName:
            a.fullName ||
            `${a.firstName || ''} ${a.lastName || ''}`.trim(),
          email: a.email,
          plan: a.subscription?.planName || a.subscription?.selectedPlanId,
          status: a.subscription?.status,
          lastPaymentAt: a.subscription?.lastPaymentAt,
        })),
        unpaid: unpaidUsers.map((a) => ({
          userId: a.user_id || a._id,
          fullName:
            a.fullName ||
            `${a.firstName || ''} ${a.lastName || ''}`.trim(),
          email: a.email,
          plan: a.subscription?.planName || a.subscription?.selectedPlanId,
          status: a.subscription?.status,
          lastPaymentAt: a.subscription?.lastPaymentAt,
        })),
        noSubscription: noSubscriptionUsers.map((a) => ({
          userId: a.user_id || a._id,
          fullName:
            a.fullName ||
            `${a.firstName || ''} ${a.lastName || ''}`.trim(),
          email: a.email,
          createdAt: a.createdAt,
        })),
      },
    });
  } catch (error) {
    logger.error(error, '[AdminMonei] Error obteniendo stats del dashboard');
    return res.status(500).json({ ok: false, error: error.message });
  }
}
