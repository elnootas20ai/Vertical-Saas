/**
 * Generic CRUD factory for vertical modules.
 *
 * Given a config object describing a vertical and its entities,
 * produces an Express router with standard list / create / update / delete
 * endpoints that persist to CouchDB following the same patterns used by
 * cleaning, construction and delivery.
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  ensureDatabase,
  ensureIndex,
  findDocuments,
  getDocument,
  putDocument,
  putDocumentAttachment,
  getDocumentAttachment,
  softDeleteDocument,
  findAccountByUserId,
} from './couchdb.js';

// ─── DB naming (mirrors couchdb.js helpers) ────────────────────────────────

function normalizeDbName(value) {
  return String(value || '').toLowerCase().trim()
    .replace(/[^a-z0-9_$()+/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getDbPrefix() {
  return normalizeDbName(process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial');
}

// ─── Generic helpers ────────────────────────────────────────────────────────

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function normalizeScopeId(raw) {
  return String(raw || '').replace(/^business:/, '').trim();
}

function docBusinessId(doc) {
  return normalizeScopeId(doc?.businessId || doc?.business_id);
}

function docSalesPointId(doc) {
  return String(doc?.salesPointId || doc?.pointOfSaleId || '').trim();
}

/** Filtra por empresa/PDV. Docs legacy sin businessId siguen visibles (hasta que se guarden). */
function matchesScope(doc, businessId, salesPointId) {
  const bid = normalizeScopeId(businessId);
  if (bid) {
    const docBid = docBusinessId(doc);
    if (docBid && docBid !== bid) return false;
  }
  const pdv = String(salesPointId || '').trim();
  if (pdv) {
    const docPdv = docSalesPointId(doc);
    if (docPdv && docPdv !== pdv) return false;
  }
  return true;
}

function buildDocument(entityCfg, userId, data, existing) {
  const now = new Date().toISOString();
  const id = existing?._id || `${entityCfg.idPrefix}-${uuidv4()}`;

  const doc = {
    _id: id,
    _rev: existing?._rev,
    type: entityCfg.type,
    user_id: userId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  for (const field of entityCfg.fields) {
    if (data[field] !== undefined) {
      if (field === 'fotos') {
        const raw = data[field];
        doc[field] = Array.isArray(raw)
          ? raw.filter((u) => typeof u === 'string' && u.trim().length > 0)
          : [];
      } else {
        doc[field] = data[field];
      }
    } else if (existing && existing[field] !== undefined) {
      doc[field] = existing[field];
    } else {
      doc[field] = field === 'fotos' ? [] : '';
    }
  }

  // Siempre normalizar scope si el entity lo declara.
  if (entityCfg.fields.includes('businessId')) {
    const bid = normalizeScopeId(
      data.businessId ?? data.business_id ?? existing?.businessId ?? existing?.business_id,
    );
    doc.businessId = bid;
    doc.business_id = bid;
  }
  if (entityCfg.fields.includes('salesPointId')) {
    doc.salesPointId = String(
      data.salesPointId ?? data.pointOfSaleId ?? existing?.salesPointId ?? existing?.pointOfSaleId ?? '',
    ).trim();
  }

  // Sin esto CouchDB borra los adjuntos al PUT del documento.
  if (existing?._attachments && typeof existing._attachments === 'object') {
    doc._attachments = existing._attachments;
  }

  return doc;
}

function sanitize(entityCfg, doc) {
  if (!doc) return null;
  const out = {
    _id: doc._id,
    _rev: doc._rev,
    type: doc.type,
    user_id: doc.user_id,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
  for (const field of entityCfg.fields) {
    out[field] = doc[field] !== undefined ? doc[field] : (field === 'fotos' ? [] : '');
  }
  if (entityCfg.fields.includes('businessId')) {
    out.businessId = docBusinessId(doc);
    out.business_id = out.businessId;
  }
  return out;
}

function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || '').replace(/\s/g, '');
  const m = /^data:([^;]+);base64,([\s\S]+)$/i.exec(raw);
  if (!m) return null;
  try {
    const buffer = Buffer.from(m[2], 'base64');
    if (!buffer.length) return null;
    return { contentType: m[1] || 'image/jpeg', buffer };
  } catch {
    return null;
  }
}

function isDataUrlFoto(value) {
  return /^data:image\//i.test(String(value || '').trim());
}

