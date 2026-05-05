import { Router } from 'express';
import { spawn, exec, execSync } from 'node:child_process';
import { createReadStream, existsSync, statSync, unlinkSync, readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import OpenAI from 'openai';
import {
  getAllTickets,
  getTicket,
  createTicket,
  updateTicket,
  deleteTicket,
  moveTicket,
  reorderTickets,
  addComment,
  deleteComment,
  addTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  getAllMembers,
  createMember,
  updateMember,
  deleteMember,
  addAttachment,
  deleteAttachment,
  getTeamStats,
  getAllViews,
  createView,
  updateView,
  deleteView,
  getActiveAiSearchSession,
  getAiSearchSession,
  createAiSearchSession,
  updateAiSearchSession,
  getAiSearchTickets,
  createAiSearchTicket,
  updateAiSearchTicket,
  deleteAiSearchTicket,
} from './kanbanManager.js';
import {
  createAgent,
  getAgent,
  getAllAgents,
  updateAgent,
  deleteAgent,
  sendCommand,
  sendRawInput,
  sendSignal,
  resizePty,
  getOutputBuffer,
  addDataListener,
  removeDataListener,
  restartAgent,
  getCursorCliStatus,
  installCursorCli,
  getQueue,
  addToQueue,
  removeFromQueue,
  clearQueue,
  peekNextInQueue,
  markQueueItem,
  reorderQueue,
  getChatMessages,
  sendChatMessage,
  sendCursorMessage,
  clearChatMessages,
  addChatListener,
  removeChatListener,
  getVersions,
  rewindToVersion,
  deleteVersion,
  getAgentCategories,
  addAgentCategory,
  updateAgentCategory,
  deleteAgentCategory,
  reorderAgents,
  getArchivedAgents,
  restoreAgent,
  permanentDeleteArchived,
  flushPendingSave,
  resetOpenAI,
  stopAgentChat,
  getAgentRunStatus,
} from './agentManager.js';

const pluginRouter = Router();
const queueWatchers = new Map();
const processingAgents = new Set();

// ── Agents CRUD ──

pluginRouter.get('/agents', (_req, res) => {
  res.json({ agents: getAllAgents(), categories: getAgentCategories() });
});

pluginRouter.post('/agents', (req, res) => {
  const { name, cwd, type, model, prompt } = req.body || {};
  const agent = createAgent({ name, cwd, type, model, prompt });
  res.status(201).json(agent);
});

// ── Agent reorder & categories (static routes before :id) ──

pluginRouter.patch('/agents/reorder', (req, res) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds array required' });
  reorderAgents(orderedIds);
  res.json({ ok: true, agents: getAllAgents() });
});

pluginRouter.get('/agents/categories', (_req, res) => {
  res.json(getAgentCategories());
});

pluginRouter.post('/agents/categories', (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
  const cat = addAgentCategory(name);
  if (!cat) return res.status(409).json({ error: 'Category already exists' });
  res.status(201).json(cat);
});

pluginRouter.patch('/agents/categories/:catId', (req, res) => {
  const { name } = req.body || {};
  const cat = updateAgentCategory(req.params.catId, name);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  res.json(cat);
});

pluginRouter.delete('/agents/categories/:catId', (req, res) => {
  const ok = deleteAgentCategory(req.params.catId);
  if (!ok) return res.status(400).json({ error: 'Cannot delete category' });
  res.json({ ok: true });
});

pluginRouter.get('/agents/:id', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

pluginRouter.patch('/agents/:id', (req, res) => {
  const agent = updateAgent(req.params.id, req.body || {});
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

pluginRouter.delete('/agents/:id', (req, res) => {
  const agentId = req.params.id;
  processingAgents.delete(agentId);

  const watchers = queueWatchers.get(agentId);
  if (watchers) {
    for (const w of watchers) {
      try { w.write(`data: ${JSON.stringify({ type: 'agent_deleted' })}\n\n`); w.end(); } catch { /* gone */ }
    }
    queueWatchers.delete(agentId);
  }

  const ok = deleteAgent(agentId);
  if (!ok) return res.status(404).json({ error: 'Agent not found' });
  res.json({ ok: true });
});

// ── Archived agents (soft-delete recovery) ──

pluginRouter.get('/agents-archived', (_req, res) => {
  res.json(getArchivedAgents());
});

pluginRouter.post('/agents-archived/:id/restore', (req, res) => {
  const agent = restoreAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Archived agent not found' });
  res.json(agent);
});

pluginRouter.delete('/agents-archived/:id', (req, res) => {
  const deleted = permanentDeleteArchived(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Archived agent not found' });
  res.json({ ok: true });
});

// ── Terminal: send command ──

pluginRouter.post('/agents/:id/exec', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const { command } = req.body || {};
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'command is required' });
  }
  const ok = sendCommand(req.params.id, command);
  if (!ok) return res.status(500).json({ error: 'Terminal not available' });
  res.json({ ok: true });
});

// ── Terminal: send raw input (for interactive programs) ──

pluginRouter.post('/agents/:id/input', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const { data } = req.body || {};
  if (typeof data !== 'string') {
    return res.status(400).json({ error: 'data is required' });
  }
  sendRawInput(req.params.id, data);
  res.json({ ok: true });
});

// ── Terminal: signal (Ctrl+C, Ctrl+Z, etc.) ──

pluginRouter.post('/agents/:id/signal', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const { signal } = req.body || {};
  if (!signal) return res.status(400).json({ error: 'signal is required' });
  sendSignal(req.params.id, signal);
  res.json({ ok: true });
});

// ── Terminal: resize ──

pluginRouter.post('/agents/:id/resize', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const { cols, rows } = req.body || {};
  resizePty(req.params.id, cols || 120, rows || 30);
  res.json({ ok: true });
});

// ── Terminal: restart ──

pluginRouter.post('/agents/:id/restart', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  restartAgent(req.params.id);
  res.json({ ok: true });
});

// ── Cursor CLI status & install ──

pluginRouter.get('/cursor/status', (_req, res) => {
  res.json(getCursorCliStatus());
});

pluginRouter.post('/cursor/install', async (_req, res) => {
  const result = await installCursorCli();
  res.json(result);
});

// ── Terminal: SSE output stream ──

pluginRouter.get('/agents/:id/terminal', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send buffered output first
  const buffer = getOutputBuffer(req.params.id);
  if (buffer.length > 0) {
    res.write(`data: ${JSON.stringify({ type: 'buffer', content: buffer.join('') })}\n\n`);
  }

  const onData = (data) => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'output', content: data })}\n\n`);
    } catch { /* client gone */ }
  };

  addDataListener(req.params.id, onData);

  req.on('close', () => {
    removeDataListener(req.params.id, onData);
  });
});

// ── Queue ──

pluginRouter.get('/agents/:id/queue', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(getQueue(req.params.id));
});

pluginRouter.post('/agents/:id/queue', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const { message, priority } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }
  const item = addToQueue(req.params.id, message, priority);
  res.status(201).json(item);
  tryProcessQueue(req.params.id);
});

pluginRouter.delete('/agents/:id/queue/:itemId', (req, res) => {
  const ok = removeFromQueue(req.params.id, req.params.itemId);
  if (!ok) return res.status(404).json({ error: 'Queue item not found or already processing' });
  res.json({ ok: true });
});

pluginRouter.delete('/agents/:id/queue', (req, res) => {
  const ok = clearQueue(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Agent not found' });
  res.json({ ok: true });
});

pluginRouter.patch('/agents/:id/queue/:itemId/reorder', (req, res) => {
  const { direction } = req.body || {};
  if (direction !== 'up' && direction !== 'down') {
    return res.status(400).json({ error: 'direction must be up or down' });
  }
  const ok = reorderQueue(req.params.id, req.params.itemId, direction);
  if (!ok) return res.status(400).json({ error: 'Cannot reorder' });
  res.json({ ok: true, queue: getQueue(req.params.id) });
});

pluginRouter.get('/agents/:id/queue/watch', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const agentId = req.params.id;
  if (!queueWatchers.has(agentId)) queueWatchers.set(agentId, new Set());
  queueWatchers.get(agentId).add(res);

  res.write(`data: ${JSON.stringify({ type: 'init', queue: getQueue(agentId) })}\n\n`);

  req.on('close', () => {
    const set = queueWatchers.get(agentId);
    if (set) { set.delete(res); if (set.size === 0) queueWatchers.delete(agentId); }
  });
});

function notifyQueueWatchers(agentId, event) {
  const watchers = queueWatchers.get(agentId);
  if (!watchers || watchers.size === 0) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const r of watchers) {
    try { r.write(data); } catch { /* client gone */ }
  }
}

// ── Queue auto-processing ──

function waitForCommandDone(agentId) {
  return new Promise((resolve) => {
    let idleTimer = null;
    const onData = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        removeDataListener(agentId, onData);
        resolve();
      }, 1500);
    };
    addDataListener(agentId, onData);
    idleTimer = setTimeout(() => {
      removeDataListener(agentId, onData);
      resolve();
    }, 1500);
  });
}

async function tryProcessQueue(agentId) {
  if (processingAgents.has(agentId)) return;
  const agent = getAgent(agentId);
  if (!agent) return;

  const next = peekNextInQueue(agentId);
  if (!next) return;

  processingAgents.add(agentId);
  markQueueItem(agentId, next.id, 'processing');
  notifyQueueWatchers(agentId, { type: 'processing', item: next, queue: getQueue(agentId) });

  try {
    sendCommand(agentId, next.message);
    await waitForCommandDone(agentId);

    if (!getAgent(agentId)) return;

    markQueueItem(agentId, next.id, 'done');
    notifyQueueWatchers(agentId, { type: 'done', itemId: next.id, queue: getQueue(agentId) });
  } catch (err) {
    if (!getAgent(agentId)) return;
    markQueueItem(agentId, next.id, 'error');
    notifyQueueWatchers(agentId, { type: 'error', itemId: next.id, error: err.message, queue: getQueue(agentId) });
  } finally {
    processingAgents.delete(agentId);
    if (getAgent(agentId)) {
      const nextPending = peekNextInQueue(agentId);
      if (nextPending) {
        setTimeout(() => tryProcessQueue(agentId), 500);
      }
    }
  }
}

// ── Chat / Conversation ──

pluginRouter.get('/agents/:id/messages', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(getChatMessages(req.params.id));
});

pluginRouter.post('/agents/:id/chat', async (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const { message, files } = req.body || {};
  if ((!message || typeof message !== 'string') && (!files || !files.length)) {
    return res.status(400).json({ error: 'message is required' });
  }

  const displayMessage = message || '';
  let contextMessage = displayMessage;

  const resolvedFiles = [];
  if (Array.isArray(files) && files.length > 0) {
    const fileContents = [];
    for (const filePath of files) {
      const abs = path.resolve(PROJECT_ROOT, filePath);
      if (!abs.startsWith(PROJECT_ROOT) || !existsSync(abs)) {
        fileContents.push(`[${filePath}]: (archivo no encontrado)`);
        resolvedFiles.push(filePath);
        continue;
      }
      const stat = statSync(abs);
      if (stat.size > 100_000) {
        fileContents.push(`[${filePath}]: (archivo demasiado grande, ${Math.round(stat.size / 1024)}KB)`);
        resolvedFiles.push(filePath);
        continue;
      }
      try {
        const content = readFileSync(abs, 'utf-8');
        fileContents.push(`[${filePath}]:\n\`\`\`\n${content}\n\`\`\``);
        resolvedFiles.push(filePath);
      } catch {
        fileContents.push(`[${filePath}]: (error al leer)`);
        resolvedFiles.push(filePath);
      }
    }
    contextMessage = `Archivos adjuntos:\n\n${fileContents.join('\n\n')}\n\n${displayMessage}`;
  }

  try {
    const handler = agent.type === 'cursor' ? sendCursorMessage : sendChatMessage;
    const assistantMsg = await handler(req.params.id, contextMessage, displayMessage, resolvedFiles);
    res.json(assistantMsg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.delete('/agents/:id/messages', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  clearChatMessages(req.params.id);
  res.json({ ok: true });
});

pluginRouter.post('/agents/:id/chat/stop', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const stopped = stopAgentChat(req.params.id);
  res.json({ ok: true, stopped });
});

