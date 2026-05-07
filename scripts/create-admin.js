/**
 * Crea o resetea la contraseña del admin SaaS en CouchDB (`accounts`).
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
