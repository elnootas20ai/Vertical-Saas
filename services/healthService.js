/**
 * I-03: Health check robusto.
 *
 * Comprobaciones incluidas:
 *   couchdb     — /_up + versión de CouchDB
 *   databases   — sondeo de las DBs clave (docCount, latencia individual)
 *   memory      — heap y sistema con estados ok / warn / critical
 *   disk        — uso de disco con estados ok / warn / critical
 *   process     — uptime, PID, nodeVersion, loadAvg (1m / 5m / 15m), cpuCount
 *   connections — sockets TCP activos
 *   latency     — P50 / P95 / P99 de las últimas LATENCY_WINDOW requests
 *
 * Estados de severidad:
 *   ok       → todo nominal
 *   degraded → alguna comprobación en estado warn (200 con advertencias)
 *   down     → al menos una comprobación crítica falla (503)
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

function bytesToMB(b) {
  return Number((b / 1_048_576).toFixed(2));
}

// ── Rolling latency tracker ───────────────────────────────────────────────────
const LATENCY_WINDOW = 500;
const _latBuf   = new Array(LATENCY_WINDOW).fill(0);
let   _latHead  = 0;
let   _latCount = 0;

/**
 * Registra la latencia de respuesta de una request (en ms).
 * Llamar desde el middleware de logging de requests en index.js.
 */
export function recordLatency(ms) {
  _latBuf[_latHead] = ms;
  _latHead = (_latHead + 1) % LATENCY_WINDOW;
  if (_latCount < LATENCY_WINDOW) _latCount++;
}

function computeLatencyStats() {
  if (_latCount === 0) return { p50: 0, p95: 0, p99: 0, samples: 0 };
  const sample = _latBuf.slice(0, _latCount).sort((a, b) => a - b);
  const pct = (p) => sample[Math.max(0, Math.ceil((p / 100) * sample.length) - 1)];
  return { p50: pct(50), p95: pct(95), p99: pct(99), samples: _latCount };
}

// ── Thresholds ────────────────────────────────────────────────────────────────
const MEMORY_WARN_PCT = Number(process.env.HEALTH_MEMORY_WARN_PCT  ?? 80);
const MEMORY_CRIT_PCT = Number(process.env.HEALTH_MEMORY_CRIT_PCT  ?? 90);
const DISK_WARN_PCT   = Number(process.env.HEALTH_DISK_WARN_PCT    ?? 75);
const DISK_CRIT_PCT   = Number(process.env.HEALTH_DISK_CRIT_PCT    ?? 90);
const COUCH_TIMEOUT   = Number(process.env.HEALTH_COUCH_TIMEOUT_MS ?? 5000);

// ── Databases to probe ────────────────────────────────────────────────────────
function getKeyDbs() {
  const prefix = (process.env.VITE_COUCHDB_DB || 'vertial').replace(/\/+$/, '');
  return [
    'accounts',
    'businesses',
    'vehicles',
    'notifications',
    `${prefix}-sales`,
    `${prefix}-clients`,
    `${prefix}-leads`,
  ];
}

// ── CouchDB checks ────────────────────────────────────────────────────────────
async function checkCouchUp(baseUrl, authHeader) {
  if (!baseUrl) return { ok: false, error: 'COUCHDB_URL no configurado', ms: 0 };

  const t0 = Date.now();
  try {
    const res = await fetch(`${baseUrl}/_up`, {
      signal: AbortSignal.timeout(COUCH_TIMEOUT),
      headers: authHeader ? { Authorization: authHeader } : {},
    });
    const ms = Date.now() - t0;

    // Fetch CouchDB version from root endpoint (low-cost, cached in most proxies)
    let version = null;
    try {
      const root = await fetch(baseUrl, {
        signal: AbortSignal.timeout(3000),
        headers: authHeader ? { Authorization: authHeader } : {},
      }).then((r) => r.json());
      version = root?.version ?? null;
    } catch { /* non-critical */ }

    return { ok: res.ok, httpStatus: res.status, ms, version };
  } catch (err) {
    return { ok: false, error: err.message, ms: Date.now() - t0 };
  }
}

