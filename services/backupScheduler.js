/**
 * I-05: Backup automático de CouchDB con compresión gzip, rotación y alertas.
 *
 * Variables de entorno:
 *   BACKUP_ENABLED          = true | false           (default: true)
 *   BACKUP_DIR              = ruta absoluta           (default: <project>/backups)
 *   BACKUP_INTERVAL_HOURS   = número entero           (default: 24)
 *   BACKUP_RETENTION_COUNT  = número de backups a conservar (default: 7)
 *   BACKUP_STARTUP_DELAY_MS = ms para el primer backup tras arranque (default: 300000 = 5 min)
 *
 * Comportamiento:
 *   1. Exporta todas las DBs no-sistema de CouchDB a un único archivo .json.gz
 *   2. Aplica rotación: elimina los más antiguos si se supera BACKUP_RETENTION_COUNT
 *   3. Registra estado en backupState (consultable vía /api/backup/status)
 *   4. Loguea a nivel error en caso de fallo crítico (el alerting externo
 *      (ej. PagerDuty, Grafana) debe escuchar los logs estructurados con tag=BACKUP)
 */
import fs   from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable }  from 'node:stream';
import logger from './logger.js';
import { getCouchConfig, buildCouchAuthHeader } from './couchdb.js';
import { sendAdminAlert } from './adminAlerts.js';
import { escapeAdminHtml } from './adminAlertEmail.js';

const BACKUP_DIR       = process.env.BACKUP_DIR             || path.resolve(process.cwd(), 'backups');
const INTERVAL_HOURS   = Math.max(1, Number(process.env.BACKUP_INTERVAL_HOURS  ?? 24));
const RETENTION_COUNT  = Math.max(1, Number(process.env.BACKUP_RETENTION_COUNT ?? 7));
const STARTUP_DELAY_MS = Number(process.env.BACKUP_STARTUP_DELAY_MS ?? 5 * 60 * 1000);
const BACKUP_ENABLED   = process.env.BACKUP_ENABLED !== 'false';

// ── Estado persistente en memoria ─────────────────────────────────────────────
const backupState = {
  enabled:       BACKUP_ENABLED,
  intervalHours: INTERVAL_HOURS,
  retentionCount: RETENTION_COUNT,
  backupDir:     BACKUP_DIR,
  lastRunAt:     null,
  lastStatus:    null, // 'success' | 'failed' | 'skipped'
  lastError:     null,
  lastFilePath:  null,
  lastFileSizeKB: null,
  totalRuns:     0,
  successRuns:   0,
  failedRuns:    0,
};

/** Devuelve una copia del estado actual del scheduler (para el endpoint /api/backup/status). */
export function getBackupState() {
  return { ...backupState };
}

// ── CouchDB helpers ───────────────────────────────────────────────────────────
function getCouchBase() {
  const { baseUrl } = getCouchConfig(null);
  return (baseUrl || '').replace(/\/+$/, '');
}

function getCouchAuthHeader() {
  return buildCouchAuthHeader(null);
}

