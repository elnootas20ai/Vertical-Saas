/**
 * I-10: Estrategia multi-tenant real — base de datos CouchDB por empresa.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ARQUITECTURA ACTUAL (legado)
 * ══════════════════════════════════════════════════════════════════════════════
 *   Todas las empresas comparten las mismas bases de datos CouchDB.
 *   El aislamiento se consigue filtrando por `user_id` en cada consulta.
 *
 *   vehicles      → todos los concesionarios mezclados, filtro: user_id
 *   accounts      → ídem
 *   {prefix}-sales → una DB por prefijo global (VITE_COUCHDB_DB)
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ARQUITECTURA NUEVA (multi-tenant)
 * ══════════════════════════════════════════════════════════════════════════════
 *   Cada empresa (business_id) tiene sus propias bases de datos CouchDB.
 *
 *   biz_{businessId}_vehicles
 *   biz_{businessId}_sales
 *   biz_{businessId}_clients
 *   biz_{businessId}_leads
 *   biz_{businessId}_documents
 *   biz_{businessId}_finance
 *   biz_{businessId}_locations
 *   biz_{businessId}_appointments
 *   biz_{businessId}_workshop
 *   biz_{businessId}_parts
 *   biz_{businessId}_gdpr_consents
 *   biz_{businessId}_gdpr_requests
 *
 *   Las DBs globales (accounts, businesses, notifications, changelog, invoice)
 *   permanecen compartidas pero filtradas por business_id / user_id según el caso.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ACTIVACIÓN
 * ══════════════════════════════════════════════════════════════════════════════
 *   MULTITENANT_ENABLED=true  en .env
 *
 *   Con MULTITENANT_ENABLED=false (default), este servicio devuelve los nombres
 *   de DB legados para mantener 100% de compatibilidad con el código existente.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * MIGRACIÓN
 * ══════════════════════════════════════════════════════════════════════════════
 *   Ver scripts/migrate-to-multitenant.js
 */

const MULTITENANT_ENABLED = process.env.MULTITENANT_ENABLED === 'true';
const LEGACY_PREFIX       = (process.env.VITE_COUCHDB_DB || 'udar').replace(/\/+$/, '');

// ── Tipos de DB por empresa ───────────────────────────────────────────────────

/**
 * Mapa de tipo lógico → sufijo de nombre de base de datos.
 * Cada entrada define cómo se llama la DB en el esquema multi-tenant.
 */
export const TENANT_DB_TYPES = Object.freeze({
  vehicles:      'vehicles',
  sales:         'sales',
  clients:       'clients',
  leads:         'leads',
  documents:     'documents',
  finance:       'finance',
  locations:     'locations',
  appointments:  'appointments',
  workshop:      'workshop',
  parts:         'parts',
  gdprConsents:  'gdpr_consents',
  gdprRequests:  'gdpr_requests',
  calls:         'calls',
  tradein:       'tradein',
});

/**
 * Bases de datos globales que NO están por empresa.
 * Permanecen compartidas entre todos los tenants.
 */
export const GLOBAL_DBS = Object.freeze({
  accounts:      'accounts',
  businesses:    'businesses',
  notifications: 'notifications',
  changelog:     'changelog',
  invoice:       'invoice',
  cards:         'cards',
});

// ── Resolución de nombres de DB ───────────────────────────────────────────────

/**
 * Normaliza un businessId para usarlo como parte de un nombre de DB CouchDB.
 * CouchDB exige: minúsculas, sólo letras/dígitos/guiones/subrayados/puntos.
 */
function sanitizeBusinessId(businessId) {
  return String(businessId || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60); // CouchDB limita a 238 chars, dejamos margen para el prefijo
}

