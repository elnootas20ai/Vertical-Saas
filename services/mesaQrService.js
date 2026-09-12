/**
 * Tokens opacos de QR de mesa (tienda + mesa).
 * No usar URLs adivinables tipo /mesa/1.
 */
import crypto from 'crypto';
import {
  findDocuments,
  getAllDocuments,
  putDocument,
  bulkPutDocuments,
  getWebConfigByBusinessId,
  listScopedPointsOfSaleForBusiness,
} from './couchdb.js';
import {
  getSalaDbName,
  getFloorConfigByUser,
  listDiningTablesByUser,
  sanitizeDiningTable,
  buildDiningTableDocument,
} from './salaService.js';

function normalizeBusinessId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

export function generateMesaQrToken() {
  return `mt_${crypto.randomBytes(18).toString('base64url')}`;
}

export async function findDiningTableByQrToken(req, token) {
  const raw = String(token || '').trim();
  if (!raw || raw.length < 8) return null;
  const db = getSalaDbName();

  try {
    const docs = await findDocuments(
      req,
      db,
      { type: 'dining_table', qrCode: raw },
      { pageSize: 5, maxDocs: 5 },
    );
    const hit = (docs || []).find(
      (d) => d && !d.deletedAt && d.active !== false && String(d.qrCode || '') === raw,
    );
    if (hit) return hit;
  } catch {
    /* índice mango puede faltar: fallback */
  }

  const all = await getAllDocuments(req, db);
  return (all || []).find(
    (d) =>
      d?.type === 'dining_table'
      && !d.deletedAt
      && d.active !== false
      && String(d.qrCode || '') === raw,
  ) || null;
}

export async function resolveMesaQrContext(req, input = {}) {
  const token = String(input.token || '').trim();
  const table = await findDiningTableByQrToken(req, token);
  if (!table) {
    const error = new Error('QR no válido o mesa no encontrada');
    error.status = 404;
    throw error;
  }

  const tableBusinessId = normalizeBusinessId(table.businessId);
  const expectedBusinessId = normalizeBusinessId(input.businessId);
  if (input.tableId && String(input.tableId) !== String(table._id)) {
    const error = new Error('La mesa no corresponde con el QR');
    error.status = 400;
    throw error;
  }
  if (expectedBusinessId && tableBusinessId !== expectedBusinessId) {
    const error = new Error('El QR no pertenece a este negocio');
    error.status = 400;
    throw error;
  }

  const config = tableBusinessId
    ? await getWebConfigByBusinessId(req, tableBusinessId).catch(() => null)
    : null;
  if (input.slug && String(config?.slug || '') !== String(input.slug)) {
    const error = new Error('El QR no pertenece a esta tienda');
    error.status = 400;
    throw error;
  }

  const floor = await getFloorConfigByUser(req, table.user_id, tableBusinessId).catch(() => null);
  const rooms = Array.isArray(floor?.rooms) ? floor.rooms : [];
  const room = rooms.find((item) => (
    String(item?.id || '') === String(table.roomId || '')
    || (
      String(table.zone || '').trim()
      && String(item?.name || '').trim().toLowerCase() === String(table.zone).trim().toLowerCase()
    )
  ));
  const configuredPdvIds = Array.isArray(config?.salesPointIds)
    ? config.salesPointIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const businessPdvs = await listScopedPointsOfSaleForBusiness(
    req,
    table.user_id,
    tableBusinessId,
  ).catch(() => []);
  const activePdvIds = (businessPdvs || [])
    .filter((pdv) => pdv && pdv.active !== false && !pdv.deletedAt)
    .map((pdv) => String(pdv._id || '').trim())
    .filter(Boolean);
  const allowedPdvIds = configuredPdvIds.length > 0 ? configuredPdvIds : activePdvIds;
  let salesPointId = String(room?.pdvId || '').trim();
  if (!salesPointId && allowedPdvIds.length === 1) salesPointId = allowedPdvIds[0];
  if (!salesPointId && allowedPdvIds.length === 0) {
    const error = new Error('Configura un punto de venta antes de usar los QR de mesa');
    error.status = 409;
    throw error;
  }
  if (!salesPointId && allowedPdvIds.length > 1) {
    const error = new Error('Configura el punto de venta de esta zona antes de usar su QR');
    error.status = 409;
    throw error;
  }
  if (salesPointId && allowedPdvIds.length > 0 && !allowedPdvIds.includes(salesPointId)) {
    const error = new Error('El punto de venta de la zona no está habilitado en la web');
    error.status = 409;
    throw error;
  }

  return {
    table,
    config,
    room: room || null,
    salesPointId,
    businessId: tableBusinessId,
  };
}

