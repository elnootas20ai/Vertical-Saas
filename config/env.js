/**
 * Carga variables de entorno en orden de precedencia:
 *   1. .env.<NODE_ENV>   (primero: define valores por entorno)
 *   2. .env              (después: solo rellena claves aún no definidas)
 *
 * dotenv no sobreescribe variables ya presentes en process.env (override: false).
 * Por tanto las claves que aparecen en .env.production ganan sobre las mismas en .env.
 * Variables solo en .env sí se aplican en producción si no están en .env.production.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const NODE_ENV = process.env.NODE_ENV || 'development';
const envSpecific = path.join(ROOT, `.env.${NODE_ENV}`);
const envBase = path.join(ROOT, '.env');

dotenv.config({ path: envSpecific });
dotenv.config({ path: envBase });

/** Una línea en logs al arrancar (Render/VPS/local): qué falta sin exponer secretos. */
function logCouchEnvQuickCheck() {
  const url = String(process.env.COUCHDB_URL || '').trim();
  const host = String(process.env.COUCHDB_HOST || '').trim();
  const proto = String(process.env.COUCHDB_PROTOCOL || '').trim();
  const port = String(process.env.COUCHDB_PORT || '').trim();
  const user = String(process.env.COUCHDB_USER || '').trim();
  const pass = String(process.env.COUCHDB_PASSWORD || '').trim();
  const hasUrl = url.length > 0 || host.length > 0;
  const hasUser = user.length > 0;
  const hasPass = pass.length > 0;
  const parts = [
    `COUCHDB_URL/COUCHDB_HOST=${hasUrl ? 'ok' : 'FALTA'}`,
    `COUCHDB_USER=${hasUser ? 'ok' : 'FALTA'}`,
    `COUCHDB_PASSWORD=${hasPass ? 'ok' : 'FALTA'}`,
  ];
  const line = `[config] CouchDB: ${parts.join(' · ')}`;
  if (!hasUrl || !hasUser || !hasPass) {
    console.warn(
      `${line} → Añade las que ponen FALTA. Ejemplo: COUCHDB_URL=http://51.159.118.39:5984 (sin barra final) o COUCHDB_HOST=51.159.118.39, COUCHDB_PORT=5984, COUCHDB_PROTOCOL=http. (proto=${proto || '—'}, port=${port || '—'})`,
    );
  } else {
    console.log(`${line}`);
  }
}

logCouchEnvQuickCheck();
