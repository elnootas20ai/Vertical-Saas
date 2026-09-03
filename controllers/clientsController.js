import {
  getClientsDbName,
  buildClientDocument,
  sanitizeClient,
  sanitizeClientSummary,
  listClientsByUser,
  findDuplicateClients,
  listBusinessesByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  bulkPutDocuments,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  getSalesDbName,
  getInvoicesDbName,
  getAllDocuments,
  buildClientNoteDocument,
  sanitizeClientNote,
  listClientNotesByClient,
  buildClientPromotionDocument,
  sanitizeClientPromotion,
  listClientPromotionsByClient,
  searchClientsByPhoneWithMeta,
  searchClientsForList,
  listDeliveryOrdersByUser,
  resolveDataOwnerUserId,
  invalidateClientDocumentsForUser,
  sanitizeClientForTpvSearch,
} from '../services/couchdb.js';
import { chunkDocs, resolveBulkImportLimits } from '../services/bulkImportBatch.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';
import {
  deliveryOrderMatchesClient,
  deliveryOrderRevenue,
  isCancelledDeliveryOrder,
} from '../shared/clients/deliveryClientMatch.js';
import {
  syncClientFromDeliveryOrders,
  enrichClientRowWithLiveDeliveryStats,
  groupDeliveryOrdersByClientRows,
  scopeDeliveryOrdersToBusinessId,
  scopeDeliveryOrdersToClientBusiness,
} from '../services/deliveryClientSync.js';
import {
  enrichClientRowWithLiveDiningStats,
  groupDiningOrdersByClientRows,
  loadDiningOrdersForClientCrm,
  mergeClientLiveStats,
} from '../services/restaurantClientSync.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function normalizeBusinessScopeId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

function resolveQueryBusinessId(req) {
  return normalizeBusinessScopeId(req.query?.businessId || req.query?.business_id || '');
}

const businessCountCache = new Map(); // userId -> { at, count }
const BUSINESS_COUNT_TTL_MS = 120_000;

async function countActiveBusinesses(req, userId) {
  const uid = String(userId || '').trim();
  const cached = businessCountCache.get(uid);
  if (cached && Date.now() - cached.at < BUSINESS_COUNT_TTL_MS) {
    return cached.count;
  }
  const businesses = await listBusinessesByUser(req, userId);
  const count = businesses.filter((b) => !b?.deletedAt).length;
  businessCountCache.set(uid, { at: Date.now(), count });
  return count;
}

async function resolveBusinessTypeForScope(req, userId, businessId) {
  const fromQuery = String(req.query?.businessType || req.query?.business_type || '').trim();
  if (fromQuery) return fromQuery;
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return '';
  try {
    const businesses = await listBusinessesByUser(req, userId);
    const biz = businesses.find(
      (b) => normalizeBusinessScopeId(b.business_id || b._id) === bid,
    );
    return String(biz?.businessType || '').trim();
  } catch {
    return '';
  }
}

async function resolveClientListOptions(req, userId, businessId) {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return {};
  const count = await countActiveBusinesses(req, userId);
  const multiBusiness = count > 1;
  const businessType = await resolveBusinessTypeForScope(req, userId, bid);
  const bt = businessType.toLowerCase();
  /**
   * Solo delivery (1 empresa) mantiene legacy CRM/TPV histórico.
   * Resto de verticales: NUNCA mezclar clientes de delivery u otra sede.
   */
  const allowDeliveryLegacy = bt === 'delivery' && !multiBusiness;
  const strictBusinessScope = !allowDeliveryLegacy;
  return {
    businessId: bid,
    legacySingleBusiness: allowDeliveryLegacy,
    excludeUnscopedLegacy: strictBusinessScope,
  };
}

async function resolveCreateBusinessId(req, userId, client = {}) {
  const explicit = normalizeBusinessScopeId(
    client?.businessId || client?.business_id || req.query?.businessId || req.body?.businessId,
  );
  if (explicit) return explicit;
  const businesses = await listBusinessesByUser(req, userId);
  const active = businesses.filter((b) => !b?.deletedAt);
  if (active.length === 1) {
    const only = active[0];
    return normalizeBusinessScopeId(only.business_id || only.businessId || only._id);
  }
  if (active.length === 0) return '';
  return null;
}

async function ensureClientOwner(req, userId, clientId) {
  const { ownerUserId } = await resolveDataOwnerUserId(req, userId);
  const db = getClientsDbName();
  await ensureDatabase(req, db);
  const client = await getDocument(req, db, clientId);
  if (!client || client.type !== 'client' || client.user_id !== ownerUserId) {
    return null;
  }
  return client;
}

