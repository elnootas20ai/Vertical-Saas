#!/usr/bin/env node
/**
 * Aplica Cache-Control anti pantalla-blanca en el site Nginx de producción.
 * Uso: node scripts/remote-apply-nginx-cache.mjs
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { LOCAL_VALUES_PATH, loadLocalValues } from './deploy-env.mjs';

const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const identity = values.SSH_IDENTITY_FILE?.trim();
if (!user || !host) {
  console.error('Faltan DEPLOY_USER / DEPLOY_HOST');
  process.exit(1);
}

const remoteScript = String.raw`
set -euo pipefail

echo "[nginx-cache] buscando site…"
SITE=""
for f in /etc/nginx/sites-enabled/vertial /etc/nginx/sites-enabled/vertialapp \
         /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/*; do
  if [ -f "$f" ] || [ -L "$f" ]; then
    if grep -q 'try_files' "$f" 2>/dev/null && grep -qE 'root .*(dist|vertial)' "$f" 2>/dev/null; then
      SITE="$f"
      break
    fi
  fi
done
if [ -z "$SITE" ]; then
  for f in /etc/nginx/sites-enabled/*; do
    if [ -f "$f" ] || [ -L "$f" ]; then SITE="$f"; break; fi
  done
fi
if [ -z "$SITE" ]; then
  echo "[nginx-cache] no hay site en sites-enabled"
  ls -la /etc/nginx/sites-enabled/ || true
  exit 2
fi

REAL="$SITE"
if [ -L "$SITE" ]; then
  REAL="$(readlink -f "$SITE")"
fi
echo "[nginx-cache] site=$SITE real=$REAL"

mkdir -p /root/nginx-backups
cp -a "$REAL" "/root/nginx-backups/$(basename "$REAL").bak.$(date +%Y%m%d%H%M%S)"

python3 - "$REAL" <<'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding='utf-8')

block = '''
    # Vertial: no cachear shell/SW (HTML viejo + chunk borrado = pantalla blanca)
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        try_files $uri =404;
    }

    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        try_files $uri =404;
    }

    location = /manifest.webmanifest {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        try_files $uri =404;
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
    }

    location / {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        try_files $uri $uri/ /index.html;
    }
'''

# Quitar bloque previo nuestro si se re-aplica
text = re.sub(
    r'\n\s*# Vertial: no cachear shell/SW[\s\S]*?location / \{\n\s*add_header Cache-Control "no-cache, no-store, must-revalidate" always;\n\s*add_header Pragma "no-cache" always;\n\s*try_files \$uri \$uri/ /index\.html;\n\s*\}\n',
    '\n',
    text,
    count=1,
)

# Sustituir location / { try_files ... } clásico
pat = re.compile(
    r'\n\s*location / \{\s*\n\s*try_files \$uri \$uri/ /index\.html;\s*\n\s*\}',
    re.M,
)
if not pat.search(text):
    # ya tiene cache headers en location /
    if 'no-cache, no-store, must-revalidate' in text and 'location /assets/' in text:
        print('[nginx-cache] ya aplicado, sin cambios')
        sys.exit(0)
    print('[nginx-cache] no encontré location / try_files clásico; aborto para no romper nginx')
    sys.exit(3)

text2, n = pat.subn('\n' + block, text, count=1)
if n != 1:
    print('[nginx-cache] replace count', n)
    sys.exit(3)
path.write_text(text2, encoding='utf-8')
print('[nginx-cache] config actualizada')
PY

nginx -t
systemctl reload nginx
echo "[nginx-cache] reload OK"

echo "=== headers /index.html ==="
curl -sI https://127.0.0.1/index.html -H 'Host: vertialapp.com' --insecure 2>/dev/null | tr -d '\r' | head -20 || true
curl -sI https://vertialapp.com/index.html 2>/dev/null | tr -d '\r' | head -20 || true
`;

const sshArgs = ['-o', 'BatchMode=yes'];
if (identity) sshArgs.push('-i', identity);
sshArgs.push(`${user}@${host}`, 'bash -s');

console.log(`[nginx-cache] SSH → ${user}@${host}`);
const result = spawnSync('ssh', sshArgs, {
  stdio: ['pipe', 'inherit', 'inherit'],
  input: remoteScript.replace(/\r/g, ''),
});
process.exit(result.status ?? 1);
