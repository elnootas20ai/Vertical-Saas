## Scaleway (VPS) – despliegue “todo junto”

Este repo está pensado para funcionar con:

- **Frontend**: build de Vite (`dist/`) servido como SPA
- **Backend**: Node (`index.js`) para rutas `/api/*`, auth, etc.
- **DB**: CouchDB (en el mismo VPS, no expuesto a internet)

### 1) Variables de entorno (producción)

En el VPS crea un archivo `.env` (para docker compose) con lo mínimo:

- `APP_URL=https://TU_DOMINIO` (o `http://TU_IP` si aún no hay TLS)
- `ALLOWED_ORIGINS=https://TU_DOMINIO`
- `COUCHDB_URL=http://couchdb:5984`
- `COUCHDB_USER=admin`
- `COUCHDB_PASSWORD=...`
- `COUCHDB_DB=vertial` (prefijo de bases)
- `JWT_SECRET=...`
- `JWT_REFRESH_SECRET=...`

Si aún no tienes dominio, puedes arrancar con:

- `APP_URL=http://51.159.118.39`
- `ALLOWED_ORIGINS=http://51.159.118.39`

### 2) Arrancar CouchDB + app (Docker)

Desde el directorio `deploy/`:

```bash
docker compose -f docker-compose.scaleway.yml up -d --build
```

Esto deja:

- CouchDB en `127.0.0.1:5984` (solo local)
- App (Node) en `127.0.0.1:3000` (solo local; Nginx hace de entrada)

### 3) Build y subida del frontend

En tu máquina (o CI) build del frontend:

```bash
npm install
npm run build
```

Sube la carpeta `dist/` al VPS en:

- `/var/www/udar/dist`

### 4) Nginx (entrada pública)

Usa `deploy/nginx.scaleway.conf` como base:

- sirve `/` desde `/var/www/udar/dist`
- proxya `/api/*` a `127.0.0.1:3000`

### 5) Verificación rápida

En el VPS:

- `curl -i http://127.0.0.1:3000/health`
- `docker logs <container_app>`

