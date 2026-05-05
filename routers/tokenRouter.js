import { Router } from 'express';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { couchRequest, ensureDatabase } from '../services/couchdb.js';

export const API_TOKENS_DB = 'api-tokens';

const tokenRouter = Router();

function generateApiToken() {
  return `vertial_sk_${crypto.randomBytes(32).toString('hex')}`;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sanitizeToken(doc, includeToken = false) {
  return {
    id: doc._id,
    name: doc.name || '',
    description: doc.description || '',
    userId: doc.userId || '',
    permissions: doc.permissions || [],
    prefix: doc.prefix || '',
    createdAt: doc.createdAt || '',
    expiresAt: doc.expiresAt || null,
    lastUsedAt: doc.lastUsedAt || null,
    active: doc.active !== false,
    ...(includeToken ? { token: doc.token } : {}),
  };
}

// A-09: Límite máximo de expiración configurable vía env (0 = sin límite)
function getMaxExpiryDays() {
  const val = parseInt(process.env.API_TOKEN_MAX_EXPIRY_DAYS || '0', 10);
  return val > 0 ? val : null;
}

// A-09: Calcular expiresAt respetando el límite máximo configurado
function resolveExpiresAt(expiresInDays) {
  const maxDays = getMaxExpiryDays();
  let days = expiresInDays && Number(expiresInDays) > 0 ? Number(expiresInDays) : null;

  if (days === null && maxDays !== null) {
    days = maxDays; // Aplicar máximo como expiración obligatoria si está configurado
  }
  if (days !== null && maxDays !== null && days > maxDays) {
    days = maxDays;
  }
  if (days === null) return null;

  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// POST /api/tokens — Crear nuevo token
tokenRouter.post('/', async (req, res) => {
  try {
    const { name, description, userId, permissions, expiresInDays } = req.body || {};

    if (!name || !userId) {
      return res.status(400).json({ ok: false, error: 'Faltan campos: name, userId' });
    }

    const maxDays = getMaxExpiryDays();
    if (expiresInDays && maxDays !== null && Number(expiresInDays) > maxDays) {
      return res.status(400).json({
        ok: false,
        error: `La expiración máxima permitida es de ${maxDays} días`,
        maxExpiryDays: maxDays,
      });
    }

    await ensureDatabase(req, API_TOKENS_DB);

    const rawToken = generateApiToken();
    const tokenHash = hashToken(rawToken);
    const now = new Date().toISOString();
    const expiresAt = resolveExpiresAt(expiresInDays);

    const doc = {
      _id: `token_${uuidv4()}`,
      type: 'api_token',
      name: String(name).trim(),
      description: String(description || '').trim(),
      userId: String(userId),
      permissions: Array.isArray(permissions) ? permissions : [],
      prefix: rawToken.slice(0, 12) + '...',
      token: rawToken,
      tokenHash,
      createdAt: now,
      expiresAt,
      lastUsedAt: null,
      active: true,
    };

    const response = await couchRequest(req, `/${encodeURIComponent(API_TOKENS_DB)}`, {
      method: 'POST',
      body: JSON.stringify(doc),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({ ok: false, error: 'Error guardando token', details: payload });
    }

    return res.status(201).json({
      ok: true,
      token: sanitizeToken(doc, true),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error creando token' });
  }
});

// GET /api/tokens/:userId — Listar tokens del usuario
tokenRouter.get('/:userId', async (req, res) => {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'Falta userId' });
    }

    await ensureDatabase(req, API_TOKENS_DB);

    const response = await couchRequest(
      req,
      `/${encodeURIComponent(API_TOKENS_DB)}/_all_docs?include_docs=true`,
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return res.status(response.status).json({ ok: false, error: 'Error listando tokens', details: payload });
    }

    const body = await response.json().catch(() => ({ rows: [] }));
    const tokens = (body.rows || [])
      .map((row) => row.doc)
      .filter(
        (doc) =>
          doc &&
          doc.type === 'api_token' &&
          doc.userId === userId &&
          !String(doc._id || '').startsWith('_design/') &&
          !doc.deletedAt,
      )
      .map((doc) => sanitizeToken(doc, false))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    return res.json({ ok: true, tokens });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error listando tokens' });
  }
});

// A-09: GET /api/tokens/:userId/expiring-soon — Tokens que expiran en los próximos N días
tokenRouter.get('/:userId/expiring-soon', async (req, res) => {
  try {
    const userId = String(req.params.userId || '').trim();
    const days = Math.max(1, parseInt(req.query.days || '7', 10));

    if (!userId) {
      return res.status(400).json({ ok: false, error: 'Falta userId' });
    }

    await ensureDatabase(req, API_TOKENS_DB);

    const response = await couchRequest(
      req,
      `/${encodeURIComponent(API_TOKENS_DB)}/_all_docs?include_docs=true`,
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return res.status(response.status).json({ ok: false, error: 'Error listando tokens', details: payload });
    }

    const body = await response.json().catch(() => ({ rows: [] }));
    const threshold = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const now = new Date();

    const tokens = (body.rows || [])
      .map((row) => row.doc)
      .filter(
        (doc) =>
          doc &&
          doc.type === 'api_token' &&
          doc.userId === userId &&
          doc.active !== false &&
          !doc.deletedAt &&
          !String(doc._id || '').startsWith('_design/') &&
          doc.expiresAt &&
          new Date(doc.expiresAt) > now &&
          new Date(doc.expiresAt) <= threshold,
      )
      .map((doc) => ({
        ...sanitizeToken(doc, false),
        daysUntilExpiry: Math.ceil((new Date(doc.expiresAt) - now) / (24 * 60 * 60 * 1000)),
      }))
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    return res.json({ ok: true, tokens, withinDays: days });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error listando tokens' });
  }
});

// A-09: POST /api/tokens/:tokenId/rotate — Rotar token: crear nuevo con misma config y revocar el anterior
tokenRouter.post('/:tokenId/rotate', async (req, res) => {
  try {
    const tokenId = String(req.params.tokenId || '').trim();
    if (!tokenId) {
      return res.status(400).json({ ok: false, error: 'Falta tokenId' });
    }

    await ensureDatabase(req, API_TOKENS_DB);

    const getResp = await couchRequest(req, `/${encodeURIComponent(API_TOKENS_DB)}/${encodeURIComponent(tokenId)}`);
    if (!getResp.ok) {
      return res.status(404).json({ ok: false, error: 'Token no encontrado' });
    }

    const oldDoc = await getResp.json().catch(() => ({}));

    if (oldDoc.active === false || oldDoc.deletedAt) {
      return res.status(400).json({ ok: false, error: 'No se puede rotar un token ya revocado' });
    }

    const now = new Date().toISOString();

    // Preservar la misma duración de expiración relativa (si tenía)
    let newExpiresAt = null;
    if (oldDoc.expiresAt && oldDoc.createdAt) {
      const originalDurationMs = new Date(oldDoc.expiresAt) - new Date(oldDoc.createdAt);
      if (originalDurationMs > 0) {
        newExpiresAt = new Date(Date.now() + originalDurationMs).toISOString();
      }
    }

    const rawToken = generateApiToken();
    const tokenHash = hashToken(rawToken);

    const newDoc = {
      _id: `token_${uuidv4()}`,
      type: 'api_token',
      name: oldDoc.name || '',
      description: oldDoc.description || '',
      userId: oldDoc.userId || '',
      permissions: oldDoc.permissions || [],
      prefix: rawToken.slice(0, 12) + '...',
      token: rawToken,
      tokenHash,
      createdAt: now,
      expiresAt: newExpiresAt,
      lastUsedAt: null,
      active: true,
      rotatedFromId: tokenId,
    };

    // Guardar el nuevo token
    const createResp = await couchRequest(req, `/${encodeURIComponent(API_TOKENS_DB)}`, {
      method: 'POST',
      body: JSON.stringify(newDoc),
    });

    if (!createResp.ok) {
      const payload = await createResp.json().catch(() => ({}));
      return res.status(createResp.status).json({ ok: false, error: 'Error creando nuevo token', details: payload });
    }

    // Revocar el token anterior
    const revokedDoc = { ...oldDoc, active: false, deletedAt: now, updatedAt: now, rotatedToId: newDoc._id };
    await couchRequest(
      req,
      `/${encodeURIComponent(API_TOKENS_DB)}/${encodeURIComponent(tokenId)}`,
      { method: 'PUT', body: JSON.stringify(revokedDoc) },
    ).catch(() => {});

    return res.status(201).json({
      ok: true,
      token: sanitizeToken(newDoc, true),
      revokedTokenId: tokenId,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error rotando token' });
  }
});

// DELETE /api/tokens/:tokenId — Revocar token
tokenRouter.delete('/:tokenId', async (req, res) => {
  try {
    const tokenId = String(req.params.tokenId || '').trim();
    if (!tokenId) {
      return res.status(400).json({ ok: false, error: 'Falta tokenId' });
    }

    await ensureDatabase(req, API_TOKENS_DB);

    const getResp = await couchRequest(req, `/${encodeURIComponent(API_TOKENS_DB)}/${encodeURIComponent(tokenId)}`);
    if (!getResp.ok) {
      return res.status(404).json({ ok: false, error: 'Token no encontrado' });
    }

    const doc = await getResp.json().catch(() => ({}));
    const now = new Date().toISOString();
    const updated = { ...doc, active: false, deletedAt: now, updatedAt: now };

    const putResp = await couchRequest(
      req,
      `/${encodeURIComponent(API_TOKENS_DB)}/${encodeURIComponent(tokenId)}`,
      { method: 'PUT', body: JSON.stringify(updated) },
    );

    if (!putResp.ok) {
      const payload = await putResp.json().catch(() => ({}));
      return res.status(putResp.status).json({ ok: false, error: 'Error revocando token', details: payload });
    }

    return res.json({ ok: true, id: tokenId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error revocando token' });
  }
});

export async function validateApiToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'Token de API requerido. Usa Authorization: Bearer <token>' });
    }

    const rawToken = authHeader.slice(7).trim();
    if (!rawToken) {
      return res.status(401).json({ ok: false, error: 'Token vacío' });
    }

    const tokenHash = hashToken(rawToken);

    const response = await couchRequest(
      req,
      `/${encodeURIComponent(API_TOKENS_DB)}/_all_docs?include_docs=true`,
    );

    if (!response.ok) {
      return res.status(500).json({ ok: false, error: 'Error validando token' });
    }

    const body = await response.json().catch(() => ({ rows: [] }));
    const tokenDoc = (body.rows || [])
      .map((row) => row.doc)
      .find(
        (doc) =>
          doc &&
          doc.type === 'api_token' &&
          doc.tokenHash === tokenHash &&
          doc.active !== false &&
          !doc.deletedAt,
      );

    if (!tokenDoc) {
      return res.status(401).json({ ok: false, error: 'Token inválido o revocado' });
    }

    if (tokenDoc.expiresAt && new Date(tokenDoc.expiresAt) < new Date()) {
      return res.status(401).json({ ok: false, error: 'Token expirado' });
    }

    const now = new Date().toISOString();
    const updatedDoc = { ...tokenDoc, lastUsedAt: now };
    couchRequest(req, `/${encodeURIComponent(API_TOKENS_DB)}/${encodeURIComponent(tokenDoc._id)}`, {
      method: 'PUT',
      body: JSON.stringify(updatedDoc),
    }).catch(() => {});

    req.apiToken = tokenDoc;
    req.apiUserId = tokenDoc.userId;
    req.apiPermissions = tokenDoc.permissions || [];

    return next();
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error de autenticación' });
  }
}

export { tokenRouter };
