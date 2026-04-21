import { v4 as uuidv4 } from 'uuid';
import pty from 'node-pty';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, renameSync, copyFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import OpenAI from 'openai';

const agents = new Map();
const ptys = new Map();
const outputBuffers = new Map();
const dataListeners = new Map();
const queues = new Map();
const chatMessages = new Map();
const chatListeners = new Map();
const agentVersions = new Map();
const activeAbortControllers = new Map();
const activeCursorChildren = new Map();
let agentCategories = [{ id: 'general', name: 'General', order: 0 }];
let agentOrderCounter = 0;

// ── Cursor CLI detection ──

let cursorCliPath = null;
const cursorSessions = new Map();

function findCursorCli() {
  const candidates = [
    path.join(process.env.HOME || '/root', '.local/bin/agent'),
    '/usr/local/bin/agent',
    '/usr/bin/agent',
  ];
  for (const p of candidates) {
    if (existsSync(p)) { cursorCliPath = p; return p; }
  }
  try {
    const found = execSync('which agent 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (found) { cursorCliPath = found; return found; }
  } catch { /* not found */ }
  return null;
}

// ── Persistence ──

const DATA_DIR = path.resolve(process.cwd(), '.plugin-data');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const AGENTS_BACKUP = path.join(DATA_DIR, 'agents.backup.json');
const ARCHIVE_DIR = path.join(DATA_DIR, 'archive');
const CHAT_DIR = path.join(DATA_DIR, 'chats');
const VERSIONS_DIR = path.join(DATA_DIR, 'versions');

function ensureDataDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(CHAT_DIR)) mkdirSync(CHAT_DIR, { recursive: true });
  if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });
}

function ensureVersionsDirs() {
  ensureDataDirs();
  if (!existsSync(VERSIONS_DIR)) mkdirSync(VERSIONS_DIR, { recursive: true });
}

function persistVersions(agentId) {
  try {
    ensureVersionsDirs();
    const versions = agentVersions.get(agentId);
    if (!versions) return;
    writeFileSync(path.join(VERSIONS_DIR, `${agentId}.json`), JSON.stringify(versions), 'utf-8');
  } catch { /* best effort */ }
}

function loadPersistedVersions(agentId) {
  try {
    ensureVersionsDirs();
    const filePath = path.join(VERSIONS_DIR, `${agentId}.json`);
    if (existsSync(filePath)) {
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));
      return Array.isArray(data) ? data : [];
    }
  } catch { /* ignore */ }
  return [];
}

let _saveTimer = null;
function scheduleSave() {
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    persistAgents();
  }, 500);
}

function flushPendingSave() {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  persistAgents();
}

process.on('SIGTERM', () => {
  console.log('[agents] SIGTERM received, persisting agents...');
  flushPendingSave();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[agents] SIGINT received, persisting agents...');
  flushPendingSave();
  process.exit(0);
});

process.on('exit', () => {
  try { persistAgents(); } catch { /* best effort on exit */ }
});

function persistAgents() {
  try {
    ensureDataDirs();
    if (existsSync(AGENTS_FILE)) {
      try { copyFileSync(AGENTS_FILE, AGENTS_BACKUP); } catch { /* ok */ }
    }
    const data = {
      agents: Array.from(agents.values()).map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        status: a.type === 'conversation' ? 'idle' : a.status,
        cwd: a.cwd,
        model: a.model,
        category: a.category,
        order: a.order,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      categories: agentCategories,
      orderCounter: agentOrderCounter,
    };
    const json = JSON.stringify(data, null, 2);
    const tmpFile = AGENTS_FILE + '.tmp';
    writeFileSync(tmpFile, json, 'utf-8');
    renameSync(tmpFile, AGENTS_FILE);
  } catch {
    try { writeFileSync(AGENTS_FILE, JSON.stringify({ agents: Array.from(agents.values()), categories: agentCategories, orderCounter: agentOrderCounter }, null, 2), 'utf-8'); } catch { /* last resort */ }
  }
}

function persistChat(agentId) {
  try {
    ensureDataDirs();
    const msgs = chatMessages.get(agentId);
    if (!msgs) return;
    const keep = msgs.slice(-200).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      thinking: m.thinking || undefined,
      files: m.files || undefined,
      createdAt: m.createdAt,
    }));
    writeFileSync(path.join(CHAT_DIR, `${agentId}.json`), JSON.stringify(keep), 'utf-8');
  } catch { /* best effort */ }
}

function tryParseAgentsFile(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (!raw || !Array.isArray(raw.agents)) return null;
    return raw;
  } catch { return null; }
}

