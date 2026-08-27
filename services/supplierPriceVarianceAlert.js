/**
 * Persiste variación de precio en la factura y emite alerta/notificación.
 */

import {
  findAccountByUserId,
  getCatalogDbName,
  getDocument,
  listCatalogItemsByUser,
  putDocument,
} from './couchdb.js';
import { emitGlobalAlert } from './alertEmitter.js';
import logger from './logger.js';
import { detectSupplierPriceVariance, emptySupplierPriceVariance } from './supplierPriceVariance.js';

function formatEur(n) {
  const v = Number(n) || 0;
  return `${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

async function loadLinkedOrderItems(req, invoice) {
  const orderId = String(invoice?.linkedPurchaseOrderId || '').trim();
  if (!orderId) return [];
  try {
    const db = getCatalogDbName();
    const order = await getDocument(req, db, orderId);
    if (!order || order.type !== 'purchase_order') return [];
    return Array.isArray(order.items) ? order.items : [];
  } catch {
    return [];
  }
}

function buildAlertMessage(invoice, variance) {
  const supplier = String(invoice?.supplierName || 'Proveedor').trim() || 'Proveedor';
  const docLabel = String(invoice?.documentKind || '').toLowerCase().includes('albaran')
    ? 'Albarán'
    : 'Factura';
  const num = String(invoice?.invoiceNumber || '').trim();
  const head = num ? `${docLabel} ${num}` : docLabel;
  const sample = (variance.lines || []).slice(0, 3).map((l) => {
    const dir = l.deltaAbs > 0 ? '↑' : '↓';
    return `${l.name}: ${formatEur(l.expectedUnitCost)} → ${formatEur(l.invoiceUnitCost)} (${dir}${l.deltaPct}%)`;
  });
  const more =
    (variance.lines || []).length > 3
      ? ` · +${variance.lines.length - 3} más`
      : '';
  return `${head} de ${supplier}: ${variance.lines.length} artículo(s) con precio distinto al coste esperado. ${sample.join(' · ')}${more}`;
}

/**
 * Compara líneas vs coste esperado, guarda `priceVariance` en el doc y notifica si hay cambios.
 * @returns {Promise<object|null>} factura actualizada o null
 */
export async function applySupplierPriceVarianceCheck(req, userId, invoice) {
  const invoiceId = String(invoice?._id || '').trim();
  const uid = String(userId || invoice?.user_id || '').trim();
  if (!invoiceId || !uid) return null;

  try {
    const db = getCatalogDbName();
    const [catalogItems, orderItems, account] = await Promise.all([
      listCatalogItemsByUser(req, uid).catch(() => []),
      loadLinkedOrderItems(req, invoice),
      findAccountByUserId(req, uid).catch(() => null),
    ]);

    const variance = detectSupplierPriceVariance({
      lines: invoice.lines || [],
      catalogItems,
      orderItems,
    });

    let fresh;
    try {
      fresh = await getDocument(req, db, invoiceId);
    } catch {
      fresh = invoice;
    }
    if (!fresh || fresh.deletedAt) return null;

    const nextFlags = {
      ...((fresh.flags && typeof fresh.flags === 'object' && !Array.isArray(fresh.flags))
        ? fresh.flags
        : {}),
      priceVariance: Boolean(variance.hasVariance),
    };

    const updated = {
      ...fresh,
      priceVariance: variance.hasVariance ? variance : emptySupplierPriceVariance(variance.checkedAt),
      flags: nextFlags,
      updatedAt: new Date().toISOString(),
    };

    const saved = await putDocument(req, db, updated._id, updated);
    const withRev = { ...updated, _rev: saved.rev };

    if (variance.hasVariance) {
      const businessId = String(
        withRev.businessId ||
          withRev.business_id ||
          account?.linkedBusinessId ||
          '',
      ).trim();
      const ownerUserId = String(account?.user_id || uid).trim();
      const route = `/saas/catalog?tab=invoices&invoice=${encodeURIComponent(invoiceId)}`;

      await emitGlobalAlert({
        businessId,
        userId: ownerUserId,
        source: 'stock',
        ruleId: 'supplier_price_changed',
        category: 'supplier_price_changed',
        priority: 'high',
        level: 'alert',
        title: 'Precio distinto al esperado',
        message: buildAlertMessage(withRev, variance),
        entityId: invoiceId,
        entityType: 'purchase_invoice',
        route,
        dedupKey: `supplier-price-${invoiceId}`,
        metadata: {
          invoiceId,
          invoiceNumber: withRev.invoiceNumber || '',
          supplierId: withRev.supplierId || '',
          supplierName: withRev.supplierName || '',
          varianceCount: variance.lines.length,
          lines: variance.lines.slice(0, 20),
        },
      }).catch((err) => {
        logger.warn(
          { tag: 'SUPPLIER_PRICE_VAR', err: err?.message || err },
          'No se pudo emitir alerta de precio',
        );
      });
    }

    return withRev;
  } catch (err) {
    logger.warn(
      { tag: 'SUPPLIER_PRICE_VAR', invoiceId, err: err?.message || err },
      'Error comprobando variación de precio proveedor',
    );
    return null;
  }
}
