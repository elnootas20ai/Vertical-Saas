import {
  BUSINESSES_DB,
  ensureDatabase,
  getDocument,
  putDocument,
} from '../services/couchdb.js';

function docId(businessId) {
  return `orgchart:${businessId}`;
}

function emptyChart(businessId) {
  return {
    _id: docId(businessId),
    type: 'orgchart',
    business_id: businessId,
    nodes: [],
    edges: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function getOrgChart(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return res.status(400).json({ ok: false, error: 'Falta businessId' });

    await ensureDatabase(req, BUSINESSES_DB);
    const doc = await getDocument(req, BUSINESSES_DB, docId(businessId));

    if (!doc) {
      return res.json({ ok: true, orgchart: emptyChart(businessId) });
    }

    return res.json({ ok: true, orgchart: doc });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al obtener el organigrama',
    });
  }
}

export async function saveOrgChart(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return res.status(400).json({ ok: false, error: 'Falta businessId' });

    const { nodes, edges } = req.body || {};
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      return res.status(400).json({ ok: false, error: 'nodes y edges deben ser arrays' });
    }

    await ensureDatabase(req, BUSINESSES_DB);
    const existing = await getDocument(req, BUSINESSES_DB, docId(businessId));

    const doc = {
      ...(existing || {}),
      _id: docId(businessId),
      type: 'orgchart',
      business_id: businessId,
      nodes,
      edges,
      updatedAt: new Date().toISOString(),
    };

    const result = await putDocument(req, BUSINESSES_DB, doc._id, doc);

    return res.json({
      ok: true,
      orgchart: { ...doc, _rev: result.rev },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al guardar el organigrama',
    });
  }
}
