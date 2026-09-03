#!/usr/bin/env node
/**
 * Reenvía PRUEBA Badalona + Tiana a Pau (campana + push).
 * Uso: node scripts/remote-fix-resend-caja-prueba-pau.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

const apply = process.argv.includes('--apply');
if (!apply) {
  console.error('Falta --apply (confirmado por Uriel). Aborto.');
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();
const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fix-resend-caja-prueba-pau.mjs');
const scriptB64 = fs.readFileSync(scriptPath).toString('base64');

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
mkdir -p scripts
echo '${scriptB64}' | base64 -d > scripts/fix-resend-caja-prueba-pau.mjs
# Copiar al contenedor app (APNs/env reales) y ejecutar
CID=\$(docker ps --format '{{.Names}}' | grep -E 'deploy-app|app-1' | head -1)
if [ -z "\$CID" ]; then echo 'No app container'; exit 1; fi
docker cp scripts/fix-resend-caja-prueba-pau.mjs "\$CID:/app/scripts/fix-resend-caja-prueba-pau.mjs"
docker exec "\$CID" node scripts/fix-resend-caja-prueba-pau.mjs --apply
`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
