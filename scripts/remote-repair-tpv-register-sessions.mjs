#!/usr/bin/env node
/**
 * Cierra cajas TPV fantasma en el VPS (días anteriores + duplicadas).
 *   node scripts/remote-repair-tpv-register-sessions.mjs          # simulación
 *   node scripts/remote-repair-tpv-register-sessions.mjs --apply  # aplica
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const APPLY = process.argv.includes('--apply');
const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();
const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'repair-tpv-register-sessions.mjs');
const b64 = fs.readFileSync(scriptPath).toString('base64');
const applyFlag = APPLY ? ' --apply' : '';
const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
mkdir -p scripts
echo '${b64}' | base64 -d > scripts/repair-tpv-register-sessions.mjs
node scripts/repair-tpv-register-sessions.mjs${applyFlag}
`;
console.log(APPLY ? '[remote-repair] APLICANDO cierres…' : '[remote-repair] Simulación (sin --apply)…');
const r = sshRunScript(user, host, identity, bash);
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status || 0);
