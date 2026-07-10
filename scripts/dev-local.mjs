/**
 * Arranca frontend (3015) + backend (3001) en local con un solo comando.
 * Espera a que el API responda antes de abrir Vite. Ctrl+C cierra los dos procesos.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const BACKEND_PORT = process.env.PORT || '3001';
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const HEALTH_PATH = '/api/health';
const MAX_WAIT_MS = 45_000;
const POLL_MS = 500;

const children = [];

const sharedEnv = {
  ...process.env,
  FORCE_COLOR: '1',
  NODE_ENV: 'development',
  PORT: BACKEND_PORT,
};

function run(label, args, extraEnv = {}) {
  const child = spawn(npm, args, {
    cwd: root,
    stdio: 'inherit',
    shell: isWin,
    env: { ...sharedEnv, ...extraEnv },
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[dev-local] ${label} terminado (${signal})`);
      return;
    }
    if (code && code !== 0) {
      console.error(`[dev-local] ${label} salió con código ${code}`);
      shutdown(code || 1);
    }
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      try {
        if (isWin) {
          spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore', shell: true });
        } else {
          child.kill('SIGTERM');
        }
      } catch {
        /* ignore */
      }
    }
  }
  setTimeout(() => process.exit(code), 300);
}

function waitForBackend() {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${BACKEND_URL}${HEALTH_PATH}`, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
          return;
        }
        retry();
      });
      req.on('error', retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - started > MAX_WAIT_MS) {
        reject(new Error(`Backend no respondió en ${MAX_WAIT_MS / 1000}s (${BACKEND_URL}${HEALTH_PATH})`));
        return;
      }
      setTimeout(tick, POLL_MS);
    };

    tick();
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('[dev-local] Backend →', `${BACKEND_URL}`);
console.log('[dev-local] Frontend → http://localhost:3015');
console.log('[dev-local] Vertial Print → http://127.0.0.1:39201 (proxy /local-print)');
console.log('[dev-local] Proxy Vite: /api → backend local');
console.log('[dev-local] Ctrl+C para parar todos\n');

run('backend', ['run', 'backend:dev']);

waitForBackend()
  .then(() => {
    console.log(`[dev-local] Backend listo (${HEALTH_PATH})\n`);
    run('print-bridge', ['run', 'print-bridge']);
    run('frontend', ['run', 'dev']);
  })
  .catch((err) => {
    console.error(`[dev-local] ${err.message}`);
    console.error('[dev-local] ¿CouchDB en marcha? Prueba: npm run couch:up');
    shutdown(1);
  });
