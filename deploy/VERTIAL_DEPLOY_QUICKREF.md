# Vertial — referencia rápida de producción (sin secretos)

Este archivo solo lista **nombres** de variables, rutas y comandos. Los valores sensibles van en **`deploy/local-values.env`** (no se versiona; está en `.gitignore`).

## Arquitectura típica (Scaleway + Nginx)

- **Público**: Nginx `443` → `https://vertialapp.com` / `https://www.vertialapp.com`
- **Estáticos**: `/var/www/vertial/dist` (build Vite en CI o en tu PC; no hace falta `npm run build` en el VPS)
- **API**: mismo dominio → `proxy_pass` a Node en `127.0.0.1:3000` (ruta `/api`)
- **Backend + Couch en Docker** (recomendado): `deploy/docker-compose.scaleway.yml` — desde la raíz del repo:  
  `docker compose -f deploy/docker-compose.scaleway.yml --env-file .env up -d --build`  
  El servicio `app` usa `env_file: ../.env` y fuerza `COUCHDB_URL` al hostname `couchdb` salvo que definas `COUCHDB_URL_APP`.
- **CouchDB**: idealmente no expuesto a Internet; si abres el puerto para Fauxton, cierra firewall cuando puedas

## Despliegue (solo desde tu PC)

No hay GitHub Actions en este repo (evita correos de error en cada push).

Despliegue habitual:

```bash
npm run deploy:all
```

(o `deploy:frontend` / `deploy:backend`). Config: `deploy/local-values.env`.

### Secretos (GitHub → *Settings* → *Secrets and variables* → *Actions*)

| Secreto | Ejemplo / notas |
|--------|-------------------|
| `VPS_HOST` | IP pública o `scw-xxx.fr-par.scw.cloud` |
| `VPS_USER` | `root` o `ubuntu` |
| `VPS_SSH_KEY` | Clave **privada** PEM (mejor una clave **solo para Actions**, no tu clave personal) |
| `VPS_DEPLOY_PATH` | Ruta absoluta al repo en el VPS, ej. `/opt/vertial/Vertial` |

Si SSH no usa el puerto 22, en el YAML del workflow puedes añadir `port: ${{ secrets.VPS_PORT }}` y crear el secreto `VPS_PORT`.

### Una sola vez en el VPS

1. Clonar el repo en `VPS_DEPLOY_PATH` y dejar el **`.env`** en la **raíz** del clon (no subido a Git).
2. Poner la **clave pública** del par usado en `VPS_SSH_KEY` en `~/.ssh/authorized_keys` del usuario `VPS_USER`.
3. Si el repo es **privado**, en GitHub → *Settings* → *Deploy keys* añade la **pública** del servidor (solo lectura) para que `git fetch` funcione; o clona con un remoto que ya autentique (según cómo lo montéis).

### Front en Vercel (paralelo, sin tocar el VPS)

- Conecta el **mismo repo** a Vercel; cada push puede buildar el front ahí.
- Variables `VITE_*` y URL de API en el panel de Vercel.
- Dominio del sitio → Vercel; subdominio **API** → IP del VPS (Nginx/Caddy delante del puerto 3000 si usáis HTTPS).

## Qué va en el servidor (runtime Node o contenedor `app`)

Rellenar en `.env` en la raíz del repo (o en `deploy/local-values.env` si usáis plantilla) y, con Docker, pasarlo con `--env-file .env` al hacer `docker compose` para interpolar `couchdb` / secretos en el bloque `couchdb` del compose.

Variables habituales:

- `NODE_ENV=production`
- `PORT=3000` (debe coincidir con el `proxy_pass` de Nginx)
- `APP_URL=https://vertialapp.com`
- `ALLOWED_ORIGINS=https://vertialapp.com,https://www.vertialapp.com`
- `COUCHDB_URL=http://127.0.0.1:5984` en el **host** (scripts, Fauxton); en el contenedor `app` Compose fuerza la URL interna a Couch salvo `COUCHDB_URL_APP`
- `COUCHDB_USER`, `COUCHDB_PASSWORD`, `COUCHDB_DB`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (login Google en backend)
- Sign in with Apple web: `APPLE_CLIENT_ID=com.vertial.app`, `APPLE_SERVICES_ID=com.vertial.app.web`
- Opcional bootstrap: `SAAS_AUTO_BOOTSTRAP`, `SAAS_LOGIN_*`, `SAAS_BOOTSTRAP_FORCE_SYNC`
- Opcional: `OPENAI_*`, email (`RESEND_*` / `SMTP_*`), `MONEI_*`, etc.
- Estabilidad (5+ usuarios concurrentes): `NODE_MAX_OLD_SPACE_MB=1024`, `BURST_LIMIT_MAX=150`, `PLAN_TRIAL_MAX_PER_MIN=400`, `SSE_MAX_CONNECTIONS_PER_USER=3`

