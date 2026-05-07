/**
 * Crea o actualiza la cuenta con la que **entras al SaaS** (email + contraseña del login).
 * El superadmin del front (SUPERADMIN_EMAIL en SaasRoot) debe ser el mismo email si quieres ese rol.
 * Los datos están en la base CouchDB `accounts` (no uses la interfaz web de Couch para esto).
 *
 * Requiere en .env la conexión HTTP al servidor CouchDB (las mismas vars que el backend):
 *   COUCHDB_URL, COUCHDB_USER, COUCHDB_PASSWORD
 * Y el usuario de la aplicación:
 *   SAAS_LOGIN_EMAIL, SAAS_LOGIN_PASSWORD
 *
 * Uso: npm run saas:bootstrap   |   npm run create-admin (equivalente)
 */
import { upsertSaasLoginAdmin } from './saas-admin-upsert.js';

upsertSaasLoginAdmin().catch((e) => {
  console.error(e);
  process.exit(1);
});
