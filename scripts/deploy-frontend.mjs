#!/usr/bin/env node
/**
 * Build + subida de dist/ al VPS.
 * Config: deploy/local-values.env (gitignored)
 *
 * DEPLOY_USER o SSH_USER
 * DEPLOY_HOST o VPS_IP
 * DEPLOY_DIST_PATH (ej. /var/www/vertial/dist)
 *
 * Opcional: SSH_IDENTITY_FILE (ruta a clave privada)
 *
 * Las variables VITE_* en local-values.env se inyectan al proceso de build.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  REPO_ROOT,
  LOCAL_VALUES_PATH,
  loadLocalValues,
  mergedEnvForChild,
} from './deploy-env.mjs';

const MIN_MAIN_BUNDLE_BYTES = 500_000;

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function readMainBundleFromDist(distDir) {
  const htmlPath = resolve(distDir, 'index.html');
  const html = readFileSync(htmlPath, 'utf8');
  const match = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/);
  if (!match) return null;
  const fileName = match[1];
  const filePath = resolve(distDir, 'assets', fileName);
  if (!existsSync(filePath)) return null;
  return { fileName, bytes: statSync(filePath).size, filePath };
}

function uploadAssetsDirectory(target, identity) {
  const assetsDir = resolve(REPO_ROOT, 'dist', 'assets');
  if (!existsSync(assetsDir)) return { ok: false, reason: 'dist/assets no existe' };

  const assetsTarget = `${target}assets/`;
  const assetsScp = ['-r'];
  if (identity) assetsScp.push('-i', identity);
  assetsScp.push('dist/assets/.', assetsTarget);
  const assetsUpload = spawnSync('scp', assetsScp, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (assetsUpload.status !== 0) {
    return { ok: false, reason: 'subida de dist/assets/ falló' };
  }
  return { ok: true };
}

function verifyRemoteMainBundle({ user, host, remotePath, identity, expectedFileName, minBytes }) {
  // OJO: no llamar PATH a la variable — sobrescribiría el PATH del shell remoto y rompe stat/ls.
  const verifyScript = `set -e
DIST=${shellQuote(remotePath.replace(/\/+$/, ''))}
FILE=${shellQuote(`assets/${expectedFileName}`)}
TARGET_FILE="$DIST/$FILE"
if [ ! -f "$TARGET_FILE" ]; then
  echo "[verify] FALTA $TARGET_FILE"
  exit 2
fi
BYTES=$(stat -c%s "$TARGET_FILE" 2>/dev/null || stat -f%z "$TARGET_FILE")
echo "[verify] $FILE -> $BYTES bytes"
if [ "$BYTES" -lt ${minBytes} ]; then
  echo "[verify] bundle demasiado pequeño (¿subida incompleta?)"
  exit 3
fi
`;

  const sshArgs = ['-o', 'BatchMode=yes'];
  if (identity) sshArgs.push('-i', identity);
  sshArgs.push(`${user}@${host}`, 'bash -s');

  const result = spawnSync('ssh', sshArgs, {
    stdio: ['pipe', 'inherit', 'inherit'],
    input: verifyScript.replace(/\r/g, ''),
  });
  return result.status === 0;
}

const values = loadLocalValues();
if (!values) {
  console.error(
    `No existe ${LOCAL_VALUES_PATH}\n` +
      'Copia deploy/local-values.template.env → deploy/local-values.env y rellena DEPLOY_*',
  );
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const remotePath = values.DEPLOY_DIST_PATH || values.DIST_PATH_ON_VPS || '/opt/vertial/Vertical-Saas/dist';

if (!user || !host) {
  console.error(
    'Faltan DEPLOY_USER y DEPLOY_HOST (o SSH_USER y VPS_IP) en deploy/local-values.env',
  );
  process.exit(1);
}

const buildEnv = mergedEnvForChild(process.env, values);

const hasSmokeCreds = Boolean(
  String(buildEnv.SAAS_LOGIN_EMAIL || '').trim() &&
    String(buildEnv.SAAS_LOGIN_PASSWORD || '').trim(),
);

console.log(
  hasSmokeCreds
    ? '[deploy:frontend] npm run check:saas (build + smoke contra API)'
    : '[deploy:frontend] npm run build (sin SAAS_LOGIN_* — smoke omitido)',
);
const buildArgs = hasSmokeCreds ? ['run', 'check:saas'] : ['run', 'build'];
const build = spawnSync('npm', buildArgs, {
  cwd: REPO_ROOT,
  env: buildEnv,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const distDir = resolve(REPO_ROOT, 'dist');
if (!existsSync(distDir)) {
  console.error('No se encontró dist/ tras el build.');
  process.exit(1);
}

const mainBundle = readMainBundleFromDist(distDir);
if (!mainBundle || mainBundle.bytes < MIN_MAIN_BUNDLE_BYTES) {
  console.error(
    '[deploy:frontend] Build inválido: no se encontró el bundle principal index-*.js en dist/assets/.',
  );
  process.exit(1);
}
console.log(
  `[deploy:frontend] Bundle principal: ${mainBundle.fileName} (${Math.round(mainBundle.bytes / 1024 / 1024)} MB)`,
);

const target = `${user}@${host}:${remotePath.replace(/\/+$/, '')}/`;

const identity = values.SSH_IDENTITY_FILE?.trim();

console.log('[deploy:frontend] Subiendo dist/ →', target);

const rsyncArgs = ['-avz', '--delete'];
if (identity) {
  rsyncArgs.push('-e', `ssh -i ${identity}`);
}
rsyncArgs.push('dist/', target);

let upload = spawnSync('rsync', rsyncArgs, {
  cwd: REPO_ROOT,
  stdio: 'inherit',
});

if (upload.status !== 0) {
  console.warn('[deploy:frontend] rsync no disponible o falló; probando scp...');

  const scpArgs = [];
  if (identity) {
    scpArgs.push('-i', identity);
  }
  scpArgs.push('-r', 'dist/.', target);
  upload = spawnSync('scp', scpArgs, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (upload.status !== 0) {
    console.error(
      '[deploy:frontend] Falló la subida. Instala rsync (Git Bash) o cliente OpenSSH (scp).',
    );
    process.exit(upload.status ?? 1);
  }

  // scp en Windows a veces deja index.html nuevo sin los JS grandes; reintento assets/.
  const assetsRetry = uploadAssetsDirectory(target, identity);
  if (!assetsRetry.ok) {
    console.error(`[deploy:frontend] ${assetsRetry.reason}`);
    process.exit(1);
  }

  console.warn(
    '[deploy:frontend] Subido con scp. Si algo "viejo" sigue en el servidor, borra archivos huérfanos en el VPS o usa rsync --delete.',
  );
} else {
  // Tras rsync, forzar assets/ por si algún .js grande quedó a medias (Windows / red inestable).
  console.log('[deploy:frontend] Refuerzo de dist/assets/ ...');
  const assetsRetry = uploadAssetsDirectory(target, identity);
  if (!assetsRetry.ok) {
    console.error(`[deploy:frontend] ${assetsRetry.reason}`);
    process.exit(1);
  }
}

// scp/rsync deja los archivos con el dueño del usuario SSH (root) y, si el
// directorio padre no tiene permisos de "search" para www-data, nginx devuelve
// 403 Forbidden en /. Reajustamos dueño y permisos automáticamente para evitar
// tener que ejecutar `npm run deploy:fix-dist` a mano tras cada deploy.
// Limpieza segura de huérfanos: borrar SOLO lo que no existe en el dist/ local.
// (El "quedarse con el más nuevo por fecha" borraba chunks legítimos: un build
// genera varios index-*.js y scp no garantiza el orden de subida.)
const localAssetNames = readdirSync(resolve(REPO_ROOT, 'dist', 'assets'));
const keepList = ` ${localAssetNames.join(' ')} `;

const permsScript = `set -e
DIST=${shellQuote(remotePath.replace(/\/+$/, ''))}
KEEP=${shellQuote(keepList)}
if [ -d "$DIST/assets" ]; then
  for f in "$DIST/assets"/*; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    case "$KEEP" in
      *" $base "*) ;;
      *) rm -f "$f" ;;
    esac
  done
fi
chown -R www-data:www-data "$DIST"
find "$DIST" -type d -exec chmod 755 {} +
find "$DIST" -type f -exec chmod 644 {} +
nginx -t >/dev/null 2>&1 && systemctl reload nginx >/dev/null 2>&1 || true
echo "[deploy:frontend] permisos OK + nginx reload"
`;

const sshArgs = ['-o', 'BatchMode=yes'];
if (identity) {
  sshArgs.push('-i', identity);
}
sshArgs.push(`${user}@${host}`, 'bash -s');

const fix = spawnSync('ssh', sshArgs, {
  stdio: ['pipe', 'inherit', 'inherit'],
  input: permsScript.replace(/\r/g, ''),
});

if (fix.status !== 0) {
  console.warn(
    '[deploy:frontend] No se pudieron ajustar permisos automáticamente; si la web da 403, lanza `npm run deploy:fix-dist`.',
  );
}

console.log('[deploy:frontend] Verificando bundle JS en el servidor...');
const verified = verifyRemoteMainBundle({
  user,
  host,
  remotePath,
  identity,
  expectedFileName: mainBundle.fileName,
  minBytes: MIN_MAIN_BUNDLE_BYTES,
});
if (!verified) {
  console.error(
    '[deploy:frontend] DEPLOY INCOMPLETO: el bundle JS principal no está en el VPS.\n' +
      'La web quedará en blanco. Vuelve a lanzar deploy:frontend (idealmente con rsync) o sube dist/assets/ a mano.',
  );
  process.exit(1);
}

console.log('[deploy:frontend] Listo. Prueba: https://vertialapp.com/');
process.exit(0);
