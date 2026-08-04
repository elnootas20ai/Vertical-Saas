import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getCouchConfig, buildCouchAuthHeader } from '../services/couchdb.js';
import { broadcastToBusiness } from '../services/sseService.js';
import { notifyChatMessageRecipients } from '../services/chatNotifications.js';
import logger from '../services/logger.js';

const chatRouter = Router();

const CHAT_DB = 'team_chat';

function authUserId(req) {
  return String(req.authUser?.userId || req.authUser?.user_id || '').trim();
}

let indexesReady = false;

async function ensureIndexes(req) {
  const indexes = [
    { index: { fields: ['type', 'businessId', 'updatedAt'] }, name: 'chat-channels-sorted', type: 'json' },
    { index: { fields: ['type', 'businessId', 'channelType'] }, name: 'chat-channels-type', type: 'json' },
    { index: { fields: ['type', 'businessId', 'channelType', 'memberKey'] }, name: 'chat-dm-memberkey', type: 'json' },
    { index: { fields: ['type', 'businessId', 'channelId', 'createdAt'] }, name: 'chat-msg-by-channel-time', type: 'json' },
    { index: { fields: ['type', 'businessId', 'createdAt'] }, name: 'chat-by-business-time', type: 'json' },
  ];
  for (const idx of indexes) {
    try {
      await couchReq(req, `/${CHAT_DB}/_index`, {
        method: 'POST',
        body: JSON.stringify(idx),
      });
    } catch {
      /* may already exist */
    }
  }
}

async function ensureChatDb(req) {
  const cfg = getCouchConfig(req);
  const url = `${cfg.baseUrl}/${CHAT_DB}`;
  const auth = buildCouchAuthHeader(req);
  try {
    const res = await fetch(url, { method: 'PUT', headers: { Authorization: auth } });
    if (!res.ok && res.status !== 412) {
      logger.warn({ tag: 'CHAT', msg: 'Could not ensure chat DB', status: res.status });
    }
  } catch (err) {
    logger.warn({ tag: 'CHAT', msg: 'ensureChatDb error', error: err.message });
  }
  if (!indexesReady) {
    indexesReady = true;
    await ensureIndexes(req).catch(() => {
      indexesReady = false;
    });
  }
}

/** _find con sort; si Couch se queja del índice, reintenta sin sort. */
async function chatFind(req, selector, { sort, limit = 200 } = {}) {
  const tryBodies = [];
  if (sort) {
    tryBodies.push({ selector, sort, limit });
  }
  tryBodies.push({ selector, limit });

  for (const body of tryBodies) {
    const cRes = await couchReq(req, `/${CHAT_DB}/_find`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (cRes.ok) {
      const data = await cRes.json();
      return data.docs || [];
    }
  }
  return [];
}

async function couchReq(req, path, init = {}) {
  const cfg = getCouchConfig(req);
  const auth = buildCouchAuthHeader(req);
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  return res;
}

// ─── Channels ───────────────────────────────────────────────────────────────

/**
 * GET /api/chat/channels/:businessId
 * List all channels for a business (general, groups, DMs).
 */
chatRouter.get('/channels/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const userId = authUserId(req) || String(req.query.userId || '').trim();

    await ensureChatDb(req);

    let channels = await chatFind(
      req,
      {
        type: 'chat_channel',
        businessId,
        archived: { $ne: true },
      },
      { sort: [{ updatedAt: 'desc' }], limit: 200 },
    );

    if (userId) {
      channels = channels.filter((ch) => {
        if (ch.channelType === 'general') return true;
        return (ch.members || []).includes(userId);
      });
    }

    channels.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

    return res.json({ ok: true, channels });
  } catch (error) {
    logger.error({ tag: 'CHAT', msg: 'GET channels error', error: error.message });
    return res.status(500).json({ ok: false, error: 'Error al cargar canales' });
  }
});

/**
 * POST /api/chat/channels/:businessId
 * Create a new channel. Body: { name, channelType, members[], description? }
 */
