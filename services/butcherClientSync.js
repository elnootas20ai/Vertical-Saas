/**
 * Sync carnicería → CRM core (espejo ligero de deliveryClientSync).
 */

import {
  ensureDatabase,
  getDocument,
  putDocument,
  getClientsDbName,
  listClientsByUser,
  buildClientDocument,
} from './couchdb.js';
import { getButcherDbName } from './butcherShop.js';
import logger from './logger.js';

const TAG = 'BUTCHER_CLIENT_SYNC';

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

async function findCrmClient(req, userId, { linkedCrmClientId, phone, email, name }) {
  const db = getClientsDbName();
  await ensureDatabase(req, db);

  if (linkedCrmClientId) {
    try {
      const doc = await getDocument(req, db, linkedCrmClientId);
      if (doc && doc.type === 'client' && (!userId || doc.user_id === userId) && !doc.deletedAt) {
        return doc;
      }
    } catch { /* continue */ }
  }

  const clients = await listClientsByUser(req, userId).catch(() => []);
  const phoneNorm = normalizePhone(phone);
  const emailNorm = String(email || '').trim().toLowerCase();

  if (phoneNorm.length >= 6) {
    const byPhone = clients.find((c) => normalizePhone(c.phone || c.mobile || '') === phoneNorm);
    if (byPhone) return byPhone;
  }
  if (emailNorm) {
    const byEmail = clients.find((c) => String(c.email || '').trim().toLowerCase() === emailNorm);
    if (byEmail) return byEmail;
  }
  if (name) {
    const n = String(name).trim().toLowerCase();
    const byName = clients.find((c) => String(c.name || c.fullName || '').trim().toLowerCase() === n);
    if (byName) return byName;
  }
  return null;
}

export async function syncCrmAfterButcherSale(req, userId, sale = {}) {
  try {
    if (!userId || !sale) return null;
    const butcherDb = getButcherDbName();
    let butcherClient = null;
    if (sale.clientId) {
      try {
        butcherClient = await getDocument(req, butcherDb, sale.clientId);
      } catch { butcherClient = null; }
    }

    const phone = sale.clientPhone || butcherClient?.phone || '';
    const email = butcherClient?.email || '';
    const name = sale.clientName || butcherClient?.name || '';
    if (!name && !phone && !email) return null;

    const total = Number(sale.total || 0);
    const now = new Date().toISOString();

    let crm = await findCrmClient(req, userId, {
      linkedCrmClientId: butcherClient?.linkedCrmClientId,
      phone,
      email,
      name,
    });

    const crmDb = getClientsDbName();
    await ensureDatabase(req, crmDb);

    if (!crm) {
      const doc = buildClientDocument(userId, {
        name: name || phone || 'Cliente carnicería',
        phone,
        email,
        source: 'butcherShop',
        tags: ['carniceria'],
        totalSpent: total,
        ordersCount: 1,
        lastOrderAt: now,
      });
      const saved = await putDocument(req, crmDb, doc._id, doc);
      crm = { ...doc, _rev: saved?.rev };
    } else {
      const prevSpent = Number(crm.totalSpent || crm.stats?.totalSpent || 0);
      const prevOrders = Number(crm.ordersCount || crm.stats?.ordersCount || 0);
      const updated = {
        ...crm,
        totalSpent: prevSpent + total,
        ordersCount: prevOrders + 1,
        lastOrderAt: now,
        phone: crm.phone || phone,
        email: crm.email || email,
        updatedAt: now,
      };
      const saved = await putDocument(req, crmDb, updated._id, updated);
      crm = { ...updated, _rev: saved?.rev };
    }

    if (butcherClient && butcherClient.type === 'butcher_client' && !butcherClient.linkedCrmClientId) {
      await putDocument(req, butcherDb, butcherClient._id, {
        ...butcherClient,
        linkedCrmClientId: crm._id,
        updatedAt: now,
      });
    }

    return crm;
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message }, 'Sync CRM carnicería falló');
    return null;
  }
}
