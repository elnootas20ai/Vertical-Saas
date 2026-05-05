/**
 * I-10: Script de migración a arquitectura multi-tenant.
 *
 * ADVERTENCIA: ejecutar SIEMPRE en un entorno de staging primero.
 * Este script NO elimina los datos originales — sólo los copia.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * QUÉ HACE
 * ══════════════════════════════════════════════════════════════════════════════
 *   1. Lee todas las empresas (businesses) de CouchDB.
 *   2. Por cada empresa:
 *      a. Crea las DBs de tenant: biz_{id}_vehicles, biz_{id}_sales, ...
 *      b. Copia los documentos de las DBs compartidas que pertenecen a esa empresa
 *         (filtrando por user_id de los miembros de la empresa o por business_id).
 *      c. Registra en el archivo de log de migración (migration-log.json).
 *   3. Al finalizar, imprime un resumen.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * CÓMO EJECUTAR
 * ══════════════════════════════════════════════════════════════════════════════
 *   node scripts/migrate-to-multitenant.js [--dry-run] [--business-id=<id>]
 *
 *   --dry-run          → sólo imprime lo que haría, sin escribir nada
 *   --business-id=XXX  → migra sólo una empresa (útil para pruebas graduales)
 *
 *   Variables de entorno requeridas (o en .env):
 *     COUCHDB_URL
 *     COUCHDB_USER
 *     COUCHDB_PASSWORD
 *     VITE_COUCHDB_DB  (prefijo de CouchDB, p.ej. "vertial")
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * PASO SIGUIENTE TRAS LA MIGRACIÓN
 * ══════════════════════════════════════════════════════════════════════════════
 *   1. Verifica el migration-log.json: busca entries con status=failed.
 *   2. Pon MULTITENANT_ENABLED=true en .env.
 *   3. Reinicia el servidor: los controladores deben importar getTenantDbName()
 *      de services/multiTenantService.js para resolver los nombres de DB.
 *   4. Tras confirmar que todo funciona, borra los documentos migrados
 *      de las DBs compartidas (script de limpieza aparte).
 */

import '../config/env.js';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TENANT_DB_TYPES,
  getAllTenantDbNames,
  bootstrapTenantDbs,
} from '../services/multiTenantService.js';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const LOG_FILE    = path.resolve(__dirname, '../migration-log.json');
const LEGACY_PREFIX = (process.env.COUCHDB_DB || 'vertial').replace(/\/+$/, '');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const BIZ_ARG  = args.find((a) => a.startsWith('--business-id='));
const ONLY_BIZ = BIZ_ARG ? BIZ_ARG.split('=')[1] : null;

// ── CouchDB config ────────────────────────────────────────────────────────────
const COUCH_BASE = (process.env.COUCHDB_URL || '').replace(/\/+$/, '');
const COUCH_USER = process.env.COUCHDB_USER || '';
const COUCH_PASS = process.env.COUCHDB_PASSWORD || '';
const AUTH_HEADER = COUCH_USER
  ? `Basic ${Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64')}`
  : '';