async function probeDb(baseUrl, authHeader, dbName) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${baseUrl}/${encodeURIComponent(dbName)}`, {
      signal: AbortSignal.timeout(3000),
      headers: authHeader ? { Authorization: authHeader } : {},
    });
    const ms = Date.now() - t0;

    if (res.ok) {
      const info = await res.json().catch(() => ({}));
      return {
        ok: true,
        ms,
        docCount:     info.doc_count     ?? null,
        deletedCount: info.doc_del_count ?? null,
        diskSizeMB:   info.sizes?.file   ? bytesToMB(info.sizes.file)   : null,
        dataSizeMB:   info.sizes?.active ? bytesToMB(info.sizes.active) : null,
      };
    }
    // 404 → DB no existe aún, estado neutro (no falla, sólo ausente)
    return { ok: res.status === 404 ? null : false, httpStatus: res.status, ms };
  } catch (err) {
    return { ok: false, error: err.message, ms: Date.now() - t0 };
  }
}

// ── System checks ─────────────────────────────────────────────────────────────
function checkMemory() {
  const mem      = process.memoryUsage();
  const totalSys = os.totalmem();
  const freeSys  = os.freemem();
  const sysPct   = Number((((totalSys - freeSys) / totalSys) * 100).toFixed(1));
  const heapPct  = Number(((mem.heapUsed  / mem.heapTotal) * 100).toFixed(1));

  let state = 'ok';
  if (sysPct >= MEMORY_CRIT_PCT || heapPct >= MEMORY_CRIT_PCT) state = 'critical';
  else if (sysPct >= MEMORY_WARN_PCT || heapPct >= MEMORY_WARN_PCT)  state = 'warn';

  return {
    ok: state !== 'critical',
    state,
    systemUsedPct:  sysPct,
    heapUsedPct:    heapPct,
    heapUsedMB:     bytesToMB(mem.heapUsed),
    heapTotalMB:    bytesToMB(mem.heapTotal),
    rssMB:          bytesToMB(mem.rss),
    externalMB:     bytesToMB(mem.external),
    freeSystemMB:   bytesToMB(freeSys),
    totalSystemMB:  bytesToMB(totalSys),
    thresholds: { warnPct: MEMORY_WARN_PCT, critPct: MEMORY_CRIT_PCT },
  };
}

function checkDisk(dir) {
  try {
    const st      = fs.statfsSync(dir);
    const total   = st.bsize * st.blocks;
    const free    = st.bsize * st.bfree;
    const usedPct = Number((((total - free) / total) * 100).toFixed(1));

    let state = 'ok';
    if (usedPct >= DISK_CRIT_PCT) state = 'critical';
    else if (usedPct >= DISK_WARN_PCT) state = 'warn';

    return {
      ok: state !== 'critical',
      state,
      usedPct,
      freeMB:  bytesToMB(free),
      totalMB: bytesToMB(total),
      thresholds: { warnPct: DISK_WARN_PCT, critPct: DISK_CRIT_PCT },
    };
  } catch {
    return { ok: true, state: 'ok', note: 'statfs no disponible en este sistema' };
  }
}

function checkProcess() {
  const [l1, l5, l15] = os.loadavg();
  const cpus = os.cpus().length;

  return {
    ok: true,
    uptimeSeconds:  Math.floor(process.uptime()),
    pid:            process.pid,
    nodeVersion:    process.version,
    loadAvg1m:      Number(l1.toFixed(2)),
    loadAvg5m:      Number(l5.toFixed(2)),
    loadAvg15m:     Number(l15.toFixed(2)),
    cpuCount:       cpus,
    loadNormalized: Number((l1 / cpus).toFixed(2)),
  };
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Ejecuta todas las comprobaciones de salud y devuelve el resultado agregado.
 *
 * @param {{ baseUrl: string, authHeader: string, activeSockets?: number }} opts
 * @returns {Promise<{ ok: boolean, degraded: boolean, service: string, time: string, checks: object }>}
 *
 * Semántica de respuesta HTTP:
 *   ok=true  + degraded=false → 200 (todo nominal)
 *   ok=true  + degraded=true  → 200 (operativo pero con advertencias)
 *   ok=false                  → 503 (fallo crítico)
 */
export async function runHealthCheck({ baseUrl, authHeader, activeSockets = 0 }) {
  const checks       = {};
  let criticalFail   = false;
  let hasWarnings    = false;

  // ── CouchDB /_up + versión ────────────────────────────────────────────────
  const couchUp = await checkCouchUp(baseUrl, authHeader);
  checks.couchdb = couchUp;
  if (!couchUp.ok) criticalFail = true;

  // ── Sondeo de DBs individuales (informativo, no bloquea overallOk) ────────
  if (baseUrl) {
    const dbResults = {};
    await Promise.allSettled(
      getKeyDbs().map(async (db) => {
        dbResults[db] = await probeDb(baseUrl, authHeader, db);
      }),
    );
    checks.databases = dbResults;
  }

  // ── Memoria ───────────────────────────────────────────────────────────────
  const mem = checkMemory();
  checks.memory = mem;
  // En desarrollo Node suele acercar heapUsed al heapTotal asignado sin que eso
  // implique caída real del servicio; marcamos warn/degraded pero no 503.
  if (process.env.NODE_ENV === 'development' && mem.state === 'critical') {
    hasWarnings = true;
  } else if (!mem.ok) {
    criticalFail = true;
  } else if (mem.state === 'warn') {
    hasWarnings = true;
  }

  // ── Disco ─────────────────────────────────────────────────────────────────
  const disk = checkDisk(path.resolve(__dirname, '..'));
  checks.disk = disk;
  if (!disk.ok) criticalFail = true;
  else if (disk.state === 'warn') hasWarnings = true;

  // ── Proceso (uptime, PID, load average) ──────────────────────────────────
  checks.process = checkProcess();

  // ── Conexiones TCP activas ────────────────────────────────────────────────
  checks.connections = { ok: true, activeSockets };

  // ── Latencia de requests (P50 / P95 / P99) ───────────────────────────────
  checks.latency = computeLatencyStats();

  return {
    ok:       !criticalFail,
    degraded: !criticalFail && hasWarnings,
    service:  'express-backend',
    time:     new Date().toISOString(),
    checks,
  };
}