function loadPersistedAgents() {
  let raw = tryParseAgentsFile(AGENTS_FILE);
  if (!raw) {
    raw = tryParseAgentsFile(AGENTS_BACKUP);
    if (raw) {
      console.log('[agents] Main file corrupted, restored from backup');
      try { writeFileSync(AGENTS_FILE, JSON.stringify(raw, null, 2), 'utf-8'); } catch { /* ok */ }
    }
  }
  if (!raw) return;

  try {
    if (Array.isArray(raw.categories) && raw.categories.length > 0) {
      agentCategories = raw.categories;
    }
    if (typeof raw.orderCounter === 'number') {
      agentOrderCounter = raw.orderCounter;
    }

    for (const saved of raw.agents) {
      if (!saved.id || agents.has(saved.id)) continue;

      const agent = {
        id: saved.id,
        name: saved.name || 'Agent',
        type: saved.type || 'conversation',
        status: 'idle',
        cwd: saved.cwd || process.cwd(),
        model: saved.model || null,
        category: saved.category || 'general',
        order: saved.order ?? agentOrderCounter++,
        createdAt: saved.createdAt || new Date().toISOString(),
        updatedAt: saved.updatedAt || new Date().toISOString(),
        pid: null,
      };

      agents.set(agent.id, agent);
      outputBuffers.set(agent.id, []);
      dataListeners.set(agent.id, new Set());
      queues.set(agent.id, []);
      chatListeners.set(agent.id, new Set());
      agentVersions.set(agent.id, loadPersistedVersions(agent.id));

      if (agent.type === 'cursor') {
        const cli = findCursorCli();
        if (cli) {
          cursorSessions.set(agent.id, { cli, cwd: agent.cwd, model: agent.model, sessionId: null });
        }
      }

      let savedMsgs = [];
      try {
        const chatPath = path.join(CHAT_DIR, `${agent.id}.json`);
        if (existsSync(chatPath)) {
          savedMsgs = JSON.parse(readFileSync(chatPath, 'utf-8'));
        }
      } catch { /* ignore */ }
      chatMessages.set(agent.id, Array.isArray(savedMsgs) ? savedMsgs : []);
    }

  } catch (err) {
    console.error('[agents] Error loading persisted agents:', err.message);
  }
}

loadPersistedAgents();

let _openai = null;
function getOpenAI() {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY no configurada. Configura la variable de entorno para usar agentes de conversación.');
    _openai = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    });
  }
  return _openai;
}

const MAX_BUFFER_LINES = 5000;
const PROJECT_ROOT = path.resolve(process.cwd());

// ── Cursor CLI install ──

