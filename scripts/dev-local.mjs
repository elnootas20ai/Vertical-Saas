/**
 * Arranca frontend (3015) + backend (3001) en local con un solo comando.
 * Ctrl+C cierra los dos procesos.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';

const children = [];

function run(label, args) {
  const child = spawn(npm, args, {
    cwd: root,
    stdio: 'inherit',
    shell: isWin,
    env: { ...process.env, FORCE_COLOR: '1' },
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

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('[dev-local] Backend → http://127.0.0.1:3001');
console.log('[dev-local] Frontend → http://localhost:3015');
console.log('[dev-local] Ctrl+C para parar ambos\n');

run('backend', ['run', 'backend:dev']);
run('frontend', ['run', 'dev']);