chatRouter.post('/channels/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { name, channelType, members, description } = req.body;
    const userId = authUserId(req);

    if (!name?.trim() && channelType !== 'direct') {
      return res.status(400).json({ ok: false, error: 'El canal necesita un nombre' });
    }

    await ensureChatDb(req);

    // DMs: miembros únicos (evitar [a,a] o ids vacíos) y reutilizar conversación existente.
    let memberList = Array.isArray(members)
      ? [...new Set(members.map((id) => String(id || '').trim()).filter(Boolean))]
      : [];
    if (channelType === 'direct') {
      if (userId && !memberList.includes(userId)) memberList.push(userId);
      memberList = [...new Set(memberList)];
      if (memberList.length !== 2) {
        return res.status(400).json({ ok: false, error: 'El mensaje directo necesita 2 personas' });
      }
      const sorted = [...memberList].sort();
      const existing = await chatFind(
        req,
        {
          type: 'chat_channel',
          businessId,
          channelType: 'direct',
          memberKey: sorted.join(':'),
          archived: { $ne: true },
        },
        { limit: 1 },
      );
      if (existing.length > 0) {
        return res.json({ ok: true, channel: existing[0], existing: true });
      }
    }

    const channelId = uuidv4();
    const now = new Date().toISOString();
    const sorted = channelType === 'direct' ? [...memberList].sort() : null;

    const doc = {
      _id: `channel:${channelId}`,
      type: 'chat_channel',
      channelId,
      businessId,
      name: channelType === 'direct' ? '' : String(name || '').trim(),
      description: description?.trim() || '',
      channelType: channelType || 'group',
      members: memberList,
      memberKey: sorted ? sorted.join(':') : undefined,
      createdBy: userId || '',
      createdAt: now,
      updatedAt: now,
      archived: false,
      lastMessage: null,
      lastMessageAt: null,
    };

    const cRes = await couchReq(req, `/${CHAT_DB}/${doc._id}`, {
      method: 'PUT',
      body: JSON.stringify(doc),
    });

    if (!cRes.ok) {
      const errBody = await cRes.text();
      logger.error({ tag: 'CHAT', msg: 'PUT channel error', status: cRes.status, body: errBody });
      return res.status(500).json({ ok: false, error: 'Error al crear canal' });
    }

    broadcastToBusiness(businessId, 'chat_channel_created', doc);

    return res.json({ ok: true, channel: doc });
  } catch (error) {
    logger.error({ tag: 'CHAT', msg: 'POST channel error', error: error.message });
    return res.status(500).json({ ok: false, error: 'Error al crear canal' });
  }
});

/**
 * PUT /api/chat/channels/:businessId/:channelId
 * Update channel name, description, or members.
 */
chatRouter.put('/channels/:businessId/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { name, description, members } = req.body;

    const getRes = await couchReq(req, `/${CHAT_DB}/channel:${channelId}`);
    if (!getRes.ok) {
      return res.status(404).json({ ok: false, error: 'Canal no encontrado' });
    }

    const doc = await getRes.json();
    if (name !== undefined) doc.name = name.trim();
    if (description !== undefined) doc.description = description.trim();
    if (members !== undefined) doc.members = members;
    doc.updatedAt = new Date().toISOString();

    const putRes = await couchReq(req, `/${CHAT_DB}/channel:${channelId}`, {
      method: 'PUT',
      body: JSON.stringify(doc),
    });

    if (!putRes.ok) {
      return res.status(500).json({ ok: false, error: 'Error al actualizar canal' });
    }

    broadcastToBusiness(doc.businessId, 'chat_channel_updated', doc);

    return res.json({ ok: true, channel: doc });
  } catch (error) {
    logger.error({ tag: 'CHAT', msg: 'PUT channel error', error: error.message });
    return res.status(500).json({ ok: false, error: 'Error al actualizar canal' });
  }
});

/**
 * DELETE /api/chat/channels/:businessId/:channelId
 * Archive a channel (soft delete).
 */
chatRouter.delete('/channels/:businessId/:channelId', async (req, res) => {
  try {
    const { businessId, channelId } = req.params;

    const getRes = await couchReq(req, `/${CHAT_DB}/channel:${channelId}`);
    if (!getRes.ok) {
      return res.status(404).json({ ok: false, error: 'Canal no encontrado' });
    }

    const doc = await getRes.json();
    if (doc.channelType === 'general') {
      return res.status(400).json({ ok: false, error: 'No se puede eliminar el canal general' });
    }

    doc.archived = true;
    doc.updatedAt = new Date().toISOString();

    const putRes = await couchReq(req, `/${CHAT_DB}/channel:${channelId}`, {
      method: 'PUT',
      body: JSON.stringify(doc),
    });

    if (!putRes.ok) {
      return res.status(500).json({ ok: false, error: 'Error al archivar canal' });
    }

    broadcastToBusiness(businessId, 'chat_channel_deleted', { channelId });

    return res.json({ ok: true });
  } catch (error) {
    logger.error({ tag: 'CHAT', msg: 'DELETE channel error', error: error.message });
    return res.status(500).json({ ok: false, error: 'Error al eliminar canal' });
  }
});

