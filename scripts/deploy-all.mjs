#!/usr/bin/env node
/**
 * Despliega TODO lo versionado en git: backend (Docker) + frontend (dist).
 *
 * Requisitos para que producción = local:
 *   1. git add + commit (working tree limpio)
 *   2. git push origin main
 *   3. npm run deploy:all
 *
 * No sube .env ni deploy/local-values.env (secretos locales).
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { REPO_ROOT } from './deploy-env.mjs';

function run(label, cmd, args) {
  console.log(`\n[deploy:all] ${label}`);
  const r = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    console.error(`[deploy:all] FALLÓ: ${label}`);
    process.exit(r.status ?? 1);
  }
}

function gitOut(args) {
  const r = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  if (r.status !== 0) return '';
  return String(r.stdout || '').trim();
}

const dirty = gitOut(['status', '--porcelain']);
if (dirty) {
  console.error(
    '[deploy:all] Hay cambios sin commitear en local. Producción solo puede igualar lo que está en git.\n' +
      'Haz: git add -A && git commit -m "..." && git push\n',
  );
  process.exit(1);
}

run('git fetch origin', 'git', ['fetch', 'origin']);

const branch = gitOut(['rev-parse', '--abbrev-ref', 'HEAD']) || 'main';
const localHead = gitOut(['rev-parse', 'HEAD']);
const remoteHead = gitOut(['rev-parse', `origin/${branch}`]);

if (!remoteHead) {
  console.error(`[deploy:all] No existe origin/${branch}. Haz git push -u origin ${branch}`);
  process.exit(1);
}

if (localHead !== remoteHead) {
  console.error(
    `[deploy:all] Local (${localHead.slice(0, 7)}) ≠ remoto (${remoteHead.slice(0, 7)}).\n` +
      'Haz git push antes de desplegar para que el VPS reciba el mismo código.\n',
  );
  process.exit(1);
}

console.log(`[deploy:all] OK — rama ${branch} @ ${localHead.slice(0, 7)} (local = origin)`);

run('backend', 'npm', ['run', 'deploy:backend']);
run('frontend', 'npm', ['run', 'deploy:frontend']);

console.log('\n[deploy:all] Listo. Local y producción deberían coincidir (recarga forzada Ctrl+Shift+R).');
