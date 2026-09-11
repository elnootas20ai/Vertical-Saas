#!/usr/bin/env node
/** Solo lectura remoto: auditoría Mati carta/ingredientes/almacén. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const values = loadLocalValues();
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim() || '/opt/vertial/Vertial';
const identity = values.SSH_IDENTITY_FILE?.trim();
const localScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'audit-mati-carta-ingredientes-almacen.mjs',
);
const scriptB64 = fs.readFileSync(localScript).toString('base64');
const repoSq = repo.replace(/'/g, `'\\''`);

const bash = `set -e
cd '${repoSq}'
mkdir -p scripts
echo '${scriptB64}' | base64 -d > scripts/audit-mati-carta-ingredientes-almacen.mjs
NODE_ENV=production node scripts/audit-mati-carta-ingredientes-almacen.mjs
`;

console.log('[remote-audit-mati]', `${user}@${host}`);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
