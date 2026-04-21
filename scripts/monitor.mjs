#!/usr/bin/env node
/**
 * Monitor local: puertos de frontend (Vite) y backend (Express), estado y último error.
 *
 * Puertos:
 *   - Backend: PORT en .env (por defecto 3001, igual que index.js)
 *   - Frontend: MONITOR_FRONTEND_PORT o VITE_DEV_SERVER_PORT, o 3005 (vite.config.ts)
 *
 * Variables opcionales: MONITOR_INTERVAL_MS (ms entre refrescos, default 2000)
 */
import '../config/env.js';

const FRONTEND_PORT = Number(
  process.env.MONITOR_FRONTEND_PORT || process.env.VITE_DEV_SERVER_PORT || 3005,
);
const BACKEND_PORT = Number(process.env.PORT || 3001);
const INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_MS || 2000);
const FETCH_MS = 15000;

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

/** Mensaje legible para fallos de red (fetch en Node). */
function formatFetchError(e) {
  const msg = e.cause?.message || e.message || String(e);
  const code = e.code || e.cause?.code || '';
  if (code === 'ECONNREFUSED' || /ECONNREFUSED/i.test(msg)) {
    return 'ECONNREFUSED — nadie escucha en ese puerto (¿npm run dev / backend arrancado?)';
  }
  if (code === 'ENOTFOUND') return 'ENOTFOUND — host no resuelto';
  if (e.name === 'AbortError' || code === 'TimeoutError' || /timeout/i.test(msg)) {
    return 'Timeout — sin respuesta en el tiempo esperado';
  }
  const name = e.name || 'Error';
  return `${name}: ${msg}`;
}

function summarizeHealthFailure(body) {
  if (!body || typeof body !== 'object') return 'respuesta 503 sin JSON válido';
  const checks = body.checks || {};
  const parts = [];
  if (checks.couchdb && !checks.couchdb.ok) {
    parts.push(
      `CouchDB: ${checks.couchdb.error ?? checks.couchdb.httpStatus ?? 'fallo'}`,
    );
  }
  if (checks.memory && !checks.memory.ok) parts.push(`Memoria: ${checks.memory.state}`);
  if (checks.disk && !checks.disk.ok) parts.push(`Disco: ${checks.disk.state}`);
  return parts.length ? parts.join(' | ') : 'fallo crítico (revisa checks en /health)';
}

async function checkFrontend() {
  const url = `http://127.0.0.1:${FRONTEND_PORT}/`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_MS),
      headers: { Accept: 'text/html' },
    });
    if (res.status >= 200 && res.status < 400) {
      return { ok: true, status: res.status, degraded: false, lastError: null };
    }
    return {
      ok: false,
      status: res.status,
      degraded: false,
      lastError: `HTTP ${res.status} en ${url}`,
    };
  } catch (e) {
    return { ok: false, status: null, degraded: false, lastError: formatFetchError(e) };
  }
}

async function checkBackend() {
  const url = `http://127.0.0.1:${BACKEND_PORT}/health`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }

    if (res.ok) {
      const degraded = Boolean(body?.degraded);
      return {
        ok: true,
        status: res.status,
        degraded,
        lastError: null,
        detail: degraded ? 'advertencias en dependencias (CouchDB, memoria, disco…)' : null,
      };
    }

    if (res.status === 503) {
      const reason = summarizeHealthFailure(body);
      return {
        ok: false,
        status: 503,
        degraded: false,
        lastError: `503 — ${reason}`,
      };
    }

    return {
      ok: false,
      status: res.status,
      degraded: false,
      lastError: `HTTP ${res.status}: ${text.slice(0, 160)}`,
    };
  } catch (e) {
    return { ok: false, status: null, degraded: false, lastError: formatFetchError(e) };
  }
}

function render(fe, be) {
  console.clear();
  console.log(`${BOLD}Monitor local${RESET}  ${DIM}(Ctrl+C para salir)${RESET}`);
  console.log(
    `${DIM}Frontend → http://127.0.0.1:${FRONTEND_PORT}/  |  Backend → http://127.0.0.1:${BACKEND_PORT}/health${RESET}\n`,
  );

  if (fe.ok) {
    console.log(
      `Frontend (Vite)    ${GREEN}● ACTIVO${RESET}   HTTP ${fe.status}  ${DIM}:${FRONTEND_PORT}${RESET}`,
    );
  } else {
    console.log(
      `Frontend (Vite)    ${RED}● SIN CONEXIÓN${RESET}  ${DIM}:${FRONTEND_PORT}${RESET}`,
    );
    console.log(`  ${RED}Último error:${RESET} ${fe.lastError}`);
  }

  if (be.ok) {
    const warn = be.degraded
      ? `  ${YELLOW}⚠ ${be.detail}${RESET}`
      : '';
    console.log(
      `Backend (Express)  ${GREEN}● ACTIVO${RESET}   HTTP ${be.status}  ${DIM}:${BACKEND_PORT}${RESET}${warn}`,
    );
  } else {
    console.log(
      `Backend (Express)  ${RED}● SIN CONEXIÓN${RESET}  ${DIM}:${BACKEND_PORT}${RESET}`,
    );
    console.log(`  ${RED}Último error:${RESET} ${be.lastError}`);
  }

  console.log('');
}

async function tick() {
  const [fe, be] = await Promise.all([checkFrontend(), checkBackend()]);
  render(fe, be);
}

function main() {
  process.on('SIGINT', () => {
    console.log(`${DIM}(monitor detenido)${RESET}\n`);
    process.exit(0);
  });

  tick();
  setInterval(tick, INTERVAL_MS);
}

main();