function attachmentNameFromFotoRef(value) {
  const s = String(value || '').trim();
  if (!s || isDataUrlFoto(s)) return '';
  // att:foto-0.jpg  |  /api/.../foto-0.jpg  |  foto-0.jpg
  if (s.startsWith('att:')) return s.slice(4);
  const marker = '/foto/';
  const idx = s.lastIndexOf(marker);
  if (idx >= 0) return decodeURIComponent(s.slice(idx + marker.length).split('?')[0]);
  if (s.includes('/')) {
    const last = s.split('/').pop() || '';
    return decodeURIComponent(last.split('?')[0]);
  }
  return s;
}

/**
 * Adjunta UNA foto (data URL) al documento y la añade a `fotos` como `att:nombre`.
 * Nunca guarda base64 inline en el JSON (límite Couch ~8MB / fallos silenciosos).
 */
async function appendOneFotoAttachment(req, dbName, doc, dataUrl, index = 0) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed || !parsed.buffer?.length) {
    throw new Error('Una foto llegó corrupta (data URL inválida). Vuelve a seleccionarla.');
  }
  let rev = doc._rev;
  const ext = /png/i.test(parsed.contentType) ? 'png' : 'jpg';
  const name = `foto-${Date.now().toString(36)}-${index}.${ext}`;
  const contentType = parsed.contentType.startsWith('image/')
    ? parsed.contentType
    : 'image/jpeg';

  let savedAtt;
  try {
    savedAtt = await putDocumentAttachment(
      req,
      dbName,
      doc._id,
      name,
      parsed.buffer,
      contentType,
      rev,
    );
  } catch (err) {
    // Conflicto de rev: reintentar una vez con el doc fresco.
    const fresh = await getDocument(req, dbName, doc._id);
    if (!fresh?._rev) throw err;
    rev = fresh._rev;
    savedAtt = await putDocumentAttachment(
      req,
      dbName,
      doc._id,
      name,
      parsed.buffer,
      contentType,
      rev,
    );
  }

  const fresh = await getDocument(req, dbName, doc._id);
  if (!fresh) {
    throw new Error('La propiedad desapareció al guardar la foto');
  }
  const prevFotos = Array.isArray(fresh.fotos) ? fresh.fotos : [];
  const attRef = `att:${name}`;
  const fotos = prevFotos.includes(attRef) ? prevFotos : [...prevFotos, attRef];
  // Siempre stubs actuales de Couch: un PUT sin `_attachments` borra los binarios.
  const attachments = (fresh._attachments && typeof fresh._attachments === 'object')
    ? fresh._attachments
    : undefined;
  const next = {
    ...fresh,
    _rev: fresh._rev || savedAtt.rev || rev,
    fotos,
    updatedAt: new Date().toISOString(),
    ...(attachments ? { _attachments: attachments } : {}),
  };
  const saved = await putDocument(req, dbName, doc._id, next);
  const reloaded = await getDocument(req, dbName, doc._id);
  return {
    ...(reloaded || next),
    _rev: (reloaded && reloaded._rev) || saved.rev || next._rev,
    _attachedName: name,
  };
}

/**
 * Las data URLs no caben bien en el JSON del doc (límite Couch ~8MB).
 * Se guardan como adjuntos y en `fotos` queda la ref `att:nombre`.
 */
async function persistFotosField(req, dbName, entityKey, userId, doc, rawFotos) {
  const list = Array.isArray(rawFotos) ? rawFotos : [];
  if (!list.length) {
    return { ...doc, fotos: [] };
  }

  const kept = [];
  let current = { ...doc };
  let i = 0;

  for (const item of list) {
    const s = String(item || '').trim();
    if (!s) continue;
    if (!isDataUrlFoto(s)) {
      const name = attachmentNameFromFotoRef(s);
      kept.push(name ? `att:${name}` : s);
      continue;
    }
    try {
      current = await appendOneFotoAttachment(req, dbName, current, s, i);
      i += 1;
      const attName = current._attachedName;
      delete current._attachedName;
      if (attName) kept.push(`att:${attName}`);
    } catch (err) {
      console.error('[verticalCrud] persistFotosField attach failed', err);
      throw new Error(
        err instanceof Error
          ? `No se pudo guardar la foto: ${err.message}`
          : 'No se pudo guardar la foto en el servidor',
      );
    }
  }

  // Releer y fijar la lista final (orden del cliente; quita adjuntos huérfanos de la lista).
  const fresh = await getDocument(req, dbName, doc._id);
  if (!fresh) {
    return { ...current, fotos: kept };
  }
  const attachments = (fresh._attachments && typeof fresh._attachments === 'object')
    ? fresh._attachments
    : undefined;
  const next = {
    ...fresh,
    fotos: kept,
    updatedAt: new Date().toISOString(),
    ...(attachments ? { _attachments: attachments } : {}),
  };
  const saved = await putDocument(req, dbName, doc._id, next);
  const reloaded = await getDocument(req, dbName, doc._id);
  return { ...(reloaded || next), _rev: (reloaded && reloaded._rev) || saved.rev || next._rev };
}

