import { Router } from 'express';
import { syncAll, syncConversations, syncTerminals, DB_CONVERSATIONS, DB_TERMINALS } from '../services/cursorSync.js';
import { couchRequest } from '../services/couchdb.js';

export const cursorRouter = Router();

cursorRouter.get('/conversations', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = Number(req.query.skip) || 0;

    const response = await couchRequest(req, `/${DB_CONVERSATIONS}/_all_docs?include_docs=true&limit=${limit}&skip=${skip}&descending=true`);
    const data = await response.json();

    const conversations = (data.rows || [])
      .filter(r => r.doc && r.doc.type === 'conversation')
      .map(r => ({
        _id: r.doc._id,
        uuid: r.doc.uuid,
        title: r.doc.title,
        message_count: r.doc.message_count,
        subagent_count: r.doc.subagents?.length || 0,
        created_at: r.doc.created_at,
        updated_at: r.doc.updated_at,
        synced_at: r.doc.synced_at,
      }));

    res.json({
      total: data.total_rows || 0,
      offset: data.offset || skip,
      conversations,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

cursorRouter.get('/conversations/:uuid', async (req, res) => {
  try {
    const uuid = req.params.uuid;
    const response = await couchRequest(req, `/${DB_CONVERSATIONS}/${encodeURIComponent(uuid)}`);

    if (response.status === 404) return res.status(404).json({ error: 'Conversación no encontrada' });
    const doc = await response.json();
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

cursorRouter.get('/terminals', async (req, res) => {
  try {
    const response = await couchRequest(req, `/${DB_TERMINALS}/_all_docs?include_docs=true`);
    const data = await response.json();

    const terminals = (data.rows || [])
      .filter(r => r.doc && r.doc.type === 'terminal')
      .map(r => ({
        _id: r.doc._id,
        terminal_id: r.doc.terminal_id,
        pid: r.doc.pid,
        cwd: r.doc.cwd,
        active_command: r.doc.active_command,
        last_command: r.doc.last_command,
        last_exit_code: r.doc.last_exit_code,
        output_lines: r.doc.output_lines,
        updated_at: r.doc.updated_at,
        synced_at: r.doc.synced_at,
      }));

    res.json({ total: terminals.length, terminals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

cursorRouter.get('/terminals/:id', async (req, res) => {
  try {
    const id = `terminal_${req.params.id}`;
    const response = await couchRequest(req, `/${DB_TERMINALS}/${encodeURIComponent(id)}`);

    if (response.status === 404) return res.status(404).json({ error: 'Terminal no encontrado' });
    const doc = await response.json();
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

cursorRouter.post('/sync', async (_req, res) => {
  try {
    const results = await syncAll();
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

cursorRouter.post('/sync/conversations', async (_req, res) => {
  try {
    const result = await syncConversations();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

cursorRouter.post('/sync/terminals', async (_req, res) => {
  try {
    const result = await syncTerminals();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

cursorRouter.get('/stats', async (req, res) => {
  try {
    const [convRes, termRes] = await Promise.all([
      couchRequest(req, `/${DB_CONVERSATIONS}`),
      couchRequest(req, `/${DB_TERMINALS}`),
    ]);

    const [convData, termData] = await Promise.all([
      convRes.json().catch(() => ({})),
      termRes.json().catch(() => ({})),
    ]);

    res.json({
      conversations: {
        doc_count: convData.doc_count || 0,
        disk_size: convData.sizes?.file || convData.disk_size || 0,
      },
      terminals: {
        doc_count: termData.doc_count || 0,
        disk_size: termData.sizes?.file || termData.disk_size || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
