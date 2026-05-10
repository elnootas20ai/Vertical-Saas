/**
 * Crea o resetea la contraseña del admin SaaS en CouchDB (`accounts`).
 *
 * Tras vaciar CouchDB (volúmenes nuevos o borrado manual), ejecuta esto **en la máquina
 * que tenga el .env correcto** (VPS con el repo o tu PC si COUCHDB_URL apunta al servidor):
 *   npm run create-admin
 * o el alias:
 *   npm run couch:recover-admin
 *
 * COUCHDB_URL: desde el **host** del VPS suele ser `http://127.0.0.1:5984` si el puerto
 * está mapeado; desde tu PC contra el VPS, `http://IP_PUBLICA:5984`. Dentro de Docker
 * el backend usa `http://couchdb:5984` — no uses esa URL al lanzar el script fuera del stack.
 *
 * Variables (mismas que el backend): COUCHDB_URL, COUCHDB_USER, COUCHDB_PASSWORD,
 * SAAS_LOGIN_EMAIL, SAAS_LOGIN_PASSWORD (mín. 8 caracteres).
 * Opcionales: SAAS_LOGIN_FIRST_NAME, SAAS_LOGIN_LAST_NAME, SAAS_LOGIN_COMPANY.
 *
 * En servidor con NODE_ENV=production usa el mismo .env.production que PM2:
 *   NODE_ENV=production npm run create-admin
 *
 * Equivalente a: npm run saas:bootstrap
 */
import { upsertSaasLoginAdmin } from './saas-admin-upsert.js';

upsertSaasLoginAdmin().catch((e) => {
  console.error(e);
  process.exit(1);
});