async function couchFetch(urlPath, init = {}) {
  const base = getCouchBase();
  if (!base) throw new Error('COUCHDB_URL no configurado — backup no disponible');
  const auth = getCouchAuthHeader();
  const res = await fetch(`${base}${urlPath}`, {
    ...init,
    headers: {
      ...(auth ? { Authorization: auth } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(60_000),
  });
  return res;
}

async function listUserDbs() {
  const res = await couchFetch('/_all_dbs');
  if (!res.ok) throw new Error(`CouchDB /_all_dbs → HTTP ${res.status}`);
  const all = await res.json();
  return all.filter((n) => !n.startsWith('_'));
}

async function exportDbDocs(dbName) {
  const res = await couchFetch(`/${encodeURIComponent(dbName)}/_all_docs?include_docs=true`);
  if (!res.ok) throw new Error(`CouchDB /${dbName}/_all_docs → HTTP ${res.status}`);
  const payload = await res.json();
  const docs = (payload.rows ?? []).map((r) => r.doc).filter(Boolean);
  return { database: dbName, exportedAt: new Date().toISOString(), docCount: docs.length, docs };
}

// ── File helpers ──────────────────────────────────────────────────────────────
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function writeGzip(filePath, data) {
  const jsonStr = JSON.stringify(data);
  const readable = Readable.from([jsonStr]);
  const gzip     = zlib.createGzip({ level: 6 });
  const dest     = fs.createWriteStream(filePath);
  await pipeline(readable, gzip, dest);
}

/**
 * Aplica la política de retención: elimina los backups más antiguos
 * hasta dejar sólo RETENTION_COUNT.
 * @returns {{ kept: number, deleted: number }}
 */
function rotateBackups(backupDir) {
  let files;
  try {
    files = fs.readdirSync(backupDir)
      .filter((f) => f.endsWith('.json.gz') && f.startsWith('couchdb-backup-'))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime); // más reciente primero
  } catch {
    return { kept: 0, deleted: 0 };
  }

  const toDelete = files.slice(RETENTION_COUNT);
  let deleted = 0;

  for (const file of toDelete) {
    try {
      fs.unlinkSync(path.join(backupDir, file.name));
      deleted++;
      logger.info({ tag: 'BACKUP', file: file.name }, 'Backup antiguo eliminado (rotación)');
    } catch (err) {
      logger.warn({ tag: 'BACKUP', file: file.name, err: err.message }, 'No se pudo eliminar backup antiguo');
    }
  }

  return { kept: files.length - deleted, deleted };
}

// ── Core backup logic ─────────────────────────────────────────────────────────
/**
 * Ejecuta un backup completo de CouchDB de forma síncrona (bloqueante por await).
 * Puede llamarse manualmente desde el endpoint POST /api/backup/run.
 *
 * @returns {Promise<{ ok: boolean, file?: string, fileSizeKB?: number, dbs: number, docs: number, elapsedMs: number, rotation: object }>}
 */
export async function runBackup() {
  if (!BACKUP_ENABLED) {
    logger.debug({ tag: 'BACKUP' }, 'Backup omitido — BACKUP_ENABLED=false');
    backupState.lastStatus = 'skipped';
    return { ok: false, skipped: true };
  }

  const startedAt  = new Date();
  const dateStr    = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName   = `couchdb-backup-${dateStr}.json.gz`;
  const filePath   = path.join(BACKUP_DIR, fileName);

  backupState.totalRuns++;
  backupState.lastRunAt  = startedAt.toISOString();
  backupState.lastStatus = 'running';
  backupState.lastError  = null;

  logger.info({ tag: 'BACKUP', dir: BACKUP_DIR, file: fileName }, 'Iniciando backup automático de CouchDB');

  try {
    ensureDir(BACKUP_DIR);

    const dbNames = await listUserDbs();
    const allData = {
      backupAt:  startedAt.toISOString(),
      databases: {},
      stats:     { dbCount: dbNames.length, totalDocs: 0, failedDbs: [] },
    };

    // Export each DB; errors per DB are soft-failures (warn, not throw)
    for (const db of dbNames) {
      try {
        const data = await exportDbDocs(db);
        allData.databases[db]     = data;
        allData.stats.totalDocs  += data.docCount;
        logger.debug({ tag: 'BACKUP', db, docs: data.docCount }, 'DB exportada');
      } catch (err) {
        logger.warn({ tag: 'BACKUP', db, err: err.message }, 'Error exportando DB individual (continuando)');
        allData.databases[db] = { skipped: true, error: err.message };
        allData.stats.failedDbs.push(db);
      }
    }

    await writeGzip(filePath, allData);

    const fileSizeBytes = fs.statSync(filePath).size;
    const fileSizeKB    = Number((fileSizeBytes / 1024).toFixed(1));
    const rotation      = rotateBackups(BACKUP_DIR);
    const elapsedMs     = Date.now() - startedAt.getTime();

    backupState.lastStatus   = 'success';
    backupState.lastFilePath  = filePath;
    backupState.lastFileSizeKB = fileSizeKB;
    backupState.successRuns++;

    logger.info({
      tag: 'BACKUP',
      file:       fileName,
      fileSizeKB,
      dbs:        dbNames.length,
      failedDbs:  allData.stats.failedDbs,
      docs:       allData.stats.totalDocs,
      elapsedMs,
      rotation,
    }, 'Backup completado con éxito');

    return {
      ok: true,
      file:      fileName,
      filePath,
      fileSizeKB,
      dbs:       dbNames.length,
      failedDbs: allData.stats.failedDbs,
      docs:      allData.stats.totalDocs,
      elapsedMs,
      rotation,
    };

  } catch (err) {
    backupState.lastStatus  = 'failed';
    backupState.lastError   = err.message;
    backupState.failedRuns++;

    // Eliminar archivo parcial si existe
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* noop */ }

    // Nivel ERROR para que sistemas de alertas externos (Grafana, etc.) lo capturen
    logger.error({
      tag:      'BACKUP',
      err:      err.message,
      filePath,
    }, 'Error crítico en backup automático — revisar inmediatamente');

    sendAdminAlert({
      key: 'backup_failed',
      subject: '🚨 Vertial: fallo backup CouchDB',
      html: `<p><b>No se pudo completar el backup automático.</b></p>
<ul>
  <li><b>Error</b>: ${escapeAdminHtml(err.message)}</li>
  <li><b>Directorio</b>: ${escapeAdminHtml(BACKUP_DIR)}</li>
</ul>
<p>Revisa espacio en disco, credenciales CouchDB y logs del contenedor <code>app</code>.</p>`,
      cooldownMs: Number(process.env.ALERT_BACKUP_FAIL_COOLDOWN_MS || 60 * 60_000),
    }).catch(() => null);

    throw err;
  }
}

