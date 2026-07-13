# Limpieza del VPS (disco lleno / `git pull` falla)

Ejecutar como **root** o con `sudo`. **No** borres volúmenes Docker sin saber si CouchDB guarda ahí los datos.

## 1. Ver espacio

```bash
df -h /
docker system df
```

## 2. Docker (seguro si los contenedores que necesitas ya están en marcha)

```bash
docker container prune -f
docker image prune -a -f
docker builder prune -f
```

Evita `docker volume prune -f` hasta confirmar que ningún volumen huérfano es tu base CouchDB.

## 3. Sistema (Ubuntu/Debian)

```bash
journalctl --vacuum-time=7d
apt-get clean
```

## 4. Repo en el servidor

```bash
cd /opt/vertial/Vertial   # o tu ruta
git gc --prune=now
```

Si sigue sin espacio para `git pull`, libera antes en pasos 2–3.

## 5. Tras liberar

```bash
git pull
```

## 6. Deploy Docker sin quedarte sin disco (`ENOSPC` en `npm ci`)

El repo usa **`deploy/Dockerfile.prebuilt`**: solo instala dependencias de **producción** (`npm ci --omit=dev`) y copia el **`dist/`** ya generado (no ejecuta Vite en el servidor).

Antes en tu PC: `npm run build`, commit del `dist/` y `git push`. En el VPS: `git pull` y luego:

```bash
docker compose -f deploy/docker-compose.scaleway.yml --env-file .env build --no-cache
docker compose -f deploy/docker-compose.scaleway.yml --env-file .env up -d
```

Si falta `dist/` en el clone, el build fallará al copiar — es intencional.

Opcional: instalar **buildx** si Compose avisa (`docker-buildx-plugin` en Ubuntu).

---

**Ideas a medio plazo:** build del front en tu PC y subir solo `dist/` (rsync); en el VPS **no** ejecutar `npm ci` + `npm run build`; subir tamaño de disco en el proveedor si es muy justo.