export async function installCursorCli() {
  if (findCursorCli()) return { installed: true, path: cursorCliPath };
  try {
    execSync('curl https://cursor.com/install -fsS | bash', {
      encoding: 'utf-8',
      timeout: 60000,
      env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` },
    });
    if (findCursorCli()) return { installed: true, path: cursorCliPath };
    return { installed: false, error: 'Install script ran but binary not found' };
  } catch (err) {
    return { installed: false, error: err.message };
  }
}

export function getCursorCliStatus() {
  const p = findCursorCli();
  return { available: !!p, path: p };
}

// Ensure PATH includes ~/.local/bin
const HOME = process.env.HOME || '/root';
const envPath = `${HOME}/.local/bin:${process.env.PATH}`;

// ── Agent types: 'terminal' (plain bash) | 'cursor' (Cursor AI agent) ──

export function createAgent({ name, cwd, type = 'conversation', model, prompt }) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const workDir = cwd || PROJECT_ROOT;

  const agent = {
    id,
    name: name || `Agent ${agents.size + 1}`,
    type,
    status: 'idle',
    cwd: workDir,
    model: model || null,
    category: 'general',
    order: agentOrderCounter++,
    createdAt: now,
    updatedAt: now,
    pid: null,
  };

  agents.set(id, agent);
  outputBuffers.set(id, []);
  dataListeners.set(id, new Set());
  queues.set(id, []);
  chatMessages.set(id, []);
  chatListeners.set(id, new Set());
  agentVersions.set(id, []);

  if (type === 'conversation') {
    agent.status = 'idle';
    const systemMsg = {
      id: uuidv4(),
      role: 'assistant',
      content: `Hola${name ? `, soy ${name}` : ''}. ¿En qué puedo ayudarte?`,
      createdAt: now,
    };
    chatMessages.get(id).push(systemMsg);
    persistChat(id);
  } else if (type === 'cursor') {
    initCursorAgent(id, workDir, model, prompt);
  } else {
    spawnShell(id, workDir);
  }

  scheduleSave();
  return agent;
}

function initCursorAgent(agentId, cwd, model, initialPrompt) {
  const cli = findCursorCli();
  if (!cli) {
    const agent = agents.get(agentId);
    if (agent) agent.status = 'error';
    const msgs = chatMessages.get(agentId);
    if (msgs) {
      msgs.push({
        id: uuidv4(),
        role: 'assistant',
        content: 'Error: Cursor CLI no encontrado. Instálalo primero.',
        createdAt: new Date().toISOString(),
      });
      persistChat(agentId);
    }
    return;
  }

  cursorSessions.set(agentId, { cli, cwd, model, sessionId: null });

  const welcomeMsg = {
    id: uuidv4(),
    role: 'assistant',
    content: `Agente Cursor listo. Modelo: **${model || 'auto'}**\nPuedo leer archivos, editar código, ejecutar comandos y más.`,
    createdAt: new Date().toISOString(),
  };
  const msgs = chatMessages.get(agentId);
  if (msgs) {
    msgs.push(welcomeMsg);
    persistChat(agentId);
  }

  if (initialPrompt) {
    setTimeout(() => {
      sendCursorMessage(agentId, initialPrompt).catch((err) => {
        const a = agents.get(agentId);
        if (a) a.status = 'error';
        const m = chatMessages.get(agentId);
        if (m) {
          m.push({
            id: uuidv4(),
            role: 'assistant',
            content: `Error al ejecutar prompt inicial: ${err.message}`,
            createdAt: new Date().toISOString(),
          });
          persistChat(agentId);
          notifyChatListeners(agentId, { type: 'message', message: m[m.length - 1] });
        }
      });
    }, 1500);
  }
}

export async function sendCursorMessage(agentId, userContent, displayContent, attachedFiles) {
  const agent = agents.get(agentId);
  if (!agent) throw new Error('Agent not found');

  const session = cursorSessions.get(agentId);
  if (!session) throw new Error('No Cursor session');

  const msgs = chatMessages.get(agentId);
  if (!msgs) throw new Error('No chat session');

  const userMsg = addChatMessage(agentId, 'user', displayContent || userContent);
  if (attachedFiles?.length) userMsg.files = attachedFiles;
  notifyChatListeners(agentId, { type: 'message', message: userMsg });

  agent.status = 'running';
  agent.updatedAt = new Date().toISOString();

  notifyChatListeners(agentId, { type: 'thinking_start' });

  const assistantMsg = {
    id: uuidv4(),
    role: 'assistant',
    content: '',
    thinking: '',
    toolCalls: [],
    createdAt: new Date().toISOString(),
  };
  msgs.push(assistantMsg);

  const abortController = new AbortController();
  activeAbortControllers.set(agentId, abortController);

  try {
    const { spawn: spawnChild } = await import('node:child_process');

    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--stream-partial-output',
      '--yolo',
      '--model', session.model || 'auto',
    ];

    if (session.sessionId) {
      args.push('--resume', session.sessionId);
    }

    args.push(userContent);

    const child = spawnChild(session.cli, args, {
      cwd: session.cwd,
      env: { ...process.env, PATH: envPath, TERM: 'dumb' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    activeCursorChildren.set(agentId, child);

    let thinkingDone = false;
    let fullText = '';
    let lineBuffer = '';

    const processLine = (line) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);

        if (event.type === 'system' && event.session_id) {
          session.sessionId = event.session_id;
        }

        if (event.type === 'tool_call') {
          if (!thinkingDone) {
            thinkingDone = true;
            assistantMsg.thinking = 'Analizando y ejecutando herramientas...';
            notifyChatListeners(agentId, { type: 'thinking_done', messageId: assistantMsg.id, thinking: assistantMsg.thinking });
            notifyChatListeners(agentId, { type: 'message_start', message: assistantMsg });
          }

          const tc = event.tool_call;
          const toolInfo = tc.readToolCall
            ? { type: 'read', path: tc.readToolCall.args?.path, done: event.subtype === 'completed' }
            : tc.editToolCall
              ? { type: 'edit', path: tc.editToolCall.args?.path || tc.editToolCall.args?.filePath, done: event.subtype === 'completed' }
              : tc.shellToolCall
                ? { type: 'shell', command: tc.shellToolCall.args?.command, done: event.subtype === 'completed' }
                : tc.listToolCall
                  ? { type: 'list', path: tc.listToolCall.args?.path, done: event.subtype === 'completed' }
                  : tc.grepToolCall
                    ? { type: 'grep', pattern: tc.grepToolCall.args?.pattern, done: event.subtype === 'completed' }
                    : { type: 'tool', done: event.subtype === 'completed' };

          if (event.subtype === 'started') {
            assistantMsg.toolCalls.push(toolInfo);
          } else if (event.subtype === 'completed') {
            const last = assistantMsg.toolCalls[assistantMsg.toolCalls.length - 1];
            if (last) last.done = true;
          }

          notifyChatListeners(agentId, { type: 'tool_call', messageId: assistantMsg.id, toolCall: toolInfo, subtype: event.subtype });
        }

        if (event.type === 'assistant' && event.message?.content) {
          if (!thinkingDone) {
            thinkingDone = true;
            assistantMsg.thinking = 'Procesando respuesta...';
            notifyChatListeners(agentId, { type: 'thinking_done', messageId: assistantMsg.id, thinking: assistantMsg.thinking });
            notifyChatListeners(agentId, { type: 'message_start', message: assistantMsg });
          }

          const textContent = event.message.content.find((c) => c.type === 'text');
          if (textContent?.text) {
            const newText = textContent.text;
            if (newText.length > fullText.length) {
              const delta = newText.slice(fullText.length);
              fullText = newText;
              assistantMsg.content = fullText;
              notifyChatListeners(agentId, { type: 'chunk', messageId: assistantMsg.id, delta });
            }
          }
        }

        if (event.type === 'result') {
          if (event.result && !assistantMsg.content) {
            assistantMsg.content = event.result;
          }
        }
      } catch { /* non-JSON line, skip */ }
    };

    child.stdout.on('data', (data) => {
      lineBuffer += data.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';
      for (const line of lines) processLine(line);
    });

    let stderrBuf = '';
    child.stderr.on('data', (data) => { stderrBuf += data.toString(); });

    await new Promise((resolve) => {
      child.on('close', () => {
        if (lineBuffer.trim()) processLine(lineBuffer);
        resolve();
      });
      child.on('error', (err) => {
        assistantMsg.content = `Error: ${err.message}`;
        resolve();
      });
    });

    if (!assistantMsg.content && stderrBuf) {
      assistantMsg.content = `Error del agente: ${stderrBuf.slice(0, 500)}`;
    }

    if (!thinkingDone) {
      notifyChatListeners(agentId, { type: 'thinking_done', messageId: assistantMsg.id, thinking: '' });
      notifyChatListeners(agentId, { type: 'message_start', message: assistantMsg });
    }

    if (abortController.signal.aborted) {
      if (!assistantMsg.content) assistantMsg.content = '(Detenido por el usuario)';
      notifyChatListeners(agentId, { type: 'message_done', message: { ...assistantMsg, stopped: true } });
    } else {
      notifyChatListeners(agentId, { type: 'message_done', message: assistantMsg });
      createVersionFromMessage(agentId, userContent);
    }
  } catch (err) {
    if (err.name === 'AbortError' || abortController.signal.aborted) {
      if (!assistantMsg.content) assistantMsg.content = '(Detenido por el usuario)';
      notifyChatListeners(agentId, { type: 'message_done', message: { ...assistantMsg, stopped: true } });
    } else {
      assistantMsg.content = assistantMsg.content || `Error: ${err.message}`;
      notifyChatListeners(agentId, { type: 'message_error', message: assistantMsg, error: err.message });
    }
  } finally {
    activeAbortControllers.delete(agentId);
    activeCursorChildren.delete(agentId);
    agent.status = 'idle';
    agent.updatedAt = new Date().toISOString();
    persistChat(agentId);
  }

  return assistantMsg;
}

// Spawn a plain bash terminal
function spawnShell(agentId, cwd) {
  const shell = process.env.SHELL || '/bin/bash';
  const term = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd,
    env: { ...process.env, TERM: 'xterm-256color', PATH: envPath },
  });

  setupPty(agentId, term);
}

function setupPty(agentId, term) {
  const agent = agents.get(agentId);
  if (agent) {
    agent.pid = term.pid;
    agent.status = 'running';
  }

  term.onData((data) => {
    const buf = outputBuffers.get(agentId);
    if (buf) {
      buf.push(data);
      if (buf.length > MAX_BUFFER_LINES) buf.splice(0, buf.length - MAX_BUFFER_LINES);
    }
    notifyListeners(agentId, data);
  });

  term.onExit(({ exitCode }) => {
    const a = agents.get(agentId);
    if (a) {
      a.status = 'stopped';
      a.updatedAt = new Date().toISOString();
    }
    notifyListeners(agentId, `\r\n[Process exited with code ${exitCode}]\r\n`);
  });

  ptys.set(agentId, term);
}

function notifyListeners(agentId, data) {
  const listeners = dataListeners.get(agentId);
  if (!listeners) return;
  for (const cb of listeners) {
    try { cb(data); } catch { /* skip */ }
  }
}

export function getAgent(id) {
  return agents.get(id) || null;
}

export function getAllAgents() {
  return Array.from(agents.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function updateAgent(id, updates) {
  const agent = agents.get(id);
  if (!agent) return null;
  if (updates.name !== undefined) agent.name = updates.name;
  if (updates.status !== undefined) agent.status = updates.status;
  if (updates.category !== undefined) agent.category = updates.category;
  if (updates.order !== undefined) agent.order = updates.order;
  if (updates.model !== undefined) agent.model = updates.model || null;
  agent.updatedAt = new Date().toISOString();
  agents.set(id, agent);
  scheduleSave();
  return agent;
}

export function getAgentCategories() {
  return [...agentCategories].sort((a, b) => a.order - b.order);
}

export function addAgentCategory(name) {
  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (agentCategories.find((c) => c.id === id)) return null;
  const maxOrder = agentCategories.reduce((m, c) => Math.max(m, c.order), -1);
  const cat = { id, name: name.trim(), order: maxOrder + 1 };
  agentCategories.push(cat);
  scheduleSave();
  return cat;
}

export function updateAgentCategory(catId, name) {
  const cat = agentCategories.find((c) => c.id === catId);
  if (!cat) return null;
  if (name) cat.name = name.trim();
  scheduleSave();
  return cat;
}

export function deleteAgentCategory(catId) {
  if (catId === 'general') return false;
  const idx = agentCategories.findIndex((c) => c.id === catId);
  if (idx === -1) return false;
  agentCategories.splice(idx, 1);
  for (const agent of agents.values()) {
    if (agent.category === catId) agent.category = 'general';
  }
  scheduleSave();
  return true;
}

export function reorderAgents(orderedIds) {
  orderedIds.forEach((id, index) => {
    const agent = agents.get(id);
    if (agent) agent.order = index;
  });
  scheduleSave();
}

export function deleteAgent(id) {
  const agent = agents.get(id);
  if (!agent) return false;

  ensureDataDirs();
  try {
    const archiveData = {
      agent: { ...agent },
      archivedAt: new Date().toISOString(),
    };
    const msgs = chatMessages.get(id);
    if (msgs) archiveData.messages = msgs;
    const versions = agentVersions.get(id);
    if (versions) archiveData.versions = versions;
    writeFileSync(path.join(ARCHIVE_DIR, `${id}.json`), JSON.stringify(archiveData, null, 2), 'utf-8');
  } catch (err) {
    console.error('[agents] Failed to archive agent before delete:', err.message);
  }

  const term = ptys.get(id);
  if (term) {
    try { term.kill(); } catch { /* already dead */ }
    ptys.delete(id);
  }
  dataListeners.delete(id);
  outputBuffers.delete(id);
  queues.delete(id);
  chatMessages.delete(id);
  chatListeners.delete(id);
  cursorSessions.delete(id);
  agentVersions.delete(id);
  const deleted = agents.delete(id);
  scheduleSave();
  try {
    const chatPath = path.join(CHAT_DIR, `${id}.json`);
    if (existsSync(chatPath)) unlinkSync(chatPath);
  } catch { /* ok */ }
  try {
    const versionsPath = path.join(VERSIONS_DIR, `${id}.json`);
    if (existsSync(versionsPath)) unlinkSync(versionsPath);
  } catch { /* ok */ }
  return deleted;
}

export function getArchivedAgents() {
  ensureDataDirs();
  try {
    const files = readdirSync(ARCHIVE_DIR).filter((f) => f.endsWith('.json'));
    return files.map((f) => {
      try {
        const data = JSON.parse(readFileSync(path.join(ARCHIVE_DIR, f), 'utf-8'));
        return { id: data.agent?.id, name: data.agent?.name, type: data.agent?.type, archivedAt: data.archivedAt };
      } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

export function permanentDeleteArchived(archivedId) {
  ensureDataDirs();
  const archivePath = path.join(ARCHIVE_DIR, `${archivedId}.json`);
  if (!existsSync(archivePath)) return false;
  try {
    unlinkSync(archivePath);
    return true;
  } catch { return false; }
}

export function restoreAgent(archivedId) {
  ensureDataDirs();
  const archivePath = path.join(ARCHIVE_DIR, `${archivedId}.json`);
  if (!existsSync(archivePath)) return null;

  try {
    const data = JSON.parse(readFileSync(archivePath, 'utf-8'));
    const saved = data.agent;
    if (!saved || !saved.id) return null;
    if (agents.has(saved.id)) return agents.get(saved.id);

    const agent = {
      id: saved.id,
      name: saved.name || 'Agent',
      type: saved.type || 'conversation',
      status: 'idle',
      cwd: saved.cwd || process.cwd(),
      model: saved.model || null,
      category: saved.category || 'general',
      order: saved.order ?? agentOrderCounter++,
      createdAt: saved.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pid: null,
    };

    agents.set(agent.id, agent);
    outputBuffers.set(agent.id, []);
    dataListeners.set(agent.id, new Set());
    queues.set(agent.id, []);
    chatListeners.set(agent.id, new Set());

    const msgs = Array.isArray(data.messages) ? data.messages : [];
    chatMessages.set(agent.id, msgs);
    persistChat(agent.id);

    const versions = Array.isArray(data.versions) ? data.versions : [];
    agentVersions.set(agent.id, versions);
    persistVersions(agent.id);

    if (agent.type === 'cursor') {
      const cli = findCursorCli();
      if (cli) cursorSessions.set(agent.id, { cli, cwd: agent.cwd, model: agent.model, sessionId: null });
    }

    try { unlinkSync(archivePath); } catch { /* ok */ }
    scheduleSave();
    return agent;
  } catch (err) {
    console.error('[agents] Failed to restore agent:', err.message);
    return null;
  }
}

// ── Versions (auto-created per message, rewindable) ──

export function getVersions(agentId) {
  return agentVersions.get(agentId) || [];
}

export function createVersionFromMessage(agentId, userMessage) {
  const versions = agentVersions.get(agentId);
  const msgs = chatMessages.get(agentId);
  if (!versions || !msgs) return null;

  const lastUserMsg = [...msgs].reverse().find((m) => m.role === 'user');
  if (!lastUserMsg) return null;

  for (const v of versions) v.isCurrent = false;

  const version = {
    id: uuidv4(),
    agentId,
    messageIndex: msgs.length - 1,
    messageId: lastUserMsg.id,
    userMessage: userMessage.slice(0, 200),
    messageCount: msgs.length,
    createdAt: new Date().toISOString(),
    isCurrent: true,
  };
  versions.push(version);
  persistVersions(agentId);
  notifyChatListeners(agentId, { type: 'versions_updated', versions: [...versions] });
  return version;
}

export function rewindToVersion(agentId, versionId) {
  const versions = agentVersions.get(agentId);
  const msgs = chatMessages.get(agentId);
  if (!versions || !msgs) throw new Error('Agent not found');

  const versionIdx = versions.findIndex((v) => v.id === versionId);
  if (versionIdx < 0) throw new Error('Version not found');

  const version = versions[versionIdx];

  msgs.splice(version.messageCount);

  versions.splice(versionIdx + 1);

  for (const v of versions) v.isCurrent = false;
  version.isCurrent = true;

  persistChat(agentId);
  persistVersions(agentId);

  notifyChatListeners(agentId, { type: 'rewind', messages: [...msgs], versions: [...versions] });
  return { version, messages: [...msgs] };
}

export function deleteVersion(agentId, versionId) {
  const versions = agentVersions.get(agentId);
  if (!versions) return false;
  const idx = versions.findIndex((v) => v.id === versionId);
  if (idx < 0) return false;
  versions.splice(idx, 1);
  persistVersions(agentId);
  return true;
}

// Send text to the PTY stdin — for cursor agents this sends a message to the agent,
// for terminal agents it executes a shell command
export function sendCommand(agentId, text) {
  const term = ptys.get(agentId);
  if (!term) return false;
  const agent = agents.get(agentId);
  if (agent) {
    agent.status = 'running';
    agent.updatedAt = new Date().toISOString();
  }
  term.write(text + '\n');
  return true;
}

export function sendRawInput(agentId, data) {
  const term = ptys.get(agentId);
  if (!term) return false;
  term.write(data);
  return true;
}

export function sendSignal(agentId, signal) {
  const term = ptys.get(agentId);
  if (!term) return false;
  if (signal === 'SIGINT') {
    term.write('\x03');
  } else if (signal === 'SIGTSTP') {
    term.write('\x1a');
  } else if (signal === 'EOF') {
    term.write('\x04');
  }
  return true;
}

export function resizePty(agentId, cols, rows) {
  const term = ptys.get(agentId);
  if (!term) return false;
  term.resize(Math.max(cols, 20), Math.max(rows, 5));
  return true;
}

export function getOutputBuffer(agentId) {
  return outputBuffers.get(agentId) || [];
}

export function addDataListener(agentId, callback) {
  const listeners = dataListeners.get(agentId);
  if (!listeners) return false;
  listeners.add(callback);
  return true;
}

export function removeDataListener(agentId, callback) {
  const listeners = dataListeners.get(agentId);
  if (!listeners) return false;
  listeners.delete(callback);
  return true;
}

export function restartAgent(agentId) {
  const agent = agents.get(agentId);
  if (!agent) return false;
  const oldTerm = ptys.get(agentId);
  if (oldTerm) {
    try { oldTerm.kill(); } catch { /* ok */ }
    ptys.delete(agentId);
  }
  outputBuffers.set(agentId, []);
  if (agent.type === 'cursor') {
    initCursorAgent(agentId, agent.cwd, agent.model, null);
  } else {
    spawnShell(agentId, agent.cwd);
  }
  return true;
}

// ── Queue management ──

export function getQueue(agentId) {
  return queues.get(agentId) || [];
}

export function addToQueue(agentId, message, priority = 'normal') {
  const q = queues.get(agentId);
  if (!q) return null;
  const item = {
    id: uuidv4(),
    agentId,
    message,
    priority,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  if (priority === 'high') {
    const firstPending = q.findIndex((i) => i.status === 'pending');
    if (firstPending >= 0) q.splice(firstPending, 0, item);
    else q.push(item);
  } else {
    q.push(item);
  }
  return item;
}

export function removeFromQueue(agentId, itemId) {
  const q = queues.get(agentId);
  if (!q) return false;
  const idx = q.findIndex((i) => i.id === itemId && i.status === 'pending');
  if (idx < 0) return false;
  q.splice(idx, 1);
  return true;
}

export function clearQueue(agentId) {
  const q = queues.get(agentId);
  if (!q) return false;
  const kept = q.filter((i) => i.status === 'processing');
  queues.set(agentId, kept);
  return true;
}

export function peekNextInQueue(agentId) {
  const q = queues.get(agentId);
  if (!q) return null;
  return q.find((i) => i.status === 'pending') || null;
}

export function markQueueItem(agentId, itemId, status) {
  const q = queues.get(agentId);
  if (!q) return null;
  const item = q.find((i) => i.id === itemId);
  if (!item) return null;
  item.status = status;
  if (status === 'done' || status === 'error') {
    item.finishedAt = new Date().toISOString();
  }
  return item;
}

export function reorderQueue(agentId, itemId, direction) {
  const q = queues.get(agentId);
  if (!q) return false;
  const idx = q.findIndex((i) => i.id === itemId && i.status === 'pending');
  if (idx < 0) return false;
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= q.length) return false;
  if (q[targetIdx].status !== 'pending') return false;
  [q[idx], q[targetIdx]] = [q[targetIdx], q[idx]];
  return true;
}

// ── Chat / Conversation ──

const SYSTEM_PROMPT = `Eres un asistente de IA integrado en la plataforma UDAR EDGE. Ayudas a los usuarios con gestión de vehículos, clientes, leads, facturación y operaciones del negocio. Responde de forma concisa y útil en español.`;

export function getChatMessages(agentId) {
  return chatMessages.get(agentId) || [];
}

export function addChatMessage(agentId, role, content) {
  const msgs = chatMessages.get(agentId);
  if (!msgs) return null;
  const msg = {
    id: uuidv4(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
  msgs.push(msg);
  persistChat(agentId);
  return msg;
}

export function clearChatMessages(agentId) {
  const msgs = chatMessages.get(agentId);
  if (!msgs) return false;
  chatMessages.set(agentId, []);
  agentVersions.set(agentId, []);
  persistChat(agentId);
  persistVersions(agentId);
  return true;
}

export function addChatListener(agentId, callback) {
  const listeners = chatListeners.get(agentId);
  if (!listeners) return false;
  listeners.add(callback);
  return true;
}

export function removeChatListener(agentId, callback) {
  const listeners = chatListeners.get(agentId);
  if (!listeners) return false;
  listeners.delete(callback);
  return true;
}

function notifyChatListeners(agentId, event) {
  const listeners = chatListeners.get(agentId);
  if (!listeners) return;
  for (const cb of listeners) {
    try { cb(event); } catch { /* skip */ }
  }
}

export async function sendChatMessage(agentId, userContent, displayContent, attachedFiles) {
  const agent = agents.get(agentId);
  if (!agent) throw new Error('Agent not found');

  const msgs = chatMessages.get(agentId);
  if (!msgs) throw new Error('No chat session');

  const userMsg = addChatMessage(agentId, 'user', displayContent || userContent);
  if (attachedFiles?.length) userMsg.files = attachedFiles;
  notifyChatListeners(agentId, { type: 'message', message: userMsg });

  const internalUserContent = userContent;

  agent.status = 'running';
  agent.updatedAt = new Date().toISOString();

  // Phase 1: Thinking
  notifyChatListeners(agentId, { type: 'thinking_start' });

  const assistantMsg = {
    id: uuidv4(),
    role: 'assistant',
    content: '',
    thinking: '',
    createdAt: new Date().toISOString(),
  };
  msgs.push(assistantMsg);

  const abortController = new AbortController();
  activeAbortControllers.set(agentId, abortController);

  try {
    if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const historyMsgs = msgs
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content))
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    if (historyMsgs.length > 0 && internalUserContent !== (displayContent || userContent)) {
      historyMsgs[historyMsgs.length - 1] = { role: 'user', content: internalUserContent };
    }

    const openaiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...historyMsgs,
    ];

    const model = agent.model || 'gpt-4o-mini';

    let thinkingSummary = '';
    try {
      const thinkingResponse = await getOpenAI().chat.completions.create({
        model,
        messages: [
          ...openaiMessages,
          { role: 'user', content: 'Antes de responder, genera un breve resumen interno (2-3 frases cortas) de tu razonamiento sobre cómo abordar la pregunta del usuario. Solo el razonamiento, sin la respuesta final. Escribe en primera persona.' },
        ],
        max_tokens: 150,
        temperature: 0.7,
      });
      thinkingSummary = thinkingResponse.choices?.[0]?.message?.content || '';
    } catch {
      thinkingSummary = 'Analizando la consulta del usuario...';
    }

    if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

    assistantMsg.thinking = thinkingSummary;
    notifyChatListeners(agentId, { type: 'thinking_done', messageId: assistantMsg.id, thinking: thinkingSummary });

    notifyChatListeners(agentId, { type: 'message_start', message: assistantMsg });

    const stream = await getOpenAI().chat.completions.create({
      model,
      messages: openaiMessages,
      stream: true,
      max_tokens: 2048,
    });

    for await (const chunk of stream) {
      if (abortController.signal.aborted) {
        stream.controller?.abort?.();
        break;
      }
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        assistantMsg.content += delta;
        notifyChatListeners(agentId, { type: 'chunk', messageId: assistantMsg.id, delta });
      }
    }

    if (abortController.signal.aborted) {
      if (!assistantMsg.content) assistantMsg.content = '(Detenido por el usuario)';
      notifyChatListeners(agentId, { type: 'message_done', message: { ...assistantMsg, stopped: true } });
    } else {
      notifyChatListeners(agentId, { type: 'message_done', message: assistantMsg });
      createVersionFromMessage(agentId, internalUserContent);
    }
  } catch (err) {
    if (err.name === 'AbortError' || abortController.signal.aborted) {
      if (!assistantMsg.content) assistantMsg.content = '(Detenido por el usuario)';
      notifyChatListeners(agentId, { type: 'message_done', message: { ...assistantMsg, stopped: true } });
    } else {
      assistantMsg.content = assistantMsg.content || `Error: ${err.message}`;
      notifyChatListeners(agentId, { type: 'message_error', message: assistantMsg, error: err.message });
    }
  } finally {
    activeAbortControllers.delete(agentId);
    agent.status = 'idle';
    agent.updatedAt = new Date().toISOString();
    persistChat(agentId);
  }

  return assistantMsg;
}

function resetOpenAI() { _openai = null; }

export function stopAgentChat(agentId) {
  const ac = activeAbortControllers.get(agentId);
  if (ac) ac.abort();

  const child = activeCursorChildren.get(agentId);
  if (child) {
    try { child.kill('SIGTERM'); } catch { /* best effort */ }
    activeCursorChildren.delete(agentId);
  }

  const agent = agents.get(agentId);
  if (agent && agent.status === 'running') {
    agent.status = 'idle';
    agent.updatedAt = new Date().toISOString();
  }
  return !!ac || !!child;
}

export function getAgentRunStatus(agentId) {
  const agent = agents.get(agentId);
  if (!agent) return null;
  return {
    status: agent.status || 'idle',
    isProcessing: activeAbortControllers.has(agentId),
    updatedAt: agent.updatedAt,
  };
}

export { flushPendingSave, resetOpenAI };
