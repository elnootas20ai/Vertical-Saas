import {
  buildMerchantSignupUrl,
  getPartnerPromoCode,
  mapAccountEventToConnectStatus,
  verifyPartnerWebhookSignature,
} from '../services/moneiConnect.js';
import { findAccountByUserId, saveAccount } from '../services/couchdb.js';
import logger from '../services/logger.js';

function mergeMoneiConnect(existing, patch) {
  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    promo: getPartnerPromoCode(),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * GET /api/monei-connect/signup-url
 * Devuelve enlace firmado para alta en MONEI vía partner Vertial.
 */
export async function getMoneiConnectSignupUrl(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const signupUrl = buildMerchantSignupUrl(userId);
    const now = new Date().toISOString();
    await saveAccount(req, {
      ...account,
      moneiConnect: mergeMoneiConnect(account.moneiConnect, {
        externalId: userId,
        signupStartedAt: account.moneiConnect?.signupStartedAt || now,
        lastSignupUrlAt: now,
      }),
      updatedAt: now,
    });

    return res.json({
      ok: true,
      signupUrl,
      promo: getPartnerPromoCode(),
      status: account.moneiConnect?.status || 'not_started',
      moneiAccountId: account.moneiConnect?.liveAccountId || account.moneiConnect?.testAccountId || null,
    });
  } catch (error) {
    logger.error(error, '[MONEI-Connect] Error generando signup URL');
    return res.status(500).json({ ok: false, error: 'No se pudo generar el enlace de alta MONEI' });
  }
}

/**
 * GET /api/monei-connect/status
 */
export async function getMoneiConnectStatus(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }

    const account = await findAccountByUserId(req, userId);
    const mc = account?.moneiConnect || {};

    return res.json({
      ok: true,
      promo: mc.promo || getPartnerPromoCode(),
      status: mc.status || 'not_started',
      externalId: mc.externalId || userId,
      testAccountId: mc.testAccountId || null,
      liveAccountId: mc.liveAccountId || null,
      adminEmail: mc.adminEmail || '',
      lastEventType: mc.lastEventType || '',
      lastEventAt: mc.lastEventAt || '',
      validated: Boolean(mc.liveAccountId || mc.testAccountId),
    });
  } catch (error) {
    logger.error(error, '[MONEI-Connect] Error leyendo estado');
    return res.status(500).json({ ok: false, error: error.message });
  }
}

/**
 * POST /api/monei-connect/webhook
 * Webhook partner MONEI Connect (account.*, charge.*, …).
 */
export async function moneiConnectPartnerWebhook(req, res) {
  try {
    const signature = req.headers['monei-signature'];
    const payload = req.body || {};
    const livemode = payload.livemode;

    if (!verifyPartnerWebhookSignature(req.rawBody || '', signature, livemode)) {
      logger.warn('[MONEI-Connect] Webhook partner — firma inválida');
      return res.status(401).json({ error: 'Firma inválida' });
    }

    const eventType = String(payload.type || '');
    const objectType = String(payload.objectType || '');
    const accountObj = payload.object && typeof payload.object === 'object' ? payload.object : {};
    const externalId = String(accountObj.externalId || '').trim();
    const moneiAccountId = String(
      payload.accountId || accountObj.id || payload.objectId || '',
    ).trim();
    const isTest = accountObj.test === true || livemode === false;

    logger.info(
      { eventType, objectType, externalId, moneiAccountId, isTest },
      '[MONEI-Connect] Webhook partner recibido',
    );

    if (objectType !== 'account' && !eventType.startsWith('account.')) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    let account = null;
    if (externalId) {
      account = await findAccountByUserId(req, externalId);
    }
    if (!account && moneiAccountId) {
      const { listAccounts } = await import('../services/couchdb.js');
      const all = await listAccounts(req);
      account = all.find(
        (a) =>
          a.moneiConnect?.liveAccountId === moneiAccountId ||
          a.moneiConnect?.testAccountId === moneiAccountId,
      );
    }

    if (!account) {
      logger.warn({ externalId, moneiAccountId, eventType }, '[MONEI-Connect] Cuenta Vertial no encontrada');
      return res.status(200).json({ ok: true, skipped: true, reason: 'account_not_found' });
    }

    const status = mapAccountEventToConnectStatus(eventType, accountObj.status);
    const patch = {
      externalId: externalId || account.user_id,
      status,
      lastEventType: eventType,
      lastEventAt: new Date().toISOString(),
      adminEmail: accountObj.adminEmail || account.moneiConnect?.adminEmail || '',
      merchantName: accountObj.name || account.moneiConnect?.merchantName || '',
      validatedAt: new Date().toISOString(),
    };

    if (moneiAccountId) {
      if (isTest) patch.testAccountId = moneiAccountId;
      else patch.liveAccountId = moneiAccountId;
    }

    await saveAccount(req, {
      ...account,
      moneiConnect: mergeMoneiConnect(account.moneiConnect, patch),
      updatedAt: new Date().toISOString(),
    });

    logger.info(
      { userId: account.user_id, status, moneiAccountId, eventType },
      '[MONEI-Connect] Alta MONEI validada y vinculada',
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error(error, '[MONEI-Connect] Error procesando webhook partner');
    return res.status(200).json({ ok: true });
  }
}