/**
 * Asegura token opaco en cada mesa activa de la empresa.
 * @returns {{ tables: object[], created: number }}
 */
export async function ensureMesaQrTokensForBusiness(req, userId, businessId) {
  const uid = String(userId || '').trim();
  const bid = normalizeBusinessId(businessId);
  if (!uid || !bid) {
    return { tables: [], created: 0 };
  }

  const listed = await listDiningTablesByUser(req, uid);
  const scoped = (listed || []).filter((t) => {
    if (t.active === false || t.deletedAt) return false;
    const tBid = normalizeBusinessId(t.businessId);
    return !tBid || tBid === bid;
  });

  const db = getSalaDbName();
  const toSave = [];
  let created = 0;

  for (const table of scoped) {
    const current = String(table.qrCode || '').trim();
    if (current.startsWith('mt_') && current.length >= 12) {
      continue;
    }
    const nextToken = generateMesaQrToken();
    toSave.push(
      buildDiningTableDocument(
        uid,
        { ...sanitizeDiningTable(table), qrCode: nextToken, businessId: bid },
        table,
      ),
    );
    created += 1;
  }

  if (toSave.length > 0) {
    await bulkPutDocuments(req, db, toSave);
  }

  const refreshed = await listDiningTablesByUser(req, uid);
  const tables = (refreshed || [])
    .filter((t) => {
      if (t.active === false || t.deletedAt) return false;
      const tBid = normalizeBusinessId(t.businessId);
      return !tBid || tBid === bid;
    })
    .map((t) => sanitizeDiningTable(t));

  return { tables, created };
}

export async function rotateMesaQrToken(req, userId, tableId) {
  const uid = String(userId || '').trim();
  const tid = String(tableId || '').trim();
  if (!uid || !tid) return null;

  const db = getSalaDbName();
  const existing = (await listDiningTablesByUser(req, uid)).find(
    (t) => String(t._id || '') === tid,
  );
  if (!existing || existing.user_id !== uid) return null;

  const nextToken = generateMesaQrToken();
  const doc = buildDiningTableDocument(
    uid,
    { ...sanitizeDiningTable(existing), qrCode: nextToken },
    existing,
  );
  const saved = await putDocument(req, db, doc._id, doc);
  return sanitizeDiningTable({ ...doc, _rev: saved.rev });
}

/** Payload público seguro (sin ids internos sensibles de más). */
export async function buildPublicMesaPayload(req, tableDoc) {
  if (!tableDoc) return null;
  const table = sanitizeDiningTable(tableDoc);
  const businessId = normalizeBusinessId(table.businessId);
  let webSlug = '';
  let webEnabled = false;
  let storeName = '';
  let salesPointId = '';
  let setupError = '';

  if (businessId) {
    try {
      const cfg = await getWebConfigByBusinessId(req, businessId);
      if (cfg) {
        webSlug = String(cfg.slug || '').trim();
        webEnabled = Boolean(cfg.enabled) && Boolean(webSlug);
        storeName = String(cfg.storeName || '').trim();
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const context = await resolveMesaQrContext(req, {
      token: table.qrCode,
      tableId: table._id,
      businessId,
    });
    salesPointId = context.salesPointId;
  } catch (error) {
    setupError = error instanceof Error ? error.message : 'Configuración de mesa incompleta';
  }

  return {
    token: String(table.qrCode || '').trim(),
    tableId: table._id,
    tableNumber: table.number,
    tableName: table.name || `Mesa ${table.number}`,
    zone: table.zone || '',
    businessId,
    webSlug,
    webEnabled,
    storeName,
    salesPointId,
    setupError,
  };
}