### Alertas operativas (correo a ti)

Remitente transaccional: `EMAIL_FROM` + `SMTP_*` (p. ej. `vertial.noreply@gmail.com`). Nombre visible: `EMAIL_FROM_NAME=Vertial`.

Destino de alertas admin (registros, bugs, RAM, Couch, backup):

- `ALERTS_ADMIN_EMAIL=elnootas2.0@gmail.com` (principal)
- `BUG_REPORT_EMAIL`, `AFFILIATE_EMAIL` — mismo buzón o separados
- `EMAIL_REPLY_TO` — buzón que **lees** (respuestas de clientes), no el noreply
- `ALERTS_ADMIN_ENABLED=true` — `false` apaga todo
- Umbrales opcionales: `ALERT_RSS_MB`, `ALERT_HEAP_MB`, `ALERT_DISK_FREE_GB`, `ALERT_5XX_THRESHOLD`, `ALERT_BACKUP_MAX_AGE_HOURS`

Desde tu PC, aplicar en el VPS sin editar a mano: `node scripts/remote-config-alerts.mjs` (requiere `deploy/local-values.env`).

## Qué va en el **build** del frontend (solo variables `VITE_*`)

Se incrustan en `dist/` en el momento de `npm run build`:

- `VITE_GOOGLE_CLIENT_ID` — **debe ser el mismo Client ID** que `GOOGLE_CLIENT_ID`
- `VITE_APPLE_CLIENT_ID` — Services ID web (mismo que `APPLE_SERVICES_ID`, p. ej. `com.vertial.app.web`)
- `VITE_APPLE_REDIRECT_URI` — Return URL del Services ID (p. ej. `https://vertialapp.com`)
- `VITE_GOOGLE_MAPS_API_KEY` (si usáis Maps)
- Couch headers si aplica: `VITE_COUCHDB_*` (solo si el front los necesita)
- Para API same-origin: **`VITE_API_URL` vacío** (el front usa `/api/...` en el mismo dominio)

Guarda una copia de tus valores de build en `deploy/local-values.env` para no olvidarlos al reconstruir.

## Desplegar solo **frontend** (cambios React/UI/SW)

### Opción rápida (recomendada): un comando desde tu PC

1. Copia `deploy/local-values.template.env` → `deploy/local-values.env`
2. Rellena al menos: `DEPLOY_USER`, `DEPLOY_HOST`, `DEPLOY_DIST_PATH`
3. Pon ahí también tus **`VITE_*`** (Google Maps, `VITE_GOOGLE_CLIENT_ID`, etc.) para que el build sea correcto
4. Ejecuta:

```bash
npm run deploy:frontend
```

Esto hace `npm run build` inyectando las variables del `local-values.env` y sube `dist/` con `rsync` (o `scp` si no hay rsync).

### Opción manual

En tu PC:

```bash
npm ci
npm run build
```

En el VPS (ajusta usuario e IP):

```bash
rsync -avz --delete dist/ USUARIO@IP_VPS:/var/www/vertial/dist/
```

Comprobación:

```bash
curl -sSI https://vertialapp.com/ | head
```

Si un usuario ve versión vieja: limpiar Service Worker (DevTools → Application → Service Workers) o ventana incógnita.

## Desplegar **backend** (cambios `index.js`, `controllers/`, etc.)

### Opción rápida desde tu PC

Con `REPO_PATH_ON_VPS` y `PM2_BACKEND_NAME` en `deploy/local-values.env`:

```bash
npm run deploy:backend
```

### Opción manual en el VPS

En el VPS (ruta del repo = la tuya real):

```bash
cd /ruta/al/repo
git pull
npm ci --omit=dev
pm2 restart NOMBRE_PROCESO_BACKEND
pm2 logs NOMBRE_PROCESO_BACKEND --lines 80
```

Comprobación:

```bash
curl -sS http://127.0.0.1:3000/health
curl -sS https://vertialapp.com/health
```

## DNS / SSL (recordatorio)

- **A** `vertialapp.com` → IP VPS  
- **A** `www.vertialapp.com` → IP VPS  
- **Certbot** renovación automática (comprobar de vez en cuando: `sudo certbot certificates`)

## Si la web da error pero `/api/*` va bien

Desde tu PC (usa tu `deploy/local-values.env`):

```bash
npm run deploy:diagnose
```

Si el log sugiere permisos en `dist/`:

```bash
npm run deploy:fix-dist
```

(No puedo ejecutar SSH contra tu VPS desde aquí; estos comandos hacen por ti lo que pediría en el servidor.)

## Seguridad

- No subas `.env` con secretos al repo.
- No pegues claves en chats; usa gestor de contraseñas (1Password, Bitwarden, etc.).
- Mantén CouchDB cerrado al mundo; firewall solo 80/443.