// ─── Ensure default "general" channel exists ────────────────────────────────

chatRouter.post('/channels/:businessId/ensure-general', async (req, res) => {
  try {
    const { businessId } = req.params;

    await ensureChatDb(req);

    const existing = await chatFind(
      req,
      {
        type: 'chat_channel',
        businessId,
        channelType: 'general',
      },
      { limit: 1 },
    );
    if (existing.length > 0) {
      return res.json({ ok: true, channel: existing[0] });
    }

    const channelId = uuidv4();
    const now = new Date().toISOString();
    const doc = {
      _id: `channel:${channelId}`,
      type: 'chat_channel',
      channelId,
      businessId,
      name: 'general',
      description: 'Canal general del equipo',
      channelType: 'general',
      members: [],
      createdBy: 'system',
      createdAt: now,
      updatedAt: now,
      archived: false,
      lastMessage: null,
      lastMessageAt: null,
    };

    await couchReq(req, `/${CHAT_DB}/${doc._id}`, {
      method: 'PUT',
      body: JSON.stringify(doc),
    });

    return res.json({ ok: true, channel: doc });
  } catch (error) {
    logger.error({ tag: 'CHAT', msg: 'ensure-general error', error: error.message });
    return res.status(500).json({ ok: false, error: 'Error al crear canal general' });
  }
});

// ─── Messages ───────────────────────────────────────────────────────────────

/**
 * GET /api/chat/messages/:businessId/:channelId
 * Returns the last N messages for a channel.
 * Query: ?limit=50&before=<ISO timestamp>
 */
chatRouter.get('/messages/:businessId/:channelId', async (req, res) => {
  try {
    const { businessId, channelId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const before = req.query.before || null;

    await ensureChatDb(req);

    const docs = await chatFind(
      req,
      {
        type: 'chat_message',
        businessId,
        channelId,
        deleted: { $ne: true },
        ...(before ? { createdAt: { $lt: before } } : {}),
      },
      { sort: [{ createdAt: 'desc' }], limit },
    );

    const messages = [...docs].sort((a, b) =>
      String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
    );

    return res.json({ ok: true, messages });
  } catch (error) {
    logger.error({ tag: 'CHAT', msg: 'GET messages error', error: error.message });
    return res.status(500).json({ ok: false, error: 'Error al cargar mensajes' });
  }
});

/**
 * Legacy GET for backwards compat: /api/chat/messages/:businessId
 * Uses businessId as implicit channelId for legacy code.
 */
chatRouter.get('/messages/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const before = req.query.before || null;

    await ensureChatDb(req);

    const body = {
      selector: {
        type: 'chat_message',
        businessId,
        ...(before ? { createdAt: { $lt: before } } : {}),
      },
      sort: [{ createdAt: 'desc' }],
      limit,
    };

    const cRes = await couchReq(req, `/${CHAT_DB}/_find`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!cRes.ok) {
      if (cRes.status === 404) return res.json({ ok: true, messages: [] });
      return res.json({ ok: true, messages: [] });
    }

    const data = await cRes.json();
    const messages = (data.docs || []).reverse();

    return res.json({ ok: true, messages });
  } catch (error) {
    logger.error({ tag: 'CHAT', msg: 'GET messages error', error: error.message });
    return res.status(500).json({ ok: false, error: 'Error al cargar mensajes' });
  }
});

/**
 * POST /api/chat/messages/:businessId/:channelId
 * Send a new message. Body: { text, userId, userName, userAvatar?, replyTo? }
 */