function toClientFotoRefs(verticalName, entityKey, userId, docId, fotos, attachments) {
  const list = Array.isArray(fotos) ? fotos : [];
  const hasAttRefs = list.some((f) => {
    const s = String(f || '');
    return s.startsWith('att:') || s.includes('/foto/');
  });
  const attKeys = (attachments && typeof attachments === 'object')
    ? new Set(Object.keys(attachments))
    : (hasAttRefs ? new Set() : null);
  return list.map((f) => {
    const s = String(f || '').trim();
    if (!s) return '';
    // Data URLs enormes en el listado tumban el navegador (pantalla en blanco).
    if (isDataUrlFoto(s)) {
      if (s.length > 1_200_000) return '';
      return s;
    }
    if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('blob:')) {
      return s;
    }
    const name = attachmentNameFromFotoRef(s);
    if (!name) return s;
    // No devolver URLs que van a 404 (refs huérfanas tras PUT sin stubs).
    if (attKeys && !attKeys.has(name)) return '';
    return `/api/${verticalName}/${entityKey}/${encodeURIComponent(userId)}/${encodeURIComponent(docId)}/foto/${encodeURIComponent(name)}`;
  }).filter(Boolean);
}

function sanitizeForClient(verticalName, entityKey, entityCfg, doc) {
  const out = sanitize(entityCfg, doc);
  if (!out) return null;
  if (entityCfg.fields.includes('fotos')) {
    out.fotos = toClientFotoRefs(
      verticalName,
      entityKey,
      doc.user_id,
      doc._id,
      doc.fotos,
      doc._attachments,
    );
  }
  return out;
}

const verticalTypeUserIndexReady = new Set();

async function ensureVerticalTypeUserIndex(req, dbName) {
  if (verticalTypeUserIndexReady.has(dbName)) return;
  const safeDb = String(dbName || '').replace(/[^a-z0-9_$()+/-]+/g, '-');
  await ensureIndex(req, dbName, ['type', 'user_id'], `idx-${safeDb}-type-user`).catch(() => null);
  verticalTypeUserIndexReady.add(dbName);
}