pluginRouter.get('/agents/:id/chat/status', (req, res) => {
  const status = getAgentRunStatus(req.params.id);
  if (!status) return res.status(404).json({ error: 'Agent not found' });
  res.json(status);
});

pluginRouter.get('/agents/:id/chat/stream', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const runStatus = getAgentRunStatus(req.params.id);
  const msgs = getChatMessages(req.params.id);
  res.write(`data: ${JSON.stringify({ type: 'init', messages: msgs, agentStatus: runStatus })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      const st = getAgentRunStatus(req.params.id);
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', ts: Date.now(), agentStatus: st })}\n\n`);
    } catch { clearInterval(heartbeat); }
  }, 15000);

  const onEvent = (event) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch { /* client gone */ }
  };

  addChatListener(req.params.id, onEvent);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeChatListener(req.params.id, onEvent);
  });
});

// ── Versions (auto-created per message, rewindable) ──

pluginRouter.get('/agents/:id/versions', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(getVersions(req.params.id));
});

pluginRouter.post('/agents/:id/versions/:versionId/rewind', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  try {
    const result = rewindToVersion(req.params.id, req.params.versionId);
    res.json(result);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
});

pluginRouter.delete('/agents/:id/versions/:versionId', (req, res) => {
  const ok = deleteVersion(req.params.id, req.params.versionId);
  if (!ok) return res.status(404).json({ error: 'Version not found' });
  res.json({ ok: true });
});

// ── File browser / search ──

const PROJECT_ROOT = path.resolve(process.cwd());

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', '.cache', 'coverage', 'android', 'ios',
  '.next', '.nuxt', '.output', '.vite', 'build', '.DS_Store',
]);
const IGNORE_PREFIXES = ['src copy', 'src-delivery'];
const MAX_FILES = 80;

function walkDir(dir, base, results, query, depth = 0) {
  if (depth > 8 || results.length >= MAX_FILES) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (results.length >= MAX_FILES) break;
    if (IGNORE_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith('.') && entry.isDirectory()) continue;
    if (IGNORE_PREFIXES.some((p) => entry.name.startsWith(p))) continue;
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) {
      walkDir(path.join(dir, entry.name), rel, results, query, depth + 1);
    } else {
      if (!query || rel.toLowerCase().includes(query)) {
        results.push(rel);
      }
    }
  }
}

pluginRouter.get('/files', (req, res) => {
  const q = (req.query.q || '').toString().toLowerCase().trim();
  const results = [];
  walkDir(PROJECT_ROOT, '', results, q || null);
  results.sort((a, b) => {
    if (q) {
      const aName = a.split('/').pop().toLowerCase();
      const bName = b.split('/').pop().toLowerCase();
      const aExact = aName.includes(q);
      const bExact = bName.includes(q);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
    }
    return a.localeCompare(b);
  });
  res.json(results);
});