chatRouter.post('/messages/:businessId/:channelId', async (req, res) => {
  try {
    const { businessId, channelId } = req.params;
    const { text, userId, userName, userAvatar, replyTo } = req.body;

    if (!text?.trim()) {
      return res.status(400).json({ ok: false, error: 'El mensaje no puede estar vacío' });
    }
    if (!userId || !userName) {
      return res.status(400).json({ ok: false, error: 'Faltan datos del usuario' });
    }

    await ensureChatDb(req);

    const messageId = uuidv4();
    const now = new Date().toISOString();

    const doc = {
      _id: `msg:${messageId}`,
      type: 'chat_message',
      messageId,
      channelId,
      businessId,
      userId,
      userName,
      userAvatar: userAvatar || '',
      text: text.trim(),
      replyTo: replyTo || null,
      reactions: {},
      edited: false,
      editedAt: null,
      deleted: false,
      createdAt: now,
    };

    const cRes = await couchReq(req, `/${CHAT_DB}/${doc._id}`, {
      method: 'PUT',
      body: JSON.stringify(doc),
    });

    if (!cRes.ok) {
      const errBody = await cRes.text();
      logger.error({ tag: 'CHAT', msg: 'PUT message error', status: cRes.status, body: errBody });
      return res.status(500).json({ ok: false, error: 'Error al guardar el mensaje' });
    }

    updateChannelLastMessage(req, channelId, text.trim(), userName, now).catch(() => {});

    broadcastToBusiness(businessId, 'chat_message', doc);

    // Campana + popup arriba + push al teléfono (no bloquea la respuesta)
    couchReq(req, `/${CHAT_DB}/channel:${channelId}`)
      .then(async (chRes) => {
        const channel = chRes.ok ? await chRes.json() : { channelId, channelType: 'group', members: [] };
        return notifyChatMessageRecipients(req, { businessId, channel, message: doc });
      })
      .catch((err) => {
        logger.warn({ tag: 'CHAT', msg: 'notify recipients failed', error: err?.message });
      });

    return res.json({ ok: true, message: doc });
  } catch (error) {
    logger.error({ tag: 'CHAT', msg: 'POST message error', error: error.message });
    return res.status(500).json({ ok: false, error: 'Error al enviar mensaje' });
  }
});

/**
 * Legacy POST for backwards compat
 */
chatRouter.post('/messages/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { text, userId, userName, userAvatar, replyTo } = req.body;

    if (!text?.trim()) {
      return res.status(400).json({ ok: false, error: 'El mensaje no puede estar vacío' });
    }
    if (!userId || !userName) {
      return res.status(400).json({ ok: false, error: 'Faltan datos del usuario' });
    }

    await ensureChatDb(req);

    const messageId = uuidv4();
    const now = new Date().toISOString();

    const doc = {
      _id: `msg:${messageId}`,
      type: 'chat_message',
      messageId,
      businessId,
      userId,
      userName,
      userAvatar: userAvatar || '',
      text: text.trim(),
      replyTo: replyTo || null,
      reactions: {},
      edited: false,
      editedAt: null,
      deleted: false,
      createdAt: now,
    };

    const cRes = await couchReq(req, `/${CHAT_DB}/${doc._id}`, {
      method: 'PUT',
      body: JSON.stringify(doc),
    });

    if (!cRes.ok) {
      const errBody = await cRes.text();
      logger.error({ tag: 'CHAT', msg: 'PUT message error', status: cRes.status, body: errBody });
      return res.status(500).json({ ok: false, error: 'Error al guardar el mensaje' });
    }

    broadcastToBusiness(businessId, 'chat_message', doc);

    return res.json({ ok: true, message: doc });
  } catch (error) {
    logger.error({ tag: 'CHAT', msg: 'POST message error', error: error.message });
    return res.status(500).json({ ok: false, error: 'Error al enviar mensaje' });
  }
});

/**
 * PUT /api/chat/messages/:businessId/:messageId/edit
 * Edit a message text. Body: { text, userId }
 */
chatRouter.put('/messages/:businessId/:messageId/edit', async (req, res) => {
  try {
    const { businessId, messageId } = req.params;
    const { text, userId } = req.body;

    if (!text?.trim()) {
      return res.status(400).json({ ok: false, error: 'El mensaje no puede estar vacío' });
    }

    const getRes = await couchReq(req, `/${CHAT_DB}/msg:${messageId}`);
    if (!getRes.ok) {
      return res.status(404).json({ ok: false, error: 'Mensaje no encontrado' });
    }

    const doc = await getRes.json();

    if (doc.userId !== userId) {
      return res.status(403).json({ ok: false, error: 'Solo puedes editar tus propios mensajes' });
    }

    doc.text = text.trim();
    doc.edited = true;
    doc.editedAt = new Date().toISOString();

    const putRes = await couchReq(req, `/${CHAT_DB}/msg:${messageId}`, {
      method: 'PUT',
      body: JSON.stringify(doc),
    });

    if (!putRes.ok) {
      return res.status(500).json({ ok: false, error: 'Error al editar mensaje' });
    }

    broadcastToBusiness(businessId, 'chat_message_edited', {
      messageId,
      channelId: doc.channelId,
      text: doc.text,
      edited: true,
      editedAt: doc.editedAt,
    });

    return res.json({ ok: true, message: doc });
  } catch (error) {
    logger.error({ tag: 'CHAT', msg: 'PUT edit error', error: error.message });
    return res.status(500).json({ ok: false, error: 'Error al editar mensaje' });
  }
});