if (!COUCH_BASE) {
  console.error('❌ COUCHDB_URL no configurado. Ejecuta desde la raíz del proyecto con .env cargado.');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function couchGet(path_) {
  const res = await fetch(`${COUCH_BASE}${path_}`, {
    headers: { ...(AUTH_HEADER ? { Authorization: AUTH_HEADER } : {}) },
    signal:  AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`GET ${path_} → HTTP ${res.status}`);
  return res.json();
}

async function couchPut(path_, doc) {
  const res = await fetch(`${COUCH_BASE}${path_}`, {
    method:  'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(AUTH_HEADER ? { Authorization: AUTH_HEADER } : {}),
    },
    body:    JSON.stringify(doc),
    signal:  AbortSignal.timeout(30_000),
  });
  return { status: res.status, payload: await res.json().catch(() => ({})) };
}

async function getAllDocs(dbName) {
  const data = await couchGet(`/${encodeURIComponent(dbName)}/_all_docs?include_docs=true`);
  return (data.rows ?? []).map((r) => r.doc).filter((d) => d && !d._id.startsWith('_design/'));
}

function stripRev(doc) {
  const { _rev, ...rest } = doc;
  return rest;
}

// ── Mapeo legado → DB fuente ──────────────────────────────────────────────────
const LEGACY_SOURCE_DBS = {
  vehicles:     'vehicles',
  sales:        `${LEGACY_PREFIX}-sales`,
  clients:      `${LEGACY_PREFIX}-clients`,
  leads:        `${LEGACY_PREFIX}-leads`,
  documents:    `${LEGACY_PREFIX}-documents`,
  finance:      'pay',
  locations:    `${LEGACY_PREFIX}-locations`,
  appointments: `${LEGACY_PREFIX}-appointments`,
  workshop:     `${LEGACY_PREFIX}-workshop`,
  parts:        `${LEGACY_PREFIX}-parts`,
  gdprConsents: `${LEGACY_PREFIX}-gdpr-consents`,
  gdprRequests: `${LEGACY_PREFIX}-gdpr-requests`,
  calls:        `${LEGACY_PREFIX}-calls`,
  tradein:      `${LEGACY_PREFIX}-tradein`,
};

// ── Migración de una empresa ──────────────────────────────────────────────────
async function migrateBusiness(business, migrationLog) {
  const bizId   = business._id;
  const bizName = business.name || bizId;

  console.log(`\n▶ Migrando empresa: ${bizName} (${bizId})`);

  const entry = {
    businessId:   bizId,
    businessName: bizName,
    startedAt:    new Date().toISOString(),
    dbs:          {},
    status:       'pending',
  };
  migrationLog.push(entry);

  // 1. Crear DBs de tenant
  if (!DRY_RUN) {
    const bootstrap = await bootstrapTenantDbs(bizId, {
      baseUrl:    COUCH_BASE,
      authHeader: AUTH_HEADER,
    });
    entry.bootstrap = bootstrap;
    console.log(`   ✅ DBs creadas: ${bootstrap.created.length}  existentes: ${bootstrap.existing.length}  fallidas: ${bootstrap.failed.length}`);
  } else {
    const dbNames = Object.values(getAllTenantDbNames(bizId));
    console.log(`   [DRY-RUN] Crearía ${dbNames.length} DBs:`, dbNames.join(', '));
  }

  // Recoger los user_ids de los miembros de la empresa para filtrar docs
  const memberIds = new Set([
    business.owner_user_id,
    ...(Array.isArray(business.members) ? business.members.map((m) => m.user_id ?? m) : []),
  ].filter(Boolean));

  // 2. Copiar documentos
  for (const [dbType, srcDbName] of Object.entries(LEGACY_SOURCE_DBS)) {
    const targetDbName = getAllTenantDbNames(bizId)[dbType];

    let srcDocs;
    try {
      srcDocs = await getAllDocs(srcDbName);
    } catch (err) {
      console.log(`   ⚠️  No se pudo leer ${srcDbName}: ${err.message}`);
      entry.dbs[dbType] = { source: srcDbName, target: targetDbName, error: err.message };
      continue;
    }

    // Filtrar docs que pertenecen a esta empresa
    const docsForBiz = srcDocs.filter((doc) => {
      if (doc.business_id === bizId) return true;
      if (doc.user_id && memberIds.has(doc.user_id)) return true;
      return false;
    });

    if (DRY_RUN) {
      console.log(`   [DRY-RUN] ${dbType}: copiaría ${docsForBiz.length}/${srcDocs.length} docs de ${srcDbName} → ${targetDbName}`);
      entry.dbs[dbType] = { source: srcDbName, target: targetDbName, docCount: docsForBiz.length, dryRun: true };
      continue;
    }

    let copied = 0;
    let failed = 0;
    const errors = [];

    for (const doc of docsForBiz) {
      const cleanDoc = stripRev(doc);
      try {
        const { status, payload } = await couchPut(
          `/${encodeURIComponent(targetDbName)}/${encodeURIComponent(doc._id)}`,
          cleanDoc,
        );
        if ([201, 202].includes(status)) {
          copied++;
        } else if (status === 409) {
          // Documento ya existe en destino — ignorar (idempotente)
          copied++;
        } else {
          failed++;
          errors.push({ id: doc._id, status, reason: payload?.reason });
        }
      } catch (err) {
        failed++;
        errors.push({ id: doc._id, error: err.message });
      }
    }

    entry.dbs[dbType] = { source: srcDbName, target: targetDbName, copied, failed, errors: errors.slice(0, 10) };
    console.log(`   ${failed === 0 ? '✅' : '⚠️ '} ${dbType}: ${copied} copiados${failed > 0 ? `, ${failed} fallidos` : ''}`);
  }

  entry.status      = 'completed';
  entry.completedAt = new Date().toISOString();
  console.log(`   ✔ Empresa ${bizName} migrada.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Migración a arquitectura multi-tenant (I-10)');
  console.log(`  CouchDB: ${COUCH_BASE}`);
  console.log(`  Prefijo legado: ${LEGACY_PREFIX}`);
  console.log(`  Modo: ${DRY_RUN ? '⚡ DRY-RUN (sin cambios)' : '🔴 ESCRITURA REAL'}`);
  if (ONLY_BIZ) console.log(`  Empresa específica: ${ONLY_BIZ}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (!DRY_RUN) {
    console.log('⚠️  Tienes 5 segundos para cancelar (Ctrl+C)...');
    await new Promise((r) => setTimeout(r, 5000));
  }

  // Cargar empresas
  let businesses;
  try {
    const data = await getAllDocs('businesses');
    businesses = data.filter((d) => d.type === 'business' && !d.deletedAt);
  } catch (err) {
    console.error('❌ No se pudo cargar la lista de empresas:', err.message);
    process.exit(1);
  }

  if (ONLY_BIZ) {
    businesses = businesses.filter((b) => b._id === ONLY_BIZ);
    if (businesses.length === 0) {
      console.error(`❌ Empresa ${ONLY_BIZ} no encontrada`);
      process.exit(1);
    }
  }

  console.log(`Empresas encontradas: ${businesses.length}\n`);

  const migrationLog = [];

  for (const biz of businesses) {
    await migrateBusiness(biz, migrationLog).catch((err) => {
      console.error(`❌ Error migrando ${biz._id}:`, err.message);
      migrationLog.push({ businessId: biz._id, status: 'failed', error: err.message });
    });
  }

  // Guardar log
  if (!DRY_RUN) {
    fs.writeFileSync(LOG_FILE, JSON.stringify({ migratedAt: new Date().toISOString(), entries: migrationLog }, null, 2));
    console.log(`\n📄 Log de migración guardado en: ${LOG_FILE}`);
  }

  const success = migrationLog.filter((e) => e.status === 'completed').length;
  const failed  = migrationLog.filter((e) => e.status === 'failed').length;

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  Resumen: ${success} empresas migradas, ${failed} con errores`);
  console.log('  Próximo paso: revisar migration-log.json y activar');
  console.log('  MULTITENANT_ENABLED=true en .env cuando todo esté validado.');
  console.log('══════════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