export async function listClients(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const { ownerUserId, account } = await resolveDataOwnerUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    if (String(req.query?.refresh || '') === '1') {
      invalidateClientDocumentsForUser(ownerUserId);
    }

    const businessId = resolveQueryBusinessId(req);
    const businessTypeHint = String(req.query?.businessType || req.query?.business_type || '').trim();
    const btHint = businessTypeHint.toLowerCase();
    // Fuera de delivery: sin empresa activa → lista vacía (no tirar de cartera delivery).
    if (btHint && btHint !== 'delivery' && !businessId) {
      return res.json({
        ok: true,
        clients: [],
        meta: { total: 0, skip: 0, limit: 0, hasMore: false },
      });
    }
    const listOptions = await resolveClientListOptions(req, ownerUserId, businessId);
    const searchParam = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const query = { ...req.query };
    const pageLimit = query.limit !== undefined ? Number(query.limit) : NaN;
    const pageSkip = Math.max(0, Number(query.skip) || 0);
    // Solo páginas CRM (20…): limit=1 es conteo/warmup TPV y necesita cartera real en meta.total.
    const wantsPage =
      Number.isFinite(pageLimit)
      && pageLimit >= 10
      && pageLimit <= 500
      && !searchParam;
    let raw;
    let progressivePartial = false;
    if (searchParam) {
      // Índice en memoria: no recorrer miles de docs en cada tecla del CRM.
      raw = await searchClientsForList(req, ownerUserId, searchParam, listOptions);
      delete query.search;
    } else if (wantsPage) {
      // Primera pintura: solo skip+limit (evita spinner eterno en carteras ~6k).
      const need = Math.min(2_000, Math.max(pageSkip + pageLimit + 1, pageLimit));
      raw = await listClientsByUser(req, ownerUserId, {
        ...listOptions,
        pageOnlyMaxDocs: need,
      });
      // Solo “parcial” si llenamos el tope (aún puede haber más en Couch).
      progressivePartial = raw.length >= need;
    } else {
      raw = await listClientsByUser(req, ownerUserId, listOptions);
    }
    const useLite = req.query.lite === '1' || req.query.lite === 'true';
    const sanitizer = useLite ? sanitizeClientSummary : sanitizeClient;
    if (useLite && query.limit === undefined && query.skip === undefined) {
      query.limit = '50';
      query.skip = '0';
    }
    // Paginar/filtrar sobre docs crudos; sanitizar solo la página (miles de clientes).
    const { items: pageDocs, meta } = applyQueryOptions(raw, query);
    if (progressivePartial) {
      meta.partial = true;
      const lim = Number(meta.limit) || pageLimit || 20;
      if (pageDocs.length >= lim) {
        meta.hasMore = true;
        meta.total = Math.max(Number(meta.total) || 0, pageSkip + lim + 1);
      }
    }
    let clients = pageDocs.map(sanitizer).filter(Boolean);
    const enrichLiveStats = req.query.liveStats === '1' || req.query.liveStats === 'true';
    if (enrichLiveStats && clients.length > 0) {
      // Solo delivery puede enriquecer con pedidos. Resto de verticales: CRM core.
      let skipOrderEnrichment = true;
      if (businessId) {
        try {
          const businesses = await listBusinessesByUser(req, ownerUserId);
          const biz = businesses.find(
            (b) => normalizeBusinessScopeId(b.business_id || b._id) === businessId,
          );
          const bt = String(biz?.businessType || '').trim().toLowerCase();
          skipOrderEnrichment = bt !== 'delivery';
        } catch {
          skipOrderEnrichment = true;
        }
      }
      if (!skipOrderEnrichment) {
        const allOrders = await listDeliveryOrdersByUser(req, ownerUserId);
        const deliveryOrders = businessId
          ? await scopeDeliveryOrdersToBusinessId(req, ownerUserId, businessId, allOrders)
          : allOrders;
        let diningOrders = [];
        try {
          diningOrders = await loadDiningOrdersForClientCrm(req, ownerUserId, businessId);
        } catch {
          diningOrders = [];
        }
        // Solo pedidos de las filas de esta página (20–50), no re-escanear todo el historial por cliente.
        const deliveryByClient = groupDeliveryOrdersByClientRows(deliveryOrders, clients);
        const diningByClient = diningOrders.length
          ? groupDiningOrdersByClientRows(diningOrders, clients)
          : null;
        clients = clients.map((row) => {
          const rowId = String(row.id || '').trim();
          const withDelivery = enrichClientRowWithLiveDeliveryStats(
            row,
            deliveryByClient.get(rowId) || [],
          );
          if (!diningByClient) return withDelivery;
          const withDining = enrichClientRowWithLiveDiningStats(
            row,
            diningByClient.get(rowId) || [],
          );
          return mergeClientLiveStats(row, withDelivery, withDining);
        });
      }
    }
    return res.json({ ok: true, clients, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar clientes' });
  }
}

export async function createClient(req, res) {
  try {
    const { userId } = req.params;
    const { client } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!client || typeof client !== 'object') return badRequest(res, 'Falta el objeto client en el body');
    if (!client.name?.trim()) return badRequest(res, 'El nombre del cliente es obligatorio');

    const tags = Array.isArray(client.tags) ? client.tags.map((t) => String(t || '').trim()).filter(Boolean) : [];
    // Legacy: fichas antiguas «cliente perdido». Atención rápida nueva ya no crea CRM sin teléfono.
    const allowEmptyPhone =
      tags.includes('cliente-perdido') || client.allowEmptyPhone === true || client.stats?.lostFromQuickAttention === true;

    const rawPhone = String(client.phone || '').trim();
    const cleanPhone = rawPhone.replace(/\D/g, '');
    // TPV delivery: solo dígitos, sin forzar prefijo; extranjeros 7–15 (E.164).
    const MIN_PHONE = 7;
    const MAX_PHONE = 15;
    if (!allowEmptyPhone) {
      if (!rawPhone) return badRequest(res, 'El teléfono del cliente es obligatorio');
      if (cleanPhone.length < MIN_PHONE) {
        return res.status(400).json({
          ok: false,
          error: `El teléfono debe tener al menos ${MIN_PHONE} dígitos`,
          field: 'phone',
        });
      }
      if (cleanPhone.length > MAX_PHONE) {
        return res.status(400).json({
          ok: false,
          error: `El teléfono no puede tener más de ${MAX_PHONE} dígitos`,
          field: 'phone',
        });
      }
      if (!/^[\d\s+\-().]+$/.test(rawPhone)) {
        return res.status(400).json({ ok: false, error: 'El teléfono contiene caracteres no válidos', field: 'phone' });
      }
    } else if (rawPhone && cleanPhone.length > 0 && cleanPhone.length < MIN_PHONE) {
      return res.status(400).json({
        ok: false,
        error: `El teléfono debe tener al menos ${MIN_PHONE} dígitos`,
        field: 'phone',
      });
    } else if (rawPhone && cleanPhone.length > MAX_PHONE) {
      return res.status(400).json({
        ok: false,
        error: `El teléfono no puede tener más de ${MAX_PHONE} dígitos`,
        field: 'phone',
      });
    }

    const { ownerUserId, account } = await resolveDataOwnerUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const businessId = await resolveCreateBusinessId(req, ownerUserId, client);
    if (businessId === null) {
      return badRequest(res, 'Falta businessId (empresa activa)');
    }

    const db = getClientsDbName();
    await ensureDatabase(req, db);
    const listOptions = await resolveClientListOptions(req, ownerUserId, businessId);
    // Guardar solo dígitos (sin obligar prefijo UI); 34+móvil ES → 9 locales.
    let phoneForSave = cleanPhone;
    let phonePrefixForSave =
      client.phonePrefix != null ? String(client.phonePrefix).trim() : '';
    if (phoneForSave.length === 11 && phoneForSave.startsWith('34') && /^[67]\d{8}$/.test(phoneForSave.slice(2))) {
      phoneForSave = phoneForSave.slice(2);
      phonePrefixForSave = '';
    }
    const doc = buildClientDocument(ownerUserId, {
      ...client,
      phone: phoneForSave || cleanPhone,
      phonePrefix: phonePrefixForSave,
      businessId,
      business_id: businessId,
    });
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: ownerUserId,
      type: 'client',
      action: `Creó cliente ${doc.name}`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { phone: doc.phone, email: doc.email },
    });

    const warnings = [];
    if (doc.address && !doc.city) warnings.push({ field: 'city', message: 'Ciudad no especificada en la dirección' });
    if (doc.address && !doc.postalCode) warnings.push({ field: 'postalCode', message: 'Código postal no especificado' });
    if (!doc.email) warnings.push({ field: 'email', message: 'Sin email — no se podrán enviar comunicaciones' });

    const duplicates = await findDuplicateClients(req, ownerUserId, doc, listOptions).catch(() => []);
    return res.status(201).json({ ok: true, client: sanitizeClient({ ...doc, _rev: saved.rev }), duplicates, warnings });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear cliente' });
  }
}

