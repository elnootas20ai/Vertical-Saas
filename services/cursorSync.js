/**
 * Servicio de sincronización de datos de Cursor IDE a CouchDB.
 * Sincroniza: conversaciones (agent-transcripts), terminales y configuración de agentes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from './logger.js';

const log = getLogger({ tag: 'CURSOR-SYNC' });

const CURSOR_BASE = '/root/.cursor/projects/var-www-backend';
const TRANSCRIPTS_DIR = path.join(CURSOR_BASE, 'agent-transcripts');
const TERMINALS_DIR = path.join(CURSOR_BASE, 'terminals');

const DB_CONVERSATIONS = 'cursor_conversations';
const DB_TERMINALS = 'cursor_terminals';

function getCouchConfigDirect() {
  const baseUrl = (process.env.COUCHDB_URL || process.env.VITE_COUCHDB_URL || '').replace(/\/+$/, '');
  const username = process.env.COUCHDB_USER || process.env.VITE_COUCHDB_USER || '';
  const password = process.env.COUCHDB_PASSWORD || process.env.VITE_COUCHDB_PASSWORD || '';
  return { baseUrl, username, password };
}

function buildAuth() {
  const { username, password } = getCouchConfigDirect();
  if (!username || !password) return '';
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function couchFetch(pathname, init = {}) {
  const { baseUrl } = getCouchConfigDirect();
  if (!baseUrl) throw new Error('CouchDB URL no configurada');
  const auth = buildAuth();
  return fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
      ...(init.headers || {}),
    },
  });
}

async function ensureDb(name) {
  const res = await couchFetch(`/${encodeURIComponent(name)}`, { method: 'PUT' });
  if (![201, 202, 412].includes(res.status)) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`No se pudo crear DB ${name}: ${body.reason || body.error || res.status}`);
  }
}

async function getDoc(db, id) {
  const res = await couchFetch(`/${encodeURIComponent(db)}/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

async function putDoc(db, id, doc) {
  const existing = await getDoc(db, id);
  const body = { ...doc, _id: id };
  if (existing?._rev) body._rev = existing._rev;
  const res = await couchFetch(`/${encodeURIComponent(db)}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return res.json();
}

function parseTranscriptJsonl(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    if (!content) return [];
    return content.split('\n').map((line, i) => {
      try { return JSON.parse(line); }
      catch { return { role: 'unknown', message: { content: line }, lineIndex: i }; }
    });
  } catch { return []; }
}

function extractTitle(messages) {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return 'Sin título';
  const text = Array.isArray(firstUser.message?.content)
    ? firstUser.message.content.find(c => c.type === 'text')?.text || ''
    : String(firstUser.message?.content || '');

  const cleaned = text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 120) || 'Sin título';
}

function parseTerminalFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const meta = {};
    let bodyStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === '---') {
        if (bodyStart === 0) { bodyStart = i + 1; continue; }
        bodyStart = i + 1;
        break;
      }
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) meta[match[1]] = match[2];
    }

    return {
      pid: meta.pid || null,
      cwd: meta.cwd || null,
      active_command: meta.active_command || null,
      last_command: meta.last_command || null,
      last_exit_code: meta.last_exit_code || null,
      output: lines.slice(bodyStart).join('\n'),
      output_lines: lines.length - bodyStart,
    };
  } catch { return null; }
}

export async function syncConversations() {
  if (!fs.existsSync(TRANSCRIPTS_DIR)) {
    log.warn('Directorio de transcripciones no encontrado: %s', TRANSCRIPTS_DIR);
    return { synced: 0, errors: 0 };
  }

  let synced = 0, errors = 0;
  const entries = fs.readdirSync(TRANSCRIPTS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const uuid = entry.name;
    const mainFile = path.join(TRANSCRIPTS_DIR, uuid, `${uuid}.jsonl`);

    if (!fs.existsSync(mainFile)) continue;

    try {
      const stat = fs.statSync(mainFile);
      const existing = await getDoc(DB_CONVERSATIONS, uuid);

      if (existing && existing.file_mtime === stat.mtimeMs) continue;

      const messages = parseTranscriptJsonl(mainFile);
      const title = extractTitle(messages);

      const subagentsDir = path.join(TRANSCRIPTS_DIR, uuid, 'subagents');
      const subagents = [];
      if (fs.existsSync(subagentsDir)) {
        const subFiles = fs.readdirSync(subagentsDir).filter(f => f.endsWith('.jsonl'));
        for (const sf of subFiles) {
          const subMessages = parseTranscriptJsonl(path.join(subagentsDir, sf));
          subagents.push({
            id: sf.replace('.jsonl', ''),
            message_count: subMessages.length,
            messages: subMessages.slice(0, 50),
          });
        }
      }

      await putDoc(DB_CONVERSATIONS, uuid, {
        type: 'conversation',
        uuid,
        title,
        message_count: messages.length,
        messages,
        subagents,
        file_mtime: stat.mtimeMs,
        file_size: stat.size,
        synced_at: new Date().toISOString(),
        created_at: existing?.created_at || stat.birthtime?.toISOString() || stat.mtime.toISOString(),
        updated_at: stat.mtime.toISOString(),
      });
      synced++;
    } catch (err) {
      log.error({ err, uuid }, 'Error sincronizando conversación');
      errors++;
    }
  }

  return { synced, errors, total: entries.filter(e => e.isDirectory()).length };
}

export async function syncTerminals() {
  if (!fs.existsSync(TERMINALS_DIR)) {
    log.warn('Directorio de terminales no encontrado: %s', TERMINALS_DIR);
    return { synced: 0, errors: 0 };
  }

  let synced = 0, errors = 0;
  const files = fs.readdirSync(TERMINALS_DIR).filter(f => f.endsWith('.txt'));

  for (const file of files) {
    const filePath = path.join(TERMINALS_DIR, file);
    const id = `terminal_${file.replace('.txt', '')}`;

    try {
      const stat = fs.statSync(filePath);
      const existing = await getDoc(DB_TERMINALS, id);

      if (existing && existing.file_mtime === stat.mtimeMs) continue;

      const parsed = parseTerminalFile(filePath);
      if (!parsed) continue;

      await putDoc(DB_TERMINALS, id, {
        type: 'terminal',
        terminal_id: file.replace('.txt', ''),
        filename: file,
        ...parsed,
        file_mtime: stat.mtimeMs,
        file_size: stat.size,
        synced_at: new Date().toISOString(),
        updated_at: stat.mtime.toISOString(),
      });
      synced++;
    } catch (err) {
      log.error({ err, file }, 'Error sincronizando terminal');
      errors++;
    }
  }

  return { synced, errors, total: files.length };
}

export async function syncAll() {
  log.info('Iniciando sincronización de Cursor a CouchDB...');
  const results = {};

  try {
    await ensureDb(DB_CONVERSATIONS);
    await ensureDb(DB_TERMINALS);
  } catch (err) {
    log.error({ err }, 'Error asegurando bases de datos');
    return { error: err.message };
  }

  results.conversations = await syncConversations();
  results.terminals = await syncTerminals();

  log.info(results, 'Sincronización completada');
  return results;
}

let syncInterval = null;

export function startCursorSync(intervalMs = 60_000) {
  syncAll().catch(err => log.error({ err }, 'Error en sincronización inicial'));

  syncInterval = setInterval(() => {
    syncAll().catch(err => log.error({ err }, 'Error en sincronización periódica'));
  }, intervalMs);

  log.info('Sincronización de Cursor programada cada %d ms', intervalMs);
  return syncInterval;
}

export function stopCursorSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    log.info('Sincronización de Cursor detenida');
  }
}

export { DB_CONVERSATIONS, DB_TERMINALS };
