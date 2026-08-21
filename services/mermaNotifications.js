/**
 * Merma de almacén/carta (lo que sobra) → aviso al titular + Admin/Gerente invitados.
 * Campana + push fuera de la app. NO carnicería.
 */
import {
  buildNotificationDocument,
  findAccountByUserId,
  findBusinessById,
  getDocument,
  saveNotification,
  sanitizeNotification,
  ensureDatabase,
} from './couchdb.js';
import { broadcastToUser } from './sseService.js';
import { sendPushToUser } from './pushService.js';
import logger from './logger.js';

function normalizeUserId(value) {
  return String(value || '').replace(/^account:/, '').trim();
}

function bareBusinessId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

function isManagementInviteRole(role) {
  const r = String(role || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    r === 'admin'
    || r === 'administrador'
    || r === 'owner'
    || r === 'gerente'
    || r === 'gerentogrupo'
    || r === 'manager'
    || r === 'encargado'
    || r === 'gestor'
    || r === 'superadmin'
  );
}

function formatQty(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

/**
 * Destinatarios: titular + miembros de gestión invitados.
 */
async function resolveMermaRecipients(req, { dataUserId = '', businessId = '' } = {}) {
  const recipients = new Set();
  const bid = bareBusinessId(businessId);
  if (bid) {
    const business = await findBusinessById(req, bid).catch(() => null);
    const ownerId = normalizeUserId(business?.owner_user_id);
    if (ownerId) recipients.add(ownerId);
    for (const m of business?.members || []) {
      const uid = normalizeUserId(m?.user_id);
      if (!uid) continue;
      if (isManagementInviteRole(m.role)) recipients.add(uid);
    }
  }

  if (recipients.size === 0) {
    const uid = normalizeUserId(dataUserId);
    if (!uid) return [];
    const account = await findAccountByUserId(req, uid).catch(() => null);
    if (account && !String(account.invitedBy || '').trim()) {
      recipients.add(normalizeUserId(account.user_id || uid));
    } else if (account?.invitedBy) {
      recipients.add(normalizeUserId(account.invitedBy));
    } else {
      recipients.add(uid);
    }
  }

  return [...recipients];
}

/**
 * @param {{
 *   dataUserId: string,
 *   businessId?: string,
 *   wasteId?: string,
 *   productName: string,
 *   quantity: number,
 *   unit?: string,
 *   baseQuantity?: number,
 *   estimatedCost?: number,
 *   wasteTypeLabel?: string,
 *   reportedByName?: string,
 *   route?: string,
 * }} opts
 */
export async function notifyMermaRegisteredCeo(req, opts = {}) {
  try {
    const productName = String(opts.productName || 'Producto').trim() || 'Producto';
    const qty = Math.abs(Number(opts.quantity) || 0);
    if (qty <= 0) return null;

    const recipients = await resolveMermaRecipients(req, {
      dataUserId: opts.dataUserId,
      businessId: opts.businessId,
    });
    if (!recipients.length) return null;

    const unit = String(opts.unit || 'ud').trim() || 'ud';
    const unitPart = unit === 'ud' || unit === 'uds' || unit === 'unidad' || unit === 'unidades'
      ? productName
      : `${formatQty(qty)} ${unit} · ${productName}`;
    const unitsLine = unit === 'ud' || unit === 'uds' || unit === 'unidad' || unit === 'unidades'
      ? `Merma (unidades) = ${formatQty(qty)} ${productName}`
      : `Merma = ${unitPart}`;

    const base = Number(opts.baseQuantity);
    let pctLine = '';
    let pct = null;
    if (Number.isFinite(base) && base > 0) {
      pct = Math.round((qty / base) * 1000) / 10;
      pctLine = `% Merma = (${formatQty(qty)} / ${formatQty(base)}) × 100 = ${pct}%`;
    }

    const message = pctLine ? `${unitsLine}. ${pctLine}` : unitsLine;
    const title = 'Merma registrada';
    const route = String(opts.route || '/saas/catalog').trim() || '/saas/catalog';
    const wasteId = String(opts.wasteId || '').trim();

    await ensureDatabase(req, 'notifications');

    let first = null;
    for (const recipient of recipients) {
      const account = await findAccountByUserId(req, recipient).catch(() => null);
      const docId = wasteId
        ? `notification:merma:${wasteId}:${recipient}`
        : null;

      if (docId) {
        const existing = await getDocument(req, 'notifications', docId).catch(() => null);
        if (existing?._rev && !existing.deletedAt) {
          if (!first) first = sanitizeNotification(existing);
          continue;
        }
      }

      const notification = buildNotificationDocument({
        userId: recipient,
        level: 'warning',
        category: 'merma_registered',
        title,
        message,
        entityId: wasteId,
        entityType: 'waste_record',
        route,
        metadata: {
          action: 'merma_registered',
          quantity: qty,
          baseQuantity: Number.isFinite(base) && base > 0 ? base : null,
          mermaPct: pct,
          productName,
          unit,
          estimatedCost: Number(opts.estimatedCost) || 0,
          wasteType: String(opts.wasteTypeLabel || ''),
          reportedByName: String(opts.reportedByName || ''),
          polarity: 'negative',
        },
      });

      const doc = {
        ...notification,
        ...(docId ? { _id: docId } : {}),
        kind: 'negative',
        polarity: 'negative',
      };

      const saved = await saveNotification(req, doc);
      const sanitized = sanitizeNotification(saved);
      broadcastToUser(recipient, 'notification', sanitized);

      const declined = account?.notificationPreferences?.pushConsent?.decision === 'declined';
      if (!declined) {
        sendPushToUser(req, recipient, {
          title: sanitized.title,
          body: sanitized.message,
          data: { route: sanitized.route || route, notificationId: sanitized.id },
          collapseId: sanitized.id || undefined,
        }).catch((err) => logger.warn({ tag: 'MERMA_PUSH', err: err?.message }, 'Push merma falló'));
      }

      if (!first) first = sanitized;
    }

    return first;
  } catch (err) {
    logger.warn({ tag: 'MERMA_NOTIFY', err: err?.message }, 'No se pudo notificar merma');
    return null;
  }
}