export async function updateClient(req, res) {
  try {
    const { userId, clientId } = req.params;
    const { client } = req.body || {};

    if (!client || typeof client !== 'object') return badRequest(res, 'Faltan datos del cliente');

    const existing = await ensureClientOwner(req, userId, clientId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const { ownerUserId, account } = await resolveDataOwnerUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    const doc = buildClientDocument(ownerUserId, { ...existing, ...client }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: ownerUserId,
      type: 'client',
      action: `Actualizó cliente ${doc.name}`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { status: doc.status },
    });

    return res.json({ ok: true, client: sanitizeClient({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar cliente' });
  }
}

export async function removeClient(req, res) {
  try {
    const { userId, clientId } = req.params;

    const existing = await ensureClientOwner(req, userId, clientId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await softDeleteDocument(req, db, clientId);

    try {
      await logAccountActivity(req, {
        actorUserId: userId,
        actorName: account.fullName,
        targetUserId: userId,
        type: 'client',
        action: `Eliminó cliente ${existing.name}`,
        entityId: existing._id,
        entityLabel: existing.name,
        metadata: {},
      });
    } catch (activityErr) {
      console.error('[clients] activity tras delete (no bloquea):', activityErr?.message || activityErr);
    }

    return res.json({ ok: true, id: clientId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar cliente' });
  }
}

/**
 * Soft-delete de varios clientes.
 * - ids[]: borrado de esa lista
 * - allMatching: true → todos los del alcance (empresa / búsqueda / filtros), sin límite de 500
 * Una sola actividad de resumen (no una por cliente).
 */
export async function bulkRemoveClients(req, res) {
  try {
    const { userId } = req.params;
    const allMatching = req.body?.allMatching === true || req.body?.all === true;
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = [...new Set(rawIds.map((id) => String(id || '').trim()).filter(Boolean))];

    if (!userId) return badRequest(res, 'Falta userId');
    if (!allMatching && ids.length === 0) {
      return badRequest(res, 'Indica ids[] o allMatching: true');
    }
    if (!allMatching && ids.length > 20_000) {
      return badRequest(res, 'Máximo 20000 clientes por borrado; usa allMatching para toda la cuenta');
    }

    const { ownerUserId, account } = await resolveDataOwnerUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await ensureDatabase(req, db);

    const now = new Date().toISOString();
    const toDelete = [];
    const skipped = [];

    if (allMatching) {
      const businessId = normalizeBusinessScopeId(
        req.body?.businessId || req.body?.business_id || resolveQueryBusinessId(req),
      );
      const listOptions = await resolveClientListOptions(req, ownerUserId, businessId);
      const searchParam = typeof req.body?.search === 'string' ? req.body.search.trim() : '';
      let raw;
      if (searchParam) {
        raw = await searchClientsForList(req, ownerUserId, searchParam, listOptions);
      } else {
        raw = await listClientsByUser(req, ownerUserId, listOptions);
      }

      const filter = {};
      const branchId = String(req.body?.branchId || req.body?.branch_id || '').trim();
      const workCenterId = String(req.body?.workCenterId || '').trim();
      if (branchId && branchId !== 'all') filter.branch_id = branchId;
      if (workCenterId && workCenterId !== 'all') filter.workCenterId = workCenterId;

      const { items } = applyQueryOptions(raw, Object.keys(filter).length ? { filter } : {});
      for (const doc of items) {
        if (!doc || doc.type !== 'client' || doc.user_id !== ownerUserId || doc.deletedAt) {
          if (doc?._id) skipped.push(doc._id);
          continue;
        }
        toDelete.push({
          ...doc,
          deletedAt: now,
          updatedAt: now,
        });
      }
    } else {
      for (const clientId of ids) {
        const doc = await getDocument(req, db, clientId);
        if (!doc || doc.type !== 'client' || doc.user_id !== ownerUserId || doc.deletedAt) {
          skipped.push(clientId);
          continue;
        }
        toDelete.push({
          ...doc,
          deletedAt: now,
          updatedAt: now,
        });
      }
    }

    // Invalidar antes: si la caché está caliente (~6k), cada lote de soft-delete
    // reconstruía el índice de búsqueda y el borrado se iba a minutos.
    invalidateClientDocumentsForUser(ownerUserId);

    let removed = 0;
    const failed = [];
    const { batchSize } = resolveBulkImportLimits();
    const deleteChunkSize = Math.min(500, Math.max(50, batchSize));
    console.info(
      `[clients] bulk-delete start user=${ownerUserId} toDelete=${toDelete.length} chunk=${deleteChunkSize} allMatching=${Boolean(allMatching)}`,
    );
    for (const chunk of chunkDocs(toDelete, deleteChunkSize)) {
      try {
        const results = await bulkPutDocuments(req, db, chunk);
        for (let i = 0; i < results.length; i += 1) {
          const row = results[i];
          if (row?.ok || row?.rev) removed += 1;
          else failed.push(chunk[i]?._id || chunk[i]?.id);
        }
      } catch (chunkErr) {
        console.error('[clients] bulk-delete chunk:', chunkErr?.message || chunkErr);
        for (const doc of chunk) {
          try {
            await softDeleteDocument(req, db, doc._id);
            removed += 1;
          } catch {
            failed.push(doc._id);
          }
        }
      }
    }

    invalidateClientDocumentsForUser(ownerUserId);
    console.info(`[clients] bulk-delete done user=${ownerUserId} removed=${removed} failed=${failed.length}`);

    void logAccountActivity(req, {
      actorUserId: ownerUserId,
      actorName: account.fullName,
      targetUserId: ownerUserId,
      type: 'client',
      action: allMatching
        ? `Eliminó ${removed} cliente${removed === 1 ? '' : 's'} (toda la cuenta / filtro)`
        : `Eliminó ${removed} cliente${removed === 1 ? '' : 's'} (borrado masivo)`,
      entityId: ownerUserId,
      entityLabel: account.fullName,
      metadata: {
        removed,
        requested: allMatching ? toDelete.length + skipped.length : ids.length,
        skipped: skipped.length,
        failed: failed.length,
        allMatching: Boolean(allMatching),
      },
    }).catch((activityErr) => {
      console.error('[clients] activity tras bulk-delete (no bloquea):', activityErr?.message || activityErr);
    });

    return res.json({
      ok: true,
      removed,
      skipped: skipped.length,
      failed: failed.filter(Boolean),
      allMatching: Boolean(allMatching),
    });
  } catch (error) {
    console.error('[clients] bulk-delete:', error);
    const msg =
      (typeof error?.message === 'string' && error.message)
      || (typeof error?.reason === 'string' && error.reason)
      || (typeof error === 'string' && error)
      || 'Error al eliminar clientes';
    return res.status(500).json({ ok: false, error: String(msg) });
  }
}

// ─── CLIENT DETAIL + RESUMEN ─────────────────────────────────────────────────

export async function getClientDetail(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return badRequest(res, 'Falta userId o clientId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    let client = await ensureClientOwner(req, userId, clientId);
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    // TPV: solo ficha (direcciones/pago). Sin sync ni escaneo de pedidos/ventas/facturas.
    const lite = req.query?.lite === '1' || req.query?.lite === 'true'
      || req.query?.tpv === '1' || req.query?.tpv === 'true';
    if (lite) {
      return res.json({
        ok: true,
        client: sanitizeClientForTpvSearch(client),
        summary: null,
      });
    }

    await syncClientFromDeliveryOrders(req, userId, clientId).catch(() => null);
    client = (await ensureClientOwner(req, userId, clientId)) || client;

    const [salesDocs, invoiceDocs, deliveryOrdersAll] = await Promise.all([
      ensureDatabase(req, getSalesDbName()).then(() => getAllDocuments(req, getSalesDbName())),
      ensureDatabase(req, getInvoicesDbName()).then(() => getAllDocuments(req, getInvoicesDbName())),
      listDeliveryOrdersByUser(req, userId),
    ]);
    const deliveryOrders = await scopeDeliveryOrdersToClientBusiness(req, userId, client, deliveryOrdersAll);

    const clientSales = salesDocs.filter(
      (s) => s?.type === 'sale' && !s?.deletedAt && s?.user_id === userId && s?.clientId === clientId,
    );
    const clientInvoices = invoiceDocs.filter(
      (i) => i?.type === 'client_invoice' && !i?.deletedAt && i?.user_id === userId && i?.clientId === clientId,
    );
    const clientDeliveryOrders = deliveryOrders.filter(
      (o) => deliveryOrderMatchesClient(o, clientId, client.phone) && !isCancelledDeliveryOrder(o),
    );

    const totalInvoiced = clientInvoices.reduce((s, inv) => s + Number(inv.total || 0), 0);
    const totalSalesRevenue = clientSales.reduce((s, sale) => s + Number(sale.totalPrice || 0), 0);
    const totalDeliveryRevenue = clientDeliveryOrders.reduce((s, order) => s + deliveryOrderRevenue(order), 0);
    const totalOrders = clientSales.length + clientInvoices.length + clientDeliveryOrders.length;
    const totalRevenue = totalSalesRevenue + totalInvoiced + totalDeliveryRevenue;
    const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const allDates = [...clientSales, ...clientInvoices, ...clientDeliveryOrders]
      .map((r) => r.date || r.createdAt || r.deliveredAt || '')
      .filter(Boolean)
      .sort();

    const lastPurchaseDate = allDates.length > 0 ? allDates[allDates.length - 1] : null;

    const recentOrders = clientDeliveryOrders
      .slice()
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 10)
      .map((order) => ({
        id: order._id,
        orderNumber: order.orderNumber || order._id,
        createdAt: order.createdAt || '',
        status: order.status || '',
        deliveryType: order.deliveryType || '',
        channel: order.channel || '',
        totalAmount: deliveryOrderRevenue(order),
        salesPointName: order.salesPointName || '',
        itemCount: Array.isArray(order.items) ? order.items.length : 0,
        paymentStatus: order.paymentStatus || '',
        customerAddress: order.customerAddress || '',
      }));

    const deliveryTypeCounts = {};
    for (const order of clientDeliveryOrders) {
      const key = String(order.deliveryType || 'otro');
      deliveryTypeCounts[key] = (deliveryTypeCounts[key] || 0) + 1;
    }
    const favoriteDeliveryType = Object.entries(deliveryTypeCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    return res.json({
      ok: true,
      client: sanitizeClient(client),
      summary: {
        totalInvoiced: Number(totalRevenue.toFixed(2)),
        totalOrders,
        avgTicket: Number(avgTicket.toFixed(2)),
        lastPurchase: lastPurchaseDate,
        totalSalesRevenue: Number(totalSalesRevenue.toFixed(2)),
        totalInvoicesRevenue: Number(totalInvoiced.toFixed(2)),
        totalDeliveryRevenue: Number(totalDeliveryRevenue.toFixed(2)),
        deliveryOrders: clientDeliveryOrders.length,
        favoriteDeliveryType,
        recentOrders,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener detalle del cliente' });
  }
}

// ─── CLV ─────────────────────────────────────────────────────────────────────

export async function getClientCLV(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return badRequest(res, 'Falta userId o clientId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await ensureDatabase(req, db);
    const client = await getDocument(req, db, clientId);
    if (!client || client.type !== 'client' || client.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    }

    const [salesDocs, invoiceDocs] = await Promise.all([
      ensureDatabase(req, getSalesDbName()).then(() => getAllDocuments(req, getSalesDbName())),
      ensureDatabase(req, getInvoicesDbName()).then(() => getAllDocuments(req, getInvoicesDbName())),
    ]);

    const clientSales = salesDocs.filter(
      (s) => s?.type === 'sale' && !s?.deletedAt && s?.user_id === userId && s?.clientId === clientId,
    );
    const clientInvoices = invoiceDocs.filter(
      (i) => i?.type === 'client_invoice' && !i?.deletedAt && i?.user_id === userId && i?.clientId === clientId,
    );

    const totalSalesRevenue = clientSales.reduce((s, sale) => s + Number(sale.totalPrice || 0), 0);
    const totalInvoicesRevenue = clientInvoices.reduce((s, inv) => s + Number(inv.total || 0), 0);
    const totalRevenue = totalSalesRevenue + totalInvoicesRevenue;

    const firstSale = [...clientSales, ...clientInvoices]
      .map((r) => String(r.createdAt || '')).filter(Boolean).sort()[0];
    const lastSale = [...clientSales, ...clientInvoices]
      .map((r) => String(r.updatedAt || r.createdAt || '')).filter(Boolean).sort().reverse()[0];

    const relationshipDays = firstSale
      ? Math.max(0, Math.floor((Date.now() - new Date(firstSale).getTime()) / 86400000))
      : 0;
    const relationshipMonths = Math.max(1, Math.ceil(relationshipDays / 30));
    const avgMonthlyRevenue = totalRevenue / relationshipMonths;
    const projectedCLV = avgMonthlyRevenue * 36;

    const vehiclesPurchasedCount = Array.isArray(client.vehiclesPurchased) ? client.vehiclesPurchased.length : 0;
    const vehiclesSoldCount = Array.isArray(client.vehiclesSold) ? client.vehiclesSold.length : 0;

    return res.json({
      ok: true,
      clv: {
        clientId,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalSalesRevenue: Number(totalSalesRevenue.toFixed(2)),
        totalInvoicesRevenue: Number(totalInvoicesRevenue.toFixed(2)),
        totalTransactions: clientSales.length + clientInvoices.length,
        vehiclesPurchasedCount,
        vehiclesSoldCount,
        firstTransaction: firstSale || null,
        lastTransaction: lastSale || null,
        relationshipDays,
        avgMonthlyRevenue: Number(avgMonthlyRevenue.toFixed(2)),
        projectedCLV: Number(projectedCLV.toFixed(2)),
        segment: projectedCLV >= 50000 ? 'vip' : projectedCLV >= 20000 ? 'high' : projectedCLV >= 5000 ? 'medium' : 'low',
        calculatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error calculando CLV' });
  }
}

// ─── CLIENT INVOICES ─────────────────────────────────────────────────────────

export async function getClientInvoices(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return badRequest(res, 'Falta userId o clientId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const client = await ensureClientOwner(req, userId, clientId);
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const invoicesDb = getInvoicesDbName();
    await ensureDatabase(req, invoicesDb);
    const invoiceDocs = await getAllDocuments(req, invoicesDb);
    const clientInvoices = invoiceDocs
      .filter((i) => i?.type === 'client_invoice' && !i?.deletedAt && i?.user_id === userId && i?.clientId === clientId)
      .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')));

    const { items, meta } = applyQueryOptions(clientInvoices, req.query);
    return res.json({ ok: true, invoices: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar facturas del cliente' });
  }
}

// ─── CLIENT CONTACTS ─────────────────────────────────────────────────────────

export async function updateClientContacts(req, res) {
  try {
    const { userId, clientId } = req.params;
    const { contacts } = req.body || {};

    if (!Array.isArray(contacts)) return badRequest(res, 'Se esperaba un array de contactos');

    const existing = await ensureClientOwner(req, userId, clientId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    const doc = buildClientDocument(userId, { ...existing, contacts }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Actualizó contactos de ${doc.name} (${contacts.length})`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { contactsCount: contacts.length },
    });

    const sanitized = sanitizeClient({ ...doc, _rev: saved.rev });
    return res.json({ ok: true, contacts: sanitized.contacts });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar contactos' });
  }
}

// ─── CLIENT NOTES ────────────────────────────────────────────────────────────

export async function listClientNotes(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return badRequest(res, 'Falta userId o clientId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const client = await ensureClientOwner(req, userId, clientId);
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const raw = await listClientNotesByClient(req, userId, clientId);
    const { items, meta } = applyQueryOptions(raw.map(sanitizeClientNote), req.query);
    return res.json({ ok: true, notes: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar notas' });
  }
}

export async function createClientNote(req, res) {
  try {
    const { userId, clientId } = req.params;
    const { note } = req.body || {};

    if (!note || typeof note !== 'object') return badRequest(res, 'Falta el objeto note');
    if (!note.text?.trim() && !note.texto?.trim()) return badRequest(res, 'El texto de la nota es obligatorio');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const client = await ensureClientOwner(req, userId, clientId);
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const db = getClientsDbName();
    const doc = buildClientNoteDocument(userId, clientId, {
      ...note,
      authorId: req.authUser?.userId || userId,
      authorName: note.authorName || account.fullName || 'Usuario',
    });
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Añadió nota al cliente ${client.name}`,
      entityId: doc._id,
      entityLabel: client.name,
      metadata: { important: doc.important },
    });

    return res.status(201).json({ ok: true, note: sanitizeClientNote({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear nota' });
  }
}

export async function updateClientNote(req, res) {
  try {
    const { userId, clientId, noteId } = req.params;
    const { note } = req.body || {};

    if (!note || typeof note !== 'object') return badRequest(res, 'Faltan datos de la nota');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, noteId);
    if (!existing || existing.type !== 'client_note' || existing.user_id !== userId || existing.clientId !== clientId) {
      return res.status(404).json({ ok: false, error: 'Nota no encontrada' });
    }

    const doc = buildClientNoteDocument(userId, clientId, { ...existing, ...note }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, note: sanitizeClientNote({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar nota' });
  }
}

export async function removeClientNote(req, res) {
  try {
    const { userId, clientId, noteId } = req.params;

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, noteId);
    if (!existing || existing.type !== 'client_note' || existing.user_id !== userId || existing.clientId !== clientId) {
      return res.status(404).json({ ok: false, error: 'Nota no encontrada' });
    }

    await softDeleteDocument(req, db, noteId);
    return res.json({ ok: true, id: noteId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar nota' });
  }
}

// ─── CLIENT PROMOTIONS ───────────────────────────────────────────────────────

export async function listClientPromotions(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return badRequest(res, 'Falta userId o clientId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const client = await ensureClientOwner(req, userId, clientId);
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const raw = await listClientPromotionsByClient(req, userId, clientId);
    const { items, meta } = applyQueryOptions(raw.map(sanitizeClientPromotion), req.query);
    return res.json({ ok: true, promotions: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar promociones' });
  }
}

export async function createClientPromotion(req, res) {
  try {
    const { userId, clientId } = req.params;
    const { promotion } = req.body || {};

    if (!promotion || typeof promotion !== 'object') return badRequest(res, 'Falta el objeto promotion');
    if (!promotion.nombre?.trim()) return badRequest(res, 'El nombre de la promoción es obligatorio');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const client = await ensureClientOwner(req, userId, clientId);
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const db = getClientsDbName();
    const doc = buildClientPromotionDocument(userId, clientId, promotion);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Creó promoción "${doc.nombre}" para ${client.name}`,
      entityId: doc._id,
      entityLabel: client.name,
      metadata: { tipo: doc.tipo, codigo: doc.codigo },
    });

    return res.status(201).json({ ok: true, promotion: sanitizeClientPromotion({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear promoción' });
  }
}

export async function updateClientPromotion(req, res) {
  try {
    const { userId, clientId, promotionId } = req.params;
    const { promotion } = req.body || {};

    if (!promotion || typeof promotion !== 'object') return badRequest(res, 'Faltan datos de la promoción');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, promotionId);
    if (!existing || existing.type !== 'client_promotion' || existing.user_id !== userId || existing.clientId !== clientId) {
      return res.status(404).json({ ok: false, error: 'Promoción no encontrada' });
    }

    const doc = buildClientPromotionDocument(userId, clientId, { ...existing, ...promotion }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Actualizó promoción "${doc.nombre}"`,
      entityId: doc._id,
      entityLabel: doc.nombre,
      metadata: { estado: doc.estado },
    });

    return res.json({ ok: true, promotion: sanitizeClientPromotion({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar promoción' });
  }
}

export async function removeClientPromotion(req, res) {
  try {
    const { userId, clientId, promotionId } = req.params;

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, promotionId);
    if (!existing || existing.type !== 'client_promotion' || existing.user_id !== userId || existing.clientId !== clientId) {
      return res.status(404).json({ ok: false, error: 'Promoción no encontrada' });
    }

    await softDeleteDocument(req, db, promotionId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Eliminó promoción "${existing.nombre}"`,
      entityId: existing._id,
      entityLabel: existing.nombre,
      metadata: {},
    });

    return res.json({ ok: true, id: promotionId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar promoción' });
  }
}

// ─── CLIENT ACTIVITY ─────────────────────────────────────────────────────────

export async function getClientActivity(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return badRequest(res, 'Falta userId o clientId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const client = await ensureClientOwner(req, userId, clientId);
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    await syncClientFromDeliveryOrders(req, userId, clientId).catch(() => null);

    const [salesDocs, invoiceDocs, notesDocs, deliveryOrdersAll] = await Promise.all([
      ensureDatabase(req, getSalesDbName()).then(() => getAllDocuments(req, getSalesDbName())),
      ensureDatabase(req, getInvoicesDbName()).then(() => getAllDocuments(req, getInvoicesDbName())),
      listClientNotesByClient(req, userId, clientId),
      listDeliveryOrdersByUser(req, userId),
    ]);
    const deliveryOrders = await scopeDeliveryOrdersToClientBusiness(req, userId, client, deliveryOrdersAll);

    const clientSales = salesDocs.filter(
      (s) => s?.type === 'sale' && !s?.deletedAt && s?.user_id === userId && s?.clientId === clientId,
    );
    const clientInvoices = invoiceDocs.filter(
      (i) => i?.type === 'client_invoice' && !i?.deletedAt && i?.user_id === userId && i?.clientId === clientId,
    );
    const clientDeliveryOrders = deliveryOrders.filter(
      (o) => deliveryOrderMatchesClient(o, clientId, client.phone) && !isCancelledDeliveryOrder(o),
    );

    const activities = [];

    for (const order of clientDeliveryOrders) {
      const status = String(order.status || '').toLowerCase();
      activities.push({
        id: order._id,
        tipo: 'pedido',
        titulo: `Pedido #${order.orderNumber || order._id}`,
        descripcion: [order.deliveryType, order.salesPointName].filter(Boolean).join(' · '),
        fecha: order.createdAt || order.updatedAt,
        referencia: order.orderNumber || order._id,
        monto: deliveryOrderRevenue(order),
        estado: status === 'entregado' ? 'completado' : status === 'cancelled' || status === 'cancelado' ? 'cancelado' : 'pendiente',
      });
    }

    for (const sale of clientSales) {
      activities.push({
        id: sale._id,
        tipo: 'pedido',
        titulo: `Venta ${sale.vehicleName || sale._id}`,
        descripcion: sale.vehiclePlate ? `Placa: ${sale.vehiclePlate}` : '',
        fecha: sale.date || sale.createdAt,
        referencia: sale._id,
        monto: Number(sale.totalPrice || 0),
        estado: sale.stage === 'completed' ? 'completado' : sale.stage === 'cancelled' ? 'cancelado' : 'pendiente',
      });
    }

    for (const inv of clientInvoices) {
      activities.push({
        id: inv._id,
        tipo: 'factura',
        titulo: `Factura ${inv.number || inv._id}`,
        descripcion: inv.vehicleName ? `Vehículo: ${inv.vehicleName}` : '',
        fecha: inv.date || inv.createdAt,
        referencia: inv.number || inv._id,
        monto: Number(inv.total || 0),
        estado: inv.status === 'paid' ? 'pagado' : inv.status === 'overdue' ? 'vencido' : 'pendiente',
      });
    }

    for (const note of notesDocs) {
      activities.push({
        id: note._id,
        tipo: 'nota',
        titulo: 'Nota añadida',
        descripcion: (note.text || '').substring(0, 100),
        fecha: note.createdAt,
        autor: note.authorName || '',
      });
    }

    activities.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));

    const totalRevenue = clientSales.reduce((s, sale) => s + Number(sale.totalPrice || 0), 0)
      + clientInvoices.reduce((s, inv) => s + Number(inv.total || 0), 0)
      + clientDeliveryOrders.reduce((s, order) => s + deliveryOrderRevenue(order), 0);
    const totalOrders = clientSales.length + clientInvoices.length + clientDeliveryOrders.length;
    const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const firstDate = [...clientSales, ...clientInvoices, ...clientDeliveryOrders]
      .map((r) => r.createdAt || '').filter(Boolean).sort()[0];
    const relationshipDays = firstDate
      ? Math.max(0, Math.floor((Date.now() - new Date(firstDate).getTime()) / 86400000))
      : 0;

    const { items, meta } = applyQueryOptions(activities, req.query);

    return res.json({
      ok: true,
      activities: items,
      meta,
      kpis: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalOrders,
        avgTicket: Number(avgTicket.toFixed(2)),
        totalInvoices: clientInvoices.length,
        totalSales: clientSales.length,
        totalDeliveryOrders: clientDeliveryOrders.length,
        totalNotes: notesDocs.length,
        relationshipDays,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar actividad' });
  }
}

// ─── CLIENT SEARCH (teléfono y/o nombre) ────────────────────────────────────

export async function searchByPhone(req, res) {
  try {
    const { userId } = req.params;
    const { q, limit } = req.query;
    if (!userId) return badRequest(res, 'Falta userId');

    const { ownerUserId, account } = await resolveDataOwnerUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    if (String(req.query?.refresh || '') === '1') {
      invalidateClientDocumentsForUser(ownerUserId);
    }

    const businessId = resolveQueryBusinessId(req);
    const listOptions = await resolveClientListOptions(req, ownerUserId, businessId);
    // TPV: incluir clientes legacy sin business_id (cuentas con varias empresas).
    if (String(req.query?.includeLegacy || '') === '1') {
      listOptions.excludeUnscopedLegacy = false;
    }
    let { clients, portfolioSize } = await searchClientsByPhoneWithMeta(
      req,
      ownerUserId,
      q,
      limit,
      listOptions,
    );
    // Si con filtro de empresa no hay nada, reintentar en toda la cuenta (mismo titular).
    if (
      (!clients || clients.length === 0)
      && businessId
      && String(req.query?.fallbackAll || '') === '1'
    ) {
      const fallback = await searchClientsByPhoneWithMeta(req, ownerUserId, q, limit, {
        excludeUnscopedLegacy: false,
      });
      clients = fallback.clients;
      portfolioSize = Math.max(portfolioSize, fallback.portfolioSize);
    }
    return res.json({
      ok: true,
      portfolioSize,
      // TPV: payload ligero con direcciones (no vehicles/interactions/…).
      clients: clients.map((c) => sanitizeClientForTpvSearch(c)).filter(Boolean),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al buscar clientes' });
  }
}

// ─── DUPLICATES / BULK / MERGE ───────────────────────────────────────────────

export async function checkClientDuplicates(req, res) {
  try {
    const { userId } = req.params;
    const { client, field, value } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const businessId = normalizeBusinessScopeId(
      client?.businessId || client?.business_id || req.query?.businessId || req.body?.businessId,
    );
    const listOptions = await resolveClientListOptions(req, userId, businessId);

    if (field && value) {
      const allowed = ['phone', 'email', 'dni'];
      if (!allowed.includes(field)) return badRequest(res, `Campo no válido: ${field}. Usa: ${allowed.join(', ')}`);
      const duplicates = await findDuplicateClients(req, userId, { [field]: value, businessId }, listOptions);
      return res.json({ ok: true, duplicates, matchedField: field });
    }

    if (client && typeof client === 'object') {
      const duplicates = await findDuplicateClients(req, userId, client, listOptions);
      return res.json({ ok: true, duplicates });
    }

    return badRequest(res, 'Falta client o field+value');
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al buscar duplicados' });
  }
}

export async function bulkCreateClients(req, res) {
  try {
    const { userId } = req.params;
    const { clients } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!Array.isArray(clients) || clients.length === 0) {
      return badRequest(res, 'Se esperaba un array de clientes en clients[]');
    }

    const { batchSize, maxDocs } = resolveBulkImportLimits();
    if (clients.length > maxDocs) {
      return badRequest(res, `Máximo ${maxDocs} clientes por importación`);
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const scopeBusinessId = await resolveCreateBusinessId(req, userId, req.body || {});
    if (scopeBusinessId === null) {
      return badRequest(res, 'Falta businessId (empresa activa)');
    }

    const db = getClientsDbName();
    await ensureDatabase(req, db);

    const created = [];
    const errors = [];
    const pending = [];

    for (const client of clients) {
      if (!client.name?.trim() || !client.phone?.trim()) {
        errors.push({ client, error: 'Nombre y teléfono son obligatorios' });
        continue;
      }
      const bid = normalizeBusinessScopeId(client.businessId || client.business_id || scopeBusinessId);
      pending.push({
        doc: buildClientDocument(userId, { ...client, businessId: bid, business_id: bid }),
        sourceClient: client,
      });
    }

    let createdCount = 0;
    for (const chunk of chunkDocs(pending, batchSize)) {
      const docs = chunk.map((item) => item.doc);
      try {
        const results = await bulkPutDocuments(req, db, docs);
        results.forEach((result, idx) => {
          const { sourceClient } = chunk[idx];
          if (result?.ok) {
            createdCount += 1;
          } else {
            errors.push({
              client: sourceClient,
              error: result?.error || result?.reason || 'Error en importación masiva',
            });
          }
        });
      } catch (err) {
        for (const { sourceClient } of chunk) {
          errors.push({ client: sourceClient, error: err.message });
        }
      }
    }

    // No bloquear el lote: el log de cuenta puede pelear por 409 y alargar mucho la importación.
    void logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Importación masiva: ${createdCount} clientes creados`,
      entityId: userId,
      entityLabel: 'Importación masiva',
      metadata: { created: createdCount, errors: errors.length, requested: clients.length },
    }).catch(() => {});

    // Invalidar caché; el listado/TPV recarga al terminar el wizard (refreshClients).
    // Evita un _find de toda la cartera tras CADA lote HTTP (muy lento con miles de clientes).
    if (createdCount > 0) {
      invalidateClientDocumentsForUser(userId);
    }

    // Respuesta ligera: el wizard solo necesita el conteo, no re-serializar miles de docs.
    return res.status(201).json({
      ok: true,
      clients: [],
      total: createdCount,
      errors,
      errorsCount: errors.length,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error en importación masiva' });
  }
}

/**
 * Marca clientes de una importación Excel/base histórica.
 * Solo actúa sobre un día concreto (createdDay) y, por defecto, no toca los ya marcados como organic.
 * No hay reglas automáticas en el dashboard: esto es una corrección explícita.
 */
export async function markClientsAcquisition(req, res) {
  try {
    const { userId } = req.params;
    const {
      businessId,
      acquisitionKind,
      createdDay,
      onlyUnmarked = true,
      dryRun = false,
    } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (acquisitionKind !== 'migration' && acquisitionKind !== 'organic') {
      return badRequest(res, 'acquisitionKind debe ser migration u organic');
    }
    const day = String(createdDay || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return badRequest(res, 'Falta createdDay (YYYY-MM-DD) del día de la importación Excel');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const bid = normalizeBusinessScopeId(businessId || req.query?.businessId);
    const listOptions = await resolveClientListOptions(req, userId, bid);
    const clients = await listClientsByUser(req, userId, listOptions);

    const matched = clients.filter((c) => {
      const iso = String(c.createdAt || '');
      if (!iso.startsWith(day)) return false;
      if (onlyUnmarked) {
        const kind = c.stats?.acquisitionKind;
        if (kind === 'organic' || kind === 'migration') return false;
      }
      return true;
    });

    if (dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        createdDay: day,
        matched: matched.length,
        acquisitionKind,
      });
    }

    const db = getClientsDbName();
    await ensureDatabase(req, db);
    const { batchSize } = resolveBulkImportLimits();
    const docs = matched.map((existing) => buildClientDocument(
      userId,
      {
        ...existing,
        stats: {
          ...(existing.stats || {}),
          createdFrom: existing.stats?.createdFrom || 'import',
          acquisitionKind,
          excludeFromNewMetrics: acquisitionKind === 'migration',
        },
      },
      existing,
    ));

    let updated = 0;
    const errors = [];
    for (const chunk of chunkDocs(docs, batchSize)) {
      try {
        const results = await bulkPutDocuments(req, db, chunk);
        results.forEach((result) => {
          if (result?.ok) updated += 1;
          else errors.push(result?.error || result?.reason || 'Error al actualizar');
        });
      } catch (err) {
        errors.push(err.message || 'Error en lote');
      }
    }

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Marcó ${updated} clientes como ${acquisitionKind} (${day})`,
      entityId: userId,
      entityLabel: 'Origen de clientes',
      metadata: { updated, matched: matched.length, createdDay: day, acquisitionKind, errors: errors.length },
    });

    return res.json({
      ok: true,
      dryRun: false,
      createdDay: day,
      matched: matched.length,
      updated,
      errors: errors.length,
      acquisitionKind,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al marcar origen de clientes' });
  }
}

/**
 * Detecta el día con más altas sin acquisitionKind (candidato a Excel histórico).
 * Solo informativo; no cambia datos.
 */
export async function previewClientAcquisitionPeakDay(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const bid = normalizeBusinessScopeId(req.query?.businessId || req.body?.businessId);
    const listOptions = await resolveClientListOptions(req, userId, bid);
    const clients = await listClientsByUser(req, userId, listOptions);

    const byDay = new Map();
    for (const c of clients) {
      const kind = c.stats?.acquisitionKind;
      if (kind === 'organic' || kind === 'migration') continue;
      const day = String(c.createdAt || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      byDay.set(day, (byDay.get(day) || 0) + 1);
    }

    let peakDay = '';
    let peakCount = 0;
    for (const [day, n] of byDay) {
      if (n > peakCount) {
        peakDay = day;
        peakCount = n;
      }
    }

    return res.json({
      ok: true,
      peakDay: peakDay || null,
      peakCount,
      thresholdHint: 500,
      suggestMigration: peakCount >= 500,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al analizar origen de clientes' });
  }
}

/** Copia clientes de otra empresa (nuevos IDs; no enlaza registros). */
export async function importClientsFromBusiness(req, res) {
  try {
    const { userId } = req.params;
    const { sourceBusinessId, targetBusinessId } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');

    const sourceId = normalizeBusinessScopeId(sourceBusinessId);
    const targetId = normalizeBusinessScopeId(targetBusinessId);
    if (!sourceId || !targetId) return badRequest(res, 'Faltan sourceBusinessId y targetBusinessId');
    if (sourceId === targetId) return badRequest(res, 'Origen y destino deben ser empresas distintas');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const sourceOptions = await resolveClientListOptions(req, userId, sourceId);
    const sourceClients = await listClientsByUser(req, userId, sourceOptions);
    if (sourceClients.length === 0) {
      return res.json({ ok: true, clients: [], total: 0, skipped: 0 });
    }

    const targetOptions = await resolveClientListOptions(req, userId, targetId);
    const db = getClientsDbName();
    await ensureDatabase(req, db);

    const created = [];
    const skipped = [];
    const { batchSize } = resolveBulkImportLimits();

    const pending = [];
    for (const src of sourceClients) {
      const candidate = buildClientDocument(userId, {
        name: src.name,
        phone: src.phone,
        phonePrefix: src.phonePrefix,
        email: src.email,
        dni: src.dni,
        address: src.address,
        city: src.city,
        postalCode: src.postalCode,
        addresses: src.addresses,
        notes: src.notes,
        tags: src.tags,
        clientType: src.clientType,
        status: src.status,
        businessId: targetId,
        business_id: targetId,
      });
      const dupes = await findDuplicateClients(req, userId, candidate, targetOptions).catch(() => []);
      if (dupes.length > 0) {
        skipped.push({ name: src.name, phone: src.phone, reason: 'duplicate_in_target' });
        continue;
      }
      pending.push(candidate);
    }

    for (const chunk of chunkDocs(pending, batchSize)) {
      const results = await bulkPutDocuments(req, db, chunk);
      results.forEach((result, idx) => {
        const doc = chunk[idx];
        if (result?.ok) {
          created.push(sanitizeClient({ ...doc, _rev: result.rev }));
        }
      });
    }

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Importó ${created.length} clientes entre empresas`,
      entityId: targetId,
      entityLabel: 'Importación entre empresas',
      metadata: { sourceBusinessId: sourceId, targetBusinessId: targetId, created: created.length, skipped: skipped.length },
    });

    return res.status(201).json({
      ok: true,
      clients: created,
      total: created.length,
      skipped,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al importar clientes' });
  }
}

export async function mergeClient(req, res) {
  try {
    const { userId } = req.params;
    const { keepId, deleteId } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!keepId || !deleteId) return badRequest(res, 'Faltan keepId y deleteId');
    if (keepId === deleteId) return badRequest(res, 'keepId y deleteId deben ser distintos');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await ensureDatabase(req, db);

    const [keepClient, deleteClient] = await Promise.all([
      getDocument(req, db, keepId),
      getDocument(req, db, deleteId),
    ]);

    if (!keepClient || keepClient.type !== 'client' || keepClient.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Cliente a conservar no encontrado' });
    }
    if (!deleteClient || deleteClient.type !== 'client' || deleteClient.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Cliente a eliminar no encontrado' });
    }

    const mergedInteractions = [
      ...(Array.isArray(keepClient.interactions) ? keepClient.interactions : []),
      ...(Array.isArray(deleteClient.interactions) ? deleteClient.interactions : []),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const mergedTags = [...new Set([
      ...(Array.isArray(keepClient.tags) ? keepClient.tags : []),
      ...(Array.isArray(deleteClient.tags) ? deleteClient.tags : []),
    ])];

    const mergedVehiclesPurchased = [...new Set([
      ...(Array.isArray(keepClient.vehiclesPurchased) ? keepClient.vehiclesPurchased : []),
      ...(Array.isArray(deleteClient.vehiclesPurchased) ? deleteClient.vehiclesPurchased : []),
    ])];
    const mergedVehiclesSold = [...new Set([
      ...(Array.isArray(keepClient.vehiclesSold) ? keepClient.vehiclesSold : []),
      ...(Array.isArray(deleteClient.vehiclesSold) ? deleteClient.vehiclesSold : []),
    ])];

    const mergedDocuments = [
      ...(Array.isArray(keepClient.documentsList) ? keepClient.documentsList : []),
      ...(Array.isArray(deleteClient.documentsList) ? deleteClient.documentsList : []),
    ];

    const mergedContacts = [
      ...(Array.isArray(keepClient.contacts) ? keepClient.contacts : []),
      ...(Array.isArray(deleteClient.contacts) ? deleteClient.contacts : []),
    ];

    const mergedAddresses = [
      ...(Array.isArray(keepClient.addresses) ? keepClient.addresses : []),
      ...(Array.isArray(deleteClient.addresses) ? deleteClient.addresses : []),
    ];

    const mergedSocialLinks = [
      ...(Array.isArray(keepClient.socialLinks) ? keepClient.socialLinks : []),
      ...(Array.isArray(deleteClient.socialLinks) ? deleteClient.socialLinks : []),
    ];

    const mergedDoc = buildClientDocument(userId, {
      ...keepClient,
      email: keepClient.email || deleteClient.email || '',
      dni: keepClient.dni || deleteClient.dni || '',
      legalName: keepClient.legalName || deleteClient.legalName || '',
      fiscalId: keepClient.fiscalId || deleteClient.fiscalId || '',
      address: keepClient.address || deleteClient.address || '',
      city: keepClient.city || deleteClient.city || '',
      notes: [keepClient.notes, deleteClient.notes].filter(Boolean).join('\n\n') || '',
      interactions: mergedInteractions,
      tags: mergedTags,
      vehiclesPurchased: mergedVehiclesPurchased,
      vehiclesSold: mergedVehiclesSold,
      documentsList: mergedDocuments,
      contacts: mergedContacts,
      addresses: mergedAddresses,
      socialLinks: mergedSocialLinks,
      mergedFrom: deleteId,
    }, keepClient);

    await putDocument(req, db, keepId, mergedDoc);
    await softDeleteDocument(req, db, deleteId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Fusionó clientes: conservó ${keepClient.name}, eliminó ${deleteClient.name}`,
      entityId: keepId,
      entityLabel: keepClient.name,
      metadata: { mergedFrom: deleteId },
    });

    return res.json({ ok: true, client: sanitizeClient(mergedDoc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error fusionando clientes' });
  }
}
