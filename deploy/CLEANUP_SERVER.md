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
cd ~/Vertical-Saas   # o tu ruta
git gc --prune=now
```

Si sigue sin espacio para `git pull`, libera antes en pasos 2–3.

## 5. Tras liberar

```bash
git pull
```

---

**Ideas a medio plazo:** build del front en tu PC y subir solo `dist/` (rsync); en el VPS **no** ejecutar `npm ci` + `npm run build`; subir tamaño de disco en el proveedor si es muy justo.
