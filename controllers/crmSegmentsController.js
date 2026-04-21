/**
 * C-04: Segmentos CRM guardados en servidor
 * Almacena los segmentos definidos en SegmentBuilder en CouchDB para que sean
 * persistentes, compartidos entre sesiones y conectables a campañas.
 */
import { v4 as uuidv4 } from 'uuid';
import {
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
} from '../services/couchdb.js';

const SEGMENTS_DB = 'crm-segments';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function sanitizeSegment(doc) {
  return {
    id: doc._id,
    name: doc.name || '',
    entityType: doc.entityType || 'both',
    conditions: Array.isArray(doc.conditions) ? doc.conditions : [],
    description: doc.description || '',
    color: doc.color || '#6d28d9',
    isActive: doc.isActive !== false,
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    user_id: doc.user_id || '',
  };
}

export async function listSegments(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await ensureDatabase(req, SEGMENTS_DB);
    const docs = await getAllDocuments(req, SEGMENTS_DB);
    const segments = docs
      .filter((d) => d?.type === 'crm_segment' && d?.user_id === userId && !d?.deletedAt)
      .map(sanitizeSegment)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({ ok: true, segments });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error cargando segmentos' });
  }
}

export async function createSegment(req, res) {
  try {
    const { userId } = req.params;
    const { segment } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!segment?.name?.trim()) return badRequest(res, 'El nombre del segmento es obligatorio');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await ensureDatabase(req, SEGMENTS_DB);
    const now = new Date().toISOString();
    const id = `segment-${uuidv4()}`;
    const doc = {
      _id: id,
      type: 'crm_segment',
      user_id: userId,
      name: segment.name.trim(),
      entityType: segment.entityType || 'both',
      conditions: Array.isArray(segment.conditions) ? segment.conditions : [],
      description: segment.description?.trim() || '',
      color: segment.color || '#6d28d9',
      isActive: segment.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await putDocument(req, SEGMENTS_DB, id, doc);
    return res.status(201).json({ ok: true, segment: sanitizeSegment({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error creando segmento' });
  }
}

export async function updateSegment(req, res) {
  try {
    const { userId, segmentId } = req.params;
    const { segment } = req.body || {};

    if (!segment?.name?.trim()) return badRequest(res, 'El nombre del segmento es obligatorio');

    await ensureDatabase(req, SEGMENTS_DB);
    const existing = await getDocument(req, SEGMENTS_DB, segmentId);
    if (!existing || existing.type !== 'crm_segment' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Segmento no encontrado' });
    }

    const updatedDoc = {
      ...existing,
      name: segment.name.trim(),
      entityType: segment.entityType || existing.entityType,
      conditions: Array.isArray(segment.conditions) ? segment.conditions : existing.conditions,
      description: segment.description?.trim() ?? existing.description,
      color: segment.color || existing.color,
      isActive: segment.isActive !== undefined ? segment.isActive : existing.isActive,
      updatedAt: new Date().toISOString(),
    };

    const saved = await putDocument(req, SEGMENTS_DB, segmentId, updatedDoc);
    return res.json({ ok: true, segment: sanitizeSegment({ ...updatedDoc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error actualizando segmento' });
  }
}

export async function deleteSegment(req, res) {
  try {
    const { userId, segmentId } = req.params;

    await ensureDatabase(req, SEGMENTS_DB);
    const existing = await getDocument(req, SEGMENTS_DB, segmentId);
    if (!existing || existing.type !== 'crm_segment' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Segmento no encontrado' });
    }

    await softDeleteDocument(req, SEGMENTS_DB, segmentId);
    return res.json({ ok: true, id: segmentId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error eliminando segmento' });
  }
}