/**
 * Devuelve el nombre de la base de datos CouchDB para un tenant y tipo dado.
 *
 * En modo multi-tenant:  "biz_{businessId}_{dbType}"
 * En modo legado:        nombre según el esquema anterior con LEGACY_PREFIX
 *
 * @param {string} dbType    - Clave de TENANT_DB_TYPES (p.ej. 'vehicles')
 * @param {string} businessId - ID de la empresa (UUID o slug)
 * @returns {string}
 */
export function getTenantDbName(dbType, businessId) {
  if (!MULTITENANT_ENABLED) {
    // Modo legado: devuelve el nombre de DB anterior para compatibilidad
    return getLegacyDbName(dbType);
  }

  const suffix = TENANT_DB_TYPES[dbType];
  if (!suffix) throw new Error(`Tipo de DB desconocido: ${dbType}`);

  const safeId = sanitizeBusinessId(businessId);
  if (!safeId) throw new Error(`businessId inválido para getTenantDbName: "${businessId}"`);

  return `biz_${safeId}_${suffix}`;
}

/**
 * Devuelve todos los nombres de DB de un tenant (para bootstrap o migración).
 *
 * @param {string} businessId
 * @returns {Record<string, string>}  { vehicles: 'biz_xxx_vehicles', ... }
 */
export function getAllTenantDbNames(businessId) {
  return Object.fromEntries(
    Object.keys(TENANT_DB_TYPES).map((type) => [type, getTenantDbName(type, businessId)]),
  );
}

/** Nombres de DB en modo legado (compatibilidad hacia atrás). */
function getLegacyDbName(dbType) {
  const legacyMap = {
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
  const name = legacyMap[dbType];
  if (!name) throw new Error(`Tipo de DB desconocido en modo legado: ${dbType}`);
  return name;
}

// ── Bootstrap de DBs por tenant ───────────────────────────────────────────────

/**
 * Crea (si no existen) todas las bases de datos para un tenant nuevo.
 * Se llama al crear una nueva empresa en businessController.
 *
 * @param {string} businessId
 * @param {{ baseUrl: string, authHeader?: string }} couchConfig
 * @returns {Promise<{ created: string[], existing: string[], failed: string[] }>}
 */
export async function bootstrapTenantDbs(businessId, { baseUrl, authHeader } = {}) {
  if (!MULTITENANT_ENABLED) return { created: [], existing: [], failed: [], skipped: true };

  const dbNames = Object.values(getAllTenantDbNames(businessId));
  const result  = { created: [], existing: [], failed: [] };

  await Promise.allSettled(
    dbNames.map(async (dbName) => {
      try {
        const res = await fetch(`${baseUrl}/${encodeURIComponent(dbName)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status === 201)     result.created.push(dbName);
        else if (res.status === 412) result.existing.push(dbName); // PreconditionFailed → ya existe
        else result.failed.push(dbName);
      } catch {
        result.failed.push(dbName);
      }
    }),
  );

  return result;
}

// ── Helpers de seguridad CouchDB ──────────────────────────────────────────────

/**
 * Configura los permisos de una DB de tenant para que sólo el usuario CouchDB
 * correspondiente a la empresa tenga acceso directo.
 * (Opcional — útil si se activa la autenticación por DB en CouchDB)
 *
 * @param {string} dbName
 * @param {string} couchDbUser  - Nombre del usuario CouchDB de la empresa
 * @param {{ baseUrl: string, authHeader: string }} couchConfig
 */
export async function setTenantDbSecurity(dbName, couchDbUser, { baseUrl, authHeader }) {
  const securityDoc = {
    admins:  { names: [], roles: ['_admin'] },
    members: { names: [couchDbUser], roles: [] },
  };

  const res = await fetch(`${baseUrl}/${encodeURIComponent(dbName)}/_security`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body:   JSON.stringify(securityDoc),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`No se pudo configurar seguridad en DB ${dbName}: HTTP ${res.status}`);
  }
}

// ── Exports de estado ─────────────────────────────────────────────────────────

export { MULTITENANT_ENABLED, LEGACY_PREFIX };