/**
 * DELETE /api/chat/messages/:businessId/:messageId
 * Soft-delete a message. Body/query: userId
 */
chatRouter.delete('/messages/:businessId/:messageId', async (req, res) => {
  try {
    const { businessId, messageId } = req.params;
    const userId = req.body?.userId || req.query.userId;

    const getRes = await couchReq(req, `/${CHAT_DB}/msg:${messageId}`);
    if (!getRes.ok) {
      return res.status(404).json({ ok: false, error: 'Mensaje no encontrado' });
    }

    const doc = await getRes.json();

    if (doc.userId !== userId) {
      return res.status(403).json({ ok: false, error: 'Solo puedes eliminar tus propios mensajes' });
    }

    doc.deleted = true;
    doc.text = '';
    doc.deletedAt = new Date().toISOString();

    const putRes = await couchReq(req, `/${CHAT_DB}/msg:${messageId}`, {
      method: 'PUT',
      body: JSON.stringify(doc),
    });

    if (!putRes.ok) {
      return res.status(500).json({ ok: false, error: 'Error al eliminar mensaje' });
    }

    broadcastToBusiness(businessId, 'chat_message_deleted', {
      messageId,
      channelId: doc.channelId,
    });

    return res.json({ ok: true });
  } catch (error) {
    logger.error({ tag: 'CHAT', msg: 'DELETE message error', error: error.message });
    return res.status(500).json({ ok: false, error: 'Error al eliminar mensaje' });
  }
});

/**
 * POST /api/chat/messages/:businessId/:messageId/react
 * Toggle a reaction. Body: { emoji, userId }
 */
chatRouter.post('/messages/:businessId/:messageId/react', async (req, res) => {
  try {
    const { businessId, messageId } = req.params;
    const { emoji, userId } = req.body;

    if (!emoji || !userId) {
      return res.status(400).json({ ok: false, error: 'Faltan datos' });
    }

    const getRes = await couchReq(req, `/${CHAT_DB}/msg:${messageId}`);
    if (!getRes.ok) {
      return res.status(404).json({ ok: false, error: 'Mensaje no encontrado' });
    }

    const doc = await getRes.json();
    if (!doc.reactions) doc.reactions = {};
    if (!doc.reactions[emoji]) doc.reactions[emoji] = [];

    const idx = doc.reactions[emoji].indexOf(userId);
    if (idx >= 0) {
      doc.reactions[emoji].splice(idx, 1);
      if (doc.reactions[emoji].length === 0) delete doc.reactions[emoji];
    } else {
      doc.reactions[emoji].push(userId);
    }

    const putRes = await couchReq(req, `/${CHAT_DB}/msg:${messageId}`, {
      method: 'PUT',
      body: JSON.stringify(doc),
    });

    if (!putRes.ok) {
      return res.status(500).json({ ok: false, error: 'Error al guardar reacción' });
    }

    broadcastToBusiness(businessId, 'chat_reaction', {
      messageId,
      channelId: doc.channelId,
      reactions: doc.reactions,
    });

    return res.json({ ok: true, reactions: doc.reactions });
  } catch (error) {
    logger.error({ tag: 'CHAT', msg: 'React error', error: error.message });
    return res.status(500).json({ ok: false, error: 'Error al reaccionar' });
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function updateChannelLastMessage(req, channelId, text, userName, timestamp) {
  try {
    const getRes = await couchReq(req, `/${CHAT_DB}/channel:${channelId}`);
    if (!getRes.ok) return;

    const doc = await getRes.json();
    doc.lastMessage = { text: text.slice(0, 100), userName };
    doc.lastMessageAt = timestamp;
    doc.updatedAt = timestamp;

    await couchReq(req, `/${CHAT_DB}/channel:${channelId}`, {
      method: 'PUT',
      body: JSON.stringify(doc),
    });
  } catch {
    // non-critical
  }
}

export { chatRouter };