pluginRouter.get('/files/read', (req, res) => {
  const filePath = (req.query.path || '').toString();
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  const abs = path.resolve(PROJECT_ROOT, filePath);
  if (!abs.startsWith(PROJECT_ROOT)) return res.status(403).json({ error: 'Forbidden' });
  if (!existsSync(abs)) return res.status(404).json({ error: 'File not found' });
  const stat = statSync(abs);
  if (stat.size > 100_000) {
    return res.json({ path: filePath, content: '(archivo demasiado grande, >100KB)', truncated: true });
  }
  try {
    const content = readFileSync(abs, 'utf-8');
    res.json({ path: filePath, content, lines: content.split('\n').length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Git Blame ──

function extractGithubUsername(email) {
  if (!email) return null;
  const noreply = email.match(/^(\d+\+)?([^@]+)@users\.noreply\.github\.com$/);
  if (noreply) return noreply[2];
  return null;
}

pluginRouter.post('/git/blame', (req, res) => {
  const { file, line } = req.body || {};
  if (!file || !line) return res.status(400).json({ error: 'file and line are required' });

  const abs = path.resolve(PROJECT_ROOT, file);
  if (!abs.startsWith(PROJECT_ROOT) || !existsSync(abs)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const rel = path.relative(PROJECT_ROOT, abs);

  try {
    const raw = execSync(
      `git blame -L ${Number(line)},${Number(line)} --porcelain -- "${rel}"`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 5000 },
    );

    const lines = raw.split('\n');
    const data = {};
    for (const l of lines) {
      if (l.startsWith('author ')) data.author = l.slice(7);
      else if (l.startsWith('author-mail ')) data.email = l.slice(12).replace(/[<>]/g, '');
      else if (l.startsWith('author-time ')) data.timestamp = Number(l.slice(12));
      else if (l.startsWith('summary ')) data.summary = l.slice(8);
    }
    const commitHash = lines[0]?.split(' ')[0] || null;

    const ghUser = extractGithubUsername(data.email);
    const avatarUrl = ghUser
      ? `https://github.com/${ghUser}.png?size=80`
      : data.email
        ? `https://www.gravatar.com/avatar/${createHash('md5').update(data.email.trim().toLowerCase()).digest('hex')}?d=identicon&s=80`
        : null;

    res.json({
      author: data.author || 'Unknown',
      email: data.email || null,
      date: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : null,
      commitHash,
      summary: data.summary || null,
      githubUser: ghUser,
      avatarUrl,
    });
  } catch (err) {
    const msg = err.stderr?.toString() || err.message || 'git blame failed';
    if (msg.includes('not a git repository')) {
      return res.status(400).json({ error: 'Not a git repository' });
    }
    res.status(500).json({ error: msg.slice(0, 200) });
  }
});

// ── Quick Actions: Backup, Build, Restart ──

pluginRouter.post('/actions/backup', (_req, res) => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const filename = `download-${dd}${mm}-${hh}${min}.zip`;
  const zipPath = path.join('/tmp', filename);

  if (existsSync(zipPath)) {
    try { unlinkSync(zipPath); } catch { /* ok */ }
  }

  const excludes = [
    'node_modules/*', '.git/*', 'dist/*', '*.zip',
    '.cache/*', 'coverage/*', '.DS_Store',
    'src copy*', 'src-delivery/*', 'android/*', 'ios/*',
  ];
  const zipProc = spawn('zip', [
    '-r', '-q', zipPath, '.',
    '-x', ...excludes,
  ], { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

  let stderr = '';
  zipProc.stderr.on('data', (d) => { stderr += d.toString(); });

  zipProc.on('close', (code) => {
    if (code !== 0 || !existsSync(zipPath)) {
      return res.status(500).json({ error: `zip failed (code ${code}): ${stderr.slice(0, 200)}` });
    }
    const stat = statSync(zipPath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', stat.size);

    const stream = createReadStream(zipPath);
    stream.pipe(res);
    stream.on('end', () => {
      try { unlinkSync(zipPath); } catch { /* ok */ }
    });
  });

  zipProc.on('error', (err) => {
    res.status(500).json({ error: `Could not run zip: ${err.message}` });
  });
});

pluginRouter.get('/actions/build', (_req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (type, content) => {
    res.write(`data: ${JSON.stringify({ type, content })}\n\n`);
  };

  send('info', '▶ Starting build...\n');

  const child = spawn('npm', ['run', 'build'], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  child.stdout.on('data', (d) => send('stdout', d.toString()));
  child.stderr.on('data', (d) => send('stderr', d.toString()));

  child.on('close', (code) => {
    send(code === 0 ? 'success' : 'error', `\n${code === 0 ? '✓ Build completed' : `✗ Build failed (exit code ${code})`}\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });

  child.on('error', (err) => {
    send('error', `Failed to start build: ${err.message}`);
    res.write('data: [DONE]\n\n');
    res.end();
  });

  res.on('close', () => {
    try { child.kill(); } catch { /* ok */ }
  });
});

pluginRouter.post('/actions/restart-backend', (_req, res) => {
  res.json({ ok: true, message: 'Backend will restart in 1 second' });
  setTimeout(() => {
    flushPendingSave();
    process.exit(0);
  }, 1000);
});

pluginRouter.post('/actions/pm2-start', (_req, res) => {
  const cmd = process.platform === 'win32'
    ? 'pm2 delete vertial; pm2 start index.js --name "vertial" --env production -i max'
    : 'pm2 delete vertial 2>/dev/null; pm2 start index.js --name "vertial" --env production -i max';
  exec(cmd, { cwd: process.cwd() }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ ok: false, error: stderr || err.message });
    res.json({ ok: true, output: stdout.trim() });
  });
});

pluginRouter.get('/actions/health', (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    uptime: Math.floor(process.uptime()),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heap: Math.round(mem.heapUsed / 1024 / 1024),
    },
    pid: process.pid,
    node: process.version,
  });
});

// ── Saved Components ──

const COMPONENTS_DIR = path.join(PROJECT_ROOT, 'src', 'app', 'components', 'saved');
const COMPONENTS_META = path.join(COMPONENTS_DIR, '_meta.json');
const VERSIONS_DIR = path.join(COMPONENTS_DIR, '_versions');
const MAX_VERSIONS_PER_COMPONENT = 50;

const contentHashes = new Map();

function ensureComponentsDir() {
  if (!existsSync(COMPONENTS_DIR)) {
    mkdirSync(COMPONENTS_DIR, { recursive: true });
  }
}

function ensureVersionsDir(componentId) {
  const dir = path.join(VERSIONS_DIR, componentId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function loadComponentsMeta() {
  ensureComponentsDir();
  if (!existsSync(COMPONENTS_META)) return { components: [], categories: [] };
  try {
    return JSON.parse(readFileSync(COMPONENTS_META, 'utf-8'));
  } catch {
    return { components: [], categories: [] };
  }
}

function saveComponentsMeta(data) {
  ensureComponentsDir();
  writeFileSync(COMPONENTS_META, JSON.stringify(data, null, 2), 'utf-8');
}

function loadVersionsMeta(componentId) {
  const metaPath = path.join(VERSIONS_DIR, componentId, '_versions.json');
  if (!existsSync(metaPath)) return [];
  try { return JSON.parse(readFileSync(metaPath, 'utf-8')); } catch { return []; }
}

function saveVersionsMeta(componentId, versions) {
  const dir = ensureVersionsDir(componentId);
  writeFileSync(path.join(dir, '_versions.json'), JSON.stringify(versions, null, 2), 'utf-8');
}

function snapshotComponentVersion(componentId, content, source = 'auto') {
  const hash = createHash('md5').update(content).digest('hex');
  const lastHash = contentHashes.get(componentId);
  if (lastHash === hash) return null;

  contentHashes.set(componentId, hash);

  if (!lastHash) return null;

  const dir = ensureVersionsDir(componentId);
  const versions = loadVersionsMeta(componentId);

  const versionId = uuidv4();
  const versionFile = `${versionId}.tsx`;
  writeFileSync(path.join(dir, versionFile), content, 'utf-8');

  const version = {
    id: versionId,
    componentId,
    file: versionFile,
    hash,
    source,
    size: Buffer.byteLength(content, 'utf-8'),
    createdAt: new Date().toISOString(),
  };
  versions.push(version);

  if (versions.length > MAX_VERSIONS_PER_COMPONENT) {
    const toRemove = versions.splice(0, versions.length - MAX_VERSIONS_PER_COMPONENT);
    for (const old of toRemove) {
      const oldPath = path.join(dir, old.file);
      try { if (existsSync(oldPath)) unlinkSync(oldPath); } catch { /* ok */ }
    }
  }

  saveVersionsMeta(componentId, versions);
  return version;
}

function toFileName(name) {
  return name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

function generateComponentContent(name) {
  const compName = toFileName(name) || 'NewComponent';
  return `export default function ${compName}() {
  return (
    <div className="">

    </div>
  );
}
`;
}

pluginRouter.get('/components', (_req, res) => {
  const meta = loadComponentsMeta();
  res.json(meta);
});

pluginRouter.post('/components', (req, res) => {
  const { name, category } = req.body || {};
  const compName = (name || 'NewComponent').trim();
  const fileName = toFileName(compName) + '.tsx';
  const id = uuidv4();

  ensureComponentsDir();
  const filePath = path.join(COMPONENTS_DIR, fileName);
  if (existsSync(filePath)) {
    return res.status(409).json({ error: 'A component with that filename already exists' });
  }

  writeFileSync(filePath, generateComponentContent(compName), 'utf-8');

  const meta = loadComponentsMeta();
  const maxOrder = meta.components.reduce((m, c) => Math.max(m, c.order), -1);
  const comp = {
    id,
    name: compName,
    fileName,
    category: category || 'general',
    order: maxOrder + 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  meta.components.push(comp);

  if (!meta.categories.find((c) => c.id === (category || 'general'))) {
    const catMaxOrder = meta.categories.reduce((m, c) => Math.max(m, c.order), -1);
    meta.categories.push({ id: category || 'general', name: category || 'General', order: catMaxOrder + 1 });
  }

  saveComponentsMeta(meta);
  res.status(201).json(comp);
});

pluginRouter.patch('/components/reorder', (req, res) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds array required' });

  const meta = loadComponentsMeta();
  orderedIds.forEach((id, index) => {
    const comp = meta.components.find((c) => c.id === id);
    if (comp) comp.order = index;
  });
  meta.components.sort((a, b) => a.order - b.order);
  saveComponentsMeta(meta);
  res.json({ ok: true, components: meta.components });
});

// ── Component Categories (static routes before :id) ──

pluginRouter.post('/components/categories', (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });

  const meta = loadComponentsMeta();
  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (meta.categories.find((c) => c.id === id)) {
    return res.status(409).json({ error: 'Category already exists' });
  }

  const maxOrder = meta.categories.reduce((m, c) => Math.max(m, c.order), -1);
  const cat = { id, name: name.trim(), order: maxOrder + 1 };
  meta.categories.push(cat);
  saveComponentsMeta(meta);
  res.status(201).json(cat);
});

pluginRouter.patch('/components/categories/:catId', (req, res) => {
  const meta = loadComponentsMeta();
  const cat = meta.categories.find((c) => c.id === req.params.catId);
  if (!cat) return res.status(404).json({ error: 'Category not found' });

  const { name } = req.body || {};
  if (name) cat.name = name.trim();
  saveComponentsMeta(meta);
  res.json(cat);
});

pluginRouter.delete('/components/categories/:catId', (req, res) => {
  const meta = loadComponentsMeta();
  const catId = req.params.catId;
  if (catId === 'general') return res.status(400).json({ error: 'Cannot delete default category' });

  meta.categories = meta.categories.filter((c) => c.id !== catId);
  meta.components.forEach((c) => {
    if (c.category === catId) c.category = 'general';
  });
  saveComponentsMeta(meta);
  res.json({ ok: true });
});

pluginRouter.patch('/components/:id', (req, res) => {
  const meta = loadComponentsMeta();
  const idx = meta.components.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Component not found' });

  const comp = meta.components[idx];
  const { name, category } = req.body || {};

  if (name && name.trim() !== comp.name) {
    const newFileName = toFileName(name.trim()) + '.tsx';
    const oldPath = path.join(COMPONENTS_DIR, comp.fileName);
    const newPath = path.join(COMPONENTS_DIR, newFileName);

    if (existsSync(newPath) && newFileName !== comp.fileName) {
      return res.status(409).json({ error: 'A component with that filename already exists' });
    }

    if (existsSync(oldPath)) {
      let content = readFileSync(oldPath, 'utf-8');
      const oldFn = toFileName(comp.name);
      const newFn = toFileName(name.trim());
      if (oldFn && newFn) {
        content = content.replace(
          new RegExp(`function ${oldFn}\\b`),
          `function ${newFn}`,
        );
      }
      writeFileSync(newPath, content, 'utf-8');
      if (newFileName !== comp.fileName) {
        try { unlinkSync(oldPath); } catch { /* ok */ }
      }
    }

    comp.name = name.trim();
    comp.fileName = newFileName;
  }

  if (category !== undefined) comp.category = category;
  comp.updatedAt = new Date().toISOString();

  meta.components[idx] = comp;
  saveComponentsMeta(meta);
  res.json(comp);
});

pluginRouter.delete('/components/:id', (req, res) => {
  const meta = loadComponentsMeta();
  const idx = meta.components.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Component not found' });

  const comp = meta.components[idx];
  const filePath = path.join(COMPONENTS_DIR, comp.fileName);
  if (existsSync(filePath)) {
    try { unlinkSync(filePath); } catch { /* ok */ }
  }

  meta.components.splice(idx, 1);
  saveComponentsMeta(meta);
  res.json({ ok: true });
});

pluginRouter.post('/components/:id/duplicate', (req, res) => {
  const meta = loadComponentsMeta();
  const original = meta.components.find((c) => c.id === req.params.id);
  if (!original) return res.status(404).json({ error: 'Component not found' });

  let copyNum = 1;
  let newName = `${original.name} Copy`;
  let newFileName = toFileName(newName) + '.tsx';
  while (existsSync(path.join(COMPONENTS_DIR, newFileName))) {
    copyNum++;
    newName = `${original.name} Copy ${copyNum}`;
    newFileName = toFileName(newName) + '.tsx';
  }

  const srcPath = path.join(COMPONENTS_DIR, original.fileName);
  const destPath = path.join(COMPONENTS_DIR, newFileName);

  if (existsSync(srcPath)) {
    let content = readFileSync(srcPath, 'utf-8');
    const oldFn = toFileName(original.name);
    const newFn = toFileName(newName);
    if (oldFn && newFn) {
      content = content.replace(new RegExp(`function ${oldFn}\\b`), `function ${newFn}`);
    }
    writeFileSync(destPath, content, 'utf-8');
  } else {
    writeFileSync(destPath, generateComponentContent(newName), 'utf-8');
  }

  const maxOrder = meta.components.reduce((m, c) => Math.max(m, c.order), -1);
  const id = uuidv4();
  const comp = {
    id,
    name: newName,
    fileName: newFileName,
    category: original.category,
    order: maxOrder + 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  meta.components.push(comp);
  saveComponentsMeta(meta);
  res.status(201).json(comp);
});

pluginRouter.get('/components/:id/content', (req, res) => {
  const meta = loadComponentsMeta();
  const comp = meta.components.find((c) => c.id === req.params.id);
  if (!comp) return res.status(404).json({ error: 'Component not found' });

  const filePath = path.join(COMPONENTS_DIR, comp.fileName);
  if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  const content = readFileSync(filePath, 'utf-8');
  snapshotComponentVersion(comp.id, content, 'auto');
  res.json({ ...comp, content, path: path.relative(PROJECT_ROOT, filePath) });
});

// ── Component Versions ──

pluginRouter.get('/components/:id/versions', (req, res) => {
  const meta = loadComponentsMeta();
  const comp = meta.components.find((c) => c.id === req.params.id);
  if (!comp) return res.status(404).json({ error: 'Component not found' });

  const versions = loadVersionsMeta(comp.id);
  res.json(versions.slice().reverse());
});

pluginRouter.get('/components/:id/versions/:versionId/content', (req, res) => {
  const meta = loadComponentsMeta();
  const comp = meta.components.find((c) => c.id === req.params.id);
  if (!comp) return res.status(404).json({ error: 'Component not found' });

  const versions = loadVersionsMeta(comp.id);
  const version = versions.find((v) => v.id === req.params.versionId);
  if (!version) return res.status(404).json({ error: 'Version not found' });

  const versionPath = path.join(VERSIONS_DIR, comp.id, version.file);
  if (!existsSync(versionPath)) return res.status(404).json({ error: 'Version file not found' });

  const content = readFileSync(versionPath, 'utf-8');
  res.json({ ...version, content });
});

pluginRouter.post('/components/:id/versions/:versionId/restore', (req, res) => {
  const meta = loadComponentsMeta();
  const comp = meta.components.find((c) => c.id === req.params.id);
  if (!comp) return res.status(404).json({ error: 'Component not found' });

  const versions = loadVersionsMeta(comp.id);
  const version = versions.find((v) => v.id === req.params.versionId);
  if (!version) return res.status(404).json({ error: 'Version not found' });

  const versionPath = path.join(VERSIONS_DIR, comp.id, version.file);
  if (!existsSync(versionPath)) return res.status(404).json({ error: 'Version file not found' });

  const versionContent = readFileSync(versionPath, 'utf-8');

  const compFilePath = path.join(COMPONENTS_DIR, comp.fileName);
  if (existsSync(compFilePath)) {
    const currentContent = readFileSync(compFilePath, 'utf-8');
    snapshotComponentVersion(comp.id, currentContent, 'pre-restore');
  }

  writeFileSync(compFilePath, versionContent, 'utf-8');

  const hash = createHash('md5').update(versionContent).digest('hex');
  contentHashes.set(comp.id, hash);

  comp.updatedAt = new Date().toISOString();
  const idx = meta.components.findIndex((c) => c.id === comp.id);
  if (idx !== -1) meta.components[idx] = comp;
  saveComponentsMeta(meta);

  res.json({ ok: true, restoredVersion: version, component: comp });
});

pluginRouter.delete('/components/:id/versions/:versionId', (req, res) => {
  const meta = loadComponentsMeta();
  const comp = meta.components.find((c) => c.id === req.params.id);
  if (!comp) return res.status(404).json({ error: 'Component not found' });

  const versions = loadVersionsMeta(comp.id);
  const idx = versions.findIndex((v) => v.id === req.params.versionId);
  if (idx === -1) return res.status(404).json({ error: 'Version not found' });

  const version = versions[idx];
  const versionPath = path.join(VERSIONS_DIR, comp.id, version.file);
  try { if (existsSync(versionPath)) unlinkSync(versionPath); } catch { /* ok */ }

  versions.splice(idx, 1);
  saveVersionsMeta(comp.id, versions);
  res.json({ ok: true });
});

pluginRouter.delete('/components/:id/versions', (req, res) => {
  const meta = loadComponentsMeta();
  const comp = meta.components.find((c) => c.id === req.params.id);
  if (!comp) return res.status(404).json({ error: 'Component not found' });

  const dir = path.join(VERSIONS_DIR, comp.id);
  if (existsSync(dir)) {
    const files = readdirSync(dir);
    for (const f of files) {
      try { unlinkSync(path.join(dir, f)); } catch { /* ok */ }
    }
  }
  saveVersionsMeta(comp.id, []);
  res.json({ ok: true });
});

pluginRouter.get('/components/:id/preview', (req, res) => {
  const meta = loadComponentsMeta();
  const comp = meta.components.find((c) => c.id === req.params.id);
  if (!comp) return res.status(404).send('Not found');

  const filePath = path.join(COMPONENTS_DIR, comp.fileName);
  if (!existsSync(filePath)) return res.status(404).send('File not found');

  const code = readFileSync(filePath, 'utf-8');
  const fnName = toFileName(comp.name) || 'Component';

  const jsxCode = code
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export\s+default\s+/m, '')
    .replace(/^export\s+/gm, '');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${comp.name} Preview</title>
<script src="https://cdn.tailwindcss.com"><\/script>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
<style>
  body { margin:0; padding:16px; font-family:system-ui,-apple-system,sans-serif; background:#09090b; color:#fafafa; }
  #error { color:#f87171; font-size:12px; padding:8px; white-space:pre-wrap; display:none; }
</style>
</head>
<body>
<div id="root"></div>
<div id="error"></div>
<script type="text/babel" data-type="module">
try {
  const { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext } = React;
  ${jsxCode}
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(React.createElement(${fnName}));
} catch(e) {
  document.getElementById('error').style.display='block';
  document.getElementById('error').textContent = e.message;
}
<\/script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// ── App Creation ──

const STACK_LABELS = {
  'node-express': 'Node.js con Express',
  'python-fastapi': 'Python con FastAPI',
  'python-flask': 'Python con Flask',
  'go-fiber': 'Go con Fiber',
  'rust-actix': 'Rust con Actix Web',
  'bun-elysia': 'Bun con Elysia',
  'react-vite': 'React con Vite',
  'vue-vite': 'Vue con Vite',
  'svelte-kit': 'SvelteKit',
  'nextjs': 'Next.js',
  'nuxt': 'Nuxt',
  'vanilla': 'Vanilla JS (HTML/CSS/JS)',
};

function getPluginEmbedSnippet(appPort) {
  return `<!-- Plugin Editor Embed -->
<script>
(function(){
  var PLUGIN_ORIGIN = window.location.protocol + '//' + window.location.hostname + ':' + window.location.port;
  var PLUGIN_URL = PLUGIN_ORIGIN + '?pluginCwd=' + encodeURIComponent(window.location.pathname);
  var bubble = document.createElement('div');
  bubble.id = 'plugin-bubble';
  bubble.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  bubble.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#10b981,#06b6d4);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 20px rgba(16,185,129,0.4);transition:transform 0.15s;';
  bubble.onmouseenter = function(){ this.style.transform='scale(1.1)'; };
  bubble.onmouseleave = function(){ this.style.transform='scale(1)'; };
  var panel = document.createElement('div');
  panel.id = 'plugin-panel';
  panel.style.cssText = 'position:fixed;top:0;right:0;z-index:99998;width:440px;height:100%;display:none;box-shadow:-4px 0 24px rgba(0,0,0,0.3);';
  var iframe = document.createElement('iframe');
  iframe.src = PLUGIN_URL;
  iframe.style.cssText = 'width:100%;height:100%;border:none;border-radius:12px 0 0 12px;';
  panel.appendChild(iframe);
  var open = false;
  bubble.onclick = function(){
    open = !open;
    panel.style.display = open ? 'block' : 'none';
    bubble.style.display = open ? 'none' : 'flex';
  };
  document.body.appendChild(bubble);
  document.body.appendChild(panel);
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && open){ open=false; panel.style.display='none'; bubble.style.display='flex'; }
  });
})();
</script>`;
}

const PLUGIN_SOURCE_DIR = path.resolve(process.cwd(), 'src', 'plugin');

function copyPluginToApp(appDir) {
  const destPlugin = path.join(appDir, 'src', 'plugin');
  mkdirSync(destPlugin, { recursive: true });
  cpSync(PLUGIN_SOURCE_DIR, destPlugin, { recursive: true });

  const utilsDir = path.join(appDir, 'src', 'app', 'components', 'ui');
  mkdirSync(utilsDir, { recursive: true });
  const utilsContent = `import { clsx } from "clsx";\nimport { twMerge } from "tailwind-merge";\n\nexport function cn(...inputs) {\n  return twMerge(clsx(inputs));\n}\n`;
  writeFileSync(path.join(utilsDir, 'utils.ts'), utilsContent, 'utf-8');
}

function buildAppPrompt({ name, description, port, backendStack, frontendStack, pluginSnippet }) {
  const backendLabel = STACK_LABELS[backendStack] || backendStack;
  const frontendLabel = STACK_LABELS[frontendStack] || frontendStack;
  const appDir = `/var/www/${name}`;

  return `Crea una aplicación web completa en el directorio ${appDir}.

IMPORTANTE: Ya se ha copiado la carpeta src/plugin/ dentro de ${appDir} con todo el sistema del plugin (agentes IA, kanban, componentes, etc.). NO la borres ni la sobreescribas. Tu trabajo es crear la app e INTEGRAR el plugin que ya está ahí.

## Especificaciones

- **Nombre**: ${name}
- **Descripción**: ${description}
- **Puerto**: ${port}
- **Backend**: ${backendLabel}
- **Frontend**: ${frontendLabel}
- **Base de datos**: CouchDB (usa la instancia local en http://localhost:5984)

## Requisitos

1. Crea la estructura del proyecto en ${appDir} (la carpeta ya existe con src/plugin/ dentro).
2. El backend debe:
   - Arrancar en el puerto ${port} y escuchar en 0.0.0.0 (no solo localhost)
   - Conectarse a CouchDB (http://localhost:5984) para persistencia
   - Crear la base de datos "${name}" en CouchDB si no existe al arrancar
   - Exponer una API REST con endpoints CRUD básicos según la descripción
   - Servir los archivos estáticos del frontend en producción
3. El frontend debe:
   - Tener una UI moderna y limpia con Tailwind CSS
   - Conectarse al backend API
   - Incluir las vistas necesarias según la descripción
4. Incluye un package.json con scripts para:
   - \`dev\`: arrancar en modo desarrollo
   - \`build\`: compilar para producción
   - \`start\`: arrancar en producción
5. Incluye un README.md con instrucciones
6. Instala todas las dependencias necesarias ejecutando el comando de instalación correspondiente

## OBLIGATORIO: Integración del Plugin (ya copiado en src/plugin/)

La carpeta ${appDir}/src/plugin/ ya contiene el sistema completo del plugin con agentes IA, kanban, chat, etc. Debes integrarlo así:

### Backend (Express) — OBLIGATORIO
En tu archivo principal del servidor (index.js o similar), añade:
\`\`\`js
import { pluginRouter } from './src/plugin/server/router.js';
app.use('/api/plugin', pluginRouter);
\`\`\`

### Dependencias extra que debes instalar — OBLIGATORIO
\`\`\`bash
npm install node-pty openai ansi-to-html clsx tailwind-merge lucide-react
\`\`\`
NOTA: node-pty necesita build tools (make, gcc, g++, python3) que ya están instalados en el sistema.

### Frontend (React con Vite) — OBLIGATORIO
En tu componente de layout principal, añade el PluginPanel:
\`\`\`tsx
import { PluginPanel } from './plugin/PluginPanel';

// Dentro del return del layout:
<PluginPanel />
\`\`\`
Esto añade un botón flotante (burbuja verde) que abre el panel del plugin con agentes IA, kanban, gestor de BD, etc.

### Vite proxy (para desarrollo) — OBLIGATORIO
En vite.config.ts/js:
\`\`\`js
server: {
  port: ${port},
  host: '0.0.0.0',
  proxy: {
    '/api': { target: 'http://localhost:${port}', changeOrigin: true },
  },
},
\`\`\`

### Utilidad cn() — YA COPIADA
El archivo src/app/components/ui/utils.ts ya existe con la utilidad cn(). Los componentes del plugin lo importan desde ahí. No lo muevas ni lo borres.

## TAMBIÉN: Plugin Editor Embed (para HTML servido sin React)

Si la app tiene algún HTML estático o template base, incluye este snippet justo antes de \`</body>\`:

\`\`\`html
${pluginSnippet}
\`\`\`

## Pasos

1. El directorio ${appDir} ya existe con src/plugin/ dentro. NO hagas mkdir ni borres nada existente.
2. Inicializa el proyecto creando los archivos que faltan (package.json, index.js, frontend, etc.)
3. Integra el plugin en el backend (pluginRouter) y frontend (PluginPanel)
4. Instala TODAS las dependencias (incluidas las del plugin: node-pty, openai, ansi-to-html, clsx, tailwind-merge, lucide-react)
5. Arranca el servidor de desarrollo en el puerto ${port} escuchando en 0.0.0.0

## CRÍTICO: Puerto ${port}

- El servidor DEBE escuchar en el puerto exacto **${port}** en **0.0.0.0**
- Si usas Vite, configúralo con \`server: { port: ${port}, host: '0.0.0.0' }\` en vite.config
- Si el backend y frontend son separados, haz que el backend sirva el frontend en producción y que en desarrollo se use un solo puerto proxy
- El usuario abrirá http://IP:${port} en el navegador — DEBE funcionar
- NO uses otro puerto diferente a ${port}`;
}

// ── OpenAI API Key management ──

pluginRouter.get('/settings/openai-key', (_req, res) => {
  const key = process.env.OPENAI_API_KEY || '';
  const masked = key ? key.slice(0, 7) + '...' + key.slice(-4) : '';
  res.json({ configured: !!key, masked });
});

pluginRouter.post('/settings/openai-key', (req, res) => {
  const { key } = req.body;
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Missing key' });
  }
  const trimmed = key.trim();
  if (!trimmed.startsWith('sk-')) {
    return res.status(400).json({ error: 'Invalid key format (must start with sk-)' });
  }
  process.env.OPENAI_API_KEY = trimmed;
  _openaiInstance = null;
  resetOpenAI();
  const masked = trimmed.slice(0, 7) + '...' + trimmed.slice(-4);
  res.json({ ok: true, masked });
});

pluginRouter.delete('/settings/openai-key', (_req, res) => {
  delete process.env.OPENAI_API_KEY;
  _openaiInstance = null;
  resetOpenAI();
  res.json({ ok: true });
});

// ── SMTP / Email settings management ──

const SMTP_CONFIG_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', '.smtp-config.json');

function _loadSmtpConfig() {
  try {
    if (existsSync(SMTP_CONFIG_FILE)) {
      return JSON.parse(readFileSync(SMTP_CONFIG_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { host: 'smtp.gmail.com', port: 587, secure: false, user: '', pass: '', from: '' };
}

function _saveSmtpConfig(data) {
  writeFileSync(SMTP_CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function _applySmtpEnv(cfg) {
  if (cfg.host) process.env.SMTP_HOST = cfg.host;
  if (cfg.port) process.env.SMTP_PORT = String(cfg.port);
  process.env.SMTP_SECURE = cfg.secure ? 'true' : 'false';
  if (cfg.user) process.env.SMTP_USER = cfg.user;
  if (cfg.pass) process.env.SMTP_PASS = cfg.pass;
  if (cfg.from) process.env.SMTP_FROM = cfg.from;
}

// Restore SMTP env from persisted file on startup
try { const _sc = _loadSmtpConfig(); if (_sc.user && _sc.pass) _applySmtpEnv(_sc); } catch { /* ignore */ }

pluginRouter.get('/settings/smtp', (_req, res) => {
  const cfg = _loadSmtpConfig();
  res.json({
    configured: !!(cfg.user && cfg.pass),
    host: cfg.host || 'smtp.gmail.com',
    port: cfg.port || 587,
    secure: !!cfg.secure,
    user: cfg.user || '',
    maskedPass: cfg.pass ? '••••••••' : '',
    from: cfg.from || '',
  });
});

pluginRouter.post('/settings/smtp', (req, res) => {
  const { host, port, secure, user, pass, from } = req.body || {};
  const current = _loadSmtpConfig();

  if (host !== undefined) current.host = String(host).trim() || 'smtp.gmail.com';
  if (port !== undefined) current.port = Number(port) || 587;
  if (secure !== undefined) current.secure = !!secure;
  if (user !== undefined) current.user = String(user).trim();
  if (pass !== undefined && String(pass).trim()) current.pass = String(pass).trim();
  if (from !== undefined) current.from = String(from).trim();

  if (!current.from && current.user) {
    current.from = `Vertial <${current.user}>`;
  }

  _saveSmtpConfig(current);
  _applySmtpEnv(current);

  res.json({
    ok: true,
    configured: !!(current.user && current.pass),
    host: current.host,
    port: current.port,
    secure: current.secure,
    user: current.user,
    maskedPass: current.pass ? '••••••••' : '',
    from: current.from,
  });
});

pluginRouter.delete('/settings/smtp', (_req, res) => {
  _saveSmtpConfig({ host: 'smtp.gmail.com', port: 587, secure: false, user: '', pass: '', from: '' });
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_SECURE;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_FROM;
  res.json({ ok: true });
});

pluginRouter.post('/settings/smtp/test', async (req, res) => {
  const { to } = req.body || {};
  const cfg = _loadSmtpConfig();
  if (!cfg.user || !cfg.pass) {
    return res.status(400).json({ error: 'SMTP no configurado' });
  }
  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: cfg.host || 'smtp.gmail.com',
      port: cfg.port || 587,
      secure: cfg.secure || false,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    await transporter.sendMail({
      from: cfg.from || `Vertial <${cfg.user}>`,
      to: to || cfg.user,
      subject: 'Test SMTP · Vertial',
      html: '<h2>Funciona!</h2><p>La configuración SMTP de Vertial está correcta.</p>',
    });
    res.json({ ok: true, sentTo: to || cfg.user });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error enviando email de prueba' });
  }
});

// ── Payment Gateway Keys management ──

const GATEWAY_KEYS_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', '.gateway-keys.json');

function _loadGatewayKeys() {
  try {
    if (existsSync(GATEWAY_KEYS_FILE)) {
      return JSON.parse(readFileSync(GATEWAY_KEYS_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { mode: 'test', testKey: '', liveKey: '', provider: 'stripe' };
}

function _saveGatewayKeys(data) {
  writeFileSync(GATEWAY_KEYS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function _maskKey(key) {
  if (!key || key.length < 8) return '';
  return key.slice(0, 7) + '••••' + key.slice(-4);
}

pluginRouter.get('/settings/payment-gateway', (_req, res) => {
  const data = _loadGatewayKeys();
  res.json({
    mode: data.mode || 'test',
    provider: data.provider || 'stripe',
    testKey: { configured: !!data.testKey, masked: _maskKey(data.testKey) },
    liveKey: { configured: !!data.liveKey, masked: _maskKey(data.liveKey) },
  });
});

pluginRouter.post('/settings/payment-gateway', (req, res) => {
  const { mode, testKey, liveKey, provider } = req.body || {};
  const current = _loadGatewayKeys();

  if (mode && (mode === 'test' || mode === 'live')) current.mode = mode;
  if (provider && typeof provider === 'string') current.provider = provider.slice(0, 30);
  if (testKey !== undefined) current.testKey = typeof testKey === 'string' ? testKey.trim().slice(0, 500) : current.testKey;
  if (liveKey !== undefined) current.liveKey = typeof liveKey === 'string' ? liveKey.trim().slice(0, 500) : current.liveKey;

  _saveGatewayKeys(current);

  res.json({
    ok: true,
    mode: current.mode,
    provider: current.provider,
    testKey: { configured: !!current.testKey, masked: _maskKey(current.testKey) },
    liveKey: { configured: !!current.liveKey, masked: _maskKey(current.liveKey) },
  });
});

pluginRouter.delete('/settings/payment-gateway', (_req, res) => {
  _saveGatewayKeys({ mode: 'test', testKey: '', liveKey: '', provider: 'stripe' });
  res.json({ ok: true });
});

// ── Generic Tokens / API Keys management ──

const TOKENS_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', '.tokens.json');

function _loadTokens() {
  try {
    if (existsSync(TOKENS_FILE)) return JSON.parse(readFileSync(TOKENS_FILE, 'utf-8'));
  } catch { /* ignore */ }
  return {};
}

function _saveTokens(data) {
  writeFileSync(TOKENS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

pluginRouter.get('/settings/tokens', (_req, res) => {
  const all = _loadTokens();
  const result = {};
  for (const [id, value] of Object.entries(all)) {
    const v = String(value);
    result[id] = { configured: !!v, masked: v ? v.slice(0, 6) + '••••' + v.slice(-4) : '' };
  }
  res.json(result);
});

pluginRouter.post('/settings/tokens/:id', (req, res) => {
  const { id } = req.params;
  const { value } = req.body || {};
  if (!value || typeof value !== 'string') return res.status(400).json({ error: 'value required' });
  const all = _loadTokens();
  all[id] = value.trim().slice(0, 2000);
  _saveTokens(all);
  const v = all[id];
  res.json({ ok: true, configured: true, masked: v.slice(0, 6) + '••••' + v.slice(-4) });
});

pluginRouter.delete('/settings/tokens/:id', (req, res) => {
  const { id } = req.params;
  const all = _loadTokens();
  delete all[id];
  _saveTokens(all);
  res.json({ ok: true });
});

pluginRouter.get('/apps/local', (_req, res) => {
  const APPS_ROOT = '/var/www';
  try {
    const entries = readdirSync(APPS_ROOT, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'));

    const apps = entries.map(e => {
      const dir = path.join(APPS_ROOT, e.name);
      const pkgPath = path.join(dir, 'package.json');
      const hasPkg = existsSync(pkgPath);
      let pkg = null;
      if (hasPkg) {
        try { pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')); } catch { /* corrupt */ }
      }

      const hasIndex = existsSync(path.join(dir, 'index.js')) || existsSync(path.join(dir, 'index.ts'));
      const hasSrc = existsSync(path.join(dir, 'src'));
      const hasNodeModules = existsSync(path.join(dir, 'node_modules'));
      const hasGit = existsSync(path.join(dir, '.git'));

      let port = null;
      if (pkg?.scripts) {
        const devScript = pkg.scripts.dev || pkg.scripts.start || '';
        const portMatch = devScript.match(/(?:PORT|port)[=:\s]*(\d{4,5})/);
        if (portMatch) port = parseInt(portMatch[1]);
      }

      let stat;
      try { stat = statSync(dir); } catch { stat = null; }

      return {
        name: e.name,
        path: dir,
        description: pkg?.description || null,
        version: pkg?.version || null,
        hasPackageJson: hasPkg,
        hasIndex,
        hasSrc,
        hasNodeModules,
        hasGit,
        port,
        scripts: pkg?.scripts ? Object.keys(pkg.scripts) : [],
        dependencies: pkg ? Object.keys(pkg.dependencies || {}).length : 0,
        devDependencies: pkg ? Object.keys(pkg.devDependencies || {}).length : 0,
        framework: detectFramework(pkg),
        updatedAt: stat?.mtime?.toISOString() || null,
      };
    });

    apps.sort((a, b) => {
      if (a.hasPackageJson && !b.hasPackageJson) return -1;
      if (!a.hasPackageJson && b.hasPackageJson) return 1;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });

    res.json({ apps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function detectFramework(pkg) {
  if (!pkg) return null;
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  if (all['next']) return 'Next.js';
  if (all['nuxt']) return 'Nuxt';
  if (all['@vitejs/plugin-react'] || all['vite']) return 'Vite + React';
  if (all['react']) return 'React';
  if (all['vue']) return 'Vue';
  if (all['svelte']) return 'Svelte';
  if (all['express']) return 'Express';
  if (all['fastify']) return 'Fastify';
  if (all['hono']) return 'Hono';
  return null;
}

pluginRouter.post('/apps/validate', (req, res) => {
  const { name, description, port, backendStack, frontendStack } = req.body || {};

  if (!name || typeof name !== 'string' || name.length < 2) {
    return res.status(400).json({ error: 'Name is required (min 2 chars)' });
  }
  if (!description || typeof description !== 'string' || description.length < 100) {
    return res.status(400).json({ error: 'Description is required (min 100 chars)' });
  }
  if (!port || port < 1024 || port > 65535) {
    return res.status(400).json({ error: 'Port must be between 1024 and 65535' });
  }

  const appDir = `/var/www/${name}`;
  if (existsSync(appDir)) {
    return res.status(409).json({ error: `Ya existe una app en ${appDir}` });
  }

  try {
    mkdirSync(appDir, { recursive: true });
    copyPluginToApp(appDir);
    console.log(`[app-create] Plugin copied to ${appDir}/src/plugin/`);
  } catch (err) {
    console.error('[app-create] Error copying plugin:', err.message);
    return res.status(500).json({ error: 'Error al copiar el plugin a la nueva app' });
  }

  const pluginSnippet = getPluginEmbedSnippet(port);
  const prompt = buildAppPrompt({ name, description, port, backendStack, frontendStack, pluginSnippet });

  res.json({ prompt, cwd: '/var/www' });
});

let _openaiInstance = null;
function _getOpenAI() {
  if (!_openaiInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');
    _openaiInstance = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    });
  }
  return _openaiInstance;
}

pluginRouter.post('/apps/enhance-description', async (req, res) => {
  const { description, appName, maxChars } = req.body || {};
  if (!description || typeof description !== 'string' || description.trim().length < 10) {
    return res.status(400).json({ error: 'Description must be at least 10 characters' });
  }

  const targetChars = Math.min(Math.max(parseInt(maxChars, 10) || 400, 200), 2000);
  const maxTokens = Math.round(targetChars / 2.5);

  try {
    const completion = await _getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Eres un experto en especificaciones de software. El usuario te da una descripción breve de una aplicación web y tú la potencias con detalle técnico y funcional.

Reglas:
- Mantén la intención original del usuario
- Añade detalles sobre funcionalidades, vistas, flujos de usuario y aspectos técnicos
- Describe la estructura de datos que debería tener en CouchDB
- Menciona las vistas/páginas principales
- El resultado debe ser claro, detallado y en español
- Genera aproximadamente ${targetChars} caracteres de texto
- Usa formato estructurado: títulos con #, listas con -, checks con - [ ] cuando aplique
- Solo devuelve la descripción mejorada, sin explicaciones adicionales`,
        },
        {
          role: 'user',
          content: `App: "${appName || 'mi-app'}"\nDescripción del usuario: "${description}"\n\nMejora esta descripción (~${targetChars} caracteres):`,
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    });

    const enhanced = completion.choices[0]?.message?.content?.trim() || description;
    res.json({ enhanced });
  } catch (err) {
    console.error('[plugin] enhance-description error:', err.message);
    res.status(500).json({ error: 'Error al mejorar la descripción' });
  }
});

// ── Kanban: Tickets ──

pluginRouter.get('/kanban/tickets', async (_req, res) => {
  try {
    const tickets = await getAllTickets();
    res.json({ tickets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.get('/kanban/tickets/:id', async (req, res) => {
  try {
    const ticket = await getTicket(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.post('/kanban/tickets', async (req, res) => {
  try {
    const ticket = await createTicket(req.body);
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.patch('/kanban/tickets/:id', async (req, res) => {
  try {
    const ticket = await updateTicket(req.params.id, req.body, req.body._changedBy || 'user');
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.delete('/kanban/tickets/:id', async (req, res) => {
  try {
    await deleteTicket(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.post('/kanban/tickets/:id/move', async (req, res) => {
  try {
    const { status, order } = req.body;
    const ticket = await moveTicket(req.params.id, status, order);
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.post('/kanban/tickets/reorder', async (req, res) => {
  try {
    await reorderTickets(req.body.orders || []);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Kanban: Comments ──

pluginRouter.post('/kanban/tickets/:id/comments', async (req, res) => {
  try {
    const comment = await addComment(req.params.id, req.body);
    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.delete('/kanban/tickets/:ticketId/comments/:commentId', async (req, res) => {
  try {
    await deleteComment(req.params.ticketId, req.params.commentId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Kanban: Time entries ──

pluginRouter.post('/kanban/tickets/:id/timelog', async (req, res) => {
  try {
    const entry = await addTimeEntry(req.params.id, req.body);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.patch('/kanban/tickets/:ticketId/timelog/:entryId', async (req, res) => {
  try {
    const entry = await updateTimeEntry(req.params.ticketId, req.params.entryId, req.body);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.delete('/kanban/tickets/:ticketId/timelog/:entryId', async (req, res) => {
  try {
    await deleteTimeEntry(req.params.ticketId, req.params.entryId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Kanban: Attachments ──

pluginRouter.post('/kanban/tickets/:id/attachments', async (req, res) => {
  try {
    const att = await addAttachment(req.params.id, req.body);
    res.json(att);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.delete('/kanban/tickets/:ticketId/attachments/:attId', async (req, res) => {
  try {
    await deleteAttachment(req.params.ticketId, req.params.attId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Kanban: Team Members ──

pluginRouter.get('/kanban/members', async (_req, res) => {
  try {
    const members = await getAllMembers();
    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.post('/kanban/members', async (req, res) => {
  try {
    const member = await createMember(req.body);
    res.json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.patch('/kanban/members/:id', async (req, res) => {
  try {
    const member = await updateMember(req.params.id, req.body);
    res.json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.delete('/kanban/members/:id', async (req, res) => {
  try {
    await deleteMember(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Kanban: Stats ──

pluginRouter.get('/kanban/stats', async (_req, res) => {
  try {
    const stats = await getTeamStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Kanban: Saved Views ──

pluginRouter.get('/kanban/views', async (_req, res) => {
  try {
    const views = await getAllViews();
    res.json(views);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.post('/kanban/views', async (req, res) => {
  try {
    const view = await createView(req.body);
    res.json(view);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.patch('/kanban/views/:id', async (req, res) => {
  try {
    const view = await updateView(req.params.id, req.body);
    res.json(view);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.delete('/kanban/views/:id', async (req, res) => {
  try {
    await deleteView(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Kanban: AI ticket generation ──

pluginRouter.post('/kanban/ai/generate-ticket', async (req, res) => {
  const { prompt, prePrompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const systemMsg = prePrompt
      ? `${prePrompt}\n\nAhora genera un ticket basado en la siguiente instrucción del usuario.`
      : `Eres un gestor de proyectos experto. Genera un ticket de desarrollo a partir de la instrucción del usuario.

Responde SOLO con JSON válido (sin markdown, sin backticks) con esta estructura:
{
  "title": "título breve del ticket",
  "description": "descripción detallada técnica y funcional",
  "priority": "low|medium|high|critical",
  "tags": ["tag1", "tag2"],
  "group": "grupo sugerido",
  "subgroup": "subgrupo sugerido"
}`;

    const completion = await _getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: prompt },
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '{}';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    res.json({ ticket: parsed, rawResponse: raw });
  } catch (err) {
    console.error('[kanban] AI generate error:', err.message);
    res.status(500).json({ error: 'Error al generar ticket con IA' });
  }
});

// ── Kanban: AI description summary ──

pluginRouter.post('/kanban/ai/summarize-ticket', async (req, res) => {
  const { ticket } = req.body || {};
  if (!ticket || !ticket.title) {
    return res.status(400).json({ error: 'Ticket with title is required' });
  }

  try {
    const parts = [];
    parts.push(`Título: ${ticket.title}`);
    if (ticket.description) parts.push(`Descripción actual: ${ticket.description}`);
    parts.push(`Estado: ${ticket.status || 'backlog'}`);
    parts.push(`Prioridad: ${ticket.priority || 'medium'}`);
    if (ticket.group) parts.push(`Grupo: ${ticket.group}`);
    if (ticket.subgroup) parts.push(`Subgrupo: ${ticket.subgroup}`);
    if (ticket.assignee) parts.push(`Asignado a: ${ticket.assignee}`);
    if (ticket.tags?.length) parts.push(`Tags: ${ticket.tags.join(', ')}`);
    if (ticket.startDate) parts.push(`Fecha inicio: ${ticket.startDate}`);
    if (ticket.endDate) parts.push(`Fecha fin: ${ticket.endDate}`);

    if (ticket.comments?.length) {
      const commentsSummary = ticket.comments
        .slice(-10)
        .map((c) => `  - ${c.author}: ${c.content}`)
        .join('\n');
      parts.push(`Comentarios recientes:\n${commentsSummary}`);
    }

    if (ticket.timelog?.length) {
      const totalHours = ticket.timelog.reduce((s, e) => s + (e.hours || 0), 0);
      const logSummary = ticket.timelog
        .slice(-5)
        .map((e) => `  - ${e.userName}: ${e.hours}h — ${e.description || 'sin desc'}`)
        .join('\n');
      parts.push(`Registro de tiempo (${totalHours}h total):\n${logSummary}`);
    }

    if (ticket.attachments?.length) {
      parts.push(`Adjuntos: ${ticket.attachments.map((a) => a.name).join(', ')}`);
    }

    const ticketContext = parts.join('\n');

    const completion = await _getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Eres un gestor de proyectos técnico experto. Tu trabajo es generar una descripción completa, bien estructurada y profesional para un ticket de desarrollo.

Usa el siguiente formato con markdown simplificado (solo #, ##, -, - [ ]):

# Objetivo
[Resumen claro y conciso del objetivo principal del ticket]

## Contexto
[Contexto técnico y de negocio relevante]

## Requisitos
- [ ] [Requisito funcional 1]
- [ ] [Requisito funcional 2]
- [ ] [Requisito funcional 3]

## Criterios de aceptación
- [ ] [Criterio 1]
- [ ] [Criterio 2]

## Notas técnicas
- [Nota importante 1]
- [Nota importante 2]

Reglas:
- Si la descripción actual ya tiene contenido útil, incorpóralo y mejóralo
- Extrae información relevante de los comentarios y registro de tiempo
- Sé específico y técnico, no genérico
- Genera checklist items como "- [ ] tarea" para que sean interactivos
- Adapta la cantidad de secciones según la complejidad del ticket
- NO uses markdown avanzado (negritas, cursivas, links, código). Solo #, ##, -, - [ ], - [x] y texto plano
- Responde SOLO con la descripción, sin explicaciones adicionales`,
        },
        { role: 'user', content: ticketContext },
      ],
      max_tokens: 1500,
      temperature: 0.5,
    });

    const description = completion.choices[0]?.message?.content?.trim() || '';

    // Second call: generate task breakdown
    let tasks = [];
    try {
      const tasksCompletion = await _getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Eres un gestor de proyectos técnico. A partir de un ticket y su descripción, genera una lista de subtareas concretas y accionables para implementarlo.

Responde SOLO con un JSON array. Cada elemento:
{
  "title": "título corto y claro de la tarea",
  "description": "breve descripción técnica de qué hay que hacer",
  "priority": "low|medium|high",
  "tags": ["tag1"]
}

Reglas:
- Entre 3 y 8 tareas según la complejidad
- Ordénalas de forma lógica (primero setup, luego implementación, luego tests)
- Sé específico: "Crear endpoint POST /api/users" no "Implementar backend"
- No repitas el ticket padre, desglósalo en pasos concretos
- Responde SOLO con el JSON array, sin texto adicional`,
          },
          { role: 'user', content: `Ticket: ${ticket.title}\n\nDescripción generada:\n${description}` },
        ],
        max_tokens: 1000,
        temperature: 0.4,
      });

      const tasksRaw = tasksCompletion.choices[0]?.message?.content?.trim() || '[]';
      const tasksCleaned = tasksRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      tasks = JSON.parse(tasksCleaned);
      if (!Array.isArray(tasks)) tasks = [];
    } catch (taskErr) {
      console.error('[kanban] AI tasks generation error:', taskErr.message);
    }

    res.json({ description, tasks });
  } catch (err) {
    console.error('[kanban] AI summarize error:', err.message);
    res.status(500).json({ error: 'Error al generar resumen con IA' });
  }
});

// ── Kanban: AI Search (persistent background generation with SSE) ──

const aiSearchWatchers = new Set();
let aiSearchInterval = null;

function notifyAiSearchWatchers(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const w of aiSearchWatchers) {
    try { w.write(data); } catch { /* gone */ }
  }
}

const AI_SEARCH_PROMPTS = {
  frontend: 'tareas de frontend: componentes UI, páginas, estilos CSS/Tailwind, responsive design, accesibilidad, rendimiento del cliente, animaciones, formularios, validación client-side, estado del cliente, routing',
  backend: 'tareas de backend: APIs REST, endpoints, base de datos, autenticación, autorización, validación server-side, servicios, middleware, caching, jobs en background, migraciones, logging',
  both: 'tareas de desarrollo full-stack: tanto frontend (UI, componentes, páginas) como backend (APIs, base de datos, servicios). Mezcla ambos tipos',
  security: 'tareas de seguridad: auditoría de vulnerabilidades, XSS, CSRF, inyección SQL, autenticación segura, encriptación, CORS, rate limiting, sanitización de inputs, headers de seguridad, OWASP top 10, dependencias vulnerables',
};

async function generateAiSearchBatch(sessionId, category) {
  const session = await getAiSearchSession(sessionId);
  if (!session || session.status !== 'running') return;

  const elapsed = (Date.now() - new Date(session.startedAt).getTime()) / 60000;
  if (elapsed >= session.durationMinutes) {
    await updateAiSearchSession(sessionId, { status: 'completed' });
    notifyAiSearchWatchers({ type: 'session_completed', sessionId });
    return;
  }

  const existingTickets = await getAiSearchTickets(sessionId);
  const existingTitles = existingTickets.map(t => t.title).join(', ');
  const allKanbanTickets = await getAllTickets();
  const kanbanTitles = allKanbanTickets.map(t => t.title).join(', ');

  const focusDesc = AI_SEARCH_PROMPTS[category] || AI_SEARCH_PROMPTS.both;

  try {
    const openai = _getOpenAI();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Eres un tech lead experto que analiza proyectos de software y genera tickets de desarrollo accionables. Tu enfoque actual es: ${focusDesc}.

Genera exactamente 2 tickets de desarrollo nuevos y únicos. Cada ticket debe ser concreto, técnico y accionable.

NO repitas tickets que ya existan. Tickets existentes en el kanban: [${kanbanTitles}]
Tickets ya generados en esta sesión: [${existingTitles}]

Responde SOLO con un JSON array (sin markdown, sin backticks):
[
  {
    "title": "título breve y técnico",
    "description": "descripción detallada con contexto técnico, pasos de implementación y criterios de aceptación",
    "priority": "low|medium|high|critical",
    "tags": ["tag1", "tag2"],
    "group": "grupo sugerido (frontend|backend|security|infra|devops)",
    "subgroup": "subgrupo más específico"
  }
]`,
        },
        {
          role: 'user',
          content: `Analiza el proyecto y genera 2 nuevos tickets de tipo ${category}. Minuto ${Math.floor(elapsed)} de ${session.durationMinutes}. Ya hay ${existingTickets.length} tickets generados. Sé creativo y busca mejoras reales.`,
        },
      ],
      max_tokens: 1500,
      temperature: 0.8,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '[]';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return;

    for (const ticketData of parsed) {
      const aiTicket = await createAiSearchTicket(sessionId, { ...ticketData, category });
      await updateAiSearchSession(sessionId, { generatedCount: (session.generatedCount || 0) + 1 });
      notifyAiSearchWatchers({ type: 'new_ticket', ticket: aiTicket, sessionId });
    }
  } catch (err) {
    console.error('[kanban] AI search batch error:', err.message);
  }
}

function startAiSearchLoop() {
  if (aiSearchInterval) return;
  aiSearchInterval = setInterval(async () => {
    try {
      const session = await getActiveAiSearchSession();
      if (!session) {
        clearInterval(aiSearchInterval);
        aiSearchInterval = null;
        return;
      }
      await generateAiSearchBatch(session.id, session.category);
    } catch (err) {
      console.error('[kanban] AI search loop error:', err.message);
    }
  }, 25000);
}

// On startup, check for orphaned running sessions
(async () => {
  try {
    const session = await getActiveAiSearchSession();
    if (session) startAiSearchLoop();
  } catch { /* ignore */ }
})();

pluginRouter.get('/kanban/ai/search/session', async (_req, res) => {
  try {
    const session = await getActiveAiSearchSession();
    if (!session) return res.json({ session: null, tickets: [] });
    const tickets = await getAiSearchTickets(session.id);
    const elapsed = (Date.now() - new Date(session.startedAt).getTime()) / 60000;
    res.json({ session: { ...session, elapsedMinutes: elapsed }, tickets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.post('/kanban/ai/search/start', async (req, res) => {
  const { durationMinutes, category } = req.body || {};
  try {
    const existing = await getActiveAiSearchSession();
    if (existing) {
      return res.status(409).json({ error: 'Ya hay una búsqueda activa' });
    }

    const session = await createAiSearchSession({
      durationMinutes: Math.max(1, Math.min(30, Number(durationMinutes) || 5)),
      category: ['frontend', 'backend', 'both', 'security'].includes(category) ? category : 'both',
    });

    startAiSearchLoop();
    generateAiSearchBatch(session.id, session.category);

    res.json({ session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.get('/kanban/ai/search/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    const session = await getActiveAiSearchSession();
    if (session) {
      const tickets = await getAiSearchTickets(session.id);
      const elapsed = (Date.now() - new Date(session.startedAt).getTime()) / 60000;
      res.write(`data: ${JSON.stringify({ type: 'init', session: { ...session, elapsedMinutes: elapsed }, tickets })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'init', session: null, tickets: [] })}\n\n`);
    }
  } catch {
    res.write(`data: ${JSON.stringify({ type: 'init', session: null, tickets: [] })}\n\n`);
  }

  aiSearchWatchers.add(res);
  req.on('close', () => { aiSearchWatchers.delete(res); });
});

pluginRouter.post('/kanban/ai/search/stop', async (_req, res) => {
  try {
    const session = await getActiveAiSearchSession();
    if (!session) return res.status(404).json({ error: 'No hay búsqueda activa' });

    await updateAiSearchSession(session.id, { status: 'cancelled' });

    const tickets = await getAiSearchTickets(session.id);
    for (const t of tickets) {
      if (t.reviewStatus === 'pending') {
        await createTicket({
          title: t.title,
          description: t.description,
          priority: t.priority,
          tags: t.tags,
          group: t.group,
          subgroup: t.subgroup,
          status: 'backlog',
        });
        await updateAiSearchTicket(t.id, { reviewStatus: 'cancelled' });
      }
    }

    notifyAiSearchWatchers({ type: 'session_cancelled', sessionId: session.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.post('/kanban/ai/search/ticket/:id/accept', async (req, res) => {
  try {
    const aiTicket = await updateAiSearchTicket(req.params.id, { reviewStatus: 'accepted' });
    const realTicket = await createTicket({
      title: aiTicket.title,
      description: aiTicket.description,
      priority: aiTicket.priority,
      tags: aiTicket.tags,
      group: aiTicket.group,
      subgroup: aiTicket.subgroup,
      status: 'todo',
    });
    notifyAiSearchWatchers({ type: 'ticket_accepted', ticketId: req.params.id, kanbanTicket: realTicket });
    res.json({ ok: true, ticket: realTicket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

pluginRouter.post('/kanban/ai/search/ticket/:id/reject', async (req, res) => {
  try {
    await deleteAiSearchTicket(req.params.id);
    notifyAiSearchWatchers({ type: 'ticket_rejected', ticketId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stopdown AI ──

const STOPDOWN_PROMPTS = {
  project: `Eres un experto en creación de startups y negocios. A partir de la idea del usuario, genera un proyecto completo.
Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "name": "nombre del proyecto (corto, memorable)",
  "description": "descripción detallada del negocio (2-3 párrafos)",
  "sector": "sector principal",
  "stage": "ideation",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "vision": "visión a largo plazo del proyecto",
  "problem": "problema que resuelve",
  "solution": "solución propuesta",
  "targetMarket": "mercado objetivo",
  "revenueModel": "modelo de ingresos",
  "competitors": ["competidor1", "competidor2", "competidor3"],
  "differentiators": ["diferenciador1", "diferenciador2"],
  "milestones": [
    {"name": "hito", "description": "descripción", "timeframe": "plazo"},
    {"name": "hito", "description": "descripción", "timeframe": "plazo"},
    {"name": "hito", "description": "descripción", "timeframe": "plazo"}
  ],
  "risks": ["riesgo1", "riesgo2", "riesgo3"],
  "metrics": ["KPI1", "KPI2", "KPI3"]
}`,

  team: `Eres un experto en recursos humanos y startups. A partir de la descripción del proyecto, sugiere la composición ideal del equipo fundador y primeros empleados.
Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "roles": [
    {
      "title": "título del rol (ej: CTO, CMO, COO)",
      "name": "",
      "description": "qué hace esta persona",
      "skills": ["skill1", "skill2", "skill3"],
      "priority": "critical|high|medium|low",
      "type": "founder|employee|advisor|freelance",
      "allocation": "full-time|part-time|advisory"
    }
  ],
  "culture": "descripción de la cultura de equipo recomendada",
  "hiringPlan": "plan de contratación a 12 meses"
}`,

  pitch: `Eres un experto en comunicación y pitches de startups que ha asesorado a cientos de founders. Genera scripts de pitch profesionales.
Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "elevator": "pitch de 30 segundos (2-3 frases impactantes)",
  "oneMinute": "pitch de 1 minuto con problema-solución-mercado",
  "threeMinute": "pitch de 3 minutos completo con storytelling (usa párrafos separados por \\n\\n)",
  "investorDeck": [
    {"slide": "Título", "content": "contenido"},
    {"slide": "Problema", "content": "contenido"},
    {"slide": "Solución", "content": "contenido"},
    {"slide": "Mercado", "content": "contenido"},
    {"slide": "Modelo de Negocio", "content": "contenido"},
    {"slide": "Tracción", "content": "contenido"},
    {"slide": "Equipo", "content": "contenido"},
    {"slide": "Financiación", "content": "contenido"},
    {"slide": "Roadmap", "content": "contenido"},
    {"slide": "Ask", "content": "contenido"}
  ],
  "qa": [
    {"question": "pregunta frecuente de inversores", "answer": "respuesta sugerida"},
    {"question": "pregunta frecuente de inversores", "answer": "respuesta sugerida"},
    {"question": "pregunta frecuente de inversores", "answer": "respuesta sugerida"},
    {"question": "pregunta frecuente de inversores", "answer": "respuesta sugerida"},
    {"question": "pregunta frecuente de inversores", "answer": "respuesta sugerida"}
  ]
}`,

  dataroom: `Eres un abogado y asesor de startups experto. Genera plantillas de documentos esenciales para un data room.
Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "documents": [
    {
      "name": "nombre del documento",
      "category": "contract|nda|agreement|pitch-deck|financial|legal|technical",
      "content": "contenido completo de la plantilla del documento con secciones claras separadas por \\n\\n",
      "accessLevel": "founders|team|investors",
      "priority": "essential|recommended|optional"
    }
  ]
}`,

  investors: `Eres un experto en venture capital y fundraising. Basándote en el proyecto, genera un listado de tipos de inversores ideales y una estrategia de fundraising.
Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "strategy": "estrategia de fundraising recomendada (2-3 párrafos)",
  "fundingNeeded": "cantidad estimada necesaria",
  "idealInvestors": [
    {
      "name": "Tipo/Nombre de inversor ideal",
      "type": "angel|vc|accelerator|incubator|corporate|public",
      "why": "por qué encaja con el proyecto",
      "sectors": ["sector1", "sector2"],
      "stages": ["ideation"],
      "ticketRange": {"min": 0, "max": 0},
      "approach": "cómo acercarse a este tipo de inversor"
    }
  ],
  "timeline": [
    {"phase": "fase", "action": "acción", "duration": "duración"}
  ],
  "redFlags": ["señal de alerta para el inversor a evitar 1", "señal 2"]
}`,

  pitchPresentation: `Eres un diseñador de presentaciones de clase mundial y experto en storytelling para startups. Tu trabajo es transformar el contenido de un pitch en una presentación profesional de diapositivas.

REGLAS:
- Genera entre 8 y 20 diapositivas dependiendo de la complejidad del contenido
- Cada diapositiva debe tener un título impactante, un subtítulo contextual, un contenido principal (párrafos explicativos) y opcionalmente bullets (puntos clave)
- Las diapositivas deben seguir un flujo narrativo coherente (storytelling)
- La primera diapositiva siempre es la portada
- La última diapositiva siempre es el cierre/call-to-action
- Usa datos concretos y cifras cuando sea posible
- Cada diapositiva debe poder sostenerse por sí sola como idea completa

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "title": "título de la presentación",
  "subtitle": "subtítulo de la presentación",
  "totalSlides": 15,
  "slides": [
    {
      "slideNumber": 1,
      "type": "cover",
      "title": "Título de la diapositiva",
      "subtitle": "Subtítulo o tagline",
      "content": "Texto principal de la diapositiva con explicación detallada",
      "bullets": ["punto clave 1", "punto clave 2"],
      "speakerNotes": "Notas para el presentador sobre qué decir en esta diapositiva"
    }
  ]
}

Los tipos de diapositiva pueden ser: cover, problem, solution, market, product, traction, business-model, team, financials, competition, roadmap, vision, ask, testimonial, demo, metrics, closing, section-break, quote, data`,

  swot: `Eres un consultor estratégico. Genera un análisis DAFO/SWOT detallado del proyecto.
Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "strengths": ["fortaleza1", "fortaleza2", "fortaleza3", "fortaleza4"],
  "weaknesses": ["debilidad1", "debilidad2", "debilidad3", "debilidad4"],
  "opportunities": ["oportunidad1", "oportunidad2", "oportunidad3", "oportunidad4"],
  "threats": ["amenaza1", "amenaza2", "amenaza3", "amenaza4"],
  "summary": "resumen estratégico de 2-3 párrafos"
}`,
};

// ── Activity Logs (proxy to activity-logs DB or fallback) ──

pluginRouter.get('/logs', async (_req, res) => {
  try {
    const couchUrl = process.env.COUCHDB_URL || 'http://admin:admin@localhost:5984';
    const dbName = 'activity-logs';
    const resp = await fetch(`${couchUrl}/${dbName}/_all_docs?include_docs=true&limit=500&descending=true`);
    if (!resp.ok) {
      return res.json({ logs: [] });
    }
    const data = await resp.json();
    const logs = (data.rows || [])
      .map(r => r.doc)
      .filter(d => d && d.type === 'activity-log')
      .map(d => ({
        id: d._id,
        timestamp: d.timestamp || d.createdAt || '',
        user: d.user || 'anonymous',
        action: d.action || '',
        category: d.category || 'system',
        details: d.details || '',
        level: d.level || 'info',
        ip: d.ip || '',
        resource: d.resource || '',
      }));
    res.json({ logs });
  } catch {
    res.json({ logs: [] });
  }
});

pluginRouter.get('/logs/stats', async (_req, res) => {
  try {
    const couchUrl = process.env.COUCHDB_URL || 'http://admin:admin@localhost:5984';
    const dbName = 'activity-logs';
    const resp = await fetch(`${couchUrl}/${dbName}/_all_docs?include_docs=true&limit=2000`);
    if (!resp.ok) {
      return res.json({ byCategory: {}, byLevel: {}, topUsers: [], total: 0 });
    }
    const data = await resp.json();
    const docs = (data.rows || []).map(r => r.doc).filter(d => d && d.type === 'activity-log');
    const byCategory = {};
    const byLevel = {};
    const userCounts = {};
    for (const d of docs) {
      const cat = d.category || 'system';
      const lvl = d.level || 'info';
      const usr = d.user || 'anonymous';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
      byLevel[lvl] = (byLevel[lvl] || 0) + 1;
      userCounts[usr] = (userCounts[usr] || 0) + 1;
    }
    const topUsers = Object.entries(userCounts)
      .map(([user, count]) => ({ user, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    res.json({ byCategory, byLevel, topUsers, total: docs.length });
  } catch {
    res.json({ byCategory: {}, byLevel: {}, topUsers: [], total: 0 });
  }
});

// ── Log Rules (custom alert rules managed via AI agents) ──

const LOG_RULES_DB = 'activity-logs';

pluginRouter.get('/logs/rules', async (_req, res) => {
  try {
    const couchUrl = process.env.COUCHDB_URL || 'http://admin:admin@localhost:5984';
    const resp = await fetch(`${couchUrl}/${LOG_RULES_DB}/_all_docs?include_docs=true`);
    if (!resp.ok) return res.json({ rules: [] });
    const data = await resp.json();
    const rules = (data.rows || [])
      .map(r => r.doc)
      .filter(d => d && d.type === 'log-rule')
      .map(d => ({
        id: d._id,
        _rev: d._rev,
        prompt: d.prompt || '',
        status: d.status || 'pending',
        createdAt: d.createdAt || '',
        activatedAt: d.activatedAt || '',
        agentId: d.agentId || '',
      }))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    res.json({ rules });
  } catch {
    res.json({ rules: [] });
  }
});

pluginRouter.post('/logs/rules', async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'prompt is required' });
    }
    const couchUrl = process.env.COUCHDB_URL || 'http://admin:admin@localhost:5984';
    await fetch(`${couchUrl}/${LOG_RULES_DB}`, { method: 'PUT' }).catch(() => null);
    const id = `rule:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const doc = {
      _id: id,
      type: 'log-rule',
      prompt: prompt.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      activatedAt: '',
      agentId: '',
    };
    const putResp = await fetch(`${couchUrl}/${LOG_RULES_DB}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
    const result = await putResp.json().catch(() => ({}));
    if (!putResp.ok) return res.status(500).json({ error: 'Failed to save rule' });
    res.json({ rule: { ...doc, _rev: result.rev } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Error creating rule' });
  }
});

pluginRouter.patch('/logs/rules/:id', async (req, res) => {
  try {
    const ruleId = req.params.id;
    const updates = req.body || {};
    const couchUrl = process.env.COUCHDB_URL || 'http://admin:admin@localhost:5984';
    const getResp = await fetch(`${couchUrl}/${LOG_RULES_DB}/${encodeURIComponent(ruleId)}`);
    if (!getResp.ok) return res.status(404).json({ error: 'Rule not found' });
    const existing = await getResp.json();
    const updated = {
      ...existing,
      ...updates,
      _id: existing._id,
      _rev: existing._rev,
      type: 'log-rule',
    };
    const putResp = await fetch(`${couchUrl}/${LOG_RULES_DB}/${encodeURIComponent(ruleId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    const result = await putResp.json().catch(() => ({}));
    if (!putResp.ok) return res.status(500).json({ error: 'Failed to update rule' });
    res.json({ rule: { ...updated, _rev: result.rev } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Error updating rule' });
  }
});

pluginRouter.delete('/logs/rules/:id', async (req, res) => {
  try {
    const ruleId = req.params.id;
    const couchUrl = process.env.COUCHDB_URL || 'http://admin:admin@localhost:5984';
    const getResp = await fetch(`${couchUrl}/${LOG_RULES_DB}/${encodeURIComponent(ruleId)}`);
    if (!getResp.ok) return res.status(404).json({ error: 'Rule not found' });
    const existing = await getResp.json();
    const delResp = await fetch(
      `${couchUrl}/${LOG_RULES_DB}/${encodeURIComponent(ruleId)}?rev=${encodeURIComponent(existing._rev)}`,
      { method: 'DELETE' },
    );
    if (!delResp.ok) return res.status(500).json({ error: 'Failed to delete rule' });
    res.json({ ok: true, id: ruleId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Error deleting rule' });
  }
});

pluginRouter.post('/stopdown/ai/generate', async (req, res) => {
  const { type, context } = req.body || {};
  if (!type || !context || typeof context !== 'string') {
    return res.status(400).json({ error: 'type and context are required' });
  }

  const systemPrompt = STOPDOWN_PROMPTS[type];
  if (!systemPrompt) {
    return res.status(400).json({ error: `Unknown generation type: ${type}` });
  }

  try {
    const maxTokens = type === 'pitchPresentation' ? 8000 : 3000;
    const completion = await _getOpenAI().chat.completions.create({
      model: type === 'pitchPresentation' ? 'gpt-4o' : 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: context },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '{}';
    let parsed;
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { raw };
    }

    res.json({ result: parsed, type });
  } catch (err) {
    console.error('[stopdown] AI generate error:', err.message);
    res.status(500).json({ error: 'Error al generar con IA' });
  }
});

export { pluginRouter };
