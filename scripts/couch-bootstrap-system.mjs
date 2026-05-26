#!/usr/bin/env node
/**
 * Crea las DBs de sistema de CouchDB (_users, _replicator, _global_changes)
 * de forma idempotente. Es seguro ejecutarlo varias veces:
 *   - Si la DB ya existe → 412 Precondition Failed → se ignora.
 *   - Si falta → la crea.
 *
 * Sin estas tres DBs, CouchDB lanza cada 5 s el error
 *   "chttpd_auth_cache changes listener died because the _users database does not exist"
 * y el `couchdb.log` se infla a gigabytes en pocos días.
 *
 * Uso:
 *   node scripts/couch-bootstrap-system.mjs
 *
 * Lee credenciales de:
 *   COUCHDB_URL        (por defecto http://127.0.0.1:5984)
 *   COUCHDB_USER
 *   COUCHDB_PASSWORD
 *
 * Si están en `.env`, se cargan automáticamente vía `config/env.js`.
 */
import process from 'node:process';
import '../config/env.js';

const URL = String(process.env.COUCHDB_URL || 'http://127.0.0.1:5984').replace(/\/+$/, '');
const USER = String(process.env.COUCHDB_USER || '').trim();
const PASS = String(process.env.COUCHDB_PASSWORD || '').trim();

if (!USER || !PASS) {
  console.error('[bootstrap-system] Faltan COUCHDB_USER / COUCHDB_PASSWORD en .env');
  process.exit(1);
}

const auth = Buffer.from(`${USER}:${PASS}`).toString('base64');
const headers = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' };

const SYSTEM_DBS = ['_users', '_replicator', '_global_changes'];

async function ensureDb(name) {
  const res = await fetch(`${URL}/${name}`, { method: 'PUT', headers });
  if (res.ok) return { name, status: 'created' };
  // 412 Precondition Failed = la DB ya existe (idempotente)
  if (res.status === 412) return { name, status: 'exists' };
  const body = await res.text().catch(() => '');
  throw new Error(`${name}: ${res.status} ${body.slice(0, 200)}`);
}

async function main() {
  console.log(`[bootstrap-system] CouchDB en ${URL} (user=${USER})`);

  // Sanity check: probamos auth antes de tocar nada.
  const ping = await fetch(`${URL}/_up`, { headers });
  if (ping.status === 401) {
    console.error('[bootstrap-system] 401 Unauthorized — revisa COUCHDB_USER / COUCHDB_PASSWORD');
    process.exit(2);
  }
  if (!ping.ok) {
    console.error(`[bootstrap-system] CouchDB no responde a /_up (status ${ping.status})`);
    process.exit(3);
  }

  for (const db of SYSTEM_DBS) {
    try {
      const r = await ensureDb(db);
      console.log(`  ${r.status === 'created' ? '✔' : '·'} ${db}: ${r.status}`);
    } catch (err) {
      console.error(`  ✖ ${db}: ${err.message}`);
      process.exitCode = 4;
    }
  }

  console.log('[bootstrap-system] Hecho.');
}

main().catch((err) => {
  console.error('[bootstrap-system] Excepción no controlada:', err.message);
  process.exit(1);
});
