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
  getAllDocuments,
  getDocument,
  putDocument,
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
      doc[field] = data[field];
    } else if (existing && existing[field] !== undefined) {
      doc[field] = existing[field];
    } else {
      doc[field] = '';
    }
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
    out[field] = doc[field] !== undefined ? doc[field] : '';
  }
  return out;
}

async function listByUser(req, dbName, entityCfg, userId) {
  await ensureDatabase(req, dbName);
  const docs = await getAllDocuments(req, dbName);
  return docs
    .filter(d => d?.type === entityCfg.type && !d?.deletedAt && (!userId || d?.user_id === userId))
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

  // Dashboard / KPI endpoint
  router.get('/dashboard/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      if (!userId) return badRequest(res, 'Falta userId');
      const account = await findAccountByUserId(req, userId);
      if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

      await ensureDatabase(req, dbName);
      const docs = await getAllDocuments(req, dbName);
      const userDocs = docs.filter(d => d?.user_id === userId && !d?.deletedAt);

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
        const items = await listByUser(req, dbName, entityCfg, userId);
        return res.json({ ok: true, items: items.map(d => sanitize(entityCfg, d)) });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message || `Error al listar ${entityKey}` });
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
        const doc = buildDocument(entityCfg, userId, data);
        const saved = await putDocument(req, dbName, doc._id, doc);
        return res.status(201).json({ ok: true, item: sanitize(entityCfg, { ...doc, _rev: saved.rev }) });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message || `Error al crear ${entityKey}` });
      }
    });

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

        const doc = buildDocument(entityCfg, userId, data, existing);
        const saved = await putDocument(req, dbName, doc._id, doc);
        return res.json({ ok: true, item: sanitize(entityCfg, { ...doc, _rev: saved.rev }) });
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
