# Renombrar repo en VPS: Vertical-Saas → Vertial

Guía única para alinear servidor, GitHub y tu PC tras el cambio de nombre del proyecto.

## 1. GitHub (hazlo primero)

1. Entra en https://github.com/elnootas20ai/Vertical-Saas → **Settings** → **General** → **Repository name**.
2. Cámbialo a **`Vertial`** y confirma.
3. En tu PC (PowerShell, carpeta del proyecto):

```powershell
cd "c:\Users\Urieel\Desktop\uriel\Vertial"
git remote set-url origin https://github.com/elnootas20ai/Vertial.git
git remote -v
git pull
```

GitHub redirige la URL antigua un tiempo, pero conviene usar ya `Vertial.git`.

## 2. VPS — renombrar carpeta del repo

Conéctate por SSH y ejecuta (ajusta usuario si no es `root`):

```bash
# Parar servicios que usen el repo
pm2 stop all 2>/dev/null || true
cd /opt/vertial
docker compose -f Vertical-Saas/deploy/docker-compose.scaleway.yml down 2>/dev/null || true

# Renombrar carpeta
mv Vertical-Saas Vertial
cd Vertial
git remote set-url origin https://github.com/elnootas20ai/Vertial.git
git pull
```

## 3. VPS — nginx (solo si apunta a la ruta antigua)

Busca la directiva `root` del sitio:

```bash
grep -r "Vertical-Saas" /etc/nginx/ 2>/dev/null
```

Si aparece algo como `/opt/vertial/Vertical-Saas/dist`, edítalo a:

```
/opt/vertial/Vertial/dist
```

Luego:

```bash
nginx -t && systemctl reload nginx
```

**Nota:** muchos despliegues sirven desde `/var/www/vertial/dist` (symlink o rsync). Si nginx usa esa ruta, no hace falta tocar nginx; solo asegúrate de que el script de deploy/rsync siga sincronizando bien.

## 4. VPS — levantar de nuevo

Desde `/opt/vertial/Vertial`:

```bash
bash scripts/server-fix-after-pull.sh
# o manualmente:
docker compose -f deploy/docker-compose.scaleway.yml --env-file .env up -d --build
pm2 restart all 2>/dev/null || true
```

Comprueba:

```bash
curl -sS http://127.0.0.1:3000/live
curl -sI https://vertialapp.com | head -5
```

## 5. Tu PC — `deploy/local-values.env`

Si ya tienes `deploy/local-values.env` (no está en git), actualiza:

```env
DEPLOY_DIST_PATH=/opt/vertial/Vertial/dist
REPO_PATH_ON_VPS=/opt/vertial/Vertial
```

O ejecuta:

```bash
node scripts/fix-deploy-path.mjs
```

(Actualiza `DEPLOY_DIST_PATH` en `deploy/local-values.env` a `/opt/vertial/Vertial/dist`.)

Plantilla de referencia: `deploy/local-values.template.env`.

## 6. PM2 / cron / scripts personalizados

Busca referencias huérfanas en el VPS:

```bash
grep -r "Vertical-Saas" /opt/vertial /etc/nginx /root /home 2>/dev/null | head -20
crontab -l 2>/dev/null | grep -i vertical
pm2 prettylist 2>/dev/null | grep -i vertical
```

Corrige cualquier ruta que siga apuntando a `Vertical-Saas`.

## Resumen

| Dónde | Acción |
|-------|--------|
| GitHub | Renombrar repo a `Vertial` |
| PC local | Carpeta ya es `Vertial`; actualizar `git remote` y `deploy/local-values.env` |
| VPS | `mv Vertical-Saas Vertial`; revisar nginx; reiniciar Docker/PM2 |
| Código | Scripts y docs del repo ya usan `/opt/vertial/Vertial` por defecto |
