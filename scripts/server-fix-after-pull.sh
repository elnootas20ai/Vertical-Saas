#!/usr/bin/env bash
# Ejecutar EN EL VPS como root (después de git pull):
#   cd /opt/vertial/Vertial && bash scripts/server-fix-after-pull.sh
#
# Arregla: puerto 3000 ocupado + levanta Docker + sincroniza dist a nginx.

set -euo pipefail

REPO="${REPO_PATH:-/opt/vertial/Vertial}"
DIST_WEB="${DIST_WEB_PATH:-/var/www/vertial/dist}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.scaleway.yml}"

cd "$REPO"

echo "=== Repo: $REPO ($(git rev-parse --short HEAD 2>/dev/null || echo '?')) ==="
echo

echo "=== Quién usa el puerto 3000 ==="
if command -v ss >/dev/null 2>&1; then
  ss -tlnp | grep ':3000' || echo "(nada en 3000)"
else
  lsof -i :3000 2>/dev/null || echo "(nada en 3000)"
fi
echo

echo "=== PM2 (si existe) ==="
if command -v pm2 >/dev/null 2>&1; then
  pm2 list || true
  echo "Parando procesos PM2 para liberar 3000..."
  pm2 stop all 2>/dev/null || true
else
  echo "pm2 no instalado (OK si usas solo Docker)"
fi
echo

echo "=== Contenedores Docker ==="
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
echo

echo "=== Liberar 127.0.0.1:3000 (proceso huérfano en el host) ==="
if command -v fuser >/dev/null 2>&1; then
  fuser -k 3000/tcp 2>/dev/null || true
  sleep 1
fi
if ss -tlnp 2>/dev/null | grep -q ':3000'; then
  echo "Aún hay algo en 3000. PIDs:"
  ss -tlnp | grep ':3000' || true
  echo "Mata manualmente con: kill <PID>"
  exit 1
fi
echo "Puerto 3000 libre."
echo

if [ ! -f .env ]; then
  echo "ERROR: falta .env en $REPO"
  exit 1
fi

echo "=== Docker Compose up ==="
docker compose -f "$COMPOSE_FILE" --env-file .env up -d --build
echo

echo "=== Estado contenedores ==="
docker compose -f "$COMPOSE_FILE" ps
echo

echo "=== Health API (espera hasta 30s) ==="
for i in $(seq 1 15); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/live 2>/dev/null || echo 000)
  echo "  intento $i → /live → HTTP $CODE"
  if [ "$CODE" = "200" ]; then
    curl -sS http://127.0.0.1:3000/health | head -c 400
    echo ""
    break
  fi
  sleep 2
done
echo

if [ -d dist ] && [ -d "$DIST_WEB" ]; then
  echo "=== Sincronizar dist → $DIST_WEB ==="
  if command -v rsync >/dev/null 2>&1; then
    rsync -av --delete dist/ "$DIST_WEB/"
  else
    mkdir -p "$DIST_WEB"
    cp -a dist/. "$DIST_WEB/"
  fi
  echo "OK front en $DIST_WEB"
else
  echo "SKIP rsync: dist/ o $DIST_WEB no existe"
fi

echo
echo "=== Listo. Prueba: https://vertialapp.com (incógnito) ==="