async function listByUser(req, dbName, entityCfg, userId, scope = {}) {
  await ensureDatabase(req, dbName);
  await ensureVerticalTypeUserIndex(req, dbName);
  const businessId = normalizeScopeId(scope.businessId);
  const salesPointId = String(scope.salesPointId || '').trim();
  let docs = [];
  try {
    const selector = userId
      ? { type: entityCfg.type, user_id: userId }
      : { type: entityCfg.type };
    docs = await findDocuments(req, dbName, selector, { pageSize: 500, maxDocs: 10_000 });
  } catch {
    docs = [];
  }
  return docs
    .filter(d =>
      d?.type === entityCfg.type
      && !d?.deletedAt
      && (!userId || d?.user_id === userId)
      && matchesScope(d, businessId, salesPointId),
    )
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * @param {object} config
 * @param {string} config.name        – e.g. 'taxi'
 * @param {string} config.dbSuffix    – e.g. 'taxi' → DB "<prefijo>-taxi"
 * @param {Record<string, object>} config.entities – keyed by entity plural name
 *
 * Each entity: { type, idPrefix, fields: string[], required?: string[] }
 */
export function createVerticalRouter(config) {
  const router = Router();
  const dbName = normalizeDbName(
    process.env[`VITE_${config.name.toUpperCase()}_DB`] || `${getDbPrefix()}-${config.dbSuffix}`
  );

  // APIs autenticadas: sin ETag/304 vacío (el cliente interpretaba 304 como error).
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });

  // Dashboard / KPI endpoint
  router.get('/dashboard/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      if (!userId) return badRequest(res, 'Falta userId');
      const account = await findAccountByUserId(req, userId);
      if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

      const businessId = normalizeScopeId(req.query.businessId || req.query.business_id);
      const salesPointId = String(req.query.salesPointId || req.query.pointOfSaleId || '').trim();

      await ensureDatabase(req, dbName);
      const userDocs = [];
      for (const entityCfg of Object.values(config.entities)) {
        const rows = await listByUser(req, dbName, entityCfg, userId, { businessId, salesPointId });
        userDocs.push(...rows);
      }

      const counts = {};
      for (const [key, entityCfg] of Object.entries(config.entities)) {
        counts[key] = userDocs.filter(d => d?.type === entityCfg.type).length;
      }

      const recentActivity = userDocs
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        .slice(0, 10)
        .map(d => ({
          id: d._id,
          type: d.type,
          updatedAt: d.updatedAt,
          createdAt: d.createdAt,
          summary: d.nombre || d.name || d.clientName || d.referencia || d._id,
        }));

      return res.json({ ok: true, counts, recentActivity, total: userDocs.length });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message || 'Error al cargar dashboard' });
    }
  });

  for (const [entityKey, entityCfg] of Object.entries(config.entities)) {

    // LIST
    router.get(`/${entityKey}/:userId`, async (req, res) => {
      try {
        const { userId } = req.params;
        if (!userId) return badRequest(res, 'Falta userId');
        const account = await findAccountByUserId(req, userId);
        if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
        const businessId = normalizeScopeId(req.query.businessId || req.query.business_id);
        const salesPointId = String(req.query.salesPointId || req.query.pointOfSaleId || '').trim();
        const items = await listByUser(req, dbName, entityCfg, userId, { businessId, salesPointId });
        return res.json({
          ok: true,
          items: items
            .map((d) => {
              try {
                return sanitizeForClient(config.name, entityKey, entityCfg, d);
              } catch (err) {
                console.error(`[verticalCrud] sanitize ${entityKey} ${d?._id}`, err);
                return null;
              }
            })
            .filter(Boolean),
        });
      } catch (error) {
        console.error(`[verticalCrud] list ${config.name}/${entityKey}`, error);
        return res.status(500).json({
          ok: false,
          error: error?.message || `Error al listar ${entityKey}`,
        });
      }
    });

    // CREATE
    router.post(`/${entityKey}/:userId`, async (req, res) => {
      try {
        const { userId } = req.params;
        const { data } = req.body || {};
        if (!userId) return badRequest(res, 'Falta userId');
        if (!data || typeof data !== 'object') return badRequest(res, 'Falta data en el body');

        if (entityCfg.required) {
          for (const f of entityCfg.required) {
            if (!data[f] && data[f] !== 0 && data[f] !== false) {
              return badRequest(res, `Campo requerido: ${f}`);
            }
          }
        }

        const account = await findAccountByUserId(req, userId);
        if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

        await ensureDatabase(req, dbName);
        const rawFotos = entityCfg.fields.includes('fotos') && Array.isArray(data.fotos)
          ? [...data.fotos]
          : null;
        const slimData = rawFotos
          ? { ...data, fotos: rawFotos.filter((f) => !isDataUrlFoto(f)).map((f) => {
            const name = attachmentNameFromFotoRef(f);
            return name ? `att:${name}` : f;
          }) }
          : data;
        const doc = buildDocument(entityCfg, userId, slimData);
        const saved = await putDocument(req, dbName, doc._id, doc);
        let finalDoc = { ...doc, _rev: saved.rev };
        if (rawFotos && rawFotos.some(isDataUrlFoto)) {
          finalDoc = await persistFotosField(req, dbName, entityKey, userId, finalDoc, rawFotos);
        }
        const item = sanitizeForClient(config.name, entityKey, entityCfg, finalDoc);
        if (config.name === 'butcher-ops' && entityKey === 'catalog') {
          import('./butcherCatalogBridge.js')
            .then((m) => m.syncButcherCatalogToCore(req, userId, finalDoc))
            .catch(() => {});
        }
        return res.status(201).json({ ok: true, item });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message || `Error al crear ${entityKey}` });
      }
    });

    // Foto adjunta (auth vía API vertical; usable con fetch + blob en el cliente)
    if (entityCfg.fields.includes('fotos')) {
      router.get(`/${entityKey}/:userId/:id/foto/:fotoName`, async (req, res) => {
        try {
          const { userId, id, fotoName } = req.params;
          if (!userId || !id || !fotoName) return badRequest(res, 'Faltan parámetros');
          const account = await findAccountByUserId(req, userId);
          if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
          await ensureDatabase(req, dbName);
          const existing = await getDocument(req, dbName, id);
          if (!existing || existing.type !== entityCfg.type || existing.user_id !== userId) {
            return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
          }
          const name = decodeURIComponent(String(fotoName || '').trim());
          const attachments = existing._attachments && typeof existing._attachments === 'object'
            ? existing._attachments
            : {};
          if (!attachments[name]) {
            return res.status(404).json({ ok: false, error: 'Foto no encontrada' });
          }
          const { buffer, contentType } = await getDocumentAttachment(req, dbName, id, name);
          if (!buffer?.length) {
            return res.status(404).json({ ok: false, error: 'Foto vacía' });
          }
          res.setHeader('Content-Type', contentType || 'image/jpeg');
          res.setHeader('Cache-Control', 'private, max-age=3600');
          return res.send(buffer);
        } catch (error) {
          console.error('[verticalCrud] GET foto failed', error);
          return res.status(404).json({ ok: false, error: error.message || 'Foto no encontrada' });
        }
      });

      // Una foto por request (evita JSON gigante y fallos “en silencio” del PUT del doc).
      router.post(`/${entityKey}/:userId/:id/foto`, async (req, res) => {
        try {
          const { userId, id } = req.params;
          const dataUrl = String(req.body?.dataUrl || req.body?.foto || '').trim();
          if (!userId || !id) return badRequest(res, 'Falta userId o id');
          if (!isDataUrlFoto(dataUrl)) {
            return badRequest(res, 'Falta dataUrl de imagen (data:image/...)');
          }
          const account = await findAccountByUserId(req, userId);
          if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
          await ensureDatabase(req, dbName);
          const existing = await getDocument(req, dbName, id);
          if (!existing || existing.type !== entityCfg.type || existing.user_id !== userId) {
            return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
          }
          const idx = Array.isArray(existing.fotos) ? existing.fotos.length : 0;
          const finalDoc = await appendOneFotoAttachment(req, dbName, existing, dataUrl, idx);
          delete finalDoc._attachedName;
          const item = sanitizeForClient(config.name, entityKey, entityCfg, finalDoc);
          return res.status(201).json({ ok: true, item });
        } catch (error) {
          console.error('[verticalCrud] POST foto failed', error);
          return res.status(500).json({
            ok: false,
            error: error.message || 'No se pudo subir la foto',
          });
        }
      });
    }

    // UPDATE
    router.put(`/${entityKey}/:userId/:id`, async (req, res) => {
      try {
        const { userId, id } = req.params;
        const { data } = req.body || {};
        if (!userId || !id) return badRequest(res, 'Falta userId o id');
        if (!data || typeof data !== 'object') return badRequest(res, 'Falta data en el body');

        const account = await findAccountByUserId(req, userId);
        if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

        await ensureDatabase(req, dbName);
        const existing = await getDocument(req, dbName, id);
        if (!existing || existing.type !== entityCfg.type || existing.user_id !== userId) {
          return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
        }

        const rawFotos = entityCfg.fields.includes('fotos') && Array.isArray(data.fotos)
          ? [...data.fotos]
          : null;
        const slimData = rawFotos
          ? {
            ...data,
            fotos: rawFotos
              .filter((f) => !isDataUrlFoto(f))
              .map((f) => {
                const name = attachmentNameFromFotoRef(f);
                return name ? `att:${name}` : f;
              }),
          }
          : data;
        const doc = buildDocument(entityCfg, userId, slimData, existing);
        const saved = await putDocument(req, dbName, doc._id, doc);
        let finalDoc = { ...doc, _rev: saved.rev };
        if (rawFotos && rawFotos.some(isDataUrlFoto)) {
          finalDoc = await persistFotosField(req, dbName, entityKey, userId, finalDoc, rawFotos);
        } else if (rawFotos) {
          finalDoc = { ...finalDoc, fotos: slimData.fotos };
        }
        // Releer: stubs de adjuntos reales (evita devolver URLs de fotos ya borradas).
        const freshAfter = await getDocument(req, dbName, id);
        if (freshAfter) finalDoc = freshAfter;
        const item = sanitizeForClient(config.name, entityKey, entityCfg, finalDoc);
        if (config.name === 'butcher-ops' && entityKey === 'catalog') {
          import('./butcherCatalogBridge.js')
            .then((m) => m.syncButcherCatalogToCore(req, userId, finalDoc))
            .catch(() => {});
        }
        return res.json({ ok: true, item });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message || `Error al actualizar ${entityKey}` });
      }
    });

    // DELETE (soft)
    router.delete(`/${entityKey}/:userId/:id`, async (req, res) => {
      try {
        const { userId, id } = req.params;
        if (!userId || !id) return badRequest(res, 'Falta userId o id');

        const account = await findAccountByUserId(req, userId);
        if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

        await ensureDatabase(req, dbName);
        const existing = await getDocument(req, dbName, id);
        if (!existing || existing.type !== entityCfg.type || existing.user_id !== userId) {
          return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
        }

        await softDeleteDocument(req, dbName, id);
        return res.json({ ok: true });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message || `Error al eliminar ${entityKey}` });
      }
    });
  }

  return router;
}
