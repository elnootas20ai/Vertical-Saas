# Instalación, build y start (con límite de RAM)

Guía preparada para Linux, con foco en evitar sobrecarga de memoria en Node y en dejar CouchDB disponible.

## 1) Requisitos

| Requisito | Versión recomendada |
| --- | --- |
| Node.js | 20 LTS o superior |
| npm | 10 o superior |
| Git | Última estable |
| CouchDB | 3.x |

## 2) Instalar dependencias del proyecto

```bash
cd /var/www/backend
npm install
```

## 3) Build con límite de RAM (4012 MB)

```bash
NODE_OPTIONS="--max-old-space-size=4012" npm run build
```

## 4) Start del proyecto con límite de RAM (4012 MB)

Actualmente el proyecto trae scripts `dev` y `build` (Vite).  
Para entorno productivo frontend puedes usar `preview`:

```bash
npm pkg set scripts.preview="vite preview --host 0.0.0.0 --port 4173"
NODE_OPTIONS="--max-old-space-size=4012" npm run preview
```

Si quieres comando `start` explícito:

```bash
npm pkg set scripts.start="vite preview --host 0.0.0.0 --port 4173"
NODE_OPTIONS="--max-old-space-size=4012" npm run start
```

## 5) Instalar Express en el proyecto

```bash
cd /var/www/backend
npm install express
```

Opcional para API en TypeScript/Node:

```bash
npm install -D @types/express
```

## 6) Instalar CouchDB (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y couchdb
sudo systemctl enable couchdb
sudo systemctl start couchdb
sudo systemctl status couchdb
```

Por defecto queda en `http://127.0.0.1:5984`.

## 7) Variables de entorno recomendadas

Crear `.env`:

```bash
NODE_ENV=production
PORT=4173
NODE_OPTIONS=--max-old-space-size=4012
COUCHDB_URL=http://127.0.0.1:5984
COUCHDB_USER=admin
COUCHDB_PASSWORD=tu_password_seguro
```

## 8) Verificación rápida

| Validación | Comando esperado |
| --- | --- |
| Build OK | `npm run build` sin errores |
| Start OK | `npm run start` o `npm run preview` responde en puerto |
| CouchDB OK | `curl http://127.0.0.1:5984` devuelve JSON de CouchDB |