function checkBackupStaleness() {
  if (!BACKUP_ENABLED) return;

  const maxAgeHours = Number(process.env.ALERT_BACKUP_MAX_AGE_HOURS || INTERVAL_HOURS + 2);
  const maxAgeMs = Math.max(1, maxAgeHours) * 3_600_000;

  if (!backupState.lastRunAt) {
    const uptimeMs = Number(process.uptime?.() || 0) * 1000;
    if (uptimeMs < STARTUP_DELAY_MS + maxAgeMs) return;
    sendAdminAlert({
      key: 'backup_stale',
      subject: '⚠️ Vertial: sin backup CouchDB registrado',
      html: `<p>El scheduler está activo pero <b>no hay ningún backup completado</b> desde el arranque.</p>
<ul><li><b>Directorio</b>: ${escapeAdminHtml(BACKUP_DIR)}</li></ul>`,
      cooldownMs: Number(process.env.ALERT_BACKUP_STALE_COOLDOWN_MS || 6 * 60 * 60_000),
    }).catch(() => null);
    return;
  }

  const ageMs = Date.now() - new Date(backupState.lastRunAt).getTime();
  if (backupState.lastStatus === 'success' && ageMs <= maxAgeMs) return;

  const lastLabel = backupState.lastStatus || 'desconocido';
  sendAdminAlert({
    key: 'backup_stale',
    subject: '⚠️ Vertial: backup CouchDB desactualizado',
    html: `<p>El último backup no es reciente o no fue exitoso.</p>
<ul>
  <li><b>Último estado</b>: ${escapeAdminHtml(lastLabel)}</li>
  <li><b>Última ejecución</b>: ${escapeAdminHtml(backupState.lastRunAt)}</li>
  <li><b>Umbral</b>: ${maxAgeHours} h</li>
  ${backupState.lastError ? `<li><b>Error</b>: ${escapeAdminHtml(backupState.lastError)}</li>` : ''}
</ul>`,
    cooldownMs: Number(process.env.ALERT_BACKUP_STALE_COOLDOWN_MS || 6 * 60 * 60_000),
  }).catch(() => null);
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
/**
 * Inicia el scheduler de backups. Llamar una sola vez al arrancar el servidor.
 * El primer backup se ejecuta tras BACKUP_STARTUP_DELAY_MS (default 5 min)
 * para no bloquear el arranque inicial.
 */
export function startBackupScheduler() {
  if (!BACKUP_ENABLED) {
    logger.info({ tag: 'BACKUP' }, 'Scheduler de backup deshabilitado (BACKUP_ENABLED=false)');
    return;
  }

  const intervalMs = INTERVAL_HOURS * 3_600_000;

  logger.info(
    {
      tag:           'BACKUP',
      intervalHours: INTERVAL_HOURS,
      retention:     RETENTION_COUNT,
      dir:           BACKUP_DIR,
      startupDelayS: Math.round(STARTUP_DELAY_MS / 1000),
    },
    'Scheduler de backup CouchDB iniciado',
  );

  // Primer backup: tras el delay de startup para no interferir con el arranque
  setTimeout(
    () => runBackup().catch((err) =>
      logger.error({ tag: 'BACKUP', err: err.message }, 'Fallo en backup inicial programado'),
    ),
    STARTUP_DELAY_MS,
  );

  // Backups periódicos
  setInterval(
    () => runBackup().catch((err) =>
      logger.error({ tag: 'BACKUP', err: err.message }, 'Fallo en backup periódico'),
    ),
    intervalMs,
  );

  const staleCheckMs = Number(process.env.ALERT_BACKUP_STALE_CHECK_MS || 60 * 60_000);
  setInterval(() => checkBackupStaleness(), staleCheckMs);
}
