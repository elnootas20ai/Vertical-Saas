import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import * as cacheService from './cache.js';
import { createInitialAlertHistory, deriveAlertTimeline, alertHistorySortKey } from './alertHistory.js';
import { computeSetupSteps } from '../models/setupSteps.js';
import { buildDefaultPersonalData, computeWorkerProfileCompletion, hasMinimumWorkerIdentity, WORKER_DEFAULT_LANDING_PATH } from './workerProfileCompletion.js';
import {
  assertAccountEmailUnique,
  findDuplicateEmailAccounts,
  pickPrimaryAccountByEmail,
} from './accountEmailRules.js';
import {
  ACCOUNT_AUTH_TOKEN_FIELDS,
  accountMatchesAuthToken,
  buildEmailVerificationTokenUpdate,
  hashAuthToken,
} from './accountAuthTokens.js';
import {
  buildClientSearchIndex,
  candidateIndicesForClientSearch,
  clientMatchesBusinessScope,
  clientSearchPrefersPhone,
  foldSearchText,
  normalizeClientBusinessScopeId,
  scoreClientSearchMatch,
} from '../shared/clients/clientSearchMatch.js';
import { resolveTerminalLoginFromDocs } from './terminalLoginResolve.js';
import {
  mergeCatalogCustomFields,
  resolveCatalogItemIsStockItem,
} from '../shared/catalog/catalogStockGuard.js';
import { nextPurchaseOrderNumber } from './purchaseOrderNumber.js';
import { resolvePurchaseInvoiceNumber } from './purchaseDocNumber.js';
import { sanitizeSupplierProductAliases } from '../shared/purchases/supplierProductAlias.js';
import { normalizeEsTaxPolicy } from '../shared/tax/spainVat.js';

export { clientMatchesBusinessScope };

function normalizeDbName(value) {
  return String(value || 'vertial')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_$()+/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getDbPrefix() {
  return normalizeDbName(process.env.COUCHDB_DB || 'vertial');
}

/** Base CouchDB histórica sin prefijo (datos antiguos). */
export const LEGACY_VEHICLES_DB = 'vehicles';

/** Base activa de inventario: p.ej. bbddsaas-vehicles (COUCHDB_DB + sufijo). */
export function getVehiclesDbName() {
  return normalizeDbName(
    process.env.VITE_VEHICLES_DB
      || process.env.COUCHDB_VEHICLES_DB
      || `${getDbPrefix()}-vehicles`,
  );
}

export const VEHICLES_DB = getVehiclesDbName();

export const ACCOUNTS_DB = 'accounts';
export const BUSINESSES_DB = 'businesses';
export const CARDS_DB = 'cards';
export const INVOICES_DB = 'invoice';
export const FLEET_DB = 'fleet';
export const NOTIFICATIONS_DB = 'notifications';
export const ACCOUNT_ACTIVITY_LIMIT = 50;
export const TEAM_PERMISSION_KEYS = ['vehicles', 'clients', 'sales', 'reservations', 'documents', 'finance', 'ancove', 'team', 'fleet', 'delivery', 'cash_register', 'cleaning_materials', 'acquisitions', 'butcher_waste', 'butcher_purchases', 'reports', 'scrapyard_docs', 'scrapyard', 'workshop'];

export const ROLE_DEFINITIONS = [
  {
    id: 'Admin',
    description: 'Acceso completo al panel y a la configuración del sistema.',
    permissions: ['all'],
  },
  {
    id: 'Gerente',
    description: 'Acceso completo a vehículos, clientes, ventas, documentos y equipo.',
    permissions: ['all'],
  },
  {
    id: 'Comercial',
    description: 'Gestión de vehículos, clientes, ventas y documentos.',
    permissions: ['vehicles', 'clients', 'sales', 'documents'],
  },
  {
    id: 'Administración',
    description: 'Acceso a finanzas, clientes y documentación.',
    permissions: ['finance', 'clients', 'documents'],
  },
  {
    id: 'Taller',
    description: 'Gestión de reparaciones, preparación y estado de vehículos.',
    permissions: ['workshop', 'vehicles'],
  },
  {
    id: 'Usuario',
    description: 'Acceso básico limitado según permisos asignados.',
    permissions: [],
  },
];

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next.toISOString();
}

/**
 * baseUrl sin userinfo (Node fetch/undici rechaza URLs con user:pass).
 * Auth vía COUCHDB_USER / COUCHDB_PASSWORD (cabecera Basic).
 * Si la URL legacy incluye credenciales y las env están vacías, se leen de la URL (migración).
 */
export function getCouchConfig(req) {
  void req;
  const raw = String(process.env.COUCHDB_URL || '').trim();
  let username = String(process.env.COUCHDB_USER || '');
  let password = String(process.env.COUCHDB_PASSWORD || '');
  let baseUrl = '';

  if (raw) {
    try {
      const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw}`;
      const u = new URL(href);
      const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
      baseUrl = normalizeBaseUrl(`${u.origin}${pathPart}`);
      if (!username && u.username) username = decodeURIComponent(u.username);
      if (!password && u.password) password = decodeURIComponent(u.password);
    } catch {
      baseUrl = normalizeBaseUrl(raw.replace(/^(https?:\/\/)(?:[^/@]+)@/i, '$1'));
    }
  }

  return { baseUrl, username, password };
}

export function buildCouchAuthHeader(req) {
  const cfg = getCouchConfig(req);
  if (!cfg.username || !cfg.password) {
    return '';
  }
  return `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}`;
}

export async function couchRequest(req, pathname, init = {}) {
  const cfg = getCouchConfig(req);
  if (!cfg.baseUrl) {
    throw new Error('COUCHDB_URL no configurado en backend');
  }

  const auth = buildCouchAuthHeader(req);
  const body = init.body;
  const isBinaryBody = Buffer.isBuffer(body)
    || body instanceof Uint8Array
    || (typeof Blob !== 'undefined' && body instanceof Blob);

  const response = await fetch(`${cfg.baseUrl}${pathname}`, {
    ...init,
    headers: {
      // JSON por defecto; NUNCA forzar json sobre adjuntos binarios (rompe fotos).
      ...(isBinaryBody ? {} : { 'Content-Type': 'application/json' }),
      ...(auth ? { Authorization: auth } : {}),
      ...(init.headers || {}),
    },
  });

  return response;
}

/**
 * Espera hasta que CouchDB en COUCHDB_URL responda (Docker suele arrancar después del proceso Node).
 * Variable de entorno: COUCH_WAIT_ATTEMPTS (default 15), COUCH_WAIT_MS (default 2000).
 * 401/403 cuentan como “vivo” (el servidor HTTP respondió).
 */
export async function waitForCouchDbReady(req, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts ?? process.env.COUCH_WAIT_ATTEMPTS ?? 15));
  const delayMs = Math.max(100, Number(options.delayMs ?? process.env.COUCH_WAIT_MS ?? 2000));
  const cfg = getCouchConfig(req);
  if (!cfg.baseUrl) {
    throw new Error('COUCHDB_URL no configurado');
  }

  let lastMessage = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await couchRequest(req, '/', { method: 'GET' });
      if (response.ok || response.status === 401 || response.status === 403) {
        return { attempts: attempt };
      }
      lastMessage = `HTTP ${response.status}`;
    } catch (err) {
      lastMessage = err instanceof Error ? err.message : String(err);
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(lastMessage || 'sin respuesta');
}

export async function ensureDatabase(req, dbName) {
  const encodedDbName = encodeURIComponent(dbName);
  const response = await couchRequest(req, `/${encodedDbName}`, { method: 'PUT' });
  const payload = await response.json().catch(() => ({}));

  if (![201, 202, 412].includes(response.status)) {
    throw new Error(payload?.reason || payload?.error || `No se pudo asegurar la base ${dbName}`);
  }

  return payload;
}

export async function getAllDocuments(req, dbName) {
  const cacheKey = cacheService.buildKey('db', dbName, 'all_docs_svc');
  const cached = cacheService.get(cacheKey);
  if (cached) return cached;

  const generationAtStart = cacheService.getDbGeneration(dbName);
  const encodedDbName = encodeURIComponent(dbName);
  const response = await couchRequest(req, `/${encodedDbName}/_all_docs?include_docs=true`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.reason || payload?.error || `No se pudieron leer documentos de ${dbName}`);
  }

  const docs = Array.isArray(payload.rows) ? payload.rows.map((row) => row.doc).filter(Boolean) : [];
  // No guardar si hubo escrituras mientras leíamos: evita re-cachear lista obsoleta tras registro/verify.
  if (cacheService.getDbGeneration(dbName) === generationAtStart) {
    cacheService.set(cacheKey, docs, cacheService.TTL_PRESETS.DOCS_LIST);
  }
  return docs;
}

/** Evita dos lecturas completas del delivery DB en paralelo (Caja: TPV + reparto). */
const deliveryDocumentsInflight = new Map();

export async function getDeliveryDatabaseDocumentsInflight(req) {
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  if (deliveryDocumentsInflight.has(db)) {
    return deliveryDocumentsInflight.get(db);
  }
  const promise = getAllDocuments(req, db).finally(() => {
    deliveryDocumentsInflight.delete(db);
  });
  deliveryDocumentsInflight.set(db, promise);
  return promise;
}

/** Evita lecturas duplicadas del catálogo en paralelo (TPV + catálogo + stock). */
const catalogDocumentsInflight = new Map();

export async function getCatalogDatabaseDocumentsInflight(req) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  if (catalogDocumentsInflight.has(db)) {
    return catalogDocumentsInflight.get(db);
  }
  const promise = getAllDocuments(req, db).finally(() => {
    catalogDocumentsInflight.delete(db);
  });
  catalogDocumentsInflight.set(db, promise);
  return promise;
}

export async function getDocument(req, dbName, docId) {
  const encodedDbName = encodeURIComponent(dbName);
  const encodedDocId = encodeURIComponent(docId);
  const response = await couchRequest(req, `/${encodedDbName}/${encodedDocId}`);
  const payload = await response.json().catch(() => ({}));

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(payload?.reason || payload?.error || `No se pudo leer ${docId}`);
  }

  return payload;
}

/**
 * Cache en memoria por titular (evita el tope 5MB del LRU global en cuentas grandes).
 * TTL largo: el TPV busca clientes todo el turno; recargar ~6k docs cada pocos minutos
 * hace que “a media tarde” vuelva a ir lento. Altas/ediciones invalidan al momento.
 */
const CLIENT_DOCS_TTL_MS = 30 * 60_000;
const clientDocumentsByUser = new Map();
/** Generación por titular: si sube durante un _find, no se escribe esa carga en caché. */
const clientDocumentsGeneration = new Map();
const clientsUserIndexReady = new Set();
const deliveryTypeUserIndexReady = new Set();

/** Índice type+user_id en delivery (sesiones caja / PDV) — evita _all_docs del DB entero. */
async function ensureDeliveryTypeUserIndex(req, dbName) {
  if (deliveryTypeUserIndexReady.has(dbName)) return;
  const safeDb = String(dbName || '').replace(/[^a-z0-9]/g, '-');
  await ensureIndex(req, dbName, ['type', 'user_id'], `idx-${safeDb}-type-user_id`).catch(() => null);
  // TPV/caja filtran por jornada: sin createdAt Couch puede tirar de todo el histórico.
  await ensureIndex(req, dbName, ['type', 'user_id', 'createdAt'], `idx-${safeDb}-type-user-created`).catch(() => null);
  await ensureIndex(req, dbName, ['type', 'user_id', 'status'], `idx-${safeDb}-type-user-status`).catch(() => null);
  await ensureIndex(
    req,
    dbName,
    ['type', 'user_id', 'closingValidationStatus'],
    `idx-${safeDb}-type-user-val`,
  ).catch(() => null);
  deliveryTypeUserIndexReady.add(dbName);
}
const clientDocumentsInflight = new Map();

function bumpClientDocumentsGeneration(uid) {
  const next = (clientDocumentsGeneration.get(uid) || 0) + 1;
  clientDocumentsGeneration.set(uid, next);
  return next;
}

export function invalidateClientDocumentsForUser(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return;
  bumpClientDocumentsGeneration(uid);
  clientDocumentsByUser.delete(uid);
  cacheService.invalidateByPrefix(`clients_user:${uid}:`);
}

/**
 * Tras alta/edición: mete el cliente en la caché viva para que el TPV lo encuentre al instante
 * sin esperar un reload de toda la cartera.
 */
/**
 * Fusiona un lote de clientes en la caché viva (un solo rebuild del índice de búsqueda).
 * Si no hay cartera en RAM, invalida: no sembramos parciales (TPV vería solo el lote).
 */
export function mergeClientDocumentsIntoCache(userId, documents) {
  const uid = String(userId || '').trim();
  if (!uid || !Array.isArray(documents) || documents.length === 0) return;

  const entry = clientDocumentsByUser.get(uid);
  if (!entry || !Array.isArray(entry.docs) || entry.docs.length === 0) {
    invalidateClientDocumentsForUser(uid);
    return;
  }

  const byId = new Map();
  for (const d of entry.docs) {
    const id = String(d?._id || d?.id || '').trim();
    if (id) byId.set(id, d);
  }

  let changed = false;
  for (const document of documents) {
    if (!document || document.type !== 'client') continue;
    const id = String(document._id || document.id || '').trim();
    if (!id) continue;
    if (document.deletedAt) {
      if (byId.delete(id)) changed = true;
      continue;
    }
    byId.set(id, document);
    changed = true;
  }
  if (!changed) return;

  bumpClientDocumentsGeneration(uid);
  const next = Array.from(byId.values());
  if (next.length === 0) {
    invalidateClientDocumentsForUser(uid);
    return;
  }
  writeClientDocumentsCache(uid, next);
  const cacheKey = cacheService.buildKey('clients_user', uid, 'all');
  cacheService.set(cacheKey, next, CLIENT_DOCS_TTL_MS);
}

export function upsertClientDocumentInCache(userId, document) {
  const uid = String(userId || '').trim();
  if (!uid || !document || document.type !== 'client') return;
  if (document.deletedAt) {
    removeClientDocumentFromCache(uid, document._id || document.id);
    return;
  }
  const entry = clientDocumentsByUser.get(uid);
  if (!entry || !Array.isArray(entry.docs) || entry.docs.length === 0) {
    // Sin cartera en RAM: invalidar para forzar reload limpio en la próxima búsqueda.
    invalidateClientDocumentsForUser(uid);
    return;
  }
  const id = String(document._id || document.id || '').trim();
  if (!id) {
    invalidateClientDocumentsForUser(uid);
    return;
  }
  bumpClientDocumentsGeneration(uid);
  const next = entry.docs.filter((d) => String(d?._id || d?.id || '') !== id);
  next.push(document);
  writeClientDocumentsCache(uid, next);
  const cacheKey = cacheService.buildKey('clients_user', uid, 'all');
  cacheService.set(cacheKey, next, CLIENT_DOCS_TTL_MS);
}

function removeClientDocumentFromCache(uid, rawId) {
  const id = String(rawId || '').trim();
  const entry = clientDocumentsByUser.get(uid);
  if (!entry || !Array.isArray(entry.docs) || !id) {
    invalidateClientDocumentsForUser(uid);
    return;
  }
  bumpClientDocumentsGeneration(uid);
  const next = entry.docs.filter((d) => String(d?._id || d?.id || '') !== id);
  if (next.length === 0) {
    invalidateClientDocumentsForUser(uid);
    return;
  }
  writeClientDocumentsCache(uid, next);
  const cacheKey = cacheService.buildKey('clients_user', uid, 'all');
  cacheService.set(cacheKey, next, CLIENT_DOCS_TTL_MS);
}

function readClientDocumentsCache(uid) {
  const entry = clientDocumentsByUser.get(uid);
  if (!entry) return null;
  if (Date.now() - entry.at > CLIENT_DOCS_TTL_MS) {
    clientDocumentsByUser.delete(uid);
    return null;
  }
  return entry.docs;
}

function readClientSearchBundle(uid) {
  const entry = clientDocumentsByUser.get(uid);
  if (!entry) return null;
  if (Date.now() - entry.at > CLIENT_DOCS_TTL_MS) {
    clientDocumentsByUser.delete(uid);
    return null;
  }
  if (!entry.searchIndex) {
    entry.searchIndex = buildClientSearchIndex(entry.docs);
  }
  return entry;
}

function writeClientDocumentsCache(uid, docs) {
  const list = Array.isArray(docs) ? docs : [];
  clientDocumentsByUser.set(uid, {
    at: Date.now(),
    docs: list,
    searchIndex: buildClientSearchIndex(list),
  });
}

/**
 * Lectura Mango paginada. Preferible a _all_docs cuando hay índice.
 */
export async function findDocuments(req, dbName, selector, options = {}) {
  const encodedDbName = encodeURIComponent(dbName);
  const pageSize = Math.min(Math.max(1, Number(options.pageSize) || 500), 1000);
  const maxDocs = Math.min(Math.max(1, Number(options.maxDocs) || 50_000), 100_000);
  const docs = [];
  let bookmark;
  let previousBookmark;

  while (docs.length < maxDocs) {
    const body = {
      selector,
      limit: Math.min(pageSize, maxDocs - docs.length),
    };
    if (bookmark) body.bookmark = bookmark;
    if (options.use_index) body.use_index = options.use_index;
    if (Array.isArray(options.sort) && options.sort.length > 0) {
      body.sort = options.sort;
    }

    const response = await couchRequest(req, `/${encodedDbName}/_find`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.reason || payload?.error || `Error en _find de ${dbName}`);
    }

    const batch = Array.isArray(payload.docs) ? payload.docs : [];
    docs.push(...batch);
    if (batch.length < pageSize) break;

    previousBookmark = bookmark;
    bookmark = payload.bookmark;
    if (!bookmark || bookmark === previousBookmark) break;
  }

  return docs;
}

export async function putDocument(req, dbName, docId, document) {
  const encodedDbName = encodeURIComponent(dbName);
  const encodedDocId = encodeURIComponent(docId);
  const response = await couchRequest(req, `/${encodedDbName}/${encodedDocId}`, {
    method: 'PUT',
    body: JSON.stringify(document),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(payload?.reason || payload?.error || `No se pudo guardar ${docId}`);
    err.statusCode = response.status;
    err.couchError = payload?.error || '';
    throw err;
  }

  cacheService.invalidateDb(dbName);
  cacheService.invalidateByPrefix('kpi:');
  cacheService.invalidateByPrefix('view:');
  if (document?.type === 'client' && document?.user_id) {
    upsertClientDocumentInCache(document.user_id, document);
  }

  return payload;
}

/**
 * Adjunta binario a un doc CouchDB (p. ej. fotos inmobiliaria).
 * Devuelve { ok, id, rev }.
 */
export async function putDocumentAttachment(
  req,
  dbName,
  docId,
  attachmentName,
  data,
  contentType = 'application/octet-stream',
  rev,
) {
  const encodedDbName = encodeURIComponent(dbName);
  const encodedDocId = encodeURIComponent(docId);
  const encodedName = encodeURIComponent(attachmentName);
  const revQ = rev ? `?rev=${encodeURIComponent(rev)}` : '';
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  // Uint8Array: undici/fetch a veces maltrata Buffer + Content-Type JSON por defecto.
  const body = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const response = await couchRequest(
    req,
    `/${encodedDbName}/${encodedDocId}/${encodedName}${revQ}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': contentType || 'application/octet-stream' },
      body,
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.reason || payload?.error || `No se pudo guardar adjunto ${attachmentName}`);
  }
  cacheService.invalidateDb(dbName);
  return payload;
}

/** Lee un adjunto como Buffer + content-type. */
export async function getDocumentAttachment(req, dbName, docId, attachmentName) {
  const encodedDbName = encodeURIComponent(dbName);
  const encodedDocId = encodeURIComponent(docId);
  const encodedName = encodeURIComponent(attachmentName);
  const response = await couchRequest(
    req,
    `/${encodedDbName}/${encodedDocId}/${encodedName}`,
    { headers: { Accept: '*/*' } },
  );
  if (!response.ok) {
    const payload = await response.text().catch(() => '');
    throw new Error(payload || `No se pudo leer adjunto ${attachmentName}`);
  }
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}

export async function bulkPutDocuments(req, dbName, docs) {
  const encodedDbName = encodeURIComponent(dbName);
  const response = await couchRequest(req, `/${encodedDbName}/_bulk_docs`, {
    method: 'POST',
    body: JSON.stringify({ docs }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.reason || payload?.error || `Error en bulk insert en ${dbName}`);
  }

  cacheService.invalidateDb(dbName);
  cacheService.invalidateByPrefix('kpi:');
  cacheService.invalidateByPrefix('view:');
  const clientsByUser = new Map();
  for (const doc of docs || []) {
    if (doc?.type !== 'client' || !doc?.user_id) continue;
    const uid = String(doc.user_id).trim();
    if (!uid) continue;
    if (!clientsByUser.has(uid)) clientsByUser.set(uid, []);
    clientsByUser.get(uid).push(doc);
  }
  for (const [uid, list] of clientsByUser) {
    // Soft-delete masivo: invalidar es barato; merge doc-a-doc reconstruye el índice miles de veces.
    if (list.length > 0 && list.every((d) => d?.deletedAt)) {
      invalidateClientDocumentsForUser(uid);
      continue;
    }
    mergeClientDocumentsIntoCache(uid, list);
  }

  return Array.isArray(payload) ? payload : [];
}

export async function deleteDocument(req, dbName, docId, rev) {
  const encodedDbName = encodeURIComponent(dbName);
  const encodedDocId = encodeURIComponent(docId);
  const encodedRev = encodeURIComponent(String(rev || ''));

  if (!encodedRev) {
    throw new Error('Falta rev para eliminar documento');
  }

  const response = await couchRequest(req, `/${encodedDbName}/${encodedDocId}?rev=${encodedRev}`, {
    method: 'DELETE',
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.reason || payload?.error || `No se pudo eliminar ${docId}`);
  }

  cacheService.invalidateDb(dbName);
  cacheService.invalidateByPrefix('kpi:');
  cacheService.invalidateByPrefix('view:');

  return payload;
}

export async function softDeleteDocument(req, dbName, docId) {
  const doc = await getDocument(req, dbName, docId);
  if (!doc) {
    throw new Error(`Documento ${docId} no encontrado en ${dbName}`);
  }

  const now = new Date().toISOString();
  const saved = await putDocument(req, dbName, docId, {
    ...doc,
    deletedAt: now,
    updatedAt: now,
  });

  // putDocument ya invalida clients_user si type=client; reforzar por si falta user_id en edge cases.
  if (doc?.type === 'client' && doc?.user_id) {
    invalidateClientDocumentsForUser(doc.user_id);
  }

  return saved;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeOptionalText(value) {
  const nextValue = normalizeText(value);
  return nextValue || undefined;
}

function normalizeRequiredNumber(value, fallback = 0) {
  const normalized = Number(String(value ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeOptionalNumber(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const normalized = Number(String(value).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(normalized) ? normalized : undefined;
}

function normalizeStatus(value) {
  const allowed = [
    'available', 'reserved', 'sold', 'workshop', 'scrapped',
    'received', 'dismantling', 'partially_dismantled', 'fully_dismantled', 'compacted',
  ];
  return allowed.includes(String(value || '')) ? value : 'available';
}

function normalizeFuelType(value) {
  const aliases = {
    gasolina: 'gasolina',
    gasoline: 'gasolina',
    diesel: 'diesel',
    diésel: 'diesel',
    hibrido: 'hibrido',
    híbrido: 'hibrido',
    hybrid: 'hibrido',
    electrico: 'electrico',
    eléctrico: 'electrico',
    electric: 'electrico',
    glp: 'glp',
    otro: 'otro',
  };
  const normalized = aliases[String(value || '').trim().toLowerCase()];
  return normalized || undefined;
}

function normalizeTransmission(value) {
  const aliases = {
    manual: 'manual',
    automatico: 'automatico',
    automático: 'automatico',
    automatic: 'automatico',
    semiauto: 'semiauto',
    semiauto: 'semiauto',
  };
  const normalized = aliases[String(value || '').trim().toLowerCase()];
  return normalized || undefined;
}

function normalizeOrigin(value) {
  const aliases = {
    particular: 'particular',
    proveedor: 'empresa',
    empresa: 'empresa',
    subasta: 'subasta',
    permuta: 'permuta',
    otro: 'otro',
  };
  const normalized = aliases[String(value || '').trim().toLowerCase()];
  return normalized || undefined;
}

const VEHICLE_DOC_TYPE_ALIASES = {
  ficha_tecnica: 'ficha_tecnica',
  technical_sheet: 'ficha_tecnica',
  permiso_circulacion: 'permiso_circulacion',
  registration_certificate: 'permiso_circulacion',
  itv: 'itv',
  mot: 'itv',
  seguro: 'seguro',
  insurance: 'seguro',
  contrato_compraventa: 'contrato_compraventa',
  purchase_contract: 'contrato_compraventa',
  informe_historial: 'informe_historial',
  history_report: 'informe_historial',
  factura_compra: 'factura_compra',
  purchase_invoice: 'factura_compra',
  otro: 'otro',
  other: 'otro',
};

export function normalizeVehicleDocType(type) {
  return VEHICLE_DOC_TYPE_ALIASES[(type || '').toLowerCase().trim()] || 'otro';
}

function normalizeBodyType(value) {
  const aliases = {
    sedan: 'sedan',
    sedán: 'sedan',
    suv: 'suv',
    familiar: 'familiar',
    coupe: 'coupe',
    coupé: 'coupe',
    cabrio: 'cabrio',
    furgon: 'furgon',
    furgón: 'furgon',
    pickup: 'pickup',
    'pick-up': 'pickup',
    otro: 'otro',
  };
  const normalized = aliases[String(value || '').trim().toLowerCase()];
  return normalized || undefined;
}

// ── Scrapyard Part helpers ───────────────────────────────────────────────────

function normalizePartCategory(cat) {
  const allowed = [
    'motor', 'caja_cambios', 'puertas', 'faros', 'paragolpes', 'llantas',
    'interior', 'centralitas', 'retrovisores', 'radiadores', 'transmision',
    'frenos', 'suspension', 'electricidad', 'carroceria', 'escape',
    'direccion', 'climatizacion', 'otra'
  ];
  const normalized = String(cat || '').toLowerCase().trim()
    .replace(/\s+/g, '_')
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ú/g, 'u');
  return allowed.includes(normalized) ? normalized : 'otra';
}

function normalizePartStatus(status) {
  const allowed = ['disponible', 'reservada', 'vendida', 'defectuosa', 'en_revision', 'desmontando'];
  const val = String(status || '').toLowerCase().trim();
  return allowed.includes(val) ? val : 'disponible';
}

function normalizeScrapyardOrigin(origin) {
  const allowed = ['particular', 'aseguradora', 'empresa', 'subasta', 'grua_municipal', 'otro'];
  const val = String(origin || '').toLowerCase().trim();
  return allowed.includes(val) ? val : null;
}

const PART_CATEGORY_PREFIXES = {
  motor: 'MOT', caja_cambios: 'CCM', puertas: 'PTA', faros: 'FAR',
  paragolpes: 'PAR', llantas: 'LLA', interior: 'INT', centralitas: 'CEN',
  retrovisores: 'RET', radiadores: 'RAD', transmision: 'TRN', frenos: 'FRE',
  suspension: 'SUS', electricidad: 'ELE', carroceria: 'CAR', escape: 'ESC',
  direccion: 'DIR', climatizacion: 'CLI', otra: 'OTR'
};

function generatePartCode(categoria) {
  const prefix = PART_CATEGORY_PREFIXES[categoria] || 'OTR';
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

function calculateDaysInStock(vehicle) {
  const baseDate = vehicle.purchaseDate || vehicle.createdAt;
  const parsed = new Date(baseDate);
  if (Number.isNaN(parsed.getTime())) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000));
}

function normalizeVehicleRepairStatus(value) {
  if (value === 0 || value === '0' || value === 'pending') return 'pending';
  if (value === 1 || value === '1' || value === 'in_progress') return 'in_progress';
  if (value === 2 || value === '2' || value === 'done') return 'done';
  return 'pending';
}

function normalizeVehicleRepairs(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(Boolean)
    .map((item) => ({
      id: String(item.id || `repair:${uuidv4()}`),
      concept: String(item.concept || '').trim(),
      date: String(item.date || new Date().toISOString().slice(0, 10)),
      amount: Number.isFinite(Number(item.amount)) ? Number(item.amount) : 0,
      status: normalizeVehicleRepairStatus(item.status),
      workshop: String(item.workshop || '').trim(),
      notes: String(item.notes || '').trim(),
    }));
}

function normalizeVehicleChecklist(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(Boolean)
    .map((item) => ({
      id: String(item.id || `check:${uuidv4()}`),
      task: String(item.task || '').trim(),
      done: Boolean(item.done),
      category: String(item.category || 'otro').trim() || 'otro',
    }));
}

const VEHICLE_COMMERCIAL_STATUSES = ['preparation', 'ready', 'published', 'reserved', 'sold'];

function normalizeVehicleCommercialStatus(value) {
  const normalized = String(value || '').trim();
  return VEHICLE_COMMERCIAL_STATUSES.includes(normalized) ? normalized : 'preparation';
}

const VEHICLE_PUBLICATION_CHANNEL_IDS = [
  'coches_net',
  'milanuncios',
  'wallapop',
  'facebook',
  'instagram',
  'autocasion',
  'web_propia',
  'otro',
];

function normalizePublicationChannels(incoming, existing) {
  const raw = Array.isArray(incoming)
    ? incoming
    : Array.isArray(existing)
      ? existing
      : [];
  return raw.filter(Boolean).map((channel) => {
    const channelIdRaw = String(channel.channelId || channel.id || '').trim();
    const channelId = VEHICLE_PUBLICATION_CHANNEL_IDS.includes(channelIdRaw) ? channelIdRaw : 'otro';
    const channelName = String(channel.channelName || channel.name || channelId).trim() || channelId;
    return {
      channelId,
      channelName,
      url: String(channel.url || '').trim(),
      publishedAt: String(channel.publishedAt || '').trim() || null,
      unpublishedAt: channel.unpublishedAt ? String(channel.unpublishedAt).trim() : null,
      active: channel.active !== false,
      notes: String(channel.notes || '').trim(),
    };
  });
}

function normalizeCommercialStatusHistory(incoming, existing) {
  const raw = Array.isArray(incoming)
    ? incoming
    : Array.isArray(existing)
      ? existing
      : [];
  return raw.filter(Boolean).map((entry) => ({
    id: String(entry.id || `csh:${uuidv4()}`),
    date: String(entry.date || new Date().toISOString()).trim(),
    userId: String(entry.userId || '').trim(),
    userName: String(entry.userName || '').trim(),
    fromStatus: normalizeVehicleCommercialStatus(entry.fromStatus),
    toStatus: normalizeVehicleCommercialStatus(entry.toStatus),
    reason: String(entry.reason || '').trim(),
  }));
}

export function buildVehicleDocument(userId, data = {}, existingVehicle = null, businessId = null) {
  const now = new Date().toISOString();

  // Normalise warranties array
  const rawWarranties = Array.isArray(data.warranties)
    ? data.warranties
    : Array.isArray(existingVehicle?.warranties)
      ? existingVehicle.warranties
      : [];
  const warranties = rawWarranties.filter(Boolean).map((w) => ({
    id: w.id || `w:${uuidv4()}`,
    type: ['factory', 'own'].includes(w.type) ? w.type : 'own',
    provider: String(w.provider || '').trim(),
    startDate: String(w.startDate || '').trim() || undefined,
    endDate: String(w.endDate || '').trim() || undefined,
    coverage: String(w.coverage || '').trim(),
    claims: Array.isArray(w.claims) ? w.claims.filter(Boolean) : [],
  }));

  // Normalise associated costs array
  const COST_CATEGORIES = ['preparacion', 'itv', 'limpieza', 'fotos', 'publicidad', 'otro',
    'compra', 'transporte', 'gestoria', 'documentacion', 'descontaminacion', 'compactacion', 'almacenamiento', 'reparacion_pieza'];
  const rawCosts = Array.isArray(data.associatedCosts)
    ? data.associatedCosts
    : Array.isArray(existingVehicle?.associatedCosts)
      ? existingVehicle.associatedCosts
      : [];
  const associatedCosts = rawCosts.filter(Boolean).map((c) => ({
    id: c.id || `cost:${uuidv4()}`,
    category: COST_CATEGORIES.includes(c.category) ? c.category : 'otro',
    description: String(c.description || '').trim(),
    amount: Number.isFinite(Number(c.amount)) ? Number(c.amount) : 0,
    date: String(c.date || now.slice(0, 10)).trim(),
  }));

  // Preserve price history (append-only — controller adds new entries)
  const priceHistory = Array.isArray(data.priceHistory)
    ? data.priceHistory
    : Array.isArray(existingVehicle?.priceHistory)
      ? existingVehicle.priceHistory
      : [];

  const workshopRepairs = normalizeVehicleRepairs(
    Array.isArray(data.workshopRepairs)
      ? data.workshopRepairs
      : existingVehicle?.workshopRepairs,
  );
  const workshopChecklist = normalizeVehicleChecklist(
    Array.isArray(data.workshopChecklist)
      ? data.workshopChecklist
      : existingVehicle?.workshopChecklist,
  );

  return {
    _id: existingVehicle?._id || `car:${uuidv4()}`,
    _rev: existingVehicle?._rev,
    type: 'car',
    active: true,
    user_id: userId,
    business_id: businessId || data.business_id || existingVehicle?.business_id || undefined,
    registrationPlate: normalizeText(data.registrationPlate).toUpperCase(),
    brand: normalizeText(data.brand),
    model: normalizeText(data.model),
    version: normalizeOptionalText(data.version),
    year: normalizeRequiredNumber(data.year),
    color: normalizeText(data.color),
    fuelType: normalizeFuelType(data.fuelType),
    mileage: normalizeOptionalNumber(data.mileage),
    vin: normalizeOptionalText(data.vin)?.toUpperCase(),
    transmission: normalizeTransmission(data.transmission),
    doors: normalizeOptionalNumber(data.doors),
    power: normalizeOptionalNumber(data.power),
    bodyType: normalizeBodyType(data.bodyType),
    purchasePrice: normalizeRequiredNumber(data.purchasePrice),
    salePrice: normalizeOptionalNumber(data.salePrice),
    purchaseDate: normalizeOptionalText(data.purchaseDate),
    origin: normalizeOrigin(data.origin),
    supplierName: normalizeOptionalText(data.supplierName),
    status: normalizeStatus(data.status),
    location: normalizeOptionalText(data.location),
    images: Array.isArray(data.images) ? data.images.filter(Boolean) : [],
    notes: normalizeOptionalText(data.notes),
    priceHistory,
    warranties,
    associatedCosts,
    workshopRepairs,
    workshopChecklist,
    stockAlertSentAt: data.stockAlertSentAt || existingVehicle?.stockAlertSentAt || undefined,

    // Commercial fields
    commercialDescription: normalizeOptionalText(data.commercialDescription) || existingVehicle?.commercialDescription || '',
    commercialStatus: normalizeVehicleCommercialStatus(data.commercialStatus || existingVehicle?.commercialStatus),
    published: typeof data.published === 'boolean' ? data.published : (existingVehicle?.published ?? false),
    publishedAt: (function () {
      if (data.published === true && !existingVehicle?.published) return now;
      if (data.published === false) return null;
      return data.publishedAt || existingVehicle?.publishedAt || null;
    })(),
    featured: typeof data.featured === 'boolean' ? data.featured : (existingVehicle?.featured ?? false),
    minimumSalePrice: normalizeOptionalNumber(data.minimumSalePrice) ?? existingVehicle?.minimumSalePrice ?? null,
    assignedCommercialId: normalizeOptionalText(data.assignedCommercialId) || existingVehicle?.assignedCommercialId || null,
    assignedCommercialName: normalizeOptionalText(data.assignedCommercialName) || existingVehicle?.assignedCommercialName || null,
    publicationChannels: normalizePublicationChannels(data.publicationChannels, existingVehicle?.publicationChannels),
    estimatedMargin: normalizeOptionalNumber(data.estimatedMargin) ?? existingVehicle?.estimatedMargin ?? null,
    totalPreparationCost: normalizeOptionalNumber(data.totalPreparationCost) ?? existingVehicle?.totalPreparationCost ?? null,
    marginPercentage: normalizeOptionalNumber(data.marginPercentage) ?? existingVehicle?.marginPercentage ?? null,
    commercialStatusHistory: normalizeCommercialStatusHistory(data.commercialStatusHistory, existingVehicle?.commercialStatusHistory),

    // Scrapyard dismantling fields
    dismantlingStartedAt: data.dismantlingStartedAt || existingVehicle?.dismantlingStartedAt || null,
    dismantlingCompletedAt: data.dismantlingCompletedAt || existingVehicle?.dismantlingCompletedAt || null,
    dismantlingProgress: typeof data.dismantlingProgress === 'number'
      ? Math.min(100, Math.max(0, data.dismantlingProgress))
      : existingVehicle?.dismantlingProgress ?? null,
    totalPartsExpected: typeof data.totalPartsExpected === 'number' ? data.totalPartsExpected : existingVehicle?.totalPartsExpected ?? null,
    totalPartsExtracted: typeof data.totalPartsExtracted === 'number' ? data.totalPartsExtracted : existingVehicle?.totalPartsExtracted ?? 0,
    procedencia: normalizeScrapyardOrigin(data.procedencia) || existingVehicle?.procedencia || null,
    entryDate: data.entryDate || existingVehicle?.entryDate || null,

    // Vehicle entry fields
    documents: (Array.isArray(data.documents) ? data.documents : Array.isArray(existingVehicle?.documents) ? existingVehicle.documents : [])
      .filter(Boolean).map((doc) => ({
        id: doc.id || `vdoc:${uuidv4()}`,
        name: String(doc.name || '').trim(),
        documentType: normalizeVehicleDocType(doc.documentType),
        fileUrl: String(doc.fileUrl || '').trim(),
        fileName: String(doc.fileName || '').trim(),
        mimeType: String(doc.mimeType || '').trim(),
        fileSize: typeof doc.fileSize === 'number' ? doc.fileSize : 0,
        attachmentName: String(doc.attachmentName || '').trim(),
        notes: String(doc.notes || '').trim(),
        expiresAt: doc.expiresAt || null,
        uploadedAt: doc.uploadedAt || now,
        uploadedBy: String(doc.uploadedBy || '').trim(),
      })),
    entryStatus: data.entryStatus || existingVehicle?.entryStatus || null,
    enteredBy: data.enteredBy || existingVehicle?.enteredBy || null,
    entryValidated: typeof data.entryValidated === 'boolean' ? data.entryValidated : (existingVehicle?.entryValidated ?? null),
    validatedBy: data.validatedBy || existingVehicle?.validatedBy || null,
    validatedAt: data.validatedAt || existingVehicle?.validatedAt || null,

    tradeInId: normalizeOptionalText(data.tradeInId) || existingVehicle?.tradeInId || undefined,
    acquisitionId: normalizeOptionalText(data.acquisitionId) || existingVehicle?.acquisitionId || undefined,

    archived: Boolean(data.archived ?? existingVehicle?.archived ?? false),
    archivedAt: data.archivedAt ?? existingVehicle?.archivedAt ?? null,
    createdByUserId: existingVehicle?.createdByUserId || data.createdByUserId || null,
    createdByName: existingVehicle?.createdByName || data.createdByName || null,
    vehicleHistory: Array.isArray(data.vehicleHistory)
      ? data.vehicleHistory
      : (Array.isArray(existingVehicle?.vehicleHistory) ? existingVehicle.vehicleHistory : []),

    createdAt: existingVehicle?.createdAt || now,
    updatedAt: now,
    soldAt: data.status === 'sold' ? data.soldAt || existingVehicle?.soldAt || now : existingVehicle?.soldAt,
  };
}

export function sanitizeVehicle(vehicle) {
  if (!vehicle) {
    return null;
  }

  return {
    id: vehicle._id,
    _rev: vehicle._rev,
    type: vehicle.type || 'car',
    active: vehicle.active !== false,
    user_id: vehicle.user_id,
    registrationPlate: vehicle.registrationPlate || '',
    brand: vehicle.brand || '',
    model: vehicle.model || '',
    version: vehicle.version || '',
    year: vehicle.year || 0,
    color: vehicle.color || '',
    fuelType: vehicle.fuelType,
    mileage: vehicle.mileage,
    vin: vehicle.vin,
    transmission: vehicle.transmission,
    doors: vehicle.doors,
    power: vehicle.power,
    bodyType: vehicle.bodyType,
    purchasePrice: vehicle.purchasePrice || 0,
    salePrice: vehicle.salePrice,
    purchaseDate: vehicle.purchaseDate,
    origin: vehicle.origin,
    supplierName: vehicle.supplierName,
    tradeInId: vehicle.tradeInId || undefined,
    acquisitionId: vehicle.acquisitionId || undefined,
    status: vehicle.status || 'available',
    location: vehicle.location,
    images: Array.isArray(vehicle.images) ? vehicle.images : [],
    notes: vehicle.notes,
    priceHistory: Array.isArray(vehicle.priceHistory) ? vehicle.priceHistory : [],
    warranties: Array.isArray(vehicle.warranties) ? vehicle.warranties : [],
    associatedCosts: Array.isArray(vehicle.associatedCosts) ? vehicle.associatedCosts : [],
    workshopRepairs: normalizeVehicleRepairs(vehicle.workshopRepairs),
    workshopChecklist: normalizeVehicleChecklist(vehicle.workshopChecklist),
    stockAlertSentAt: vehicle.stockAlertSentAt || null,
    commercialDescription: vehicle.commercialDescription || '',
    commercialStatus: normalizeVehicleCommercialStatus(vehicle.commercialStatus),
    published: vehicle.published === true,
    publishedAt: vehicle.publishedAt || null,
    featured: vehicle.featured === true,
    minimumSalePrice: vehicle.minimumSalePrice ?? null,
    assignedCommercialId: vehicle.assignedCommercialId || null,
    assignedCommercialName: vehicle.assignedCommercialName || null,
    publicationChannels: normalizePublicationChannels(vehicle.publicationChannels),
    commercialStatusHistory: normalizeCommercialStatusHistory(vehicle.commercialStatusHistory),
    documents: Array.isArray(vehicle.documents) ? vehicle.documents : [],
    archived: Boolean(vehicle.archived),
    archivedAt: vehicle.archivedAt || null,
    createdByUserId: vehicle.createdByUserId || null,
    createdByName: vehicle.createdByName || null,
    vehicleHistory: Array.isArray(vehicle.vehicleHistory) ? vehicle.vehicleHistory : [],
    totalPreparationCost: vehicle.totalPreparationCost ?? null,
    estimatedMargin: vehicle.estimatedMargin ?? null,
    marginPercentage: vehicle.marginPercentage ?? null,
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
    soldAt: vehicle.soldAt,
    deletedAt: vehicle.deletedAt || null,
    daysInStock: calculateDaysInStock(vehicle),
  };
}

export async function getAllVehicleDocuments(req) {
  const primary = getVehiclesDbName();
  const legacy = LEGACY_VEHICLES_DB;

  await ensureDatabase(req, primary);
  const primaryDocs = await getAllDocuments(req, primary).catch(() => []);

  if (legacy === primary) {
    return primaryDocs;
  }

  await ensureDatabase(req, legacy).catch(() => null);
  const legacyDocs = await getAllDocuments(req, legacy).catch(() => []);
  const byId = new Map();
  for (const doc of legacyDocs) {
    if (doc?._id) byId.set(doc._id, doc);
  }
  for (const doc of primaryDocs) {
    if (doc?._id) byId.set(doc._id, doc);
  }
  return [...byId.values()];
}

export async function resolveVehicleDbForDoc(req, vehicleId) {
  const primary = getVehiclesDbName();
  const legacy = LEGACY_VEHICLES_DB;

  await ensureDatabase(req, primary);
  const primaryDoc = await getDocument(req, primary, vehicleId).catch(() => null);
  if (primaryDoc) {
    return { db: primary, doc: primaryDoc };
  }

  if (legacy !== primary) {
    await ensureDatabase(req, legacy).catch(() => null);
    const legacyDoc = await getDocument(req, legacy, vehicleId).catch(() => null);
    if (legacyDoc) {
      return { db: legacy, doc: legacyDoc };
    }
  }

  return { db: primary, doc: null };
}

export async function saveVehicleDocument(req, docId, document) {
  const { db, doc: existing } = await resolveVehicleDbForDoc(req, docId);
  const targetDb = existing ? db : getVehiclesDbName();
  await ensureDatabase(req, targetDb);
  return putDocument(req, targetDb, docId, document);
}

export async function softDeleteVehicleDocument(req, vehicleId) {
  const { db, doc } = await resolveVehicleDbForDoc(req, vehicleId);
  if (!doc) {
    throw new Error(`Documento ${vehicleId} no encontrado`);
  }
  await ensureDatabase(req, db);
  return softDeleteDocument(req, db, vehicleId);
}

export async function listVehiclesByUser(req, userId, businessId = null, { includeArchived = false } = {}) {
  const docs = await getAllVehicleDocuments(req);
  const scopedBusinessId = normalizeClientBusinessScopeId(businessId);

  return docs
    .filter((doc) => {
      if (!doc || doc.type !== 'car' || doc.active === false || doc.deletedAt) return false;
      if (!includeArchived && doc.archived) return false;
      if (doc.user_id !== userId) return false;
      if (!scopedBusinessId) return true;
      const docBusinessId = normalizeClientBusinessScopeId(doc.business_id);
      if (!docBusinessId) return true;
      return docBusinessId === scopedBusinessId;
    })
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ── Scrapyard DB + Part / Dismantling builders ───────────────────────────────

export function getScrapyardDbName() {
  return 'scrapyard';
}

export function buildScrapyardPartDocument(userId, data, existing) {
  const now = new Date().toISOString();
  const categoria = normalizePartCategory(data.categoria);
  return {
    _id: existing?._id || `scrapyard_part:${uuidv4()}`,
    _rev: existing?._rev,
    type: 'scrapyard_part',
    user_id: userId,
    active: data.active !== false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    referencia: normalizeText(data.referencia),
    codigoInterno: normalizeText(data.codigoInterno) || existing?.codigoInterno || generatePartCode(categoria),
    nombre: normalizeText(data.nombre),
    categoria,
    subcategoria: normalizeText(data.subcategoria),
    vehiculoOrigenId: normalizeText(data.vehiculoOrigenId),
    vehiculoOrigenLabel: normalizeText(data.vehiculoOrigenLabel),
    vehiculoOrigenMatricula: normalizeText(data.vehiculoOrigenMatricula),
    estado: normalizePartStatus(data.estado),
    precioVenta: normalizeRequiredNumber(data.precioVenta),
    precioMinimo: normalizeRequiredNumber(data.precioMinimo),
    ubicacion: normalizeText(data.ubicacion),
    zona: normalizeText(data.zona),
    estanteria: normalizeText(data.estanteria),
    compatibilidades: Array.isArray(data.compatibilidades)
      ? data.compatibilidades.map(c => ({
          marca: normalizeText(c.marca),
          modelo: normalizeText(c.modelo),
          anioDesde: typeof c.anioDesde === 'number' ? c.anioDesde : null,
          anioHasta: typeof c.anioHasta === 'number' ? c.anioHasta : null,
          referenciasOEM: Array.isArray(c.referenciasOEM) ? c.referenciasOEM.map(r => String(r).trim()).filter(Boolean) : [],
        }))
      : existing?.compatibilidades || [],
    fotos: Array.isArray(data.fotos) ? data.fotos.filter(Boolean).slice(0, 20) : existing?.fotos || [],
    observaciones: normalizeText(data.observaciones),
    peso: typeof data.peso === 'number' ? data.peso : existing?.peso ?? null,
    garantiaMeses: typeof data.garantiaMeses === 'number' ? data.garantiaMeses : existing?.garantiaMeses ?? 3,
    despieceId: normalizeText(data.despieceId) || existing?.despieceId || '',
    desmontadoPor: normalizeText(data.desmontadoPor) || existing?.desmontadoPor || '',
    fechaDesmontaje: data.fechaDesmontaje || existing?.fechaDesmontaje || null,
    ordenDesmontaje: typeof data.ordenDesmontaje === 'number' ? data.ordenDesmontaje : existing?.ordenDesmontaje || 0,
    deletedAt: data.deletedAt || existing?.deletedAt || null,
  };
}

export const DEFAULT_DISMANTLING_TEMPLATE = [
  { categoria: 'motor', nombre: 'Motor completo' },
  { categoria: 'caja_cambios', nombre: 'Caja de cambios' },
  { categoria: 'puertas', nombre: 'Puerta delantera izquierda' },
  { categoria: 'puertas', nombre: 'Puerta delantera derecha' },
  { categoria: 'puertas', nombre: 'Puerta trasera izquierda' },
  { categoria: 'puertas', nombre: 'Puerta trasera derecha' },
  { categoria: 'puertas', nombre: 'Portón trasero / Maletero' },
  { categoria: 'faros', nombre: 'Faro delantero izquierdo' },
  { categoria: 'faros', nombre: 'Faro delantero derecho' },
  { categoria: 'faros', nombre: 'Piloto trasero izquierdo' },
  { categoria: 'faros', nombre: 'Piloto trasero derecho' },
  { categoria: 'paragolpes', nombre: 'Paragolpes delantero' },
  { categoria: 'paragolpes', nombre: 'Paragolpes trasero' },
  { categoria: 'llantas', nombre: 'Llanta + neumático DI' },
  { categoria: 'llantas', nombre: 'Llanta + neumático DD' },
  { categoria: 'llantas', nombre: 'Llanta + neumático TI' },
  { categoria: 'llantas', nombre: 'Llanta + neumático TD' },
  { categoria: 'interior', nombre: 'Asiento delantero izquierdo' },
  { categoria: 'interior', nombre: 'Asiento delantero derecho' },
  { categoria: 'interior', nombre: 'Asiento trasero completo' },
  { categoria: 'interior', nombre: 'Cuadro de instrumentos' },
  { categoria: 'interior', nombre: 'Volante + airbag' },
  { categoria: 'centralitas', nombre: 'Centralita motor (ECU)' },
  { categoria: 'centralitas', nombre: 'Centralita ABS' },
  { categoria: 'centralitas', nombre: 'Cuadro de fusibles' },
  { categoria: 'retrovisores', nombre: 'Retrovisor izquierdo' },
  { categoria: 'retrovisores', nombre: 'Retrovisor derecho' },
  { categoria: 'retrovisores', nombre: 'Retrovisor interior' },
  { categoria: 'radiadores', nombre: 'Radiador agua' },
  { categoria: 'radiadores', nombre: 'Radiador A/C (condensador)' },
  { categoria: 'escape', nombre: 'Catalizador' },
  { categoria: 'escape', nombre: 'Tubo de escape completo' },
  { categoria: 'direccion', nombre: 'Cremallera de dirección' },
  { categoria: 'suspension', nombre: 'Amortiguador delantero izquierdo' },
  { categoria: 'suspension', nombre: 'Amortiguador delantero derecho' },
  { categoria: 'transmision', nombre: 'Palier / transmisión izquierda' },
  { categoria: 'transmision', nombre: 'Palier / transmisión derecha' },
  { categoria: 'climatizacion', nombre: 'Compresor A/C' },
  { categoria: 'electricidad', nombre: 'Alternador' },
  { categoria: 'electricidad', nombre: 'Motor de arranque' },
];

export function buildDismantlingSession(userId, data, existing) {
  const now = new Date().toISOString();
  return {
    _id: existing?._id || `dismantling_session:${uuidv4()}`,
    _rev: existing?._rev,
    type: 'dismantling_session',
    user_id: userId,
    vehicleId: normalizeText(data.vehicleId),
    vehicleLabel: normalizeText(data.vehicleLabel),
    vehicleMatricula: normalizeText(data.vehicleMatricula),
    status: data.status || existing?.status || 'in_progress',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    completedAt: data.completedAt || existing?.completedAt || null,
    piezasPrevistas: Array.isArray(data.piezasPrevistas)
      ? data.piezasPrevistas.map(p => ({
          categoria: normalizePartCategory(p.categoria),
          nombre: normalizeText(p.nombre),
          extraida: !!p.extraida,
          partId: normalizeText(p.partId),
          noAplica: !!p.noAplica,
          motivoNoAplica: normalizeText(p.motivoNoAplica),
        }))
      : existing?.piezasPrevistas || [],
    historial: Array.isArray(data.historial) ? data.historial : existing?.historial || [],
    trabajadores: Array.isArray(data.trabajadores) ? data.trabajadores : existing?.trabajadores || [],
    observaciones: normalizeText(data.observaciones),
  };
}

export { normalizePartCategory, normalizePartStatus, generatePartCode };

// ── Scrapyard Worker + Task builders ────────────────────────────────────────

export function buildScrapyardWorkerDocument(userId, data, existing) {
  const now = new Date().toISOString();
  return {
    _id: existing?._id || `scrapyard_worker:${uuidv4()}`,
    _rev: existing?._rev,
    type: 'scrapyard_worker',
    user_id: userId,
    active: data.active !== false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    name: normalizeText(data.name),
    phone: normalizeText(data.phone),
    email: normalizeText(data.email),
    avatar: normalizeText(data.avatar),
    address: normalizeText(data.address),
    teamMemberId: normalizeText(data.teamMemberId) || existing?.teamMemberId || '',
    role: normalizeText(data.role),
    zone: normalizeText(data.zone),
    specializations: Array.isArray(data.specializations) ? data.specializations.map(s => String(s).trim()).filter(Boolean) : existing?.specializations || [],
    documents: Array.isArray(data.documents)
      ? data.documents.map(d => ({
          type: normalizeText(d.type),
          status: ['valid', 'pending', 'expired'].includes(d.status) ? d.status : 'pending',
          expiresAt: d.expiresAt || null,
          fileUrl: normalizeText(d.fileUrl),
          notes: normalizeText(d.notes),
        }))
      : existing?.documents || [],
    contractType: ['full_time', 'part_time', 'temporary', 'freelance'].includes(data.contractType) ? data.contractType : existing?.contractType || 'full_time',
    hourlyCost: typeof data.hourlyCost === 'number' ? data.hourlyCost : existing?.hourlyCost ?? 0,
    weeklyHours: typeof data.weeklyHours === 'number' ? data.weeklyHours : existing?.weeklyHours ?? 40,
    startDate: data.startDate || existing?.startDate || now.slice(0, 10),
    endDate: data.endDate || existing?.endDate || null,
    shift: ['manana', 'tarde', 'completa', 'rotativo'].includes(data.shift) ? data.shift : existing?.shift || 'completa',
    schedule: normalizeText(data.schedule),
    scheduleDetails: data.scheduleDetails || existing?.scheduleDetails || null,
    permissions: Array.isArray(data.permissions) ? data.permissions.map(p => String(p).trim()).filter(Boolean) : existing?.permissions || [],
    status: ['active', 'inactive', 'vacation', 'sick_leave'].includes(data.status) ? data.status : existing?.status || 'active',
    notes: normalizeText(data.notes),
    deletedAt: data.deletedAt || existing?.deletedAt || null,
  };
}

export function buildScrapyardTaskDocument(userId, data, existing) {
  const now = new Date().toISOString();
  const validTypes = ['recepcion', 'desmontaje', 'catalogacion', 'almacen', 'venta', 'expedicion'];
  const validStatuses = ['pending', 'assigned', 'in_progress', 'paused', 'completed', 'cancelled'];
  const validPriorities = ['low', 'normal', 'high', 'urgent'];
  return {
    _id: existing?._id || `scrapyard_task:${uuidv4()}`,
    _rev: existing?._rev,
    type: 'scrapyard_task',
    user_id: userId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    taskType: validTypes.includes(data.taskType) ? data.taskType : existing?.taskType || 'desmontaje',
    assignedWorkerId: normalizeText(data.assignedWorkerId) || existing?.assignedWorkerId || '',
    assignedWorkerName: normalizeText(data.assignedWorkerName) || existing?.assignedWorkerName || '',
    vehicleId: normalizeText(data.vehicleId) || existing?.vehicleId || '',
    vehiclePlate: normalizeText(data.vehiclePlate) || existing?.vehiclePlate || '',
    vehicleModel: normalizeText(data.vehicleModel) || existing?.vehicleModel || '',
    partIds: Array.isArray(data.partIds) ? data.partIds.filter(Boolean) : existing?.partIds || [],
    saleId: normalizeText(data.saleId) || existing?.saleId || '',
    orderId: normalizeText(data.orderId) || existing?.orderId || '',
    title: normalizeText(data.title),
    description: normalizeText(data.description),
    priority: validPriorities.includes(data.priority) ? data.priority : existing?.priority || 'normal',
    zone: normalizeText(data.zone),
    status: validStatuses.includes(data.status) ? data.status : existing?.status || 'pending',
    scheduledDate: data.scheduledDate || existing?.scheduledDate || now.slice(0, 10),
    scheduledStartTime: normalizeText(data.scheduledStartTime) || existing?.scheduledStartTime || '',
    estimatedMinutes: typeof data.estimatedMinutes === 'number' ? data.estimatedMinutes : existing?.estimatedMinutes ?? 60,
    timeEntries: Array.isArray(data.timeEntries) ? data.timeEntries : existing?.timeEntries || [],
    totalMinutes: typeof data.totalMinutes === 'number' ? data.totalMinutes : existing?.totalMinutes ?? 0,
    result: data.result || existing?.result || null,
    completedAt: data.completedAt || existing?.completedAt || null,
    deletedAt: data.deletedAt || existing?.deletedAt || null,
  };
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function buildDefaultEmploymentInfo(overrides = {}) {
  const base = overrides && typeof overrides === 'object' ? overrides : {};
  return {
    department: String(base.department || '').trim(),
    position: String(base.position || '').trim(),
    schedule: String(base.schedule || '').trim(),
    notes: String(base.notes || '').trim(),
    skills: Array.isArray(base.skills) ? base.skills.map(s => ({
      id: String(s.id || '').trim(),
      name: String(s.name || '').trim(),
      level: Math.max(1, Math.min(5, Number(s.level) || 1)),
    })) : [],
    startDate: String(base.startDate || '').trim(),
    endDate: String(base.endDate || '').trim(),
    contractType: String(base.contractType || '').trim(),
    workday: String(base.workday || '').trim(),
    salary: String(base.salary || '').trim(),
    bankAccount: String(base.bankAccount || '').trim(),
    bankName: String(base.bankName || '').trim(),
    emergencyContact: String(base.emergencyContact || '').trim(),
    emergencyPhone: String(base.emergencyPhone || '').trim(),
    salesPointId: String(base.salesPointId || '').trim(),
    contributionGroup: String(base.contributionGroup || '').trim(),
    mutualInsurance: String(base.mutualInsurance || '').trim(),
    terminationReason: String(base.terminationReason || '').trim(),
    terminationType: base.terminationType || undefined,
    grossSalary: base.grossSalary != null ? Number(base.grossSalary) : undefined,
    payPeriodsPerYear: base.payPeriodsPerYear != null ? Number(base.payPeriodsPerYear) : undefined,
    socialSecurityCost: base.socialSecurityCost != null ? Number(base.socialSecurityCost) : undefined,
    employeeSsRate: base.employeeSsRate != null ? Number(base.employeeSsRate) : undefined,
    irpfRate: base.irpfRate != null ? Number(base.irpfRate) : undefined,
    otherCosts: base.otherCosts != null ? Number(base.otherCosts) : undefined,
    costCurrency: base.costCurrency || undefined,
    costPeriod: base.costPeriod || undefined,
    lastCostReview: base.lastCostReview || undefined,
    nextCostReview: base.nextCostReview || undefined,
    baseProductivity: base.baseProductivity || undefined,
    assignments: Array.isArray(base.assignments) ? base.assignments : undefined,
  };
}

export function buildDefaultPermissionMatrix(role = 'Usuario') {
  // Alineado con buildRolePermissionsMatrix (roleCatalog) y TEAM_MANAGER_ROLES:
  // Gestor RRHH necesita team + documents (nóminas / contratos).
  const allEnabled =
    role === 'Admin'
    || role === 'Gerente'
    || role === 'Administrador'
    || role === 'Encargado'
    || role === 'Gestor'
    || role === 'GerenteGrupo'
    || role === 'Superadmin';
  const base = TEAM_PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = { view: allEnabled, edit: allEnabled };
    return acc;
  }, {});

  if (allEnabled) {
    return base;
  }

  const presets = {
    Comercial: ['vehicles', 'clients', 'sales', 'documents'],
    Administración: ['clients', 'documents', 'finance', 'ancove'],
    Taller: ['workshop', 'vehicles'],
    // "Usuario" es el rol por defecto cuando se invita a un trabajador sin elegir
    // rol específico. Le damos visibilidad operativa básica multi-vertical
    // (sales/delivery/cash_register) para que un trabajador delivery, peluquería,
    // limpieza, etc. tenga al menos algo que hacer al entrar. El owner puede
    // restringir más tarde desde Ajustes → Equipo.
    Usuario: ['vehicles', 'clients', 'sales', 'delivery', 'cash_register'],
    'Mostrador / Atención': ['clients', 'sales', 'delivery', 'cash_register', 'documents'],
    Cocina: ['delivery', 'documents'],
    Reparto: ['delivery', 'fleet'],
    Operaciones: ['clients', 'documents', 'sales'],
  };

  const readWriteModules = presets[role] || [];
  for (const key of readWriteModules) {
    base[key] = { view: true, edit: true };
  }

  if (role === 'Usuario') {
    base.clients = { view: true, edit: false };
  }

  return base;
}

export function normalizePermissionMatrix(value, role = 'Usuario') {
  const fallback = buildDefaultPermissionMatrix(role);

  if (Array.isArray(value)) {
    if (value.includes('all')) {
      return buildDefaultPermissionMatrix('Admin');
    }
    for (const key of TEAM_PERMISSION_KEYS) {
      const enabled = value.includes(key);
      fallback[key] = {
        view: enabled,
        edit: enabled,
      };
    }
    return fallback;
  }

  if (!value || typeof value !== 'object') {
    return fallback;
  }

  for (const key of TEAM_PERMISSION_KEYS) {
    const raw = value[key];
    // Clave ausente: conservar el preset del rol (Admin/Gerente = todo visible).
    if (raw === undefined || raw === null) {
      continue;
    }
    // Formato legacy { read, write, delete } de cuentas seed / bootstrap antiguas.
    const view = Boolean(raw.view ?? raw.read);
    const edit = Boolean(raw.edit ?? raw.write ?? raw.delete);
    fallback[key] = {
      view: view || edit,
      edit,
    };
  }

  return fallback;
}

// ─── Vehicle sub-permissions (PV-07) ────────────────────────────────────────

const DEFAULT_VEHICLE_SUB_PERMISSIONS_MANAGER = {
  canEditPrices: true,
  canSetMinimumPrice: true,
  canPublish: true,
  canChangeCommercialStatus: true,
  canAssignCommercial: true,
  canSeeMargins: true,
  canViewAllStock: true,
  canViewFinancials: true,
  canChangeStatus: true,
  canCreateEntry: true,
  canUploadPhotos: true,
  canUploadDocs: true,
  canSetPurchasePrice: true,
  canSetSalePrice: true,
  canOverrideDuplicate: true,
  canValidateEntry: true,
};

const DEFAULT_VEHICLE_SUB_PERMISSIONS_WORKER = {
  canEditPrices: false,
  canSetMinimumPrice: false,
  canPublish: false,
  canChangeCommercialStatus: false,
  canAssignCommercial: false,
  canSeeMargins: false,
  canViewAllStock: false,
  canViewFinancials: false,
  canChangeStatus: true,
  canCreateEntry: true,
  canUploadPhotos: true,
  canUploadDocs: true,
  canSetPurchasePrice: false,
  canSetSalePrice: false,
  canOverrideDuplicate: false,
  canValidateEntry: false,
};

export function buildVehicleSubPermissions(role, overrides = null) {
  const isManager = role === 'Admin' || role === 'Gerente';
  const defaults = isManager ? DEFAULT_VEHICLE_SUB_PERMISSIONS_MANAGER : DEFAULT_VEHICLE_SUB_PERMISSIONS_WORKER;

  if (!overrides || typeof overrides !== 'object') return { ...defaults };

  return {
    canEditPrices: typeof overrides.canEditPrices === 'boolean' ? overrides.canEditPrices : defaults.canEditPrices,
    canSetMinimumPrice: typeof overrides.canSetMinimumPrice === 'boolean' ? overrides.canSetMinimumPrice : defaults.canSetMinimumPrice,
    canPublish: typeof overrides.canPublish === 'boolean' ? overrides.canPublish : defaults.canPublish,
    canChangeCommercialStatus: typeof overrides.canChangeCommercialStatus === 'boolean' ? overrides.canChangeCommercialStatus : defaults.canChangeCommercialStatus,
    canAssignCommercial: typeof overrides.canAssignCommercial === 'boolean' ? overrides.canAssignCommercial : defaults.canAssignCommercial,
    canSeeMargins: typeof overrides.canSeeMargins === 'boolean' ? overrides.canSeeMargins : defaults.canSeeMargins,
    canViewAllStock: typeof overrides.canViewAllStock === 'boolean' ? overrides.canViewAllStock : defaults.canViewAllStock,
    canViewFinancials: typeof overrides.canViewFinancials === 'boolean' ? overrides.canViewFinancials : defaults.canViewFinancials,
    canChangeStatus: typeof overrides.canChangeStatus === 'boolean' ? overrides.canChangeStatus : defaults.canChangeStatus,
  };
}

// S-04: Extrae la IP real del cliente considerando proxies
export function extractIp(req) {
  if (!req) return 'unknown';
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

// S-07: Parsea el User-Agent para descripción legible del dispositivo
export function parseUserAgent(ua) {
  const str = String(ua || '');
  const browser =
    str.includes('Firefox') ? 'Firefox' :
    str.includes('Edg/') || str.includes('Edge/') ? 'Edge' :
    str.includes('Chrome') ? 'Chrome' :
    str.includes('Safari') ? 'Safari' :
    str.includes('MSIE') || str.includes('Trident') ? 'IE' : 'Desconocido';
  const os =
    str.includes('Windows') ? 'Windows' :
    str.includes('Mac') ? 'macOS' :
    str.includes('iPhone') || str.includes('iPad') ? 'iOS' :
    str.includes('Android') ? 'Android' :
    str.includes('Linux') ? 'Linux' : 'Desconocido';
  const device =
    str.includes('Mobile') || str.includes('iPhone') || (str.includes('Android') && !str.includes('Tablet')) ? 'Móvil' :
    str.includes('iPad') || str.includes('Tablet') ? 'Tablet' : 'Escritorio';
  return { browser, os, device };
}

export function buildActivityRecord({
  type = 'system',
  action,
  entityId = '',
  entityLabel = '',
  actorUserId = '',
  actorName = '',
  targetUserId = '',
  metadata = {},
  createdAt,
  ip = '',
}) {
  return {
    id: `activity:${uuidv4()}`,
    type: String(type || 'system').trim(),
    action: String(action || '').trim(),
    entityId: String(entityId || '').trim(),
    entityLabel: String(entityLabel || '').trim(),
    actorUserId: String(actorUserId || '').trim(),
    actorName: String(actorName || '').trim(),
    targetUserId: String(targetUserId || '').trim(),
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    ip: String(ip || '').trim(),
    createdAt: createdAt || new Date().toISOString(),
  };
}

function normalizeNotificationLevel(value) {
  const allowed = ['success', 'warning', 'info', 'alert'];
  return allowed.includes(String(value || '')) ? String(value) : 'info';
}

const VALID_PRIORITIES = ['high', 'medium', 'low'];
const VALID_ALERT_STATUSES = ['new', 'seen', 'resolved'];
const VALID_SOURCES = [
  'finanzas', 'stock', 'equipo', 'documentacion', 'verticales', 'delivery',
  'construccion', 'limpieza', 'ocr', 'conciliacion', 'crm', 'taller', 'carniceria',
  'compraventa', 'adquisiciones', 'desguaces', 'sistema', 'eventos',
];

const LEVEL_PRIORITY_MAP = { alert: 'high', warning: 'medium', info: 'low', success: 'low' };
const CATEGORY_SOURCE_MAP = {
  out_of_stock: 'stock', low_stock: 'stock', parts_low_stock: 'stock',
  overdue_purchase: 'finanzas', high_payables: 'finanzas', low_sales_velocity: 'finanzas',
  payment_overdue: 'finanzas', negative_cash_flow: 'finanzas', client_payment_overdue: 'finanzas',
  stale_web_order: 'verticales', stale_delivery: 'verticales',
  vehicle_stock_aging: 'stock', stale_work_order: 'taller',
  worker_no_clockin: 'equipo', worker_late_clockin: 'equipo', contract_expiring: 'equipo',
  document_expired: 'documentacion', document_expiring_soon: 'documentacion',
  fleet_itv_expiring: 'documentacion', fleet_insurance_expiring: 'documentacion',
  invoice_pending_validation: 'ocr', bank_unreconciled: 'conciliacion',
  purchase_order_delayed: 'stock', booking_no_show: 'verticales',
  lead_new: 'crm', lead_stale: 'crm',
  events_quote_accepted: 'eventos', events_fully_paid: 'eventos',
  events_cash_pending_close: 'eventos', events_cash_discrepancy: 'eventos',
  events_register_closed_ok: 'eventos', merma_registered: 'eventos',
};

export function buildNotificationDocument({
  userId,
  level = 'info',
  category = 'system',
  title,
  message,
  entityId = '',
  entityType = '',
  route = '',
  metadata = {},
  read = false,
  createdAt,
  priority,
  status,
  businessId = '',
  source,
  channels,
  assignedTo,
  resolvedAt = null,
  resolvedBy = null,
}) {
  const now = createdAt || new Date().toISOString();
  const normalizedLevel = normalizeNotificationLevel(level);
  const cat = String(category || 'system').trim() || 'system';
  const uid = String(userId || '').trim();

  const derivedPriority = priority && VALID_PRIORITIES.includes(priority)
    ? priority
    : (LEVEL_PRIORITY_MAP[normalizedLevel] || 'medium');

  const derivedStatus = status && VALID_ALERT_STATUSES.includes(status)
    ? status
    : (read ? 'seen' : 'new');

  const derivedSource = source && VALID_SOURCES.includes(source)
    ? source
    : (CATEGORY_SOURCE_MAP[cat] || 'sistema');

  const normalizedAssignedTo = assignedTo && typeof assignedTo === 'object'
    ? {
        userIds: Array.isArray(assignedTo.userIds) ? assignedTo.userIds.map(String) : (uid ? [uid] : []),
        roles: Array.isArray(assignedTo.roles) ? assignedTo.roles.map(String) : [],
      }
    : { userIds: uid ? [uid] : [], roles: [] };

  return {
    _id: `notification:${uuidv4()}`,
    type: 'notification',
    user_id: uid,
    level: normalizedLevel,
    category: cat,
    title: String(title || '').trim(),
    message: String(message || '').trim(),
    entityId: String(entityId || '').trim(),
    entityType: String(entityType || '').trim(),
    route: String(route || '').trim(),
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    read: derivedStatus !== 'new',
    priority: derivedPriority,
    status: derivedStatus,
    businessId: String(businessId || '').trim(),
    source: derivedSource,
    channels: Array.isArray(channels) ? channels : ['inApp'],
    assignedTo: normalizedAssignedTo,
    resolvedAt: resolvedAt || null,
    resolvedBy: resolvedBy || null,
    seenAt: null,
    seenBy: null,
    statusHistory: createInitialAlertHistory({ status: derivedStatus, at: now, by: uid || null }),
    createdAt: now,
    updatedAt: now,
  };
}

export function sanitizeNotification(notification) {
  if (!notification) {
    return null;
  }

  const level = normalizeNotificationLevel(notification.level);
  const cat = String(notification.category || 'system');
  const uid = notification.user_id || '';

  const priority = notification.priority && VALID_PRIORITIES.includes(notification.priority)
    ? notification.priority
    : (LEVEL_PRIORITY_MAP[level] || 'medium');

  const status = notification.status && VALID_ALERT_STATUSES.includes(notification.status)
    ? notification.status
    : (notification.read ? 'seen' : 'new');

  const source = notification.source && VALID_SOURCES.includes(notification.source)
    ? notification.source
    : (CATEGORY_SOURCE_MAP[cat] || 'sistema');

  const assignedTo = notification.assignedTo && typeof notification.assignedTo === 'object'
    ? {
        userIds: Array.isArray(notification.assignedTo.userIds) ? notification.assignedTo.userIds : (uid ? [uid] : []),
        roles: Array.isArray(notification.assignedTo.roles) ? notification.assignedTo.roles : [],
      }
    : { userIds: uid ? [uid] : [], roles: [] };

  return {
    id: notification._id,
    _rev: notification._rev,
    user_id: uid,
    level,
    category: cat,
    title: String(notification.title || ''),
    message: String(notification.message || ''),
    entityId: String(notification.entityId || ''),
    entityType: String(notification.entityType || ''),
    route: String(notification.route || ''),
    metadata: notification.metadata && typeof notification.metadata === 'object' ? notification.metadata : {},
    read: status !== 'new',
    priority,
    status,
    businessId: String(notification.businessId || ''),
    source,
    channels: Array.isArray(notification.channels) ? notification.channels : ['inApp'],
    assignedTo,
    resolvedAt: notification.resolvedAt || null,
    resolvedBy: notification.resolvedBy || null,
    seenAt: notification.seenAt || null,
    seenBy: notification.seenBy || null,
    deletedBy: notification.deletedBy || null,
    statusHistory: deriveAlertTimeline(notification),
    createdAt: String(notification.createdAt || new Date().toISOString()),
    updatedAt: String(notification.updatedAt || notification.createdAt || new Date().toISOString()),
    deletedAt: notification.deletedAt || null,
    kind: notification.kind || notification.metadata?.kind || null,
    polarity: notification.polarity || notification.metadata?.polarity || null,
    excludeFromAlertCenter: Boolean(
      notification.excludeFromAlertCenter
      || notification.metadata?.excludeFromAlertCenter
      || notification.kind === 'activity'
      || notification.kind === 'positive'
      || notification.metadata?.kind === 'activity'
      || notification.metadata?.kind === 'positive'
      || notification.polarity === 'positive'
      || notification.metadata?.polarity === 'positive',
    ),
  };
}

export async function listNotificationsByUser(req, userId) {
  await ensureDatabase(req, NOTIFICATIONS_DB);
  const uid = String(userId || '').trim();
  if (!uid) return [];

  let docs = [];
  try {
    docs = await findDocuments(
      req,
      NOTIFICATIONS_DB,
      { type: 'notification', user_id: uid },
      { pageSize: 400, maxDocs: 3_000 },
    );
  } catch {
    docs = await getAllDocuments(req, NOTIFICATIONS_DB);
  }

  return docs
    .filter((doc) => {
      if (doc?.type !== 'notification' || doc?.deletedAt) return false;
      if (String(doc?.user_id || '') === uid) return true;
      const assigned = Array.isArray(doc?.assignedTo?.userIds) ? doc.assignedTo.userIds : [];
      return assigned.some((id) => String(id) === uid);
    })
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function findNotificationById(req, notificationId) {
  if (!notificationId) {
    return null;
  }

  await ensureDatabase(req, NOTIFICATIONS_DB);
  return getDocument(req, NOTIFICATIONS_DB, notificationId);
}

export async function saveNotification(req, notification) {
  if (!notification?._id) {
    throw new Error('Documento de notificación inválido');
  }

  await ensureDatabase(req, NOTIFICATIONS_DB);
  const result = await putDocument(req, NOTIFICATIONS_DB, notification._id, notification);
  return { ...notification, _rev: result.rev };
}

function normalizeRecentActivity(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(Boolean)
    .map((item) => ({
      id: String(item.id || `activity:${uuidv4()}`),
      type: String(item.type || 'system'),
      action: String(item.action || ''),
      entityId: String(item.entityId || ''),
      entityLabel: String(item.entityLabel || ''),
      actorUserId: String(item.actorUserId || ''),
      actorName: String(item.actorName || ''),
      targetUserId: String(item.targetUserId || ''),
      metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : {},
      ip: String(item.ip || ''),
      createdAt: String(item.createdAt || new Date().toISOString()),
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, ACCOUNT_ACTIVITY_LIMIT);
}

// S-07: Normaliza el array de sesiones activas (filtra expiradas)
function normalizeSessions(sessions) {
  if (!Array.isArray(sessions)) return [];
  const now = new Date();
  return sessions
    .filter((s) => s && s.sessionId && (s.refreshTokenHash || s.tokenHash) && s.expiry && new Date(s.expiry) > now)
    .map((s) => ({
      sessionId: String(s.sessionId),
      refreshTokenHash: String(s.refreshTokenHash || s.tokenHash || ''),
      expiry: String(s.expiry),
      deviceInfo: s.deviceInfo && typeof s.deviceInfo === 'object' ? s.deviceInfo : {},
      ipAddress: String(s.ipAddress || ''),
      lastActiveAt: String(s.lastActiveAt || s.createdAt || new Date().toISOString()),
      createdAt: String(s.createdAt || new Date().toISOString()),
    }));
}

export function hashToken(rawToken) {
  return hashAuthToken(rawToken);
}

/** Tras localizar una cuenta en lista cacheada, relee el doc en CouchDB antes de confiar en el token. */
async function readFreshAccountForAuthToken(req, account, rawToken, fields) {
  if (!account?._id) return null;
  const fresh = await getDocument(req, ACCOUNTS_DB, account._id);
  if (!accountMatchesAuthToken(fresh, rawToken, fields)) return null;
  return fresh;
}

async function findAccountByAuthTokenInList(req, rawToken, fields) {
  if (!rawToken) return null;
  const accounts = await listAccounts(req);
  const match = accounts.find((a) => accountMatchesAuthToken(a, rawToken, fields));
  if (!match?._id) return null;
  return readFreshAccountForAuthToken(req, match, rawToken, fields);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export async function saveResetToken(req, account, rawToken) {
  const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return saveAccount(req, {
    ...account,
    passwordResetTokenHash: hashToken(rawToken),
    passwordResetExpiry: expiry,
    updatedAt: new Date().toISOString(),
  });
}

export async function findAccountByResetToken(req, rawToken) {
  return findAccountByAuthTokenInList(req, rawToken, ACCOUNT_AUTH_TOKEN_FIELDS.passwordReset);
}

const LOGIN_OTP_TTL_MS = 10 * 60 * 1000;
const LOGIN_OTP_RESEND_COOLDOWN_MS = 60 * 1000;

export async function saveLoginOtp(req, account, rawCode) {
  const expiry = new Date(Date.now() + LOGIN_OTP_TTL_MS).toISOString();
  return saveAccount(req, {
    ...account,
    loginOtpHash: hashToken(rawCode),
    loginOtpExpiry: expiry,
    loginOtpSentAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export function canResendLoginOtp(account) {
  const sentAt = account?.loginOtpSentAt;
  if (!sentAt) return true;
  return Date.now() - new Date(sentAt).getTime() >= LOGIN_OTP_RESEND_COOLDOWN_MS;
}

export async function findAccountByLoginOtp(req, email, rawCode) {
  const normalizedEmail = normalizeEmail(email);
  const code = String(rawCode || '').trim();
  if (!normalizedEmail || !code) return null;
  const account = await findAccountByEmail(req, normalizedEmail);
  if (!account?._id) return null;
  return readFreshAccountForAuthToken(req, account, code, ACCOUNT_AUTH_TOKEN_FIELDS.loginOtp);
}

export async function clearLoginOtp(req, account) {
  if (!account?.loginOtpHash) return account;
  return saveAccount(req, {
    ...account,
    loginOtpHash: null,
    loginOtpExpiry: null,
    updatedAt: new Date().toISOString(),
  });
}

export async function saveEmailVerificationToken(req, account, rawToken) {
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const tokenUpdate = buildEmailVerificationTokenUpdate(account, rawToken, expiry);
  return saveAccount(req, {
    ...account,
    ...tokenUpdate,
    // saveEmailVerificationToken no marca envío hasta que el mail salga de verdad.
    lastVerificationEmailSentAt: account.lastVerificationEmailSentAt || null,
  });
}

/** Tras envío real del correo: token + marca de envío en un solo PUT (menos conflictos CouchDB). */
export async function persistEmailVerificationAfterSend(req, account, rawToken) {
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const tokenUpdate = buildEmailVerificationTokenUpdate(account, rawToken, expiry);
  return saveAccount(req, {
    ...account,
    ...tokenUpdate,
  });
}

/** Solo tras envío real del correo (evita cooldown si falló Resend/SMTP). */
export async function markVerificationEmailSent(req, account) {
  return saveAccount(req, {
    ...account,
    lastVerificationEmailSentAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function findAccountByVerificationToken(req, rawToken) {
  return findAccountByAuthTokenInList(req, rawToken, ACCOUNT_AUTH_TOKEN_FIELDS.emailVerification);
}

/**
 * Verificación por email + token (el enlace del correo incluye ambos).
 * Localiza por email y valida el token contra el documento fresco en CouchDB.
 */
export async function findAccountForEmailVerification(req, email, rawToken) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !rawToken) return null;

  await ensureDatabase(req, ACCOUNTS_DB);
  const matches = await findAllAccountsByEmail(req, normalizedEmail);
  const account = pickPrimaryAccountByEmail(matches);
  if (!account?._id) return null;

  return readFreshAccountForAuthToken(req, account, rawToken, ACCOUNT_AUTH_TOKEN_FIELDS.emailVerification);
}

// A-04: Tokens de invitación de miembros
export async function saveInviteToken(req, account, rawToken) {
  const expiry = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(); // 72 horas
  return saveAccount(req, {
    ...account,
    inviteTokenHash: hashToken(rawToken),
    inviteExpiresAt: expiry,
    updatedAt: new Date().toISOString(),
  });
}

export async function findAccountByInviteToken(req, rawToken) {
  return findAccountByAuthTokenInList(req, rawToken, ACCOUNT_AUTH_TOKEN_FIELDS.teamInvite);
}

// S-03: Lógica de bloqueo progresivo de cuenta
// Más permisivo: el cliente puede fallar varias veces (reset, typo) sin quedar bloqueado al momento.
// El primer umbral es configurable vía env; los siguientes escalan automáticamente.
function buildLockoutThresholds() {
  const firstAttempts = Math.max(8, parseInt(process.env.MAX_LOGIN_ATTEMPTS || '12', 10));
  const firstDurationMs = Math.max(60_000, parseInt(process.env.LOCK_DURATION_MINUTES || '2', 10) * 60 * 1000);
  return [
    { attempts: firstAttempts,      durationMs: firstDurationMs },
    { attempts: firstAttempts + 8,  durationMs: firstDurationMs * 5 },
    { attempts: firstAttempts + 20, durationMs: 60 * 60 * 1000 },
  ];
}

// Recalcula en cada llamada para respetar cambios de env en runtime (tests, hot-reload)
function getLockoutThresholds() {
  return buildLockoutThresholds();
}

/**
 * Devuelve el estado de bloqueo de una cuenta.
 * - locked: true  → bloqueo activo
 * - locked: false, wasExpired: true → había bloqueo pero ya expiró (requiere limpieza lazy)
 * - locked: false, wasExpired: false → sin bloqueo previo
 */
export function isAccountLocked(account) {
  if (!account?.lockUntil) return { locked: false, wasExpired: false };
  const lockUntil = new Date(account.lockUntil);
  if (lockUntil > new Date()) {
    return { locked: true, lockUntil: lockUntil.toISOString(), remainingMs: lockUntil - Date.now() };
  }
  return { locked: false, wasExpired: true };
}

/**
 * Si entre el intento fallido y el incremento hubo un login correcto,
 * no sumar (evita carrera: éxito resetea y el fallo tardío vuelve a bloquear).
 */
export function shouldSkipFailedLoginIncrement(freshAccount, attemptStartedAt) {
  if (!attemptStartedAt) return false;
  const lastLoginAt = freshAccount?.lastLoginAt;
  if (!lastLoginAt) return false;
  const last = new Date(lastLoginAt).getTime();
  const started = new Date(attemptStartedAt).getTime();
  if (Number.isNaN(last) || Number.isNaN(started)) return false;
  return last >= started;
}

export async function incrementFailedLoginAttempts(req, account, options = {}) {
  const attemptStartedAt = options.attemptStartedAt || null;
  const fresh = (await findAccountByUserId(req, account.user_id)) || account;

  if (shouldSkipFailedLoginIncrement(fresh, attemptStartedAt)) {
    return {
      account: fresh,
      justLocked: false,
      lockUntil: fresh.lockUntil || null,
      failedLoginAttempts: fresh.failedLoginAttempts || 0,
      skipped: true,
    };
  }

  const currentAttempts = (fresh.failedLoginAttempts || 0) + 1;

  let lockUntil = fresh.lockUntil || null;
  let justLocked = false;

  for (const threshold of getLockoutThresholds()) {
    if (currentAttempts === threshold.attempts) {
      lockUntil = new Date(Date.now() + threshold.durationMs).toISOString();
      justLocked = true;
      break;
    }
  }

  const saved = await saveAccount(req, {
    ...fresh,
    failedLoginAttempts: currentAttempts,
    lockUntil,
    updatedAt: new Date().toISOString(),
  });

  return { account: saved, justLocked, lockUntil, failedLoginAttempts: currentAttempts, skipped: false };
}

export async function resetFailedLoginAttempts(req, account) {
  if (!account.failedLoginAttempts && !account.lockUntil) return account;
  const fresh = (await findAccountByUserId(req, account.user_id)) || account;
  return saveAccount(req, {
    ...fresh,
    failedLoginAttempts: 0,
    lockUntil: null,
    updatedAt: new Date().toISOString(),
  });
}


export function verifyPassword(password, storedHash) {
  if (!storedHash || !String(storedHash).includes(':')) {
    return false;
  }

  const [salt, originalHash] = String(storedHash).split(':');
  const derivedHash = crypto.scryptSync(password, salt, 64).toString('hex');

  return crypto.timingSafeEqual(
    Buffer.from(originalHash, 'hex'),
    Buffer.from(derivedHash, 'hex'),
  );
}

export function buildAccountDocument({
  firstName,
  lastName,
  email,
  phone,
  password,
  avatar = '',
  accountType = 'company',
  role = 'Admin',
  status = 'active',
  onboardingCompleted = false,
  onboardingData = {},
  companyName = '',
  provider = 'email',
  permissions,
  employment = {},
  inviteStatus = 'accepted',
  invitedBy = '',
  lastLoginAt = '',
  recentActivity = [],
  emailVerified = false,
  landingPage,
  linkedBusinessId = '',
  username = '',
}) {
  const userId = uuidv4();
  const now = new Date().toISOString();
  const normalizedEmail = normalizeEmail(email);
  const resolvedAccountType = ['user', 'company'].includes(accountType) ? accountType : 'company';
  const defaultLanding =
    resolvedAccountType === 'user' ? WORKER_DEFAULT_LANDING_PATH : '/saas/subscription';
  const paymentConcept = `VERTIAL-${String(userId).replace(/[^a-fA-F0-9]/g, '').slice(0, 6).toUpperCase()}`;

  return {
    _id: `account:${userId}`,
    type: 'account',
    user_id: userId,
    email: normalizedEmail,
    firstName: String(firstName || '').trim(),
    lastName: String(lastName || '').trim(),
    fullName: `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim(),
    phone: String(phone || '').trim(),
    avatar: String(avatar || '').trim(),
    accountType: resolvedAccountType,
    role: resolvedAccountType === 'user' ? 'Usuario' : (String(role || 'Admin').trim() || 'Admin'),
    status: String(status || 'active').trim() || 'active',
    inviteStatus: String(inviteStatus || 'accepted').trim() || 'accepted',
    invitedBy: String(invitedBy || '').trim(),
    companyName: String(companyName || '').trim(),
    onboardingCompleted: resolvedAccountType === 'user' ? true : Boolean(onboardingCompleted),
    onboardingData: onboardingData || {},
    provider: String(provider || 'email').trim() || 'email',
    permissions: normalizePermissionMatrix(permissions, resolvedAccountType === 'user' ? 'Usuario' : role),
    employment: buildDefaultEmploymentInfo(employment),
    recentActivity: normalizeRecentActivity(recentActivity),
    lastLoginAt: String(lastLoginAt || '').trim(),
    emailVerified: Boolean(emailVerified),
    paymentSummary: null,
    subscription: resolvedAccountType === 'user' ? null : {
      status: 'pending_payment',
      planName: 'Basic',
      selectedPlanId: 'basic',
      trialEndsAt: '',
      currentPeriodStart: '',
      currentPeriodEnd: '',
      gracePeriodEndsAt: '',
      lastPaymentAt: '',
      cancelAtPeriodEnd: false,
      paymentProvider: 'bank_transfer',
      paymentConcept,
      licenseHistory: [
        {
          at: now,
          action: 'account_created',
          by: 'system',
          note: 'Empresa registrada. Acceso pendiente de pago o activación admin.',
        },
      ],
    },
    landingPage: String(landingPage || defaultLanding).trim(),
    linkedBusinessId: String(linkedBusinessId || '').trim(),
    username: String(username || '').trim().toLowerCase(),
    referralCode: '',
    referredByAffiliateId: '',
    passwordHash: hashPassword(password),
    createdAt: now,
    updatedAt: now,
  };
}

export function sanitizeAccount(account) {
  if (!account) {
    return null;
  }

  const accountType = account.accountType || 'company';

  return {
    id: account._id,
    user_id: account.user_id,
    email: account.email,
    /** Solo true para la cuenta de desarrollo autorizada (UI plan simulado). */
    devPlanSwitcher: normalizeEmail(account.email) === 'uriel@admin.com',
    firstName: account.firstName || '',
    lastName: account.lastName || '',
    fullName: account.fullName || `${account.firstName || ''} ${account.lastName || ''}`.trim(),
    phone: account.phone || '',
    avatar: account.avatar || '',
    accountType,
    role: account.role || 'Admin',
    status: account.status || 'active',
    inviteStatus: account.inviteStatus || (account.status === 'pending' ? 'pending' : 'accepted'),
    invitedBy: accountType === 'company' ? '' : (account.invitedBy || ''),
    companyName: account.companyName || '',
    provider: account.provider || 'email',
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    deletedAt: account.deletedAt || null,
    lastLoginAt: account.lastLoginAt || '',
    onboardingCompleted: Boolean(account.onboardingCompleted),
    onboardingData: account.onboardingData || {},
    emailVerified: Boolean(account.emailVerified),
    paymentSummary: account.paymentSummary || null,
    subscription: account.subscription || null,
    permissions: normalizePermissionMatrix(account.permissions || account.permissionMatrix || account.permissionsLegacy, account.role),
    employment: buildDefaultEmploymentInfo(account.employment),
    personalData: buildDefaultPersonalData(account.personalData),
    workerProfileCompletion: account.workerProfileCompletion || computeWorkerProfileCompletion({
      ...account,
      employment: buildDefaultEmploymentInfo(account.employment),
      personalData: buildDefaultPersonalData(account.personalData),
    }),
    workerIdentityCompleted: Boolean(account.workerIdentityCompleted) || hasMinimumWorkerIdentity({
      ...account,
      personalData: buildDefaultPersonalData(account.personalData),
    }),
    recentActivity: normalizeRecentActivity(account.recentActivity),
    failedLoginAttempts: account.failedLoginAttempts || 0,
    lockUntil: account.lockUntil || null,
    googleId: account.googleId || null,
    googleScopes: account.googleScopes || null,
    googleProfile: account.googleProfile || null,
    appleId: account.appleId || null,
    landingPage:
      accountType === 'company'
        ? (account.landingPage && String(account.landingPage).startsWith('/saas/worker')
          ? '/saas/dashboard'
          : (account.landingPage || '/saas/dashboard'))
        : (account.landingPage || WORKER_DEFAULT_LANDING_PATH),
    // Empresa/CEO nunca va ligada como trabajador (campo sucio no debe filtrarse al cliente).
    linkedBusinessId: accountType === 'company' ? '' : (account.linkedBusinessId || ''),
    username: account.username || '',
    referralCode: account.referralCode || '',
    referredByAffiliateId: account.referredByAffiliateId || '',
    notificationPreferences: normalizeNotificationPreferences(account.notificationPreferences),
  };
}

/**
 * Preferencias personales de notificación. El gerente puede silenciar
 * categorías concretas (por ejemplo recibir solo retrasos y no entradas
 * puntuales) sin que ese filtro afecte a otros gerentes del mismo business.
 */
export function defaultNotificationPreferences() {
  return {
    clockin: {
      onEntry: true,        // entrada puntual
      onLate: true,         // retraso
      onEarlyEntry: false,  // entrada anticipada sospechosa
      onExit: true,         // salida puntual o tardía
      onEarlyExit: true,    // salida anticipada
      onBreaks: false,      // inicio/fin de descanso (puede ser ruidoso)
      onLongBreak: true,    // descanso prolongado
    },
    team: {
      onIdentityCompleted: true,
      onWorkerProfileCompleted: true,
    },
    /** Permiso push del SO: 1 vez por cuenta. accepted se conserva entre updates. */
    pushConsent: {
      decision: 'unset',
      decidedAt: null,
    },
  };
}

function normalizePushConsentDecision(value) {
  if (value === 'accepted' || value === 'declined') return value;
  return 'unset';
}

export function normalizeNotificationPreferences(prefs) {
  const defaults = defaultNotificationPreferences();
  if (!prefs || typeof prefs !== 'object') return defaults;
  const clockin = prefs.clockin && typeof prefs.clockin === 'object' ? prefs.clockin : {};
  const team = prefs.team && typeof prefs.team === 'object' ? prefs.team : {};
  const pushConsentRaw = prefs.pushConsent && typeof prefs.pushConsent === 'object'
    ? prefs.pushConsent
    : {};
  const decision = normalizePushConsentDecision(pushConsentRaw.decision);
  return {
    clockin: {
      onEntry: clockin.onEntry !== undefined ? Boolean(clockin.onEntry) : defaults.clockin.onEntry,
      onLate: clockin.onLate !== undefined ? Boolean(clockin.onLate) : defaults.clockin.onLate,
      onEarlyEntry: clockin.onEarlyEntry !== undefined ? Boolean(clockin.onEarlyEntry) : defaults.clockin.onEarlyEntry,
      onExit: clockin.onExit !== undefined ? Boolean(clockin.onExit) : defaults.clockin.onExit,
      onEarlyExit: clockin.onEarlyExit !== undefined ? Boolean(clockin.onEarlyExit) : defaults.clockin.onEarlyExit,
      onBreaks: clockin.onBreaks !== undefined ? Boolean(clockin.onBreaks) : defaults.clockin.onBreaks,
      onLongBreak: clockin.onLongBreak !== undefined ? Boolean(clockin.onLongBreak) : defaults.clockin.onLongBreak,
    },
    team: {
      onIdentityCompleted: team.onIdentityCompleted !== undefined
        ? Boolean(team.onIdentityCompleted)
        : defaults.team.onIdentityCompleted,
      onWorkerProfileCompleted: team.onWorkerProfileCompleted !== undefined
        ? Boolean(team.onWorkerProfileCompleted)
        : defaults.team.onWorkerProfileCompleted,
    },
    pushConsent: {
      decision,
      decidedAt: decision === 'unset'
        ? null
        : (typeof pushConsentRaw.decidedAt === 'string' && pushConsentRaw.decidedAt
          ? pushConsentRaw.decidedAt
          : defaults.pushConsent.decidedAt),
    },
  };
}

// S-07: Sanitiza una sesión para devolver al frontend (sin el hash del token)
export function sanitizeSession(session, currentSessionId) {
  return {
    sessionId: session.sessionId,
    deviceInfo: session.deviceInfo || {},
    ipAddress: session.ipAddress || '',
    lastActiveAt: session.lastActiveAt || session.createdAt,
    createdAt: session.createdAt,
    isCurrent: session.sessionId === currentSessionId,
  };
}

export async function findAllAccountsByEmail(req, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return [];
  }

  await ensureDatabase(req, ACCOUNTS_DB);
  const docs = await getAllDocuments(req, ACCOUNTS_DB);
  return findDuplicateEmailAccounts(docs, normalizedEmail);
}

export async function findAccountByEmail(req, email) {
  const matches = await findAllAccountsByEmail(req, email);
  if (matches.length > 1) {
    console.warn(
      `[ACCOUNTS] Email duplicado detectado (${normalizeEmail(email)}): ${matches.length} cuentas — usando la canónica`,
    );
  }
  return pickPrimaryAccountByEmail(matches);
}

export async function findAccountByAppleId(req, appleId) {
  const id = String(appleId || '').trim();
  if (!id) {
    return null;
  }

  await ensureDatabase(req, ACCOUNTS_DB);
  const docs = await getAllDocuments(req, ACCOUNTS_DB);
  return docs.find((doc) => doc.type === 'account' && !doc.deletedAt && doc.appleId === id) || null;
}

export async function findAccountByUserId(req, userId) {
  if (!userId) {
    return null;
  }

  await ensureDatabase(req, ACCOUNTS_DB);
  return getDocument(req, ACCOUNTS_DB, `account:${userId}`);
}

/**
 * Resuelve el "dueño efectivo de los datos" para un userId.
 *
 * En este sistema cada negocio guarda sus documentos (pedidos, PDVs, catálogo,
 * sesiones de TPV, etc.) bajo el `user_id` del propietario que hizo el alta.
 * Cuando ese propietario invita a un team member, el invitado tiene su propio
 * `user_id` distinto y `account.invitedBy` apunta al owner.
 *
 * Si no resolvemos esto, el invitado consulta con su userId y no encuentra nada
 * (todos los datos están bajo el userId del owner). Esta función devuelve el
 * userId correcto para usar en las queries de datos compartidos del negocio.
 *
 * @returns {Promise<{ ownerUserId: string, account: object|null, isInvited: boolean }>}
 */
export async function resolveDataOwnerUserId(req, userId) {
  if (!userId) return { ownerUserId: userId, account: null, isInvited: false };
  const account = await findAccountByUserId(req, userId);
  if (!account) return { ownerUserId: userId, account: null, isInvited: false };
  const invitedBy = String(account.invitedBy || '').trim();
  if (invitedBy && invitedBy !== userId) {
    return { ownerUserId: invitedBy, account, isInvited: true };
  }
  return { ownerUserId: userId, account, isInvited: false };
}

export async function listAccounts(req) {
  await ensureDatabase(req, ACCOUNTS_DB);
  const docs = await getAllDocuments(req, ACCOUNTS_DB);

  return docs
    .filter((doc) => doc?.type === 'account' && !doc?.deletedAt)
    .sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
}

export async function saveAccount(req, account) {
  if (!account?._id) {
    throw new Error('Documento de cuenta inválido');
  }

  await ensureDatabase(req, ACCOUNTS_DB);
  const docs = await getAllDocuments(req, ACCOUNTS_DB);
  assertAccountEmailUnique(docs, account.email, account.user_id);

  let doc = account;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await putDocument(req, ACCOUNTS_DB, doc._id, doc);
      return { ...doc, _rev: result.rev };
    } catch (err) {
      const isConflict =
        Number(err?.statusCode) === 409 || /conflict/i.test(String(err?.message || ''));
      if (!isConflict || attempt >= 2) throw err;
      const fresh = await getDocument(req, ACCOUNTS_DB, account._id);
      if (!fresh?._rev) throw err;
      // Reaplicar el cambio sobre el _rev fresco; conservar campos volátiles de sesión.
      doc = {
        ...fresh,
        ...account,
        _id: fresh._id,
        _rev: fresh._rev,
        sessions: fresh.sessions,
        refreshTokenHash: fresh.refreshTokenHash,
        refreshTokenExpiry: fresh.refreshTokenExpiry,
        recentActivity: Array.isArray(account.recentActivity)
          ? account.recentActivity
          : fresh.recentActivity,
        updatedAt: new Date().toISOString(),
      };
    }
  }
  throw new Error('No se pudo guardar la cuenta tras conflictos');
}

export async function appendActivityToAccount(req, userId, activity) {
  const account = await findAccountByUserId(req, userId);
  if (!account) {
    return null;
  }

  const nextAccount = {
    ...account,
    recentActivity: normalizeRecentActivity([activity, ...(account.recentActivity || [])]),
    updatedAt: new Date().toISOString(),
  };

  return saveAccount(req, nextAccount);
}

export async function logAccountActivity(req, activityInput) {
  const activity = buildActivityRecord(activityInput);
  const targetIds = Array.from(
    new Set(
      [activity.targetUserId || activity.actorUserId]
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );

  const updates = [];
  for (const userId of targetIds) {
    const saved = await appendActivityToAccount(req, userId, activity);
    if (saved) {
      updates.push(saved);
    }
  }

  return activity;
}

export async function findCardByUserId(req, userId) {
  if (!userId) {
    return null;
  }

  await ensureDatabase(req, CARDS_DB);
  return getDocument(req, CARDS_DB, `card:${userId}`);
}

export function buildCardDocument({
  userId,
  cardNumber,
  cardHolderName,
  expiryDate,
  cvv,
  billingMode,
  selectedPlanId,
}) {
  const now = new Date().toISOString();
  const digitsOnly = String(cardNumber || '').replace(/\s+/g, '');

  // SEC-01: Solo almacenamos los últimos 4 dígitos. Nunca el PAN completo ni el CVV.
  // El procesamiento real de pagos debe hacerse contra un PSP (Stripe, Redsys, etc.)
  // que devuelva un token/paymentMethodId para almacenar en su lugar.
  return {
    _id: `card:${userId}`,
    type: 'card',
    user_id: userId,
    cardHolderName: String(cardHolderName || '').trim(),
    expiryDate: String(expiryDate || '').trim(),
    lastFourDigits: digitsOnly.slice(-4),
    billingMode: String(billingMode || 'monthly'),
    selectedPlanId: String(selectedPlanId || ''),
    createdAt: now,
    updatedAt: now,
  };
}

export function sanitizeCard(card) {
  if (!card) {
    return null;
  }

  // SEC-01: Nunca devolver PAN completo ni CVV al cliente.
  return {
    id: card._id,
    user_id: card.user_id,
    cardHolderName: card.cardHolderName || '',
    expiryDate: card.expiryDate || '',
    lastFourDigits: card.lastFourDigits || '',
    billingMode: card.billingMode || 'monthly',
    selectedPlanId: card.selectedPlanId || '',
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

export async function saveCard(req, card) {
  if (!card?._id) {
    throw new Error('Documento de tarjeta inválido');
  }

  await ensureDatabase(req, CARDS_DB);
  let doc = card;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await putDocument(req, CARDS_DB, doc._id, doc);
      return { ...doc, _rev: result.rev };
    } catch (err) {
      const isConflict =
        Number(err?.statusCode) === 409 || /conflict/i.test(String(err?.message || ''));
      if (!isConflict || attempt >= 2) throw err;
      const fresh = await getDocument(req, CARDS_DB, card._id);
      doc = {
        ...card,
        ...(fresh?._rev ? { _rev: fresh._rev, createdAt: fresh.createdAt || card.createdAt } : {}),
        _id: card._id,
        updatedAt: new Date().toISOString(),
      };
    }
  }
  throw new Error('No se pudo guardar la tarjeta tras conflictos');
}

// ─── D-01: Mango Indexes ──────────────────────────────────────────────────────

export async function ensureIndex(req, dbName, fields, indexName) {
  const encodedDbName = encodeURIComponent(dbName);
  const response = await couchRequest(req, `/${encodedDbName}/_index`, {
    method: 'POST',
    body: JSON.stringify({
      index: { fields },
      name: indexName || `idx-${fields.join('-')}`,
      type: 'json',
    }),
  });
  return response.json().catch(() => ({}));
}

const INDEX_DEFINITIONS = {
  [VEHICLES_DB]: [
    ['user_id', 'type'],
    ['user_id', 'status'],
    ['user_id', 'createdAt'],
    ['type', 'active', 'user_id'],
    ['user_id', 'type', 'vehicleId'],
    ['user_id', 'type', 'status'],
    ['user_id', 'type', 'expenseType'],
  ],
  [FLEET_DB]: [
    ['user_id', 'type'],
    ['user_id', 'status'],
    ['user_id', 'ownershipType'],
    ['user_id', 'createdAt'],
    ['type', 'active', 'user_id'],
  ],
  [ACCOUNTS_DB]: [
    ['type', 'email'],
    ['type', 'user_id'],
    ['type', 'status'],
    ['createdAt'],
  ],
  [NOTIFICATIONS_DB]: [
    ['user_id', 'type'],
    ['user_id', 'read'],
    ['user_id', 'createdAt'],
    ['type', 'businessId'],
    ['type', 'user_id'],
    ['businessId', 'status', 'priority', 'createdAt'],
    ['businessId', 'source', 'status', 'createdAt'],
    ['businessId', 'status', 'createdAt'],
    ['status', 'priority', 'createdAt'],
  ],
};

export async function setupDatabaseIndexes(req, dbName) {
  await ensureDatabase(req, dbName);
  const defs = INDEX_DEFINITIONS[dbName] || [
    ['user_id', 'type'],
    ['user_id', 'status'],
    ['user_id', 'createdAt'],
    ['createdAt'],
  ];
  const safeDb = dbName.replace(/[^a-z0-9]/g, '-');
  for (const fields of defs) {
    const name = `idx-${safeDb}-${fields.join('-')}`;
    await ensureIndex(req, dbName, fields, name).catch(() => null);
  }
}

// ─── D-02: Design Documents & MapReduce Views ─────────────────────────────────

export async function ensureDesignDocument(req, dbName, designName, views) {
  await ensureDatabase(req, dbName);
  const docId = `_design/${designName}`;
  const existing = await getDocument(req, dbName, docId).catch(() => null);
  const doc = {
    _id: docId,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    language: 'javascript',
    views,
  };
  const encodedDbName = encodeURIComponent(dbName);
  const encodedDocId = encodeURIComponent(docId);
  const response = await couchRequest(req, `/${encodedDbName}/${encodedDocId}`, {
    method: 'PUT',
    body: JSON.stringify(doc),
  });
  return response.json().catch(() => ({}));
}

export async function queryView(req, dbName, designName, viewName, params = {}) {
  const cacheKey = cacheService.buildKey('view', dbName, designName, viewName, JSON.stringify(params));
  const cached = cacheService.get(cacheKey);
  if (cached) return cached;

  const encodedDbName = encodeURIComponent(dbName);
  const qs = new URLSearchParams();
  if (params.group) qs.set('group', 'true');
  if (params.group_level !== undefined) qs.set('group_level', String(params.group_level));
  if (params.reduce !== undefined) qs.set('reduce', String(params.reduce));
  if (params.key !== undefined) qs.set('key', JSON.stringify(params.key));
  if (params.startkey !== undefined) qs.set('startkey', JSON.stringify(params.startkey));
  if (params.endkey !== undefined) qs.set('endkey', JSON.stringify(params.endkey));
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.descending) qs.set('descending', 'true');
  if (params.include_docs) qs.set('include_docs', 'true');
  const qstr = qs.toString();
  const viewPath = `/${encodedDbName}/_design/${encodeURIComponent(designName)}/_view/${encodeURIComponent(viewName)}${qstr ? `?${qstr}` : ''}`;
  const response = await couchRequest(req, viewPath);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.reason || payload?.error || `Error en vista ${designName}/${viewName}`);
  }
  cacheService.set(cacheKey, payload, cacheService.TTL_PRESETS.VIEW);
  return payload;
}

export const VEHICLES_DESIGN_VIEWS = {
  by_user_status: {
    map: `function(doc){if(doc.type==='car'&&doc.active!==false){emit([doc.user_id,doc.status],1);}}`,
    reduce: '_count',
  },
  stock_value_by_user: {
    map: `function(doc){if(doc.type==='car'&&doc.active!==false&&doc.status!=='vendido'&&doc.status!=='sold'){emit(doc.user_id,doc.purchasePrice||0);}}`,
    reduce: '_sum',
  },
  sales_revenue_by_month: {
    map: `function(doc){if(doc.type==='car'&&(doc.status==='vendido'||doc.status==='sold')&&doc.soldAt){var m=doc.soldAt.slice(0,7);emit([doc.user_id,m],doc.salePrice||0);}}`,
    reduce: '_sum',
  },
  margin_by_user: {
    map: `function(doc){if(doc.type==='car'&&(doc.status==='vendido'||doc.status==='sold')){var costs=0;if(doc.associatedCosts){for(var i=0;i<doc.associatedCosts.length;i++){costs+=(doc.associatedCosts[i].amount||0);}}emit(doc.user_id,(doc.salePrice||0)-(doc.purchasePrice||0)-costs);}}`,
    reduce: '_sum',
  },
  days_in_stock_stats: {
    map: `function(doc){if(doc.type==='car'&&doc.active!==false&&doc.status!=='vendido'&&doc.status!=='sold'&&(doc.purchaseDate||doc.createdAt)){var base=doc.purchaseDate||doc.createdAt;var ms=Date.now()-new Date(base).getTime();var days=Math.max(0,Math.floor(ms/86400000));emit(doc.user_id,days);}}`,
    reduce: '_stats',
  },
  by_assigned_to: {
    map: `function(doc){if(doc.type==='car'&&doc.active!==false&&doc.assignedTo){emit([doc.user_id,doc.assignedTo],1);}}`,
    reduce: '_count',
  },
  by_plate: {
    map: `function(doc){if(doc.type==='car'&&doc.active!==false&&!doc.deletedAt&&doc.registrationPlate){emit([doc.user_id,doc.registrationPlate.toUpperCase()],{_id:doc._id,brand:doc.brand,model:doc.model,status:doc.status});}}`,
  },
  by_vin: {
    map: `function(doc){if(doc.type==='car'&&doc.active!==false&&!doc.deletedAt&&doc.vin){emit([doc.user_id,doc.vin.toUpperCase()],{_id:doc._id,brand:doc.brand,model:doc.model,registrationPlate:doc.registrationPlate,status:doc.status});}}`,
  },
};

export const ACCOUNTS_DESIGN_VIEWS = {
  by_plan: {
    map: `function(doc){if(doc.type==='account'&&!doc.invitedBy){emit(doc.subscription&&doc.subscription.planName||'Basic',1);}}`,
    reduce: '_count',
  },
  by_status: {
    map: `function(doc){if(doc.type==='account'){emit(doc.status||'active',1);}}`,
    reduce: '_count',
  },
  signups_by_month: {
    map: `function(doc){if(doc.type==='account'&&!doc.invitedBy&&doc.createdAt){emit(doc.createdAt.slice(0,7),1);}}`,
    reduce: '_count',
  },
};

export const NOTIFICATIONS_DESIGN_VIEWS = {
  unread_by_user: {
    map: `function(doc){if(doc.type==='notification'&&!doc.read){emit(doc.user_id,1);}}`,
    reduce: '_count',
  },
  by_user_level: {
    map: `function(doc){if(doc.type==='notification'){emit([doc.user_id,doc.level],1);}}`,
    reduce: '_count',
  },
};

// ─── D-06: Changelog ─────────────────────────────────────────────────────────

export const CHANGELOG_DB = 'changelog';

export function buildChangelogEntry({
  entity,
  entityId = '',
  entityLabel = '',
  action,
  actorUserId = '',
  actorName = '',
  changes = {},
  metadata = {},
}) {
  return {
    _id: `changelog:${uuidv4()}`,
    type: 'changelog',
    entity: String(entity || '').trim(),
    entityId: String(entityId || '').trim(),
    entityLabel: String(entityLabel || '').trim(),
    action: String(action || '').trim(),
    actorUserId: String(actorUserId || '').trim(),
    actorName: String(actorName || '').trim(),
    changes: changes && typeof changes === 'object' ? changes : {},
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    createdAt: new Date().toISOString(),
  };
}

export async function writeChangelog(req, input) {
  const entry = buildChangelogEntry(input);
  try {
    await ensureDatabase(req, CHANGELOG_DB);
    await putDocument(req, CHANGELOG_DB, entry._id, entry);
  } catch (_err) {
    // El changelog no debe romper operaciones principales
  }
  return entry;
}

export async function queryChangelog(req, filters = {}) {
  await ensureDatabase(req, CHANGELOG_DB);
  const docs = await getAllDocuments(req, CHANGELOG_DB);
  let entries = docs.filter((doc) => doc?.type === 'changelog');
  if (filters.entity) entries = entries.filter((d) => d.entity === filters.entity);
  if (filters.actorUserId) entries = entries.filter((d) => d.actorUserId === filters.actorUserId);
  if (filters.entityId) entries = entries.filter((d) => d.entityId === filters.entityId);
  return entries
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, Number(filters.limit) || 200);
}

// ─── DB name helpers ───────────────────────────────────────────────────────────

export function getSalesDbName() {
  return normalizeDbName(process.env.VITE_SALES_DB || `${getDbPrefix()}-sales`);
}

export function getLeadsDbName() {
  return normalizeDbName(process.env.VITE_CRM_LEADS_DB || `${getDbPrefix()}-leads`);
}

export function getClientsDbName() {
  return normalizeDbName(process.env.VITE_CRM_CLIENTS_DB || `${getDbPrefix()}-clients`);
}

export function getFinanceDbName() {
  return normalizeDbName(process.env.VITE_FINANCE_DB || process.env.VITE_PAYMENTS_DB || 'pay');
}

export function getInvoicesDbName() {
  return normalizeDbName(process.env.VITE_CRM_INVOICES_DB || `${getDbPrefix()}-crm-invoices`);
}

export function getDocumentsDbName() {
  return normalizeDbName(process.env.VITE_DOCUMENTS_DB || `${getDbPrefix()}-documents`);
}

export function getOcrLogsDbName() {
  return normalizeDbName(process.env.VITE_OCR_LOGS_DB || `${getDbPrefix()}-ocr-logs`);
}

export function getPayrollDbName() {
  return normalizeDbName(process.env.VITE_PAYROLL_DB || `${getDbPrefix()}-payroll`);
}

export function getLocationsDbName() {
  return normalizeDbName(process.env.VITE_LOCATIONS_DB || `${getDbPrefix()}-locations`);
}

export function getAppointmentsDbName() {
  return normalizeDbName(process.env.VITE_APPOINTMENTS_DB || `${getDbPrefix()}-appointments`);
}

export function getUserHistoryDbName() {
  return normalizeDbName(process.env.VITE_USER_HISTORY_DB || `${getDbPrefix()}-user-history`);
}

export function getClockinsDbName() {
  return normalizeDbName(process.env.VITE_CLOCKINS_DB || `${getDbPrefix()}-clockins`);
}

export async function listClockinsByBusiness(req, businessId) {
  const db = getClockinsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  const bareId = String(businessId || '').replace(/^business:/, '').trim();
  return docs
    .filter((doc) => {
      if (doc?.type !== 'clockin' || doc?.deletedAt) return false;
      const docBid = String(doc.business_id || '').replace(/^business:/, '').trim();
      return docBid === bareId;
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

// ─── USER HISTORY ─────────────────────────────────────────────────────────────

/**
 * Persiste un evento de historial de usuario.
 *
 * @param {object} req   — Express request (lleva cabeceras CouchDB)
 * @param {object} event — Documento construido con buildUserHistoryEvent()
 * @returns {Promise<object>}
 */
export async function saveUserHistoryEvent(req, event) {
  const db = getUserHistoryDbName();
  await ensureDatabase(req, db);
  return putDocument(req, db, event._id, event);
}

/**
 * Devuelve todos los eventos de historial de un usuario concreto.
 *
 * @param {object} req
 * @param {string} userId
 * @param {string} [sessionUserId]
 * @param {number} [limit=500]
 * @returns {Promise<object[]>}
 */
export async function getUserHistoryEvents(req, userId, sessionUserId = null, limit = 500) {
  const db = getUserHistoryDbName();
  await ensureDatabase(req, db);
  const all = await getAllDocuments(req, db);
  const filtered = all
    .filter((d) => d.type === 'user_history_event' && d.userId === userId && !d._deleted)
    .filter((d) => (sessionUserId ? d.sessionUserId === sessionUserId : true))
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
    .slice(0, limit);
  return filtered;
}

/**
 * Elimina los eventos anteriores a la fecha de corte (limpieza periódica).
 *
 * @param {object} req
 * @param {string} userId
 * @param {Date}   cutoffDate
 * @returns {Promise<number>} — número de documentos eliminados
 */
export async function pruneOldHistoryEvents(req, userId, cutoffDate) {
  const db = getUserHistoryDbName();
  await ensureDatabase(req, db);
  const all = await getAllDocuments(req, db);
  const stale = all.filter(
    (d) =>
      d.type === 'user_history_event' &&
      d.userId === userId &&
      new Date(d.createdAt) < cutoffDate,
  );

  let count = 0;
  for (const doc of stale) {
    await softDeleteDocument(req, db, doc._id);
    count++;
  }
  return count;
}

// ─── APPOINTMENTS ─────────────────────────────────────────────────────────────

const VALID_APPOINTMENT_TYPES = [
  'visit', 'test_drive', 'paperwork', 'delivery',
  'consultation', 'treatment', 'checkup', 'followup_appt',
  'trial_class', 'enrollment', 'personal_session',
  'reservation', 'checkin', 'tour',
  'service', 'assessment', 'class_session',
];
const VALID_APPOINTMENT_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'];

const DEFAULT_APPOINTMENT_TYPES_BY_VERTICAL = {
  carDealership: ['visit', 'test_drive', 'paperwork', 'delivery'],
  workshop:      ['visit', 'delivery', 'paperwork'],
  clinic:        ['consultation', 'treatment', 'checkup', 'followup_appt'],
  vet:           ['consultation', 'treatment', 'checkup', 'followup_appt'],
  gym:           ['visit', 'trial_class', 'enrollment', 'personal_session'],
  academy:       ['visit', 'enrollment', 'class_session', 'consultation'],
  hairSalon:     ['reservation', 'consultation', 'treatment'],
  hotel:         ['reservation', 'checkin', 'tour'],
  realEstate:    ['visit', 'tour', 'consultation', 'paperwork'],
  lawyer:        ['consultation', 'followup_appt', 'paperwork'],
  construction:  ['visit', 'assessment', 'paperwork', 'delivery'],
  cleaning:      ['visit', 'service', 'assessment'],
  events:        ['reservation', 'visit', 'consultation'],
  delivery:      ['reservation', 'delivery'],
  nightclub:     ['reservation', 'visit'],
  scrapyard:     ['visit', 'delivery', 'paperwork'],
  spareParts:    ['visit', 'consultation', 'delivery'],
  taxi:          ['reservation', 'service'],
  pharmacy:      ['consultation', 'service', 'delivery'],
  carWash:       ['reservation', 'service'],
};

function normalizeAppointmentType(value) {
  return VALID_APPOINTMENT_TYPES.includes(String(value || '')) ? String(value) : 'visit';
}

function normalizeAppointmentStatus(value) {
  return VALID_APPOINTMENT_STATUSES.includes(String(value || '')) ? String(value) : 'pending';
}

export function buildAppointmentDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `appt-${uuidv4()}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'appointment',
    id,
    user_id: userId,
    appointmentType: normalizeAppointmentType(data.appointmentType),
    date: String(data.date || ''),
    time: String(data.time || ''),
    location: String(data.location || 'Concesionario Principal'),
    notes: String(data.notes || ''),
    status: normalizeAppointmentStatus(data.status),
    clientName: String(data.clientName || ''),
    clientPhone: String(data.clientPhone || ''),
    clientEmail: String(data.clientEmail || ''),
    leadId: String(data.leadId || ''),
    clientId: String(data.clientId || ''),
    assignedTo: String(data.assignedTo || ''),
    assignedName: String(data.assignedName || ''),
    vehicleId: String(data.vehicleId || ''),
    vehicleName: String(data.vehicleName || ''),
    vehiclePlate: String(data.vehiclePlate || '').toUpperCase(),
    source: ['internal', 'booking'].includes(String(data.source || '')) ? String(data.source) : 'internal',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeAppointment(doc) {
  if (!doc) return null;
  return {
    id: doc._id || doc.id || '',
    _id: doc._id,
    _rev: doc._rev,
    type: doc.type,
    user_id: doc.user_id,
    appointmentType: doc.appointmentType || 'visit',
    date: doc.date || '',
    time: doc.time || '',
    location: doc.location || '',
    notes: doc.notes || '',
    status: doc.status || 'pending',
    clientName: doc.clientName || '',
    clientPhone: doc.clientPhone || '',
    clientEmail: doc.clientEmail || '',
    leadId: doc.leadId || '',
    clientId: doc.clientId || '',
    assignedTo: doc.assignedTo || '',
    assignedName: doc.assignedName || '',
    vehicleId: doc.vehicleId || '',
    vehicleName: doc.vehicleName || '',
    vehiclePlate: doc.vehiclePlate || '',
    source: doc.source || 'internal',
    createdAt: doc.createdAt || '',
    updatedAt: doc.updatedAt || '',
  };
}

export async function listAppointmentsByUser(req, userId) {
  const db = getAppointmentsDbName();
  await ensureDatabase(req, db);
  const all = await getAllDocuments(req, db);
  return all.filter((d) => d && d.type === 'appointment' && d.user_id === userId && !d._deleted);
}

// ─── BOOKING CONFIG ───────────────────────────────────────────────────────────

export function buildBookingConfigDocument(userId, data = {}, existing = null, businessType = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `booking-config-${userId}`;

  const defaultWorkingHours = {
    mon: { enabled: true, start: '09:00', end: '18:00' },
    tue: { enabled: true, start: '09:00', end: '18:00' },
    wed: { enabled: true, start: '09:00', end: '18:00' },
    thu: { enabled: true, start: '09:00', end: '18:00' },
    fri: { enabled: true, start: '09:00', end: '18:00' },
    sat: { enabled: true, start: '09:00', end: '14:00' },
    sun: { enabled: false, start: '09:00', end: '14:00' },
  };

  const defaultTypes = (businessType && DEFAULT_APPOINTMENT_TYPES_BY_VERTICAL[businessType])
    || DEFAULT_APPOINTMENT_TYPES_BY_VERTICAL.carDealership;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'booking_config',
    id,
    user_id: userId,
    enabled: data.enabled !== undefined ? Boolean(data.enabled) : (existing?.enabled ?? true),
    displayName: String(data.displayName || existing?.displayName || ''),
    slotDuration: Number(data.slotDuration || existing?.slotDuration || 60),
    bufferMinutes: Number(data.bufferMinutes || existing?.bufferMinutes || 15),
    maxDaysAhead: Number(data.maxDaysAhead || existing?.maxDaysAhead || 30),
    appointmentTypes: Array.isArray(data.appointmentTypes)
      ? data.appointmentTypes.filter((t) => VALID_APPOINTMENT_TYPES.includes(t))
      : (existing?.appointmentTypes || defaultTypes),
    workingHours: data.workingHours || existing?.workingHours || defaultWorkingHours,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

// ─── SALES ────────────────────────────────────────────────────────────────────

function normalizeSaleStage(value) {
  const allowed = ['interested', 'reserved', 'documentation', 'sold', 'delivered'];
  return allowed.includes(String(value || '')) ? String(value) : 'interested';
}

const DEFAULT_SALE_DELIVERY_CHECKLIST = [
  { id: 'payment', label: 'Cobro completo verificado' },
  { id: 'contract', label: 'Contrato de compraventa firmado por ambas partes' },
  { id: 'invoice', label: 'Factura de venta emitida y entregada' },
  { id: 'docs', label: 'Documentación completa (ficha técnica, ITV, permiso circulación)' },
  { id: 'transfer', label: 'Transferencia de titularidad tramitada' },
  { id: 'keys', label: 'Llaves entregadas (principal + copia)' },
  { id: 'accessories', label: 'Accesorios incluidos (alfombrillas, triángulos, chaleco)' },
  { id: 'condition', label: 'Estado del vehículo verificado (sin daños nuevos)' },
  { id: 'manual', label: 'Manual del propietario entregado' },
  { id: 'warranty', label: 'Garantía y condiciones explicadas al cliente' },
  { id: 'clean', label: 'Vehículo limpio y preparado para entrega' },
  { id: 'fuel', label: 'Nivel de combustible verificado y registrado' },
  { id: 'mileage', label: 'Kilometraje registrado en el acta de entrega' },
];

function normalizeSaleDeliveryChecklist(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return DEFAULT_SALE_DELIVERY_CHECKLIST.map((item) => ({ ...item, checked: false, notes: '' }));
  }
  return value.map((item, index) => ({
    id: String(item?.id || `delivery-item-${index + 1}`),
    label: String(item?.label || `Punto ${index + 1}`),
    checked: Boolean(item?.checked),
    notes: String(item?.notes || ''),
  }));
}

export function buildSaleDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `sale-${uuidv4()}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'sale',
    id,
    user_id: userId,
    vehicleId: String(data.vehicleId || ''),
    vehicleName: String(data.vehicleName || ''),
    vehiclePlate: String(data.vehiclePlate || '').toUpperCase(),
    vehicleYear: data.vehicleYear ? Number(data.vehicleYear) || undefined : undefined,
    vehicleMileage: data.vehicleMileage ? Number(data.vehicleMileage) || undefined : undefined,
    vehicleFuel: String(data.vehicleFuel || ''),
    purchasePrice: Number(data.purchasePrice || 0),
    clientId: String(data.clientId || ''),
    clientName: String(data.clientName || ''),
    clientPhone: String(data.clientPhone || ''),
    clientEmail: String(data.clientEmail || ''),
    clientDni: data.clientDni !== undefined ? String(data.clientDni || '') : (existing?.clientDni || ''),
    leadId: data.leadId !== undefined ? String(data.leadId || '') : (existing?.leadId || ''),
    stage: normalizeSaleStage(data.stage),
    totalPrice: Number(data.totalPrice || 0),
    depositPaid: Number(data.depositPaid || 0),
    financingAmount: Number(data.financingAmount || 0),
    financingBank: String(data.financingBank || ''),
    paymentMethod: String(data.paymentMethod || ''),
    operationType: String(data.operationType || ''),
    expectedDelivery: String(data.expectedDelivery || ''),
    deliveredAt: normalizeSaleStage(data.stage) === 'delivered'
      ? (data.deliveredAt || existing?.deliveredAt || now)
      : (existing?.deliveredAt || ''),
    responsible: String(data.responsible || 'Sin asignar'),
    responsibleId: data.responsibleId !== undefined
      ? String(data.responsibleId || '')
      : (existing?.responsibleId || ''),
    notes: String(data.notes || ''),
    stageHistory: Array.isArray(data.stageHistory) ? data.stageHistory : (existing?.stageHistory || []),
    paymentHistory: Array.isArray(data.paymentHistory) ? data.paymentHistory : (existing?.paymentHistory || []),
    internalNotes: Array.isArray(data.internalNotes) ? data.internalNotes : (existing?.internalNotes || []),
    generatedDocuments: Array.isArray(data.generatedDocuments) ? data.generatedDocuments : (existing?.generatedDocuments || []),
    priceHistory: Array.isArray(data.priceHistory) ? data.priceHistory : (existing?.priceHistory || []),
    deliveryChecklist: normalizeSaleDeliveryChecklist(data.deliveryChecklist || existing?.deliveryChecklist),
    minimumPrice: Number.isFinite(Number(data.minimumPrice))
      ? Number(data.minimumPrice)
      : (Number.isFinite(Number(existing?.minimumPrice)) ? Number(existing.minimumPrice) : Number(data.purchasePrice || existing?.purchasePrice || 0)),
    closureData: data.closureData !== undefined ? data.closureData : (existing?.closureData || undefined),
    deliveryData: data.deliveryData !== undefined ? data.deliveryData : (existing?.deliveryData || undefined),
    vehicleBlocked: data.vehicleBlocked !== undefined ? Boolean(data.vehicleBlocked) : Boolean(
      existing?.vehicleBlocked ?? ['reserved', 'documentation', 'sold', 'delivered'].includes(normalizeSaleStage(data.stage)),
    ),
    vehicleBlockReason: data.vehicleBlockReason !== undefined ? data.vehicleBlockReason : existing?.vehicleBlockReason,
    vehicleStatusBeforeSale: data.vehicleStatusBeforeSale !== undefined
      ? String(data.vehicleStatusBeforeSale || '')
      : (existing?.vehicleStatusBeforeSale || ''),
    financeIncomeCreated: data.financeIncomeCreated !== undefined ? Boolean(data.financeIncomeCreated) : Boolean(existing?.financeIncomeCreated),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeSale(sale) {
  if (!sale) return null;
  return {
    _id: sale._id,
    _rev: sale._rev,
    type: 'sale',
    id: sale._id,
    user_id: sale.user_id,
    vehicleId: sale.vehicleId || '',
    vehicleName: sale.vehicleName || '',
    vehiclePlate: sale.vehiclePlate || '',
    vehicleYear: sale.vehicleYear,
    vehicleMileage: sale.vehicleMileage,
    vehicleFuel: sale.vehicleFuel || '',
    purchasePrice: Number(sale.purchasePrice || 0),
    clientId: sale.clientId || '',
    clientName: sale.clientName || '',
    clientPhone: sale.clientPhone || '',
    clientEmail: sale.clientEmail || '',
    clientDni: sale.clientDni || '',
    leadId: sale.leadId || '',
    stage: normalizeSaleStage(sale.stage),
    totalPrice: Number(sale.totalPrice || 0),
    depositPaid: Number(sale.depositPaid || 0),
    financingAmount: Number(sale.financingAmount || 0),
    financingBank: sale.financingBank || '',
    paymentMethod: sale.paymentMethod || '',
    operationType: sale.operationType || '',
    expectedDelivery: sale.expectedDelivery || '',
    deliveredAt: sale.deliveredAt || '',
    responsible: sale.responsible || 'Sin asignar',
    responsibleId: sale.responsibleId || '',
    notes: sale.notes || '',
    stageHistory: Array.isArray(sale.stageHistory) ? sale.stageHistory : [],
    paymentHistory: Array.isArray(sale.paymentHistory) ? sale.paymentHistory : [],
    internalNotes: Array.isArray(sale.internalNotes) ? sale.internalNotes : [],
    generatedDocuments: Array.isArray(sale.generatedDocuments) ? sale.generatedDocuments : [],
    priceHistory: Array.isArray(sale.priceHistory) ? sale.priceHistory : [],
    deliveryChecklist: normalizeSaleDeliveryChecklist(sale.deliveryChecklist),
    minimumPrice: Number.isFinite(Number(sale.minimumPrice))
      ? Number(sale.minimumPrice)
      : Number(sale.purchasePrice || 0),
    closureData: sale.closureData || undefined,
    deliveryData: sale.deliveryData || undefined,
    vehicleBlocked: Boolean(sale.vehicleBlocked),
    vehicleBlockReason: sale.vehicleBlockReason || undefined,
    vehicleStatusBeforeSale: sale.vehicleStatusBeforeSale || '',
    financeIncomeCreated: Boolean(sale.financeIncomeCreated),
    createdAt: sale.createdAt || new Date().toISOString(),
    updatedAt: sale.updatedAt || sale.createdAt || new Date().toISOString(),
    deletedAt: sale.deletedAt || null,
  };
}

export async function listSalesByUser(req, userId) {
  const db = getSalesDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'sale' && !doc?.deletedAt && doc?.user_id === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ─── RESERVATIONS ─────────────────────────────────────────────────────────────

function normalizeReservationStatus(value) {
  const allowed = ['active', 'expired', 'cancelled', 'converted'];
  return allowed.includes(String(value || '')) ? String(value) : 'active';
}

export function getReservationsDbName() {
  return getSalesDbName();
}

export function buildReservationDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `reservation-${uuidv4()}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'reservation',
    id,
    user_id: userId,

    clientId: String(data.clientId || ''),
    clientName: String(data.clientName || ''),
    clientPhone: String(data.clientPhone || ''),
    clientEmail: String(data.clientEmail || ''),
    clientDni: String(data.clientDni || ''),

    vehicleId: String(data.vehicleId || ''),
    vehicleName: String(data.vehicleName || ''),
    vehiclePlate: String(data.vehiclePlate || '').toUpperCase(),
    vehicleYear: data.vehicleYear ? Number(data.vehicleYear) || undefined : undefined,

    status: normalizeReservationStatus(data.status),
    depositAmount: Number(data.depositAmount || 0),
    depositPaid: Boolean(data.depositPaid),
    paymentMethod: String(data.paymentMethod || ''),
    reservationDate: String(data.reservationDate || now.slice(0, 10)),
    expirationDate: String(data.expirationDate || ''),

    saleId: String(data.saleId || existing?.saleId || ''),
    financeMovementId: String(data.financeMovementId || existing?.financeMovementId || ''),
    contractGenerated: Boolean(data.contractGenerated ?? existing?.contractGenerated),

    commercial: String(data.commercial || 'Sin asignar'),
    commercialId: String(data.commercialId || ''),
    observations: String(data.observations || ''),
    workCenterId: String(data.workCenterId || ''),
    workCenterName: String(data.workCenterName || ''),

    createdAt: existing?.createdAt || now,
    updatedAt: now,
    cancelledAt: existing?.cancelledAt || null,
    cancelReason: existing?.cancelReason || '',
    convertedAt: existing?.convertedAt || null,
  };
}

export function sanitizeReservation(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'reservation',
    id: doc._id,
    user_id: doc.user_id || '',

    clientId: doc.clientId || '',
    clientName: doc.clientName || '',
    clientPhone: doc.clientPhone || '',
    clientEmail: doc.clientEmail || '',
    clientDni: doc.clientDni || '',

    vehicleId: doc.vehicleId || '',
    vehicleName: doc.vehicleName || '',
    vehiclePlate: doc.vehiclePlate || '',
    vehicleYear: doc.vehicleYear,

    status: normalizeReservationStatus(doc.status),
    depositAmount: Number(doc.depositAmount || 0),
    depositPaid: Boolean(doc.depositPaid),
    paymentMethod: doc.paymentMethod || '',
    reservationDate: doc.reservationDate || '',
    expirationDate: doc.expirationDate || '',

    saleId: doc.saleId || '',
    financeMovementId: doc.financeMovementId || '',
    contractGenerated: Boolean(doc.contractGenerated),

    commercial: doc.commercial || 'Sin asignar',
    commercialId: doc.commercialId || '',
    observations: doc.observations || '',
    workCenterId: doc.workCenterId || '',
    workCenterName: doc.workCenterName || '',

    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    cancelledAt: doc.cancelledAt || null,
    cancelReason: doc.cancelReason || '',
    convertedAt: doc.convertedAt || null,
  };
}

export async function listReservationsByUser(req, userId) {
  const db = getReservationsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'reservation' && !doc?.deletedAt && doc?.user_id === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ─── OPPORTUNITIES ────────────────────────────────────────────────────────────

const VALID_OPPORTUNITY_STATUSES = ['new', 'contacted', 'test_drive', 'quoted', 'negotiation', 'reserved', 'won', 'lost'];

function normalizeOpportunityStatus(value) {
  return VALID_OPPORTUNITY_STATUSES.includes(String(value || '')) ? String(value) : 'new';
}

export function getOpportunitiesDbName() {
  return normalizeDbName(process.env.VITE_OPPORTUNITIES_DB || `${getDbPrefix()}-opportunities`);
}

export function buildOpportunityDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data.id || `opp-${uuidv4()}`;
  const newStatus = normalizeOpportunityStatus(data.commercialStatus);
  const oldStatus = existing ? normalizeOpportunityStatus(existing.commercialStatus) : null;

  const stageHistory = Array.isArray(data.stageHistory)
    ? data.stageHistory
    : (existing?.stageHistory || []);

  if (existing && oldStatus && newStatus !== oldStatus) {
    stageHistory.push({
      from: oldStatus,
      to: newStatus,
      at: now,
      by: String(data._changedBy || ''),
    });
  }

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'opportunity',
    id,
    user_id: userId,
    leadId: String(data.leadId || existing?.leadId || ''),
    clientId: String(data.clientId || existing?.clientId || ''),
    vehicleId: String(data.vehicleId || existing?.vehicleId || ''),
    vehicleName: String(data.vehicleName || existing?.vehicleName || ''),
    vehiclePlate: String(data.vehiclePlate || existing?.vehiclePlate || '').toUpperCase(),
    vehicleYear: data.vehicleYear ? Number(data.vehicleYear) || undefined : (existing?.vehicleYear || undefined),
    vehiclePrice: Number(data.vehiclePrice || existing?.vehiclePrice || 0),
    commercialStatus: newStatus,
    responsible: String(data.responsible || existing?.responsible || 'Sin asignar'),
    responsibleName: String(data.responsibleName || existing?.responsibleName || ''),
    budget: Number(data.budget || existing?.budget || 0),
    quoteId: String(data.quoteId || existing?.quoteId || ''),
    saleId: String(data.saleId || existing?.saleId || ''),
    expectedCloseDate: String(data.expectedCloseDate || existing?.expectedCloseDate || ''),
    probability: Math.min(100, Math.max(0, Number(data.probability ?? existing?.probability ?? 50))),
    source: String(data.source || existing?.source || ''),
    notes: String(data.notes ?? existing?.notes ?? ''),
    nextAction: data.nextAction !== undefined ? data.nextAction : (existing?.nextAction || null),
    interactions: Array.isArray(data.interactions) ? data.interactions : (existing?.interactions || []),
    tags: Array.isArray(data.tags) ? data.tags.map((t) => String(t)) : (existing?.tags || []),
    lostReason: String(data.lostReason || existing?.lostReason || ''),
    financingRequested: Boolean(data.financingRequested ?? existing?.financingRequested),
    tradeInVehicleId: String(data.tradeInVehicleId || existing?.tradeInVehicleId || ''),
    stageHistory,
    lastContact: String(data.lastContact || existing?.lastContact || ''),
    workCenterId: String(data.workCenterId || existing?.workCenterId || ''),
    workCenterName: String(data.workCenterName || existing?.workCenterName || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeOpportunity(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'opportunity',
    id: doc._id,
    user_id: doc.user_id || '',
    leadId: doc.leadId || '',
    clientId: doc.clientId || '',
    vehicleId: doc.vehicleId || '',
    vehicleName: doc.vehicleName || '',
    vehiclePlate: doc.vehiclePlate || '',
    vehicleYear: doc.vehicleYear || undefined,
    vehiclePrice: Number(doc.vehiclePrice || 0),
    commercialStatus: normalizeOpportunityStatus(doc.commercialStatus),
    responsible: doc.responsible || 'Sin asignar',
    responsibleName: doc.responsibleName || '',
    budget: Number(doc.budget || 0),
    quoteId: doc.quoteId || '',
    saleId: doc.saleId || '',
    expectedCloseDate: doc.expectedCloseDate || '',
    probability: Number(doc.probability ?? 50),
    source: doc.source || '',
    notes: doc.notes || '',
    nextAction: doc.nextAction || null,
    interactions: Array.isArray(doc.interactions) ? doc.interactions : [],
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    lostReason: doc.lostReason || '',
    financingRequested: Boolean(doc.financingRequested),
    tradeInVehicleId: doc.tradeInVehicleId || '',
    stageHistory: Array.isArray(doc.stageHistory) ? doc.stageHistory : [],
    lastContact: doc.lastContact || '',
    workCenterId: doc.workCenterId || '',
    workCenterName: doc.workCenterName || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listOpportunitiesByUser(req, userId) {
  const db = getOpportunitiesDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'opportunity' && !doc?.deletedAt && doc?.user_id === userId)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

// ─── SCRAPYARD SALES (Ventas de piezas de desguace) ──────────────────────────

export function getScrapyardSalesDbName() {
  return normalizeDbName(`${getDbPrefix()}-scrapyard-sales`);
}

const VALID_SCRAPYARD_CHANNELS = ['mostrador', 'telefono', 'web', 'talleres', 'marketplace'];
const VALID_SCRAPYARD_STATUSES = ['borrador', 'confirmada', 'preparando', 'lista', 'enviada', 'entregada', 'cancelada'];
const VALID_SCRAPYARD_PAY_METHODS = ['efectivo', 'tarjeta', 'transferencia', 'bizum', 'financiacion', 'contrareembolso'];
const VALID_SCRAPYARD_PAY_STATUSES = ['pendiente', 'parcial', 'cobrada'];
const VALID_SCRAPYARD_DELIVERY = ['recogida', 'envio'];
const VALID_SCRAPYARD_CLIENT_TYPES = ['particular', 'taller', 'empresa'];

function normalizeScrapyardChannel(v) { return VALID_SCRAPYARD_CHANNELS.includes(String(v || '')) ? String(v) : 'mostrador'; }
function normalizeScrapyardStatus(v) { return VALID_SCRAPYARD_STATUSES.includes(String(v || '')) ? String(v) : 'borrador'; }
function normalizeScrapyardPayMethod(v) { return VALID_SCRAPYARD_PAY_METHODS.includes(String(v || '')) ? String(v) : 'efectivo'; }
function normalizeScrapyardPayStatus(v) { return VALID_SCRAPYARD_PAY_STATUSES.includes(String(v || '')) ? String(v) : 'pendiente'; }
function normalizeScrapyardDelivery(v) { return VALID_SCRAPYARD_DELIVERY.includes(String(v || '')) ? String(v) : 'recogida'; }
function normalizeScrapyardClientType(v) { return VALID_SCRAPYARD_CLIENT_TYPES.includes(String(v || '')) ? String(v) : 'particular'; }

function sanitizeScrapyardShipping(data) {
  if (!data || typeof data !== 'object') return { direccion: '', cp: '', ciudad: '', provincia: '', transportista: '', numSeguimiento: '', costeEnvio: 0 };
  return {
    direccion: String(data.direccion || ''),
    cp: String(data.cp || ''),
    ciudad: String(data.ciudad || ''),
    provincia: String(data.provincia || ''),
    transportista: String(data.transportista || ''),
    numSeguimiento: String(data.numSeguimiento || ''),
    costeEnvio: Number(data.costeEnvio || 0),
  };
}

function sanitizeScrapyardLines(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(l => ({
    id: String(l.id || uuidv4()),
    piezaId: String(l.piezaId || ''),
    referencia: String(l.referencia || ''),
    nombre: String(l.nombre || ''),
    cantidad: Number(l.cantidad || 1),
    precioUnitario: Number(l.precioUnitario || 0),
    coste: Number(l.coste || 0),
    descuento: Number(l.descuento || 0),
    subtotal: Number(l.subtotal || 0),
  }));
}

function sanitizeScrapyardPayments(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(p => ({
    id: String(p.id || uuidv4()),
    importe: Number(p.importe || 0),
    metodo: normalizeScrapyardPayMethod(p.metodo),
    fecha: String(p.fecha || new Date().toISOString()),
    nota: String(p.nota || ''),
  }));
}

function sanitizeScrapyardHistorial(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(h => ({
    id: String(h.id || uuidv4()),
    accion: String(h.accion || ''),
    fecha: String(h.fecha || ''),
    usuario: String(h.usuario || ''),
    detalle: String(h.detalle || ''),
  }));
}

function sanitizeScrapyardDocuments(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(d => ({
    id: String(d.id || uuidv4()),
    tipo: String(d.tipo || ''),
    nombre: String(d.nombre || ''),
    fecha: String(d.fecha || ''),
    fileData: d.fileData || undefined,
    mimeType: d.mimeType || undefined,
  }));
}

export function buildScrapyardSaleDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `scrapyard-sale-${uuidv4()}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'scrapyard_sale',
    id,
    user_id: userId,
    numVenta: String(data.numVenta || existing?.numVenta || ''),
    canal: normalizeScrapyardChannel(data.canal ?? existing?.canal),
    canalDetalle: String(data.canalDetalle ?? existing?.canalDetalle ?? ''),
    clientId: String(data.clientId || existing?.clientId || ''),
    clientName: String(data.clientName || existing?.clientName || ''),
    clientPhone: String(data.clientPhone || existing?.clientPhone || ''),
    clientEmail: String(data.clientEmail || existing?.clientEmail || ''),
    clientTipo: normalizeScrapyardClientType(data.clientTipo ?? existing?.clientTipo),
    lineas: sanitizeScrapyardLines(data.lineas ?? existing?.lineas),
    importeTotal: Number(data.importeTotal ?? existing?.importeTotal ?? 0),
    descuentoGlobal: Number(data.descuentoGlobal ?? existing?.descuentoGlobal ?? 0),
    importeNeto: Number(data.importeNeto ?? existing?.importeNeto ?? 0),
    iva: Number(data.iva ?? existing?.iva ?? 21),
    importeConIva: Number(data.importeConIva ?? existing?.importeConIva ?? 0),
    formaPago: normalizeScrapyardPayMethod(data.formaPago ?? existing?.formaPago),
    estadoPago: normalizeScrapyardPayStatus(data.estadoPago ?? existing?.estadoPago),
    pagos: sanitizeScrapyardPayments(data.pagos ?? existing?.pagos),
    entrega: normalizeScrapyardDelivery(data.entrega ?? existing?.entrega),
    envio: sanitizeScrapyardShipping(data.envio ?? existing?.envio),
    estado: normalizeScrapyardStatus(data.estado ?? existing?.estado),
    reservaExpira: String(data.reservaExpira || existing?.reservaExpira || ''),
    observaciones: String(data.observaciones ?? existing?.observaciones ?? ''),
    responsable: String(data.responsable || existing?.responsable || 'Sin asignar'),
    garantia: String(data.garantia ?? existing?.garantia ?? '3 meses'),
    documentos: sanitizeScrapyardDocuments(data.documentos ?? existing?.documentos),
    historial: sanitizeScrapyardHistorial(data.historial ?? existing?.historial),
    margen: Number(data.margen ?? existing?.margen ?? 0),
    financeIncomeCreated: Boolean(data.financeIncomeCreated ?? existing?.financeIncomeCreated),
    cancelMotivo: String(data.cancelMotivo ?? existing?.cancelMotivo ?? ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeScrapyardSale(sale) {
  if (!sale) return null;
  return {
    _id: sale._id,
    _rev: sale._rev,
    type: 'scrapyard_sale',
    id: sale._id,
    user_id: sale.user_id,
    numVenta: sale.numVenta || '',
    canal: normalizeScrapyardChannel(sale.canal),
    canalDetalle: sale.canalDetalle || '',
    clientId: sale.clientId || '',
    clientName: sale.clientName || '',
    clientPhone: sale.clientPhone || '',
    clientEmail: sale.clientEmail || '',
    clientTipo: normalizeScrapyardClientType(sale.clientTipo),
    lineas: sanitizeScrapyardLines(sale.lineas),
    importeTotal: Number(sale.importeTotal || 0),
    descuentoGlobal: Number(sale.descuentoGlobal || 0),
    importeNeto: Number(sale.importeNeto || 0),
    iva: Number(sale.iva ?? 21),
    importeConIva: Number(sale.importeConIva || 0),
    formaPago: normalizeScrapyardPayMethod(sale.formaPago),
    estadoPago: normalizeScrapyardPayStatus(sale.estadoPago),
    pagos: sanitizeScrapyardPayments(sale.pagos),
    entrega: normalizeScrapyardDelivery(sale.entrega),
    envio: sanitizeScrapyardShipping(sale.envio),
    estado: normalizeScrapyardStatus(sale.estado),
    reservaExpira: sale.reservaExpira || '',
    observaciones: sale.observaciones || '',
    responsable: sale.responsable || 'Sin asignar',
    garantia: sale.garantia || '3 meses',
    documentos: sanitizeScrapyardDocuments(sale.documentos),
    historial: sanitizeScrapyardHistorial(sale.historial),
    margen: Number(sale.margen || 0),
    financeIncomeCreated: Boolean(sale.financeIncomeCreated),
    cancelMotivo: sale.cancelMotivo || '',
    createdAt: sale.createdAt || new Date().toISOString(),
    updatedAt: sale.updatedAt || sale.createdAt || new Date().toISOString(),
    deletedAt: sale.deletedAt || null,
  };
}

export async function listScrapyardSalesByUser(req, userId) {
  const db = getScrapyardSalesDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'scrapyard_sale' && !doc?.deletedAt && doc?.user_id === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ─── LEADS ────────────────────────────────────────────────────────────────────

function normalizeLeadStatus(value) {
  const allowed = ['new', 'contacted', 'appointment', 'reserved', 'negotiation', 'won', 'lost'];
  return allowed.includes(String(value || '')) ? String(value) : 'new';
}

export function buildLeadDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data.id || `lead-${uuidv4()}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'lead',
    id,
    user_id: userId,
    name: String(data.name || '').trim(),
    phone: String(data.phone || '').trim(),
    email: String(data.email || '').trim().toLowerCase(),
    source: String(data.source || 'web'),
    status: normalizeLeadStatus(data.status),
    interestedVehicle: String(data.interestedVehicle || data.vehicleInterest || ''),
    vehicleInterest: String(data.vehicleInterest || data.interestedVehicle || ''),
    vehicleInterestId: String(data.vehicleInterestId || ''),
    budget: String(data.budget || ''),
    notes: String(data.notes || ''),
    responsible: String(data.responsible || 'Sin asignar'),
    tags: Array.isArray(data.tags) ? data.tags.map((t) => String(t)) : (existing?.tags || []),
    interactions: Array.isArray(data.interactions) ? data.interactions : (existing?.interactions || []),
    score: typeof data.score === 'number' ? data.score : (existing?.score ?? 0),
    lastContact: data.lastContact ? String(data.lastContact) : '',
    convertedAt: data.convertedAt ? String(data.convertedAt) : '',
    convertedToClientId: String(data.convertedToClientId || ''),
    convertedToClientName: String(data.convertedToClientName || ''),
    // UTM attribution
    utm_source: String(data.utm_source || existing?.utm_source || ''),
    utm_medium: String(data.utm_medium || existing?.utm_medium || ''),
    utm_campaign: String(data.utm_campaign || existing?.utm_campaign || ''),
    utm_content: String(data.utm_content || existing?.utm_content || ''),
    utm_term: String(data.utm_term || existing?.utm_term || ''),
    referrer: String(data.referrer || existing?.referrer || ''),
    landing_page: String(data.landing_page || existing?.landing_page || ''),
    createdAt: existing?.createdAt || (data.createdAt ? String(data.createdAt) : now),
    updatedAt: now,
  };
}

export function sanitizeLead(lead) {
  if (!lead) return null;
  return {
    _rev: lead._rev,
    type: 'lead',
    user_id: lead.user_id || '',
    id: lead._id,
    name: lead.name || '',
    phone: lead.phone || '',
    email: lead.email || '',
    source: lead.source || 'web',
    status: normalizeLeadStatus(lead.status),
    interestedVehicle: lead.interestedVehicle || lead.vehicleInterest || '',
    vehicleInterest: lead.vehicleInterest || lead.interestedVehicle || '',
    vehicleInterestId: lead.vehicleInterestId || '',
    budget: lead.budget || '',
    notes: lead.notes || '',
    responsible: lead.responsible || 'Sin asignar',
    tags: Array.isArray(lead.tags) ? lead.tags : [],
    interactions: Array.isArray(lead.interactions) ? lead.interactions : [],
    score: Number(lead.score || 0),
    lastContact: lead.lastContact || '',
    convertedAt: lead.convertedAt || '',
    convertedToClientId: lead.convertedToClientId || '',
    convertedToClientName: lead.convertedToClientName || '',
    utm_source: lead.utm_source || '',
    utm_medium: lead.utm_medium || '',
    utm_campaign: lead.utm_campaign || '',
    utm_content: lead.utm_content || '',
    utm_term: lead.utm_term || '',
    referrer: lead.referrer || '',
    landing_page: lead.landing_page || '',
    createdAt: lead.createdAt || new Date().toISOString(),
    updatedAt: lead.updatedAt || lead.createdAt || new Date().toISOString(),
    deletedAt: lead.deletedAt || null,
  };
}

export async function listLeadsByUser(req, userId) {
  const db = getLeadsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'lead' && !doc?.deletedAt && doc?.user_id === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function findDuplicateLeads(req, userId, candidateData) {
  const leads = await listLeadsByUser(req, userId);
  const normPhone = (p) => String(p || '').replace(/\D/g, '').slice(-9);
  const normStr = (s) => String(s || '').trim().toLowerCase();

  const phone = normPhone(candidateData.phone);
  const email = normStr(candidateData.email);
  const excludeId = candidateData.id || candidateData._id || '';

  return leads.filter((l) => {
    if (l._id === excludeId) return false;
    if (email && normStr(l.email) === email) return true;
    if (phone && phone.length >= 9 && normPhone(l.phone) === phone) return true;
    return false;
  }).map(sanitizeLead);
}

// ─── CLIENTS ──────────────────────────────────────────────────────────────────

function normalizeClientStatus(value) {
  const allowed = ['active', 'inactive', 'vip', 'blocked'];
  return allowed.includes(String(value || '')) ? String(value) : 'active';
}

function normalizeClientType(value) {
  const allowed = ['particular', 'empresa'];
  return allowed.includes(String(value || '')) ? String(value) : 'particular';
}

function normalizeCommercialStatus(value) {
  const allowed = ['prospect', 'active', 'negotiation', 'loyal', 'at_risk', 'churned', 'inactive'];
  return allowed.includes(String(value || '')) ? String(value) : 'active';
}

function sanitizeAddress(addr) {
  if (!addr || typeof addr !== 'object') return null;
  return {
    id: String(addr.id || `addr-${uuidv4()}`),
    label: String(addr.label || addr.etiqueta || '').trim(),
    street: String(addr.street || '').trim(),
    postalCode: String(addr.postalCode || '').trim(),
    city: String(addr.city || '').trim(),
    state: String(addr.state || '').trim(),
    country: String(addr.country || '').trim(),
    isPrimary: Boolean(addr.isPrimary || addr.esPrincipal),
  };
}

/** Rellena address/ciudad/CP desde la dirección principal del TPV si faltan en el nivel raíz. */
function resolveClientLocationFields(client) {
  const addrs = Array.isArray(client?.addresses) ? client.addresses : [];
  const primary = addrs.find((a) => a?.isPrimary) || addrs[0];
  return {
    address: String(client?.address || '').trim() || String(primary?.street || '').trim(),
    city: String(client?.city || '').trim() || String(primary?.city || '').trim(),
    postalCode: String(client?.postalCode || '').trim() || String(primary?.postalCode || '').trim(),
  };
}

function sanitizeSocialLink(link) {
  if (!link || typeof link !== 'object') return null;
  return {
    id: String(link.id || `social-${uuidv4()}`),
    name: String(link.name || link.nombre || '').trim(),
    url: String(link.url || '').trim(),
  };
}

function sanitizeContactPerson(contact) {
  if (!contact || typeof contact !== 'object') return null;
  return {
    id: String(contact.id || `contact-${uuidv4()}`),
    name: String(contact.name || contact.nombre || '').trim(),
    role: String(contact.role || contact.cargo || '').trim(),
    email: String(contact.email || '').trim().toLowerCase(),
    phone: String(contact.phone || contact.telefono || '').trim(),
    notes: String(contact.notes || '').trim(),
  };
}

export function buildClientDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data.id || `client-${uuidv4()}`;

  const rawAddresses = Array.isArray(data.addresses) ? data.addresses : (existing?.addresses || []);
  const rawSocialLinks = Array.isArray(data.socialLinks) ? data.socialLinks : (existing?.socialLinks || []);
  const rawContacts = Array.isArray(data.contacts) ? data.contacts : (existing?.contacts || []);
  const addresses = rawAddresses.map(sanitizeAddress).filter(Boolean);
  const location = resolveClientLocationFields({
    address: data.address ?? existing?.address,
    city: data.city ?? existing?.city,
    postalCode: data.postalCode ?? existing?.postalCode,
    addresses,
  });

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'client',
    id,
    user_id: userId,
    business_id: normalizeClientBusinessScopeId(
      data.businessId || data.business_id || existing?.businessId || existing?.business_id,
    ),
    businessId: normalizeClientBusinessScopeId(
      data.businessId || data.business_id || existing?.businessId || existing?.business_id,
    ),
    clientType: normalizeClientType(data.clientType || data.tipo || existing?.clientType),
    name: String(data.name || '').trim(),
    phone: String(data.phone || '').trim(),
    phonePrefix: String(data.phonePrefix || existing?.phonePrefix || '+34').trim(),
    email: String(data.email || '').trim().toLowerCase(),
    dni: String(data.dni || '').trim(),
    legalName: String(data.legalName || existing?.legalName || '').trim(),
    fiscalId: String(data.fiscalId || existing?.fiscalId || '').trim(),
    fiscalAddress: String(data.fiscalAddress || existing?.fiscalAddress || '').trim(),
    fiscalCity: String(data.fiscalCity || existing?.fiscalCity || '').trim(),
    fiscalPostalCode: String(data.fiscalPostalCode || existing?.fiscalPostalCode || '').trim(),
    fiscalCountry: String(data.fiscalCountry || existing?.fiscalCountry || 'España').trim(),
    commercialStatus: normalizeCommercialStatus(data.commercialStatus || existing?.commercialStatus),
    address: location.address,
    city: location.city,
    postalCode: location.postalCode,
    addresses,
    socialLinks: rawSocialLinks.map(sanitizeSocialLink).filter(Boolean),
    contacts: rawContacts.map(sanitizeContactPerson).filter(Boolean),
    status: normalizeClientStatus(data.status),
    responsible: String(
      data.responsible != null ? data.responsible : (existing?.responsible || 'Sin asignar'),
    ),
    responsibleUserId: String(
      data.responsibleUserId != null
        ? data.responsibleUserId
        : (existing?.responsibleUserId || ''),
    ).trim().replace(/^account:/, ''),
    notes: String(data.notes || ''),
    consents: {
      dataProcessing: Boolean(data.consents?.dataProcessing),
      commercial: Boolean(data.consents?.commercial),
      thirdParty: Boolean(data.consents?.thirdParty),
    },
    vehiclesPurchased: Array.isArray(data.vehiclesPurchased)
      ? data.vehiclesPurchased.map((v) => String(v))
      : (existing?.vehiclesPurchased || []),
    vehiclesSold: Array.isArray(data.vehiclesSold)
      ? data.vehiclesSold.map((v) => String(v))
      : (existing?.vehiclesSold || []),
    documentsCount: Number(data.documentsCount || existing?.documentsCount || 0),
    interactions: Array.isArray(data.interactions) ? data.interactions : (existing?.interactions || []),
    documentsList: Array.isArray(data.documentsList) ? data.documentsList : (existing?.documentsList || []),
    tags: Array.isArray(data.tags) ? data.tags.map((t) => String(t)) : (existing?.tags || []),
    gdpr: data.gdpr != null ? data.gdpr : (existing?.gdpr || null),
    defaultPaymentMethod: normalizePaymentMethod(data.defaultPaymentMethod || existing?.defaultPaymentMethod),
    referralCode: String(data.referralCode || existing?.referralCode || '').trim(),
    referredByAffiliateId: String(data.referredByAffiliateId || existing?.referredByAffiliateId || '').trim(),
    stats: (() => {
      const acquisitionKind = data.stats?.acquisitionKind ?? existing?.stats?.acquisitionKind ?? undefined;
      const excludeExplicit = data.stats?.excludeFromNewMetrics ?? existing?.stats?.excludeFromNewMetrics;
      return {
        totalOrders: Number(data.stats?.totalOrders ?? existing?.stats?.totalOrders ?? 0),
        lastOrderDate: data.stats?.lastOrderDate ?? existing?.stats?.lastOrderDate ?? null,
        orderFrequencyDays: Number(data.stats?.orderFrequencyDays ?? existing?.stats?.orderFrequencyDays ?? 0),
        favoriteAddressId: data.stats?.favoriteAddressId ?? existing?.stats?.favoriteAddressId ?? null,
        totalSpent: Number(data.stats?.totalSpent ?? existing?.stats?.totalSpent ?? 0),
        createdFrom: data.stats?.createdFrom ?? existing?.stats?.createdFrom ?? 'crm',
        acquisitionKind,
        excludeFromNewMetrics: excludeExplicit != null
          ? Boolean(excludeExplicit)
          : acquisitionKind === 'migration',
        ...(Boolean(data.stats?.lostFromQuickAttention ?? existing?.stats?.lostFromQuickAttention)
          ? { lostFromQuickAttention: true }
          : {}),
      };
    })(),
    loyalty: {
      enrolled: Boolean(data.loyalty?.enrolled ?? existing?.loyalty?.enrolled),
      enrolledAt: data.loyalty?.enrolledAt ?? existing?.loyalty?.enrolledAt ?? null,
      points: Number(data.loyalty?.points ?? existing?.loyalty?.points ?? 0),
      level: data.loyalty?.level ?? existing?.loyalty?.level ?? 'bronze',
      totalVisits: Number(data.loyalty?.totalVisits ?? existing?.loyalty?.totalVisits ?? 0),
    },
    portalToken: data.portalToken ?? existing?.portalToken,
    portalTokenGeneratedAt: data.portalTokenGeneratedAt ?? existing?.portalTokenGeneratedAt,
    createdAt: existing?.createdAt || (data.createdAt ? String(data.createdAt) : now),
    updatedAt: now,
  };
}

const ALLOWED_PAYMENT_METHODS = ['efectivo', 'tarjeta', 'transferencia', 'domiciliacion', 'bizum', 'cheque', 'pagare', 'confirming', 'otro'];

function normalizePaymentMethod(value) {
  const v = String(value || '').trim().toLowerCase();
  return ALLOWED_PAYMENT_METHODS.includes(v) ? v : '';
}

export function sanitizeClient(client) {
  if (!client) return null;
  const location = resolveClientLocationFields(client);
  return {
    _rev: client._rev,
    type: 'client',
    user_id: client.user_id || '',
    business_id: normalizeClientBusinessScopeId(client.businessId || client.business_id),
    businessId: normalizeClientBusinessScopeId(client.businessId || client.business_id),
    id: client._id,
    clientType: client.clientType || 'particular',
    name: client.name || '',
    phone: client.phone || '',
    phonePrefix: client.phonePrefix || '+34',
    email: client.email || '',
    dni: client.dni || '',
    legalName: client.legalName || '',
    fiscalId: client.fiscalId || '',
    fiscalAddress: client.fiscalAddress || '',
    fiscalCity: client.fiscalCity || '',
    fiscalPostalCode: client.fiscalPostalCode || '',
    fiscalCountry: client.fiscalCountry || 'España',
    commercialStatus: client.commercialStatus || 'active',
    address: location.address,
    city: location.city,
    postalCode: location.postalCode,
    addresses: Array.isArray(client.addresses) ? client.addresses : [],
    socialLinks: Array.isArray(client.socialLinks) ? client.socialLinks : [],
    contacts: Array.isArray(client.contacts) ? client.contacts : [],
    status: normalizeClientStatus(client.status),
    responsible: client.responsible || 'Sin asignar',
    responsibleUserId: String(client.responsibleUserId || '').trim().replace(/^account:/, ''),
    notes: client.notes || '',
    consents: {
      dataProcessing: Boolean(client.consents?.dataProcessing),
      commercial: Boolean(client.consents?.commercial),
      thirdParty: Boolean(client.consents?.thirdParty),
    },
    vehiclesPurchased: Array.isArray(client.vehiclesPurchased) ? client.vehiclesPurchased : [],
    vehiclesSold: Array.isArray(client.vehiclesSold) ? client.vehiclesSold : [],
    documentsCount: Number(client.documentsCount || 0),
    interactions: Array.isArray(client.interactions) ? client.interactions : [],
    documentsList: Array.isArray(client.documentsList) ? client.documentsList : [],
    tags: Array.isArray(client.tags) ? client.tags : [],
    gdpr: client.gdpr || null,
    defaultPaymentMethod: client.defaultPaymentMethod || '',
    referralCode: client.referralCode || '',
    referredByAffiliateId: client.referredByAffiliateId || '',
    stats: {
      totalOrders: client.stats?.totalOrders || 0,
      lastOrderDate: client.stats?.lastOrderDate || null,
      orderFrequencyDays: client.stats?.orderFrequencyDays || 0,
      favoriteAddressId: client.stats?.favoriteAddressId || null,
      totalSpent: client.stats?.totalSpent || 0,
      createdFrom: client.stats?.createdFrom || 'crm',
      acquisitionKind: client.stats?.acquisitionKind || undefined,
      excludeFromNewMetrics: Boolean(
        client.stats?.excludeFromNewMetrics
        || client.stats?.acquisitionKind === 'migration',
      ),
      ...(client.stats?.lostFromQuickAttention ? { lostFromQuickAttention: true } : {}),
    },
    loyalty: {
      enrolled: Boolean(client.loyalty?.enrolled),
      enrolledAt: client.loyalty?.enrolledAt || null,
      points: client.loyalty?.points || 0,
      level: client.loyalty?.level || 'bronze',
      totalVisits: client.loyalty?.totalVisits || 0,
    },
    createdAt: client.createdAt || '',
    updatedAt: client.updatedAt || client.createdAt || '',
    deletedAt: client.deletedAt || null,
    branch_id: client.branch_id || '',
    workCenterId: client.workCenterId || '',
  };
}

/** Versión ligera para listados paginados (sin interactions, documentsList, contacts, etc.). */
export function sanitizeClientSummary(client) {
  if (!client) return null;
  const location = resolveClientLocationFields(client);
  return {
    _rev: client._rev,
    type: 'client',
    user_id: client.user_id || '',
    business_id: normalizeClientBusinessScopeId(client.businessId || client.business_id),
    businessId: normalizeClientBusinessScopeId(client.businessId || client.business_id),
    id: client._id,
    clientType: client.clientType || 'particular',
    name: client.name || '',
    phone: client.phone || '',
    phonePrefix: client.phonePrefix || '+34',
    email: client.email || '',
    dni: client.dni || '',
    commercialStatus: client.commercialStatus || 'active',
    address: location.address,
    city: location.city,
    postalCode: location.postalCode,
    status: normalizeClientStatus(client.status),
    responsible: client.responsible || 'Sin asignar',
    responsibleUserId: String(client.responsibleUserId || '').trim().replace(/^account:/, ''),
    documentsCount: Number(client.documentsCount || 0),
    tags: Array.isArray(client.tags) ? client.tags : [],
    stats: {
      totalOrders: client.stats?.totalOrders || 0,
      lastOrderDate: client.stats?.lastOrderDate || null,
      totalSpent: client.stats?.totalSpent || 0,
      createdFrom: client.stats?.createdFrom || 'crm',
      acquisitionKind: client.stats?.acquisitionKind || undefined,
      excludeFromNewMetrics: Boolean(
        client.stats?.excludeFromNewMetrics
        || client.stats?.acquisitionKind === 'migration',
      ),
      ...(client.stats?.lostFromQuickAttention ? { lostFromQuickAttention: true } : {}),
    },
    loyalty: {
      enrolled: Boolean(client.loyalty?.enrolled),
      points: client.loyalty?.points || 0,
      level: client.loyalty?.level || 'bronze',
    },
    // No inventar "ahora": sin createdAt no cuenta como alta del mes en el dashboard.
    createdAt: client.createdAt || '',
    updatedAt: client.updatedAt || client.createdAt || '',
    branch_id: client.branch_id || '',
    workCenterId: client.workCenterId || '',
  };
}

/**
 * Respuesta del buscador TPV: lo necesario para pedir (direcciones, pago, notas)
 * sin vehicles/interactions/documents (payload gordo × N resultados).
 */
export function sanitizeClientForTpvSearch(client) {
  const base = sanitizeClientSummary(client);
  if (!base) return null;
  return {
    ...base,
    addresses: Array.isArray(client.addresses) ? client.addresses : [],
    notes: client.notes || '',
    defaultPaymentMethod: client.defaultPaymentMethod || '',
    stats: {
      ...base.stats,
      favoriteAddressId: client.stats?.favoriteAddressId || null,
      orderFrequencyDays: client.stats?.orderFrequencyDays || 0,
    },
    loyalty: {
      enrolled: Boolean(client.loyalty?.enrolled),
      enrolledAt: client.loyalty?.enrolledAt || null,
      points: client.loyalty?.points || 0,
      level: client.loyalty?.level || 'bronze',
      totalVisits: client.loyalty?.totalVisits || 0,
    },
  };
}

/** Índice type+user_id para _find de carteras grandes (TPV). */
async function ensureClientsUserTypeIndex(req, dbName) {
  if (clientsUserIndexReady.has(dbName)) return;
  const safeDb = String(dbName || '').replace(/[^a-z0-9]/g, '-');
  await ensureIndex(req, dbName, ['type', 'user_id'], `idx-${safeDb}-type-user_id`).catch(() => null);
  // Promos/notas al elegir cliente en TPV.
  await ensureIndex(req, dbName, ['type', 'user_id', 'clientId'], `idx-${safeDb}-type-user-client`).catch(() => null);
  clientsUserIndexReady.add(dbName);
}

export async function getClientDocumentsForUser(req, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return [];

  const cached = readClientDocumentsCache(uid);
  // [] es truthy en JS: una carga vacía no debe “pegarse” y tumbar el TPV.
  if (Array.isArray(cached) && cached.length > 0) return cached;

  const cacheKey = cacheService.buildKey('clients_user', uid, 'all');
  const fromLru = cacheService.get(cacheKey);
  if (Array.isArray(fromLru) && fromLru.length > 0) {
    writeClientDocumentsCache(uid, fromLru);
    return fromLru;
  }

  if (clientDocumentsInflight.has(uid)) {
    return clientDocumentsInflight.get(uid);
  }

  const loadGeneration = clientDocumentsGeneration.get(uid) || 0;

  const promise = (async () => {
    const db = getClientsDbName();
    await ensureDatabase(req, db);
    await ensureClientsUserTypeIndex(req, db);

    let docs;
    try {
      // Solo clientes del titular (no _all_docs de toda la DB multi-tenant).
      // pageSize 1000 → menos idas a Couch en carteras grandes (~6k docs ≈ 7 páginas).
      docs = await findDocuments(
        req,
        db,
        { type: 'client', user_id: uid },
        { pageSize: 1000, maxDocs: 50_000 },
      );
    } catch {
      const all = await getAllDocuments(req, db);
      docs = all.filter((doc) => doc?.type === 'client' && doc?.user_id === uid);
    }

    const clients = docs.filter(
      (doc) => doc?.type === 'client' && !doc?.deletedAt && doc?.user_id === uid,
    );
    const genNow = clientDocumentsGeneration.get(uid) || 0;
    // Si hubo alta/edición durante el _find, no pisar la caché con una foto stale.
    if (genNow !== loadGeneration) {
      const live = readClientDocumentsCache(uid);
      if (Array.isArray(live) && live.length > 0) return live;
      return clients;
    }
    // No cachear vacío: evita que un _find momentáneo a 0 deje el TPV ciego.
    if (clients.length > 0) {
      writeClientDocumentsCache(uid, clients);
      cacheService.set(cacheKey, clients, CLIENT_DOCS_TTL_MS);
    } else {
      invalidateClientDocumentsForUser(uid);
    }
    return clients;
  })().finally(() => {
    clientDocumentsInflight.delete(uid);
  });

  clientDocumentsInflight.set(uid, promise);
  return promise;
}

export async function listClientsByUser(req, userId, options = {}) {
  const base = await getClientDocumentsForUser(req, userId);
  const bid = normalizeClientBusinessScopeId(options.businessId);
  const scoped = bid
    ? base.filter((doc) => clientMatchesBusinessScope(doc, bid, options))
    : base;
  return scoped.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

/**
 * Filtra clientes por texto usando índice en memoria (prefijos tel/nombre).
 * @param {number} [options.limit]
 * @param {boolean} [options.earlyStopExactPhone]
 */
export function filterClientDocsBySearch(docs, searchIndex, phoneQuery, userId, options = {}) {
  const raw = String(phoneQuery || '').trim();
  if (raw.length < 1) return [];

  const list = Array.isArray(docs) ? docs : [];
  const qFold = foldSearchText(raw);
  const qDigits = raw.replace(/\D/g, '');
  const preferPhone = clientSearchPrefersPhone(raw, qDigits);
  const bid = normalizeClientBusinessScopeId(options.businessId);
  const hasLimit = options.limit != null && Number.isFinite(Number(options.limit));
  const max = hasLimit ? Math.min(50_000, Math.max(1, Number(options.limit))) : Number.POSITIVE_INFINITY;
  const earlyStopExactPhone = Boolean(options.earlyStopExactPhone && hasLimit);
  // Email / forzar: el índice es por prefijos.
  const forceScan = raw.includes('@') || Boolean(options.forceScan);

  const candidates = forceScan ? null : candidateIndicesForClientSearch(searchIndex, qFold, qDigits);
  // Índice vacío → scan completo (índice desfasado / cliente nuevo aún no indexado).
  const useIndex =
    Boolean(searchIndex) && !forceScan && candidates != null && candidates.size > 0;

  const scored = [];
  let exactPhoneHits = 0;

  const consider = (d) => {
    if (d?.type !== 'client' || d?.deletedAt || d?.user_id !== userId) return false;
    if (bid && !clientMatchesBusinessScope(d, bid, options)) return false;
    const score = scoreClientSearchMatch(d, raw, qFold, qDigits, preferPhone);
    if (score <= 0) return false;
    scored.push({ doc: d, score });
    if (earlyStopExactPhone && preferPhone && score >= 200) {
      exactPhoneHits += 1;
      if (exactPhoneHits >= max) return 'stop';
    }
    return true;
  };

  if (useIndex) {
    for (const idx of candidates || []) {
      const d = list[idx];
      if (!d) continue;
      if (consider(d) === 'stop') break;
    }
  }
  // Índice desfasado / candidatos vacíos de score → scan completo (Pau TPV: «uriel» no encontrado).
  if (!useIndex || scored.length === 0) {
    if (useIndex) scored.length = 0;
    for (const d of list) {
      if (consider(d) === 'stop') break;
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.doc.updatedAt || '').localeCompare(String(a.doc.updatedAt || ''));
  });

  if (hasLimit) return scored.slice(0, max).map((row) => row.doc);
  return scored.map((row) => row.doc);
}

/**
 * Carga cartera + índice para búsqueda TPV/CRM.
 * Si Couch devuelve 0 (índice frío / glitch), invalida y reintenta UNA vez
 * para no dejar el TPV ciego en cuentas grandes (p. ej. Pau ~6k).
 */
async function loadClientSearchCorpus(req, userId) {
  const uid = String(userId || '').trim();
  let docs = await getClientDocumentsForUser(req, uid);
  if (!Array.isArray(docs) || docs.length === 0) {
    invalidateClientDocumentsForUser(uid);
    docs = await getClientDocumentsForUser(req, uid);
  }
  const list = Array.isArray(docs) ? docs : [];
  const bundle = readClientSearchBundle(uid);
  return {
    docs: list,
    searchIndex: bundle?.searchIndex || null,
    portfolioSize: list.length,
  };
}

/** Búsqueda + tamaño de cartera (para blindar reintentos solo si la carga falló). */
export async function searchClientsByPhoneWithMeta(req, userId, phoneQuery, limit = 20, options = {}) {
  const raw = String(phoneQuery || '').trim();
  if (raw.length < 1) {
    return { clients: [], portfolioSize: 0 };
  }

  const { docs, searchIndex, portfolioSize } = await loadClientSearchCorpus(req, userId);
  const max = Math.min(50, Math.max(1, Number(limit) || 20));
  const clients = filterClientDocsBySearch(docs, searchIndex, raw, userId, {
    ...options,
    limit: max,
    earlyStopExactPhone: true,
  });
  return { clients, portfolioSize };
}

/** Búsqueda por teléfono y/o nombre del cliente (modos separados + puntuación). */
export async function searchClientsByPhone(req, userId, phoneQuery, limit = 20, options = {}) {
  const { clients } = await searchClientsByPhoneWithMeta(req, userId, phoneQuery, limit, options);
  return clients;
}

/** Igual que searchClientsByPhone pero sin tope (listado CRM con paginación). */
export async function searchClientsForList(req, userId, phoneQuery, options = {}) {
  const raw = String(phoneQuery || '').trim();
  if (raw.length < 1) return [];

  const { docs, searchIndex } = await loadClientSearchCorpus(req, userId);
  return filterClientDocsBySearch(docs, searchIndex, raw, userId, options);
}

// ─── CLIENT NOTES ────────────────────────────────────────────────────────────

export function buildClientNoteDocument(userId, clientId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data.id || `client-note-${uuidv4()}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'client_note',
    id,
    user_id: userId,
    clientId: String(clientId),
    text: String(data.text || data.texto || '').trim(),
    authorId: String(data.authorId || ''),
    authorName: String(data.authorName || data.autor || '').trim(),
    important: Boolean(data.important || data.importante),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deletedAt: existing?.deletedAt || null,
  };
}

export function sanitizeClientNote(note) {
  if (!note) return null;
  return {
    id: note._id,
    _rev: note._rev,
    type: 'client_note',
    user_id: note.user_id || '',
    clientId: note.clientId || '',
    text: note.text || '',
    authorId: note.authorId || '',
    authorName: note.authorName || '',
    important: Boolean(note.important),
    createdAt: note.createdAt || new Date().toISOString(),
    updatedAt: note.updatedAt || note.createdAt || new Date().toISOString(),
  };
}

export async function listClientNotesByClient(req, userId, clientId) {
  const uid = String(userId || '').trim();
  const cid = String(clientId || '').trim();
  const db = getClientsDbName();
  await ensureDatabase(req, db);
  await ensureClientsUserTypeIndex(req, db);
  let docs;
  try {
    docs = await findDocuments(
      req,
      db,
      { type: 'client_note', user_id: uid, clientId: cid },
      { pageSize: 200, maxDocs: 2_000 },
    );
  } catch {
    const all = await getAllDocuments(req, db);
    docs = all.filter(
      (d) => d?.type === 'client_note' && d?.user_id === uid && d?.clientId === cid,
    );
  }
  return docs
    .filter((d) => d?.type === 'client_note' && !d?.deletedAt && d?.user_id === uid && d?.clientId === cid)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ─── CLIENT PROMOTIONS ───────────────────────────────────────────────────────

function normalizePromocionEstado(value) {
  const allowed = ['activa', 'programada', 'finalizada'];
  return allowed.includes(String(value || '')) ? String(value) : 'activa';
}

function normalizePromocionTipo(value) {
  const allowed = ['descuento', 'cupon', '2x1', 'regalo'];
  return allowed.includes(String(value || '')) ? String(value) : 'descuento';
}

export function buildClientPromotionDocument(userId, clientId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data.id || `client-promo-${uuidv4()}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'client_promotion',
    id,
    user_id: userId,
    clientId: String(clientId),
    nombre: String(data.nombre || '').trim(),
    tipo: normalizePromocionTipo(data.tipo),
    descuento: data.descuento != null ? Number(data.descuento) : null,
    codigo: String(data.codigo || '').trim().toUpperCase(),
    fechaInicio: String(data.fechaInicio || now),
    fechaFin: String(data.fechaFin || now),
    estado: normalizePromocionEstado(data.estado),
    usosRestantes: data.usosRestantes != null ? Number(data.usosRestantes) : null,
    descripcion: String(data.descripcion || '').trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deletedAt: existing?.deletedAt || null,
  };
}

export function sanitizeClientPromotion(promo) {
  if (!promo) return null;
  return {
    id: promo._id,
    _rev: promo._rev,
    type: 'client_promotion',
    user_id: promo.user_id || '',
    clientId: promo.clientId || '',
    nombre: promo.nombre || '',
    tipo: promo.tipo || 'descuento',
    descuento: promo.descuento,
    codigo: promo.codigo || '',
    fechaInicio: promo.fechaInicio || '',
    fechaFin: promo.fechaFin || '',
    estado: promo.estado || 'activa',
    usosRestantes: promo.usosRestantes,
    descripcion: promo.descripcion || '',
    createdAt: promo.createdAt || new Date().toISOString(),
    updatedAt: promo.updatedAt || promo.createdAt || new Date().toISOString(),
  };
}

export async function listClientPromotionsByClient(req, userId, clientId) {
  const uid = String(userId || '').trim();
  const cid = String(clientId || '').trim();
  const db = getClientsDbName();
  await ensureDatabase(req, db);
  await ensureClientsUserTypeIndex(req, db);
  // Al seleccionar cliente en TPV: no escanear toda la DB de clientes.
  let docs;
  try {
    docs = await findDocuments(
      req,
      db,
      { type: 'client_promotion', user_id: uid, clientId: cid },
      { pageSize: 200, maxDocs: 2_000 },
    );
  } catch {
    try {
      docs = await findDocuments(
        req,
        db,
        { type: 'client_promotion', user_id: uid },
        { pageSize: 500, maxDocs: 10_000 },
      );
      docs = docs.filter((d) => String(d?.clientId || '') === cid);
    } catch {
      const all = await getAllDocuments(req, db);
      docs = all.filter(
        (d) => d?.type === 'client_promotion' && d?.user_id === uid && d?.clientId === cid,
      );
    }
  }
  return docs
    .filter((d) => d?.type === 'client_promotion' && !d?.deletedAt && d?.user_id === uid && d?.clientId === cid)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function findDuplicateClients(req, userId, candidateData, options = {}) {
  const businessId = normalizeClientBusinessScopeId(
    candidateData?.businessId || candidateData?.business_id || options.businessId,
  );
  const clients = await listClientsByUser(req, userId, {
    businessId,
    legacySingleBusiness: options.legacySingleBusiness,
    excludeUnscopedLegacy: options.excludeUnscopedLegacy,
  });
  const normPhone = (p) => String(p || '').replace(/\D/g, '').slice(-9);
  const normStr = (s) => String(s || '').trim().toLowerCase();

  const phone = normPhone(candidateData.phone);
  const email = normStr(candidateData.email);
  const dni = normStr(candidateData.dni);
  const excludeId = candidateData.id || candidateData._id || '';

  return clients.filter((c) => {
    if (c._id === excludeId || c.deletedAt) return false;
    if (email && normStr(c.email) === email) return true;
    if (phone && phone.length >= 9 && normPhone(c.phone) === phone) return true;
    if (dni && normStr(c.dni) === dni) return true;
    return false;
  }).map(sanitizeClient);
}

// ─── BANK RECONCILIATION ──────────────────────────────────────────────────────

export function getBankTransactionsDbName() {
  return normalizeDbName(
    process.env.VITE_BANK_TX_DB || `${getDbPrefix()}-bank-transactions`,
  );
}

const BANK_TX_STATUS = ['unmatched', 'matched', 'ignored', 'manual'];

function normalizeBankTxStatus(value) {
  return BANK_TX_STATUS.includes(String(value || '')) ? String(value) : 'unmatched';
}

export function buildBankTransaction(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data._id || data.id || `bank-tx-${uuidv4()}`;
  return {
    _id: id, _rev: existing?._rev, id,
    type: 'bank_transaction', user_id: userId,
    date: String(data.date || now.slice(0, 10)),
    valueDate: String(data.valueDate || existing?.valueDate || ''),
    description: String(data.description || '').trim(),
    amount: Number(data.amount || 0),
    balance: data.balance !== undefined ? Number(data.balance) : existing?.balance ?? undefined,
    reference: String(data.reference || existing?.reference || '').trim() || undefined,
    category: String(data.category || existing?.category || '').trim() || undefined,
    bankName: String(data.bankName || existing?.bankName || '').trim() || undefined,
    status: normalizeBankTxStatus(data.status ?? existing?.status),
    matchType: data.matchType || existing?.matchType || undefined,
    matchedMovementId: data.matchedMovementId || existing?.matchedMovementId || undefined,
    matchedMovementRef: data.matchedMovementRef || existing?.matchedMovementRef || undefined,
    matchedEntityId: data.matchedEntityId || existing?.matchedEntityId || undefined,
    matchedEntityRef: data.matchedEntityRef || existing?.matchedEntityRef || undefined,
    source: String(data.source || existing?.source || 'manual'),
    notes: String(data.notes || existing?.notes || '').trim(),
    createdAt: existing?.createdAt || now, updatedAt: now,
  };
}

export function sanitizeBankTransaction(doc) {
  if (!doc || doc.type !== 'bank_transaction') return null;
  return {
    _id: doc._id, _rev: doc._rev, id: doc._id,
    type: 'bank_transaction', user_id: doc.user_id || '',
    date: doc.date || '', valueDate: doc.valueDate || '',
    description: doc.description || '', amount: Number(doc.amount || 0),
    balance: doc.balance !== undefined ? Number(doc.balance) : undefined,
    reference: doc.reference || undefined, category: doc.category || undefined,
    bankName: doc.bankName || undefined,
    status: normalizeBankTxStatus(doc.status),
    matchType: doc.matchType || undefined,
    matchedMovementId: doc.matchedMovementId || undefined,
    matchedMovementRef: doc.matchedMovementRef || undefined,
    matchedEntityId: doc.matchedEntityId || undefined,
    matchedEntityRef: doc.matchedEntityRef || undefined,
    source: doc.source || 'manual', notes: doc.notes || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listBankTransactionsByUser(req, userId) {
  const db = getBankTransactionsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'bank_transaction' && !doc?.deletedAt && doc?.user_id === userId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

// ─── FINANCE ──────────────────────────────────────────────────────────────────

function normalizeFinanceType(value) {
  const allowed = ['cobro', 'pago'];
  return allowed.includes(String(value || '')) ? String(value) : 'cobro';
}

function normalizeFinanceStatus(value) {
  const allowed = ['paid', 'pending'];
  return allowed.includes(String(value || '')) ? String(value) : 'paid';
}

export function buildFinanceDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data.id || `finance-${uuidv4()}`;
  const amountBase = Number(data.amountBase || 0);
  const taxRate = Number(data.taxRate || 0);
  const taxAmount = data.taxAmount !== undefined
    ? Number(data.taxAmount)
    : Number((amountBase * (taxRate / 100)).toFixed(2));
  const totalAmount = data.totalAmount !== undefined
    ? Number(data.totalAmount)
    : Number((amountBase + taxAmount).toFixed(2));

  const linkedDocs = Array.isArray(data.linkedDocuments)
    ? data.linkedDocuments.map((d) => ({
        id: String(d.id || ''),
        type: String(d.type || 'file'),
        name: String(d.name || ''),
        url: String(d.url || ''),
      }))
    : existing?.linkedDocuments || [];

  return {
    _id: id,
    _rev: existing?._rev,
    id,
    type: normalizeFinanceType(data.type),
    user_id: userId,
    companyName: String(data.companyName || '').trim(),
    concept: String(data.concept || '').trim(),
    reference: String(data.reference || '').trim(),
    category: String(data.category || '').trim(),
    categoryIcon: String(data.categoryIcon || ''),
    categoryColor: String(data.categoryColor || ''),
    amountBase,
    taxRate,
    taxAmount: existing ? Number(data.taxAmount ?? taxAmount) : taxAmount,
    totalAmount: existing ? Number(data.totalAmount ?? totalAmount) : totalAmount,
    date: String(data.date || now.slice(0, 10)),
    payMethod: String(data.payMethod || '').trim(),
    notes: String(data.notes || '').trim(),
    status: normalizeFinanceStatus(data.status ?? existing?.status),
    dueDate: String(data.dueDate || existing?.dueDate || ''),
    paidAt: String(data.paidAt || existing?.paidAt || ''),
    reconciled: Boolean(data.reconciled ?? existing?.reconciled ?? false),
    reconciledBankTxId: String(data.reconciledBankTxId || existing?.reconciledBankTxId || ''),
    linkedDocuments: linkedDocs,
    attachmentUrl: String(data.attachmentUrl || existing?.attachmentUrl || ''),
    source: String(data.source || existing?.source || 'manual'),
    sourceRef: String(data.sourceRef || existing?.sourceRef || ''),
    dismissedDuplicates: Array.isArray(data.dismissedDuplicates)
      ? data.dismissedDuplicates
      : existing?.dismissedDuplicates || [],
    businessId: String(data.businessId || existing?.businessId || '').trim(),
    businessName: String(data.businessName || existing?.businessName || '').trim(),
    workCenterId: String(data.workCenterId || existing?.workCenterId || '').trim(),
    workCenterName: String(data.workCenterName || existing?.workCenterName || '').trim(),
    pointOfSaleId: String(data.pointOfSaleId || existing?.pointOfSaleId || '').trim(),
    pointOfSaleName: String(data.pointOfSaleName || existing?.pointOfSaleName || '').trim(),
    brandId: String(data.brandId || existing?.brandId || '').trim(),
    brandName: String(data.brandName || existing?.brandName || '').trim(),
    bankAccountId: String(data.bankAccountId || existing?.bankAccountId || '').trim() || undefined,
    bankAccountName: String(data.bankAccountName || existing?.bankAccountName || '').trim() || undefined,
    linkedInvoiceId: String(data.linkedInvoiceId || existing?.linkedInvoiceId || '').trim() || undefined,
    linkedInvoiceType: data.linkedInvoiceType || existing?.linkedInvoiceType || undefined,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeFinance(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    id: doc._id,
    type: normalizeFinanceType(doc.type),
    user_id: doc.user_id || '',
    companyName: doc.companyName || '',
    concept: doc.concept || '',
    reference: doc.reference || '',
    category: doc.category || '',
    categoryIcon: doc.categoryIcon || '',
    categoryColor: doc.categoryColor || '',
    amountBase: Number(doc.amountBase || 0),
    taxRate: Number(doc.taxRate || 0),
    taxAmount: Number(doc.taxAmount || 0),
    totalAmount: Number(doc.totalAmount || 0),
    date: doc.date || new Date().toISOString().slice(0, 10),
    payMethod: doc.payMethod || '',
    notes: doc.notes || '',
    status: doc.status || 'paid',
    dueDate: doc.dueDate || '',
    paidAt: doc.paidAt || '',
    reconciled: Boolean(doc.reconciled),
    reconciledBankTxId: doc.reconciledBankTxId || '',
    linkedDocuments: Array.isArray(doc.linkedDocuments) ? doc.linkedDocuments : [],
    attachmentUrl: doc.attachmentUrl || '',
    source: doc.source || 'manual',
    sourceRef: doc.sourceRef || '',
    dismissedDuplicates: Array.isArray(doc.dismissedDuplicates) ? doc.dismissedDuplicates : [],
    businessId: doc.businessId || undefined,
    businessName: doc.businessName || undefined,
    workCenterId: doc.workCenterId || undefined,
    workCenterName: doc.workCenterName || undefined,
    pointOfSaleId: doc.pointOfSaleId || undefined,
    pointOfSaleName: doc.pointOfSaleName || undefined,
    brandId: doc.brandId || undefined,
    brandName: doc.brandName || undefined,
    bankAccountId: doc.bankAccountId || undefined,
    bankAccountName: doc.bankAccountName || undefined,
    linkedInvoiceId: doc.linkedInvoiceId || undefined,
    linkedInvoiceType: doc.linkedInvoiceType || undefined,
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listFinanceByUser(req, userId) {
  const db = getFinanceDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => (doc?.type === 'cobro' || doc?.type === 'pago') && !doc?.deletedAt && doc?.user_id === userId)
    .sort((a, b) => {
      const d = String(b.date || '').localeCompare(String(a.date || ''));
      return d !== 0 ? d : String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
}

// ─── BANK ACCOUNTS ────────────────────────────────────────────────────────────

export function buildBankAccountDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data.id || `bank_account-${uuidv4()}`;
  const initialBalance = Number(data.initialBalance || 0);

  return {
    _id: id,
    _rev: existing?._rev,
    id,
    type: 'bank_account',
    user_id: userId,
    name: String(data.name || '').trim() || 'Cuenta principal',
    bankName: String(data.bankName || '').trim(),
    iban: String(data.iban || '').trim(),
    swift: String(data.swift || '').trim() || undefined,
    accountNumber: String(data.accountNumber || '').trim() || undefined,
    currency: String(data.currency || 'EUR').trim(),
    initialBalance,
    currentBalance: existing ? Number(data.currentBalance ?? existing.currentBalance ?? initialBalance) : initialBalance,
    isDefault: Boolean(data.isDefault),
    color: String(data.color || '#3b82f6').trim(),
    icon: String(data.icon || '🏦').trim(),
    active: data.active !== false,
    notes: String(data.notes || '').trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeBankAccount(doc) {
  if (!doc || doc.type !== 'bank_account') return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    id: doc._id,
    type: 'bank_account',
    user_id: doc.user_id || '',
    name: doc.name || '',
    bankName: doc.bankName || '',
    iban: doc.iban || '',
    swift: doc.swift || undefined,
    accountNumber: doc.accountNumber || undefined,
    currency: doc.currency || 'EUR',
    initialBalance: Number(doc.initialBalance || 0),
    currentBalance: Number(doc.currentBalance || 0),
    isDefault: Boolean(doc.isDefault),
    color: doc.color || '#3b82f6',
    icon: doc.icon || '🏦',
    active: doc.active !== false,
    notes: doc.notes || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listBankAccountsByUser(req, userId) {
  const db = getFinanceDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'bank_account' && !doc?.deletedAt && doc?.user_id === userId)
    .sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

// ─── TAX OBLIGATIONS ──────────────────────────────────────────────────────────

export function buildTaxObligationDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data.id || `tax_obligation-${uuidv4()}`;
  const validStatuses = ['pending', 'in_progress', 'filed', 'paid', 'overdue'];
  const status = validStatuses.includes(data.status) ? data.status : (existing?.status || 'pending');

  return {
    _id: id,
    _rev: existing?._rev,
    id,
    type: 'tax_obligation',
    user_id: userId,
    model: String(data.model || existing?.model || 'custom').trim(),
    modelName: String(data.modelName || existing?.modelName || '').trim(),
    period: String(data.period || existing?.period || '').trim(),
    periodLabel: String(data.periodLabel || existing?.periodLabel || '').trim(),
    dueDate: String(data.dueDate || existing?.dueDate || '').trim(),
    filingDate: data.filingDate ? String(data.filingDate).trim() : (existing?.filingDate || undefined),
    status,
    estimatedAmount: data.estimatedAmount != null ? Number(data.estimatedAmount) : (existing?.estimatedAmount ?? undefined),
    actualAmount: data.actualAmount != null ? Number(data.actualAmount) : (existing?.actualAmount ?? undefined),
    documentId: String(data.documentId || existing?.documentId || '').trim() || undefined,
    notes: String(data.notes ?? existing?.notes ?? '').trim(),
    reminderDaysBefore: Number(data.reminderDaysBefore ?? existing?.reminderDaysBefore ?? 7),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeTaxObligation(doc) {
  if (!doc || doc.type !== 'tax_obligation') return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    id: doc._id,
    type: 'tax_obligation',
    user_id: doc.user_id || '',
    model: doc.model || 'custom',
    modelName: doc.modelName || '',
    period: doc.period || '',
    periodLabel: doc.periodLabel || '',
    dueDate: doc.dueDate || '',
    filingDate: doc.filingDate || undefined,
    status: doc.status || 'pending',
    estimatedAmount: doc.estimatedAmount != null ? Number(doc.estimatedAmount) : undefined,
    actualAmount: doc.actualAmount != null ? Number(doc.actualAmount) : undefined,
    documentId: doc.documentId || undefined,
    notes: doc.notes || '',
    reminderDaysBefore: Number(doc.reminderDaysBefore ?? 7),
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listTaxObligationsByUser(req, userId, year) {
  const db = getFinanceDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => {
      if (doc?.type !== 'tax_obligation' || doc?.deletedAt || doc?.user_id !== userId) return false;
      if (year && !String(doc.period || '').startsWith(String(year)) && !String(doc.dueDate || '').startsWith(String(year))) return false;
      return true;
    })
    .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
}

// ─── INVOICES (CRM) ───────────────────────────────────────────────────────────

function normalizeInvoiceStatus(value) {
  const allowed = ['paid', 'pending', 'overdue', 'draft', 'partial'];
  return allowed.includes(String(value || '')) ? String(value) : 'draft';
}

function normalizeInvoiceRecurrence(value) {
  const allowed = ['weekly', 'monthly', 'one_time'];
  return allowed.includes(String(value || '')) ? String(value) : 'one_time';
}

function normalizeInvoiceOrigin(value) {
  const allowed = ['manual', 'auto_service', 'auto_contract'];
  return allowed.includes(String(value || '')) ? String(value) : 'manual';
}

function sanitizeInvoiceLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return [];
  return lines.map((l) => ({
    id: String(l.id || uuidv4()),
    description: String(l.description || '').trim(),
    quantity: Number(l.quantity || 1),
    unitPrice: Number(l.unitPrice || 0),
    discountPercent: Number(l.discountPercent || 0),
    taxRate: Number(l.taxRate || 21),
    lineTotal: Number(l.lineTotal || 0),
  }));
}

function calcInvoiceTotals(lines) {
  const sanitized = sanitizeInvoiceLines(lines);
  let subtotal = 0;
  let discountAmount = 0;
  let taxAmount = 0;

  for (const line of sanitized) {
    const gross = line.quantity * line.unitPrice;
    const discount = gross * (line.discountPercent / 100);
    const net = gross - discount;
    const tax = net * (line.taxRate / 100);
    subtotal += net;
    discountAmount += discount;
    taxAmount += tax;
  }

  return {
    subtotal: Number(subtotal.toFixed(2)),
    discountAmount: Number(discountAmount.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    amountBase: Number(subtotal.toFixed(2)),
    total: Number((subtotal + taxAmount).toFixed(2)),
  };
}

export function buildInvoiceDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data.id || `client-invoice-${uuidv4()}`;
  const lines = sanitizeInvoiceLines(data.lines || existing?.lines || []);
  const totals = lines.length > 0 ? calcInvoiceTotals(lines) : null;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'client_invoice',
    id,
    user_id: userId,

    clientId: String(data.clientId || ''),
    clientName: String(data.clientName || '').trim(),
    clientNif: String(data.clientNif || existing?.clientNif || '').trim(),
    clientAddress: String(data.clientAddress || existing?.clientAddress || '').trim(),
    clientCity: String(data.clientCity || existing?.clientCity || '').trim(),
    clientPostalCode: String(data.clientPostalCode || existing?.clientPostalCode || '').trim(),
    clientEmail: String(data.clientEmail || existing?.clientEmail || '').trim(),

    issuerName: String(data.issuerName || existing?.issuerName || '').trim(),
    issuerNif: String(data.issuerNif || existing?.issuerNif || '').trim(),
    issuerAddress: String(data.issuerAddress || existing?.issuerAddress || '').trim(),
    issuerCity: String(data.issuerCity || existing?.issuerCity || '').trim(),
    issuerPostalCode: String(data.issuerPostalCode || existing?.issuerPostalCode || '').trim(),
    issuerEmail: String(data.issuerEmail || existing?.issuerEmail || '').trim(),
    issuerPhone: String(data.issuerPhone || existing?.issuerPhone || '').trim(),

    number: String(data.number || '').trim(),
    series: String(data.series || existing?.series || 'FAC').trim(),
    sequenceNumber: Number(data.sequenceNumber || existing?.sequenceNumber || 0),

    vehicleName: String(data.vehicleName || '').trim(),
    vehiclePlate: String(data.vehiclePlate || '').trim().toUpperCase(),
    date: String(data.date || now),
    dueDate: String(data.dueDate || data.date || now),

    lines,
    subtotal: totals ? totals.subtotal : Number(data.subtotal || 0),
    discountAmount: totals ? totals.discountAmount : Number(data.discountAmount || 0),
    taxAmount: totals ? totals.taxAmount : Number(data.taxAmount || 0),
    amountBase: totals ? totals.amountBase : Number(data.amountBase || 0),
    total: totals ? totals.total : Number(data.total || 0),
    paid: Number(data.paid || 0),

    status: normalizeInvoiceStatus(data.status),
    paymentMethod: String(data.paymentMethod || ''),
    notes: String(data.notes || ''),

    sourceType: data.sourceType || existing?.sourceType || null,
    sourceQuoteId: data.sourceQuoteId || existing?.sourceQuoteId || null,
    sourceSaleId: data.sourceSaleId || existing?.sourceSaleId || null,
    financeMovementId: data.financeMovementId || existing?.financeMovementId || null,

    sentAt: data.sentAt || existing?.sentAt || null,
    sentTo: data.sentTo || existing?.sentTo || null,

    payments: Array.isArray(data.payments) ? data.payments : (existing?.payments || []),

    serviceIds: Array.isArray(data.serviceIds) ? data.serviceIds.map(String) : (existing?.serviceIds || []),
    contractId: String(data.contractId || existing?.contractId || ''),
    recurrence: normalizeInvoiceRecurrence(data.recurrence || existing?.recurrence),
    periodStart: String(data.periodStart || existing?.periodStart || ''),
    periodEnd: String(data.periodEnd || existing?.periodEnd || ''),
    pdfUrl: String(data.pdfUrl || existing?.pdfUrl || ''),
    paidAt: String(data.paidAt || existing?.paidAt || ''),
    linkedFinanceId: String(data.linkedFinanceId || existing?.linkedFinanceId || ''),
    origin: normalizeInvoiceOrigin(data.origin || existing?.origin),
    vertical: String(data.vertical || existing?.vertical || ''),

    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeInvoice(doc) {
  if (!doc) return null;
  return {
    _rev: doc._rev,
    type: 'client_invoice',
    id: doc._id,
    user_id: doc.user_id || '',

    clientId: doc.clientId || '',
    clientName: doc.clientName || '',
    clientNif: doc.clientNif || '',
    clientAddress: doc.clientAddress || '',
    clientCity: doc.clientCity || '',
    clientPostalCode: doc.clientPostalCode || '',
    clientEmail: doc.clientEmail || '',

    issuerName: doc.issuerName || '',
    issuerNif: doc.issuerNif || '',
    issuerAddress: doc.issuerAddress || '',
    issuerCity: doc.issuerCity || '',
    issuerPostalCode: doc.issuerPostalCode || '',
    issuerEmail: doc.issuerEmail || '',
    issuerPhone: doc.issuerPhone || '',

    number: doc.number || '',
    series: doc.series || 'FAC',
    sequenceNumber: Number(doc.sequenceNumber || 0),

    vehicleName: doc.vehicleName || '',
    vehiclePlate: doc.vehiclePlate || '',
    date: doc.date || new Date().toISOString(),
    dueDate: doc.dueDate || doc.date || new Date().toISOString(),

    lines: sanitizeInvoiceLines(doc.lines || []),
    subtotal: Number(doc.subtotal || 0),
    discountAmount: Number(doc.discountAmount || 0),
    taxAmount: Number(doc.taxAmount || 0),
    amountBase: Number(doc.amountBase || 0),
    total: Number(doc.total || 0),
    paid: Number(doc.paid || 0),

    status: normalizeInvoiceStatus(doc.status),
    paymentMethod: doc.paymentMethod || '',
    notes: doc.notes || '',

    sourceType: doc.sourceType || null,
    sourceQuoteId: doc.sourceQuoteId || null,
    sourceSaleId: doc.sourceSaleId || null,
    financeMovementId: doc.financeMovementId || null,

    sentAt: doc.sentAt || null,
    sentTo: doc.sentTo || null,

    payments: Array.isArray(doc.payments) ? doc.payments : [],

    serviceIds: Array.isArray(doc.serviceIds) ? doc.serviceIds : [],
    contractId: doc.contractId || '',
    recurrence: normalizeInvoiceRecurrence(doc.recurrence),
    periodStart: doc.periodStart || '',
    periodEnd: doc.periodEnd || '',
    pdfUrl: doc.pdfUrl || '',
    paidAt: doc.paidAt || '',
    linkedFinanceId: doc.linkedFinanceId || '',
    origin: normalizeInvoiceOrigin(doc.origin),
    vertical: doc.vertical || '',

    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listInvoicesByUser(req, userId) {
  const db = getInvoicesDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'client_invoice' && !doc?.deletedAt && doc?.user_id === userId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

// ─── DOCUMENTS ────────────────────────────────────────────────────────────────

function normalizeDocumentStatus(value) {
  const allowed = ['draft', 'pending_signature', 'signed', 'rejected', 'expired'];
  return allowed.includes(String(value || '')) ? String(value) : 'draft';
}

const VALID_DOC_SUB_CATEGORIES = [
  'permiso_circulacion', 'ficha_tecnica', 'contrato_compra', 'contrato_venta',
  'factura_compra', 'factura_venta', 'itv', 'reparacion', 'justificante',
  'doc_cliente', 'anexo', 'seguro', 'informe_trafico', 'otro',
  // Scrapyard-specific
  'baja_temporal', 'baja_definitiva', 'certificado_destruccion',
  'certificado_descontaminacion', 'acta_retirada', 'albaran_grua',
  'justificante_deposito', 'informe_medioambiental', 'licencia_actividad',
  'registro_productor_residuos', 'garantia_pieza', 'informe_pieza',
  'albaran_venta_pieza', 'acta_adjudicacion', 'doc_tasacion',
];

function normalizeDocSubCategory(value) {
  return VALID_DOC_SUB_CATEGORIES.includes(String(value || '')) ? String(value) : 'otro';
}

export function buildDocumentRecord(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data.id || `doc-${uuidv4()}`;
  const nextVersion = existing ? Number(existing.version || 1) + 1 : 1;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'document',
    id,
    user_id: userId,
    clientId: String(data.clientId || ''),
    clientName: String(data.clientName || '').trim(),
    vehicleId: String(data.vehicleId || ''),
    vehicleName: String(data.vehicleName || '').trim(),
    saleId: String(data.saleId || ''),
    name: String(data.name || '').trim(),
    category: String(data.category || 'otro').trim(),
    docSubCategory: normalizeDocSubCategory(data.docSubCategory || existing?.docSubCategory),
    status: normalizeDocumentStatus(data.status),
    content: String(data.content || ''),
    version: existing ? nextVersion : 1,
    previousVersionId: existing ? id : '',
    signedAt: data.status === 'signed'
      ? (data.signedAt || existing?.signedAt || now)
      : (existing?.signedAt || ''),
    signedByClientAt: data.signedByClientAt ? String(data.signedByClientAt) : (existing?.signedByClientAt || ''),
    expiresAt: String(data.expiresAt || ''),
    notes: String(data.notes || ''),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    fileUrl: String(data.fileUrl || ''),
    fileSize: Number(data.fileSize || 0),
    mimeType: String(data.mimeType || ''),
    registrationPlate: String(data.registrationPlate || existing?.registrationPlate || ''),
    vin: String(data.vin || existing?.vin || ''),
    itvExpiryDate: String(data.itvExpiryDate || existing?.itvExpiryDate || ''),
    isRequired: Boolean(data.isRequired ?? existing?.isRequired ?? false),
    supplierId: String(data.supplierId || existing?.supplierId || ''),
    supplierName: String(data.supplierName || existing?.supplierName || '').trim(),
    archived: Boolean(data.archived ?? existing?.archived ?? false),
    entryMethod: data.entryMethod || existing?.entryMethod || 'manual',
    ocrData: data.ocrData || existing?.ocrData || null,
    ocrImageBase64: data.ocrImageBase64 || existing?.ocrImageBase64 || '',
    ocrProcessedAt: data.ocrProcessedAt || existing?.ocrProcessedAt || '',
    ocrConfidence: Number(data.ocrConfidence || existing?.ocrConfidence || 0),
    ocrSource: data.ocrSource || existing?.ocrSource || '',
    linkedModule: data.linkedModule || existing?.linkedModule || '',
    linkedDocId: data.linkedDocId || existing?.linkedDocId || '',
    partId: String(data.partId || existing?.partId || ''),
    partName: String(data.partName || existing?.partName || '').trim(),
    partCode: String(data.partCode || existing?.partCode || '').trim(),
    acquisitionId: String(data.acquisitionId || existing?.acquisitionId || ''),
    deregistrationId: String(data.deregistrationId || existing?.deregistrationId || ''),
    deregistrationType: data.deregistrationType || existing?.deregistrationType || null,
    deregistrationDate: data.deregistrationDate || existing?.deregistrationDate || null,
    expiryDate: data.expiryDate || existing?.expiryDate || null,
    isScrapyard: Boolean(data.isScrapyard ?? existing?.isScrapyard ?? false),
    documentHash: String(data.documentHash || existing?.documentHash || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function getScrapyardRequiredDocs(vehicleStatus) {
  const BASE = ['permiso_circulacion', 'ficha_tecnica', 'contrato_compra'];
  const POST_RECEPTION = [...BASE, 'certificado_descontaminacion'];
  const POST_DEREGISTRATION = [...POST_RECEPTION, 'baja_definitiva', 'certificado_destruccion'];
  switch (vehicleStatus) {
    case 'received': return BASE;
    case 'dismantling':
    case 'partially_dismantled':
    case 'fully_dismantled':
      return POST_RECEPTION;
    case 'compacted':
      return POST_DEREGISTRATION;
    default: return BASE;
  }
}

export function sanitizeDocumentRecord(doc) {
  if (!doc) return null;
  return {
    _rev: doc._rev,
    type: 'document',
    id: doc._id,
    user_id: doc.user_id || '',
    clientId: doc.clientId || '',
    clientName: doc.clientName || '',
    vehicleId: doc.vehicleId || '',
    vehicleName: doc.vehicleName || '',
    saleId: doc.saleId || '',
    name: doc.name || '',
    category: doc.category || 'otro',
    docSubCategory: doc.docSubCategory || 'otro',
    status: normalizeDocumentStatus(doc.status),
    content: doc.content || '',
    version: Number(doc.version || 1),
    previousVersionId: doc.previousVersionId || '',
    signedAt: doc.signedAt || '',
    signedByClientAt: doc.signedByClientAt || '',
    expiresAt: doc.expiresAt || '',
    notes: doc.notes || '',
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    fileUrl: doc.fileUrl || '',
    fileSize: Number(doc.fileSize || 0),
    mimeType: doc.mimeType || '',
    registrationPlate: doc.registrationPlate || '',
    vin: doc.vin || '',
    itvExpiryDate: doc.itvExpiryDate || '',
    isRequired: doc.isRequired || false,
    supplierId: doc.supplierId || '',
    supplierName: doc.supplierName || '',
    archived: doc.archived || false,
    entryMethod: doc.entryMethod || 'manual',
    ocrData: doc.ocrData || null,
    ocrImageBase64: doc.ocrImageBase64 || '',
    ocrProcessedAt: doc.ocrProcessedAt || '',
    ocrConfidence: Number(doc.ocrConfidence || 0),
    ocrSource: doc.ocrSource || '',
    linkedModule: doc.linkedModule || '',
    linkedDocId: doc.linkedDocId || '',
    partId: doc.partId || '',
    partName: doc.partName || '',
    partCode: doc.partCode || '',
    acquisitionId: doc.acquisitionId || '',
    deregistrationId: doc.deregistrationId || '',
    deregistrationType: doc.deregistrationType || null,
    deregistrationDate: doc.deregistrationDate || null,
    expiryDate: doc.expiryDate || null,
    isScrapyard: doc.isScrapyard || false,
    documentHash: doc.documentHash || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listDocumentsByUser(req, userId) {
  const db = getDocumentsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'document' && !doc?.deletedAt && doc?.user_id === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ─── SIGNATURE REQUESTS ───────────────────────────────────────────────────────

const SIGNATURE_REQUEST_STATUSES = ['draft', 'pending', 'partially_signed', 'completed', 'rejected', 'expired', 'cancelled'];
const SIGNER_STATUSES = ['pending', 'viewed', 'signed', 'rejected', 'expired'];
const SIGNER_ROLES = ['signer', 'reviewer', 'cc'];
const SIG_ENTITY_TYPES = ['client', 'supplier', 'team_member', 'external'];

function normalizeSignatureStatus(value) {
  return SIGNATURE_REQUEST_STATUSES.includes(String(value || '')) ? String(value) : 'draft';
}

function normalizeSignerStatus(value) {
  return SIGNER_STATUSES.includes(String(value || '')) ? String(value) : 'pending';
}

function normalizeSigner(s, index) {
  const id = s.id || `signer-${uuidv4()}`;
  return {
    id,
    name: String(s.name || '').trim(),
    email: String(s.email || '').trim().toLowerCase(),
    phone: String(s.phone || '').trim(),
    role: SIGNER_ROLES.includes(s.role) ? s.role : 'signer',
    status: normalizeSignerStatus(s.status),
    order: Number(s.order ?? index),
    entityType: SIG_ENTITY_TYPES.includes(s.entityType) ? s.entityType : 'external',
    entityId: String(s.entityId || ''),
    signedAt: s.signedAt || '',
    rejectedAt: s.rejectedAt || '',
    viewedAt: s.viewedAt || '',
    rejectionReason: String(s.rejectionReason || ''),
    ipAddress: String(s.ipAddress || ''),
    userAgent: String(s.userAgent || ''),
    signatureImageUrl: String(s.signatureImageUrl || ''),
  };
}

function normalizeSignatureEvent(e) {
  return {
    id: e.id || `evt-${uuidv4()}`,
    timestamp: e.timestamp || new Date().toISOString(),
    action: String(e.action || ''),
    actorName: String(e.actorName || ''),
    actorEmail: String(e.actorEmail || ''),
    signerId: String(e.signerId || ''),
    details: String(e.details || ''),
    metadata: e.metadata || {},
  };
}

export function buildSignatureRequest(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data.id || `sigreq-${uuidv4()}`;
  const signers = Array.isArray(data.signers) ? data.signers.map((s, i) => normalizeSigner(s, i)) : (existing?.signers || []);
  const events = Array.isArray(data.events) ? data.events.map(normalizeSignatureEvent) : (existing?.events || []);

  return {
    _id: id, _rev: existing?._rev, type: 'signature_request', id, user_id: userId,
    documentId: String(data.documentId || existing?.documentId || ''),
    documentName: String(data.documentName || existing?.documentName || '').trim(),
    status: normalizeSignatureStatus(data.status ?? existing?.status),
    signers, signingOrder: data.signingOrder === 'sequential' ? 'sequential' : 'parallel',
    message: String(data.message ?? existing?.message ?? ''),
    expiresAt: String(data.expiresAt || existing?.expiresAt || ''),
    reminderEnabled: data.reminderEnabled ?? existing?.reminderEnabled ?? true,
    reminderIntervalDays: Number(data.reminderIntervalDays ?? existing?.reminderIntervalDays ?? 3),
    lastReminderAt: data.lastReminderAt || existing?.lastReminderAt || '',
    sourceFileUrl: String(data.sourceFileUrl || existing?.sourceFileUrl || ''),
    sourceFileName: String(data.sourceFileName || existing?.sourceFileName || '').trim(),
    sourceMimeType: String(data.sourceMimeType || existing?.sourceMimeType || ''),
    sourceFileSize: Number(data.sourceFileSize || existing?.sourceFileSize || 0),
    signedFileUrl: String(data.signedFileUrl || existing?.signedFileUrl || ''),
    signedFileName: String(data.signedFileName || existing?.signedFileName || '').trim(),
    signedMimeType: String(data.signedMimeType || existing?.signedMimeType || ''),
    signedFileSize: Number(data.signedFileSize || existing?.signedFileSize || 0),
    linkedEntityType: SIG_ENTITY_TYPES.includes(data.linkedEntityType) ? data.linkedEntityType : (existing?.linkedEntityType || ''),
    linkedEntityId: String(data.linkedEntityId || existing?.linkedEntityId || ''),
    linkedEntityName: String(data.linkedEntityName || existing?.linkedEntityName || '').trim(),
    provider: String(data.provider || existing?.provider || 'internal'),
    providerRequestId: String(data.providerRequestId || existing?.providerRequestId || ''),
    providerData: data.providerData || existing?.providerData || {},
    events, tags: Array.isArray(data.tags) ? data.tags.map(String) : (existing?.tags || []),
    notes: String(data.notes ?? existing?.notes ?? ''),
    createdBy: String(data.createdBy || existing?.createdBy || userId),
    createdByName: String(data.createdByName || existing?.createdByName || '').trim(),
    createdAt: existing?.createdAt || now, updatedAt: now,
    completedAt: data.completedAt || existing?.completedAt || '',
    cancelledAt: data.cancelledAt || existing?.cancelledAt || '',
  };
}

export function sanitizeSignatureRequest(doc) {
  if (!doc) return null;
  return {
    _rev: doc._rev, type: 'signature_request', id: doc._id,
    user_id: doc.user_id || '', documentId: doc.documentId || '',
    documentName: doc.documentName || '',
    status: normalizeSignatureStatus(doc.status),
    signers: Array.isArray(doc.signers) ? doc.signers.map((s, i) => normalizeSigner(s, i)) : [],
    signingOrder: doc.signingOrder === 'sequential' ? 'sequential' : 'parallel',
    message: doc.message || '', expiresAt: doc.expiresAt || '',
    reminderEnabled: doc.reminderEnabled ?? true,
    reminderIntervalDays: Number(doc.reminderIntervalDays || 3),
    lastReminderAt: doc.lastReminderAt || '',
    sourceFileUrl: doc.sourceFileUrl || '', sourceFileName: doc.sourceFileName || '',
    sourceMimeType: doc.sourceMimeType || '', sourceFileSize: Number(doc.sourceFileSize || 0),
    signedFileUrl: doc.signedFileUrl || '', signedFileName: doc.signedFileName || '',
    signedMimeType: doc.signedMimeType || '', signedFileSize: Number(doc.signedFileSize || 0),
    linkedEntityType: doc.linkedEntityType || '', linkedEntityId: doc.linkedEntityId || '',
    linkedEntityName: doc.linkedEntityName || '',
    provider: doc.provider || 'internal', providerRequestId: doc.providerRequestId || '',
    providerData: doc.providerData || {},
    events: Array.isArray(doc.events) ? doc.events.map(normalizeSignatureEvent) : [],
    tags: Array.isArray(doc.tags) ? doc.tags : [], notes: doc.notes || '',
    createdBy: doc.createdBy || '', createdByName: doc.createdByName || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    completedAt: doc.completedAt || '', cancelledAt: doc.cancelledAt || '',
    deletedAt: doc.deletedAt || null,
  };
}

export function addSignatureEvent(doc, event) {
  const events = Array.isArray(doc.events) ? [...doc.events] : [];
  events.push(normalizeSignatureEvent(event));
  return events;
}

export function recalcSignatureStatus(signers) {
  const required = signers.filter((s) => s.role === 'signer');
  if (required.length === 0) return 'draft';
  if (required.some((s) => s.status === 'rejected')) return 'rejected';
  if (required.every((s) => s.status === 'signed')) return 'completed';
  if (required.some((s) => s.status === 'signed')) return 'partially_signed';
  if (required.some((s) => s.status === 'expired')) return 'expired';
  return 'pending';
}

export async function listSignatureRequestsByUser(req, userId) {
  const db = getDocumentsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'signature_request' && !doc?.deletedAt && doc?.user_id === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function listSignatureRequestsByDocument(req, userId, documentId) {
  const db = getDocumentsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'signature_request' && !doc?.deletedAt && doc?.user_id === userId && doc?.documentId === documentId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function listSignatureRequestsByEntity(req, userId, entityType, entityId) {
  const db = getDocumentsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'signature_request' && !doc?.deletedAt && doc?.user_id === userId && doc?.linkedEntityType === entityType && doc?.linkedEntityId === entityId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ─── LOCATIONS ────────────────────────────────────────────────────────────────

function normalizeLocationCategory(value) {
  const allowed = ['indoor', 'outdoor', 'workshop', 'storage', 'other'];
  return allowed.includes(String(value || '')) ? String(value) : 'other';
}

export function buildLocationDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data.id || `location-${uuidv4()}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'location',
    id,
    user_id: userId,
    name: String(data.name || '').trim(),
    description: String(data.description || '').trim(),
    capacity: Number(data.capacity || 0),
    category: normalizeLocationCategory(data.category),
    address: String(data.address || '').trim(),
    notes: String(data.notes || '').trim(),
    active: data.active !== false,
    vehicleIds: Array.isArray(data.vehicleIds)
      ? data.vehicleIds.map(String)
      : (existing?.vehicleIds || []),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeLocation(doc) {
  if (!doc) return null;
  return {
    _rev: doc._rev,
    type: 'location',
    id: doc._id,
    user_id: doc.user_id || '',
    name: doc.name || '',
    description: doc.description || '',
    capacity: Number(doc.capacity || 0),
    occupiedSpots: Array.isArray(doc.vehicleIds) ? doc.vehicleIds.length : 0,
    category: normalizeLocationCategory(doc.category),
    address: doc.address || '',
    notes: doc.notes || '',
    active: doc.active !== false,
    vehicleIds: Array.isArray(doc.vehicleIds) ? doc.vehicleIds : [],
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listLocationsByUser(req, userId) {
  const db = getLocationsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'location' && !doc?.deletedAt && doc?.user_id === userId && doc?.active !== false)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

// ─── GDPR / RGPD ─────────────────────────────────────────────────────────────

export function getGdprConsentsDbName() {
  const prefix = process.env.COUCHDB_DB || 'vertial';
  return `${prefix}-gdpr-consents`;
}

export function getGdprRequestsDbName() {
  const prefix = process.env.COUCHDB_DB || 'vertial';
  return `${prefix}-gdpr-requests`;
}

const CONSENT_PURPOSES = ['marketing', 'analytics', 'functional', 'communications', 'data_transfer', 'profiling', 'other'];
const CONSENT_CHANNELS = ['web', 'phone', 'email', 'in_person', 'app', 'other'];
const GDPR_RIGHT_TYPES = ['access', 'rectification', 'erasure', 'portability', 'objection', 'restriction'];
const GDPR_REQUEST_STATUSES = ['pending', 'in_progress', 'completed', 'rejected'];

export function buildGdprConsentDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `consent-${uuidv4()}`;
  return {
    _id: id,
    _rev: existing?._rev,
    type: 'gdpr_consent',
    user_id: userId,
    clientId: String(data.clientId || '').trim(),
    clientName: String(data.clientName || '').trim(),
    clientEmail: String(data.clientEmail || '').trim().toLowerCase(),
    clientPhone: String(data.clientPhone || '').trim(),
    clientDni: String(data.clientDni || '').trim(),
    purpose: CONSENT_PURPOSES.includes(data.purpose) ? data.purpose : 'other',
    purposeDescription: String(data.purposeDescription || '').trim(),
    channel: CONSENT_CHANNELS.includes(data.channel) ? data.channel : 'other',
    granted: data.granted !== false,
    grantedAt: data.granted !== false ? (existing?.grantedAt || now) : null,
    revokedAt: data.granted === false ? now : (existing?.revokedAt || null),
    expiresAt: data.expiresAt ? String(data.expiresAt) : null,
    ipAddress: String(data.ipAddress || '').trim(),
    notes: String(data.notes || '').trim(),
    legalBasis: String(data.legalBasis || 'consent').trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeGdprConsent(doc) {
  if (!doc) return null;
  return {
    _rev: doc._rev,
    type: 'gdpr_consent',
    id: doc._id,
    user_id: doc.user_id || '',
    clientId: doc.clientId || '',
    clientName: doc.clientName || '',
    clientEmail: doc.clientEmail || '',
    clientPhone: doc.clientPhone || '',
    clientDni: doc.clientDni || '',
    purpose: doc.purpose || 'other',
    purposeDescription: doc.purposeDescription || '',
    channel: doc.channel || 'other',
    granted: doc.granted !== false,
    grantedAt: doc.grantedAt || null,
    revokedAt: doc.revokedAt || null,
    expiresAt: doc.expiresAt || null,
    ipAddress: doc.ipAddress || '',
    notes: doc.notes || '',
    legalBasis: doc.legalBasis || 'consent',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
  };
}

export async function listGdprConsentsByUser(req, userId) {
  const db = getGdprConsentsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'gdpr_consent' && doc?.user_id === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export function buildGdprRequestDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `gdpr-request-${uuidv4()}`;
  const deadline = new Date(now);
  deadline.setDate(deadline.getDate() + 30);
  return {
    _id: id,
    _rev: existing?._rev,
    type: 'gdpr_request',
    user_id: userId,
    clientId: String(data.clientId || '').trim(),
    clientName: String(data.clientName || '').trim(),
    clientEmail: String(data.clientEmail || '').trim().toLowerCase(),
    clientPhone: String(data.clientPhone || '').trim(),
    clientDni: String(data.clientDni || '').trim(),
    rightType: GDPR_RIGHT_TYPES.includes(data.rightType) ? data.rightType : 'access',
    status: GDPR_REQUEST_STATUSES.includes(data.status) ? data.status : (GDPR_REQUEST_STATUSES.includes(existing?.status) ? existing.status : 'pending'),
    description: String(data.description || existing?.description || '').trim(),
    response: String(data.response || existing?.response || '').trim(),
    assignedTo: String(data.assignedTo || existing?.assignedTo || '').trim(),
    legalDeadline: existing?.legalDeadline || deadline.toISOString(),
    completedAt: (data.status === 'completed' || existing?.status === 'completed') ? (existing?.completedAt || now) : null,
    rejectedAt: (data.status === 'rejected' || existing?.status === 'rejected') ? (existing?.rejectedAt || now) : null,
    notes: String(data.notes || existing?.notes || '').trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeGdprRequest(doc) {
  if (!doc) return null;
  return {
    _rev: doc._rev,
    type: 'gdpr_request',
    id: doc._id,
    user_id: doc.user_id || '',
    clientId: doc.clientId || '',
    clientName: doc.clientName || '',
    clientEmail: doc.clientEmail || '',
    clientPhone: doc.clientPhone || '',
    clientDni: doc.clientDni || '',
    rightType: doc.rightType || 'access',
    status: doc.status || 'pending',
    description: doc.description || '',
    response: doc.response || '',
    assignedTo: doc.assignedTo || '',
    legalDeadline: doc.legalDeadline || null,
    completedAt: doc.completedAt || null,
    rejectedAt: doc.rejectedAt || null,
    notes: doc.notes || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
  };
}

export async function listGdprRequestsByUser(req, userId) {
  const db = getGdprRequestsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'gdpr_request' && doc?.user_id === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ─── Business (multi-tenant) ──────────────────────────────────────────────────

function generateShortAccessCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateCompanyCode() {
  return generateShortAccessCode(6);
}

/** Código de activación de tablet TPV (6 caracteres, único por PDV). */
export function generateTerminalCode() {
  return generateShortAccessCode(6);
}

export function generatePosPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function normalizePosPin(pin) {
  return String(pin || '').trim();
}

export function isValidPosPin(pin) {
  return /^\d{4,6}$/.test(normalizePosPin(pin));
}

export function hashPosPin(pin) {
  return hashPassword(normalizePosPin(pin));
}

export function verifyPosPin(pin, hash) {
  if (!hash) return false;
  return verifyPassword(normalizePosPin(pin), hash);
}

export function buildBusinessDocument({ ownerUserId, name, legalName = '', taxId = '', address = '', city = '', phone = '', email = '', logo = '', groupId = null, businessType = 'carDealership', companyCode = '', restaurantFormat = null }) {
  const businessId = uuidv4();
  const now = new Date().toISOString();
  const bt = String(businessType || 'carDealership').trim();
  const doc = {
    _id: `business:${businessId}`,
    type: 'business',
    business_id: businessId,
    owner_user_id: String(ownerUserId || '').trim(),
    group_id: groupId || null,
    businessType: bt,
    name: String(name || '').trim(),
    legalName: String(legalName || '').trim(),
    taxId: String(taxId || '').trim(),
    address: String(address || '').trim(),
    city: String(city || '').trim(),
    phone: String(phone || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    logo: String(logo || '').trim(),
    companyCode: String(companyCode || generateCompanyCode()).toUpperCase(),
    branches: [],
    members: [
      {
        user_id: String(ownerUserId || '').trim(),
        fullName: '',
        email: '',
        role: 'Admin',
        branch_id: null,
        permissions: buildDefaultPermissionMatrix('Admin'),
        joinedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  if (bt === 'restaurant' && restaurantFormat) {
    doc.restaurantFormat = String(restaurantFormat).trim();
  }
  return doc;
}

export function sanitizeBusiness(business) {
  if (!business) return null;
  return {
    id: business._id,
    _rev: business._rev,
    business_id: business.business_id,
    owner_user_id: business.owner_user_id || '',
    group_id: business.group_id || null,
    businessType: business.businessType || 'carDealership',
    restaurantFormat: business.restaurantFormat || null,
    name: business.name || '',
    legalName: business.legalName || '',
    taxId: business.taxId || '',
    address: business.address || '',
    city: business.city || '',
    phone: business.phone || '',
    email: business.email || '',
    logo: business.logo || '',
    branches: Array.isArray(business.branches)
      ? business.branches.map((b) => ({
          branch_id: b.branch_id || '',
          name: b.name || '',
          address: b.address || '',
          city: b.city || '',
          phone: b.phone || '',
          managerUserId: b.managerUserId || '',
          createdAt: b.createdAt || '',
        }))
      : [],
    members: Array.isArray(business.members)
      ? business.members.map((m) => ({
          user_id: m.user_id || '',
          fullName: m.fullName || '',
          email: m.email || '',
          role: m.role || 'Usuario',
          branch_id: m.branch_id || null,
          permissions: normalizePermissionMatrix(m.permissions, m.role || 'Usuario'),
          joinedAt: m.joinedAt || business.createdAt || '',
        }))
      : [],
    companyCode: business.companyCode || '',
    createdAt: business.createdAt || '',
    updatedAt: business.updatedAt || '',
    deletedAt: business.deletedAt || null,
  };
}

export async function saveBusiness(req, business) {
  if (!business?._id) throw new Error('Documento de empresa inválido');
  await ensureDatabase(req, BUSINESSES_DB);
  const result = await putDocument(req, BUSINESSES_DB, business._id, business);
  return { ...business, _rev: result.rev };
}

export async function findBusinessById(req, businessId) {
  if (!businessId) return null;
  const bareId = String(businessId).replace(/^business:/, '').trim();
  if (!bareId) return null;
  await ensureDatabase(req, BUSINESSES_DB);
  return getDocument(req, BUSINESSES_DB, `business:${bareId}`);
}

// ─── WORKSHOP (TALLER) ────────────────────────────────────────────────────────

export function getWorkshopDbName() {
  return normalizeDbName(process.env.VITE_WORKSHOP_DB || `${getDbPrefix()}-workshop`);
}

export function getPartsDbName() {
  return normalizeDbName(process.env.VITE_PARTS_DB || `${getDbPrefix()}-parts`);
}

function normalizeWorkOrderStatus(value) {
  const allowed = ['pending', 'in_progress', 'completed', 'invoiced', 'cancelled'];
  return allowed.includes(String(value || '')) ? String(value) : 'pending';
}

function normalizeWorkOrderPriority(value) {
  const allowed = ['low', 'normal', 'high', 'urgent'];
  return allowed.includes(String(value || '')) ? String(value) : 'normal';
}

export function buildWorkOrderDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `wo-${uuidv4()}`;
  const woNumber = existing?.woNumber || `OT-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const laborItems = Array.isArray(data.laborItems) ? data.laborItems : (existing?.laborItems || []);
  const materialItems = Array.isArray(data.materialItems) ? data.materialItems : (existing?.materialItems || []);
  const timeEntries = Array.isArray(data.timeEntries) ? data.timeEntries : (existing?.timeEntries || []);

  const totalLaborCost = laborItems.reduce((s, i) => s + Number(i.total || 0), 0);
  const totalMaterialsCost = materialItems.reduce((s, i) => s + Number(i.total || 0), 0);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'work_order',
    id,
    woNumber,
    user_id: userId,
    business_id: String(data.business_id || existing?.business_id || ''),
    vehicleId: String(data.vehicleId || ''),
    vehicleBrand: String(data.vehicleBrand || ''),
    vehicleModel: String(data.vehicleModel || ''),
    vehiclePlate: String(data.vehiclePlate || '').toUpperCase(),
    vehicleVin: String(data.vehicleVin || ''),
    vehicleMileage: data.vehicleMileage ? Number(data.vehicleMileage) || 0 : 0,
    clientId: String(data.clientId || ''),
    clientName: String(data.clientName || ''),
    clientPhone: String(data.clientPhone || ''),
    clientEmail: String(data.clientEmail || ''),
    status: normalizeWorkOrderStatus(data.status),
    priority: normalizeWorkOrderPriority(data.priority),
    serviceType: String(data.serviceType || 'revision'),
    description: String(data.description || ''),
    responsible: String(data.responsible || 'Sin asignar'),
    laborItems,
    materialItems,
    timeEntries,
    totalLaborCost,
    totalMaterialsCost,
    totalCost: totalLaborCost + totalMaterialsCost,
    mechanicSignature: String(data.mechanicSignature || existing?.mechanicSignature || ''),
    clientSignature: String(data.clientSignature || existing?.clientSignature || ''),
    photos: Array.isArray(data.photos) ? data.photos : (existing?.photos || []),
    notes: String(data.notes || ''),
    invoiceId: String(data.invoiceId || existing?.invoiceId || ''),
    estimatedCompletion: String(data.estimatedCompletion || ''),
    completedAt: normalizeWorkOrderStatus(data.status) === 'completed' && !existing?.completedAt
      ? now
      : String(data.completedAt || existing?.completedAt || ''),
    invoicedAt: normalizeWorkOrderStatus(data.status) === 'invoiced' && !existing?.invoicedAt
      ? now
      : String(data.invoicedAt || existing?.invoicedAt || ''),
    stageHistory: Array.isArray(data.stageHistory) ? data.stageHistory : (existing?.stageHistory || []),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeWorkOrder(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'work_order',
    id: doc._id,
    woNumber: doc.woNumber || '',
    user_id: doc.user_id,
    business_id: doc.business_id || '',
    vehicleId: doc.vehicleId || '',
    vehicleBrand: doc.vehicleBrand || '',
    vehicleModel: doc.vehicleModel || '',
    vehiclePlate: doc.vehiclePlate || '',
    vehicleVin: doc.vehicleVin || '',
    vehicleMileage: Number(doc.vehicleMileage || 0),
    clientId: doc.clientId || '',
    clientName: doc.clientName || '',
    clientPhone: doc.clientPhone || '',
    clientEmail: doc.clientEmail || '',
    status: normalizeWorkOrderStatus(doc.status),
    priority: normalizeWorkOrderPriority(doc.priority),
    serviceType: doc.serviceType || 'revision',
    description: doc.description || '',
    responsible: doc.responsible || 'Sin asignar',
    laborItems: Array.isArray(doc.laborItems) ? doc.laborItems : [],
    materialItems: Array.isArray(doc.materialItems) ? doc.materialItems : [],
    timeEntries: Array.isArray(doc.timeEntries) ? doc.timeEntries : [],
    totalLaborCost: Number(doc.totalLaborCost || 0),
    totalMaterialsCost: Number(doc.totalMaterialsCost || 0),
    totalCost: Number(doc.totalCost || 0),
    mechanicSignature: doc.mechanicSignature || '',
    clientSignature: doc.clientSignature || '',
    photos: Array.isArray(doc.photos) ? doc.photos : [],
    notes: doc.notes || '',
    invoiceId: doc.invoiceId || '',
    estimatedCompletion: doc.estimatedCompletion || '',
    completedAt: doc.completedAt || '',
    invoicedAt: doc.invoicedAt || '',
    stageHistory: Array.isArray(doc.stageHistory) ? doc.stageHistory : [],
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listWorkOrdersByUser(req, userId, businessId = null) {
  const db = getWorkshopDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  const scopeId = String(businessId || '').trim();
  return docs
    .filter((doc) => {
      if (doc?.type !== 'work_order' || doc?.deletedAt) return false;
      if (userId && doc?.user_id !== userId) return false;
      if (scopeId && doc?.business_id && doc.business_id !== scopeId) return false;
      return true;
    })
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function listPartsByUser(req, userId, businessId = null) {
  const db = getPartsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  const scopeId = String(businessId || '').trim();
  return docs
    .filter((doc) => {
      if (doc?.type !== 'part' || doc?.deletedAt) return false;
      if (userId && doc?.user_id !== userId) return false;
      if (scopeId && doc?.business_id && doc.business_id !== scopeId) return false;
      return true;
    })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}

export function buildPartDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `part-${uuidv4()}`;
  const partNumber = existing?.partNumber || `P-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'part',
    id,
    partNumber,
    user_id: userId,
    business_id: String(data.business_id || existing?.business_id || ''),
    name: String(data.name || ''),
    reference: String(data.reference || ''),
    category: String(data.category || 'otro'),
    brand: String(data.brand || ''),
    unitCost: Number(data.unitCost || 0),
    salePrice: Number(data.salePrice || 0),
    stockQuantity: Number(data.stockQuantity ?? existing?.stockQuantity ?? 0),
    minStock: Number(data.minStock || 0),
    location: String(data.location || ''),
    notes: String(data.notes || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizePart(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'part',
    id: doc._id,
    partNumber: doc.partNumber || '',
    user_id: doc.user_id,
    business_id: doc.business_id || '',
    name: doc.name || '',
    reference: doc.reference || '',
    category: doc.category || 'otro',
    brand: doc.brand || '',
    unitCost: Number(doc.unitCost || 0),
    salePrice: Number(doc.salePrice || 0),
    stockQuantity: Number(doc.stockQuantity || 0),
    minStock: Number(doc.minStock || 0),
    location: doc.location || '',
    notes: doc.notes || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

// ─── DELIVERY ─────────────────────────────────────────────────────────────────

export function getDeliveryDbName() {
  return normalizeDbName(process.env.VITE_DELIVERY_DB || `${getDbPrefix()}-delivery`);
}

export function getWorkCentersDbName() {
  const base = process.env.VITE_COUCHDB_DB || getDbPrefix();
  return normalizeDbName(`${base}-sales-points`);
}

export function getCatalogDbName() {
  return normalizeDbName(process.env.VITE_CATALOG_DB || `${getDbPrefix()}-catalog`);
}

const DELIVERY_STATUS_MIGRATION = {
  pending: 'nuevo', preparing: 'nuevo', kitchen: 'cocina',
  assembly: 'listo', delivery: 'en_reparto', delivered: 'entregado',
};

function normalizeDeliveryOrderStatus(value) {
  const v = String(value || '');
  if (DELIVERY_STATUS_MIGRATION[v]) return DELIVERY_STATUS_MIGRATION[v];
  const allowed = ['nuevo', 'cocina', 'listo', 'en_reparto', 'entregado', 'devuelto', 'cancelled', 'incident'];
  return allowed.includes(v) ? v : 'nuevo';
}

function normalizeDeliveryType(value) {
  const allowed = ['domicilio', 'recogida', 'sala'];
  return allowed.includes(String(value || '')) ? String(value) : 'domicilio';
}

function normalizePaymentStatus(value) {
  const allowed = ['pending', 'paid', 'partial', 'refunded'];
  return allowed.includes(String(value || '')) ? String(value) : 'pending';
}

export function buildDeliveryOrderDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `dord-${uuidv4()}`;
  const clientOrderNumber = String(data?.orderNumber || '').trim().toUpperCase();
  const orderNumber = existing?.orderNumber
    || (/^[A-Z0-9][A-Z0-9\-_]{2,31}$/.test(clientOrderNumber)
      ? clientOrderNumber
      : `PED-${Date.now().toString(36).toUpperCase().slice(-6)}`);

  const items = Array.isArray(data.items) ? data.items.map((i) => {
    const comboSelections = Array.isArray(i.comboSelections)
      ? i.comboSelections
        .map((ref) => {
          const productId = String(ref?.productId || ref?.catalogItemId || '').trim();
          const quantity = Number(ref?.quantity || 0);
          if (!productId || !(quantity > 0)) return null;
          return {
            productId,
            productName: String(ref?.productName || '').trim(),
            quantity,
            ...(ref?.slotKind ? { slotKind: ref.slotKind } : {}),
            ...(ref?.instanceId ? { instanceId: String(ref.instanceId) } : {}),
          };
        })
        .filter(Boolean)
      : [];
    const hh = i.halfHalfPizza && typeof i.halfHalfPizza === 'object' ? i.halfHalfPizza : null;
    const halfHalfPizza = hh
      && String(hh.firstProductId || '').trim()
      && String(hh.secondProductId || '').trim()
      ? {
        firstProductId: String(hh.firstProductId).trim(),
        firstProductName: String(hh.firstProductName || '').trim(),
        secondProductId: String(hh.secondProductId).trim(),
        secondProductName: String(hh.secondProductName || '').trim(),
      }
      : undefined;
    return {
      id: i.id || '',
      name: i.name || '',
      quantity: Number(i.quantity || 0),
      unitPrice: Number(i.unitPrice || 0),
      total: Number(i.total || 0),
      notes: i.notes || '',
      catalogItemId: i.catalogItemId || '',
      category: i.category || '',
      brandIds: Array.isArray(i.brandIds) ? i.brandIds.map((b) => String(b || '').trim()).filter(Boolean) : [],
      extras: Array.isArray(i.extras) ? i.extras : [],
      allergens: Array.isArray(i.allergens) ? i.allergens : [],
      ingredients: Array.isArray(i.ingredients) ? i.ingredients : [],
      outOfStock: Boolean(i.outOfStock),
      outOfStockAt: i.outOfStockAt || '',
      ...(comboSelections.length > 0 ? { comboSelections } : {}),
      ...(halfHalfPizza ? { halfHalfPizza } : {}),
    };
  }) : (existing?.items || []);
  const itemsSubtotal = items.reduce((s, i) => s + Number(i.total || 0), 0);
  const roundMoney = (n) => Math.round(Number(n) * 100) / 100;
  const deliveryFeeRaw = data.deliveryFee != null && data.deliveryFee !== ''
    ? Number(data.deliveryFee)
    : Number(existing?.deliveryFee || 0);
  const deliveryFee = Number.isFinite(deliveryFeeRaw) && deliveryFeeRaw > 0
    ? roundMoney(deliveryFeeRaw)
    : 0;
  const explicitDiscount = data.discountAmount != null && data.discountAmount !== ''
    ? Number(data.discountAmount)
    : NaN;
  const discountAmount = Number.isFinite(explicitDiscount) && explicitDiscount >= 0
    ? roundMoney(Math.min(explicitDiscount, itemsSubtotal))
    : 0;
  const maxPayable = roundMoney(Math.max(0, itemsSubtotal - discountAmount) + deliveryFee);
  const explicitTotal = data.totalAmount != null && data.totalAmount !== ''
    ? Number(data.totalAmount)
    : NaN;
  const preservedTotal = existing?.totalAmount != null ? Number(existing.totalAmount) : NaN;
  let totalAmount;
  if (Number.isFinite(explicitTotal) && explicitTotal >= 0) {
    // Permite envío: el total puede superar el subtotal de líneas.
    totalAmount = roundMoney(Math.min(explicitTotal, maxPayable > 0 ? maxPayable : explicitTotal));
  } else if (existing && Number.isFinite(preservedTotal) && data.items == null) {
    totalAmount = roundMoney(preservedTotal);
  } else {
    totalAmount = maxPayable > 0 || deliveryFee > 0 || discountAmount > 0
      ? maxPayable
      : roundMoney(itemsSubtotal);
  }
  const inferredDiscount = Number.isFinite(explicitDiscount) && explicitDiscount >= 0
    ? discountAmount
    : roundMoney(Math.max(0, itemsSubtotal + deliveryFee - totalAmount));
  const finalDiscountAmount = Number.isFinite(explicitDiscount) && explicitDiscount >= 0
    ? discountAmount
    : inferredDiscount;

  const newStatus = normalizeDeliveryOrderStatus(data.status);
  const oldStatus = existing ? normalizeDeliveryOrderStatus(existing.status) : null;
  const statusChanged = existing && newStatus !== oldStatus;

  let kitchenStartedAt = String(data.kitchenStartedAt || existing?.kitchenStartedAt || '');
  let kitchenCompletedAt = String(data.kitchenCompletedAt || existing?.kitchenCompletedAt || '');
  let assemblyStartedAt = String(data.assemblyStartedAt || existing?.assemblyStartedAt || '');
  let assemblyCompletedAt = String(data.assemblyCompletedAt || existing?.assemblyCompletedAt || '');
  // departedAt marca el momento en el que el repartidor sale con el pedido. Es
  // la base para medir cuánto tarda el reparto (deliveredAt - departedAt).
  // Cuando llegue una transición a 'en_reparto' lo fijamos automáticamente, así
  // el cliente no tiene que enviarlo manualmente.
  let departedAt = String(data.departedAt || existing?.departedAt || '');

  // Anclas de fase: también al CREAR (existing=null). Si solo se aplican en
  // statusChanged, un pedido TPV creado ya en 'listo' no lleva assemblyStartedAt
  // y la base operativa muestra montaje/reparto vacíos (—).
  if (!existing || statusChanged) {
    if (newStatus === 'cocina' && !kitchenStartedAt) kitchenStartedAt = now;
    if (newStatus === 'listo') {
      if (!kitchenCompletedAt) kitchenCompletedAt = now;
      if (!assemblyStartedAt) assemblyStartedAt = now;
    }
    if (newStatus === 'en_reparto') {
      if (!assemblyStartedAt) {
        assemblyStartedAt = String(existing?.createdAt || data.createdAt || now);
      }
      if (!assemblyCompletedAt) assemblyCompletedAt = now;
      if (!departedAt) departedAt = now;
    }
    if (newStatus === 'entregado') {
      if (!assemblyStartedAt) {
        assemblyStartedAt = String(existing?.createdAt || data.createdAt || now);
      }
      if (!assemblyCompletedAt) assemblyCompletedAt = now;
      // Si se marca como entregado sin haber pasado por 'en_reparto' (p. ej.
      // recogida en local), fijamos también departedAt = now para que las
      // métricas de duración de reparto sean coherentes (en estos casos será 0).
      if (!departedAt) departedAt = now;
    }
  }

  const stageHistory = Array.isArray(data.stageHistory)
    ? [...data.stageHistory]
    : [...(existing?.stageHistory || [])];
  // Evita filas duplicadas cuando el cliente ya añadió la transición en stageHistory.
  if (statusChanged) {
    const last = stageHistory[stageHistory.length - 1];
    const lastStatus = last ? normalizeDeliveryOrderStatus(last.status) : null;
    if (lastStatus !== newStatus) {
      stageHistory.push({
        status: newStatus,
        date: now,
        user: data._transitionUser || userId,
        notes: data._transitionNotes || '',
      });
    }
  }

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'delivery_order',
    id,
    orderNumber,
    user_id: userId,

    clientId: String(data.clientId || existing?.clientId || ''),
    customerName: String(data.customerName || ''),
    customerPhone: String(data.customerPhone || ''),
    customerEmail: String(data.customerEmail || ''),
    customerAddress: String(data.customerAddress || ''),
    customerZone: String(data.customerZone || existing?.customerZone || ''),

    channel: String(data.channel || existing?.channel || 'direct'),
    deliveryType: normalizeDeliveryType(data.deliveryType || existing?.deliveryType),
    status: newStatus,
    priority: String(data.priority || 'normal'),

    salesPointId: String(data.salesPointId || existing?.salesPointId || ''),
    salesPointName: String(data.salesPointName || existing?.salesPointName || ''),
    business_id: String(
      data.business_id || data.businessId || existing?.business_id || existing?.businessId || '',
    ).trim(),
    tableNumber: data.tableNumber != null ? Number(data.tableNumber) : (existing?.tableNumber ?? null),
    tableId: String(data.tableId || existing?.tableId || '').trim() || null,

    takenBy: String(data.takenBy || existing?.takenBy || ''),
    takenByName: String(data.takenByName || existing?.takenByName || ''),
    takenAt: String(data.takenAt || existing?.takenAt || ''),

    items,
    itemsSubtotal: roundMoney(itemsSubtotal),
    discountAmount: finalDiscountAmount,
    deliveryFee,
    totalAmount,
    notes: String(data.notes || ''),
    observations: String(data.observations || existing?.observations || ''),
    kitchenNotes: String(data.kitchenNotes || existing?.kitchenNotes || ''),
    kitchenPriority: Number(data.kitchenPriority ?? existing?.kitchenPriority ?? 99),

    paymentMethod: String(data.paymentMethod || existing?.paymentMethod || ''),
    paymentStatus: normalizePaymentStatus(data.paymentStatus || existing?.paymentStatus),
    paidAmount: Number(data.paidAmount ?? existing?.paidAmount ?? 0),
    paidAt: String(data.paidAt || existing?.paidAt || ''),
    paymentCollected: Boolean(data.paymentCollected ?? existing?.paymentCollected),
    paymentCollectedAt: String(data.paymentCollectedAt || existing?.paymentCollectedAt || ''),
    paymentCollectedBy: String(data.paymentCollectedBy || existing?.paymentCollectedBy || ''),
    amountReceived: Number(data.amountReceived ?? existing?.amountReceived ?? 0) || undefined,
    changeGiven: Number(data.changeGiven ?? existing?.changeGiven ?? 0) || undefined,
    payments: Array.isArray(data.payments)
      ? data.payments
      : (Array.isArray(existing?.payments) ? existing.payments : []),

    assignedDriver: String(data.assignedDriver || ''),
    estimatedDelivery: String(data.estimatedDelivery || ''),
    deliveredAt: newStatus === 'entregado' && !existing?.deliveredAt
      ? now
      : String(data.deliveredAt || existing?.deliveredAt || ''),
    departedAt,
    kitchenStartedAt,
    kitchenCompletedAt,
    assemblyStartedAt,
    assemblyCompletedAt,

    ticketNumber: String(data.ticketNumber || existing?.ticketNumber || ''),

    cancelReason: String(data.cancelReason || existing?.cancelReason || ''),
    cancelledAt: String(data.cancelledAt || existing?.cancelledAt || ''),
    cancelledBy: String(data.cancelledBy || existing?.cancelledBy || ''),
    refundReason: String(data.refundReason || existing?.refundReason || ''),
    refundedAt: String(data.refundedAt || existing?.refundedAt || ''),
    refundedBy: String(data.refundedBy || existing?.refundedBy || ''),
    refundAmount: Number(data.refundAmount ?? existing?.refundAmount ?? 0),
    reopenedAt: String(data.reopenedAt || existing?.reopenedAt || ''),
    reopenedBy: String(data.reopenedBy || existing?.reopenedBy || ''),

    externalOrderId: String(data.externalOrderId || existing?.externalOrderId || ''),

    incidentNotes: String(data.incidentNotes || existing?.incidentNotes || ''),
    incidentType: String(data.incidentType || existing?.incidentType || ''),
    stageHistory,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeDeliveryOrder(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'delivery_order',
    id: doc._id,
    orderNumber: doc.orderNumber || '',
    user_id: doc.user_id,

    clientId: doc.clientId || '',
    customerName: doc.customerName || '',
    customerPhone: doc.customerPhone || '',
    customerEmail: doc.customerEmail || '',
    customerAddress: doc.customerAddress || '',
    customerZone: doc.customerZone || '',

    channel: doc.channel || 'direct',
    deliveryType: normalizeDeliveryType(doc.deliveryType),
    status: normalizeDeliveryOrderStatus(doc.status),
    priority: doc.priority || 'normal',

    salesPointId: doc.salesPointId || '',
    salesPointName: doc.salesPointName || '',
    business_id: doc.business_id || doc.businessId || '',
    tableNumber: doc.tableNumber ?? null,
    tableId: doc.tableId || null,

    takenBy: doc.takenBy || '',
    takenByName: doc.takenByName || '',
    takenAt: doc.takenAt || '',

    items: Array.isArray(doc.items) ? doc.items : [],
    itemsSubtotal: Number(doc.itemsSubtotal ?? doc.totalAmount ?? 0),
    discountAmount: Number(doc.discountAmount || 0),
    deliveryFee: Number(doc.deliveryFee || 0),
    totalAmount: Number(doc.totalAmount || 0),
    notes: doc.notes || '',
    observations: doc.observations || '',
    kitchenNotes: doc.kitchenNotes || '',
    kitchenPriority: Number(doc.kitchenPriority ?? 99),

    paymentMethod: doc.paymentMethod || '',
    paymentStatus: normalizePaymentStatus(doc.paymentStatus),
    paidAmount: Number(doc.paidAmount || 0),
    paidAt: doc.paidAt || '',
    paymentCollected: Boolean(doc.paymentCollected),
    paymentCollectedAt: doc.paymentCollectedAt || '',
    paymentCollectedBy: doc.paymentCollectedBy || '',
    amountReceived: Number(doc.amountReceived || 0) || undefined,
    changeGiven: Number(doc.changeGiven || 0) || undefined,
    payments: Array.isArray(doc.payments) ? doc.payments : [],

    ticketNumber: doc.ticketNumber || '',

    cancelReason: doc.cancelReason || '',
    cancelledAt: doc.cancelledAt || '',
    cancelledBy: doc.cancelledBy || '',
    refundReason: doc.refundReason || '',
    refundedAt: doc.refundedAt || '',
    refundedBy: doc.refundedBy || '',
    refundAmount: Number(doc.refundAmount || 0),

    assignedDriver: doc.assignedDriver || '',
    driverId: doc.driverId || '',
    estimatedDelivery: doc.estimatedDelivery || '',
    estimatedDeliveryMinutes: doc.estimatedDeliveryMinutes ?? null,
    estimatedArrivalAt: doc.estimatedArrivalAt || '',
    departedAt: doc.departedAt || '',
    deliveredAt: doc.deliveredAt || '',
    kitchenStartedAt: doc.kitchenStartedAt || '',
    kitchenCompletedAt: doc.kitchenCompletedAt || '',
    assemblyStartedAt: doc.assemblyStartedAt || '',
    assemblyCompletedAt: doc.assemblyCompletedAt || '',
    zone: doc.zone || '',
    deliveryDistance: doc.deliveryDistance ?? null,
    paymentCollected: Boolean(doc.paymentCollected),
    paymentCollectedAt: doc.paymentCollectedAt || '',
    paymentCollectedBy: doc.paymentCollectedBy || '',

    cancelReason: doc.cancelReason || '',
    cancelledAt: doc.cancelledAt || '',
    cancelledBy: doc.cancelledBy || '',
    reopenedAt: doc.reopenedAt || '',
    reopenedBy: doc.reopenedBy || '',

    externalOrderId: doc.externalOrderId || '',

    incidentNotes: doc.incidentNotes || '',
    incidentType: doc.incidentType || '',
    stageHistory: Array.isArray(doc.stageHistory) ? doc.stageHistory : [],
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

/**
 * Pedidos delivery del titular.
 * @param {{ dateFrom?: string }} [options] Si hay dateFrom (ISO), Couch filtra por createdAt
 *   — el TPV/caja del día no deben cargar meses de histórico.
 */
export async function listDeliveryOrdersByUser(req, userId, options = {}) {
  const uid = String(userId || '').trim();
  const dateFrom = String(options?.dateFrom || '').trim();
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  await ensureDeliveryTypeUserIndex(req, db);

  const baseSelector = uid
    ? { type: 'delivery_order', user_id: uid }
    : { type: 'delivery_order' };
  const selector = dateFrom
    ? { ...baseSelector, createdAt: { $gte: dateFrom } }
    : baseSelector;

  // Mango por type+user_id (+ createdAt si hay ventana): no _all_docs del DB compartido.
  let docs;
  try {
    docs = await findDocuments(req, db, selector, { pageSize: 500, maxDocs: 100_000 });
  } catch {
    if (dateFrom) {
      // Índice compuesto aún no listo: al menos limitamos al titular y filtramos en memoria.
      try {
        docs = await findDocuments(req, db, baseSelector, { pageSize: 500, maxDocs: 100_000 });
      } catch {
        const all = await getDeliveryDatabaseDocumentsInflight(req);
        docs = all.filter(
          (doc) => doc?.type === 'delivery_order' && (!uid || doc?.user_id === uid),
        );
      }
    } else {
      const all = await getDeliveryDatabaseDocumentsInflight(req);
      docs = all.filter(
        (doc) => doc?.type === 'delivery_order' && (!uid || doc?.user_id === uid),
      );
    }
  }

  return docs
    .filter(
      (doc) =>
        doc?.type === 'delivery_order'
        && !doc?.deletedAt
        && (!uid || doc?.user_id === uid)
        && (!dateFrom || String(doc.createdAt || '') >= dateFrom),
    )
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ─── DELIVERY CONFIG ──────────────────────────────────────────────────────────

const DEFAULT_DELIVERY_CONFIG = {
  hasDineIn: false, hasTakeaway: true, hasOwnDelivery: true,
  hasPlatformDelivery: false, platforms: [],
  hasPhysicalTables: false, tableCount: 0,
  hasKitchen: true, hasAssemblyStation: true, hasCashRegister: true,
  defaultPrepTime: 20, maxKitchenCapacity: 15,
  delayThresholdMinutes: 30, kitchenSaturationThreshold: 10,
  cashCloseReminder: true, cashCloseReminderTime: '23:00',
  activeChannels: ['direct', 'phone', 'web', 'app'],
  activeTimeSlots: [
    { id: 'lunch', label: 'Comida', start: '12:00', end: '16:00' },
    { id: 'dinner', label: 'Cena', start: '19:00', end: '23:30' },
  ],
  staffConsumption: {
    enabled: true,
    pricingMode: 'staff_price_field',
    defaultDiscountPercent: 0,
    eligibleCategories: [],
    excludedCatalogItemIds: [],
  },
  tpvDeliveryFee: 0,
};

export function sanitizeStoreIngredients(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  raw.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') return;
    const name = String(entry.name || '').trim();
    if (!name) return;
    const brandIds = Array.isArray(entry.brandIds)
      ? [...new Set(entry.brandIds.map((x) => String(x || '').trim()).filter(Boolean))].sort()
      : [];
    const key =
      brandIds.length > 0
        ? `${name.toLowerCase()}::${brandIds.join(',')}`
        : name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const role = ['escandallo', 'base', 'extra'].includes(String(entry.role || ''))
      ? String(entry.role)
      : entry.escandalloOnly
        ? 'escandallo'
        : 'base';
    const extraPrices =
      entry.extraPrices && typeof entry.extraPrices === 'object'
        ? Object.fromEntries(
            Object.entries(entry.extraPrices)
              .map(([brandId, price]) => {
                const p = Number(price);
                const id = String(brandId || '').trim();
                if (!id || !Number.isFinite(p) || p < 0) return null;
                return [id, Math.round(p * 100) / 100];
              })
              .filter(Boolean),
          )
        : {};
    const productParts = Array.isArray(entry.productParts)
      ? [...new Set(entry.productParts.filter((p) => p === 'pizzas' || p === 'hamburguesas'))]
      : [];
    const tpvChargeExtra = typeof entry.tpvChargeExtra === 'boolean' ? entry.tpvChargeExtra : undefined;
    const tpvAllowRemove = typeof entry.tpvAllowRemove === 'boolean' ? entry.tpvAllowRemove : undefined;
    const baseCostRaw = Number(entry.baseCost);
    const baseCost =
      Number.isFinite(baseCostRaw) && baseCostRaw >= 0 ? Math.round(baseCostRaw * 100) / 100 : undefined;
    out.push({
      id: String(entry.id || `ing-${idx}-${key.replace(/\s+/g, '-')}`),
      name,
      role,
      escandalloOnly: role === 'escandallo',
      ...(brandIds.length > 0 ? { brandIds } : {}),
      ...(productParts.length > 0 ? { productParts } : {}),
      ...(role === 'extra' && Object.keys(extraPrices).length > 0 ? { extraPrices } : {}),
      ...(tpvChargeExtra !== undefined ? { tpvChargeExtra } : {}),
      ...(tpvAllowRemove !== undefined ? { tpvAllowRemove } : {}),
      ...(baseCost !== undefined ? { baseCost } : {}),
    });
  });
  return out;
}

export function sanitizeTpvCategoryTemplates(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const key of ['pizzas', 'hamburguesas']) {
    const entry = raw[key];
    if (!entry || typeof entry !== 'object') continue;
    const ingredients = String(entry.ingredients || '').trim();
    const supplements = Array.isArray(entry.supplements)
      ? entry.supplements
          .map((row, idx) => {
            if (!row || typeof row !== 'object') return null;
            const name = String(row.name || '').trim();
            if (!name) return null;
            const price = Number(row.price || 0);
            return {
              id: String(row.id || `sup-${idx}`),
              name,
              price: Number.isFinite(price) ? Math.round(price * 100) / 100 : 0,
            };
          })
          .filter(Boolean)
      : [];
    out[key] = { ingredients, supplements };
  }
  return out;
}

export function sanitizeTpvBrandIngredients(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [brandId, value] of Object.entries(raw)) {
    const id = String(brandId || '').trim();
    if (!id || !Array.isArray(value)) continue;
    const ids = [...new Set(value.map((x) => String(x || '').trim()).filter(Boolean))];
    if (ids.length > 0) out[id] = ids;
  }
  return out;
}

export function sanitizeTpvBrandSupplementsFlat(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [brandId, value] of Object.entries(raw)) {
    const id = String(brandId || '').trim();
    if (!id || !Array.isArray(value)) continue;
    const supplements = value
      .map((row, idx) => {
        if (!row || typeof row !== 'object') return null;
        const name = String(row.name || '').trim();
        if (!name) return null;
        const price = Number(row.price || 0);
        return {
          id: String(row.id || `sup-${idx}`),
          name,
          price: Number.isFinite(price) ? Math.round(price * 100) / 100 : 0,
        };
      })
      .filter(Boolean);
    if (supplements.length > 0) out[id] = supplements;
  }
  return out;
}

export function sanitizeTpvBrandCategoryIngredients(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [brandId, entry] of Object.entries(raw)) {
    const id = String(brandId || '').trim();
    if (!id || !entry || typeof entry !== 'object') continue;
    const brandOut = {};
    for (const key of ['pizzas', 'hamburguesas']) {
      const cat = entry[key];
      if (!cat || typeof cat !== 'object') continue;
      const ingredients = sanitizeStoreIngredients(cat.ingredients);
      if (ingredients.length > 0) brandOut[key] = { ingredients };
    }
    if (Object.keys(brandOut).length > 0) out[id] = brandOut;
  }
  return out;
}

export function sanitizeTpvBrandCategorySupplements(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [brandId, entry] of Object.entries(raw)) {
    const id = String(brandId || '').trim();
    if (!id || !entry || typeof entry !== 'object') continue;
    const brandOut = {};
    for (const key of ['pizzas', 'hamburguesas']) {
      const cat = entry[key];
      if (!cat || typeof cat !== 'object') continue;
      const supplements = Array.isArray(cat.supplements)
        ? cat.supplements
            .map((row, idx) => {
              if (!row || typeof row !== 'object') return null;
              const name = String(row.name || '').trim();
              if (!name) return null;
              const price = Number(row.price || 0);
              return {
                id: String(row.id || `sup-${idx}`),
                name,
                price: Number.isFinite(price) ? Math.round(price * 100) / 100 : 0,
              };
            })
            .filter(Boolean)
        : [];
      if (supplements.length > 0) brandOut[key] = { supplements };
    }
    if (Object.keys(brandOut).length > 0) out[id] = brandOut;
  }
  return out;
}

export function buildDeliveryConfigDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `dlvconf-${userId}`;
  const base = { ...DEFAULT_DELIVERY_CONFIG, ...(existing || {}), ...(data || {}) };
  return {
    _id: id, _rev: existing?._rev, type: 'delivery_config', id, user_id: userId,
    hasDineIn: Boolean(base.hasDineIn), hasTakeaway: Boolean(base.hasTakeaway),
    hasOwnDelivery: Boolean(base.hasOwnDelivery), hasPlatformDelivery: Boolean(base.hasPlatformDelivery),
    platforms: Array.isArray(base.platforms) ? base.platforms : [],
    hasPhysicalTables: Boolean(base.hasPhysicalTables), tableCount: Number(base.tableCount) || 0,
    hasKitchen: Boolean(base.hasKitchen), hasAssemblyStation: Boolean(base.hasAssemblyStation),
    hasCashRegister: Boolean(base.hasCashRegister),
    defaultPrepTime: Number(base.defaultPrepTime) || 20,
    maxKitchenCapacity: Number(base.maxKitchenCapacity) || 15,
    delayThresholdMinutes: Number(base.delayThresholdMinutes) || 30,
    kitchenSaturationThreshold: Number(base.kitchenSaturationThreshold) || 10,
    cashCloseReminder: Boolean(base.cashCloseReminder),
    cashCloseReminderTime: String(base.cashCloseReminderTime || '23:00'),
    activeChannels: Array.isArray(base.activeChannels) ? base.activeChannels : ['direct'],
    activeTimeSlots: Array.isArray(base.activeTimeSlots) ? base.activeTimeSlots : [],
    staffConsumption: sanitizeStaffConsumptionConfig(base.staffConsumption ?? existing?.staffConsumption),
    storeIngredients: sanitizeStoreIngredients(base.storeIngredients ?? existing?.storeIngredients),
    tpvDefaultExtraPrice: (() => {
      const raw = base.tpvDefaultExtraPrice ?? existing?.tpvDefaultExtraPrice;
      const p = Number(raw);
      return Number.isFinite(p) && p >= 0 ? Math.round(p * 100) / 100 : undefined;
    })(),
    /** Catálogo → Menú: 1 ingrediente quitado → 1 extra añadido sin coste en TPV. */
    tpvFreeSwapOnRemove: Boolean(
      base.tpvFreeSwapOnRemove ?? existing?.tpvFreeSwapOnRemove,
    ),
    /** Coste de envío automático en TPV cuando el pedido es a domicilio. */
    tpvDeliveryFee: (() => {
      const raw = base.tpvDeliveryFee ?? existing?.tpvDeliveryFee;
      const p = Number(raw);
      return Number.isFinite(p) && p >= 0 ? Math.round(p * 100) / 100 : 0;
    })(),
    tpvBrandIngredients: sanitizeTpvBrandIngredients(
      base.tpvBrandIngredients ?? existing?.tpvBrandIngredients,
    ),
    tpvBrandSupplements: sanitizeTpvBrandSupplementsFlat(
      base.tpvBrandSupplements ?? existing?.tpvBrandSupplements,
    ),
    tpvCategoryTemplates: sanitizeTpvCategoryTemplates(base.tpvCategoryTemplates ?? existing?.tpvCategoryTemplates),
    inventorySyncExcludedKeys: sanitizeInventorySyncExcludedKeys(
      base.inventorySyncExcludedKeys ?? existing?.inventorySyncExcludedKeys,
    ),
    createdAt: existing?.createdAt || now, updatedAt: now,
  };
}

function sanitizeInventorySyncExcludedKeys(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const key = String(entry || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= 500) break;
  }
  return out;
}

export function sanitizeStaffConsumptionConfig(raw) {
  const base = { ...DEFAULT_DELIVERY_CONFIG.staffConsumption, ...(raw && typeof raw === 'object' ? raw : {}) };
  const validModes = ['staff_price_field', 'percent_discount', 'same_as_public'];
  const pricingMode = validModes.includes(String(base.pricingMode || ''))
    ? String(base.pricingMode)
    : 'staff_price_field';
  return {
    enabled: base.enabled !== false,
    pricingMode,
    defaultDiscountPercent: Math.max(0, Math.min(100, Number(base.defaultDiscountPercent || 0))),
    eligibleCategories: Array.isArray(base.eligibleCategories)
      ? base.eligibleCategories.map((c) => String(c || '').trim()).filter(Boolean)
      : [],
    excludedCatalogItemIds: Array.isArray(base.excludedCatalogItemIds)
      ? [...new Set(base.excludedCatalogItemIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : [],
  };
}

export function resolveStaffUnitPrice(catalogItem, staffConsumptionConfig) {
  const publicPrice = Number(catalogItem?.unitPrice || 0);
  // Precio empleado explícito en el producto manda (TPV + cobro en caja).
  const rawStaff = catalogItem?.staffPrice;
  if (rawStaff !== undefined && rawStaff !== null && rawStaff !== '') {
    const staffPrice = Number(rawStaff);
    if (Number.isFinite(staffPrice) && staffPrice >= 0) {
      return Math.round(staffPrice * 100) / 100;
    }
  }
  const cfg = sanitizeStaffConsumptionConfig(staffConsumptionConfig);
  if (cfg.pricingMode === 'same_as_public') return Math.round(publicPrice * 100) / 100;
  if (cfg.pricingMode === 'percent_discount') {
    const pct = Number(cfg.defaultDiscountPercent || 0);
    return Math.round(publicPrice * (1 - pct / 100) * 100) / 100;
  }
  return Math.round(publicPrice * 100) / 100;
}

export function sanitizeDeliveryConfig(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'delivery_config', id: doc._id, user_id: doc.user_id,
    hasDineIn: Boolean(doc.hasDineIn), hasTakeaway: Boolean(doc.hasTakeaway),
    hasOwnDelivery: Boolean(doc.hasOwnDelivery), hasPlatformDelivery: Boolean(doc.hasPlatformDelivery),
    platforms: Array.isArray(doc.platforms) ? doc.platforms : [],
    hasPhysicalTables: Boolean(doc.hasPhysicalTables), tableCount: Number(doc.tableCount) || 0,
    hasKitchen: Boolean(doc.hasKitchen), hasAssemblyStation: Boolean(doc.hasAssemblyStation),
    hasCashRegister: Boolean(doc.hasCashRegister),
    defaultPrepTime: Number(doc.defaultPrepTime) || 20,
    maxKitchenCapacity: Number(doc.maxKitchenCapacity) || 15,
    delayThresholdMinutes: Number(doc.delayThresholdMinutes) || 30,
    kitchenSaturationThreshold: Number(doc.kitchenSaturationThreshold) || 10,
    cashCloseReminder: Boolean(doc.cashCloseReminder),
    cashCloseReminderTime: doc.cashCloseReminderTime || '23:00',
    activeChannels: Array.isArray(doc.activeChannels) ? doc.activeChannels : ['direct'],
    activeTimeSlots: Array.isArray(doc.activeTimeSlots) ? doc.activeTimeSlots : [],
    staffConsumption: sanitizeStaffConsumptionConfig(doc.staffConsumption),
    storeIngredients: sanitizeStoreIngredients(doc.storeIngredients),
    tpvDefaultExtraPrice: (() => {
      const p = Number(doc.tpvDefaultExtraPrice);
      return Number.isFinite(p) && p >= 0 ? Math.round(p * 100) / 100 : undefined;
    })(),
    tpvFreeSwapOnRemove: Boolean(doc.tpvFreeSwapOnRemove),
    tpvDeliveryFee: (() => {
      const p = Number(doc.tpvDeliveryFee);
      return Number.isFinite(p) && p >= 0 ? Math.round(p * 100) / 100 : 0;
    })(),
    tpvBrandIngredients: sanitizeTpvBrandIngredients(doc.tpvBrandIngredients),
    tpvBrandSupplements: sanitizeTpvBrandSupplementsFlat(doc.tpvBrandSupplements),
    tpvCategoryTemplates: sanitizeTpvCategoryTemplates(doc.tpvCategoryTemplates),
    inventorySyncExcludedKeys: sanitizeInventorySyncExcludedKeys(doc.inventorySyncExcludedKeys),
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
  };
}

// ─── DRIVERS (Repartidores) ──────────────────────────────────────────────────

export function buildDriverDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `driver-${uuidv4()}`;

  const validStatuses = ['active', 'offline', 'on_break', 'unavailable'];
  const status = validStatuses.includes(String(data.status || ''))
    ? String(data.status)
    : (existing?.status || 'active');

  const validVehicles = ['moto', 'coche', 'bicicleta', 'a_pie', 'otro'];
  const vehicleType = validVehicles.includes(String(data.vehicleType || ''))
    ? String(data.vehicleType)
    : (existing?.vehicleType || '');

  const zones = Array.isArray(data.zones) ? data.zones.map(String) : (existing?.zones || []);
  const existingStats = existing?.stats || {};

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'driver',
    id,
    user_id: userId,
    teamMemberId: String(data.teamMemberId || existing?.teamMemberId || ''),
    name: String(data.name || existing?.name || ''),
    phone: String(data.phone || existing?.phone || ''),
    email: String(data.email || existing?.email || ''),
    avatar: String(data.avatar || existing?.avatar || ''),
    status,
    zones,
    maxConcurrentOrders: Number(data.maxConcurrentOrders ?? existing?.maxConcurrentOrders ?? 3),
    vehicleType,
    currentLocation: data.currentLocation || existing?.currentLocation || null,
    stats: {
      totalDelivered: Number(data.stats?.totalDelivered ?? existingStats.totalDelivered ?? 0),
      averageDeliveryMinutes: Number(data.stats?.averageDeliveryMinutes ?? existingStats.averageDeliveryMinutes ?? 0),
      rating: data.stats?.rating != null ? Number(data.stats.rating) : (existingStats.rating ?? null),
    },
    isManager: Boolean(data.isManager ?? existing?.isManager ?? false),
    active: data.active != null ? Boolean(data.active) : (existing?.active ?? true),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeDriver(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'driver',
    id: doc._id,
    user_id: doc.user_id,
    teamMemberId: doc.teamMemberId || '',
    name: doc.name || '',
    phone: doc.phone || '',
    email: doc.email || '',
    avatar: doc.avatar || '',
    status: doc.status || 'offline',
    zones: Array.isArray(doc.zones) ? doc.zones : [],
    maxConcurrentOrders: Number(doc.maxConcurrentOrders || 3),
    vehicleType: doc.vehicleType || '',
    currentLocation: doc.currentLocation || null,
    stats: {
      totalDelivered: Number(doc.stats?.totalDelivered || 0),
      averageDeliveryMinutes: Number(doc.stats?.averageDeliveryMinutes || 0),
      rating: doc.stats?.rating ?? null,
    },
    isManager: Boolean(doc.isManager),
    active: doc.active !== false,
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listDriversByUser(req, userId) {
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'driver' && !doc?.deletedAt && (!userId || doc?.user_id === userId))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

// ─── REPARTO CONFIG ──────────────────────────────────────────────────────────

export function buildRepartoConfigDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `reparto_config:${userId}`;

  const validModes = ['load', 'proximity', 'hybrid'];
  const autoAssignMode = validModes.includes(String(data.autoAssignMode || ''))
    ? String(data.autoAssignMode)
    : (existing?.autoAssignMode || 'load');

  const zones = Array.isArray(data.zones) ? data.zones.map(z => ({
    id: String(z.id || `zone-${uuidv4().slice(0, 8)}`),
    name: String(z.name || ''),
    postalCodes: Array.isArray(z.postalCodes) ? z.postalCodes.map(String) : [],
    baseDeliveryMinutes: Number(z.baseDeliveryMinutes ?? 20),
    surcharge: Number(z.surcharge ?? 0),
  })) : (existing?.zones || []);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'reparto_config',
    user_id: userId,
    autoAssign: Boolean(data.autoAssign ?? existing?.autoAssign ?? false),
    autoAssignMode,
    autoAssignOnAssemblyComplete: Boolean(data.autoAssignOnAssemblyComplete ?? existing?.autoAssignOnAssemblyComplete ?? false),
    maxOrdersPerDriver: Number(data.maxOrdersPerDriver ?? existing?.maxOrdersPerDriver ?? 3),
    alertDelayMinutes: Number(data.alertDelayMinutes ?? existing?.alertDelayMinutes ?? 10),
    alertDeliveryDelayMinutes: Number(data.alertDeliveryDelayMinutes ?? existing?.alertDeliveryDelayMinutes ?? 45),
    zones,
    estimatedMinutesPerKm: Number(data.estimatedMinutesPerKm ?? existing?.estimatedMinutesPerKm ?? 3),
    basePreparationMinutes: Number(data.basePreparationMinutes ?? existing?.basePreparationMinutes ?? 5),
    ownDeliveryEnabled: Boolean(data.ownDeliveryEnabled ?? existing?.ownDeliveryEnabled ?? false),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeRepartoConfig(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'reparto_config',
    user_id: doc.user_id,
    autoAssign: Boolean(doc.autoAssign),
    autoAssignMode: doc.autoAssignMode || 'load',
    autoAssignOnAssemblyComplete: Boolean(doc.autoAssignOnAssemblyComplete),
    maxOrdersPerDriver: Number(doc.maxOrdersPerDriver || 3),
    alertDelayMinutes: Number(doc.alertDelayMinutes || 10),
    alertDeliveryDelayMinutes: Number(doc.alertDeliveryDelayMinutes || 45),
    zones: Array.isArray(doc.zones) ? doc.zones : [],
    estimatedMinutesPerKm: Number(doc.estimatedMinutesPerKm || 3),
    basePreparationMinutes: Number(doc.basePreparationMinutes || 5),
    ownDeliveryEnabled: Boolean(doc.ownDeliveryEnabled),
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
  };
}

// ─── DRIVER CASH SESSIONS ─────────────────────────────────────────────────────

export function buildDriverCashSessionDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `dcash-${uuidv4()}`;

  const transactions = Array.isArray(data.transactions) ? data.transactions : (existing?.transactions || []);
  const status = ['open', 'pending_review', 'closed'].includes(String(data.status || '')) ? String(data.status) : (existing?.status || 'open');

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'driver_cash_session',
    id,
    user_id: userId,
    driverName: String(data.driverName || existing?.driverName || ''),
    driverUserId: data.driverUserId || existing?.driverUserId || '',
    status,
    initialFloat: Number(data.initialFloat ?? existing?.initialFloat ?? 0),
    openedAt: existing?.openedAt || now,
    closedAt: (status === 'closed' || status === 'pending_review') ? (data.closedAt || existing?.closedAt || now) : '',
    transactions,
    expectedCash: Number(data.expectedCash ?? existing?.expectedCash ?? 0),
    actualCash: Number(data.actualCash ?? existing?.actualCash ?? 0),
    difference: Number(data.difference ?? existing?.difference ?? 0),
    closingNotes: String(data.closingNotes ?? existing?.closingNotes ?? ''),
    reviewedBy: data.reviewedBy || existing?.reviewedBy || '',
    reviewedAt: data.reviewedAt || existing?.reviewedAt || '',
    reviewNotes: data.reviewNotes || existing?.reviewNotes || '',
    reopenHistory: Array.isArray(data.reopenHistory) ? data.reopenHistory : (existing?.reopenHistory || []),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeDriverCashSession(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'driver_cash_session',
    id: doc._id,
    user_id: doc.user_id,
    driverName: doc.driverName || '',
    driverUserId: doc.driverUserId || '',
    status: doc.status || 'open',
    initialFloat: Number(doc.initialFloat || 0),
    openedAt: doc.openedAt || '',
    closedAt: doc.closedAt || '',
    transactions: Array.isArray(doc.transactions) ? doc.transactions : [],
    expectedCash: Number(doc.expectedCash || 0),
    actualCash: Number(doc.actualCash || 0),
    difference: Number(doc.difference || 0),
    closingNotes: doc.closingNotes || '',
    reviewedBy: doc.reviewedBy || '',
    reviewedAt: doc.reviewedAt || '',
    reviewNotes: doc.reviewNotes || '',
    reopenHistory: Array.isArray(doc.reopenHistory) ? doc.reopenHistory : [],
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listDriverCashSessionsByUser(req, userId, options = {}) {
  const uid = String(userId || '').trim();
  const dateFrom = String(options?.dateFrom || '').trim();
  const dateTo = String(options?.dateTo || '').trim();
  const maxDocs = Math.min(Math.max(1, Number(options?.maxDocs) || 5_000), 5_000);
  const includeOpen = Boolean(options?.includeOpen);
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  await ensureDeliveryTypeUserIndex(req, db);

  const baseSelector = uid
    ? { type: 'driver_cash_session', user_id: uid }
    : { type: 'driver_cash_session' };

  const keep = (doc) =>
    doc?.type === 'driver_cash_session'
    && !doc?.deletedAt
    && (!uid || doc?.user_id === uid);

  const inWindow = (doc) => {
    const ts = String(doc?.createdAt || doc?.openedAt || '');
    if (dateFrom && ts && ts < dateFrom) return false;
    if (dateTo && ts && ts > dateTo) return false;
    return true;
  };

  if (dateFrom || includeOpen) {
    const lookback = dateFrom || (() => {
      const dt = new Date();
      dt.setUTCDate(dt.getUTCDate() - 7);
      return dt.toISOString();
    })();
    const createdAt = dateTo
      ? { $gte: lookback, $lte: dateTo }
      : { $gte: lookback };
    const queries = [
      findDocuments(
        req,
        db,
        { ...baseSelector, createdAt },
        { pageSize: 200, maxDocs: Math.min(maxDocs, 600) },
      ).catch(() => []),
    ];
    if (includeOpen) {
      queries.push(
        findDocuments(
          req,
          db,
          { ...baseSelector, status: 'open' },
          { pageSize: 50, maxDocs: 80 },
        ).catch(() => []),
      );
    }
    const chunks = await Promise.all(queries);
    const byId = new Map();
    for (const doc of chunks.flat()) {
      if (keep(doc) && doc._id && (includeOpen && doc.status === 'open' ? true : inWindow(doc))) {
        byId.set(doc._id, doc);
      }
    }
    return [...byId.values()].sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
    );
  }

  let docs;
  try {
    docs = await findDocuments(req, db, baseSelector, { pageSize: 500, maxDocs });
  } catch {
    const all = await getDeliveryDatabaseDocumentsInflight(req);
    docs = all.filter(
      (doc) => doc?.type === 'driver_cash_session' && (!uid || doc?.user_id === uid),
    );
  }

  return docs
    .filter(keep)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

/** Caja CEO: TPV + reparto por Mango (sin _all_docs del delivery DB entero). */
export async function listCajaDataByUser(req, userId, options = {}) {
  const dateFrom = String(options?.dateFrom || '').trim();
  const dateTo = String(options?.dateTo || '').trim();
  const full = Boolean(options?.full);
  const maxDocs = Math.min(Math.max(1, Number(options?.maxDocs) || (full ? 800 : 400)), 5_000);
  // Por defecto (pantalla Caja): ventana del día + abiertas/pendientes. full=export por trozos.
  const range = {
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };
  const tpvOpts = full
    ? { ...range, maxDocs }
    : { opsLite: true, ...range, maxDocs };
  const driverOpts = full
    ? { ...range, maxDocs }
    : { includeOpen: true, ...range, maxDocs };
  const [tpvSessions, driverSessions] = await Promise.all([
    listTpvRegisterSessionsByUser(req, userId, tpvOpts),
    listDriverCashSessionsByUser(req, userId, driverOpts),
  ]);
  return { tpvSessions, driverSessions };
}

// ─── POINTS OF SALE ───────────────────────────────────────────────────────────

function sanitizePrinterConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const connectionType = ['network', 'system', 'browser'].includes(raw.connectionType)
    ? raw.connectionType
    : 'browser';
  return {
    connectionType,
    networkHost: String(raw.networkHost || ''),
    networkPort: Number(raw.networkPort || 9100) || 9100,
    systemPrinterName: String(raw.systemPrinterName || ''),
    bridgeHost: String(raw.bridgeHost || ''),
    paperWidthMm: raw.paperWidthMm === 58 ? 58 : 80,
    preferBridge: raw.preferBridge !== false,
  };
}

/** Una vez hay impresora de red en el PDV, no se borra con payloads vacíos/nulos. */
function resolvePrinterConfigField(data, existing) {
  const existingCfg = existing?.printerConfig
    ? sanitizePrinterConfig(existing.printerConfig)
    : null;
  const existingHost = String(existingCfg?.networkHost || '').trim();

  if (!Object.prototype.hasOwnProperty.call(data || {}, 'printerConfig')) {
    return existingCfg ? { printerConfig: existingCfg } : {};
  }

  const next = sanitizePrinterConfig(data.printerConfig);
  if (!next) {
    return existingCfg ? { printerConfig: existingCfg } : {};
  }

  const nextHost = String(next.networkHost || '').trim();
  if (next.connectionType === 'network' && nextHost) {
    return { printerConfig: next };
  }
  if (next.connectionType === 'system' && String(next.systemPrinterName || '').trim()) {
    return { printerConfig: next };
  }
  // No sustituir una IP de tienda ya guardada por browser/vacío.
  if (existingCfg && existingCfg.connectionType === 'network' && existingHost) {
    return { printerConfig: existingCfg };
  }
  return { printerConfig: next };
}

function mapPointOfSaleTerminal(t) {
  const out = {
    id: String(t.id || `term-${uuidv4().slice(0, 8)}`),
    code: String(t.code || ''),
    name: String(t.name || ''),
    datafonName: String(t.datafonName || ''),
    printerName: String(t.printerName || ''),
    active: t.active !== false,
  };
  const rawCfg = Object.prototype.hasOwnProperty.call(t || {}, 'printerConfig')
    ? t.printerConfig
    : t?.printerConfig;
  if (rawCfg) {
    const cfg = sanitizePrinterConfig(rawCfg);
    if (cfg) {
      const host = String(cfg.networkHost || '').trim();
      const systemName = String(cfg.systemPrinterName || '').trim();
      // No persistir config de red vacía: en el TPV tapa la impresora de la tienda.
      if (cfg.connectionType === 'network') {
        if (host) out.printerConfig = cfg;
      } else if (cfg.connectionType === 'system') {
        if (systemName) out.printerConfig = cfg;
      } else {
        out.printerConfig = cfg;
      }
    }
  }
  return out;
}

export function buildPointOfSaleDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `pdv-${uuidv4()}`;
  const terminals = Array.isArray(data.terminals)
    ? data.terminals.map(mapPointOfSaleTerminal)
    : existing?.terminals || [];

  const terminalCode = String(
    data.terminalCode || existing?.terminalCode || generateTerminalCode(),
  ).trim().toUpperCase();

  const businessId = normalizeBusinessScopeId(
    data.businessId || data.business_id || existing?.businessId || existing?.business_id,
  );

  const hasDevicesInData = Object.prototype.hasOwnProperty.call(data, 'tpvAllowedDevices');
  const hasDevicesInExisting = Object.prototype.hasOwnProperty.call(existing || {}, 'tpvAllowedDevices');
  const tpvAllowedDevices = hasDevicesInData
    ? (Array.isArray(data.tpvAllowedDevices) ? data.tpvAllowedDevices : [])
    : hasDevicesInExisting
      ? (Array.isArray(existing.tpvAllowedDevices) ? existing.tpvAllowedDevices : [])
      : undefined;

  const hasInvoiceCfg = Object.prototype.hasOwnProperty.call(data, 'supplierInvoiceConfig');
  let supplierInvoiceConfig = hasInvoiceCfg
    ? data.supplierInvoiceConfig
    : existing?.supplierInvoiceConfig;
  // Si el cliente manda la máscara ••••••••, conservar la contraseña real ya guardada.
  if (
    supplierInvoiceConfig
    && typeof supplierInvoiceConfig === 'object'
    && String(supplierInvoiceConfig.imapPassword || '') === '••••••••'
    && existing?.supplierInvoiceConfig
    && typeof existing.supplierInvoiceConfig === 'object'
  ) {
    supplierInvoiceConfig = {
      ...existing.supplierInvoiceConfig,
      ...supplierInvoiceConfig,
      imapPassword: existing.supplierInvoiceConfig.imapPassword || '',
    };
  }

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'point_of_sale',
    id,
    user_id: userId,
    workCenterId: String(data.workCenterId || existing?.workCenterId || ''),
    name: String(data.name || existing?.name || ''),
    code: String(data.code || existing?.code || ''),
    terminalCode,
    address: String(data.address || existing?.address || ''),
    ...(businessId ? { businessId, business_id: businessId } : {}),
    terminals,
    ...resolvePrinterConfigField(data, existing),
    ...(tpvAllowedDevices !== undefined ? { tpvAllowedDevices } : {}),
    ...(supplierInvoiceConfig !== undefined ? { supplierInvoiceConfig } : {}),
    active: data.active !== undefined ? Boolean(data.active) : (existing?.active !== false),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizePointOfSale(doc) {
  if (!doc) return null;
  const businessId = normalizeBusinessScopeId(doc.businessId || doc.business_id);
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'point_of_sale',
    id: doc._id,
    user_id: doc.user_id,
    workCenterId: doc.workCenterId || '',
    name: doc.name || '',
    code: doc.code || '',
    terminalCode: String(doc.terminalCode || '').trim().toUpperCase(),
    address: doc.address || '',
    ...(businessId ? { businessId, business_id: businessId } : {}),
    terminals: Array.isArray(doc.terminals)
      ? doc.terminals.map((t) => ({
          id: t.id || '',
          code: t.code || '',
          name: t.name || '',
          datafonName: t.datafonName || '',
          printerName: t.printerName || '',
          ...(t.printerConfig ? { printerConfig: sanitizePrinterConfig(t.printerConfig) } : {}),
          active: t.active !== false,
        }))
      : [],
    ...(doc.printerConfig ? { printerConfig: sanitizePrinterConfig(doc.printerConfig) } : {}),
    ...(Object.prototype.hasOwnProperty.call(doc, 'tpvAllowedDevices')
      ? { tpvAllowedDevices: Array.isArray(doc.tpvAllowedDevices) ? doc.tpvAllowedDevices : [] }
      : {}),
    ...(doc.supplierInvoiceConfig && typeof doc.supplierInvoiceConfig === 'object'
      ? {
          supplierInvoiceConfig: {
            ...doc.supplierInvoiceConfig,
            imapPassword: doc.supplierInvoiceConfig.imapPassword ? '••••••••' : '',
          },
        }
      : {}),
    active: doc.active !== false,
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

function pickNewerPointOfSaleDoc(a, b) {
  return String(b.updatedAt || b.createdAt || '') >= String(a.updatedAt || a.createdAt || '') ? b : a;
}

/** Un PDV por `workCenterId` (incluye inactivos); huérfanos por nombre. Para Ajustes → Tiendas. */
export function dedupeLinkedPointsOfSale(docs) {
  if (!Array.isArray(docs)) return [];
  const byWc = new Map();
  const byName = new Map();
  const rest = [];

  for (const p of docs) {
    if (!p || p.deletedAt) continue;
    const wcId = String(p.workCenterId || '').trim();
    const nameKey = String(p.name || '').trim().toLowerCase();
    if (wcId) {
      const prev = byWc.get(wcId);
      byWc.set(wcId, prev ? pickNewerPointOfSaleDoc(prev, p) : p);
      continue;
    }
    if (nameKey) {
      const prev = byName.get(nameKey);
      byName.set(nameKey, prev ? pickNewerPointOfSaleDoc(prev, p) : p);
      continue;
    }
    rest.push(p);
  }

  const linkedNames = new Set(
    [...byWc.values()].map((p) => String(p.name || '').trim().toLowerCase()).filter(Boolean),
  );
  const orphanByName = [...byName.values()].filter(
    (p) => !linkedNames.has(String(p.name || '').trim().toLowerCase()),
  );

  const byId = new Map();
  for (const p of [...byWc.values(), ...orphanByName, ...rest]) {
    const id = String(p._id || '').trim();
    if (!id) continue;
    const prev = byId.get(id);
    byId.set(id, prev ? pickNewerPointOfSaleDoc(prev, p) : p);
  }
  return [...byId.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

/** Un PDV activo por `workCenterId`; huérfanos por nombre (misma regla que el front). */
export function dedupeActivePointsOfSale(docs) {
  if (!Array.isArray(docs)) return [];
  const byWc = new Map();
  const byName = new Map();
  const rest = [];

  for (const p of docs) {
    if (!p || p.deletedAt || p.active === false) continue;
    const wcId = String(p.workCenterId || '').trim();
    const nameKey = String(p.name || '').trim().toLowerCase();
    if (wcId) {
      const prev = byWc.get(wcId);
      byWc.set(wcId, prev ? pickNewerPointOfSaleDoc(prev, p) : p);
      continue;
    }
    if (nameKey) {
      const prev = byName.get(nameKey);
      byName.set(nameKey, prev ? pickNewerPointOfSaleDoc(prev, p) : p);
      continue;
    }
    rest.push(p);
  }

  const linkedNames = new Set(
    [...byWc.values()].map((p) => String(p.name || '').trim().toLowerCase()).filter(Boolean),
  );
  const orphanByName = [...byName.values()].filter(
    (p) => !linkedNames.has(String(p.name || '').trim().toLowerCase()),
  );

  const byId = new Map();
  for (const p of [...byWc.values(), ...orphanByName, ...rest]) {
    const id = String(p._id || '').trim();
    if (!id) continue;
    const prev = byId.get(id);
    byId.set(id, prev ? pickNewerPointOfSaleDoc(prev, p) : p);
  }
  return [...byId.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export function findActivePointOfSaleForWorkCenter(docs, workCenterId) {
  const wcId = String(workCenterId || '').trim();
  if (!wcId) return null;
  let match = null;
  for (const p of docs) {
    if (!p || p.deletedAt || p.active === false) continue;
    if (String(p.workCenterId || '').trim() !== wcId) continue;
    match = match ? pickNewerPointOfSaleDoc(match, p) : p;
  }
  return match;
}

export function findOrphanPointOfSaleByName(docs, name) {
  const nameKey = String(name || '').trim().toLowerCase();
  if (!nameKey) return null;
  let match = null;
  for (const p of docs) {
    if (!p || p.deletedAt || p.active === false) continue;
    if (String(p.workCenterId || '').trim()) continue;
    if (String(p.name || '').trim().toLowerCase() !== nameKey) continue;
    match = match ? pickNewerPointOfSaleDoc(match, p) : p;
  }
  return match;
}

export async function listPointsOfSaleByUser(req, userId) {
  const uid = String(userId || '').trim();
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  await ensureDeliveryTypeUserIndex(req, db);

  // Mango por type+user_id: no _all_docs de toda la DB delivery compartida.
  let docs;
  try {
    const selector = uid
      ? { type: 'point_of_sale', user_id: uid }
      : { type: 'point_of_sale' };
    docs = await findDocuments(req, db, selector, { pageSize: 500, maxDocs: 10_000 });
  } catch {
    docs = await getAllDocuments(req, db);
  }

  return docs
    .filter(
      (doc) =>
        doc?.type === 'point_of_sale' &&
        !doc?.deletedAt &&
        (!uid || workCenterDocMatchesUser(doc, uid)),
    )
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

/**
 * PDV con workCenterId muerto o vacío → reenlaza al WC retail vivo
 * con mismo businessId + nombre (bodegeta/tiana/badalona, etc.).
 */
export async function rematchOrphanPointOfSaleWorkCenters(req, userId, pdvs) {
  const list = Array.isArray(pdvs) ? pdvs : [];
  if (list.length === 0) return list;

  const wcDb = getWorkCentersDbName();
  await ensureDatabase(req, wcDb);
  const wcDocs = await getAllDocuments(req, wcDb);
  const retailWcs = wcDocs.filter(
    (d) =>
      d?.type === 'sales_point' &&
      !d?.deletedAt &&
      isRetailWorkCenterDoc(d) &&
      workCenterDocMatchesUser(d, userId),
  );
  const liveWcIds = new Set(
    retailWcs.map((w) => String(w._id || '').trim()).filter(Boolean),
  );

  const byBidName = new Map();
  for (const wc of retailWcs) {
    const bid = normalizeBusinessScopeId(wc.businessId || wc.business_id);
    const nameKey = String(wc.name || '').trim().toLowerCase();
    if (!bid || !nameKey) continue;
    const key = `${bid}::${nameKey}`;
    const prev = byBidName.get(key);
    if (!prev) {
      byBidName.set(key, wc);
      continue;
    }
    const ta = new Date(prev.createdAt || 0).getTime();
    const tb = new Date(wc.createdAt || 0).getTime();
    if (tb < ta || (tb === ta && String(wc._id) < String(prev._id))) {
      byBidName.set(key, wc);
    }
  }

  const deliveryDb = getDeliveryDbName();
  await ensureDatabase(req, deliveryDb);
  const out = [];

  for (const p of list) {
    if (!p || p.deletedAt) {
      out.push(p);
      continue;
    }
    const curWc = String(p.workCenterId || '').trim();
    if (curWc && liveWcIds.has(curWc)) {
      const linkedWc = retailWcs.find((w) => String(w._id || '').trim() === curWc);
      const wcBid = normalizeBusinessScopeId(linkedWc?.businessId || linkedWc?.business_id);
      const pBid = normalizeBusinessScopeId(p.businessId || p.business_id);
      if (wcBid && !pBid) {
        const tagged = {
          ...p,
          businessId: wcBid,
          business_id: wcBid,
          updatedAt: new Date().toISOString(),
        };
        try {
          const saved = await putDocument(req, deliveryDb, tagged._id, tagged);
          out.push({ ...tagged, _rev: saved?.rev || tagged._rev });
        } catch {
          out.push(tagged);
        }
        continue;
      }
      out.push(p);
      continue;
    }
    const bid = normalizeBusinessScopeId(p.businessId || p.business_id);
    const nameKey = String(p.name || '').trim().toLowerCase();
    let match = bid && nameKey ? byBidName.get(`${bid}::${nameKey}`) : null;
    // Local / legacy: PDV sin businessId → único WC retail con el mismo nombre.
    if (!match && nameKey) {
      const sameName = retailWcs.filter(
        (w) => String(w.name || '').trim().toLowerCase() === nameKey,
      );
      if (sameName.length === 1) match = sameName[0];
      else if (bid) {
        const sameBid = sameName.filter(
          (w) => normalizeBusinessScopeId(w.businessId || w.business_id) === bid,
        );
        if (sameBid.length === 1) match = sameBid[0];
      }
    }
    if (!match) {
      out.push(p);
      continue;
    }
    const nextBid =
      bid || normalizeBusinessScopeId(match.businessId || match.business_id);
    const next = {
      ...p,
      workCenterId: match._id,
      ...(nextBid ? { businessId: nextBid, business_id: nextBid } : {}),
      updatedAt: new Date().toISOString(),
    };
    try {
      const saved = await putDocument(req, deliveryDb, next._id, next);
      out.push({ ...next, _rev: saved?.rev || next._rev });
    } catch {
      out.push(next);
    }
  }

  return out;
}

/** Listado API/Ops: rematch huérfanos + scope por WC (y etiquetados si includeInactive). */
export async function listPointsOfSaleForApi(req, userId, options = {}) {
  const includeInactive = options.includeInactive === true;
  const rematched = await rematchOrphanPointOfSaleWorkCenters(
    req,
    userId,
    await listPointsOfSaleByUser(req, userId),
  );
  const all = includeInactive
    ? dedupeLinkedPointsOfSale(rematched)
    : dedupeActivePointsOfSale(rematched);
  const workCenterIds = await listActiveWorkCenterIds(req);
  const linked = filterPointsOfSaleLinkedToWorkCenters(all, workCenterIds);
  if (!includeInactive) return linked;

  const linkedIds = new Set(linked.map((p) => p._id));
  const taggedOrphans = all.filter(
    (p) =>
      p &&
      !linkedIds.has(p._id) &&
      Boolean(normalizeBusinessScopeId(p.businessId || p.business_id)),
  );
  return [...linked, ...taggedOrphans];
}

/** IDs de centros de trabajo retail existentes (no borrados). */
export async function listActiveWorkCenterIds(req) {
  const db = getWorkCentersDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return new Set(
    docs
      .filter((d) => d?.type === 'sales_point' && !d?.deletedAt)
      .map((d) => String(d._id || '').trim())
      .filter(Boolean),
  );
}

function normalizeBusinessScopeId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

/** Compras/facturas: aislar por empresa (multi-cuenta en mismo user_id). */
function filterCatalogDocsByBusinessScope(docs, businessId, accountBusinessCount = 1) {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return docs;
  const n = Math.max(1, Number(accountBusinessCount) || 1);
  return (docs || []).filter((doc) => {
    const docBid = normalizeBusinessScopeId(doc?.businessId || doc?.business_id || '');
    if (!docBid) return n <= 1;
    return docBid === bid;
  });
}

function normalizeAccountUserId(value) {
  const v = String(value || '').trim();
  return v.startsWith('account:') ? v.slice('account:'.length) : v;
}

function workCenterDocMatchesUser(doc, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return true;
  const docUser = String(doc?.user_id || '').trim();
  if (!docUser) return true;
  return docUser === uid || normalizeAccountUserId(docUser) === normalizeAccountUserId(uid);
}

export function pdvDocMatchesUser(doc, userId) {
  return workCenterDocMatchesUser(doc, userId);
}

export function catalogDocMatchesUser(doc, userId) {
  return workCenterDocMatchesUser(doc, userId);
}

function isRetailWorkCenterDoc(doc) {
  const t = String(doc?.centerType || '').trim();
  return t === 'punto_de_venta' || t === 'almacen';
}

/** Misma lógica que el login tablet: empresa del WC o, si falta, la del titular del PDV. */
export async function resolveBusinessDocumentForPointOfSale(req, pdv) {
  const pdvOwner = normalizeAccountUserId(pdv?.user_id);
  if (!pdvOwner) return null;

  const owned = (await listAllBusinesses(req)).filter(
    (b) => !b?.deletedAt && normalizeAccountUserId(b.owner_user_id) === pdvOwner,
  );
  if (owned.length === 0) return null;

  const wcId = String(pdv?.workCenterId || '').trim();
  const wc = wcId ? await findWorkCenterById(req, wcId) : null;
  const fromWc = normalizeBusinessScopeId(wc?.businessId || wc?.business_id);
  if (fromWc) {
    const business = owned.find((b) => normalizeBusinessScopeId(b.business_id) === fromWc);
    if (business) return business;
    const byId = await findBusinessById(req, fromWc);
    if (byId && !byId.deletedAt) return byId;
  }

  if (owned.length === 1) return owned[0];

  const label = String(wc?.name || pdv?.name || '').trim().toLowerCase();
  if (label) {
    const exact = owned.find((b) => String(b.name || '').trim().toLowerCase() === label);
    if (exact) return exact;
    const partial = owned.find((b) => {
      const bn = String(b.name || '').trim().toLowerCase();
      return bn && (label.includes(bn) || bn.includes(label));
    });
    if (partial) return partial;
  }

  if (wcId) {
    for (const business of owned) {
      const bid = normalizeBusinessScopeId(business.business_id);
      const wcIds = await listWorkCenterIdsForBusiness(req, pdv.user_id, bid);
      if (wcIds.has(wcId)) return business;
    }
  }

  return owned[0] || null;
}

export async function resolveBusinessIdForPointOfSale(req, pdv) {
  const business = await resolveBusinessDocumentForPointOfSale(req, pdv);
  return normalizeBusinessScopeId(business?.business_id);
}

export async function listOwnerBusinessesForUser(req, userId) {
  const uid = normalizeAccountUserId(userId);
  if (!uid) return [];
  const all = await listAllBusinesses(req);
  return all.filter(
    (b) => !b?.deletedAt && normalizeAccountUserId(b.owner_user_id) === uid,
  );
}

/**
 * Tiendas retail antiguas sin `businessId` en CouchDB: Ajustes las muestra en cuentas
 * de una sola empresa, pero el scope estricto del TPV las excluía.
 */
export async function repairWorkCenterBusinessScopeForPdv(req, userId, pdvDoc, targetBusinessId) {
  const bid = normalizeBusinessScopeId(targetBusinessId);
  const wcId = String(pdvDoc?.workCenterId || '').trim();
  if (!bid || !wcId) return false;

  const wc = await findWorkCenterById(req, wcId);
  if (!wc || !workCenterDocMatchesUser(wc, userId)) return false;

  const current = normalizeBusinessScopeId(wc.businessId || wc.business_id);
  if (current === bid) return true;

  const owned = await listOwnerBusinessesForUser(req, userId);
  const canRepair =
    !current &&
    (owned.some((b) => normalizeBusinessScopeId(b.business_id) === bid) ||
      pdvDocMatchesUser(pdvDoc, userId));
  const canRetag =
    current &&
    owned.length === 1 &&
    normalizeBusinessScopeId(owned[0].business_id) === bid;
  // PDV/WC mal enlazado a vertical no-TPV (p. ej. realEstate) mientras el TPV
  // opera en delivery/restaurante: retiquetear aunque haya varias empresas.
  let canRetagCrossVertical = false;
  if (current && current !== bid && !canRetag) {
    const targetOwned = owned.some((b) => normalizeBusinessScopeId(b.business_id) === bid);
    if (targetOwned || pdvDocMatchesUser(pdvDoc, userId)) {
      const [curBiz, tgtBiz] = await Promise.all([
        findBusinessById(req, current).catch(() => null),
        findBusinessById(req, bid).catch(() => null),
      ]);
      const opsTypes = new Set(['delivery', 'restaurant', 'iceCreamShop', 'butcherShop']);
      const curOps = opsTypes.has(String(curBiz?.businessType || '').trim());
      const tgtOps = opsTypes.has(String(tgtBiz?.businessType || '').trim());
      canRetagCrossVertical = tgtOps && !curOps;
    }
  }
  if (!canRepair && !canRetag && !canRetagCrossVertical) return false;

  const db = getWorkCentersDbName();
  await ensureDatabase(req, db);
  await putDocument(req, db, wc._id, {
    ...wc,
    businessId: bid,
    business_id: bid,
    updatedAt: new Date().toISOString(),
  });
  return true;
}

/** Acepta el PDV de la tablet si pertenece al titular de la empresa (aunque el scope estricto falle). */
export async function acceptPointOfSaleInBusinessScope(req, userId, pdvDoc, businessId) {
  const bid = normalizeBusinessScopeId(businessId);
  const pdvId = String(pdvDoc?._id || '').trim();
  if (!bid || !pdvId || !pdvDocMatchesUser(pdvDoc, userId)) return null;

  const owned = await listOwnerBusinessesForUser(req, userId);
  let business = owned.find((b) => normalizeBusinessScopeId(b.business_id) === bid);
  if (!business) {
    const all = await listAllBusinesses(req);
    business = all.find((b) => !b?.deletedAt && normalizeBusinessScopeId(b.business_id) === bid) || null;
    if (!business || !pdvDocMatchesUser(pdvDoc, userId)) return null;
  } else if (
    normalizeAccountUserId(pdvDoc.user_id) !== normalizeAccountUserId(business.owner_user_id) &&
    !pdvDocMatchesUser(pdvDoc, userId)
  ) {
    return null;
  }

  const scopedPdvs = await listScopedPointsOfSaleForBusiness(req, userId, bid);
  const scopedPdvIds = new Set(scopedPdvs.map((p) => p._id));
  if (!scopedPdvIds.has(pdvId)) {
    const wcId = String(pdvDoc.workCenterId || '').trim();
    if (wcId) {
      const wc = await findWorkCenterById(req, wcId);
      if (!wc || !workCenterDocMatchesUser(wc, userId)) return null;
    } else {
      const pdvName = String(pdvDoc.name || '').trim().toLowerCase();
      const bizName = String(business.name || '').trim().toLowerCase();
      const nameMatches =
        pdvName &&
        bizName &&
        (pdvName === bizName || pdvName.includes(bizName) || bizName.includes(pdvName));
      if (!nameMatches && owned.length !== 1) return null;
    }
    scopedPdvIds.add(pdvId);
  }

  return { businessId: bid, scopedPdvIds };
}

/** Centros de trabajo de una empresa (Ajustes → Tiendas). */
export async function listWorkCenterIdsForBusiness(req, userId, businessId) {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return new Set();
  const db = getWorkCentersDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  const ids = new Set();
  const legacyRetail = [];
  const owned = await listOwnerBusinessesForUser(req, userId);
  const business = owned.find((b) => normalizeBusinessScopeId(b.business_id) === bid);
  const bizName = String(business?.name || '').trim().toLowerCase();

  for (const d of docs) {
    if (d?.type !== 'sales_point' || d?.deletedAt) continue;
    if (!workCenterDocMatchesUser(d, userId)) continue;
    const wb = normalizeBusinessScopeId(d.businessId || d.business_id);
    const id = String(d._id || '').trim();
    if (!id) continue;
    if (wb === bid) {
      ids.add(id);
      continue;
    }
    if (!wb && isRetailWorkCenterDoc(d)) {
      legacyRetail.push({ id, name: String(d.name || '') });
    }
  }

  if (legacyRetail.length > 0 && bizName) {
    for (const legacy of legacyRetail) {
      const wcName = legacy.name.trim().toLowerCase();
      if (wcName === bizName || wcName.includes(bizName) || bizName.includes(wcName)) {
        ids.add(legacy.id);
      }
    }
  }

  if (ids.size === 0 && legacyRetail.length > 0) {
    if (owned.length === 1 && normalizeBusinessScopeId(owned[0].business_id) === bid) {
      for (const legacy of legacyRetail) ids.add(legacy.id);
    }
  }

  return ids;
}

/** PDV de caja enlazados solo a centros de la empresa indicada. */
export async function listScopedPointsOfSaleForBusiness(req, userId, businessId, options = {}) {
  const wcIds = await listWorkCenterIdsForBusiness(req, userId, businessId);
  if (wcIds.size === 0) return [];
  const includeInactive = options.includeInactive === true;
  const rematched = await rematchOrphanPointOfSaleWorkCenters(
    req,
    userId,
    await listPointsOfSaleByUser(req, userId),
  );
  const pdvs = includeInactive
    ? dedupeLinkedPointsOfSale(rematched)
    : dedupeActivePointsOfSale(rematched);
  return filterPointsOfSaleLinkedToWorkCenters(pdvs, wcIds);
}

/** Solo PDV enlazados a un centro que sigue existiendo (como en Ajustes → Tienda). */
export function filterPointsOfSaleLinkedToWorkCenters(pdvs, workCenterIds) {
  const ids = workCenterIds instanceof Set ? workCenterIds : new Set(workCenterIds);
  return (Array.isArray(pdvs) ? pdvs : []).filter((p) => {
    const wcId = String(p.workCenterId || '').trim();
    return wcId && ids.has(wcId);
  });
}

export function findOrphanPointsOfSale(pdvs, workCenterIds) {
  const linkedIds = new Set(
    filterPointsOfSaleLinkedToWorkCenters(pdvs, workCenterIds).map((p) => p._id),
  );
  return (Array.isArray(pdvs) ? pdvs : []).filter(
    (p) => p && !p.deletedAt && !linkedIds.has(p._id),
  );
}

/** PDV activos enlazados a un centro existente (fuente única para listados operativos). */
export async function listScopedPointsOfSaleForUser(req, userId) {
  return listPointsOfSaleForApi(req, userId, { includeInactive: false });
}

export async function findWorkCenterById(req, workCenterId) {
  const wcId = String(workCenterId || '').trim();
  if (!wcId) return null;
  const db = getWorkCentersDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, wcId);
  if (!doc || doc.type !== 'sales_point' || doc.deletedAt) return null;
  return doc;
}

export async function findPointOfSaleByTerminalCode(req, terminalCode, excludePdvId = '') {
  const resolved = await resolveTerminalLoginCode(req, terminalCode, excludePdvId);
  return resolved?.pdv || null;
}

/** Resuelve código tablet (PDV) o código de terminal sala (SALA-*). */
export async function resolveTerminalLoginCode(req, terminalCode, excludePdvId = '') {
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return resolveTerminalLoginFromDocs(docs, terminalCode, excludePdvId);
}

export async function findTeamMemberByPosPin(req, businessId, pin) {
  if (!businessId || !pin) return null;
  const business = await findBusinessById(req, businessId);
  if (!business) return null;

  const memberIds = new Set(
    (Array.isArray(business.members) ? business.members : [])
      .map((m) => String(m.user_id || '').trim())
      .filter(Boolean),
  );
  if (business.owner_user_id) memberIds.add(String(business.owner_user_id).trim());

  const accounts = await listAccounts(req);
  for (const account of accounts) {
    if (!memberIds.has(account.user_id)) continue;
    if (account.deletedAt || account.status === 'inactive') continue;
    if (account.posPinHash && verifyPosPin(pin, account.posPinHash)) {
      return account;
    }
  }
  return null;
}

export function workerCanAccessPdvForTablet(account, business, pdv) {
  if (!account || !business || !pdv) return false;

  const isOwner = business.owner_user_id === account.user_id;
  if (isOwner) return true;

  const isMember = Array.isArray(business.members)
    && business.members.some((m) => m.user_id === account.user_id);
  if (!isMember) return false;

  const role = String(account.role || '').trim();
  const isAdmin = role === 'Admin';
  const salesPointId = String(account.employment?.salesPointId || '').trim();
  if (isAdmin && !salesPointId) return true;
  if (!salesPointId) return false;

  const wcId = String(pdv.workCenterId || '').trim();
  const pdvId = String(pdv._id || '').trim();
  if (salesPointId === pdvId || salesPointId === wcId || salesPointId === `wc:${wcId}`) {
    return true;
  }
  return false;
}

// ─── TPV REGISTER SESSIONS ────────────────────────────────────────────────────

function normalizeTpvRegisterStatus(value) {
  return ['open', 'closed'].includes(String(value || '')) ? String(value) : 'open';
}

function sanitizeProductClosingCounts(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const pizza = Math.max(0, Math.floor(Number(raw.pizza) || 0));
  const burger = Math.max(0, Math.floor(Number(raw.burger) || 0));
  const taco = Math.max(0, Math.floor(Number(raw.taco) || 0));
  const byChannel = {};
  if (raw.byChannel && typeof raw.byChannel === 'object') {
    for (const [ch, counts] of Object.entries(raw.byChannel)) {
      if (!counts || typeof counts !== 'object') continue;
      byChannel[String(ch)] = {
        pizza: Math.max(0, Math.floor(Number(counts.pizza) || 0)),
        burger: Math.max(0, Math.floor(Number(counts.burger) || 0)),
        taco: Math.max(0, Math.floor(Number(counts.taco) || 0)),
      };
    }
  }
  return {
    pizza,
    burger,
    taco,
    ...(Object.keys(byChannel).length > 0 ? { byChannel } : {}),
  };
}

/** Caja 1 por marca: brandId → { efectivo, tarjeta }. */
function sanitizeClosingBrandTpvTotals(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const out = {};
  for (const [brandId, pay] of Object.entries(raw)) {
    const id = String(brandId || '').trim();
    if (!id || !pay || typeof pay !== 'object') continue;
    const efectivo = Math.round((Number(pay.efectivo) || 0) * 100) / 100;
    const tarjeta = Math.round((Number(pay.tarjeta) || 0) * 100) / 100;
    if (efectivo <= 0 && tarjeta <= 0) continue;
    out[id] = {
      efectivo: Math.max(0, efectivo),
      tarjeta: Math.max(0, tarjeta),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function buildTpvRegisterSessionDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `tpvreg-${uuidv4()}`;
  const status = normalizeTpvRegisterStatus(data.status);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'tpv_register_session',
    id,
    user_id: userId,

    pointOfSaleId: String(data.pointOfSaleId || existing?.pointOfSaleId || ''),
    pointOfSaleName: String(data.pointOfSaleName || existing?.pointOfSaleName || ''),

    terminalId: String(data.terminalId || existing?.terminalId || ''),
    terminalName: String(data.terminalName || existing?.terminalName || ''),
    workerId: String(data.workerId || existing?.workerId || ''),
    workerName: String(data.workerName || existing?.workerName || ''),
    datafonId: String(data.datafonId || existing?.datafonId || ''),
    datafonName: String(data.datafonName || existing?.datafonName || ''),
    printerId: String(data.printerId || existing?.printerId || ''),
    printerName: String(data.printerName || existing?.printerName || ''),

    status,
    openedAt: existing?.openedAt || now,
    openedBy: String(data.openedBy || existing?.openedBy || ''),
    openingCashCount: data.openingCashCount || existing?.openingCashCount || {},
    // 0 explícito en un update NO debe pisar un fondo ya guardado (el `??` no protege el 0).
    initialCashAmount: (() => {
      const incoming = data.initialCashAmount;
      const prev = existing?.initialCashAmount;
      const prevN = Number(prev);
      if (incoming == null || incoming === '') {
        return Number.isFinite(prevN) ? prevN : 0;
      }
      const nextN = Number(incoming);
      if (!Number.isFinite(nextN)) return Number.isFinite(prevN) ? prevN : 0;
      if (
        status === 'open'
        && nextN === 0
        && Number.isFinite(prevN)
        && prevN > 0
      ) {
        return prevN;
      }
      return nextN;
    })(),

    transactions: Array.isArray(data.transactions) ? data.transactions : (existing?.transactions || []),
    cashCounts: Array.isArray(data.cashCounts) ? data.cashCounts : (existing?.cashCounts || []),

    // Si status=open (reapertura por error), limpiar cierre; no conservar closedAt del existing.
    closedAt: status === 'closed' ? (data.closedAt || existing?.closedAt || now) : '',
    closedBy: status === 'closed' ? String(data.closedBy || existing?.closedBy || '') : '',
    closingCashCount:
      status === 'closed'
        ? (data.closingCashCount || existing?.closingCashCount || {})
        : (data.closingCashCount || {}),
    finalCashAmount:
      status === 'closed'
        ? Number(data.finalCashAmount ?? existing?.finalCashAmount ?? 0)
        : Number(data.finalCashAmount ?? 0),
    // En abierta no persistir expectedCash=0 “fantasma”: se recalcula al cerrar.
    expectedCash:
      status === 'closed'
        ? Number(data.expectedCash ?? existing?.expectedCash ?? 0)
        : Number(data.expectedCash ?? existing?.expectedCash ?? 0),
    difference:
      status === 'closed'
        ? Number(data.difference ?? existing?.difference ?? 0)
        : Number(data.difference ?? 0),
    closingNotes:
      status === 'closed'
        ? String(data.closingNotes ?? existing?.closingNotes ?? '')
        : String(data.closingNotes ?? ''),
    nextDayInitialCash:
      status === 'closed'
        ? (data.nextDayInitialCash != null
            ? Math.max(0, Number(data.nextDayInitialCash) || 0)
            : (existing?.nextDayInitialCash != null
                ? Math.max(0, Number(existing.nextDayInitialCash) || 0)
                : undefined))
        : undefined,

    closingValidatedBy:
      status === 'closed'
        ? String(data.closingValidatedBy ?? existing?.closingValidatedBy ?? '')
        : '',
    closingValidatedAt:
      status === 'closed'
        ? String(data.closingValidatedAt ?? existing?.closingValidatedAt ?? '')
        : '',
    closingValidationStatus: ['pending', 'validated', 'rejected'].includes(String(data.closingValidationStatus || existing?.closingValidationStatus || ''))
      ? (status === 'closed'
        ? String(data.closingValidationStatus || existing?.closingValidationStatus)
        : '')
      : (status === 'closed' ? 'pending' : ''),
    closingValidationNotes:
      status === 'closed'
        ? String(data.closingValidationNotes ?? existing?.closingValidationNotes ?? '')
        : '',
    reopenHistory: Array.isArray(data.reopenHistory)
      ? data.reopenHistory
      : (existing?.reopenHistory || []),

    incidents: Array.isArray(data.incidents) ? data.incidents : (existing?.incidents || []),
    voidedCashMovements: Array.isArray(data.voidedCashMovements)
      ? data.voidedCashMovements
      : (existing?.voidedCashMovements || []),
    /** Ventas quitadas al cancelar pedido (ids de tx) — no resucitar en sync tablet. */
    purgedSaleTxIds: Array.isArray(data.purgedSaleTxIds)
      ? [...new Set(data.purgedSaleTxIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : (Array.isArray(existing?.purgedSaleTxIds) ? existing.purgedSaleTxIds : []),
    /** Pedidos cuyas ventas se quitaron de caja al cancelar. */
    purgedOrderSaleIds: Array.isArray(data.purgedOrderSaleIds)
      ? [...new Set(data.purgedOrderSaleIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : (Array.isArray(existing?.purgedOrderSaleIds) ? existing.purgedOrderSaleIds : []),
    salesByChannel: data.salesByChannel || existing?.salesByChannel || {},
    aggregatorClosingTotals:
      data.aggregatorClosingTotals
      || existing?.aggregatorClosingTotals
      || undefined,
    aggregatorClosingCash:
      data.aggregatorClosingCash
      || existing?.aggregatorClosingCash
      || undefined,
    aggregatorClosingCard:
      data.aggregatorClosingCard
      || existing?.aggregatorClosingCard
      || undefined,
    aggregatorClosingBrandTotals:
      data.aggregatorClosingBrandTotals
      || existing?.aggregatorClosingBrandTotals
      || undefined,
    aggregatorClosingUnpaidCashByBrand:
      data.aggregatorClosingUnpaidCashByBrand
      || existing?.aggregatorClosingUnpaidCashByBrand
      || undefined,
    aggregatorClosingUnpaidCardByBrand:
      data.aggregatorClosingUnpaidCardByBrand
      || existing?.aggregatorClosingUnpaidCardByBrand
      || undefined,
    /** Caja 1 (efectivo/tarjeta) por marca — Excel de facturación. */
    closingBrandTpvTotals:
      sanitizeClosingBrandTpvTotals(
        data.closingBrandTpvTotals ?? existing?.closingBrandTpvTotals,
      ) || undefined,
    /** Nombres de marca al cerrar (para resumen PC/tablet sin depender del catálogo). */
    closingBrandLabels:
      (data.closingBrandLabels && typeof data.closingBrandLabels === 'object'
        ? data.closingBrandLabels
        : null)
      || existing?.closingBrandLabels
      || undefined,
    brandBillingRulesSnapshot:
      data.brandBillingRulesSnapshot
      || existing?.brandBillingRulesSnapshot
      || undefined,
    productClosingCounts: sanitizeProductClosingCounts(
      data.productClosingCounts ?? existing?.productClosingCounts,
    ),
    linkedOrderIds: Array.isArray(data.linkedOrderIds) ? data.linkedOrderIds : (existing?.linkedOrderIds || []),

    business_id: String(
      data.business_id || data.businessId || existing?.business_id || existing?.businessId || '',
    ).trim(),

    summary: data.summary || existing?.summary || {},

    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

/**
 * @param {object} doc
 * @param {{ slimClosed?: boolean }} [opts] slimClosed: en listados, recorta txs de cajas cerradas (payload enorme).
 */
export function sanitizeTpvRegisterSession(doc, opts = {}) {
  if (!doc) return null;
  const status = normalizeTpvRegisterStatus(doc.status);
  let transactions = Array.isArray(doc.transactions) ? doc.transactions : [];
  // Listados CEO/TPV: cajas cerradas no necesitan el historial completo en el JSON inicial.
  if (opts.slimClosed && status === 'closed' && transactions.length > 40) {
    transactions = transactions.slice(-40);
  }
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'tpv_register_session',
    id: doc._id,
    user_id: doc.user_id,

    pointOfSaleId: doc.pointOfSaleId || '',
    pointOfSaleName: doc.pointOfSaleName || '',

    terminalId: doc.terminalId || '',
    terminalName: doc.terminalName || '',
    workerId: doc.workerId || '',
    workerName: doc.workerName || '',
    datafonId: doc.datafonId || '',
    datafonName: doc.datafonName || '',
    printerId: doc.printerId || '',
    printerName: doc.printerName || '',

    status,
    openedAt: doc.openedAt || '',
    openedBy: doc.openedBy || '',
    openingCashCount: doc.openingCashCount || {},
    initialCashAmount: Number(doc.initialCashAmount || 0),

    transactions,
    cashCounts: Array.isArray(doc.cashCounts) ? doc.cashCounts : [],

    closedAt: doc.closedAt || '',
    closedBy: doc.closedBy || '',
    closingCashCount: doc.closingCashCount || {},
    finalCashAmount: Number(doc.finalCashAmount || 0),
    expectedCash: Number(doc.expectedCash || 0),
    difference: Number(doc.difference || 0),
    closingNotes: doc.closingNotes || '',
    nextDayInitialCash:
      status === 'closed' && doc.nextDayInitialCash != null
        ? Math.max(0, Number(doc.nextDayInitialCash) || 0)
        : undefined,

    closingValidatedBy: doc.closingValidatedBy || '',
    closingValidatedAt: doc.closingValidatedAt || '',
    closingValidationStatus: doc.closingValidationStatus || '',
    closingValidationNotes: doc.closingValidationNotes || '',

    incidents: Array.isArray(doc.incidents) ? doc.incidents : [],
    voidedCashMovements: Array.isArray(doc.voidedCashMovements) ? doc.voidedCashMovements : [],
    purgedSaleTxIds: Array.isArray(doc.purgedSaleTxIds) ? doc.purgedSaleTxIds : [],
    purgedOrderSaleIds: Array.isArray(doc.purgedOrderSaleIds) ? doc.purgedOrderSaleIds : [],
    salesByChannel: doc.salesByChannel || {},
    aggregatorClosingTotals: doc.aggregatorClosingTotals || undefined,
    aggregatorClosingCash: doc.aggregatorClosingCash || undefined,
    aggregatorClosingCard: doc.aggregatorClosingCard || undefined,
    aggregatorClosingBrandTotals: doc.aggregatorClosingBrandTotals || undefined,
    aggregatorClosingUnpaidCashByBrand: doc.aggregatorClosingUnpaidCashByBrand || undefined,
    aggregatorClosingUnpaidCardByBrand: doc.aggregatorClosingUnpaidCardByBrand || undefined,
    closingBrandTpvTotals: sanitizeClosingBrandTpvTotals(doc.closingBrandTpvTotals) || undefined,
    closingBrandLabels:
      doc.closingBrandLabels && typeof doc.closingBrandLabels === 'object'
        ? doc.closingBrandLabels
        : undefined,
    brandBillingRulesSnapshot: doc.brandBillingRulesSnapshot || undefined,
    productClosingCounts: sanitizeProductClosingCounts(doc.productClosingCounts),
    linkedOrderIds: Array.isArray(doc.linkedOrderIds) ? doc.linkedOrderIds : [],
    reopenHistory: Array.isArray(doc.reopenHistory) ? doc.reopenHistory : [],

    business_id: String(doc.business_id || doc.businessId || '').trim(),

    summary: doc.summary || {},

    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listTpvRegisterSessionsByUser(req, userId, options = {}) {
  const uid = String(userId || '').trim();
  const dateFrom = String(options?.dateFrom || '').trim();
  const dateTo = String(options?.dateTo || '').trim();
  const maxDocs = Math.min(Math.max(1, Number(options?.maxDocs) || 5_000), 5_000);
  const opsLite = Boolean(options?.opsLite);
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  await ensureDeliveryTypeUserIndex(req, db);

  const baseSelector = uid
    ? { type: 'tpv_register_session', user_id: uid }
    : { type: 'tpv_register_session' };

  const keep = (doc) =>
    doc?.type === 'tpv_register_session'
    && !doc?.deletedAt
    && (!uid || doc?.user_id === uid);

  const inWindow = (doc) => {
    const ts = String(doc?.createdAt || doc?.openedAt || '');
    if (dateFrom && ts && ts < dateFrom) return false;
    if (dateTo && ts && ts > dateTo) return false;
    return true;
  };

  const createdAtSelector = () => {
    if (dateFrom && dateTo) return { $gte: dateFrom, $lte: dateTo };
    if (dateFrom) return { $gte: dateFrom };
    if (dateTo) return { $lte: dateTo };
    return null;
  };

  /** Ops / home: abiertas + por validar + ventana reciente (no 5000 cajas con txs). */
  if (opsLite) {
    const lookback = dateFrom || (() => {
      const dt = new Date();
      dt.setUTCDate(dt.getUTCDate() - 60);
      return dt.toISOString();
    })();
    const recentCreatedAt = dateTo
      ? { $gte: lookback, $lte: dateTo }
      : { $gte: lookback };
    const inOpsLiteWindow = (doc) => {
      if (inWindow(doc)) return true;
      // Caja abierta hace días pero cerrada ayer: createdAt viejo ≠ fuera de ventana.
      if (String(doc?.status || '') === 'closed') {
        const closedTs = String(doc?.closedAt || doc?.updatedAt || '').trim();
        if (closedTs && closedTs >= lookback) {
          if (!dateTo || closedTs <= dateTo) return true;
        }
      }
      return false;
    };
    const [recent, openOnes, pendingOnes, closedRecent] = await Promise.all([
      findDocuments(
        req,
        db,
        { ...baseSelector, createdAt: recentCreatedAt },
        { pageSize: 200, maxDocs: Math.min(maxDocs, 600) },
      ).catch(() => []),
      findDocuments(
        req,
        db,
        { ...baseSelector, status: 'open' },
        { pageSize: 50, maxDocs: 80 },
      ).catch(() => []),
      findDocuments(
        req,
        db,
        { ...baseSelector, closingValidationStatus: 'pending' },
        { pageSize: 100, maxDocs: 300 },
      ).catch(() => []),
      findDocuments(
        req,
        db,
        { ...baseSelector, status: 'closed', closedAt: recentCreatedAt },
        { pageSize: 150, maxDocs: 400 },
      ).catch(() => []),
    ]);
    const byId = new Map();
    for (const doc of [...recent, ...openOnes, ...pendingOnes, ...closedRecent]) {
      if (!keep(doc) || !doc._id) continue;
      // Abiertas/pendientes siempre; el resto respeta la ventana.
      if (
        doc.status === 'open'
        || String(doc.closingValidationStatus || '') === 'pending'
        || inOpsLiteWindow(doc)
      ) {
        byId.set(doc._id, doc);
      }
    }
    return [...byId.values()].sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
    );
  }

  const createdAt = createdAtSelector();
  const selector = createdAt
    ? { ...baseSelector, createdAt }
    : baseSelector;

  let docs;
  try {
    docs = await findDocuments(req, db, selector, { pageSize: 500, maxDocs });
  } catch {
    if (dateFrom || dateTo) {
      try {
        docs = await findDocuments(req, db, baseSelector, { pageSize: 500, maxDocs });
      } catch {
        const all = await getDeliveryDatabaseDocumentsInflight(req);
        docs = all.filter(
          (doc) => doc?.type === 'tpv_register_session' && (!uid || doc?.user_id === uid),
        );
      }
    } else {
      const all = await getDeliveryDatabaseDocumentsInflight(req);
      docs = all.filter(
        (doc) => doc?.type === 'tpv_register_session' && (!uid || doc?.user_id === uid),
      );
    }
  }

  return docs
    .filter((doc) => keep(doc) && inWindow(doc))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

/** Canonical TPV payment method (legacy orders may store `otros`). */
export function normalizeTpvPaymentMethod(raw) {
  const pm = String(raw || '').trim().toLowerCase();
  if (pm === 'otros') return 'otro';
  if (['efectivo', 'tarjeta', 'bizum', 'online', 'otro'].includes(pm)) return pm;
  return 'efectivo';
}

function sumTpvOpeningCashCount(counts) {
  if (!counts || typeof counts !== 'object') return 0;
  const values = {
    bills_500: 500, bills_200: 200, bills_100: 100, bills_50: 50,
    bills_20: 20, bills_10: 10, bills_5: 5,
    coins_2: 2, coins_1: 1, coins_050: 0.5, coins_020: 0.2,
    coins_010: 0.1, coins_005: 0.05, coins_002: 0.02, coins_001: 0.01,
  };
  let total = 0;
  for (const [key, value] of Object.entries(values)) {
    const qty = Number(counts[key] || 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    total += qty * value;
  }
  return Math.round(total * 100) / 100;
}

function resolveTpvOpeningCashAmount(session) {
  if (!session) return 0;
  const declared = Number(session.initialCashAmount);
  if (Number.isFinite(declared) && declared > 0) return Math.round(declared * 100) / 100;
  const fromCount = sumTpvOpeningCashCount(session.openingCashCount);
  if (fromCount > 0) return fromCount;
  return Number.isFinite(declared) ? declared : 0;
}

/** Efectivo esperado en caja según transacciones registradas. */
export function calcTpvRegisterExpectedCash(session) {
  if (!session) return 0;
  const txs = Array.isArray(session.transactions) ? session.transactions : [];
  const isCash = (t) => normalizeTpvPaymentMethod(t?.paymentMethod) === 'efectivo';
  const cashSales = txs
    .filter((t) => (t?.type === 'sale' || t?.type === 'staff_consumption') && isCash(t))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const cashTips = txs
    .filter((t) => (t?.type === 'sale' || t?.type === 'tip') && isCash(t))
    .reduce((s, t) => {
      if (t?.type === 'tip') return s + Number(t.amount || 0);
      return s + Math.max(0, Number(t?.tip || 0));
    }, 0);
  const cashReturns = txs
    .filter((t) => t?.type === 'return' && isCash(t))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const cashIn = txs
    .filter((t) => t?.type === 'cash_in')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const cashOut = txs
    .filter((t) => t?.type === 'cash_out' || t?.type === 'expense')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  return resolveTpvOpeningCashAmount(session) + cashSales + cashTips - cashReturns + cashIn - cashOut;
}

/** Suma importes de ventas ya registradas en caja para un pedido (evita doble conteo). */
export function shouldRegisterTpvSaleOnTpvOrderCreate(doc) {
  const channel = String(doc?.channel || '').toLowerCase();
  if (channel !== 'tpv') return false;
  const paidAmount = Number(doc?.paidAmount || 0);
  const paymentStatus = String(doc?.paymentStatus || '').toLowerCase();
  const isCollected =
    Boolean(doc?.paymentCollected)
    || paymentStatus === 'paid'
    || (Number.isFinite(paidAmount) && paidAmount > 0);
  if (!isCollected) return false;
  const amount = paidAmount > 0 ? paidAmount : Number(doc?.totalAmount || 0);
  return Number.isFinite(amount) && amount > 0;
}

function txMatchesTpvOrderId(t, orderId) {
  const oid = String(orderId || '').trim();
  if (!oid || !t) return false;
  return (
    String(t.orderId || '').trim() === oid
    || String(t.linkedDeliveryOrderId || '').trim() === oid
  );
}

/** Suma importes de ventas ya registradas en caja para un pedido (evita doble conteo). */
export function sumTpvRegisterSaleAmountForOrder(transactions, orderId) {
  const oid = String(orderId || '').trim();
  if (!oid) return 0;
  return (Array.isArray(transactions) ? transactions : [])
    .filter((t) => t && t.type === 'sale' && txMatchesTpvOrderId(t, oid))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

/** Suma devoluciones en caja ya registradas para un pedido (evita doble conteo). */
export function sumTpvRegisterReturnAmountForOrder(transactions, orderId) {
  const oid = String(orderId || '').trim();
  if (!oid) return 0;
  return (Array.isArray(transactions) ? transactions : [])
    .filter((t) => t && t.type === 'return' && txMatchesTpvOrderId(t, oid))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

export async function getNextDeliveryTicketNumber(req, userId) {
  const orders = await listDeliveryOrdersByUser(req, userId);
  const maxNum = (Array.isArray(orders) ? orders : []).reduce((max, o) => {
    const m = String(o?.ticketNumber || '').match(/^T-(\d+)$/i);
    const n = m ? parseInt(m[1], 10) : 0;
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `T-${String(maxNum + 1).padStart(6, '0')}`;
}

/** Sesión de caja TPV abierta para un PDV (la más reciente si hubiera varias). */
export function normalizeTpvSessionBusinessId(session) {
  return String(session?.business_id || session?.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

/** Sesión pertenece a la empresa (legacy: solo si el PDV es de esa empresa). */
export function tpvRegisterSessionBelongsToBusiness(session, businessId, scopedPdvIds) {
  const bid = String(businessId || '').replace(/^business:/, '').trim();
  if (!bid) return true;
  const sessionBid = normalizeTpvSessionBusinessId(session);
  if (sessionBid) return sessionBid === bid;
  const pdvId = String(session?.pointOfSaleId || '').trim();
  if (!pdvId) return false;
  if (!scopedPdvIds) return false;
  const ids = scopedPdvIds instanceof Set ? scopedPdvIds : new Set(scopedPdvIds);
  return ids.has(pdvId);
}

function isOpenTpvRegisterSessionDoc(session) {
  return Boolean(
    session
      && String(session.status || '').toLowerCase() === 'open'
      && !session.deletedAt,
  );
}

/**
 * Filtra sesiones de caja por empresa.
 * Conserva cajas ABIERTAS de un PDV de esa empresa aunque `session.business_id`
 * esté mal (p. ej. PDV enlazado a realEstate): si no, el TPV no ve la caja viva
 * y bloquea abrir/reabrir.
 */
export function filterTpvRegisterSessionsForBusiness(sessions, businessId, scopedPdvIds) {
  const bid = String(businessId || '').replace(/^business:/, '').trim();
  if (!bid) return Array.isArray(sessions) ? sessions : [];
  const ids = scopedPdvIds instanceof Set ? scopedPdvIds : new Set(scopedPdvIds || []);
  return (Array.isArray(sessions) ? sessions : []).filter((s) => {
    if (tpvRegisterSessionBelongsToBusiness(s, bid, ids)) return true;
    const pdvId = String(s?.pointOfSaleId || '').trim();
    // Abierta o cerrada: si el PDV/WC está en el scope de la empresa, conservar (fondo + Continuar).
    return Boolean(pdvId && ids.has(pdvId));
  });
}

/** Sesión de caja TPV abierta para un PDV (la más reciente si hubiera varias). */
export function findOpenTpvRegisterSessionForPointOfSale(
  sessions,
  pointOfSaleId,
  businessId = '',
  scopedPdvIds = null,
) {
  const pdvId = String(pointOfSaleId || '').trim();
  if (!pdvId) return null;
  const bid = String(businessId || '').trim();
  const openForPdv = (Array.isArray(sessions) ? sessions : [])
    .filter(
      (s) =>
        s &&
        s.status === 'open' &&
        !s.deletedAt &&
        String(s.pointOfSaleId || '').trim() === pdvId,
    )
    .sort((a, b) => String(b.openedAt || '').localeCompare(String(a.openedAt || '')));
  if (!openForPdv.length) return null;
  if (!bid) return openForPdv[0];
  const matchingBiz =
    openForPdv.find((s) => tpvRegisterSessionBelongsToBusiness(s, bid, scopedPdvIds)) || null;
  // Si el stamp de empresa está mal, igual hay caja viva en esa tienda.
  return matchingBiz || openForPdv[0];
}

/** Cierra otras sesiones TPV abiertas en la misma tienda (sync multi-terminal). */
export async function autoCloseDuplicateOpenTpvSessions(req, userId, closedSession, closedBy = 'Sistema') {
  const uid = String(userId || '').trim();
  const pdvId = String(closedSession?.pointOfSaleId || '').trim();
  if (!uid || !pdvId || String(closedSession?.status || '') !== 'closed') return [];

  const db = getDeliveryDbName();
  const openOnes = await findDocuments(
    req,
    db,
    { type: 'tpv_register_session', user_id: uid, status: 'open', pointOfSaleId: pdvId },
    { pageSize: 20, maxDocs: 30 },
  ).catch(() => []);

  const closedId = String(closedSession._id || '').trim();
  const closedAt = String(closedSession.closedAt || '').trim();
  const reason = closedAt
    ? `Cierre sincronizado: otra sesión cerró esta tienda (${closedAt.slice(0, 10)}).`
    : 'Cierre sincronizado: otra sesión cerró esta tienda.';

  const results = [];
  for (const open of openOnes) {
    if (!open?._id || open._id === closedId || open.deletedAt) continue;
    const doc = autoCloseTpvRegisterSessionDocument(uid, open, reason, closedBy);
    try {
      const saved = await putDocument(req, db, doc._id, doc);
      results.push({ ...doc, _rev: saved.rev });
    } catch (err) {
      console.error('[TPV] auto-close duplicate open failed:', open._id, err?.message);
    }
  }
  return results;
}

/** Cierra una sesión TPV sin conteo manual (mantenimiento / fin de jornada). */
export function autoCloseTpvRegisterSessionDocument(userId, session, reason, closedBy = 'Sistema') {
  const expected = calcTpvRegisterExpectedCash(session);
  const now = new Date().toISOString();
  return buildTpvRegisterSessionDocument(
    userId,
    {
      ...session,
      status: 'closed',
      closedAt: now,
      closedBy: String(closedBy || 'Sistema'),
      closingNotes: String(reason || 'Cierre automático'),
      expectedCash: expected,
      finalCashAmount: expected,
      difference: 0,
    },
    session,
  );
}

// ─── CLEANING ─────────────────────────────────────────────────────────────────

export function getCleaningDbName() {
  return normalizeDbName(process.env.VITE_CLEANING_DB || `${getDbPrefix()}-cleaning`);
}

function normalizeCleaningServiceStatus(value) {
  const allowed = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'];
  return allowed.includes(String(value || '')) ? String(value) : 'pending';
}

export function buildCleaningServiceDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `csvc-${uuidv4()}`;
  const serviceNumber = existing?.serviceNumber || `SVC-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const tasks = Array.isArray(data.tasks) ? data.tasks : (existing?.tasks || []);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'cleaning_service',
    id,
    serviceNumber,
    user_id: userId,
    clientName: String(data.clientName || existing?.clientName || ''),
    clientPhone: String(data.clientPhone || existing?.clientPhone || ''),
    clientEmail: String(data.clientEmail || existing?.clientEmail || ''),
    address: String(data.address || existing?.address || ''),
    clientType: String(data.clientType || existing?.clientType || 'house'),
    date: String(data.date || existing?.date || ''),
    time: String(data.time || existing?.time || ''),
    duration: String(data.duration || existing?.duration || ''),
    cleaningType: String(data.cleaningType || existing?.cleaningType || 'general'),
    workerId: String(data.workerId || existing?.workerId || ''),
    assignedTo: String(data.assignedTo || existing?.assignedTo || ''),
    assignedToName: String(data.assignedToName || existing?.assignedToName || ''),
    status: normalizeCleaningServiceStatus(data.status ?? existing?.status),
    tasks,
    checkInAt: String(data.checkInAt || existing?.checkInAt || ''),
    checkOutAt: String(data.checkOutAt || existing?.checkOutAt || ''),
    employeeNotes: String(data.employeeNotes || existing?.employeeNotes || ''),
    photosBefore: Array.isArray(data.photosBefore) ? data.photosBefore : (existing?.photosBefore || []),
    photosAfter: Array.isArray(data.photosAfter) ? data.photosAfter : (existing?.photosAfter || []),
    qualityOk: data.qualityOk != null ? Boolean(data.qualityOk) : (existing?.qualityOk ?? null),
    qualityRating: Number(data.qualityRating || existing?.qualityRating || 0),
    qualityNotes: String(data.qualityNotes || existing?.qualityNotes || ''),
    clientRating: Number(data.clientRating || existing?.clientRating || 0),
    clientReview: String(data.clientReview || existing?.clientReview || ''),
    clientReviewAt: String(data.clientReviewAt || existing?.clientReviewAt || ''),
    price: Number(data.price || existing?.price || 0),
    invoiceId: String(data.invoiceId || existing?.invoiceId || ''),
    clientId: String(data.clientId || existing?.clientId || ''),
    contractId: String(data.contractId || existing?.contractId || ''),
    contractNumber: String(data.contractNumber || existing?.contractNumber || ''),
    billingStatus: normalizeCleaningBillingStatus(data.billingStatus ?? existing?.billingStatus),
    lastInvoiceDate: String(data.lastInvoiceDate || existing?.lastInvoiceDate || ''),
    priceHistory: Array.isArray(data.priceHistory) ? data.priceHistory.map((p) => ({
      price: Number(p.price || 0),
      effectiveFrom: String(p.effectiveFrom || ''),
      reason: String(p.reason || ''),
    })) : (existing?.priceHistory || []),
    notes: String(data.notes || existing?.notes || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeCleaningService(doc) {
  if (!doc) return null;
  const recurrence = doc.recurrence || {};
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'cleaning_service',
    id: doc._id,
    serviceNumber: doc.serviceNumber || '',
    user_id: doc.user_id,
    clientName: doc.clientName || '',
    clientPhone: doc.clientPhone || '',
    clientEmail: doc.clientEmail || '',
    address: doc.address || '',
    clientType: doc.clientType || 'house',
    date: doc.date || '',
    time: doc.time || '',
    duration: doc.duration || '',
    cleaningType: doc.cleaningType || 'general',
    assignedTo: doc.assignedTo || '',
    assignedToName: doc.assignedToName || '',
    status: normalizeCleaningServiceStatus(doc.status),
    priority: doc.priority || 'normal',
    recurrence: {
      type: recurrence.type || 'none',
      days: Array.isArray(recurrence.days) ? recurrence.days : [],
      endDate: recurrence.endDate || '',
    },
    zone: doc.zone || '',
    routeId: doc.routeId || '',
    recurrenceParentId: doc.recurrenceParentId || '',
    tasks: Array.isArray(doc.tasks) ? doc.tasks : [],
    execution: buildServiceExecution(doc.execution, migrateExecution(doc)),
    checkInAt: doc.checkInAt || '',
    checkOutAt: doc.checkOutAt || '',
    employeeNotes: doc.employeeNotes || '',
    photosBefore: Array.isArray(doc.photosBefore) ? doc.photosBefore : [],
    photosAfter: Array.isArray(doc.photosAfter) ? doc.photosAfter : [],
    qualityOk: doc.qualityOk ?? null,
    qualityRating: Number(doc.qualityRating || 0),
    qualityNotes: doc.qualityNotes || '',
    clientRating: Number(doc.clientRating || 0),
    clientReview: doc.clientReview || '',
    clientReviewAt: doc.clientReviewAt || '',
    price: Number(doc.price || 0),
    invoiceId: doc.invoiceId || '',
    contractId: doc.contractId || '',
    contractNumber: doc.contractNumber || '',
    materialsUsed: Array.isArray(doc.materialsUsed) ? doc.materialsUsed : [],
    materialCost: Number(doc.materialCost || 0),
    laborCost: Number(doc.laborCost || 0),
    totalCost: Number(doc.totalCost || 0),
    notes: doc.notes || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listCleaningServicesByUser(req, userId) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'cleaning_service' && !doc?.deletedAt && (!userId || doc?.user_id === userId))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function listCleaningServicesByDate(req, userId, date) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'cleaning_service' && !doc?.deletedAt && doc?.user_id === userId && doc?.date === date)
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
}

// ─── CLEANING WORKERS ────────────────────────────────────────────────────────

const CLEANING_CONTRACT_TYPES = ['full_time', 'part_time', 'temporary', 'freelance', 'internship'];
const CLEANING_WORKER_STATUSES = ['active', 'inactive', 'on_leave', 'trial'];
const CLEANING_VEHICLE_TYPES = ['coche', 'moto', 'bicicleta', 'transporte_publico', 'a_pie'];
const CLEANING_DOC_TYPES = ['dni', 'contract', 'prl', 'driving_license', 'social_security', 'medical', 'certification', 'other'];
const MATERIAL_CONDITIONS = ['good', 'fair', 'poor', 'needs_replacement'];

function normalizeCleaningWorkerStatus(value) {
  return CLEANING_WORKER_STATUSES.includes(String(value || '')) ? String(value) : 'active';
}

function buildDayAvailability(d) {
  if (!d || typeof d !== 'object') return { available: false };
  return {
    available: Boolean(d.available),
    startTime: String(d.startTime || ''),
    endTime: String(d.endTime || ''),
    breakStart: String(d.breakStart || ''),
    breakEnd: String(d.breakEnd || ''),
  };
}

function buildWorkerAvailability(data, existing) {
  const src = (data && typeof data === 'object') ? data : (existing || {});
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const result = {};
  for (const day of days) result[day] = buildDayAvailability(src[day]);
  return result;
}

export function buildCleaningWorkerDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `clwk-${uuidv4()}`;
  const documents = Array.isArray(data.documents) ? data.documents.map(d => ({
    id: String(d.id || `doc-${uuidv4()}`),
    name: String(d.name || ''),
    documentType: CLEANING_DOC_TYPES.includes(String(d.documentType)) ? String(d.documentType) : 'other',
    url: String(d.url || ''),
    expiresAt: String(d.expiresAt || ''),
    uploadedAt: String(d.uploadedAt || now),
    verified: Boolean(d.verified),
  })) : (existing?.documents || []);
  const assignedMaterials = Array.isArray(data.assignedMaterials) ? data.assignedMaterials.map(m => ({
    id: String(m.id || `mat-${uuidv4()}`),
    name: String(m.name || ''),
    catalogItemId: String(m.catalogItemId || ''),
    quantity: Number(m.quantity || 1),
    assignedAt: String(m.assignedAt || now),
    returnedAt: String(m.returnedAt || ''),
    condition: MATERIAL_CONDITIONS.includes(String(m.condition)) ? String(m.condition) : 'good',
    notes: String(m.notes || ''),
  })) : (existing?.assignedMaterials || []);
  const zones = Array.isArray(data.zones) ? data.zones.map(String) : (existing?.zones || []);
  const specializations = Array.isArray(data.specializations) ? data.specializations.map(String) : (existing?.specializations || []);
  const languages = Array.isArray(data.languages) ? data.languages.map(String) : (existing?.languages || []);
  return {
    _id: id, _rev: existing?._rev, type: 'cleaning_worker', id, user_id: userId,
    name: String(data.name || existing?.name || ''),
    phone: String(data.phone || existing?.phone || ''),
    email: String(data.email || existing?.email || ''),
    avatar: String(data.avatar || existing?.avatar || ''),
    address: String(data.address || existing?.address || ''),
    teamMemberId: String(data.teamMemberId || existing?.teamMemberId || ''),
    documents,
    contractType: CLEANING_CONTRACT_TYPES.includes(String(data.contractType)) ? String(data.contractType) : (existing?.contractType || 'full_time'),
    hourlyCost: Number(data.hourlyCost ?? existing?.hourlyCost ?? 0),
    hourlyRate: Number(data.hourlyRate ?? existing?.hourlyRate ?? 0),
    weeklyHours: Number(data.weeklyHours ?? existing?.weeklyHours ?? 40),
    startDate: String(data.startDate || existing?.startDate || ''),
    endDate: String(data.endDate || existing?.endDate || ''),
    socialSecurityNumber: String(data.socialSecurityNumber || existing?.socialSecurityNumber || ''),
    availability: buildWorkerAvailability(data.availability, existing?.availability),
    zones, preferredZone: String(data.preferredZone || existing?.preferredZone || ''),
    hasOwnVehicle: data.hasOwnVehicle != null ? Boolean(data.hasOwnVehicle) : (existing?.hasOwnVehicle ?? false),
    vehicleType: CLEANING_VEHICLE_TYPES.includes(String(data.vehicleType)) ? String(data.vehicleType) : (existing?.vehicleType || ''),
    vehicleOwnership: ['own', 'company'].includes(String(data.vehicleOwnership)) ? String(data.vehicleOwnership) : (existing?.vehicleOwnership || ''),
    licensePlate: String(data.licensePlate || existing?.licensePlate || ''),
    assignedMaterials,
    status: normalizeCleaningWorkerStatus(data.status ?? existing?.status),
    specializations, languages,
    notes: String(data.notes || existing?.notes || ''),
    workerPermissions: {
      canViewOwnDocs: Boolean(data.workerPermissions?.canViewOwnDocs ?? existing?.workerPermissions?.canViewOwnDocs ?? false),
      canViewOwnStats: Boolean(data.workerPermissions?.canViewOwnStats ?? existing?.workerPermissions?.canViewOwnStats ?? false),
      canViewOwnSchedule: Boolean(data.workerPermissions?.canViewOwnSchedule ?? existing?.workerPermissions?.canViewOwnSchedule ?? true),
    },
    createdAt: existing?.createdAt || now, updatedAt: now,
  };
}

export function sanitizeCleaningWorker(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'cleaning_worker', id: doc._id, user_id: doc.user_id,
    name: doc.name || '', phone: doc.phone || '', email: doc.email || '',
    avatar: doc.avatar || '', address: doc.address || '',
    teamMemberId: doc.teamMemberId || '',
    documents: Array.isArray(doc.documents) ? doc.documents : [],
    contractType: doc.contractType || 'full_time',
    hourlyCost: Number(doc.hourlyCost || 0), hourlyRate: Number(doc.hourlyRate || 0),
    weeklyHours: Number(doc.weeklyHours || 40),
    startDate: doc.startDate || '', endDate: doc.endDate || '',
    socialSecurityNumber: doc.socialSecurityNumber || '',
    availability: doc.availability || {},
    zones: Array.isArray(doc.zones) ? doc.zones : [],
    preferredZone: doc.preferredZone || '',
    hasOwnVehicle: Boolean(doc.hasOwnVehicle),
    vehicleType: doc.vehicleType || '', vehicleOwnership: doc.vehicleOwnership || '',
    licensePlate: doc.licensePlate || '',
    assignedMaterials: Array.isArray(doc.assignedMaterials) ? doc.assignedMaterials : [],
    status: normalizeCleaningWorkerStatus(doc.status),
    specializations: Array.isArray(doc.specializations) ? doc.specializations : [],
    languages: Array.isArray(doc.languages) ? doc.languages : [],
    notes: doc.notes || '',
    workerPermissions: doc.workerPermissions || { canViewOwnDocs: false, canViewOwnStats: false, canViewOwnSchedule: true },
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}

export async function listCleaningWorkersByUser(req, userId) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'cleaning_worker' && !doc?.deletedAt && (!userId || doc?.user_id === userId))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}

// ─── CLEANING ROUTES ──────────────────────────────────────────────────────────

const ROUTE_STATUSES = ['draft', 'active', 'completed', 'cancelled'];
const ROUTE_ENTRY_STATUSES = ['pending', 'in_transit', 'in_progress', 'completed', 'skipped'];

function normalizeRouteStatus(value) {
  return ROUTE_STATUSES.includes(String(value || '')) ? String(value) : 'draft';
}

function normalizeRouteEntryStatus(value) {
  return ROUTE_ENTRY_STATUSES.includes(String(value || '')) ? String(value) : 'pending';
}

function sanitizeRouteEntry(entry, idx) {
  return {
    serviceId: String(entry.serviceId || ''),
    order: Number(entry.order ?? idx + 1),
    estimatedStartTime: String(entry.estimatedStartTime || ''),
    estimatedEndTime: String(entry.estimatedEndTime || ''),
    actualStartTime: String(entry.actualStartTime || ''),
    actualEndTime: String(entry.actualEndTime || ''),
    status: normalizeRouteEntryStatus(entry.status),
    travelTimeMin: Number(entry.travelTimeMin || 0),
    clientName: String(entry.clientName || ''),
    address: String(entry.address || ''),
    cleaningType: String(entry.cleaningType || ''),
    duration: String(entry.duration || ''),
    priority: entry.priority || 'normal',
    zone: String(entry.zone || ''),
    overlap: Boolean(entry.overlap),
  };
}

export function buildCleaningRouteDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `croute-${uuidv4()}`;
  const entries = (Array.isArray(data.entries) ? data.entries : (existing?.entries || []))
    .map((e, i) => sanitizeRouteEntry(e, i));

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'cleaning_route',
    id,
    user_id: userId,
    date: String(data.date || existing?.date || ''),
    workerId: String(data.workerId || existing?.workerId || ''),
    workerName: String(data.workerName || existing?.workerName || ''),
    status: normalizeRouteStatus(data.status ?? existing?.status),
    entries,
    zone: String(data.zone || existing?.zone || ''),
    totalEstimatedMinutes: Number(data.totalEstimatedMinutes || existing?.totalEstimatedMinutes || 0),
    totalActualMinutes: Number(data.totalActualMinutes || existing?.totalActualMinutes || 0),
    notes: String(data.notes || existing?.notes || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deletedAt: existing?.deletedAt || null,
  };
}

export function sanitizeCleaningRoute(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'cleaning_route',
    id: doc._id,
    user_id: doc.user_id,
    date: doc.date || '',
    workerId: doc.workerId || '',
    workerName: doc.workerName || '',
    status: normalizeRouteStatus(doc.status),
    entries: Array.isArray(doc.entries) ? doc.entries.map((e, i) => sanitizeRouteEntry(e, i)) : [],
    zone: doc.zone || '',
    totalEstimatedMinutes: Number(doc.totalEstimatedMinutes || 0),
    totalActualMinutes: Number(doc.totalActualMinutes || 0),
    notes: doc.notes || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listCleaningRoutesByUser(req, userId) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'cleaning_route' && !doc?.deletedAt && doc?.user_id === userId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export async function listCleaningRoutesByDate(req, userId, date) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'cleaning_route' && !doc?.deletedAt && doc?.user_id === userId && doc?.date === date)
    .sort((a, b) => String(a.workerName || '').localeCompare(String(b.workerName || '')));
}

export async function listCleaningRoutesByWorker(req, userId, workerId) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'cleaning_route' && !doc?.deletedAt && doc?.user_id === userId && doc?.workerId === workerId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

// ─── CLEANING INCIDENTS ───────────────────────────────────────────────────────

const INCIDENT_TYPES = ['falta_limpieza', 'rotura', 'ausencia', 'queja_cliente', 'urgencia_extra', 'material_faltante', 'acceso_no_permitido'];
const INCIDENT_STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'reopened'];
const INCIDENT_PRIORITIES = ['low', 'medium', 'high', 'critical'];

function normalizeIncidentStatus(value) {
  return INCIDENT_STATUSES.includes(String(value || '')) ? String(value) : 'open';
}

function normalizeIncidentPriority(value) {
  return INCIDENT_PRIORITIES.includes(String(value || '')) ? String(value) : 'medium';
}

function normalizeIncidentType(value) {
  return INCIDENT_TYPES.includes(String(value || '')) ? String(value) : 'falta_limpieza';
}

export function buildCleaningIncidentDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cinc-${uuidv4()}`;
  const incidentNumber = existing?.incidentNumber || `INC-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const historyEntry = [];
  if (existing && existing.status !== normalizeIncidentStatus(data.status)) {
    historyEntry.push({
      date: now,
      from: existing.status,
      to: normalizeIncidentStatus(data.status),
      user: data._changedBy || '',
      notes: data._changeNotes || '',
    });
  }

  return {
    _id: id,
    _rev: existing?._rev || undefined,
    type: 'cleaning_incident',
    user_id: userId,
    incidentNumber,
    incidentType: normalizeIncidentType(data.incidentType),
    clientId: data.clientId || existing?.clientId || '',
    clientName: data.clientName || existing?.clientName || '',
    serviceId: data.serviceId || existing?.serviceId || '',
    serviceNumber: data.serviceNumber || existing?.serviceNumber || '',
    date: data.date || existing?.date || now.slice(0, 10),
    workerId: data.workerId || existing?.workerId || '',
    workerName: data.workerName || existing?.workerName || '',
    priority: normalizeIncidentPriority(data.priority),
    description: data.description || existing?.description || '',
    photos: Array.isArray(data.photos) ? data.photos : (existing?.photos || []),
    status: normalizeIncidentStatus(data.status),
    responsibleId: data.responsibleId || existing?.responsibleId || '',
    responsibleName: data.responsibleName || existing?.responsibleName || '',
    resolution: data.resolution || existing?.resolution || '',
    resolvedAt: data.resolvedAt || existing?.resolvedAt || '',
    resolvedBy: data.resolvedBy || existing?.resolvedBy || '',
    dueDate: data.dueDate || existing?.dueDate || '',
    reopenCount: Number(data.reopenCount || existing?.reopenCount || 0),
    statusHistory: [...(existing?.statusHistory || []), ...historyEntry],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deletedAt: data.deletedAt || existing?.deletedAt || null,
  };
}

export function sanitizeCleaningIncident(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'cleaning_incident',
    user_id: doc.user_id,
    incidentNumber: doc.incidentNumber || '',
    incidentType: doc.incidentType || 'falta_limpieza',
    clientId: doc.clientId || '',
    clientName: doc.clientName || '',
    serviceId: doc.serviceId || '',
    serviceNumber: doc.serviceNumber || '',
    date: doc.date || '',
    workerId: doc.workerId || '',
    workerName: doc.workerName || '',
    priority: doc.priority || 'medium',
    description: doc.description || '',
    photos: Array.isArray(doc.photos) ? doc.photos : [],
    status: doc.status || 'open',
    responsibleId: doc.responsibleId || '',
    responsibleName: doc.responsibleName || '',
    resolution: doc.resolution || '',
    resolvedAt: doc.resolvedAt || '',
    resolvedBy: doc.resolvedBy || '',
    dueDate: doc.dueDate || '',
    reopenCount: Number(doc.reopenCount || 0),
    statusHistory: Array.isArray(doc.statusHistory) ? doc.statusHistory : [],
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listCleaningIncidentsByUser(req, userId) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'cleaning_incident' && !doc?.deletedAt && (!userId || doc?.user_id === userId))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ─── CLEANING SERVICE CONTRACTS ───────────────────────────────────────────────

const CONTRACT_STATUSES = ['draft', 'active', 'paused', 'pending_renewal', 'expired', 'cancelled'];
const SERVICE_FREQUENCIES = ['daily', 'daily_all', 'weekly_1', 'weekly_2', 'weekly_3', 'weekly_4', 'weekly_5', 'biweekly', 'monthly', 'on_demand', 'custom'];
const PRICING_MODELS = ['monthly', 'per_service', 'per_hour'];
const SERVICE_CLIENT_TYPES = ['office', 'community', 'shop', 'warehouse', 'gym', 'home', 'post_construction', 'restaurant', 'clinic', 'hotel', 'school', 'other'];

function normalizeContractStatus(value) {
  return CONTRACT_STATUSES.includes(String(value || '')) ? String(value) : 'draft';
}

function normalizeServiceFrequency(value) {
  return SERVICE_FREQUENCIES.includes(String(value || '')) ? String(value) : 'weekly_1';
}

function normalizePricingModel(value) {
  return PRICING_MODELS.includes(String(value || '')) ? String(value) : 'monthly';
}

function normalizeServiceClientType(value) {
  return SERVICE_CLIENT_TYPES.includes(String(value || '')) ? String(value) : 'other';
}

export function buildServiceContractDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `scontract-${uuidv4()}`;
  const contractNumber = existing?.contractNumber || `CTR-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const scheduleDays = Array.isArray(data.scheduleDays) ? data.scheduleDays : (existing?.scheduleDays || []);
  const materials = Array.isArray(data.materials) ? data.materials : (existing?.materials || []);
  const linkedInvoiceIds = Array.isArray(data.linkedInvoiceIds) ? data.linkedInvoiceIds : (existing?.linkedInvoiceIds || []);
  const customFrequencyDays = Array.isArray(data.customFrequencyDays) ? data.customFrequencyDays : (existing?.customFrequencyDays || []);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'service_contract',
    id,
    contractNumber,
    user_id: userId,

    clientId: String(data.clientId || existing?.clientId || ''),
    clientName: String(data.clientName || existing?.clientName || ''),
    clientPhone: String(data.clientPhone || existing?.clientPhone || ''),
    clientEmail: String(data.clientEmail || existing?.clientEmail || ''),
    clientType: normalizeServiceClientType(data.clientType ?? existing?.clientType),

    address: String(data.address || existing?.address || ''),
    addressLine2: String(data.addressLine2 || existing?.addressLine2 || ''),
    city: String(data.city || existing?.city || ''),
    postalCode: String(data.postalCode || existing?.postalCode || ''),
    coordinates: data.coordinates || existing?.coordinates || null,
    zone: String(data.zone || existing?.zone || ''),

    cleaningType: String(data.cleaningType || existing?.cleaningType || 'general'),
    frequency: normalizeServiceFrequency(data.frequency ?? existing?.frequency),
    customFrequencyDays,
    scheduleDays,
    contractedHoursPerVisit: Number(data.contractedHoursPerVisit || existing?.contractedHoursPerVisit || 0),
    contractedVisitsPerMonth: data.contractedVisitsPerMonth != null ? Number(data.contractedVisitsPerMonth) : (existing?.contractedVisitsPerMonth ?? null),

    pricingModel: normalizePricingModel(data.pricingModel ?? existing?.pricingModel),
    monthlyPrice: Number(data.monthlyPrice || existing?.monthlyPrice || 0),
    pricePerService: Number(data.pricePerService || existing?.pricePerService || 0),
    pricePerHour: Number(data.pricePerHour || existing?.pricePerHour || 0),
    taxRate: data.taxRate != null ? Number(data.taxRate) : (existing?.taxRate ?? 21),
    taxIncluded: data.taxIncluded != null ? Boolean(data.taxIncluded) : (existing?.taxIncluded ?? false),

    assignedWorkerId: String(data.assignedWorkerId || existing?.assignedWorkerId || ''),
    assignedWorkerName: String(data.assignedWorkerName || existing?.assignedWorkerName || ''),
    backupWorkerId: String(data.backupWorkerId || existing?.backupWorkerId || ''),
    backupWorkerName: String(data.backupWorkerName || existing?.backupWorkerName || ''),

    materials,
    materialsIncluded: data.materialsIncluded != null ? Boolean(data.materialsIncluded) : (existing?.materialsIncluded ?? true),

    contractStatus: normalizeContractStatus(data.contractStatus ?? existing?.contractStatus),
    startDate: String(data.startDate || existing?.startDate || ''),
    endDate: String(data.endDate || existing?.endDate || ''),
    renewalDate: String(data.renewalDate || existing?.renewalDate || ''),
    autoRenew: data.autoRenew != null ? Boolean(data.autoRenew) : (existing?.autoRenew ?? false),
    renewalNoticeDays: Number(data.renewalNoticeDays || existing?.renewalNoticeDays || 30),

    observations: String(data.observations || existing?.observations || ''),
    clientInstructions: String(data.clientInstructions || existing?.clientInstructions || ''),

    billingEnabled: data.billingEnabled != null ? Boolean(data.billingEnabled) : (existing?.billingEnabled ?? false),
    billingDay: data.billingDay != null ? Number(data.billingDay) : (existing?.billingDay ?? 1),
    linkedInvoiceIds,

    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeServiceContract(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'service_contract',
    id: doc._id,
    contractNumber: doc.contractNumber || '',
    user_id: doc.user_id,

    clientId: doc.clientId || '',
    clientName: doc.clientName || '',
    clientPhone: doc.clientPhone || '',
    clientEmail: doc.clientEmail || '',
    clientType: normalizeServiceClientType(doc.clientType),

    address: doc.address || '',
    addressLine2: doc.addressLine2 || '',
    city: doc.city || '',
    postalCode: doc.postalCode || '',
    coordinates: doc.coordinates || null,
    zone: doc.zone || '',

    cleaningType: doc.cleaningType || 'general',
    frequency: normalizeServiceFrequency(doc.frequency),
    customFrequencyDays: Array.isArray(doc.customFrequencyDays) ? doc.customFrequencyDays : [],
    scheduleDays: Array.isArray(doc.scheduleDays) ? doc.scheduleDays : [],
    contractedHoursPerVisit: Number(doc.contractedHoursPerVisit || 0),
    contractedVisitsPerMonth: doc.contractedVisitsPerMonth ?? null,

    pricingModel: normalizePricingModel(doc.pricingModel),
    monthlyPrice: Number(doc.monthlyPrice || 0),
    pricePerService: Number(doc.pricePerService || 0),
    pricePerHour: Number(doc.pricePerHour || 0),
    taxRate: doc.taxRate ?? 21,
    taxIncluded: Boolean(doc.taxIncluded),

    assignedWorkerId: doc.assignedWorkerId || '',
    assignedWorkerName: doc.assignedWorkerName || '',
    backupWorkerId: doc.backupWorkerId || '',
    backupWorkerName: doc.backupWorkerName || '',

    materials: Array.isArray(doc.materials) ? doc.materials : [],
    materialsIncluded: doc.materialsIncluded ?? true,

    contractStatus: normalizeContractStatus(doc.contractStatus),
    startDate: doc.startDate || '',
    endDate: doc.endDate || '',
    renewalDate: doc.renewalDate || '',
    autoRenew: Boolean(doc.autoRenew),
    renewalNoticeDays: Number(doc.renewalNoticeDays || 30),

    observations: doc.observations || '',
    clientInstructions: doc.clientInstructions || '',

    billingEnabled: Boolean(doc.billingEnabled),
    billingDay: Number(doc.billingDay || 1),
    linkedInvoiceIds: Array.isArray(doc.linkedInvoiceIds) ? doc.linkedInvoiceIds : [],

    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listServiceContractsByUser(req, userId, filters = {}) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  let results = docs
    .filter((doc) => doc?.type === 'service_contract' && !doc?.deletedAt && (!userId || doc?.user_id === userId));

  if (filters.status) results = results.filter((d) => d.contractStatus === filters.status);
  if (filters.clientId) results = results.filter((d) => d.clientId === filters.clientId);
  if (filters.workerId) results = results.filter((d) => d.assignedWorkerId === filters.workerId);
  if (filters.zone) results = results.filter((d) => d.zone === filters.zone);

  return results.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ─── CONSTRUCTION (Constructora) ──────────────────────────────────────────────

export function getConstructionDbName() {
  return normalizeDbName(process.env.VITE_CONSTRUCTION_DB || `${getDbPrefix()}-construction`);
}

const CONSTRUCTION_PROJECT_TYPES = [
  'casa', 'local', 'piso', 'nave', 'promoción', 'colegio', 'gimnasio', 'oficina', 'otro',
];

const CONSTRUCTION_GUILDS = [
  'albanileria', 'carpinteria', 'carpinteria_aluminio', 'electricidad', 'fontaneria',
  'lampisteria', 'pladur', 'yeso', 'pintura', 'herreria_cerrajeria',
  'pavimentos_revestimientos', 'climatizacion', 'cristaleria', 'impermeabilizacion',
  'cubiertas_tejados', 'excavaciones_derribos', 'mobiliario_cocina_bano',
  'limpieza_final_obra', 'personalizado',
];

const CONSTRUCTION_GUILD_LABELS = {
  albanileria: 'Albañilería',
  carpinteria: 'Carpintería',
  carpinteria_aluminio: 'Carpintería de aluminio',
  electricidad: 'Electricidad',
  fontaneria: 'Fontanería',
  lampisteria: 'Lampistería',
  pladur: 'Pladur',
  yeso: 'Yeso',
  pintura: 'Pintura',
  herreria_cerrajeria: 'Herrería / Cerrajería',
  pavimentos_revestimientos: 'Pavimentos y revestimientos',
  climatizacion: 'Climatización',
  cristaleria: 'Cristalería',
  impermeabilizacion: 'Impermeabilización',
  cubiertas_tejados: 'Cubiertas / Tejados',
  excavaciones_derribos: 'Excavaciones / Derribos',
  mobiliario_cocina_bano: 'Mobiliario de cocina / baño',
  limpieza_final_obra: 'Limpieza final de obra',
  personalizado: 'Personalizado',
};

const GUILD_MIGRATION_MAP = {
  'carpintería': 'carpinteria',
  'peletería': 'personalizado',
  'lampistería': 'lampisteria',
  'pradurista': 'pladur',
  'yesero': 'yeso',
  'pintor': 'pintura',
  'herrero': 'herreria_cerrajeria',
  'electricista': 'electricidad',
  'fontanero': 'fontaneria',
  'albañil': 'albanileria',
  'otro': 'personalizado',
};

const CONSTRUCTION_UNITS = [
  { key: 'ud', label: 'Unidad (ud)' },
  { key: 'm2', label: 'Metro cuadrado (m²)' },
  { key: 'm3', label: 'Metro cúbico (m³)' },
  { key: 'ml', label: 'Metro lineal (ml)' },
  { key: 'kg', label: 'Kilogramo (kg)' },
  { key: 'h', label: 'Hora (h)' },
  { key: 'pa', label: 'Partida alzada (pa)' },
  { key: 'global', label: 'Global' },
];

function migrateGuildType(tipo) {
  if (!tipo) return 'personalizado';
  const s = String(tipo);
  if (CONSTRUCTION_GUILDS.includes(s)) return s;
  if (GUILD_MIGRATION_MAP[s]) return GUILD_MIGRATION_MAP[s];
  return s;
}

export function buildConstructionPredefinedPartidaDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cppt-${uuidv4()}`;
  const codigo = existing?.codigo || `PPT-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const precioMateriales = Number(data.precioMateriales ?? existing?.precioMateriales ?? 0);
  const precioManoObra = Number(data.precioManoObra ?? existing?.precioManoObra ?? 0);
  const precioEstructural = Number(data.precioEstructural ?? existing?.precioEstructural ?? 0);
  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_predefined_partida',
    id,
    user_id: userId,
    codigo,
    nombre: String(data.nombre || existing?.nombre || ''),
    descripcion: String(data.descripcion || existing?.descripcion || ''),
    gremio: migrateGuildType(data.gremio ?? existing?.gremio),
    categoria: String(data.categoria || existing?.categoria || ''),
    unidad: String(data.unidad || existing?.unidad || 'ud'),
    precioMateriales,
    precioManoObra,
    precioEstructural,
    precioUnitario: precioMateriales + precioManoObra + precioEstructural,
    materialesVinculados: Array.isArray(data.materialesVinculados) ? data.materialesVinculados.map(m => ({
      catalogItemId: String(m.catalogItemId || ''),
      nombre: String(m.nombre || ''),
      cantidadPorUnidad: Number(m.cantidadPorUnidad ?? 0),
      unidad: String(m.unidad || ''),
    })) : (existing?.materialesVinculados || []),
    precioActualizado: String(data.precioActualizado || existing?.precioActualizado || now.slice(0, 10)),
    precioValidadoPor: String(data.precioValidadoPor || existing?.precioValidadoPor || ''),
    precioValidadoPorNombre: String(data.precioValidadoPorNombre || existing?.precioValidadoPorNombre || ''),
    historialPrecios: Array.isArray(data.historialPrecios) ? data.historialPrecios : (existing?.historialPrecios || []),
    activa: data.activa !== undefined ? Boolean(data.activa) : (existing?.activa !== undefined ? existing.activa : true),
    orden: Number(data.orden ?? existing?.orden ?? 0),
    notas: String(data.notas || existing?.notas || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeConstructionPredefinedPartida(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'construction_predefined_partida', id: doc._id,
    user_id: doc.user_id,
    codigo: doc.codigo || '',
    nombre: doc.nombre || '', descripcion: doc.descripcion || '',
    gremio: migrateGuildType(doc.gremio), categoria: doc.categoria || '',
    unidad: doc.unidad || 'ud',
    precioMateriales: Number(doc.precioMateriales || 0),
    precioManoObra: Number(doc.precioManoObra || 0),
    precioEstructural: Number(doc.precioEstructural || 0),
    precioUnitario: Number(doc.precioUnitario || 0),
    materialesVinculados: Array.isArray(doc.materialesVinculados) ? doc.materialesVinculados : [],
    precioActualizado: doc.precioActualizado || '',
    precioValidadoPor: doc.precioValidadoPor || '',
    precioValidadoPorNombre: doc.precioValidadoPorNombre || '',
    historialPrecios: Array.isArray(doc.historialPrecios) ? doc.historialPrecios : [],
    activa: doc.activa !== false,
    orden: Number(doc.orden || 0),
    notas: doc.notas || '',
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}

const BUDGET_STATES = ['borrador', 'enviado', 'aceptado', 'rechazado'];
const PAYMENT_METHODS = ['contado', 'plazos', 'transferencia'];

function normalizeConstructionStatus(value) {
  const allowed = ['pendiente_planificacion', 'planificación', 'en_obra', 'pausada', 'finalizada', 'cerrada'];
  return allowed.includes(String(value || '')) ? String(value) : 'planificación';
}

function normalizeBudgetStatus(value) {
  return BUDGET_STATES.includes(String(value || '')) ? String(value) : 'borrador';
}

// ── Clients ──

const CONSTRUCTION_CLIENT_TYPES = ['particular', 'empresa', 'autonomo', 'comunidad_propietarios', 'promotora', 'administracion_publica'];
const CONSTRUCTION_COMMERCIAL_STATUSES = ['prospecto', 'contactado', 'presupuestado', 'en_obra', 'fidelizado', 'inactivo', 'perdido'];
const CONSTRUCTION_IVA_REGIMES = ['general', 'simplificado', 'recargo_equivalencia', 'exento', 'intracomunitario'];
const CONSTRUCTION_CLIENT_ORIGINS = ['directo', 'referido', 'web', 'publicidad', 'inmobiliaria', 'arquitecto', 'otro'];
const CONSTRUCTION_ADDRESS_TYPES = ['obra', 'domicilio', 'fiscal', 'correspondencia', 'otro'];
const CONSTRUCTION_INMUEBLE_TYPES = ['vivienda', 'local_comercial', 'nave_industrial', 'terreno', 'garaje', 'oficina', 'edificio', 'otro'];
const CONSTRUCTION_INMUEBLE_STATES = ['planificado', 'en_obra', 'finalizado', 'entregado'];
const CONSTRUCTION_NOTE_TYPES = ['llamada', 'visita', 'email', 'reunion', 'nota_interna', 'cambio_estado', 'otro'];

function sanitizeConstructionClientAddress(d, i) {
  if (!d || typeof d !== 'object') return null;
  return {
    id: d.id || `dir-${i}-${Date.now()}`,
    etiqueta: String(d.etiqueta || ''),
    tipo: CONSTRUCTION_ADDRESS_TYPES.includes(String(d.tipo)) ? String(d.tipo) : 'otro',
    calle: String(d.calle || ''),
    numero: String(d.numero || ''),
    piso: String(d.piso || ''),
    codigoPostal: String(d.codigoPostal || ''),
    ciudad: String(d.ciudad || ''),
    provincia: String(d.provincia || ''),
    pais: String(d.pais || 'España'),
    esPrincipal: Boolean(d.esPrincipal),
    coordenadas: d.coordenadas || null,
  };
}

function sanitizeConstructionClientContact(c, i) {
  if (!c || typeof c !== 'object') return null;
  return {
    id: c.id || `cnt-${i}-${Date.now()}`,
    nombre: String(c.nombre || ''),
    cargo: String(c.cargo || ''),
    telefono: String(c.telefono || ''),
    email: String(c.email || ''),
    notas: String(c.notas || ''),
    esPrincipal: Boolean(c.esPrincipal),
  };
}

function sanitizeConstructionClientInmueble(inm, i) {
  if (!inm || typeof inm !== 'object') return null;
  return {
    id: inm.id || `inm-${i}-${Date.now()}`,
    tipo: CONSTRUCTION_INMUEBLE_TYPES.includes(String(inm.tipo)) ? String(inm.tipo) : 'otro',
    descripcion: String(inm.descripcion || ''),
    direccion: String(inm.direccion || ''),
    referenciaCatastral: String(inm.referenciaCatastral || ''),
    superficie: Number(inm.superficie || 0),
    obraId: String(inm.obraId || ''),
    obraNombre: String(inm.obraNombre || ''),
    estado: CONSTRUCTION_INMUEBLE_STATES.includes(String(inm.estado)) ? String(inm.estado) : 'planificado',
    notas: String(inm.notas || ''),
  };
}

function sanitizeConstructionClientNote(n, i) {
  if (!n || typeof n !== 'object') return null;
  return {
    id: n.id || `nota-${i}-${Date.now()}`,
    texto: String(n.texto || ''),
    tipo: CONSTRUCTION_NOTE_TYPES.includes(String(n.tipo)) ? String(n.tipo) : 'otro',
    autor: String(n.autor || ''),
    autorNombre: String(n.autorNombre || ''),
    fecha: String(n.fecha || new Date().toISOString()),
    obraId: String(n.obraId || ''),
    obraNombre: String(n.obraNombre || ''),
    adjuntos: Array.isArray(n.adjuntos) ? n.adjuntos.map(a => ({
      nombre: String(a.nombre || ''), url: String(a.url || ''), mimeType: String(a.mimeType || ''),
    })) : [],
  };
}

export function buildConstructionClientDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `ccli-${uuidv4()}`;

  const documentos = Array.isArray(data.documentos) ? data.documentos.map((d, i) => ({
    id: d.id || `doc-${i}-${Date.now()}`,
    nombre: String(d.nombre || ''),
    tipo: String(d.tipo || 'otro'),
    url: String(d.url || ''),
    fecha: String(d.fecha || ''),
    ocrData: d.ocrData || null,
    fileBase64: String(d.fileBase64 || ''),
    fileMimeType: String(d.fileMimeType || ''),
  })) : (existing?.documentos || []);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_client',
    id,
    user_id: userId,
    nombre: String(data.nombre || existing?.nombre || ''),
    cif: String(data.cif || existing?.cif || ''),
    telefono: String(data.telefono || existing?.telefono || ''),
    email: String(data.email || existing?.email || ''),
    direccion: String(data.direccion || existing?.direccion || ''),

    tipoCliente: CONSTRUCTION_CLIENT_TYPES.includes(String(data.tipoCliente))
      ? String(data.tipoCliente) : (existing?.tipoCliente || 'particular'),
    razonSocial: String(data.razonSocial ?? existing?.razonSocial ?? ''),
    direccionFiscal: String(data.direccionFiscal ?? existing?.direccionFiscal ?? ''),
    ciudadFiscal: String(data.ciudadFiscal ?? existing?.ciudadFiscal ?? ''),
    cpFiscal: String(data.cpFiscal ?? existing?.cpFiscal ?? ''),
    provinciaFiscal: String(data.provinciaFiscal ?? existing?.provinciaFiscal ?? ''),
    paisFiscal: String(data.paisFiscal ?? existing?.paisFiscal ?? 'España'),
    regimenIva: CONSTRUCTION_IVA_REGIMES.includes(String(data.regimenIva))
      ? String(data.regimenIva) : (existing?.regimenIva || 'general'),

    estadoComercial: CONSTRUCTION_COMMERCIAL_STATUSES.includes(String(data.estadoComercial))
      ? String(data.estadoComercial) : (existing?.estadoComercial || 'prospecto'),
    responsableId: String(data.responsableId ?? existing?.responsableId ?? ''),
    responsableNombre: String(data.responsableNombre ?? existing?.responsableNombre ?? ''),
    origenCliente: CONSTRUCTION_CLIENT_ORIGINS.includes(String(data.origenCliente))
      ? String(data.origenCliente) : (existing?.origenCliente || 'directo'),
    referidoPor: String(data.referidoPor ?? existing?.referidoPor ?? ''),

    direcciones: Array.isArray(data.direcciones)
      ? data.direcciones.map(sanitizeConstructionClientAddress).filter(Boolean)
      : (existing?.direcciones || []),
    contactos: Array.isArray(data.contactos)
      ? data.contactos.map(sanitizeConstructionClientContact).filter(Boolean)
      : (existing?.contactos || []),
    inmuebles: Array.isArray(data.inmuebles)
      ? data.inmuebles.map(sanitizeConstructionClientInmueble).filter(Boolean)
      : (existing?.inmuebles || []),

    notasEstructuradas: Array.isArray(data.notasEstructuradas)
      ? data.notasEstructuradas.map(sanitizeConstructionClientNote).filter(Boolean)
      : (existing?.notasEstructuradas || []),

    tags: Array.isArray(data.tags) ? data.tags.map(t => String(t)) : (existing?.tags || []),
    crmClientId: String(data.crmClientId ?? existing?.crmClientId ?? ''),
    crmLeadId: String(data.crmLeadId ?? existing?.crmLeadId ?? ''),

    consentimientos: {
      proteccionDatos: Boolean(data.consentimientos?.proteccionDatos ?? existing?.consentimientos?.proteccionDatos),
      comunicacionesComerciales: Boolean(data.consentimientos?.comunicacionesComerciales ?? existing?.consentimientos?.comunicacionesComerciales),
      cesionTerceros: Boolean(data.consentimientos?.cesionTerceros ?? existing?.consentimientos?.cesionTerceros),
    },

    documentos,
    notas: String(data.notas ?? existing?.notas ?? ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeConstructionClient(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'construction_client', id: doc._id,
    user_id: doc.user_id,
    nombre: doc.nombre || '', cif: doc.cif || '', telefono: doc.telefono || '',
    email: doc.email || '', direccion: doc.direccion || '', notas: doc.notas || '',

    tipoCliente: doc.tipoCliente || 'particular',
    razonSocial: doc.razonSocial || '',
    direccionFiscal: doc.direccionFiscal || '',
    ciudadFiscal: doc.ciudadFiscal || '',
    cpFiscal: doc.cpFiscal || '',
    provinciaFiscal: doc.provinciaFiscal || '',
    paisFiscal: doc.paisFiscal || 'España',
    regimenIva: doc.regimenIva || 'general',

    estadoComercial: doc.estadoComercial || 'prospecto',
    responsableId: doc.responsableId || '',
    responsableNombre: doc.responsableNombre || '',
    origenCliente: doc.origenCliente || 'directo',
    referidoPor: doc.referidoPor || '',

    direcciones: Array.isArray(doc.direcciones) ? doc.direcciones : [],
    contactos: Array.isArray(doc.contactos) ? doc.contactos : [],
    inmuebles: Array.isArray(doc.inmuebles) ? doc.inmuebles : [],
    notasEstructuradas: Array.isArray(doc.notasEstructuradas) ? doc.notasEstructuradas : [],

    tags: Array.isArray(doc.tags) ? doc.tags : [],
    crmClientId: doc.crmClientId || '',
    crmLeadId: doc.crmLeadId || '',

    consentimientos: {
      proteccionDatos: Boolean(doc.consentimientos?.proteccionDatos),
      comunicacionesComerciales: Boolean(doc.consentimientos?.comunicacionesComerciales),
      cesionTerceros: Boolean(doc.consentimientos?.cesionTerceros),
    },

    documentos: Array.isArray(doc.documentos) ? doc.documentos : [],
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}

// ── Guilds (Gremios) ──

export function buildConstructionGuildDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cgld-${uuidv4()}`;
  const tipo = migrateGuildType(data.tipo ?? existing?.tipo);
  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_guild',
    id,
    user_id: userId,
    nombre: String(data.nombre || existing?.nombre || ''),
    tipo,
    contacto: String(data.contacto || existing?.contacto || ''),
    telefono: String(data.telefono || existing?.telefono || ''),
    email: String(data.email || existing?.email || ''),
    descripcion: String(data.descripcion || existing?.descripcion || ''),
    precioMateriales: Number(data.precioMateriales ?? existing?.precioMateriales ?? 0),
    precioManoObra: Number(data.precioManoObra ?? existing?.precioManoObra ?? 0),
    precioEstructural: Number(data.precioEstructural ?? existing?.precioEstructural ?? 0),
    precioTotal: Number(data.precioMateriales ?? existing?.precioMateriales ?? 0)
      + Number(data.precioManoObra ?? existing?.precioManoObra ?? 0)
      + Number(data.precioEstructural ?? existing?.precioEstructural ?? 0),
    tarifaHora: Number(data.tarifaHora ?? existing?.tarifaHora ?? 0),
    margenDefecto: Number(data.margenDefecto ?? existing?.margenDefecto ?? 0),
    totalPartidas: Number(data.totalPartidas ?? existing?.totalPartidas ?? 0),
    preciosActualizados: String(data.preciosActualizados || existing?.preciosActualizados || ''),
    esPersonalizado: tipo === 'personalizado' ? true : Boolean(data.esPersonalizado ?? existing?.esPersonalizado ?? false),
    color: String(data.color || existing?.color || ''),
    icono: String(data.icono || existing?.icono || ''),
    notas: String(data.notas || existing?.notas || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeConstructionGuild(doc) {
  if (!doc) return null;
  const tipo = migrateGuildType(doc.tipo);
  return {
    _id: doc._id, _rev: doc._rev, type: 'construction_guild', id: doc._id,
    user_id: doc.user_id,
    nombre: doc.nombre || '', tipo,
    contacto: doc.contacto || '', telefono: doc.telefono || '', email: doc.email || '',
    descripcion: doc.descripcion || '',
    precioMateriales: Number(doc.precioMateriales || 0),
    precioManoObra: Number(doc.precioManoObra || 0),
    precioEstructural: Number(doc.precioEstructural || 0),
    precioTotal: Number(doc.precioTotal || 0),
    tarifaHora: Number(doc.tarifaHora || 0),
    margenDefecto: Number(doc.margenDefecto || 0),
    totalPartidas: Number(doc.totalPartidas || 0),
    preciosActualizados: doc.preciosActualizados || '',
    esPersonalizado: tipo === 'personalizado' || Boolean(doc.esPersonalizado),
    color: doc.color || '', icono: doc.icono || '',
    notas: doc.notas || '',
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}

// ── Projects (Obras) ──

export function buildConstructionProjectDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cprj-${uuidv4()}`;
  const tipoObra = CONSTRUCTION_PROJECT_TYPES.includes(String(data.tipoObra)) ? String(data.tipoObra) : (existing?.tipoObra || 'casa');

  const partidas = Array.isArray(data.partidas) ? data.partidas.map((p, i) => ({
    id: p.id || i + 1,
    gremio: String(p.gremio || ''),
    descripcion: String(p.descripcion || ''),
    materiales: Number(p.materiales ?? 0),
    manoObra: Number(p.manoObra ?? 0),
    estructural: Number(p.estructural ?? 0),
    subtotal: Number(p.materiales ?? 0) + Number(p.manoObra ?? 0) + Number(p.estructural ?? 0),
  })) : (existing?.partidas || []);

  const gremios = Array.isArray(data.gremios) ? data.gremios.map(String) : (existing?.gremios || []);

  const historial = Array.isArray(data.historial) ? data.historial.map(h => ({
    fecha: String(h.fecha || ''),
    accion: String(h.accion || ''),
    actor: String(h.actor || ''),
    detalle: String(h.detalle || ''),
  })) : (existing?.historial || []);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_project',
    id,
    user_id: userId,
    nombre: String(data.nombre || existing?.nombre || ''),
    tipoObra,
    ubicacion: String(data.ubicacion || existing?.ubicacion || ''),
    clienteId: String(data.clienteId || existing?.clienteId || ''),
    clienteNombre: String(data.clienteNombre || existing?.clienteNombre || ''),
    fechaInicio: String(data.fechaInicio || existing?.fechaInicio || ''),
    fechaFinPrevista: String(data.fechaFinPrevista || existing?.fechaFinPrevista || ''),
    presupuestoId: String(data.presupuestoId || existing?.presupuestoId || ''),
    presupuestoRef: String(data.presupuestoRef || existing?.presupuestoRef || ''),
    importeTotal: Number(data.importeTotal ?? existing?.importeTotal ?? 0),
    partidas,
    gremios,
    responsableId: String(data.responsableId || existing?.responsableId || ''),
    responsableNombre: String(data.responsableNombre || existing?.responsableNombre || ''),
    fechaAceptacion: String(data.fechaAceptacion || existing?.fechaAceptacion || ''),
    origenAutoConversion: data.origenAutoConversion != null ? Boolean(data.origenAutoConversion) : (existing?.origenAutoConversion ?? false),
    historial,
    estado: normalizeConstructionStatus(data.estado ?? existing?.estado),
    progreso: Math.min(100, Math.max(0, Number(data.progreso ?? existing?.progreso ?? 0))),
    horasEstimadas: Number(data.horasEstimadas ?? existing?.horasEstimadas ?? 0),
    horasAcumuladas: Number(data.horasAcumuladas ?? existing?.horasAcumuladas ?? 0),
    costeAcumulado: Number(data.costeAcumulado ?? existing?.costeAcumulado ?? 0),
    notas: String(data.notas || existing?.notas || ''),
    archivada: Boolean(data.archivada ?? existing?.archivada ?? false),
    fechaCierre: String(data.fechaCierre || existing?.fechaCierre || ''),
    cerradoPor: String(data.cerradoPor || existing?.cerradoPor || ''),
    cerradoPorNombre: String(data.cerradoPorNombre || existing?.cerradoPorNombre || ''),
    motivoCierre: String(data.motivoCierre || existing?.motivoCierre || ''),
    resumenCierre: data.resumenCierre || existing?.resumenCierre || null,
    fechaReapertura: String(data.fechaReapertura || existing?.fechaReapertura || ''),
    reabiertoPor: String(data.reabiertoPor || existing?.reabiertoPor || ''),
    reabiertoPorNombre: String(data.reabiertoPorNombre || existing?.reabiertoPorNombre || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeConstructionProject(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'construction_project', id: doc._id,
    user_id: doc.user_id,
    nombre: doc.nombre || '', tipoObra: doc.tipoObra || 'casa',
    ubicacion: doc.ubicacion || '',
    clienteId: doc.clienteId || '', clienteNombre: doc.clienteNombre || '',
    fechaInicio: doc.fechaInicio || '', fechaFinPrevista: doc.fechaFinPrevista || '',
    presupuestoId: doc.presupuestoId || '',
    presupuestoRef: doc.presupuestoRef || '',
    importeTotal: Number(doc.importeTotal || 0),
    partidas: Array.isArray(doc.partidas) ? doc.partidas : [],
    gremios: Array.isArray(doc.gremios) ? doc.gremios : [],
    responsableId: doc.responsableId || '', responsableNombre: doc.responsableNombre || '',
    fechaAceptacion: doc.fechaAceptacion || '',
    origenAutoConversion: Boolean(doc.origenAutoConversion),
    historial: Array.isArray(doc.historial) ? doc.historial : [],
    estado: normalizeConstructionStatus(doc.estado),
    progreso: Number(doc.progreso || 0),
    horasEstimadas: Number(doc.horasEstimadas || 0),
    horasAcumuladas: Number(doc.horasAcumuladas || 0),
    costeAcumulado: Number(doc.costeAcumulado || 0),
    notas: doc.notas || '',
    archivada: Boolean(doc.archivada),
    fechaCierre: doc.fechaCierre || '',
    cerradoPor: doc.cerradoPor || '',
    cerradoPorNombre: doc.cerradoPorNombre || '',
    motivoCierre: doc.motivoCierre || '',
    resumenCierre: doc.resumenCierre || null,
    fechaReapertura: doc.fechaReapertura || '',
    reabiertoPor: doc.reabiertoPor || '',
    reabiertoPorNombre: doc.reabiertoPorNombre || '',
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}

// ── Budgets (Presupuestos) ──

export function buildConstructionBudgetDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cbud-${uuidv4()}`;
  const referencia = existing?.referencia || `PRE-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const partidas = Array.isArray(data.partidas) ? data.partidas.map((p, i) => {
    const qty = Number(p.cantidad ?? 1);
    const puMat = Number(p.precioUnitarioMateriales ?? p.materiales ?? 0);
    const puMo = Number(p.precioUnitarioManoObra ?? p.manoObra ?? 0);
    const puEst = Number(p.precioUnitarioEstructural ?? p.estructural ?? 0);
    const pu = puMat + puMo + puEst;
    return {
      id: p.id || `bp-${i + 1}-${Date.now()}`,
      partidaPredefinidaId: String(p.partidaPredefinidaId || ''),
      gremio: String(p.gremio || ''),
      nombre: String(p.nombre || ''),
      descripcion: String(p.descripcion || ''),
      unidad: String(p.unidad || 'ud'),
      cantidad: qty,
      precioUnitarioMateriales: puMat,
      precioUnitarioManoObra: puMo,
      precioUnitarioEstructural: puEst,
      precioUnitario: pu,
      materiales: qty * puMat,
      manoObra: qty * puMo,
      estructural: qty * puEst,
      subtotal: qty * pu,
    };
  }) : (existing?.partidas || []);

  const totalPartidas = partidas.reduce((s, p) => s + p.subtotal, 0);

  const subtotalesPorGremio = Object.entries(
    partidas.reduce((acc, p) => { const k = p.gremio || 'sin_gremio'; acc[k] = (acc[k] || 0) + p.subtotal; return acc; }, {})
  ).map(([gremio, subtotal]) => ({ gremio, subtotal }));

  const pagos = Array.isArray(data.pagos) ? data.pagos.map((pg, i) => ({
    id: pg.id || i + 1,
    concepto: String(pg.concepto || ''),
    importe: Number(pg.importe ?? 0),
    fecha: String(pg.fecha || ''),
    pagado: Boolean(pg.pagado),
    fechaPago: String(pg.fechaPago || ''),
    justificante: String(pg.justificante || ''),
    metodo: String(pg.metodo || ''),
  })) : (existing?.pagos || []);

  const totalPagado = pagos.filter(p => p.pagado).reduce((s, p) => s + p.importe, 0);

  const pagosProveedor = Array.isArray(data.pagosProveedor) ? data.pagosProveedor.map((pp, i) => ({
    id: pp.id || i + 1,
    gremioId: String(pp.gremioId || ''),
    gremioNombre: String(pp.gremioNombre || ''),
    concepto: String(pp.concepto || ''),
    importe: Number(pp.importe ?? 0),
    fechaVencimiento: String(pp.fechaVencimiento || ''),
    pagado: Boolean(pp.pagado),
    fechaPago: String(pp.fechaPago || ''),
    justificante: String(pp.justificante || ''),
    observaciones: String(pp.observaciones || ''),
  })) : (existing?.pagosProveedor || []);

  const rawClienteFiscal = data.clienteDireccionFiscal || existing?.clienteDireccionFiscal || {};

  const documentos = Array.isArray(data.documentos) ? data.documentos.map((d, i) => ({
    id: d.id || `bdoc-${i}-${Date.now()}`,
    nombre: String(d.nombre || ''),
    tipo: String(d.tipo || 'otro'),
    url: String(d.url || ''),
    fecha: String(d.fecha || ''),
    fileBase64: String(d.fileBase64 || ''),
    fileMimeType: String(d.fileMimeType || ''),
  })) : (existing?.documentos || []);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_budget',
    id,
    user_id: userId,
    referencia,
    proyectoId: String(data.proyectoId || existing?.proyectoId || ''),
    proyectoNombre: String(data.proyectoNombre || existing?.proyectoNombre || ''),
    clienteId: String(data.clienteId || existing?.clienteId || ''),
    clienteNombre: String(data.clienteNombre || existing?.clienteNombre || ''),
    clienteCif: String(data.clienteCif || existing?.clienteCif || ''),
    clienteTelefono: String(data.clienteTelefono || existing?.clienteTelefono || ''),
    clienteEmail: String(data.clienteEmail || existing?.clienteEmail || ''),
    clienteDireccionFiscal: {
      calle: String(rawClienteFiscal.calle || ''),
      codigoPostal: String(rawClienteFiscal.codigoPostal || ''),
      ciudad: String(rawClienteFiscal.ciudad || ''),
      provincia: String(rawClienteFiscal.provincia || ''),
      pais: String(rawClienteFiscal.pais || ''),
    },
    clienteFormaPago: PAYMENT_METHODS.includes(String(data.clienteFormaPago)) ? String(data.clienteFormaPago) : (existing?.clienteFormaPago || ''),
    tipoObra: CONSTRUCTION_PROJECT_TYPES.includes(String(data.tipoObra)) ? String(data.tipoObra) : (existing?.tipoObra || 'casa'),
    direccionObra: String(data.direccionObra || existing?.direccionObra || ''),
    descripcionObra: String(data.descripcionObra || existing?.descripcionObra || ''),
    fecha: String(data.fecha || existing?.fecha || ''),
    partidas,
    totalPartidas,
    subtotalesPorGremio,
    margen: Number(data.margen ?? existing?.margen ?? 15),
    margenMinimo: Number(data.margenMinimo ?? existing?.margenMinimo ?? 10),
    totalConMargen: totalPartidas * (1 + Number(data.margen ?? existing?.margen ?? 15) / 100),
    estado: normalizeBudgetStatus(data.estado ?? existing?.estado),
    metodoPago: PAYMENT_METHODS.includes(String(data.metodoPago)) ? String(data.metodoPago) : (existing?.metodoPago || ''),
    numPlazos: Number(data.numPlazos ?? existing?.numPlazos ?? 1),
    pagos,
    totalPagado,
    pendientePago: totalPartidas * (1 + Number(data.margen ?? existing?.margen ?? 15) / 100) - totalPagado,
    pagosProveedor,
    motivoRechazo: String(data.motivoRechazo || existing?.motivoRechazo || ''),
    enviadoAt: String(data.enviadoAt || existing?.enviadoAt || ''),
    creadoPor: String(data.creadoPor || existing?.creadoPor || ''),
    creadoPorNombre: String(data.creadoPorNombre || existing?.creadoPorNombre || ''),
    documentos,
    notas: String(data.notas || existing?.notas || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeConstructionBudget(doc) {
  if (!doc) return null;
  const partidas = Array.isArray(doc.partidas) ? doc.partidas : [];
  const pagos = Array.isArray(doc.pagos) ? doc.pagos : [];
  const rawFiscal = doc.clienteDireccionFiscal || {};
  return {
    _id: doc._id, _rev: doc._rev, type: 'construction_budget', id: doc._id,
    user_id: doc.user_id,
    referencia: doc.referencia || '',
    proyectoId: doc.proyectoId || '', proyectoNombre: doc.proyectoNombre || '',
    clienteId: doc.clienteId || '', clienteNombre: doc.clienteNombre || '',
    clienteCif: doc.clienteCif || '', clienteTelefono: doc.clienteTelefono || '',
    clienteEmail: doc.clienteEmail || '',
    clienteDireccionFiscal: {
      calle: rawFiscal.calle || '', codigoPostal: rawFiscal.codigoPostal || '',
      ciudad: rawFiscal.ciudad || '', provincia: rawFiscal.provincia || '', pais: rawFiscal.pais || '',
    },
    clienteFormaPago: doc.clienteFormaPago || '',
    tipoObra: doc.tipoObra || 'casa',
    direccionObra: doc.direccionObra || '', descripcionObra: doc.descripcionObra || '',
    fecha: doc.fecha || '',
    partidas, totalPartidas: Number(doc.totalPartidas || 0),
    margen: Number(doc.margen ?? 15),
    margenMinimo: Number(doc.margenMinimo ?? 10),
    totalConMargen: Number(doc.totalConMargen || 0),
    estado: normalizeBudgetStatus(doc.estado),
    metodoPago: doc.metodoPago || '',
    numPlazos: Number(doc.numPlazos || 1),
    pagos, totalPagado: Number(doc.totalPagado || 0),
    pendientePago: Number(doc.pendientePago || 0),
    motivoRechazo: doc.motivoRechazo || '',
    enviadoAt: doc.enviadoAt || '',
    creadoPor: doc.creadoPor || '', creadoPorNombre: doc.creadoPorNombre || '',
    documentos: Array.isArray(doc.documentos) ? doc.documentos : [],
    notas: doc.notas || '',
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}

// ── Budget Templates (Plantillas de partidas) ──

export function buildConstructionBudgetTemplateDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cbtpl-${uuidv4()}`;

  const partidas = Array.isArray(data.partidas) ? data.partidas.map((p, i) => ({
    id: p.id || i + 1,
    gremio: String(p.gremio || ''),
    descripcion: String(p.descripcion || ''),
    materiales: Number(p.materiales ?? 0),
    manoObra: Number(p.manoObra ?? 0),
    estructural: Number(p.estructural ?? 0),
    subtotal: Number(p.materiales ?? 0) + Number(p.manoObra ?? 0) + Number(p.estructural ?? 0),
  })) : (existing?.partidas || []);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_budget_template',
    id,
    user_id: userId,
    nombre: String(data.nombre || existing?.nombre || ''),
    gremio: String(data.gremio || existing?.gremio || ''),
    partidas,
    notas: String(data.notas || existing?.notas || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeConstructionBudgetTemplate(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'construction_budget_template', id: doc._id,
    user_id: doc.user_id,
    nombre: doc.nombre || '', gremio: doc.gremio || '',
    partidas: Array.isArray(doc.partidas) ? doc.partidas : [],
    notas: doc.notas || '',
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}

// ── Workers (Trabajadores) ──

export function buildConstructionWorkerDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cwrk-${uuidv4()}`;
  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_worker',
    id,
    user_id: userId,
    nombre: String(data.nombre || existing?.nombre || ''),
    dni: String(data.dni || existing?.dni || ''),
    telefono: String(data.telefono || existing?.telefono || ''),
    email: String(data.email || existing?.email || ''),
    gremio: migrateGuildType(data.gremio ?? existing?.gremio),
    obraAsignada: String(data.obraAsignada || existing?.obraAsignada || ''),
    obraNombre: String(data.obraNombre || existing?.obraNombre || ''),
    ubicacionObra: String(data.ubicacionObra || existing?.ubicacionObra || ''),
    documentos: Array.isArray(data.documentos) ? data.documentos.map(d => ({
      id: String(d.id || d._id || `wdoc-${uuidv4()}`),
      tipo: String(d.tipo || 'otro'),
      nombre: String(d.nombre || ''),
      url: String(d.url || ''),
      fechaEmision: String(d.fechaEmision || d.fecha || ''),
      fechaCaducidad: String(d.fechaCaducidad || ''),
      verificado: Boolean(d.verificado ?? false),
      verificadoPor: String(d.verificadoPor || ''),
      verificadoAt: String(d.verificadoAt || ''),
      observaciones: String(d.observaciones || ''),
    })) : (existing?.documentos || []),
    activo: data.activo != null ? Boolean(data.activo) : (existing?.activo ?? true),
    notas: String(data.notas || existing?.notas || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeConstructionWorker(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'construction_worker', id: doc._id,
    user_id: doc.user_id,
    nombre: doc.nombre || '', dni: doc.dni || '',
    telefono: doc.telefono || '', email: doc.email || '',
    gremio: doc.gremio || 'otro',
    obraAsignada: doc.obraAsignada || '', obraNombre: doc.obraNombre || '',
    ubicacionObra: doc.ubicacionObra || '',
    documentos: Array.isArray(doc.documentos) ? doc.documentos : [],
    activo: doc.activo ?? true,
    notas: doc.notas || '',
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}

// ── List helpers ──

export async function listConstructionDocsByType(req, userId, docType) {
  const db = getConstructionDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === docType && !doc?.deletedAt && (!userId || doc?.user_id === userId))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ── Tasks (Tareas de obra para trabajadores) ──

const TASK_STATUSES = ['pendiente', 'en_progreso', 'completada', 'cancelada'];

export function buildConstructionTaskDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `ctsk-${uuidv4()}`;

  const fotos = Array.isArray(data.fotos) ? data.fotos.map((f, i) => ({
    id: f.id || `foto-${i}-${Date.now()}`,
    url: String(f.url || ''),
    base64: String(f.base64 || ''),
    mimeType: String(f.mimeType || 'image/jpeg'),
    descripcion: String(f.descripcion || ''),
    fecha: String(f.fecha || now),
  })) : (existing?.fotos || []);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_task',
    id,
    user_id: userId,
    titulo: String(data.titulo || existing?.titulo || ''),
    descripcion: String(data.descripcion || existing?.descripcion || ''),
    obraId: String(data.obraId || existing?.obraId || ''),
    obraNombre: String(data.obraNombre || existing?.obraNombre || ''),
    trabajadorId: String(data.trabajadorId || existing?.trabajadorId || ''),
    trabajadorNombre: String(data.trabajadorNombre || existing?.trabajadorNombre || ''),
    gremio: migrateGuildType(data.gremio ?? existing?.gremio),
    prioridad: ['baja', 'media', 'alta', 'urgente'].includes(String(data.prioridad)) ? String(data.prioridad) : (existing?.prioridad || 'media'),
    estado: TASK_STATUSES.includes(String(data.estado)) ? String(data.estado) : (existing?.estado || 'pendiente'),
    fechaLimite: String(data.fechaLimite || existing?.fechaLimite || ''),
    fotos,
    notasAdmin: String(data.notasAdmin || existing?.notasAdmin || ''),
    notasTrabajador: String(data.notasTrabajador || existing?.notasTrabajador || ''),
    creadoPor: String(data.creadoPor || existing?.creadoPor || ''),
    creadoPorNombre: String(data.creadoPorNombre || existing?.creadoPorNombre || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeConstructionTask(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'construction_task', id: doc._id,
    user_id: doc.user_id,
    titulo: doc.titulo || '', descripcion: doc.descripcion || '',
    obraId: doc.obraId || '', obraNombre: doc.obraNombre || '',
    trabajadorId: doc.trabajadorId || '', trabajadorNombre: doc.trabajadorNombre || '',
    gremio: doc.gremio || '',
    prioridad: doc.prioridad || 'media',
    estado: doc.estado || 'pendiente',
    fechaLimite: doc.fechaLimite || '',
    fotos: Array.isArray(doc.fotos) ? doc.fotos : [],
    notasAdmin: doc.notasAdmin || '',
    notasTrabajador: doc.notasTrabajador || '',
    creadoPor: doc.creadoPor || '', creadoPorNombre: doc.creadoPorNombre || '',
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}

// ── Daily Reports (Partes diarios de obra) ──

const DAILY_REPORT_STATUSES = ['borrador', 'enviado', 'validado', 'rechazado'];
const CONSTRUCTION_INCIDENT_TYPES = ['seguridad', 'calidad', 'material', 'maquinaria', 'accidente', 'clima', 'otro'];
const CONSTRUCTION_INCIDENT_SEVERITIES = ['baja', 'media', 'alta', 'critica'];
const CONSTRUCTION_INCIDENT_STATUSES = ['abierta', 'en_revision', 'resuelta', 'cerrada'];

function sanitizeFotoArray(arr, now) {
  if (!Array.isArray(arr)) return [];
  return arr.map((f, i) => ({
    id: f.id || `foto-${i}-${Date.now()}`,
    url: String(f.url || ''),
    base64: String(f.base64 || ''),
    mimeType: String(f.mimeType || 'image/jpeg'),
    descripcion: String(f.descripcion || ''),
    fecha: String(f.fecha || now),
  }));
}

export function buildConstructionDailyReportDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cdrt-${uuidv4()}`;
  const ref = existing?.referencia || `PARTE-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const materiales = Array.isArray(data.materiales) ? data.materiales.map(m => ({
    materialId: String(m.materialId || ''),
    nombre: String(m.nombre || ''),
    cantidad: Number(m.cantidad ?? 0),
    unidad: String(m.unidad || 'unidades'),
    costeUnitario: Number(m.costeUnitario ?? 0),
    costeTotal: Number(m.costeTotal ?? 0),
  })) : (existing?.materiales || []);

  const fotos = sanitizeFotoArray(data.fotos, now).length ? sanitizeFotoArray(data.fotos, now) : (existing?.fotos || []);

  const horasTrabajadas = Number(data.horasTrabajadas ?? existing?.horasTrabajadas ?? 0);
  const tarifaHora = Number(data.tarifaHora ?? existing?.tarifaHora ?? 0);
  const costeMateriales = materiales.reduce((s, m) => s + (Number(m.costeTotal) || 0), 0);
  const costeTotal = (horasTrabajadas * tarifaHora) + costeMateriales;

  const tieneIncidencia = Boolean(data.tieneIncidencia ?? existing?.tieneIncidencia ?? false);
  let incidencia = null;
  if (tieneIncidencia && (data.incidencia || existing?.incidencia)) {
    const src = data.incidencia || existing?.incidencia || {};
    incidencia = {
      tipo: CONSTRUCTION_INCIDENT_TYPES.includes(String(src.tipo)) ? String(src.tipo) : 'otro',
      descripcion: String(src.descripcion || ''),
      gravedad: CONSTRUCTION_INCIDENT_SEVERITIES.includes(String(src.gravedad)) ? String(src.gravedad) : 'media',
      fotos: sanitizeFotoArray(src.fotos, now),
      incidenciaId: String(src.incidenciaId || ''),
    };
  }

  const historial = Array.isArray(data.historial) ? data.historial : (existing?.historial || []);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_daily_report',
    id,
    user_id: userId,
    referencia: ref,
    fecha: String(data.fecha || existing?.fecha || now.slice(0, 10)),
    obraId: String(data.obraId || existing?.obraId || ''),
    obraNombre: String(data.obraNombre || existing?.obraNombre || ''),
    trabajadorId: String(data.trabajadorId || existing?.trabajadorId || ''),
    trabajadorNombre: String(data.trabajadorNombre || existing?.trabajadorNombre || ''),
    gremio: String(data.gremio || existing?.gremio || ''),
    tareaId: String(data.tareaId || existing?.tareaId || ''),
    tareaNombre: String(data.tareaNombre || existing?.tareaNombre || ''),
    descripcion: String(data.descripcion || existing?.descripcion || ''),
    horasTrabajadas,
    horasPrevistas: Number(data.horasPrevistas ?? existing?.horasPrevistas ?? 0),
    tarifaHora,
    costeTotal,
    materiales,
    fotos,
    observaciones: String(data.observaciones || existing?.observaciones || ''),
    tieneIncidencia,
    incidencia,
    estado: DAILY_REPORT_STATUSES.includes(String(data.estado)) ? String(data.estado) : (existing?.estado || 'borrador'),
    validadoPor: String(data.validadoPor || existing?.validadoPor || ''),
    validadoPorNombre: String(data.validadoPorNombre || existing?.validadoPorNombre || ''),
    validadoAt: String(data.validadoAt || existing?.validadoAt || ''),
    motivoRechazo: String(data.motivoRechazo || existing?.motivoRechazo || ''),
    clockinId: String(data.clockinId || existing?.clockinId || ''),
    creadoPor: String(data.creadoPor || existing?.creadoPor || ''),
    creadoPorNombre: String(data.creadoPorNombre || existing?.creadoPorNombre || ''),
    historial,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeConstructionDailyReport(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'construction_daily_report', id: doc._id,
    user_id: doc.user_id,
    referencia: doc.referencia || '',
    fecha: doc.fecha || '',
    obraId: doc.obraId || '', obraNombre: doc.obraNombre || '',
    trabajadorId: doc.trabajadorId || '', trabajadorNombre: doc.trabajadorNombre || '',
    gremio: doc.gremio || '',
    tareaId: doc.tareaId || '', tareaNombre: doc.tareaNombre || '',
    descripcion: doc.descripcion || '',
    horasTrabajadas: Number(doc.horasTrabajadas || 0),
    horasPrevistas: Number(doc.horasPrevistas || 0),
    tarifaHora: Number(doc.tarifaHora || 0),
    costeTotal: Number(doc.costeTotal || 0),
    materiales: Array.isArray(doc.materiales) ? doc.materiales : [],
    fotos: Array.isArray(doc.fotos) ? doc.fotos : [],
    observaciones: doc.observaciones || '',
    tieneIncidencia: Boolean(doc.tieneIncidencia),
    incidencia: doc.incidencia || null,
    estado: doc.estado || 'borrador',
    validadoPor: doc.validadoPor || '', validadoPorNombre: doc.validadoPorNombre || '',
    validadoAt: doc.validadoAt || '',
    motivoRechazo: doc.motivoRechazo || '',
    clockinId: doc.clockinId || '',
    creadoPor: doc.creadoPor || '', creadoPorNombre: doc.creadoPorNombre || '',
    historial: Array.isArray(doc.historial) ? doc.historial : [],
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}

// ── Obra documents (documentación por obra) ──

const OBRA_DOC_CATEGORIES = [
  'presupuesto', 'aceptacion', 'contrato', 'licencia', 'plano', 'foto', 'factura',
  'justificante', 'doc_cliente', 'doc_gerencia', 'instruccion', 'seguro', 'certificado',
  'licencia_obra', 'permiso_municipal', 'seguro_rc', 'seguro_todo_riesgo', 'plan_seguridad_salud',
  'evaluacion_riesgos', 'certificado_tecnico', 'acta_replanteo', 'contrato_obra', 'certificacion_obra',
  'albaran', 'memoria_tecnica', 'otro',
];
const OBRA_DOC_ESTADOS = ['borrador', 'pendiente', 'pendiente_firma', 'firmado', 'validado', 'vigente', 'archivado', 'caducado', 'rechazado'];

const OBRA_DOC_WORKER_VISIBLE_CATEGORIES = new Set(['plano', 'foto', 'instruccion']);
const OBRA_DOC_WORKER_CREATABLE_CATEGORIES = new Set(['foto', 'instruccion']);
const OBRA_DOC_REQUIRED_BY_DEFAULT = new Set([
  'presupuesto', 'aceptacion', 'contrato', 'licencia', 'plano', 'factura', 'seguro',
  'licencia_obra', 'seguro_rc', 'plan_seguridad_salud',
]);

const OCR_TO_OBRA_CATEGORY = {
  factura_proveedor: 'factura', factura_cliente: 'factura', presupuesto: 'presupuesto',
  contrato: 'contrato', licencia: 'licencia', certificado: 'certificado',
  seguro: 'seguro', nomina: 'doc_gerencia', ticket: 'justificante', albaran: 'albaran',
};

export function getDefaultObraDocumentRowsForTipo(tipoObra) {
  const t = String(tipoObra || 'casa');
  const base = [
    { categoria: 'licencia_obra', nombre: 'Licencia de obra', obligatorio: true },
    { categoria: 'seguro_rc', nombre: 'Seguro RC', obligatorio: true },
    { categoria: 'plan_seguridad_salud', nombre: 'Plan de seguridad y salud', obligatorio: true },
  ];
  if (t === 'local' || t === 'oficina') {
    return [...base, { categoria: 'memoria_tecnica', nombre: 'Memoria técnica', obligatorio: true }];
  }
  if (t === 'promoción' || t === 'colegio' || t === 'gimnasio') {
    return [
      ...base,
      { categoria: 'memoria_tecnica', nombre: 'Memoria técnica', obligatorio: true },
      { categoria: 'evaluacion_riesgos', nombre: 'Evaluación de riesgos', obligatorio: true },
    ];
  }
  return base;
}

export function buildConstructionObraDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `codb-${uuidv4()}`;
  const cat = OBRA_DOC_CATEGORIES.includes(String(data.categoria)) ? String(data.categoria) : (existing?.categoria || 'otro');
  const historial = Array.isArray(data.historial) ? data.historial : (existing?.historial || []);
  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_obra_document',
    id,
    user_id: userId,
    obraId: String(data.obraId || existing?.obraId || ''),
    obraNombre: String(data.obraNombre || existing?.obraNombre || ''),
    clienteId: String(data.clienteId || existing?.clienteId || ''),
    clienteNombre: String(data.clienteNombre || existing?.clienteNombre || ''),
    categoria: cat,
    nombre: String(data.nombre || existing?.nombre || ''),
    descripcion: String(data.descripcion || existing?.descripcion || ''),
    estado: OBRA_DOC_ESTADOS.includes(String(data.estado)) ? String(data.estado) : (existing?.estado || 'pendiente'),
    fechaEmision: String(data.fechaEmision || existing?.fechaEmision || ''),
    fechaCaducidad: String(data.fechaCaducidad || existing?.fechaCaducidad || ''),
    obligatorio: data.obligatorio != null ? Boolean(data.obligatorio) : (existing?.obligatorio ?? OBRA_DOC_REQUIRED_BY_DEFAULT.has(cat)),
    visibleTrabajador: data.visibleTrabajador != null ? Boolean(data.visibleTrabajador) : (existing?.visibleTrabajador ?? OBRA_DOC_WORKER_VISIBLE_CATEGORIES.has(cat)),
    archivoUrl: String(data.archivoUrl || existing?.archivoUrl || ''),
    archivoBase64: String(data.archivoBase64 || existing?.archivoBase64 || ''),
    archivoMimeType: String(data.archivoMimeType || existing?.archivoMimeType || ''),
    archivoNombre: String(data.archivoNombre || existing?.archivoNombre || ''),
    archivoSize: Number(data.archivoSize ?? existing?.archivoSize ?? 0),
    firmaSolicitadaId: String(data.firmaSolicitadaId || existing?.firmaSolicitadaId || ''),
    firmaEstado: data.firmaEstado || existing?.firmaEstado || null,
    firmadoAt: String(data.firmadoAt || existing?.firmadoAt || ''),
    firmadoPor: String(data.firmadoPor || existing?.firmadoPor || ''),
    ocrData: data.ocrData || existing?.ocrData || null,
    ocrProcessedAt: String(data.ocrProcessedAt || existing?.ocrProcessedAt || ''),
    ocrConfidence: Number(data.ocrConfidence ?? existing?.ocrConfidence ?? 0),
    entidadOrigenId: String(data.entidadOrigenId || existing?.entidadOrigenId || ''),
    entidadOrigenTipo: String(data.entidadOrigenTipo || existing?.entidadOrigenTipo || ''),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : (existing?.tags || []),
    subidoPor: String(data.subidoPor || existing?.subidoPor || ''),
    subidoPorId: String(data.subidoPorId || existing?.subidoPorId || ''),
    notas: String(data.notas || existing?.notas || ''),
    historial,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeConstructionObraDocument(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'construction_obra_document', id: doc._id,
    user_id: doc.user_id,
    obraId: doc.obraId || '', obraNombre: doc.obraNombre || '',
    clienteId: doc.clienteId || '', clienteNombre: doc.clienteNombre || '',
    categoria: doc.categoria || 'otro',
    nombre: doc.nombre || '',
    descripcion: doc.descripcion || '',
    estado: doc.estado || 'pendiente',
    fechaEmision: doc.fechaEmision || '',
    fechaCaducidad: doc.fechaCaducidad || '',
    obligatorio: Boolean(doc.obligatorio),
    visibleTrabajador: Boolean(doc.visibleTrabajador),
    archivoUrl: doc.archivoUrl || '',
    archivoBase64: doc.archivoBase64 || '',
    archivoMimeType: doc.archivoMimeType || '',
    archivoNombre: doc.archivoNombre || '',
    archivoSize: Number(doc.archivoSize || 0),
    firmaSolicitadaId: doc.firmaSolicitadaId || '',
    firmaEstado: doc.firmaEstado || null,
    firmadoAt: doc.firmadoAt || '',
    firmadoPor: doc.firmadoPor || '',
    ocrData: doc.ocrData || null,
    ocrProcessedAt: doc.ocrProcessedAt || '',
    ocrConfidence: Number(doc.ocrConfidence || 0),
    entidadOrigenId: doc.entidadOrigenId || '',
    entidadOrigenTipo: doc.entidadOrigenTipo || '',
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    subidoPor: doc.subidoPor || '',
    subidoPorId: doc.subidoPorId || '',
    notas: doc.notas || '',
    historial: Array.isArray(doc.historial) ? doc.historial : [],
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}

export function obraDocIsVisibleForWorker(doc) {
  return Boolean(doc?.visibleTrabajador);
}

export function obraDocSuggestCategoryFromOcr(ocrDocumentType) {
  return OCR_TO_OBRA_CATEGORY[ocrDocumentType] || 'otro';
}

export function findPossibleObraDocDuplicates(docs, candidate) {
  const normName = String(candidate.nombre || '').toLowerCase().trim();
  return docs.filter(d => {
    if (d._id === candidate._id) return false;
    if (d.obraId !== candidate.obraId) return false;
    let score = 0;
    if (String(d.nombre || '').toLowerCase().trim() === normName && normName) score++;
    if (d.categoria === candidate.categoria) score++;
    if (candidate.archivoSize && d.archivoSize === candidate.archivoSize) score++;
    return score >= 2;
  });
}

export async function seedDefaultObraDocumentsForProject(req, userId, projectDoc) {
  const db = getConstructionDbName();
  await ensureDatabase(req, db);
  const rows = getDefaultObraDocumentRowsForTipo(projectDoc.tipoObra);
  for (const row of rows) {
    const doc = buildConstructionObraDocument(userId, {
      obraId: projectDoc._id,
      obraNombre: projectDoc.nombre || '',
      categoria: row.categoria,
      nombre: row.nombre,
      obligatorio: row.obligatorio,
      estado: 'pendiente',
    });
    await putDocument(req, db, doc._id, doc);
  }
}

// ── Incidents (Incidencias de obra) ──

const STANDALONE_INCIDENT_TYPES = ['falta_material', 'averia', 'retraso_gremio', 'cambio_cliente', 'error_tecnico', 'riesgo_seguridad', 'otro'];
const CONSTRUCTION_INCIDENT_PRIORITIES = ['baja', 'media', 'alta', 'critica'];
const FULL_INCIDENT_STATUSES = ['abierta', 'en_revision', 'resuelta', 'cerrada', 'reabierta'];

function normalizeIncidentTypeConstruction(value) {
  const v = String(value || '');
  if (STANDALONE_INCIDENT_TYPES.includes(v)) return v;
  if (CONSTRUCTION_INCIDENT_TYPES.includes(v)) return v;
  return 'otro';
}

export function buildConstructionIncidentDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cinc-${uuidv4()}`;
  const ref = existing?.referencia || `INC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const desc = String(data.descripcion || existing?.descripcion || '');
  const titulo = String(data.titulo || existing?.titulo || (desc ? desc.slice(0, 120) : 'Incidencia'));

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_incident',
    id,
    user_id: userId,
    referencia: ref,
    titulo,
    fecha: String(data.fecha || existing?.fecha || now.slice(0, 10)),
    obraId: String(data.obraId || existing?.obraId || ''),
    obraNombre: String(data.obraNombre || existing?.obraNombre || ''),
    trabajadorId: String(data.trabajadorId || existing?.trabajadorId || ''),
    trabajadorNombre: String(data.trabajadorNombre || existing?.trabajadorNombre || ''),
    parteId: String(data.parteId || existing?.parteId || ''),
    parteReferencia: String(data.parteReferencia || existing?.parteReferencia || ''),
    documentoId: String(data.documentoId || existing?.documentoId || ''),
    documentoNombre: String(data.documentoNombre || existing?.documentoNombre || ''),
    reportadoPor: String(data.reportadoPor || existing?.reportadoPor || ''),
    reportadoPorNombre: String(data.reportadoPorNombre || existing?.reportadoPorNombre || ''),
    tipo: normalizeIncidentTypeConstruction(data.tipo) !== 'otro' ? normalizeIncidentTypeConstruction(data.tipo) : (existing?.tipo || 'otro'),
    descripcion: desc,
    prioridad: CONSTRUCTION_INCIDENT_PRIORITIES.includes(String(data.prioridad)) ? String(data.prioridad) : (existing?.prioridad || existing?.gravedad || 'media'),
    gravedad: CONSTRUCTION_INCIDENT_SEVERITIES.includes(String(data.gravedad)) ? String(data.gravedad) : (existing?.gravedad || 'media'),
    costeEstimado: Number(data.costeEstimado ?? existing?.costeEstimado ?? 0),
    fechaDeteccion: String(data.fechaDeteccion || existing?.fechaDeteccion || now),
    fotos: sanitizeFotoArray(data.fotos, now).length ? sanitizeFotoArray(data.fotos, now) : (existing?.fotos || []),
    estado: FULL_INCIDENT_STATUSES.includes(String(data.estado)) ? String(data.estado) : (existing?.estado || 'abierta'),
    asignadoA: String(data.asignadoA || existing?.asignadoA || ''),
    asignadoANombre: String(data.asignadoANombre || existing?.asignadoANombre || ''),
    resolucion: String(data.resolucion || existing?.resolucion || ''),
    fechaResolucion: String(data.fechaResolucion || existing?.fechaResolucion || ''),
    resueltoPor: String(data.resueltoPor || existing?.resueltoPor || ''),
    fechaLimite: String(data.fechaLimite || existing?.fechaLimite || ''),
    reabiertaCount: Number(data.reabiertaCount || existing?.reabiertaCount || 0),
    historial: Array.isArray(data.historial) ? data.historial : (existing?.historial || []),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeConstructionIncident(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'construction_incident', id: doc._id,
    user_id: doc.user_id,
    referencia: doc.referencia || '',
    titulo: doc.titulo || '',
    fecha: doc.fecha || '',
    obraId: doc.obraId || '', obraNombre: doc.obraNombre || '',
    trabajadorId: doc.trabajadorId || '', trabajadorNombre: doc.trabajadorNombre || '',
    parteId: doc.parteId || '', parteReferencia: doc.parteReferencia || '',
    documentoId: doc.documentoId || '', documentoNombre: doc.documentoNombre || '',
    reportadoPor: doc.reportadoPor || '', reportadoPorNombre: doc.reportadoPorNombre || '',
    tipo: doc.tipo || 'otro',
    descripcion: doc.descripcion || '',
    prioridad: doc.prioridad || doc.gravedad || 'media',
    gravedad: doc.gravedad || doc.prioridad || 'media',
    costeEstimado: Number(doc.costeEstimado || 0),
    fechaDeteccion: doc.fechaDeteccion || '',
    fotos: Array.isArray(doc.fotos) ? doc.fotos : [],
    estado: doc.estado || 'abierta',
    asignadoA: doc.asignadoA || '', asignadoANombre: doc.asignadoANombre || '',
    resolucion: doc.resolucion || '',
    fechaResolucion: doc.fechaResolucion || '',
    resueltoPor: doc.resueltoPor || '',
    fechaLimite: doc.fechaLimite || '',
    reabiertaCount: Number(doc.reabiertaCount || 0),
    historial: Array.isArray(doc.historial) ? doc.historial : [],
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}

// ── Payments (líneas de pago interno: gremio / proveedor / gasto general) ──

export const PAYMENT_LINE_TYPES = ['gremio', 'proveedor', 'gasto_general'];
export const PAYMENT_LINE_STATUSES = ['pendiente', 'parcial', 'pagado', 'anulado'];

export function buildConstructionPaymentDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cpay-${uuidv4()}`;
  const ref =
    existing?.referencia ||
    (data.referencia ? String(data.referencia) : `PAG-${Date.now().toString(36).toUpperCase().slice(-6)}`);

  const mapPago = (p) => ({
    id: p.id || `inst-${uuidv4()}`,
    concepto: String(p.concepto || ''),
    importe: Number(p.importe ?? 0),
    fecha: String(p.fecha || ''),
    pagado: Boolean(p.pagado),
    fechaPago: String(p.fechaPago || ''),
    metodoPago: String(p.metodoPago || ''),
    justificanteUrl: String(p.justificanteUrl || ''),
    justificanteBase64: String(p.justificanteBase64 || ''),
    justificanteMimeType: String(p.justificanteMimeType || ''),
    justificanteNombre: String(p.justificanteNombre || ''),
    facturaProveedorId: String(p.facturaProveedorId || ''),
    ocrData: p.ocrData || null,
    faseId: String(p.faseId || ''),
    faseNombre: String(p.faseNombre || ''),
    notas: String(p.notas || ''),
  });

  const pagos = Array.isArray(data.pagos) ? data.pagos.map(mapPago) : (existing?.pagos || []).map(mapPago);

  const totalPagado = pagos.filter((p) => p.pagado).reduce((s, p) => s + p.importe, 0);
  const importePactado = Number(data.importePactado ?? existing?.importePactado ?? 0);
  const pendiente = Math.max(0, importePactado - totalPagado);

  const fases = Array.isArray(data.fases)
    ? data.fases.map((f, i) => ({
        id: f.id ?? i + 1,
        nombre: String(f.nombre || ''),
        importe: Number(f.importe ?? 0),
        porcentaje: Number(f.porcentaje ?? 0),
        completada: Boolean(f.completada),
        fechaPrevista: String(f.fechaPrevista || ''),
      }))
    : existing?.fases || [];

  let estado;
  if (data.estado === 'anulado' || existing?.estado === 'anulado') {
    estado = 'anulado';
  } else if (totalPagado === 0) {
    estado = 'pendiente';
  } else if (importePactado > 0 && totalPagado >= importePactado) {
    estado = 'pagado';
  } else {
    estado = 'parcial';
  }

  const tipoIn = String(data.tipo || existing?.tipo || 'gremio');
  const tipo = PAYMENT_LINE_TYPES.includes(tipoIn) ? tipoIn : 'gremio';

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_payment',
    id,
    user_id: userId,

    referencia: ref,
    nombre: String(data.nombre || existing?.nombre || ''),
    tipo,

    obraId: String(data.obraId || existing?.obraId || ''),
    obraNombre: String(data.obraNombre || existing?.obraNombre || ''),

    gremioId: String(data.gremioId || existing?.gremioId || ''),
    gremioNombre: String(data.gremioNombre || existing?.gremioNombre || ''),
    gremioTipo: String(data.gremioTipo || existing?.gremioTipo || ''),

    proveedorId: String(data.proveedorId || existing?.proveedorId || ''),
    proveedorNombre: String(data.proveedorNombre || existing?.proveedorNombre || ''),

    presupuestoId: String(data.presupuestoId || existing?.presupuestoId || ''),

    importePactado,
    totalPagado,
    pendiente,
    estado,

    fechaPrevista: String(data.fechaPrevista || existing?.fechaPrevista || ''),

    fases,
    pagos,

    documentoUrl: String(data.documentoUrl || existing?.documentoUrl || ''),
    documentoBase64: String(data.documentoBase64 || existing?.documentoBase64 || ''),
    documentoMimeType: String(data.documentoMimeType || existing?.documentoMimeType || ''),
    documentoNombre: String(data.documentoNombre || existing?.documentoNombre || ''),

    observaciones: String(data.observaciones || existing?.observaciones || ''),

    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeConstructionPayment(doc) {
  if (!doc) return null;
  const pagos = Array.isArray(doc.pagos)
    ? doc.pagos.map((p) => ({
        ...p,
        justificanteBase64: p.justificanteBase64 ? '[omitted]' : '',
      }))
    : [];
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'construction_payment',
    id: doc.id || doc._id,
    user_id: doc.user_id,
    referencia: doc.referencia || '',
    nombre: doc.nombre || '',
    tipo: doc.tipo || 'gremio',
    obraId: doc.obraId || '',
    obraNombre: doc.obraNombre || '',
    gremioId: doc.gremioId || '',
    gremioNombre: doc.gremioNombre || '',
    gremioTipo: doc.gremioTipo || '',
    proveedorId: doc.proveedorId || '',
    proveedorNombre: doc.proveedorNombre || '',
    presupuestoId: doc.presupuestoId || '',
    importePactado: Number(doc.importePactado || 0),
    totalPagado: Number(doc.totalPagado || 0),
    pendiente: Number(doc.pendiente || 0),
    estado: doc.estado || 'pendiente',
    fechaPrevista: doc.fechaPrevista || '',
    fases: Array.isArray(doc.fases) ? doc.fases : [],
    pagos,
    documentoUrl: doc.documentoUrl || '',
    documentoNombre: doc.documentoNombre || '',
    observaciones: doc.observaciones || '',
    createdAt: doc.createdAt || '',
    updatedAt: doc.updatedAt || '',
  };
}

// ── Collections (Cobros de obra) ──

const COLLECTION_TYPES = ['contado', 'plazos', 'fases', 'hitos', 'anticipo_parciales_cierre'];
const COLLECTION_STATUSES = ['pendiente', 'parcial', 'cobrado', 'vencido'];
const ENTREGA_TYPES = ['anticipo', 'plazo', 'fase', 'hito', 'parcial', 'cierre', 'contado'];
const ENTREGA_STATUSES = ['pendiente', 'parcial', 'cobrado', 'vencido'];

function normalizeCollectionStatus(val) {
  return COLLECTION_STATUSES.includes(val) ? val : 'pendiente';
}
function normalizeEntregaStatus(val) {
  return ENTREGA_STATUSES.includes(val) ? val : 'pendiente';
}

export function buildConstructionCollectionDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `ccol-${uuidv4()}`;
  const referencia = existing?.referencia || `COB-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const entregas = Array.isArray(data.entregas) ? data.entregas.map((e, i) => {
    const importe = Number(e.importe ?? 0);
    const cobradoParcial = Number(e.cobradoParcial ?? 0);
    const cobradoTotal = Number(e.cobradoTotal ?? 0);
    return {
      id: e.id || i + 1,
      concepto: String(e.concepto || ''),
      tipo: ENTREGA_TYPES.includes(e.tipo) ? e.tipo : 'plazo',
      importe,
      fechaPrevista: String(e.fechaPrevista || ''),
      fechaCobro: String(e.fechaCobro || ''),
      estado: normalizeEntregaStatus(e.estado),
      cobradoParcial,
      cobradoTotal,
      observaciones: String(e.observaciones || ''),
      financeMovementId: String(e.financeMovementId || ''),
    };
  }) : (existing?.entregas || []);

  const importeTotal = Number(data.importeTotal ?? existing?.importeTotal ?? 0);
  const importeCobrado = entregas.reduce((s, e) => s + (e.cobradoTotal || 0) + (e.cobradoParcial || 0), 0);
  const saldoPendiente = Math.max(0, importeTotal - importeCobrado);

  let estadoCobro;
  if (data.estadoCobro && COLLECTION_STATUSES.includes(data.estadoCobro)) {
    estadoCobro = data.estadoCobro;
  } else if (importeCobrado >= importeTotal && importeTotal > 0) {
    estadoCobro = 'cobrado';
  } else if (importeCobrado > 0) {
    estadoCobro = 'parcial';
  } else {
    const today = now.slice(0, 10);
    const hasOverdue = entregas.some(e => e.estado !== 'cobrado' && e.fechaPrevista && e.fechaPrevista < today);
    estadoCobro = hasOverdue ? 'vencido' : 'pendiente';
  }

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_collection',
    id,
    user_id: userId,
    referencia,
    obraId: String(data.obraId || existing?.obraId || ''),
    obraNombre: String(data.obraNombre || existing?.obraNombre || ''),
    clienteId: String(data.clienteId || existing?.clienteId || ''),
    clienteNombre: String(data.clienteNombre || existing?.clienteNombre || ''),
    presupuestoId: String(data.presupuestoId || existing?.presupuestoId || ''),
    tipoCobro: COLLECTION_TYPES.includes(data.tipoCobro) ? data.tipoCobro : (existing?.tipoCobro || 'contado'),
    importeTotal,
    importeCobrado: Math.round(importeCobrado * 100) / 100,
    saldoPendiente: Math.round(saldoPendiente * 100) / 100,
    estadoCobro,
    entregas,
    observaciones: String(data.observaciones || existing?.observaciones || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeConstructionCollection(doc) {
  if (!doc) return null;
  const entregas = Array.isArray(doc.entregas) ? doc.entregas : [];
  return {
    _id: doc._id, _rev: doc._rev, type: 'construction_collection', id: doc._id,
    user_id: doc.user_id,
    referencia: doc.referencia || '',
    obraId: doc.obraId || '', obraNombre: doc.obraNombre || '',
    clienteId: doc.clienteId || '', clienteNombre: doc.clienteNombre || '',
    presupuestoId: doc.presupuestoId || '',
    tipoCobro: doc.tipoCobro || 'contado',
    importeTotal: Number(doc.importeTotal || 0),
    importeCobrado: Number(doc.importeCobrado || 0),
    saldoPendiente: Number(doc.saldoPendiente || 0),
    estadoCobro: doc.estadoCobro || 'pendiente',
    entregas,
    observaciones: doc.observaciones || '',
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}

// ── Planning Entries (Planificación de obra) ──────────────────────────────────

const PLANNING_RESOURCE_TYPES = ['trabajador', 'subcontrata', 'maquinaria'];
const PLANNING_STATUSES = ['planificado', 'confirmado', 'en_curso', 'completado', 'cancelado'];
const PLANNING_PRIORITIES = ['baja', 'media', 'alta', 'urgente'];
const RECURRENCE_TYPES = ['diaria', 'semanal', 'quincenal', 'mensual'];

export function buildConstructionPlanningEntryDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cple-${uuidv4()}`;
  const ref = existing?.referencia || `PLAN-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const tipoRecurso = PLANNING_RESOURCE_TYPES.includes(String(data.tipoRecurso)) ? String(data.tipoRecurso) : (existing?.tipoRecurso || 'trabajador');
  const estado = PLANNING_STATUSES.includes(String(data.estado)) ? String(data.estado) : (existing?.estado || 'planificado');
  const prioridad = PLANNING_PRIORITIES.includes(String(data.prioridad)) ? String(data.prioridad) : (existing?.prioridad || 'media');

  const materialesPrevistos = Array.isArray(data.materialesPrevistos) ? data.materialesPrevistos.map(m => ({
    materialId: String(m.materialId || ''),
    nombre: String(m.nombre || ''),
    cantidad: Number(m.cantidad ?? 0),
    unidad: String(m.unidad || 'unidades'),
    fechaNecesaria: String(m.fechaNecesaria || ''),
    estado: String(m.estado || 'previsto'),
  })) : (existing?.materialesPrevistos || []);

  const conflictos = Array.isArray(data.conflictos) ? data.conflictos.map(c => ({
    tipo: String(c.tipo || ''),
    mensaje: String(c.mensaje || ''),
    entryId: String(c.entryId || ''),
    obraNombre: String(c.obraNombre || ''),
    fechas: String(c.fechas || ''),
  })) : (existing?.conflictos || []);

  const historial = Array.isArray(data.historial) ? data.historial.map(h => ({
    accion: String(h.accion || ''),
    usuario: String(h.usuario || ''),
    fecha: String(h.fecha || ''),
    detalle: String(h.detalle || ''),
  })) : (existing?.historial || []);

  return {
    _id: id, _rev: existing?._rev, type: 'construction_planning_entry', id, user_id: userId,
    referencia: ref,
    obraId: String(data.obraId || existing?.obraId || ''),
    obraNombre: String(data.obraNombre || existing?.obraNombre || ''),
    tipoRecurso,
    recursoId: String(data.recursoId || existing?.recursoId || ''),
    recursoNombre: String(data.recursoNombre || existing?.recursoNombre || ''),
    gremio: String(data.gremio || existing?.gremio || ''),
    tareaId: String(data.tareaId || existing?.tareaId || ''),
    tareaNombre: String(data.tareaNombre || existing?.tareaNombre || ''),
    fechaInicio: String(data.fechaInicio || existing?.fechaInicio || ''),
    fechaFin: String(data.fechaFin || existing?.fechaFin || ''),
    horaInicio: String(data.horaInicio || existing?.horaInicio || '08:00'),
    horaFin: String(data.horaFin || existing?.horaFin || '17:00'),
    todoElDia: Boolean(data.todoElDia ?? existing?.todoElDia ?? false),
    diasSemana: Array.isArray(data.diasSemana) ? data.diasSemana.map(Number) : (existing?.diasSemana || [1, 2, 3, 4, 5]),
    descripcion: String(data.descripcion || existing?.descripcion || ''),
    prioridad, estado, color: String(data.color || existing?.color || ''),
    materialesPrevistos,
    requiereConfirmacion: Boolean(data.requiereConfirmacion ?? existing?.requiereConfirmacion ?? (tipoRecurso === 'subcontrata')),
    confirmado: Boolean(data.confirmado ?? existing?.confirmado ?? false),
    confirmadoAt: String(data.confirmadoAt || existing?.confirmadoAt || ''),
    confirmadoPor: String(data.confirmadoPor || existing?.confirmadoPor || ''),
    responsableId: String(data.responsableId || existing?.responsableId || ''),
    responsableNombre: String(data.responsableNombre || existing?.responsableNombre || ''),
    notas: String(data.notas || existing?.notas || ''),
    notasGerencia: String(data.notasGerencia || existing?.notasGerencia || ''),
    esRecurrente: Boolean(data.esRecurrente ?? existing?.esRecurrente ?? false),
    reglaRecurrencia: (data.esRecurrente || existing?.esRecurrente) ? {
      tipo: RECURRENCE_TYPES.includes(String(data.reglaRecurrencia?.tipo)) ? String(data.reglaRecurrencia?.tipo) : (existing?.reglaRecurrencia?.tipo || 'semanal'),
      intervalo: Number(data.reglaRecurrencia?.intervalo ?? existing?.reglaRecurrencia?.intervalo ?? 1),
      finRepeticion: String(data.reglaRecurrencia?.finRepeticion || existing?.reglaRecurrencia?.finRepeticion || ''),
    } : (existing?.reglaRecurrencia || null),
    conflictos, historial,
    createdAt: existing?.createdAt || now, updatedAt: now,
  };
}

export function sanitizeConstructionPlanningEntry(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'construction_planning_entry', id: doc._id, user_id: doc.user_id,
    referencia: doc.referencia || '',
    obraId: doc.obraId || '', obraNombre: doc.obraNombre || '',
    tipoRecurso: doc.tipoRecurso || 'trabajador',
    recursoId: doc.recursoId || '', recursoNombre: doc.recursoNombre || '',
    gremio: doc.gremio || '',
    tareaId: doc.tareaId || '', tareaNombre: doc.tareaNombre || '',
    fechaInicio: doc.fechaInicio || '', fechaFin: doc.fechaFin || '',
    horaInicio: doc.horaInicio || '08:00', horaFin: doc.horaFin || '17:00',
    todoElDia: Boolean(doc.todoElDia), diasSemana: Array.isArray(doc.diasSemana) ? doc.diasSemana : [1, 2, 3, 4, 5],
    descripcion: doc.descripcion || '', prioridad: doc.prioridad || 'media',
    estado: doc.estado || 'planificado', color: doc.color || '',
    materialesPrevistos: Array.isArray(doc.materialesPrevistos) ? doc.materialesPrevistos : [],
    requiereConfirmacion: Boolean(doc.requiereConfirmacion),
    confirmado: Boolean(doc.confirmado),
    confirmadoAt: doc.confirmadoAt || '', confirmadoPor: doc.confirmadoPor || '',
    responsableId: doc.responsableId || '', responsableNombre: doc.responsableNombre || '',
    notas: doc.notas || '', notasGerencia: doc.notasGerencia || '',
    esRecurrente: Boolean(doc.esRecurrente), reglaRecurrencia: doc.reglaRecurrencia || null,
    conflictos: Array.isArray(doc.conflictos) ? doc.conflictos : [],
    historial: Array.isArray(doc.historial) ? doc.historial : [],
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}

// ── Milestones (Hitos de obra) ────────────────────────────────────────────────

const MILESTONE_TYPES = ['inicio_obra', 'fin_fase', 'entrega_parcial', 'recepcion_material', 'inspeccion', 'permiso', 'entrega_final', 'otro'];
const MILESTONE_STATUSES = ['pendiente', 'cumplido', 'retrasado', 'cancelado'];

export function buildConstructionMilestoneDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cmst-${uuidv4()}`;
  const tipo = MILESTONE_TYPES.includes(String(data.tipo)) ? String(data.tipo) : (existing?.tipo || 'otro');
  const estado = MILESTONE_STATUSES.includes(String(data.estado)) ? String(data.estado) : (existing?.estado || 'pendiente');

  const documentos = Array.isArray(data.documentos) ? data.documentos.map(d => ({
    id: String(d.id || uuidv4()), nombre: String(d.nombre || ''),
    url: String(d.url || ''), base64: String(d.base64 || ''),
    mimeType: String(d.mimeType || ''), fecha: String(d.fecha || now),
  })) : (existing?.documentos || []);

  const fechaStr = String(data.fecha || existing?.fecha || '');
  const fechaOriginal = existing?.fechaOriginal || fechaStr;

  return {
    _id: id, _rev: existing?._rev, type: 'construction_milestone', id, user_id: userId,
    obraId: String(data.obraId || existing?.obraId || ''),
    obraNombre: String(data.obraNombre || existing?.obraNombre || ''),
    nombre: String(data.nombre || existing?.nombre || ''),
    descripcion: String(data.descripcion || existing?.descripcion || ''),
    tipo, fecha: fechaStr,
    fechaReal: String(data.fechaReal || existing?.fechaReal || ''),
    fechaOriginal,
    estado,
    responsableId: String(data.responsableId || existing?.responsableId || ''),
    responsableNombre: String(data.responsableNombre || existing?.responsableNombre || ''),
    diasRetraso: Number(data.diasRetraso ?? existing?.diasRetraso ?? 0),
    motivoRetraso: String(data.motivoRetraso || existing?.motivoRetraso || ''),
    dependeDe: String(data.dependeDe || existing?.dependeDe || ''),
    dependeDeNombre: String(data.dependeDeNombre || existing?.dependeDeNombre || ''),
    documentos,
    notas: String(data.notas || existing?.notas || ''),
    color: String(data.color || existing?.color || ''),
    icono: String(data.icono || existing?.icono || ''),
    createdAt: existing?.createdAt || now, updatedAt: now,
  };
}

export function sanitizeConstructionMilestone(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'construction_milestone', id: doc._id, user_id: doc.user_id,
    obraId: doc.obraId || '', obraNombre: doc.obraNombre || '',
    nombre: doc.nombre || '', descripcion: doc.descripcion || '',
    tipo: doc.tipo || 'otro', fecha: doc.fecha || '',
    fechaReal: doc.fechaReal || '', fechaOriginal: doc.fechaOriginal || '',
    estado: doc.estado || 'pendiente',
    responsableId: doc.responsableId || '', responsableNombre: doc.responsableNombre || '',
    diasRetraso: Number(doc.diasRetraso || 0), motivoRetraso: doc.motivoRetraso || '',
    dependeDe: doc.dependeDe || '', dependeDeNombre: doc.dependeDeNombre || '',
    documentos: Array.isArray(doc.documentos) ? doc.documentos : [],
    notas: doc.notas || '', color: doc.color || '', icono: doc.icono || '',
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}

// ── Material Needs (Necesidades de material) ──────────────────────────────────

const MATERIAL_NEED_STATUSES = ['previsto', 'solicitado', 'pedido', 'recibido', 'cancelado'];

export function buildConstructionMaterialNeedDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cmnd-${uuidv4()}`;
  const estado = MATERIAL_NEED_STATUSES.includes(String(data.estado)) ? String(data.estado) : (existing?.estado || 'previsto');

  return {
    _id: id, _rev: existing?._rev, type: 'construction_material_need', id, user_id: userId,
    obraId: String(data.obraId || existing?.obraId || ''),
    obraNombre: String(data.obraNombre || existing?.obraNombre || ''),
    planningEntryId: String(data.planningEntryId || existing?.planningEntryId || ''),
    materialId: String(data.materialId || existing?.materialId || ''),
    materialNombre: String(data.materialNombre || existing?.materialNombre || ''),
    categoria: String(data.categoria || existing?.categoria || ''),
    cantidad: Number(data.cantidad ?? existing?.cantidad ?? 0),
    unidad: String(data.unidad || existing?.unidad || 'unidades'),
    costeEstimado: Number(data.costeEstimado ?? existing?.costeEstimado ?? 0),
    fechaNecesaria: String(data.fechaNecesaria || existing?.fechaNecesaria || ''),
    fechaSolicitud: String(data.fechaSolicitud || existing?.fechaSolicitud || ''),
    fechaRecepcion: String(data.fechaRecepcion || existing?.fechaRecepcion || ''),
    estado,
    pedidoCompraId: String(data.pedidoCompraId || existing?.pedidoCompraId || ''),
    proveedorId: String(data.proveedorId || existing?.proveedorId || ''),
    proveedorNombre: String(data.proveedorNombre || existing?.proveedorNombre || ''),
    stockDisponible: Number(data.stockDisponible ?? existing?.stockDisponible ?? 0),
    requiereCompra: Boolean(data.requiereCompra ?? existing?.requiereCompra ?? true),
    notas: String(data.notas || existing?.notas || ''),
    createdAt: existing?.createdAt || now, updatedAt: now,
  };
}

export function sanitizeConstructionMaterialNeed(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'construction_material_need', id: doc._id, user_id: doc.user_id,
    obraId: doc.obraId || '', obraNombre: doc.obraNombre || '',
    planningEntryId: doc.planningEntryId || '',
    materialId: doc.materialId || '', materialNombre: doc.materialNombre || '',
    categoria: doc.categoria || '',
    cantidad: Number(doc.cantidad || 0), unidad: doc.unidad || 'unidades',
    costeEstimado: Number(doc.costeEstimado || 0),
    fechaNecesaria: doc.fechaNecesaria || '', fechaSolicitud: doc.fechaSolicitud || '',
    fechaRecepcion: doc.fechaRecepcion || '', estado: doc.estado || 'previsto',
    pedidoCompraId: doc.pedidoCompraId || '',
    proveedorId: doc.proveedorId || '', proveedorNombre: doc.proveedorNombre || '',
    stockDisponible: Number(doc.stockDisponible || 0),
    requiereCompra: Boolean(doc.requiereCompra),
    notas: doc.notas || '',
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}

export { CONSTRUCTION_PROJECT_TYPES, CONSTRUCTION_GUILDS, CONSTRUCTION_GUILD_LABELS, CONSTRUCTION_UNITS, BUDGET_STATES, PAYMENT_METHODS, TASK_STATUSES, DAILY_REPORT_STATUSES, INCIDENT_TYPES, CONSTRUCTION_INCIDENT_TYPES, CONSTRUCTION_INCIDENT_SEVERITIES, CONSTRUCTION_INCIDENT_STATUSES, STANDALONE_INCIDENT_TYPES, CONSTRUCTION_INCIDENT_PRIORITIES, FULL_INCIDENT_STATUSES, COLLECTION_TYPES, COLLECTION_STATUSES, ENTREGA_TYPES, ENTREGA_STATUSES, PLANNING_RESOURCE_TYPES, PLANNING_STATUSES, PLANNING_PRIORITIES, MILESTONE_TYPES, MILESTONE_STATUSES, MATERIAL_NEED_STATUSES, OBRA_DOC_CATEGORIES, OBRA_DOC_ESTADOS, OBRA_DOC_WORKER_VISIBLE_CATEGORIES, OBRA_DOC_WORKER_CREATABLE_CATEGORIES, OBRA_DOC_REQUIRED_BY_DEFAULT, OCR_TO_OBRA_CATEGORY };

// ─── BRANDS (Marcas comerciales) ──────────────────────────────────────────────

export function buildBrandDocument(businessId, userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `brand-${uuidv4()}`;
  const salesPointIds = Array.isArray(data.salesPointIds)
    ? data.salesPointIds.map((x) => String(x || '').trim()).filter(Boolean)
    : Array.isArray(existing?.salesPointIds)
      ? existing.salesPointIds.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
  const catalogCategories = Array.isArray(data.catalogCategories)
    ? data.catalogCategories.map((x) => String(x || '').trim()).filter(Boolean)
    : Array.isArray(existing?.catalogCategories)
      ? existing.catalogCategories.map((x) => String(x || '').trim()).filter(Boolean)
      : [];

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'brand',
    id,
    business_id: String(businessId || ''),
    user_id: String(userId || ''),
    name: String(data.name || '').trim(),
    description: String(data.description || '').trim(),
    logo: String(data.logo || existing?.logo || ''),
    website: String(data.website || '').trim(),
    primaryColor: String(data.primaryColor || existing?.primaryColor || '#6366F1').trim(),
    secondaryColor: String(data.secondaryColor || existing?.secondaryColor || '').trim(),
    shortCode: String(data.shortCode || existing?.shortCode || '').trim(),
    salesPointIds,
    deliveryLineKind: String(data.deliveryLineKind || existing?.deliveryLineKind || '').trim(),
    catalogCategories,
    isDefault: data.isDefault !== undefined ? Boolean(data.isDefault) : Boolean(existing?.isDefault),
    active: data.active !== undefined ? Boolean(data.active) : (existing?.active ?? true),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeBrand(doc) {
  if (!doc) return null;
  const salesPointIds = Array.isArray(doc.salesPointIds)
    ? doc.salesPointIds.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'brand',
    id: doc._id,
    business_id: doc.business_id || '',
    user_id: doc.user_id || '',
    name: doc.name || '',
    description: doc.description || '',
    logo: doc.logo || '',
    website: doc.website || '',
    primaryColor: doc.primaryColor || '#6366F1',
    secondaryColor: doc.secondaryColor || '',
    shortCode: doc.shortCode || '',
    salesPointIds,
    deliveryLineKind: String(doc.deliveryLineKind || '').trim(),
    catalogCategories: Array.isArray(doc.catalogCategories)
      ? doc.catalogCategories.map((x) => String(x || '').trim()).filter(Boolean)
      : [],
    isDefault: Boolean(doc.isDefault),
    active: doc.active !== undefined ? Boolean(doc.active) : true,
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

const catalogBrandIndexReady = new Set();
const catalogTypeUserIndexReady = new Set();
const purchaseInvoiceListIndexReady = new Set();
const purchaseOrderListIndexReady = new Set();
const brandsByBusinessInflight = new Map();

async function ensurePurchaseInvoiceListIndex(req, dbName) {
  if (purchaseInvoiceListIndexReady.has(dbName)) return;
  const safeDb = String(dbName || '').replace(/[^a-z0-9]+/g, '-');
  await ensureIndex(req, dbName, ['type', 'user_id', 'date'], `idx-${safeDb}-purchase-invoice-list`).catch(
    () => null,
  );
  purchaseInvoiceListIndexReady.add(dbName);
}

async function ensurePurchaseOrderListIndex(req, dbName) {
  if (purchaseOrderListIndexReady.has(dbName)) return;
  const safeDb = String(dbName || '').replace(/[^a-z0-9]+/g, '-');
  await ensureIndex(req, dbName, ['type', 'user_id', 'createdAt'], `idx-${safeDb}-purchase-order-list`).catch(
    () => null,
  );
  purchaseOrderListIndexReady.add(dbName);
}

async function ensureCatalogTypeUserIndex(req, dbName) {
  if (catalogTypeUserIndexReady.has(dbName)) return;
  const safeDb = String(dbName || '').replace(/[^a-z0-9]+/g, '-');
  await ensureIndex(req, dbName, ['type', 'user_id'], `idx-${safeDb}-catalog-type-user_id`).catch(() => null);
  await ensureIndex(req, dbName, ['type', 'user_id', 'module'], `idx-${safeDb}-catalog-type-user-module`).catch(
    () => null,
  );
  catalogTypeUserIndexReady.add(dbName);
}

async function ensureCatalogBrandIndex(req, dbName) {
  if (catalogBrandIndexReady.has(dbName)) return;
  const safeDb = String(dbName || '').replace(/[^a-z0-9]/g, '-');
  await ensureIndex(req, dbName, ['type', 'business_id'], `idx-${safeDb}-type-business_id`).catch(() => null);
  catalogBrandIndexReady.add(dbName);
}

export async function listBrandsByBusiness(req, businessId) {
  const bid = String(businessId || '').replace(/^business:/, '').trim();
  if (!bid) return [];

  const db = getCatalogDbName();
  await ensureDatabase(req, db);

  const inflightKey = `${db}:${bid}`;
  if (brandsByBusinessInflight.has(inflightKey)) {
    return brandsByBusinessInflight.get(inflightKey);
  }

  const promise = (async () => {
    await ensureCatalogBrandIndex(req, db);
    const selector = { type: 'brand', business_id: bid };
    let docs = [];
    try {
      docs = await findDocuments(req, db, selector, { pageSize: 200, maxDocs: 500 });
    } catch {
      // Nunca caer a _all_docs del catálogo (satura prod). Reintentar _find una vez.
      try {
        docs = await findDocuments(req, db, selector, { pageSize: 200, maxDocs: 500 });
      } catch {
        docs = [];
      }
    }
    return docs
      .filter((doc) => {
        if (!doc || doc.type !== 'brand' || doc.deletedAt) return false;
        const docBid = String(doc.business_id || doc.businessId || '')
          .replace(/^business:/, '')
          .trim();
        return docBid === bid;
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
  })().finally(() => {
    brandsByBusinessInflight.delete(inflightKey);
  });

  brandsByBusinessInflight.set(inflightKey, promise);
  return promise;
}

// ─── BRAND BILLING CONFIG (Facturación entre marcas) ───────────────────────────

export function brandBillingConfigId(businessId) {
  return `brand-billing-${String(businessId || '').trim()}`;
}

function sanitizeBillingUnitColumns(cols) {
  if (!Array.isArray(cols)) return [];
  const allowed = new Set(['pizza', 'burger', 'taco']);
  const defaults = {
    pizza: 'TOTAL PIZZA',
    burger: 'TOTAL BURGUER',
    taco: 'TOTAL TACOS',
  };
  return cols
    .map((c) => {
      const key = String(c?.key || '').trim();
      if (!allowed.has(key)) return null;
      const header = String(c?.header || defaults[key] || key).trim().toUpperCase().slice(0, 24);
      return { key, header };
    })
    .filter(Boolean);
}

export function buildBrandBillingConfigDocument(businessId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || brandBillingConfigId(businessId);
  const sheetsIn = Array.isArray(data.sheets) ? data.sheets : (Array.isArray(existing?.sheets) ? existing.sheets : []);
  const sheetsRaw = sheetsIn
    .map((s, idx) => {
      if (!s || typeof s !== 'object') return null;
      const sheetId = String(s.id || `sheet-${idx + 1}`).trim() || `sheet-${idx + 1}`;
      const label = String(s.label || sheetId).trim().toUpperCase().slice(0, 31) || sheetId;
      const brandIds = Array.isArray(s.brandIds)
        ? s.brandIds.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      return {
        id: sheetId,
        label,
        brandIds,
        unitColumns: sanitizeBillingUnitColumns(s.unitColumns),
      };
    })
    .filter(Boolean);

  // Una marca solo en una hoja (la primera gana).
  const seenBrand = new Set();
  const sheets = sheetsRaw.map((s) => {
    const brandIds = [];
    for (const bid of s.brandIds) {
      if (!bid || seenBrand.has(bid)) continue;
      seenBrand.add(bid);
      brandIds.push(bid);
    }
    return { ...s, brandIds };
  });

  const monoRaw =
    data.monoBrandTakesAll !== undefined ? data.monoBrandTakesAll : existing?.monoBrandTakesAll;
  const modeRaw =
    data.sharedSplitMode !== undefined ? data.sharedSplitMode : existing?.sharedSplitMode;
  const modeStr = String(modeRaw || 'majority').trim();
  const sharedSplitMode =
    modeStr === 'equal' || modeStr === 'by_units' ? 'equal' : 'majority';
  const orphanRaw =
    data.orphanMode !== undefined ? data.orphanMode : existing?.orphanMode;
  const orphanStr = String(orphanRaw || 'shift_majority').trim();
  // Nunca persistir «unassigned»: los sueltos siempre van a una marca.
  const orphanMode =
    orphanStr === 'equal' || orphanStr === 'fixed_brand' ? orphanStr : 'shift_majority';
  const orphanFixedBrandId = String(
    data.orphanFixedBrandId !== undefined
      ? data.orphanFixedBrandId
      : (existing?.orphanFixedBrandId || ''),
  ).trim();
  const taxPolicy = normalizeEsTaxPolicy(
    data.taxPolicy !== undefined ? data.taxPolicy : existing?.taxPolicy,
  );

  const out = {
    _id: id,
    type: 'brand_billing_config',
    business_id: String(businessId || ''),
    sheets,
    sharedSplitMode,
    monoBrandTakesAll: monoRaw !== false,
    orphanMode,
    orphanFixedBrandId,
    taxPolicy,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  if (existing?._rev) out._rev = existing._rev;
  return out;
}

export function sanitizeBrandBillingConfig(doc) {
  if (!doc) return null;
  const modeStr = String(doc.sharedSplitMode || 'majority').trim();
  const sharedSplitMode =
    modeStr === 'equal' || modeStr === 'by_units' ? 'equal' : 'majority';
  const orphanStr = String(doc.orphanMode || 'shift_majority').trim();
  const orphanMode =
    orphanStr === 'equal' || orphanStr === 'fixed_brand' ? orphanStr : 'shift_majority';
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'brand_billing_config',
    business_id: doc.business_id || '',
    sheets: Array.isArray(doc.sheets) ? doc.sheets : [],
    sharedSplitMode,
    monoBrandTakesAll: doc.monoBrandTakesAll !== false,
    orphanMode,
    orphanFixedBrandId: String(doc.orphanFixedBrandId || '').trim(),
    taxPolicy: normalizeEsTaxPolicy(doc.taxPolicy),
    createdAt: doc.createdAt || '',
    updatedAt: doc.updatedAt || '',
  };
}

export async function getBrandBillingConfigDoc(req, businessId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const id = brandBillingConfigId(businessId);
  try {
    const doc = await getDocument(req, db, id);
    // El _id ya fija la empresa; no fallar si business_id histórico no coincide 1:1
    // (eso dejaba existing=null y el PUT sin _rev → conflict → «Guardar no va»).
    if (!doc || doc.type !== 'brand_billing_config') return null;
    return doc;
  } catch {
    return null;
  }
}

// ─── CATALOG ITEMS ────────────────────────────────────────────────────────────

export function buildCatalogItemDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `catitem-${uuidv4()}`;
  const fallbackSku = `ART-${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const sku = data.sku || existing?.sku || fallbackSku;
  const validItemTypes = ['product', 'service', 'combo'];
  const itemType = validItemTypes.includes(data.itemType) ? data.itemType : (existing?.itemType || 'product');
  const validModules = ['stock', 'catalog'];
  const module = validModules.includes(data.module) ? data.module : (existing?.module || 'catalog');

  const sanitizeArticles = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.filter(a => a && a.articleId).map(a => ({
      articleId: String(a.articleId),
      articleName: String(a.articleName || ''),
      quantity: Number(a.quantity || 1),
      unit: String(a.unit || 'ud'),
    }));
  };

  const sanitizeComboItems = (arr) => {
    if (!Array.isArray(arr)) return [];
    const validSlots = new Set(['main', 'drink', 'dessert', 'side', 'other']);
    return arr.filter(a => a && a.productId).map(a => {
      const slotKind = String(a.slotKind || '').trim();
      const row = {
        productId: String(a.productId),
        productName: String(a.productName || ''),
        quantity: Number(a.quantity || 1),
      };
      if (validSlots.has(slotKind)) row.slotKind = slotKind;
      return row;
    });
  };

  const sanitizeSalesChannels = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.filter(a => a && a.channelId).map(a => ({
      channelId: String(a.channelId),
      channelName: String(a.channelName || ''),
      customPrice: a.customPrice !== undefined && a.customPrice !== null && a.customPrice !== '' ? Number(a.customPrice) : null,
    }));
  };

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'catalog_item',
    id,
    sku,
    user_id: userId,
    module,
    itemType,
    vertical: String(data.vertical || existing?.vertical || ''),
    name: String(data.name || ''),
    description: String(data.description || ''),
    category: String(data.category || 'general'),
    unitPrice: Number(data.unitPrice || 0),
    staffPrice: data.staffPrice !== undefined && data.staffPrice !== null && data.staffPrice !== ''
      ? Number(data.staffPrice)
      : (existing?.staffPrice ?? null),
    costPrice: Number(data.costPrice || 0),
    taxRate: data.taxRate !== undefined ? Number(data.taxRate) : (existing?.taxRate ?? 21),
    stockQuantity: Number(data.stockQuantity ?? existing?.stockQuantity ?? 0),
    minStock: Number(data.minStock || 0),
    reorderQuantity: Number(data.reorderQuantity ?? existing?.reorderQuantity ?? 0),
    autoReorder: data.autoReorder !== undefined ? Boolean(data.autoReorder) : (existing?.autoReorder ?? false),
    unit: String(data.unit || 'ud'),
    supplierId: String(data.supplierId || ''),
    supplierName: String(data.supplierName || ''),
    allergens: Array.isArray(data.allergens) ? data.allergens : (existing?.allergens || []),
    image: String(data.image || existing?.image || ''),
    images: Array.isArray(data.images) ? data.images.map(String) : (existing?.images || []),
    active: data.active !== undefined ? Boolean(data.active) : (existing?.active ?? true),
    webVisible: data.webVisible !== undefined ? Boolean(data.webVisible) : (existing?.webVisible ?? true),
    available: data.available !== undefined ? Boolean(data.available) : (existing?.available ?? true),
    notes: String(data.notes || ''),
    barcode: String(data.barcode || existing?.barcode || ''),
    brandIds: Array.isArray(data.brandIds) ? data.brandIds.map(String) : (existing?.brandIds || []),
    articles: sanitizeArticles(data.articles ?? existing?.articles),
    comboItems: sanitizeComboItems(data.comboItems ?? existing?.comboItems),
    salesChannels: sanitizeSalesChannels(data.salesChannels ?? existing?.salesChannels),
    stockCategory: VALID_STOCK_CATEGORIES.includes(data.stockCategory) ? data.stockCategory : (existing?.stockCategory || 'other'),
    stockSubcategory: String(data.stockSubcategory || existing?.stockSubcategory || ''),
    // Carta (module catalog): no sticky isStockItem. Ver shared/catalog/catalogStockGuard.js
    isStockItem: resolveCatalogItemIsStockItem({ data, existing, module }),
    isCritical: data.isCritical !== undefined ? Boolean(data.isCritical) : (existing?.isCritical ?? false),
    workCenterId: String(data.workCenterId || existing?.workCenterId || ''),
    workCenterName: String(data.workCenterName || existing?.workCenterName || ''),
    warehouseStock: Array.isArray(data.warehouseStock)
      ? data.warehouseStock.map((ws) => ({
          warehouseId: String(ws.warehouseId || ''),
          warehouseName: String(ws.warehouseName || ''),
          quantity: Number(ws.quantity || 0),
          minStock: Number(ws.minStock || 0),
        }))
      : (existing?.warehouseStock || []),
    maxStock: Number(data.maxStock ?? existing?.maxStock ?? 0),
    lastPurchasePrice: Number(data.lastPurchasePrice ?? existing?.lastPurchasePrice ?? 0),
    lastPurchaseDate: String(data.lastPurchaseDate || existing?.lastPurchaseDate || ''),
    customFields: mergeCatalogCustomFields(existing?.customFields, data.customFields),
    business_id: String(data.business_id || data.businessId || existing?.business_id || existing?.businessId || '').trim(),
    supplierProductAliases: sanitizeSupplierProductAliases(
      Object.prototype.hasOwnProperty.call(data, 'supplierProductAliases')
        ? data.supplierProductAliases
        : existing?.supplierProductAliases,
    ),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export const VALID_STOCK_CATEGORIES = ['ingredient', 'beverage', 'packaging', 'cleaning', 'consumable', 'finished_product', 'other'];

export function sanitizeCatalogItem(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'catalog_item',
    id: doc._id,
    sku: doc.sku || '',
    user_id: doc.user_id,
    module: doc.module || 'catalog',
    itemType: doc.itemType || 'product',
    vertical: doc.vertical || '',
    name: doc.name || '',
    description: doc.description || '',
    category: doc.category || 'general',
    unitPrice: Number(doc.unitPrice || 0),
    staffPrice: doc.staffPrice !== undefined && doc.staffPrice !== null && doc.staffPrice !== ''
      ? Number(doc.staffPrice)
      : null,
    costPrice: Number(doc.costPrice || 0),
    taxRate: doc.taxRate !== undefined ? Number(doc.taxRate) : 21,
    stockQuantity: Number(doc.stockQuantity || 0),
    minStock: Number(doc.minStock || 0),
    reorderQuantity: Number(doc.reorderQuantity || 0),
    autoReorder: doc.autoReorder !== undefined ? Boolean(doc.autoReorder) : false,
    unit: doc.unit || 'ud',
    supplierId: doc.supplierId || '',
    supplierName: doc.supplierName || '',
    allergens: Array.isArray(doc.allergens) ? doc.allergens : [],
    image: doc.image || '',
    images: Array.isArray(doc.images) ? doc.images : [],
    active: doc.active !== undefined ? Boolean(doc.active) : true,
    webVisible: doc.webVisible !== undefined ? Boolean(doc.webVisible) : true,
    available: doc.available !== undefined ? Boolean(doc.available) : true,
    notes: doc.notes || '',
    barcode: doc.barcode || '',
    brandIds: Array.isArray(doc.brandIds) ? doc.brandIds : [],
    articles: Array.isArray(doc.articles) ? doc.articles : [],
    comboItems: Array.isArray(doc.comboItems) ? doc.comboItems : [],
    salesChannels: Array.isArray(doc.salesChannels) ? doc.salesChannels : [],
    stockCategory: doc.stockCategory || 'other',
    stockSubcategory: doc.stockSubcategory || '',
    isStockItem: doc.isStockItem !== undefined ? Boolean(doc.isStockItem) : false,
    warehouseStock: Array.isArray(doc.warehouseStock) ? doc.warehouseStock : [],
    maxStock: Number(doc.maxStock || 0),
    lastPurchasePrice: Number(doc.lastPurchasePrice || 0),
    lastPurchaseDate: doc.lastPurchaseDate || '',
    customFields: (doc.customFields && typeof doc.customFields === 'object') ? { ...doc.customFields } : {},
    business_id: String(doc.business_id || doc.businessId || '').trim(),
    supplierProductAliases: sanitizeSupplierProductAliases(doc.supplierProductAliases),
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

/** Catálogo mínimo para TPV: sin imágenes ni campos pesados (carga y búsqueda más rápida). */
export function sanitizeCatalogItemForTpv(doc) {
  if (!doc) return null;
  const rawCf = doc.customFields && typeof doc.customFields === 'object' ? doc.customFields : {};
  const customFields = {};
  if (typeof rawCf.ingredients === 'string' && rawCf.ingredients.trim()) {
    customFields.ingredients = rawCf.ingredients.trim();
  }
  if (Array.isArray(rawCf.supplements) && rawCf.supplements.length > 0) {
    customFields.supplements = rawCf.supplements;
  }
  if (Array.isArray(rawCf.comboStructure) && rawCf.comboStructure.length > 0) {
    customFields.comboStructure = rawCf.comboStructure;
  }
  if (rawCf.comboStructureConfirmed === true) {
    customFields.comboStructureConfirmed = true;
  }
  // Allowlists de menú (p. ej. Individual → solo Patatas Deluxe/Monalisa).
  if (rawCf.comboSlotAllowlists && typeof rawCf.comboSlotAllowlists === 'object' && !Array.isArray(rawCf.comboSlotAllowlists)) {
    customFields.comboSlotAllowlists = rawCf.comboSlotAllowlists;
  }
  // Suplementos por producto del hueco (p. ej. Tequeños +1,50 / Salchipapas +1).
  if (rawCf.comboSlotSurcharges && typeof rawCf.comboSlotSurcharges === 'object' && !Array.isArray(rawCf.comboSlotSurcharges)) {
    customFields.comboSlotSurcharges = rawCf.comboSlotSurcharges;
  }
  if (rawCf.halfHalf === true) {
    customFields.halfHalf = true;
  }
  const halfHalfAllowed = Array.isArray(rawCf.halfHalfAllowedProductIds)
    ? rawCf.halfHalfAllowedProductIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (halfHalfAllowed.length > 0) {
    customFields.halfHalfAllowedProductIds = halfHalfAllowed;
  }
  if (rawCf.buildYourOwn === true) {
    customFields.buildYourOwn = true;
  }
  const byoMaxRaw = Number(rawCf.buildYourOwnMaxIngredients);
  if (Number.isFinite(byoMaxRaw) && byoMaxRaw > 0) {
    customFields.buildYourOwnMaxIngredients = Math.min(20, Math.floor(byoMaxRaw));
  }
  const buildYourOwnAllowed = Array.isArray(rawCf.buildYourOwnAllowedIngredientIds)
    ? rawCf.buildYourOwnAllowedIngredientIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (buildYourOwnAllowed.length > 0) {
    customFields.buildYourOwnAllowedIngredientIds = buildYourOwnAllowed;
  }
  return {
    _id: doc._id,
    type: 'catalog_item',
    id: doc._id,
    user_id: doc.user_id,
    module: doc.module || 'catalog',
    itemType: doc.itemType || 'product',
    name: doc.name || '',
    category: doc.category || 'general',
    unitPrice: Number(doc.unitPrice || 0),
    sku: doc.sku || '',
    barcode: doc.barcode || '',
    brandIds: Array.isArray(doc.brandIds) ? doc.brandIds : [],
    business_id: String(doc.business_id || doc.businessId || '').trim(),
    active: doc.active !== undefined ? Boolean(doc.active) : true,
    image: String(doc.image || doc.images?.[0] || '').trim(),
    images: [],
    description: '',
    notes: '',
    costPrice: 0,
    taxRate: doc.taxRate !== undefined ? Number(doc.taxRate) : 21,
    stockQuantity: 0,
    minStock: 0,
    reorderQuantity: 0,
    autoReorder: false,
    unit: doc.unit || 'ud',
    supplierId: '',
    supplierName: '',
    allergens: [],
    webVisible: true,
    available: true,
    articles: [],
    comboItems: Array.isArray(doc.comboItems)
      ? doc.comboItems
          .map((c) => {
            const slotKind = String(c?.slotKind || '').trim();
            const validSlots = new Set(['main', 'drink', 'dessert', 'side', 'other']);
            const row = {
              productId: String(c?.productId || '').trim(),
              productName: String(c?.productName || '').trim(),
              quantity: Number(c?.quantity) > 0 ? Number(c.quantity) : 1,
            };
            if (validSlots.has(slotKind)) row.slotKind = slotKind;
            return row;
          })
          .filter((c) => c.productId)
      : [],
    salesChannels: [],
    stockCategory: 'other',
    stockSubcategory: '',
    isStockItem: false,
    warehouseStock: [],
    maxStock: 0,
    lastPurchasePrice: 0,
    lastPurchaseDate: '',
    customFields,
    vertical: doc.vertical || '',
    staffPrice: null,
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

/**
 * Catálogo mínimo para panel Ingredientes: badges inventario + productos relacionados.
 * Sin imágenes ni campos pesados (payload mucho más pequeño que sanitizeCatalogItem).
 */
export function sanitizeCatalogItemForIngredients(doc) {
  if (!doc) return null;
  const rawCf = doc.customFields && typeof doc.customFields === 'object' ? doc.customFields : {};
  const customFields = {};
  if (typeof rawCf.ingredients === 'string' && rawCf.ingredients.trim()) {
    customFields.ingredients = rawCf.ingredients.trim();
  }
  return {
    _id: doc._id,
    id: doc._id,
    type: 'catalog_item',
    name: doc.name || '',
    module: doc.module || 'catalog',
    stockCategory: doc.stockCategory || 'other',
    brandIds: Array.isArray(doc.brandIds) ? doc.brandIds : [],
    active: doc.active !== undefined ? Boolean(doc.active) : true,
    supplierName: String(doc.supplierName || ''),
    customFields,
  };
}

// ─── STAFF CONSUMPTIONS ───────────────────────────────────────────────────────

const STAFF_CONSUMPTION_PAYMENT_MODES = ['cash_now', 'payroll_deduction'];

function inferStaffConsumptionType(category = '') {
  const c = String(category || '').trim().toLowerCase();
  if (/(bebida|drink|refresco|cerveza|café|cafe|zumo)/.test(c)) return 'drink';
  if (/(comida|menu|menú|cena|plato|tapas|tapa)/.test(c)) return 'meal';
  return 'other';
}

export function buildStaffConsumptionDocument(userId, data = {}) {
  const now = new Date().toISOString();
  const id = data.id || data._id || `staffcons-${uuidv4()}`;
  const quantity = Math.max(1, Number(data.quantity || 1));
  const unitPrice = Math.round(Number(data.unitPrice || 0) * 100) / 100;
  const publicUnitPrice = Math.round(Number(data.publicUnitPrice ?? data.unitPrice ?? 0) * 100) / 100;
  const paymentMode = STAFF_CONSUMPTION_PAYMENT_MODES.includes(String(data.paymentMode || ''))
    ? String(data.paymentMode)
    : 'payroll_deduction';

  return {
    _id: id,
    _rev: data._rev,
    type: 'staff_consumption',
    id,
    user_id: userId,
    workerId: String(data.workerId || ''),
    workerName: String(data.workerName || ''),
    catalogItemId: String(data.catalogItemId || ''),
    itemName: String(data.itemName || ''),
    category: String(data.category || ''),
    consumptionType: inferStaffConsumptionType(data.category),
    quantity,
    unitPrice,
    publicUnitPrice,
    total: Math.round(unitPrice * quantity * 100) / 100,
    paymentMode,
    salesPointId: String(data.salesPointId || ''),
    salesPointName: String(data.salesPointName || ''),
    registerSessionId: String(data.registerSessionId || ''),
    recordedBy: String(data.recordedBy || ''),
    recordedByName: String(data.recordedByName || ''),
    notes: String(data.notes || ''),
    createdAt: data.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeStaffConsumption(doc) {
  if (!doc || doc.type !== 'staff_consumption') return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'staff_consumption',
    id: doc._id,
    user_id: doc.user_id,
    workerId: doc.workerId || '',
    workerName: doc.workerName || '',
    catalogItemId: doc.catalogItemId || '',
    itemName: doc.itemName || '',
    category: doc.category || '',
    consumptionType: doc.consumptionType || inferStaffConsumptionType(doc.category),
    quantity: Number(doc.quantity || 1),
    unitPrice: Number(doc.unitPrice || 0),
    publicUnitPrice: Number(doc.publicUnitPrice ?? doc.unitPrice ?? 0),
    total: Number(doc.total || 0),
    paymentMode: STAFF_CONSUMPTION_PAYMENT_MODES.includes(String(doc.paymentMode || ''))
      ? String(doc.paymentMode)
      : 'payroll_deduction',
    salesPointId: doc.salesPointId || '',
    salesPointName: doc.salesPointName || '',
    registerSessionId: doc.registerSessionId || '',
    recordedBy: doc.recordedBy || '',
    recordedByName: doc.recordedByName || '',
    notes: doc.notes || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listStaffConsumptionsByUser(req, userId) {
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'staff_consumption' && !doc?.deletedAt && (!userId || doc?.user_id === userId))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function listCatalogItemsByUser(req, userId, { module: filterModule } = {}) {
  const uid = String(userId || '').trim();
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  await ensureCatalogTypeUserIndex(req, db);

  const maxDocs =
    filterModule === 'stock' ? 12_000 : filterModule === 'catalog' ? 12_000 : 20_000;

  // Mango por type+user_id: no leer el catálogo compartido entero (_all_docs)
  // solo para listar la carta de un titular (aunque tenga 0 productos).
  let docs;
  try {
    let selector;
    if (uid && filterModule === 'stock') {
      selector = { type: 'catalog_item', user_id: uid, module: 'stock' };
    } else if (uid && filterModule === 'catalog') {
      // Carta: excluir almacén puro en el servidor (menos payload).
      selector = {
        type: 'catalog_item',
        user_id: uid,
        module: { $ne: 'stock' },
      };
    } else if (uid) {
      selector = { type: 'catalog_item', user_id: uid };
    } else if (filterModule === 'stock') {
      selector = { type: 'catalog_item', module: 'stock' };
    } else if (filterModule === 'catalog') {
      selector = { type: 'catalog_item', module: { $ne: 'stock' } };
    } else {
      selector = { type: 'catalog_item' };
    }
    docs = await findDocuments(req, db, selector, { pageSize: 500, maxDocs });
  } catch {
    // Nunca caer a _all_docs del catálogo compartido (puede tardar decenas de segundos).
    if (uid) {
      try {
        docs = await findDocuments(
          req,
          db,
          { type: 'catalog_item', user_id: uid },
          { pageSize: 500, maxDocs },
        );
      } catch {
        docs = [];
      }
    } else {
      docs = [];
    }
  }

  return docs
    .filter((doc) => {
      if (!doc || doc.type !== 'catalog_item' || doc.deletedAt) return false;
      if (uid && !catalogDocMatchesUser(doc, uid)) return false;
      if (filterModule && (doc.module || 'catalog') !== filterModule) return false;
      return true;
    })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────

function normalizeSupplierOrganizerIds(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const id = String(item || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function buildSupplierDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  // Nunca reutilizar _id/_rev del body en altas: si el form arrastra el del anterior,
  // CouchDB haría conflicto o sobrescribiría y parecería que "solo deja 1 proveedor".
  const id = existing?._id || `sup-${uuidv4()}`;
  const organizerIds = Object.prototype.hasOwnProperty.call(data, 'organizerIds')
    ? normalizeSupplierOrganizerIds(data.organizerIds)
    : normalizeSupplierOrganizerIds(existing?.organizerIds);
  const catalogItemIds = Object.prototype.hasOwnProperty.call(data, 'catalogItemIds')
    ? normalizeSupplierOrganizerIds(data.catalogItemIds)
    : normalizeSupplierOrganizerIds(existing?.catalogItemIds);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'supplier',
    id,
    user_id: userId,
    name: String(data.name || ''),
    code: String(data.code || existing?.code || '').trim().toUpperCase(),
    cif: String(data.cif || ''),
    email: String(data.email || ''),
    phone: String(data.phone || ''),
    address: String(data.address || ''),
    contactPerson: String(data.contactPerson || ''),
    category: String(data.category || 'general'),
    organizerIds,
    catalogItemIds,
    paymentTerms: String(data.paymentTerms || '30 días'),
    notes: String(data.notes || ''),
    active: data.active !== undefined ? Boolean(data.active) : (existing?.active ?? true),
    validated: data.validated !== undefined ? Boolean(data.validated) : (existing?.validated ?? false),
    validatedAt: data.validatedAt || existing?.validatedAt || '',
    validatedBy: data.validatedBy || existing?.validatedBy || '',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeSupplier(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'supplier',
    id: doc._id,
    user_id: doc.user_id,
    name: doc.name || '',
    code: doc.code || '',
    cif: doc.cif || '',
    email: doc.email || '',
    phone: doc.phone || '',
    address: doc.address || '',
    contactPerson: doc.contactPerson || '',
    category: doc.category || 'general',
    organizerIds: normalizeSupplierOrganizerIds(doc.organizerIds),
    catalogItemIds: normalizeSupplierOrganizerIds(doc.catalogItemIds),
    paymentTerms: doc.paymentTerms || '30 días',
    notes: doc.notes || '',
    active: doc.active !== undefined ? Boolean(doc.active) : true,
    validated: doc.validated !== undefined ? Boolean(doc.validated) : false,
    validatedAt: doc.validatedAt || '',
    validatedBy: doc.validatedBy || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listSuppliersByUser(req, userId) {
  const uid = String(userId || '').trim();
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  await ensureCatalogTypeUserIndex(req, db);

  let docs;
  const selector = uid ? { type: 'supplier', user_id: uid } : { type: 'supplier' };
  try {
    docs = await findDocuments(req, db, selector, { pageSize: 200, maxDocs: 3_000 });
  } catch {
    try {
      docs = await findDocuments(req, db, selector, { pageSize: 200, maxDocs: 3_000 });
    } catch {
      docs = [];
    }
  }

  return docs
    .filter((doc) => doc?.type === 'supplier' && !doc?.deletedAt && (!uid || doc?.user_id === uid))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}

// ─── PURCHASE INVOICES ────────────────────────────────────────────────────────

export function buildPurchaseInvoiceDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `pinv-${uuidv4()}`;
  const documentKind = String(
    data.documentKind || data.ocrData?.documentType || existing?.documentKind || 'factura_proveedor',
  );
  const invoiceNumber = existing
    ? String(data.invoiceNumber || data.documentNumber || existing.invoiceNumber || '').trim()
    : resolvePurchaseInvoiceNumber(
        {
          invoiceNumber: data.invoiceNumber || data.documentNumber,
          documentKind,
        },
        Array.isArray(data.existingInvoiceNumbers) ? data.existingInvoiceNumbers : [],
      );

  const rawLines = Array.isArray(data.lines) ? data.lines : (existing?.lines || []);
  const lines = rawLines.map((line, idx) => {
    const description = String(line.description || line.itemName || '').trim();
    const quantity = Number(line.quantity || 0) || 1;
    const unitPrice = Number(line.unitPrice || line.unitCost || 0);
    const lineTotalRaw = Number(line.total ?? line.lineTotal ?? line.amount ?? 0);
    const total = lineTotalRaw || quantity * unitPrice;
    const resolvedUnit = unitPrice || (quantity > 0 ? total / quantity : 0);
    return {
      id: line.id || `pinvl-${idx}`,
      description,
      itemName: line.itemName || description,
      quantity,
      unitPrice: Math.round(resolvedUnit * 100) / 100,
      total: Math.round(total * 100) / 100,
      catalogItemId: String(line.catalogItemId || ''),
      catalogItemName: String(line.catalogItemName || ''),
      sku: String(line.sku || ''),
      matchConfidence: line.matchConfidence ?? null,
      matchMethod: String(line.matchMethod || ''),
    };
  }).filter((l) => l.description || l.total > 0);

  const computedSubtotal = lines.reduce((s, l) => s + Number(l.total || 0), 0);
  const taxRate = Number(data.taxRate ?? data.ocrData?.taxRate ?? existing?.taxRate ?? 21);
  const ocrTotal = Number(data.total ?? data.ocrData?.total ?? 0);
  const ocrSubtotal = Number(data.subtotal ?? data.ocrData?.subtotal ?? 0);
  const ocrTaxAmount = Number(data.taxAmount ?? data.ocrData?.taxAmount ?? NaN);

  let subtotal = computedSubtotal;
  let taxAmount = Number.isFinite(ocrTaxAmount) && computedSubtotal <= 0
    ? ocrTaxAmount
    : subtotal * (taxRate / 100);
  let total = subtotal + taxAmount;

  // OCR a veces da total/cabecera pero líneas vacías o a 0 → no dejar 0,00 €
  if (computedSubtotal <= 0 && (ocrTotal > 0 || ocrSubtotal > 0)) {
    if (ocrSubtotal > 0) {
      subtotal = ocrSubtotal;
      taxAmount = Number.isFinite(ocrTaxAmount)
        ? ocrTaxAmount
        : (ocrTotal > ocrSubtotal ? ocrTotal - ocrSubtotal : subtotal * (taxRate / 100));
      total = ocrTotal > 0 ? ocrTotal : subtotal + taxAmount;
    } else {
      total = ocrTotal;
      subtotal = Number((ocrTotal / (1 + taxRate / 100)).toFixed(2));
      taxAmount = Number((ocrTotal - subtotal).toFixed(2));
    }
  } else if (computedSubtotal > 0 && ocrTotal > 0 && Math.abs(ocrTotal - total) > 0.05) {
    // Preferir total del documento OCR si las líneas no cuadran
    total = ocrTotal;
  }

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'purchase_invoice',
    id,
    invoiceNumber,
    user_id: userId,
    supplierId: String(data.supplierId || ''),
    supplierName: String(data.supplierName || ''),
    date: String(data.date || now.split('T')[0]),
    dueDate: String(data.dueDate || ''),
    status: String(data.status || 'pending'),
    lines,
    subtotal: Math.round(subtotal * 100) / 100,
    taxRate,
    taxAmount: Math.round(taxAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
    notes: String(data.notes || ''),
    paidAt: String(data.paidAt || existing?.paidAt || ''),
    linkedPurchaseOrderId: data.linkedPurchaseOrderId || existing?.linkedPurchaseOrderId || '',
    linkedPurchaseOrderNumber: data.linkedPurchaseOrderNumber || existing?.linkedPurchaseOrderNumber || '',
    costCenterId: data.costCenterId || data.workCenterId || existing?.costCenterId || existing?.workCenterId || '',
    costCenterName: data.costCenterName || data.workCenterName || existing?.costCenterName || existing?.workCenterName || '',
    businessId: String(data.businessId || data.business_id || existing?.businessId || existing?.business_id || '').trim(),
    businessName: String(data.businessName || data.business_name || existing?.businessName || existing?.business_name || '').trim(),
    workCenterId: String(data.workCenterId || data.costCenterId || existing?.workCenterId || existing?.costCenterId || '').trim(),
    workCenterName: String(data.workCenterName || data.costCenterName || existing?.workCenterName || existing?.costCenterName || '').trim(),
    entryMethod: data.entryMethod || existing?.entryMethod || 'manual',
    documentKind,
    source: data.source || existing?.source || (data.entryMethod === 'email' ? 'email' : 'manual'),
    sourceEmailId: String(data.sourceEmailId || existing?.sourceEmailId || ''),
    sourceEmailFrom: String(data.sourceEmailFrom || existing?.sourceEmailFrom || ''),
    sourceEmailSubject: String(data.sourceEmailSubject || existing?.sourceEmailSubject || ''),
    sourceEmailDate: String(data.sourceEmailDate || existing?.sourceEmailDate || ''),
    attachments: Array.isArray(data.attachments)
      ? data.attachments
      : (Array.isArray(existing?.attachments) ? existing.attachments : []),
    ocrData: data.ocrData || existing?.ocrData || null,
    ocrImageBase64: data.ocrImageBase64 || existing?.ocrImageBase64 || '',
    ocrStockReceivedAt: String(data.ocrStockReceivedAt || existing?.ocrStockReceivedAt || ''),
    ocrStockLinesReceived: Number(data.ocrStockLinesReceived ?? existing?.ocrStockLinesReceived ?? 0) || 0,
    pendingOrderLines: Array.isArray(data.pendingOrderLines)
      ? data.pendingOrderLines
      : (Array.isArray(existing?.pendingOrderLines) ? existing.pendingOrderLines : []),
    priceVariance: data.priceVariance && typeof data.priceVariance === 'object'
      ? data.priceVariance
      : (existing?.priceVariance && typeof existing.priceVariance === 'object'
        ? existing.priceVariance
        : null),
    flags: {
      ...((existing?.flags && typeof existing.flags === 'object' && !Array.isArray(existing.flags))
        ? existing.flags
        : {}),
      ...((data.flags && typeof data.flags === 'object' && !Array.isArray(data.flags))
        ? data.flags
        : {}),
    },
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function normalizePurchaseInvoiceStatus(value) {
  const allowed = ['paid', 'pending', 'overdue', 'draft', 'partial'];
  return allowed.includes(String(value || '')) ? String(value) : 'pending';
}

export function sanitizePurchaseInvoice(doc, options = {}) {
  if (!doc || typeof doc !== 'object') return null;
  const forList = options?.forList === true;
  const flags = doc.flags && typeof doc.flags === 'object' && !Array.isArray(doc.flags)
    ? doc.flags
    : {};
  const statusRaw = String(doc.status || '').trim();
  const status = ['paid', 'pending', 'overdue', 'draft', 'partial'].includes(statusRaw)
    ? statusRaw
    : 'pending';
  const sanitized = {
    _id: doc._id,
    _rev: doc._rev,
    type: 'purchase_invoice',
    id: doc._id,
    invoiceNumber: doc.invoiceNumber || '',
    user_id: doc.user_id,
    supplierId: doc.supplierId || '',
    supplierName: doc.supplierName || '',
    supplierCif: doc.supplierCif || '',
    supplierMatched: Boolean(doc.supplierMatched),
    supplierMatchMethod: doc.supplierMatchMethod || '',
    date: doc.date || '',
    dueDate: doc.dueDate || '',
    status: normalizePurchaseInvoiceStatus(status) || status,
    paymentStatus: typeof normalizePaymentStatus === 'function'
      ? normalizePaymentStatus(doc.paymentStatus)
      : (doc.paymentStatus || 'pending'),
    lines: Array.isArray(doc.lines) ? doc.lines : [],
    subtotal: Number(doc.subtotal || 0),
    taxRate: Number(doc.taxRate || 21),
    taxAmount: Number(doc.taxAmount || 0),
    total: Number(doc.total || 0),
    currency: doc.currency || 'EUR',
    proposedCategory: doc.proposedCategory || '',
    proposedPayMethod: doc.proposedPayMethod || '',
    notes: doc.notes || '',
    paidAt: doc.paidAt || '',
    linkedPurchaseOrderId: doc.linkedPurchaseOrderId || '',
    linkedPurchaseOrderNumber: doc.linkedPurchaseOrderNumber || '',
    linkedFinanceId: doc.linkedFinanceId || '',
    costCenterId: doc.costCenterId || '',
    costCenterName: doc.costCenterName || '',
    businessId: doc.businessId || doc.business_id || '',
    businessName: doc.businessName || doc.business_name || '',
    workCenterId: doc.workCenterId || doc.costCenterId || '',
    workCenterName: doc.workCenterName || doc.costCenterName || '',
    entryMethod: doc.entryMethod || 'manual',
    documentKind: doc.documentKind || doc.ocrData?.documentType || 'factura_proveedor',
    source: doc.source || 'manual',
    sourceEmailId: doc.sourceEmailId || '',
    sourceEmailFrom: doc.sourceEmailFrom || '',
    sourceEmailSubject: doc.sourceEmailSubject || '',
    sourceEmailDate: doc.sourceEmailDate || '',
    attachments: Array.isArray(doc.attachments) ? doc.attachments : [],
    ocrData: doc.ocrData || null,
    ocrConfidence: doc.ocrConfidence || '',
    ocrStockReceivedAt: doc.ocrStockReceivedAt || '',
    ocrStockLinesReceived: Number(doc.ocrStockLinesReceived || 0) || 0,
    pendingOrderLines: Array.isArray(doc.pendingOrderLines) ? doc.pendingOrderLines : [],
    priceVariance: doc.priceVariance && typeof doc.priceVariance === 'object'
      ? {
          hasVariance: Boolean(doc.priceVariance.hasVariance),
          checkedAt: String(doc.priceVariance.checkedAt || ''),
          thresholdPct: Number(doc.priceVariance.thresholdPct || 0.02),
          lines: Array.isArray(doc.priceVariance.lines) ? doc.priceVariance.lines : [],
        }
      : null,
    flags: {
      duplicate: Boolean(flags.duplicate),
      duplicateOf: flags.duplicateOf || '',
      noAttachment: Boolean(flags.noAttachment),
      supplierNotFound: Boolean(flags.supplierNotFound),
      ocrFailed: Boolean(flags.ocrFailed),
      manualReview: Boolean(flags.manualReview),
      stockPending: Boolean(flags.stockPending),
      orderIncomplete: Boolean(flags.orderIncomplete),
      priceVariance: Boolean(flags.priceVariance || doc.priceVariance?.hasVariance),
    },
    reviewNotes: doc.reviewNotes || '',
    reviewedBy: doc.reviewedBy || '',
    reviewedAt: doc.reviewedAt || null,
    validationStatus: doc.validationStatus || 'pending_validation',
    validatedAt: doc.validatedAt || '',
    validatedBy: doc.validatedBy || '',
    pdfUrl: doc.pdfUrl || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
  if (!forList) {
    sanitized.ocrImageBase64 = doc.ocrImageBase64 || '';
  }
  return sanitized;
}

export function normalizePurchaseListLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return 400;
  return Math.min(Math.max(Math.floor(n), 1), 2000);
}

export async function listPurchaseInvoicesByUser(req, userId, options = {}) {
  const uid = String(userId || '').trim();
  const listLimit = normalizePurchaseListLimit(options.limit);
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  await ensureCatalogTypeUserIndex(req, db);
  await ensurePurchaseInvoiceListIndex(req, db);

  const selector = uid
    ? { type: 'purchase_invoice', user_id: uid }
    : { type: 'purchase_invoice' };
  const sort = uid
    ? [{ type: 'asc' }, { user_id: 'asc' }, { date: 'desc' }]
    : [{ type: 'asc' }, { date: 'desc' }];

  let docs;
  try {
    docs = await findDocuments(req, db, selector, {
      pageSize: 200,
      maxDocs: listLimit,
      sort,
    });
  } catch {
    try {
      docs = await findDocuments(req, db, selector, { pageSize: 200, maxDocs: listLimit });
      docs = docs
        .filter(
          (doc) =>
            doc?.type === 'purchase_invoice' && !doc?.deletedAt && (!uid || doc?.user_id === uid),
        )
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
        .slice(0, listLimit);
    } catch {
      docs = [];
    }
  }

  let invoices = docs.filter(
    (doc) =>
      doc?.type === 'purchase_invoice' && !doc?.deletedAt && (!uid || doc?.user_id === uid),
  );
  if (options.businessId) {
    invoices = filterCatalogDocsByBusinessScope(
      invoices,
      options.businessId,
      options.accountBusinessCount ?? 1,
    );
  }

  return invoices
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, listLimit);
}

/** Asigna A-0001 / F-0001 si no hay nº de proveedor. */
export async function assignPurchaseInvoiceNumber(req, userId, data = {}) {
  const invoices = await listPurchaseInvoicesByUser(req, userId);
  return resolvePurchaseInvoiceNumber(
    {
      invoiceNumber: data.invoiceNumber || data.documentNumber,
      documentKind: data.documentKind || data.ocrData?.documentType,
    },
    invoices.map((inv) => inv.invoiceNumber),
  );
}

/** Normaliza nº de factura/albarán para detectar duplicados (código). */
export function normalizePurchaseInvoiceNumber(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\s.\-_/#]+/g, '');
}

/**
 * Busca factura/albarán ya metido por código.
 * Criterio principal: mismo nº de factura (normalizado). Si ambos tienen proveedor, debe coincidir.
 */
export async function findDuplicatePurchaseInvoice(req, userId, invoiceNumber, supplierId, total, options = {}) {
  const normalized = normalizePurchaseInvoiceNumber(invoiceNumber);
  if (!normalized) return null;
  const excludeId = String(options.excludeId || '').trim();
  const invoices = await listPurchaseInvoicesByUser(req, userId);
  return invoices.find((inv) => {
    if (excludeId && inv._id === excludeId) return false;
    const invNum = normalizePurchaseInvoiceNumber(inv.invoiceNumber);
    if (!invNum || invNum !== normalized) return false;
    const wantSupplier = String(supplierId || '').trim();
    const haveSupplier = String(inv.supplierId || '').trim();
    if (wantSupplier && haveSupplier && wantSupplier !== haveSupplier) return false;
    if (total != null && inv.total != null) {
      const diff = Math.abs(Number(inv.total) - Number(total));
      if (diff > 0.01) return false;
    }
    return true;
  }) || null;
}

export async function findPurchaseInvoiceByEmailId(req, userId, messageId) {
  if (!messageId) return null;
  const invoices = await listPurchaseInvoicesByUser(req, userId);
  return invoices.find((inv) => inv.sourceEmailId === messageId) || null;
}

export async function generateExpenseFromInvoice(req, userId, invoice) {
  const db = getFinanceDbName();
  await ensureDatabase(req, db);
  const id = `finance-${uuidv4()}`;
  const now = new Date().toISOString();
  const doc = {
    _id: id,
    id,
    type: 'pago',
    user_id: userId,
    companyName: invoice.supplierName || '',
    concept: `Factura ${invoice.invoiceNumber || ''} — ${invoice.supplierName || 'Proveedor'}`,
    reference: invoice.invoiceNumber || '',
    category: 'compras_proveedor',
    categoryIcon: 'Receipt',
    categoryColor: '#7c3aed',
    amountBase: Number(invoice.subtotal || 0),
    taxRate: Number(invoice.taxRate || 0),
    taxAmount: Number(invoice.taxAmount || 0),
    totalAmount: Number(invoice.total || 0),
    date: invoice.date || now.slice(0, 10),
    payMethod: 'transferencia',
    notes: `Generado automáticamente desde factura de proveedor ${invoice._id}`,
    linkedPurchaseInvoiceId: invoice._id,
    costCenterId: invoice.costCenterId || '',
    costCenterName: invoice.costCenterName || '',
    createdAt: now,
    updatedAt: now,
  };
  const saved = await putDocument(req, db, id, doc);
  return { ...doc, _rev: saved.rev };
}

export async function generateInputTaxFromInvoice(req, userId, invoice) {
  const db = getFinanceDbName();
  await ensureDatabase(req, db);
  const id = `finance-${uuidv4()}`;
  const now = new Date().toISOString();
  const doc = {
    _id: id,
    id,
    type: 'pago',
    user_id: userId,
    companyName: invoice.supplierName || '',
    concept: `IVA Soportado — Factura ${invoice.invoiceNumber || ''} — ${invoice.supplierName || 'Proveedor'}`,
    reference: invoice.invoiceNumber || '',
    category: 'iva_soportado',
    categoryIcon: 'Receipt',
    categoryColor: '#dc2626',
    amountBase: Number(invoice.subtotal || 0),
    taxRate: Number(invoice.taxRate || 0),
    taxAmount: Number(invoice.taxAmount || 0),
    totalAmount: Number(invoice.taxAmount || 0),
    date: invoice.date || now.slice(0, 10),
    payMethod: 'transferencia',
    notes: `IVA soportado generado desde factura de proveedor ${invoice._id}`,
    linkedPurchaseInvoiceId: invoice._id,
    taxType: 'iva_soportado',
    createdAt: now,
    updatedAt: now,
  };
  const saved = await putDocument(req, db, id, doc);
  return { ...doc, _rev: saved.rev };
}

export async function createDocumentFromInvoice(req, userId, invoice) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const id = `doc-${uuidv4()}`;
  const now = new Date().toISOString();
  const doc = {
    _id: id,
    id,
    type: 'document',
    user_id: userId,
    name: `Factura ${invoice.invoiceNumber || ''} — ${invoice.supplierName || 'Proveedor'}`,
    category: 'financial',
    subcategory: 'facturas_proveedor',
    description: `Factura de proveedor ${invoice.supplierName || ''}, fecha ${invoice.date || ''}, total ${Number(invoice.total || 0).toFixed(2)}€`,
    fileUrl: invoice.pdfUrl || '',
    linkedEntityType: 'purchase_invoice',
    linkedEntityId: invoice._id,
    tags: ['factura', 'proveedor', invoice.supplierName].filter(Boolean),
    date: invoice.date || now.slice(0, 10),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  const saved = await putDocument(req, db, id, doc);
  return { ...doc, _rev: saved.rev };
}

// ─── PURCHASE ORDERS ──────────────────────────────────────────────────────────

function normalizePurchaseOrderStatus(value) {
  const allowed = ['draft', 'pending', 'sent', 'partial', 'received', 'cancelled'];
  return allowed.includes(String(value || '')) ? String(value) : 'draft';
}

export function buildPurchaseOrderDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `po-${uuidv4()}`;
  const orderNumber = existing?.orderNumber
    || String(data.orderNumber || '').trim()
    || nextPurchaseOrderNumber([]);

  const items = Array.isArray(data.items) ? data.items.map((item, idx) => ({
    id: item.id || `poi-${idx}-${uuidv4().slice(0, 8)}`,
    catalogItemId: String(item.catalogItemId || ''),
    sku: String(item.sku || ''),
    name: String(item.name || ''),
    quantity: Number(item.quantity || 0),
    unitCost: Number(item.unitCost || 0),
    total: Number(item.quantity || 0) * Number(item.unitCost || 0),
    received: Number(item.received ?? 0),
    notes: String(item.notes || ''),
    supplierId: String(item.supplierId || ''),
    supplierName: String(item.supplierName || ''),
  })) : (existing?.items || []);

  const subtotal = items.reduce((s, l) => s + Number(l.total || 0), 0);
  const taxRate = Number(data.taxRate ?? existing?.taxRate ?? 21);
  const taxAmount = subtotal * (taxRate / 100);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'purchase_order',
    id,
    orderNumber,
    user_id: userId,
    supplierId: String(data.supplierId || existing?.supplierId || ''),
    supplierName: String(data.supplierName || existing?.supplierName || ''),
    status: normalizePurchaseOrderStatus(data.status || existing?.status),
    items,
    subtotal,
    taxRate,
    taxAmount,
    total: subtotal + taxAmount,
    notes: String(data.notes || existing?.notes || ''),
    source: String(data.source || existing?.source || 'manual'),
    expectedDate: String(data.expectedDate || existing?.expectedDate || ''),
    sentAt: String(data.sentAt || existing?.sentAt || ''),
    receivedAt: String(data.receivedAt || existing?.receivedAt || ''),
    businessId: normalizeBusinessScopeId(
      data.businessId || data.business_id || existing?.businessId || existing?.business_id || '',
    ),
    businessName: String(
      data.businessName || data.business_name || existing?.businessName || existing?.business_name || '',
    ).trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizePurchaseOrder(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'purchase_order',
    id: doc._id,
    orderNumber: doc.orderNumber || '',
    user_id: doc.user_id,
    supplierId: doc.supplierId || '',
    supplierName: doc.supplierName || '',
    status: normalizePurchaseOrderStatus(doc.status),
    items: Array.isArray(doc.items) ? doc.items : [],
    subtotal: Number(doc.subtotal || 0),
    taxRate: Number(doc.taxRate || 21),
    taxAmount: Number(doc.taxAmount || 0),
    total: Number(doc.total || 0),
    notes: doc.notes || '',
    source: doc.source || 'manual',
    expectedDate: doc.expectedDate || '',
    sentAt: doc.sentAt || '',
    receivedAt: doc.receivedAt || '',
    businessId: normalizeBusinessScopeId(doc.businessId || doc.business_id || '') || undefined,
    businessName: doc.businessName || doc.business_name || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listPurchaseOrdersByUser(req, userId, options = {}) {
  const uid = String(userId || '').trim();
  const listLimit = normalizePurchaseListLimit(options.limit);
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  await ensureCatalogTypeUserIndex(req, db);
  await ensurePurchaseOrderListIndex(req, db);

  const selector = uid
    ? { type: 'purchase_order', user_id: uid }
    : { type: 'purchase_order' };
  const sort = uid
    ? [{ type: 'asc' }, { user_id: 'asc' }, { createdAt: 'desc' }]
    : [{ type: 'asc' }, { createdAt: 'desc' }];

  let docs;
  try {
    docs = await findDocuments(req, db, selector, {
      pageSize: 200,
      maxDocs: listLimit,
      sort,
    });
  } catch {
    try {
      docs = await findDocuments(req, db, selector, { pageSize: 200, maxDocs: listLimit });
      docs = docs
        .filter(
          (doc) =>
            doc?.type === 'purchase_order' && !doc?.deletedAt && (!uid || doc?.user_id === uid),
        )
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, listLimit);
    } catch {
      docs = [];
    }
  }

  let orders = docs.filter(
    (doc) =>
      doc?.type === 'purchase_order' && !doc?.deletedAt && (!uid || doc?.user_id === uid),
  );
  if (options.businessId) {
    orders = filterCatalogDocsByBusinessScope(
      orders,
      options.businessId,
      options.accountBusinessCount ?? 1,
    );
  }

  return orders
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, listLimit);
}

// ─── WAREHOUSES (Almacenes) ──────────────────────────────────────────────────

export function buildWarehouseDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `wh-${uuidv4()}`;
  const validTypes = ['general', 'store', 'workshop', 'cold', 'external'];

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'warehouse',
    id,
    user_id: userId,
    name: String(data.name || '').trim(),
    code: String(data.code || '').trim().toUpperCase() || (existing?.code || `ALM-${Date.now().toString(36).toUpperCase().slice(-4)}`),
    address: String(data.address || existing?.address || ''),
    isDefault: data.isDefault !== undefined ? Boolean(data.isDefault) : (existing?.isDefault ?? false),
    active: data.active !== undefined ? Boolean(data.active) : (existing?.active ?? true),
    notes: String(data.notes || existing?.notes || ''),
    contactPerson: String(data.contactPerson || existing?.contactPerson || ''),
    phone: String(data.phone || existing?.phone || ''),
    email: String(data.email || existing?.email || ''),
    warehouseType: validTypes.includes(data.warehouseType)
      ? data.warehouseType
      : (existing?.warehouseType || 'general'),
    /** PDV / tienda dueña de este almacén (stock por tienda). */
    salesPointId: String(
      data.salesPointId !== undefined ? data.salesPointId : existing?.salesPointId || '',
    ).trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeWarehouse(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'warehouse',
    id: doc._id,
    user_id: doc.user_id,
    name: doc.name || '',
    code: doc.code || '',
    address: doc.address || '',
    isDefault: Boolean(doc.isDefault),
    active: doc.active !== undefined ? Boolean(doc.active) : true,
    notes: doc.notes || '',
    contactPerson: doc.contactPerson || '',
    phone: doc.phone || '',
    email: doc.email || '',
    warehouseType: doc.warehouseType || 'general',
    salesPointId: doc.salesPointId || '',
    assignedWorkerId: doc.assignedWorkerId || '',
    assignedWorkerName: doc.assignedWorkerName || '',
    vehiclePlate: doc.vehiclePlate || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listWarehousesByUser(req, userId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'warehouse' && !doc?.deletedAt && (!userId || doc?.user_id === userId))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}

// ─── BUSINESSES ───────────────────────────────────────────────────────────────

export async function listBusinessesByUser(req, userId) {
  if (!userId) return [];
  const uid = String(userId || '').replace(/^account:/, '').trim();
  if (!uid) return [];
  await ensureDatabase(req, BUSINESSES_DB);
  const docs = await getAllDocuments(req, BUSINESSES_DB);
  return docs
    .filter(
      (doc) =>
        doc?.type === 'business' &&
        !doc?.deletedAt &&
        (String(doc.owner_user_id || '').replace(/^account:/, '').trim() === uid ||
          (Array.isArray(doc.members) &&
            doc.members.some(
              (m) => String(m?.user_id || '').replace(/^account:/, '').trim() === uid,
            ))),
    )
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}

// ─── BusinessGroup (Holding / Grupo empresarial) ─────────────────────────────

export const GROUPS_DB = 'businesses';

export function buildGroupDocument({ ownerUserId, name, description = '', logo = '' }) {
  const groupId = uuidv4();
  const now = new Date().toISOString();
  return {
    _id: `group:${groupId}`,
    type: 'group',
    group_id: groupId,
    owner_user_id: String(ownerUserId || '').trim(),
    name: String(name || '').trim(),
    description: String(description || '').trim(),
    logo: String(logo || '').trim(),
    business_ids: [],
    admins: [
      {
        user_id: String(ownerUserId || '').trim(),
        fullName: '',
        email: '',
        role: 'GerenteGrupo',
        joinedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function sanitizeGroup(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    _rev: doc._rev,
    group_id: doc.group_id,
    owner_user_id: doc.owner_user_id || '',
    name: doc.name || '',
    description: doc.description || '',
    logo: doc.logo || '',
    business_ids: Array.isArray(doc.business_ids) ? doc.business_ids : [],
    admins: Array.isArray(doc.admins)
      ? doc.admins.map((a) => ({
          user_id: a.user_id || '',
          fullName: a.fullName || '',
          email: a.email || '',
          role: a.role || 'GerenteGrupo',
          joinedAt: a.joinedAt || doc.createdAt || '',
        }))
      : [],
    createdAt: doc.createdAt || '',
    updatedAt: doc.updatedAt || '',
    deletedAt: doc.deletedAt || null,
  };
}

export async function saveGroup(req, group) {
  if (!group?._id) throw new Error('Documento de grupo inválido');
  await ensureDatabase(req, GROUPS_DB);
  const result = await putDocument(req, GROUPS_DB, group._id, group);
  return { ...group, _rev: result.rev };
}

export async function findGroupById(req, groupId) {
  if (!groupId) return null;
  await ensureDatabase(req, GROUPS_DB);
  return getDocument(req, GROUPS_DB, `group:${groupId}`);
}

export async function listGroupsByUser(req, userId) {
  if (!userId) return [];
  await ensureDatabase(req, GROUPS_DB);
  const docs = await getAllDocuments(req, GROUPS_DB);
  return docs
    .filter(
      (doc) =>
        doc?.type === 'group' &&
        !doc?.deletedAt &&
        (doc.owner_user_id === userId ||
          (Array.isArray(doc.admins) && doc.admins.some((a) => a.user_id === userId))),
    )
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}

// ─── Branch (Sede / Delegación dentro de una empresa) ────────────────────────

export function buildBranchObject({ name, address = '', city = '', phone = '', managerUserId = '' }) {
  const branchId = uuidv4();
  const now = new Date().toISOString();
  return {
    branch_id: branchId,
    name: String(name || '').trim(),
    address: String(address || '').trim(),
    city: String(city || '').trim(),
    phone: String(phone || '').trim(),
    managerUserId: String(managerUserId || '').trim(),
    createdAt: now,
  };
}

export function sanitizeBranch(branch) {
  if (!branch) return null;
  return {
    branch_id: branch.branch_id || '',
    name: branch.name || '',
    address: branch.address || '',
    city: branch.city || '',
    phone: branch.phone || '',
    managerUserId: branch.managerUserId || '',
    createdAt: branch.createdAt || '',
  };
}

// ─── S-07: Gestión de sesiones ────────────────────────────────────────────────

export async function saveSession(req, account, rawRefreshToken, sessionId, ip = '', userAgent = '') {
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const fresh = (await findAccountByUserId(req, account.user_id)) || account;

  const newSession = {
    sessionId: String(sessionId),
    refreshTokenHash: hashToken(rawRefreshToken),
    expiry,
    deviceInfo: parseUserAgent(userAgent),
    ipAddress: String(ip || ''),
    lastActiveAt: now,
    createdAt: now,
  };

  const existingSessions = normalizeSessions(fresh.sessions || []);
  const sessions = [...existingSessions, newSession].slice(-10);

  return saveAccount(req, {
    ...fresh,
    sessions,
    refreshTokenHash: hashToken(rawRefreshToken),
    refreshTokenExpiry: expiry,
    updatedAt: now,
  });
}

export async function revokeSession(req, account, sessionId) {
  if (!sessionId) return account;
  const fresh = (await findAccountByUserId(req, account.user_id)) || account;
  const sessions = normalizeSessions(fresh.sessions || []).filter((s) => s.sessionId !== sessionId);
  return saveAccount(req, {
    ...fresh,
    sessions,
    refreshTokenHash: sessions.length === 0 ? null : fresh.refreshTokenHash,
    refreshTokenExpiry: sessions.length === 0 ? null : fresh.refreshTokenExpiry,
    updatedAt: new Date().toISOString(),
  });
}

export async function revokeAllSessions(req, account, exceptSessionId = null) {
  const fresh = (await findAccountByUserId(req, account.user_id)) || account;
  const sessions = exceptSessionId
    ? normalizeSessions(fresh.sessions || []).filter((s) => s.sessionId === exceptSessionId)
    : [];
  return saveAccount(req, {
    ...fresh,
    sessions,
    refreshTokenHash: null,
    refreshTokenExpiry: null,
    updatedAt: new Date().toISOString(),
  });
}

// Compat: revokeRefreshToken → revocar todas las sesiones
export async function revokeRefreshToken(req, account) {
  return revokeAllSessions(req, account);
}

// ─── WEB STOREFRONT ──────────────────────────────────────────────────────────

export function getWebDbName() {
  return normalizeDbName(process.env.VITE_WEB_DB || `${getDbPrefix()}-web`);
}

export function buildWebConfigDocument(businessId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `webconfig-${businessId}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'web_config',
    id,
    business_id: businessId,
    slug: String(data.slug || existing?.slug || ''),
    enabled: data.enabled !== undefined ? Boolean(data.enabled) : (existing?.enabled ?? false),

    storeName: String(data.storeName || existing?.storeName || ''),
    storeDescription: String(data.storeDescription || existing?.storeDescription || ''),
    storeLogo: String(data.storeLogo || existing?.storeLogo || ''),
    bannerImage: String(data.bannerImage || existing?.bannerImage || ''),

    primaryColor: String(data.primaryColor || existing?.primaryColor || '#f59e0b'),
    secondaryColor: String(data.secondaryColor || existing?.secondaryColor || '#1f2937'),
    accentColor: String(data.accentColor || existing?.accentColor || '#10b981'),
    backgroundColor: String(data.backgroundColor || existing?.backgroundColor || '#ffffff'),

    welcomeMessage: String(data.welcomeMessage || existing?.welcomeMessage || '¡Bienvenido a nuestra tienda!'),
    orderConfirmMessage: String(data.orderConfirmMessage || existing?.orderConfirmMessage || 'Tu pedido ha sido recibido. Te contactaremos pronto.'),
    closedMessage: String(data.closedMessage || existing?.closedMessage || 'Estamos cerrados en este momento.'),

    deliveryEnabled: data.deliveryEnabled !== undefined ? Boolean(data.deliveryEnabled) : (existing?.deliveryEnabled ?? true),
    pickupEnabled: data.pickupEnabled !== undefined ? Boolean(data.pickupEnabled) : (existing?.pickupEnabled ?? true),
    deliveryFee: Number(data.deliveryFee ?? existing?.deliveryFee ?? 0),
    minimumOrder: Number(data.minimumOrder ?? existing?.minimumOrder ?? 0),
    estimatedDeliveryTime: String(data.estimatedDeliveryTime || existing?.estimatedDeliveryTime || '30-45 min'),
    deliveryRadius: String(data.deliveryRadius || existing?.deliveryRadius || ''),

    shippingMode: String(data.shippingMode || existing?.shippingMode || 'fixed'),
    shippingZones: Array.isArray(data.shippingZones) ? data.shippingZones : (existing?.shippingZones || []),

    categories: Array.isArray(data.categories) ? data.categories : (existing?.categories || []),
    promos: Array.isArray(data.promos) ? data.promos : (existing?.promos || []),
    volumeDiscounts: Array.isArray(data.volumeDiscounts) ? data.volumeDiscounts : (existing?.volumeDiscounts || []),

    schedule: data.schedule || existing?.schedule || {},
    isOpen: data.isOpen !== undefined ? Boolean(data.isOpen) : (existing?.isOpen ?? true),

    phone: String(data.phone || existing?.phone || ''),
    address: String(data.address || existing?.address || ''),
    currency: String(data.currency || existing?.currency || 'EUR'),
    taxRate: Number(data.taxRate ?? existing?.taxRate ?? 21),

    /** Tiendas (PDV) que salen en la web de pedir para que el cliente elija. */
    salesPointIds: Array.isArray(data.salesPointIds)
      ? data.salesPointIds.map((x) => String(x || '').trim()).filter(Boolean)
      : (Array.isArray(existing?.salesPointIds)
        ? existing.salesPointIds.map((x) => String(x || '').trim()).filter(Boolean)
        : []),

    integrations: data.integrations || existing?.integrations || {
      uber:    { enabled: false, token: '' },
      globo:   { enabled: false, token: '' },
      justead: { enabled: false, token: '' },
      flipdish: { enabled: false, token: '' },
    },

    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function sanitizeIntegrationEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return {
      enabled: false,
      token: '',
      oauth: false,
      connectedAt: '',
      expiresAt: '',
      env: '',
      storeId: '',
      storeName: '',
      provisionedAt: '',
    };
  }
  const hasOauth = Boolean(entry.oauth || entry.accessToken);
  return {
    enabled: Boolean(entry.enabled),
    // Token de webhook (NO es el access_token OAuth de Uber)
    token: String(entry.token || ''),
    oauth: hasOauth,
    connectedAt: String(entry.connectedAt || ''),
    expiresAt: String(entry.expiresAt || ''),
    env: String(entry.env || ''),
    storeId: String(entry.storeId || ''),
    storeName: String(entry.storeName || ''),
    provisionedAt: String(entry.provisionedAt || ''),
  };
}

export function sanitizeWebConfig(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'web_config',
    id: doc._id,
    business_id: doc.business_id || '',
    slug: doc.slug || '',
    enabled: Boolean(doc.enabled),
    storeName: doc.storeName || '',
    storeDescription: doc.storeDescription || '',
    storeLogo: doc.storeLogo || '',
    bannerImage: doc.bannerImage || '',
    primaryColor: doc.primaryColor || '#f59e0b',
    secondaryColor: doc.secondaryColor || '#1f2937',
    accentColor: doc.accentColor || '#10b981',
    backgroundColor: doc.backgroundColor || '#ffffff',
    welcomeMessage: doc.welcomeMessage || '',
    orderConfirmMessage: doc.orderConfirmMessage || '',
    closedMessage: doc.closedMessage || '',
    deliveryEnabled: Boolean(doc.deliveryEnabled),
    pickupEnabled: Boolean(doc.pickupEnabled),
    deliveryFee: Number(doc.deliveryFee || 0),
    minimumOrder: Number(doc.minimumOrder || 0),
    estimatedDeliveryTime: doc.estimatedDeliveryTime || '30-45 min',
    deliveryRadius: doc.deliveryRadius || '',
    shippingMode: doc.shippingMode || 'fixed',
    shippingZones: Array.isArray(doc.shippingZones) ? doc.shippingZones : [],
    categories: Array.isArray(doc.categories) ? doc.categories : [],
    promos: Array.isArray(doc.promos) ? doc.promos : [],
    volumeDiscounts: Array.isArray(doc.volumeDiscounts) ? doc.volumeDiscounts : [],
    schedule: doc.schedule || {},
    isOpen: Boolean(doc.isOpen),
    phone: doc.phone || '',
    address: doc.address || '',
    currency: doc.currency || 'EUR',
    taxRate: Number(doc.taxRate || 21),
    salesPointIds: Array.isArray(doc.salesPointIds)
      ? doc.salesPointIds.map((x) => String(x || '').trim()).filter(Boolean)
      : [],
    createdAt: doc.createdAt || '',
    updatedAt: doc.updatedAt || '',
  };
}

export function sanitizeDeliveryIntegrations(doc) {
  // Sin web_config aún: devolver defaults (nunca null → la UI no se rompe).
  const integrations = (doc && typeof doc === 'object' && doc.integrations) || {};
  return {
    uber:    sanitizeIntegrationEntry(integrations.uber),
    globo:   sanitizeIntegrationEntry(integrations.globo),
    justead: sanitizeIntegrationEntry(integrations.justead),
    flipdish: sanitizeIntegrationEntry(integrations.flipdish),
  };
}

export async function getWebConfigByBusinessId(req, businessId) {
  const db = getWebDbName();
  await ensureDatabase(req, db);
  const id = `webconfig-${businessId}`;
  try {
    const doc = await getDocument(req, db, id);
    return doc && doc.type === 'web_config' ? doc : null;
  } catch {
    return null;
  }
}

export async function getWebConfigBySlug(req, slug) {
  const db = getWebDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs.find((d) => d?.type === 'web_config' && d?.slug === slug && !d?.deletedAt) || null;
}

function normalizeWebOrderStatus(value) {
  const allowed = ['pending', 'confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled'];
  return allowed.includes(String(value || '')) ? String(value) : 'pending';
}

export function buildWebOrderDocument(businessId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `webord-${uuidv4()}`;
  const orderNumber = existing?.orderNumber || `WEB-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const items = Array.isArray(data.items) ? data.items : (existing?.items || []);
  const subtotal = items.reduce((s, i) => s + Number(i.total || 0), 0);
  const deliveryFee = Number(data.deliveryFee ?? existing?.deliveryFee ?? 0);
  const promoDisc = Number(data.promoDiscount || 0);
  const volumeDisc = Number(data.volumeDiscount || 0);
  const totalAmount = Math.max(0, subtotal + deliveryFee - promoDisc - volumeDisc);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'web_order',
    id,
    orderNumber,
    business_id: businessId,
    salesPointId: String(data.salesPointId || existing?.salesPointId || '').trim(),
    salesPointName: String(data.salesPointName || existing?.salesPointName || '').trim(),
    customerName: String(data.customerName || ''),
    customerPhone: String(data.customerPhone || ''),
    customerEmail: String(data.customerEmail || ''),
    customerAddress: String(data.customerAddress || ''),
    customerPostalCode: String(data.customerPostalCode || ''),
    orderType: String(data.orderType || 'delivery'),
    status: normalizeWebOrderStatus(data.status),
    items,
    subtotal,
    deliveryFee,
    shippingCarrier: String(data.shippingCarrier || ''),
    shippingZoneName: String(data.shippingZoneName || ''),
    totalAmount,
    notes: String(data.notes || ''),
    tableId: String(data.tableId || existing?.tableId || '').trim(),
    tableNumber: Number(data.tableNumber ?? existing?.tableNumber ?? 0) || 0,
    tableName: String(data.tableName || existing?.tableName || '').trim(),
    mesaToken: String(data.mesaToken || existing?.mesaToken || '').trim(),
    promoCode: String(data.promoCode || ''),
    promoDiscount: Number(data.promoDiscount || 0),
    volumeDiscount: Number(data.volumeDiscount || 0),
    volumeDiscountLabel: String(data.volumeDiscountLabel || ''),
    estimatedTime: String(data.estimatedTime || ''),
    statusHistory: Array.isArray(data.statusHistory) ? data.statusHistory : (existing?.statusHistory || []),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeWebOrder(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'web_order',
    id: doc._id,
    orderNumber: doc.orderNumber || '',
    business_id: doc.business_id || '',
    salesPointId: doc.salesPointId || '',
    salesPointName: doc.salesPointName || '',
    customerName: doc.customerName || '',
    customerPhone: doc.customerPhone || '',
    customerEmail: doc.customerEmail || '',
    customerAddress: doc.customerAddress || '',
    customerPostalCode: doc.customerPostalCode || '',
    orderType: doc.orderType || 'delivery',
    status: normalizeWebOrderStatus(doc.status),
    items: Array.isArray(doc.items) ? doc.items : [],
    subtotal: Number(doc.subtotal || 0),
    deliveryFee: Number(doc.deliveryFee || 0),
    shippingCarrier: doc.shippingCarrier || '',
    shippingZoneName: doc.shippingZoneName || '',
    totalAmount: Number(doc.totalAmount || 0),
    notes: doc.notes || '',
    tableId: doc.tableId || '',
    tableNumber: Number(doc.tableNumber || 0) || 0,
    tableName: doc.tableName || '',
    mesaToken: doc.mesaToken || '',
    promoCode: doc.promoCode || '',
    promoDiscount: Number(doc.promoDiscount || 0),
    volumeDiscount: Number(doc.volumeDiscount || 0),
    volumeDiscountLabel: doc.volumeDiscountLabel || '',
    estimatedTime: doc.estimatedTime || '',
    statusHistory: Array.isArray(doc.statusHistory) ? doc.statusHistory : [],
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listWebOrdersByBusiness(req, businessId) {
  const db = getWebDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'web_order' && !doc?.deletedAt && doc?.business_id === businessId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ─── PUNTOS DE VENTA ──────────────────────────────────────────────────────────

export function buildPuntoVentaDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `pv-${uuidv4()}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'punto_venta',
    id,
    user_id: userId,
    name: String(data.name || ''),
    code: String(data.code || existing?.code || `PV-${Date.now().toString(36).toUpperCase().slice(-4)}`),
    address: String(data.address || ''),
    phone: String(data.phone || ''),
    email: String(data.email || ''),
    manager: String(data.manager || ''),
    city: String(data.city || ''),
    province: String(data.province || ''),
    notes: String(data.notes || ''),
    active: data.active !== undefined ? Boolean(data.active) : (existing?.active ?? true),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizePuntoVenta(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'punto_venta',
    id: doc._id,
    user_id: doc.user_id,
    name: doc.name || '',
    code: doc.code || '',
    address: doc.address || '',
    phone: doc.phone || '',
    email: doc.email || '',
    manager: doc.manager || '',
    city: doc.city || '',
    province: doc.province || '',
    notes: doc.notes || '',
    active: doc.active !== undefined ? Boolean(doc.active) : true,
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listPuntosVentaByUser(req, userId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'punto_venta' && !doc?.deletedAt && (!userId || doc?.user_id === userId))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}

// S-07: Busca cuenta y sesión activa por token raw — soporta array sessions + campo legacy
export async function findAccountByRefreshToken(req, rawToken) {
  const tokenHash = hashToken(rawToken);
  const accounts = await listAccounts(req);
  const now = new Date();

  for (const a of accounts) {
    const sessions = normalizeSessions(a.sessions || []);
    const session = sessions.find((s) => s.refreshTokenHash === tokenHash);
    if (session) {
      if (session.expiry && new Date(session.expiry) <= now) {
        continue;
      }
      return { account: a, session };
    }
    // Fallback legacy
    if (
      a.refreshTokenHash === tokenHash &&
      a.refreshTokenExpiry &&
      new Date(a.refreshTokenExpiry) > now
    ) {
      return { account: a, session: null };
    }
  }
  return null;
}

// ─── Join Requests: solicitudes de usuarios para unirse a empresas ──────────

export const JOIN_REQUESTS_DB = 'join_requests';

export function buildJoinRequestDocument({ userId, userFullName, userEmail, businessId, businessName, message = '' }) {
  const requestId = uuidv4();
  const now = new Date().toISOString();
  return {
    _id: `join_request:${requestId}`,
    type: 'join_request',
    request_id: requestId,
    user_id: String(userId || '').trim(),
    userFullName: String(userFullName || '').trim(),
    userEmail: String(userEmail || '').trim(),
    business_id: String(businessId || '').trim(),
    businessName: String(businessName || '').trim(),
    message: String(message || '').trim(),
    status: 'pending',
    reviewedBy: '',
    reviewedAt: '',
    createdAt: now,
    updatedAt: now,
  };
}

export async function saveJoinRequest(req, doc) {
  if (!doc?._id) throw new Error('Documento de solicitud inválido');
  await ensureDatabase(req, JOIN_REQUESTS_DB);
  const result = await putDocument(req, JOIN_REQUESTS_DB, doc._id, doc);
  return { ...doc, _rev: result.rev };
}

export async function findJoinRequestById(req, requestId) {
  if (!requestId) return null;
  await ensureDatabase(req, JOIN_REQUESTS_DB);
  return getDocument(req, JOIN_REQUESTS_DB, `join_request:${requestId}`);
}

export async function listJoinRequestsByBusiness(req, businessId) {
  if (!businessId) return [];
  await ensureDatabase(req, JOIN_REQUESTS_DB);
  const docs = await getAllDocuments(req, JOIN_REQUESTS_DB);
  return docs.filter((d) => d?.type === 'join_request' && d?.business_id === businessId && !d?.deletedAt);
}

export async function listJoinRequestsByUser(req, userId) {
  if (!userId) return [];
  await ensureDatabase(req, JOIN_REQUESTS_DB);
  const docs = await getAllDocuments(req, JOIN_REQUESTS_DB);
  return docs.filter((d) => d?.type === 'join_request' && d?.user_id === userId && !d?.deletedAt);
}

export async function findPendingJoinRequest(req, userId, businessId) {
  if (!userId || !businessId) return null;
  await ensureDatabase(req, JOIN_REQUESTS_DB);
  const docs = await getAllDocuments(req, JOIN_REQUESTS_DB);
  return docs.find(
    (d) => d?.type === 'join_request' && d?.user_id === userId && d?.business_id === businessId && d?.status === 'pending' && !d?.deletedAt,
  ) || null;
}

// ─── Team Invitations: invitaciones por email (incluso sin cuenta) ──────────
//
// Cuando el admin invita a un email, se guarda un `team_invitation` en esta
// colección. No requiere que exista una cuenta de Vertial: cuando el usuario
// se registre (o entre, si ya tiene cuenta) con ese email, podrá ver la
// invitación en su dashboard y aceptarla/rechazarla in-app.
export const TEAM_INVITATIONS_DB = 'team_invitations';

export function normalizeEmailForLookup(email) {
  return String(email || '').trim().toLowerCase();
}

export function buildTeamInvitationDocument({
  email,
  fullName = '',
  phone = '',
  businessId,
  businessName = '',
  role = 'Usuario',
  permissions = null,
  landingPage = WORKER_DEFAULT_LANDING_PATH,
  employment = null,
  scheduleTemplateId = '',
  invitedBy = '',
  invitedByName = '',
  message = '',
  expiresInDays = 30,
}) {
  const invitationId = uuidv4();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + Math.max(1, expiresInDays) * 24 * 60 * 60 * 1000).toISOString();
  return {
    _id: `team_invitation:${invitationId}`,
    type: 'team_invitation',
    invitation_id: invitationId,
    email: normalizeEmailForLookup(email),
    fullName: String(fullName || '').trim(),
    phone: String(phone || '').trim(),
    business_id: String(businessId || '').trim(),
    businessName: String(businessName || '').trim(),
    role: String(role || 'Usuario').trim() || 'Usuario',
    permissions: permissions || null,
    landingPage: String(landingPage || WORKER_DEFAULT_LANDING_PATH),
    employment: employment || null,
    scheduleTemplateId: String(scheduleTemplateId || '').trim(),
    invitedBy: String(invitedBy || '').trim(),
    invitedByName: String(invitedByName || '').trim(),
    message: String(message || '').trim(),
    status: 'pending', // pending | accepted | rejected | revoked
    acceptedBy: '',
    acceptedAt: '',
    rejectedAt: '',
    revokedAt: '',
    expiresAt,
    createdAt: now,
    updatedAt: now,
  };
}

export async function saveTeamInvitation(req, doc) {
  if (!doc?._id) throw new Error('Documento de invitación inválido');
  await ensureDatabase(req, TEAM_INVITATIONS_DB);
  const result = await putDocument(req, TEAM_INVITATIONS_DB, doc._id, doc);
  return { ...doc, _rev: result.rev };
}

export async function findTeamInvitationById(req, invitationId) {
  if (!invitationId) return null;
  await ensureDatabase(req, TEAM_INVITATIONS_DB);
  return getDocument(req, TEAM_INVITATIONS_DB, `team_invitation:${invitationId}`);
}

function isInvitationActive(d) {
  if (!d || d.type !== 'team_invitation' || d.deletedAt) return false;
  if (d.status !== 'pending') return false;
  if (d.expiresAt && new Date(d.expiresAt).getTime() < Date.now()) return false;
  return true;
}

export async function listPendingInvitationsByEmail(req, email) {
  const normalized = normalizeEmailForLookup(email);
  if (!normalized) return [];
  await ensureDatabase(req, TEAM_INVITATIONS_DB);
  const docs = await getAllDocuments(req, TEAM_INVITATIONS_DB);
  return docs.filter((d) => isInvitationActive(d) && d.email === normalized);
}

export async function listInvitationsByBusiness(req, businessId, { includeAll = false } = {}) {
  if (!businessId) return [];
  await ensureDatabase(req, TEAM_INVITATIONS_DB);
  const docs = await getAllDocuments(req, TEAM_INVITATIONS_DB);
  return docs.filter((d) => {
    if (!d || d.type !== 'team_invitation' || d.deletedAt) return false;
    if (d.business_id !== businessId) return false;
    if (includeAll) return true;
    return isInvitationActive(d);
  });
}

export async function findPendingInvitationForEmailAndBusiness(req, email, businessId) {
  const normalized = normalizeEmailForLookup(email);
  if (!normalized || !businessId) return null;
  await ensureDatabase(req, TEAM_INVITATIONS_DB);
  const docs = await getAllDocuments(req, TEAM_INVITATIONS_DB);
  return docs.find((d) => isInvitationActive(d) && d.email === normalized && d.business_id === businessId) || null;
}

// ─── Worker invite links (QR / enlace abierto por centro de trabajo) ─────────
// Core RRHH: el gerente genera un enlace/QR por tienda; el trabajador se registra
// y entra al equipo con rol + salesPointId. No es el código tablet TPV.
export const WORKER_INVITE_LINKS_DB = 'worker_invite_links';

export function buildWorkerInviteLinkDocument({
  tokenHash,
  businessId,
  businessName = '',
  workCenterId,
  workCenterName = '',
  role = 'Usuario',
  permissions = null,
  landingPage = WORKER_DEFAULT_LANDING_PATH,
  employment = null,
  scheduleTemplateId = '',
  invitedBy = '',
  invitedByName = '',
  maxUses = null,
  expiresInDays = 90,
}) {
  const linkId = uuidv4();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + Math.max(1, expiresInDays) * 24 * 60 * 60 * 1000).toISOString();
  const wcId = String(workCenterId || '').trim();
  return {
    _id: `worker_invite_link:${linkId}`,
    type: 'worker_invite_link',
    link_id: linkId,
    tokenHash: String(tokenHash || '').trim(),
    business_id: String(businessId || '').trim(),
    businessName: String(businessName || '').trim(),
    workCenterId: wcId,
    workCenterName: String(workCenterName || '').trim(),
    role: String(role || 'Usuario').trim() || 'Usuario',
    permissions: permissions || null,
    landingPage: String(landingPage || WORKER_DEFAULT_LANDING_PATH),
    employment: employment || {
      salesPointId: wcId,
      position: String(role || '').trim() || undefined,
      workday: 'completa',
    },
    scheduleTemplateId: String(scheduleTemplateId || '').trim(),
    invitedBy: String(invitedBy || '').trim(),
    invitedByName: String(invitedByName || '').trim(),
    status: 'active', // active | revoked | exhausted
    maxUses: maxUses == null || maxUses === '' ? null : Math.max(1, Number(maxUses) || 1),
    useCount: 0,
    expiresAt,
    createdAt: now,
    updatedAt: now,
    revokedAt: '',
  };
}

function isWorkerInviteLinkRedeemable(doc) {
  if (!doc || doc.type !== 'worker_invite_link' || doc.deletedAt) return false;
  if (doc.status !== 'active') return false;
  if (doc.expiresAt && new Date(doc.expiresAt).getTime() < Date.now()) return false;
  if (doc.maxUses != null && Number(doc.useCount || 0) >= Number(doc.maxUses)) return false;
  return Boolean(doc.tokenHash);
}

export async function saveWorkerInviteLink(req, doc) {
  if (!doc?._id) throw new Error('Documento de enlace de invitación inválido');
  await ensureDatabase(req, WORKER_INVITE_LINKS_DB);
  const result = await putDocument(req, WORKER_INVITE_LINKS_DB, doc._id, doc);
  return { ...doc, _rev: result.rev };
}

/** Ptr O(1) tokenHash → link_id (evita _all_docs en cada escaneo QR). */
export function workerInviteTokenPtrId(tokenHash) {
  const hash = String(tokenHash || '').trim();
  if (!hash) return '';
  return `worker_invite_token:${hash}`;
}

export async function upsertWorkerInviteTokenPointer(req, tokenHash, linkId) {
  const hash = String(tokenHash || '').trim();
  const lid = String(linkId || '').trim();
  const ptrId = workerInviteTokenPtrId(hash);
  if (!ptrId || !lid) return null;
  await ensureDatabase(req, WORKER_INVITE_LINKS_DB);
  const existing = await getDocument(req, WORKER_INVITE_LINKS_DB, ptrId);
  const now = new Date().toISOString();
  try {
    await putDocument(req, WORKER_INVITE_LINKS_DB, ptrId, {
      _id: ptrId,
      ...(existing?._rev ? { _rev: existing._rev } : {}),
      type: 'worker_invite_token_ptr',
      tokenHash: hash,
      link_id: lid,
      updatedAt: now,
      createdAt: existing?.createdAt || now,
    });
  } catch (err) {
    // Conflicto: releer y reintentar una vez
    if (Number(err?.statusCode) !== 409 && !/conflict/i.test(String(err?.message || ''))) throw err;
    const again = await getDocument(req, WORKER_INVITE_LINKS_DB, ptrId);
    await putDocument(req, WORKER_INVITE_LINKS_DB, ptrId, {
      _id: ptrId,
      ...(again?._rev ? { _rev: again._rev } : {}),
      type: 'worker_invite_token_ptr',
      tokenHash: hash,
      link_id: lid,
      updatedAt: now,
      createdAt: again?.createdAt || now,
    });
  }
  return ptrId;
}

export async function findWorkerInviteLinkById(req, linkId) {
  if (!linkId) return null;
  await ensureDatabase(req, WORKER_INVITE_LINKS_DB);
  return getDocument(req, WORKER_INVITE_LINKS_DB, `worker_invite_link:${linkId}`);
}

export async function findWorkerInviteLinkByToken(req, rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) return null;
  const hashed = hashToken(token);
  await ensureDatabase(req, WORKER_INVITE_LINKS_DB);

  // Camino rápido: puntero por hash (enlaces nuevos / sanados).
  const ptr = await getDocument(req, WORKER_INVITE_LINKS_DB, workerInviteTokenPtrId(hashed));
  if (ptr?.link_id) {
    const byId = await findWorkerInviteLinkById(req, ptr.link_id);
    if (byId?.type === 'worker_invite_link' && !byId.deletedAt && byId.tokenHash === hashed) {
      return byId;
    }
  }

  // Fallback: enlaces antiguos sin ptr.
  const docs = await getAllDocuments(req, WORKER_INVITE_LINKS_DB);
  const found =
    docs.find((d) => d?.type === 'worker_invite_link' && !d?.deletedAt && d?.tokenHash === hashed) || null;
  if (found?.link_id) {
    try {
      await upsertWorkerInviteTokenPointer(req, hashed, found.link_id);
    } catch {
      /* best-effort */
    }
  }
  return found;
}

export async function listWorkerInviteLinksByBusiness(req, businessId, { includeInactive = false } = {}) {
  if (!businessId) return [];
  await ensureDatabase(req, WORKER_INVITE_LINKS_DB);
  const docs = await getAllDocuments(req, WORKER_INVITE_LINKS_DB);
  return docs.filter((d) => {
    if (!d || d.type !== 'worker_invite_link' || d.deletedAt) return false;
    if (d.business_id !== businessId) return false;
    if (includeInactive) return true;
    return isWorkerInviteLinkRedeemable(d);
  });
}

export function sanitizeWorkerInviteLink(doc) {
  if (!doc) return null;
  return {
    link_id: doc.link_id,
    business_id: doc.business_id,
    businessName: doc.businessName || '',
    workCenterId: doc.workCenterId || '',
    workCenterName: doc.workCenterName || '',
    role: doc.role || 'Usuario',
    landingPage: doc.landingPage || WORKER_DEFAULT_LANDING_PATH,
    scheduleTemplateId: doc.scheduleTemplateId || '',
    status: doc.status || 'active',
    maxUses: doc.maxUses == null ? null : Number(doc.maxUses),
    useCount: Number(doc.useCount || 0),
    expiresAt: doc.expiresAt || '',
    createdAt: doc.createdAt || '',
    updatedAt: doc.updatedAt || '',
    invitedByName: doc.invitedByName || '',
  };
}

export { isWorkerInviteLinkRedeemable };

export async function listAllBusinesses(req) {
  await ensureDatabase(req, BUSINESSES_DB);
  const docs = await getAllDocuments(req, BUSINESSES_DB);
  return docs.filter((d) => d?.type === 'business' && !d?.deletedAt);
}

export async function findBusinessByCompanyCode(req, companyCode) {
  if (!companyCode) return null;
  const code = String(companyCode).trim().toUpperCase();
  await ensureDatabase(req, BUSINESSES_DB);
  const docs = await getAllDocuments(req, BUSINESSES_DB);
  return docs.find((d) => d?.type === 'business' && !d?.deletedAt && String(d.companyCode || '').toUpperCase() === code) || null;
}

export async function findTeamMemberByUsername(req, businessId, username) {
  if (!businessId || !username) return null;
  const normalizedUsername = String(username).trim().toLowerCase();
  const accounts = await listAccounts(req);
  return accounts.find((a) =>
    a.linkedBusinessId === businessId &&
    String(a.username || '').trim().toLowerCase() === normalizedUsername
  ) || null;
}

// ─── Fleet Management ─────────────────────────────────────────────────────────

const FLEET_OWNERSHIP_TYPES = ['owned', 'rental', 'renting', 'leasing', 'other'];
const FLEET_COST_CATEGORIES = ['fuel', 'maintenance', 'repair', 'insurance', 'tax', 'parking', 'toll', 'fine', 'other'];
const FLEET_DOC_TYPES = ['circulation_permit', 'insurance_policy', 'technical_sheet', 'incident_report', 'contract', 'other'];
const FLEET_VEHICLE_STATUSES = ['active', 'inactive', 'maintenance', 'decommissioned'];

function normalizeFleetOwnership(value) {
  return FLEET_OWNERSHIP_TYPES.includes(String(value || '').trim().toLowerCase())
    ? String(value).trim().toLowerCase()
    : 'owned';
}

function normalizeFleetStatus(value) {
  return FLEET_VEHICLE_STATUSES.includes(String(value || '').trim().toLowerCase())
    ? String(value).trim().toLowerCase()
    : 'active';
}

export function buildFleetVehicleDocument(userId, data = {}, existing = null, businessId = null) {
  const now = new Date().toISOString();

  const rawCosts = Array.isArray(data.costs)
    ? data.costs
    : Array.isArray(existing?.costs) ? existing.costs : [];
  const costs = rawCosts.filter(Boolean).map((c) => ({
    id: c.id || `fc:${uuidv4()}`,
    category: FLEET_COST_CATEGORIES.includes(c.category) ? c.category : 'other',
    description: String(c.description || '').trim(),
    amount: Number.isFinite(Number(c.amount)) ? Number(c.amount) : 0,
    date: String(c.date || now.slice(0, 10)).trim(),
    mileage: Number.isFinite(Number(c.mileage)) ? Number(c.mileage) : undefined,
    receipt: String(c.receipt || '').trim() || undefined,
  }));

  const rawDocs = Array.isArray(data.documents)
    ? data.documents
    : Array.isArray(existing?.documents) ? existing.documents : [];
  const documents = rawDocs.filter(Boolean).map((d) => ({
    id: d.id || `fd:${uuidv4()}`,
    docType: FLEET_DOC_TYPES.includes(d.docType) ? d.docType : 'other',
    name: String(d.name || '').trim(),
    fileUrl: String(d.fileUrl || '').trim() || undefined,
    expiryDate: String(d.expiryDate || '').trim() || undefined,
    notes: String(d.notes || '').trim() || undefined,
    uploadedAt: d.uploadedAt || now,
  }));

  const rawAssignment = data.assignedTo || existing?.assignedTo || null;
  const assignedTo = rawAssignment && rawAssignment.memberId
    ? {
        memberId: String(rawAssignment.memberId).trim(),
        memberName: String(rawAssignment.memberName || '').trim(),
        assignedDate: rawAssignment.assignedDate || now,
      }
    : null;

  const defaultAlerts = { itvReminder: true, insuranceReminder: true, maintenanceReminder: true, documentExpiry: true };
  const rawAlerts = data.alerts || existing?.alerts || {};
  const alerts = {
    itvReminder: rawAlerts.itvReminder !== undefined ? Boolean(rawAlerts.itvReminder) : defaultAlerts.itvReminder,
    insuranceReminder: rawAlerts.insuranceReminder !== undefined ? Boolean(rawAlerts.insuranceReminder) : defaultAlerts.insuranceReminder,
    maintenanceReminder: rawAlerts.maintenanceReminder !== undefined ? Boolean(rawAlerts.maintenanceReminder) : defaultAlerts.maintenanceReminder,
    documentExpiry: rawAlerts.documentExpiry !== undefined ? Boolean(rawAlerts.documentExpiry) : defaultAlerts.documentExpiry,
  };

  return {
    _id: existing?._id || `fleet:${uuidv4()}`,
    _rev: existing?._rev,
    type: 'fleet_vehicle',
    active: true,
    user_id: userId,
    business_id: businessId || data.business_id || existing?.business_id || undefined,

    brand: normalizeText(data.brand),
    model: normalizeText(data.model),
    vehicleType: normalizeOptionalText(data.vehicleType) || 'car',
    registrationPlate: normalizeText(data.registrationPlate).toUpperCase(),
    vin: normalizeOptionalText(data.vin)?.toUpperCase(),
    year: normalizeRequiredNumber(data.year),
    color: normalizeText(data.color),
    fuelType: normalizeFuelType(data.fuelType),
    mileage: normalizeOptionalNumber(data.mileage),
    transmission: normalizeTransmission(data.transmission),

    ownershipType: normalizeFleetOwnership(data.ownershipType),
    ownershipDetails: {
      provider: String(data.ownershipDetails?.provider || existing?.ownershipDetails?.provider || '').trim(),
      contractNumber: String(data.ownershipDetails?.contractNumber || existing?.ownershipDetails?.contractNumber || '').trim(),
      startDate: String(data.ownershipDetails?.startDate || existing?.ownershipDetails?.startDate || '').trim() || undefined,
      endDate: String(data.ownershipDetails?.endDate || existing?.ownershipDetails?.endDate || '').trim() || undefined,
      monthlyPayment: normalizeOptionalNumber(data.ownershipDetails?.monthlyPayment ?? existing?.ownershipDetails?.monthlyPayment),
      notes: String(data.ownershipDetails?.notes || existing?.ownershipDetails?.notes || '').trim() || undefined,
    },

    status: normalizeFleetStatus(data.status),

    itvDate: normalizeOptionalText(data.itvDate),
    itvExpiryDate: normalizeOptionalText(data.itvExpiryDate),
    insuranceCompany: normalizeOptionalText(data.insuranceCompany),
    insurancePolicyNumber: normalizeOptionalText(data.insurancePolicyNumber),
    insuranceExpiryDate: normalizeOptionalText(data.insuranceExpiryDate),
    insuranceType: normalizeOptionalText(data.insuranceType),

    assignedTo,
    costs,
    documents,
    alerts,

    nextMaintenanceDate: normalizeOptionalText(data.nextMaintenanceDate),
    nextMaintenanceMileage: normalizeOptionalNumber(data.nextMaintenanceMileage),

    notes: normalizeOptionalText(data.notes),
    images: Array.isArray(data.images) ? data.images.filter(Boolean) : [],

    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeFleetVehicle(vehicle) {
  if (!vehicle) return null;
  return {
    id: vehicle._id,
    _rev: vehicle._rev,
    type: vehicle.type || 'fleet_vehicle',
    active: vehicle.active !== false,
    user_id: vehicle.user_id,
    business_id: vehicle.business_id || null,
    brand: vehicle.brand || '',
    model: vehicle.model || '',
    vehicleType: vehicle.vehicleType || 'car',
    registrationPlate: vehicle.registrationPlate || '',
    vin: vehicle.vin || null,
    year: vehicle.year || 0,
    color: vehicle.color || '',
    fuelType: vehicle.fuelType || null,
    mileage: vehicle.mileage || null,
    transmission: vehicle.transmission || null,
    ownershipType: vehicle.ownershipType || 'owned',
    ownershipDetails: vehicle.ownershipDetails || {},
    status: vehicle.status || 'active',
    itvDate: vehicle.itvDate || null,
    itvExpiryDate: vehicle.itvExpiryDate || null,
    insuranceCompany: vehicle.insuranceCompany || null,
    insurancePolicyNumber: vehicle.insurancePolicyNumber || null,
    insuranceExpiryDate: vehicle.insuranceExpiryDate || null,
    insuranceType: vehicle.insuranceType || null,
    assignedTo: vehicle.assignedTo || null,
    costs: Array.isArray(vehicle.costs) ? vehicle.costs : [],
    documents: Array.isArray(vehicle.documents) ? vehicle.documents : [],
    alerts: vehicle.alerts || { itvReminder: true, insuranceReminder: true, maintenanceReminder: true, documentExpiry: true },
    nextMaintenanceDate: vehicle.nextMaintenanceDate || null,
    nextMaintenanceMileage: vehicle.nextMaintenanceMileage || null,
    notes: vehicle.notes || null,
    images: Array.isArray(vehicle.images) ? vehicle.images : [],
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
    deletedAt: vehicle.deletedAt || null,
    pendingAlerts: computeFleetAlerts(vehicle),
  };
}

export function computeFleetAlerts(vehicle) {
  if (!vehicle) return [];
  const alerts = [];
  const now = new Date();
  const DAYS_30 = 30 * 86400000;

  const vehicleAlerts = vehicle.alerts || {};

  if (vehicleAlerts.itvReminder !== false && vehicle.itvExpiryDate) {
    const expiry = new Date(vehicle.itvExpiryDate);
    if (!Number.isNaN(expiry.getTime())) {
      const diff = expiry.getTime() - now.getTime();
      if (diff < 0) alerts.push({ type: 'itv_expired', severity: 'critical', message: 'ITV caducada', date: vehicle.itvExpiryDate });
      else if (diff < DAYS_30) alerts.push({ type: 'itv_soon', severity: 'warning', message: 'ITV próxima (menos de 30 días)', date: vehicle.itvExpiryDate });
    }
  }

  if (vehicleAlerts.insuranceReminder !== false && vehicle.insuranceExpiryDate) {
    const expiry = new Date(vehicle.insuranceExpiryDate);
    if (!Number.isNaN(expiry.getTime())) {
      const diff = expiry.getTime() - now.getTime();
      if (diff < 0) alerts.push({ type: 'insurance_expired', severity: 'critical', message: 'Seguro caducado', date: vehicle.insuranceExpiryDate });
      else if (diff < DAYS_30) alerts.push({ type: 'insurance_soon', severity: 'warning', message: 'Seguro próximo a vencer (menos de 30 días)', date: vehicle.insuranceExpiryDate });
    }
  }

  if (vehicleAlerts.maintenanceReminder !== false && vehicle.nextMaintenanceDate) {
    const maint = new Date(vehicle.nextMaintenanceDate);
    if (!Number.isNaN(maint.getTime())) {
      const diff = maint.getTime() - now.getTime();
      if (diff < 0) alerts.push({ type: 'maintenance_overdue', severity: 'critical', message: 'Revisión/mantenimiento atrasado', date: vehicle.nextMaintenanceDate });
      else if (diff < DAYS_30) alerts.push({ type: 'maintenance_soon', severity: 'warning', message: 'Revisión/mantenimiento próximo (menos de 30 días)', date: vehicle.nextMaintenanceDate });
    }
  }

  if (vehicleAlerts.documentExpiry !== false && Array.isArray(vehicle.documents)) {
    for (const doc of vehicle.documents) {
      if (!doc.expiryDate) continue;
      const expiry = new Date(doc.expiryDate);
      if (Number.isNaN(expiry.getTime())) continue;
      const diff = expiry.getTime() - now.getTime();
      if (diff < 0) alerts.push({ type: 'document_expired', severity: 'critical', message: `Documento "${doc.name}" caducado`, documentId: doc.id, date: doc.expiryDate });
      else if (diff < DAYS_30) alerts.push({ type: 'document_expiring', severity: 'warning', message: `Documento "${doc.name}" próximo a caducar`, documentId: doc.id, date: doc.expiryDate });
    }
  }

  return alerts;
}

export async function listFleetVehiclesByUser(req, userId, businessId = null) {
  await ensureDatabase(req, FLEET_DB);
  const docs = await getAllDocuments(req, FLEET_DB);
  return docs.filter((doc) => {
    if (!doc || doc.type !== 'fleet_vehicle' || doc.active === false || doc.deletedAt) return false;
    if (businessId) return doc.business_id === businessId;
    return doc.user_id === userId && !doc.business_id;
  });
}

// ─── SETUP PROGRESS (Onboarding operativo) ──────────────────────────────────

export function buildSetupProgressDocument({ userId, businessId, businessType, requestedModules }) {
  const now = new Date().toISOString();
  const steps = computeSetupSteps(businessType, requestedModules);

  return {
    _id: `setup_progress:${userId}`,
    type: 'setup_progress',
    user_id: String(userId || '').trim(),
    business_id: String(businessId || '').trim(),
    businessType: String(businessType || '').trim(),
    requestedModules: requestedModules && typeof requestedModules === 'object' ? { ...requestedModules } : {},
    steps,
    overallCompleted: false,
    overallCompletedAt: null,
    trialStartDate: null,
    trialEndDate: null,
    welcomeEmailSent: false,
    skippedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function sanitizeSetupProgress(doc) {
  if (!doc) return null;

  return {
    id: doc._id,
    user_id: doc.user_id,
    business_id: doc.business_id || '',
    businessType: doc.businessType || '',
    requestedModules: doc.requestedModules || {},
    steps: Array.isArray(doc.steps) ? doc.steps : [],
    overallCompleted: Boolean(doc.overallCompleted),
    overallCompletedAt: doc.overallCompletedAt || null,
    trialStartDate: doc.trialStartDate || null,
    trialEndDate: doc.trialEndDate || null,
    welcomeEmailSent: Boolean(doc.welcomeEmailSent),
    skippedAt: doc.skippedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function findSetupProgressByUserId(req, userId) {
  if (!userId) return null;
  await ensureDatabase(req, ACCOUNTS_DB);
  return getDocument(req, ACCOUNTS_DB, `setup_progress:${userId}`);
}

export async function saveSetupProgress(req, doc) {
  if (!doc?._id) throw new Error('Documento de setup_progress inválido');
  await ensureDatabase(req, ACCOUNTS_DB);
  const result = await putDocument(req, ACCOUNTS_DB, doc._id, doc);
  return { ...doc, _rev: result.rev };
}

// ─── OCR PROCESSING LOGS ──────────────────────────────────────────────────────

export function buildOcrLogDocument(userId, data = {}) {
  const now = new Date().toISOString();
  const id = `ocr-log-${uuidv4()}`;

  return {
    _id: id,
    type: 'ocr_processing_log',
    id,
    user_id: userId,

    sourceFileName: String(data.sourceFileName || ''),
    sourceMimeType: String(data.sourceMimeType || ''),
    sourceSize: Number(data.sourceSize || 0),
    sourceHash: String(data.sourceHash || ''),

    detectedDocumentType: String(data.detectedDocumentType || 'otro'),
    confidence: Number(data.confidence || 0),
    ocrData: data.ocrData || null,
    ocrFingerprint: String(data.ocrFingerprint || ''),
    processingTimeMs: Number(data.processingTimeMs || 0),
    model: String(data.model || 'gpt-4o'),
    tokensUsed: data.tokensUsed || { prompt: 0, completion: 0 },

    matchedEntities: Array.isArray(data.matchedEntities) ? data.matchedEntities : [],

    routedTo: data.routedTo || null,

    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    errors: Array.isArray(data.errors) ? data.errors : [],

    status: data.status || 'completed',
    reviewedBy: data.reviewedBy || null,
    reviewedAt: data.reviewedAt || null,

    isDuplicate: Boolean(data.isDuplicate),
    duplicateOf: data.duplicateOf || null,

    proposalId: data.proposalId || null,

    createdAt: now,
    updatedAt: now,
  };
}

export function sanitizeOcrLog(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'ocr_processing_log',
    id: doc._id,
    user_id: doc.user_id || '',
    sourceFileName: doc.sourceFileName || '',
    sourceMimeType: doc.sourceMimeType || '',
    sourceSize: Number(doc.sourceSize || 0),
    sourceHash: doc.sourceHash || '',
    detectedDocumentType: doc.detectedDocumentType || 'otro',
    confidence: Number(doc.confidence || 0),
    ocrData: doc.ocrData || null,
    ocrFingerprint: doc.ocrFingerprint || '',
    processingTimeMs: Number(doc.processingTimeMs || 0),
    model: doc.model || 'gpt-4o',
    tokensUsed: doc.tokensUsed || { prompt: 0, completion: 0 },
    matchedEntities: Array.isArray(doc.matchedEntities) ? doc.matchedEntities : [],
    routedTo: doc.routedTo || null,
    warnings: Array.isArray(doc.warnings) ? doc.warnings : [],
    errors: Array.isArray(doc.errors) ? doc.errors : [],
    status: doc.status || 'completed',
    reviewedBy: doc.reviewedBy || null,
    reviewedAt: doc.reviewedAt || null,
    isDuplicate: Boolean(doc.isDuplicate),
    duplicateOf: doc.duplicateOf || null,
    proposalId: doc.proposalId || null,
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
  };
}

export async function listOcrLogsByUser(req, userId) {
  const db = getOcrLogsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((d) => d?.type === 'ocr_processing_log' && !d?.deletedAt && d?.user_id === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function findOcrLogByHash(req, userId, sourceHash) {
  const db = getOcrLogsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs.find((d) =>
    d?.type === 'ocr_processing_log' && d?.user_id === userId && d?.sourceHash === sourceHash,
  ) || null;
}

export async function findOcrLogByFingerprint(req, userId, fingerprint) {
  const db = getOcrLogsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs.find((d) =>
    d?.type === 'ocr_processing_log' && d?.user_id === userId && d?.ocrFingerprint === fingerprint,
  ) || null;
}

// ─── OCR PROPOSALS ────────────────────────────────────────────────────────────

export function buildOcrProposalDocument(userId, data = {}) {
  const now = new Date().toISOString();
  const id = `ocr-proposal-${uuidv4()}`;

  return {
    _id: id,
    type: 'ocr_proposal',
    id,
    user_id: userId,
    ocrLogId: String(data.ocrLogId || ''),

    destination: data.destination || null,
    fields: data.fields || {},
    entity: data.entity || null,
    warnings: Array.isArray(data.warnings) ? data.warnings : [],

    status: data.status || 'pending_review',
    autoApproved: Boolean(data.autoApproved),
    approvedBy: data.approvedBy || null,
    approvedAt: data.approvedAt || null,
    rejectedBy: data.rejectedBy || null,
    rejectedAt: data.rejectedAt || null,

    createdDocumentId: data.createdDocumentId || null,
    createdDocumentDb: data.createdDocumentDb || null,

    sourceFileName: String(data.sourceFileName || ''),
    sourceImageBase64: data.sourceImageBase64 || '',

    ocrData: data.ocrData || null,

    createdAt: now,
    updatedAt: now,
  };
}

export function sanitizeOcrProposal(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'ocr_proposal',
    id: doc._id,
    user_id: doc.user_id || '',
    ocrLogId: doc.ocrLogId || '',
    destination: doc.destination || null,
    fields: doc.fields || {},
    entity: doc.entity || null,
    warnings: Array.isArray(doc.warnings) ? doc.warnings : [],
    status: doc.status || 'pending_review',
    autoApproved: Boolean(doc.autoApproved),
    approvedBy: doc.approvedBy || null,
    approvedAt: doc.approvedAt || null,
    rejectedBy: doc.rejectedBy || null,
    rejectedAt: doc.rejectedAt || null,
    createdDocumentId: doc.createdDocumentId || null,
    createdDocumentDb: doc.createdDocumentDb || null,
    sourceFileName: doc.sourceFileName || '',
    sourceImageBase64: doc.sourceImageBase64 || '',
    ocrData: doc.ocrData || null,
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
  };
}

export async function listOcrProposalsByUser(req, userId) {
  const db = getOcrLogsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((d) => d?.type === 'ocr_proposal' && d?.user_id === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ─── SCALE DEVICES ────────────────────────────────────────────────────────────

const VALID_SCALE_CONNECTION_TYPES = ['usb_serial', 'bluetooth', 'network'];
const VALID_SCALE_READ_PROTOCOLS = ['sics_mt', 'cas', 'epelsa', 'dibal', 'generic_ascii', 'continuous', 'custom'];
const VALID_SCALE_READ_MODES = ['on_demand', 'continuous'];
const VALID_WEIGH_UNITS = ['kg', 'g', 'lb'];

function sanitizeScaleSerial(data) {
  const d = data || {};
  return {
    baudRate: [2400, 4800, 9600, 19200, 38400, 57600, 115200].includes(Number(d.baudRate)) ? Number(d.baudRate) : 9600,
    dataBits: [7, 8].includes(Number(d.dataBits)) ? Number(d.dataBits) : 8,
    stopBits: [1, 2].includes(Number(d.stopBits)) ? Number(d.stopBits) : 1,
    parity: ['none', 'even', 'odd'].includes(d.parity) ? d.parity : 'none',
    flowControl: ['none', 'hardware'].includes(d.flowControl) ? d.flowControl : 'none',
    vendorId: String(d.vendorId || ''),
    productId: String(d.productId || ''),
  };
}

function sanitizeScaleBluetooth(data) {
  const d = data || {};
  return {
    deviceName: String(d.deviceName || ''),
    serviceUuid: String(d.serviceUuid || ''),
    characteristicUuid: String(d.characteristicUuid || ''),
  };
}

function sanitizeScaleNetwork(data) {
  const d = data || {};
  return {
    host: String(d.host || ''),
    port: Math.max(0, Math.min(65535, Number(d.port) || 0)),
    protocol: ['tcp', 'websocket', 'http'].includes(d.protocol) ? d.protocol : 'tcp',
    path: String(d.path || ''),
  };
}

function sanitizeScaleParser(data) {
  const d = data || {};
  return {
    regex: String(d.regex || ''),
    weightGroup: Math.max(0, Number(d.weightGroup) || 1),
    unitGroup: Math.max(0, Number(d.unitGroup) || 2),
    decimalSeparator: d.decimalSeparator === ',' ? ',' : '.',
    encoding: d.encoding === 'utf-8' ? 'utf-8' : 'ascii',
    stableIndicator: String(d.stableIndicator || ''),
  };
}

function sanitizeScaleWeighing(data) {
  const d = data || {};
  return {
    unit: VALID_WEIGH_UNITS.includes(d.unit) ? d.unit : 'kg',
    maxWeight: Math.max(0.001, Number(d.maxWeight) || 30),
    minWeight: Math.max(0, Number(d.minWeight) || 0.001),
    precision: Math.max(0, Math.min(6, Number(d.precision) || 3)),
    tareSupported: Boolean(d.tareSupported),
    tareCommand: String(d.tareCommand || 'T\r\n'),
    zeroCommand: String(d.zeroCommand || 'Z\r\n'),
  };
}

export function buildScaleDeviceDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `scale-device-${uuidv4()}`;
  const connectionType = VALID_SCALE_CONNECTION_TYPES.includes(data.connectionType)
    ? data.connectionType
    : (existing?.connectionType || 'usb_serial');

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'scale_device',
    id,
    user_id: userId,

    name: String(data.name || existing?.name || ''),
    brand: String(data.brand || existing?.brand || ''),
    model: String(data.model || existing?.model || ''),
    serialNumber: String(data.serialNumber || existing?.serialNumber || ''),

    connectionType,
    serial: sanitizeScaleSerial(data.serial || existing?.serial),
    bluetooth: sanitizeScaleBluetooth(data.bluetooth || existing?.bluetooth),
    network: sanitizeScaleNetwork(data.network || existing?.network),

    readProtocol: VALID_SCALE_READ_PROTOCOLS.includes(data.readProtocol)
      ? data.readProtocol
      : (existing?.readProtocol || 'generic_ascii'),
    readMode: VALID_SCALE_READ_MODES.includes(data.readMode)
      ? data.readMode
      : (existing?.readMode || 'on_demand'),
    readCommand: String(data.readCommand ?? existing?.readCommand ?? 'S\r\n'),
    readIntervalMs: Math.max(50, Number(data.readIntervalMs || existing?.readIntervalMs || 500)),

    parser: sanitizeScaleParser(data.parser || existing?.parser),
    weighing: sanitizeScaleWeighing(data.weighing || existing?.weighing),

    active: data.active !== undefined ? Boolean(data.active) : (existing?.active !== false),
    notes: String(data.notes || existing?.notes || ''),

    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeScaleDevice(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'scale_device',
    id: doc._id,
    user_id: doc.user_id || '',
    name: doc.name || '',
    brand: doc.brand || '',
    model: doc.model || '',
    serialNumber: doc.serialNumber || '',
    connectionType: VALID_SCALE_CONNECTION_TYPES.includes(doc.connectionType) ? doc.connectionType : 'usb_serial',
    serial: sanitizeScaleSerial(doc.serial),
    bluetooth: sanitizeScaleBluetooth(doc.bluetooth),
    network: sanitizeScaleNetwork(doc.network),
    readProtocol: VALID_SCALE_READ_PROTOCOLS.includes(doc.readProtocol) ? doc.readProtocol : 'generic_ascii',
    readMode: VALID_SCALE_READ_MODES.includes(doc.readMode) ? doc.readMode : 'on_demand',
    readCommand: doc.readCommand ?? 'S\r\n',
    readIntervalMs: Number(doc.readIntervalMs) || 500,
    parser: sanitizeScaleParser(doc.parser),
    weighing: sanitizeScaleWeighing(doc.weighing),
    active: doc.active !== false,
    notes: doc.notes || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listScaleDevicesByUser(req, userId) {
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'scale_device' && !doc?.deletedAt && (!userId || doc?.user_id === userId))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export const FLEET_DESIGN_VIEWS = {
  by_user_status: {
    map: `function(doc){if(doc.type==='fleet_vehicle'&&doc.active!==false){emit([doc.user_id,doc.status],1);}}`,
    reduce: '_count',
  },
  by_user_ownership: {
    map: `function(doc){if(doc.type==='fleet_vehicle'&&doc.active!==false){emit([doc.user_id,doc.ownershipType],1);}}`,
    reduce: '_count',
  },
  costs_by_user_month: {
    map: `function(doc){if(doc.type==='fleet_vehicle'&&doc.active!==false&&doc.costs){for(var i=0;i<doc.costs.length;i++){var c=doc.costs[i];var m=(c.date||'').slice(0,7);if(m)emit([doc.user_id,m,c.category],c.amount||0);}}}`,
    reduce: '_sum',
  },
  by_assignment: {
    map: `function(doc){if(doc.type==='fleet_vehicle'&&doc.active!==false&&doc.assignedTo&&doc.assignedTo.memberId){emit([doc.user_id,doc.assignedTo.memberId],1);}}`,
    reduce: '_count',
  },
};

// --- BUTCHER SHOP (Carniceria) -----------------------------------------------

export function getButcherDbName() {
  return normalizeDbName(process.env.VITE_BUTCHER_DB || `${getDbPrefix()}-butcher`);
}

export function buildButcherProductDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `bprod-${uuidv4()}`;
  return {
    _id: id, _rev: existing?._rev, type: 'butcher_product', id, user_id: userId,
    business_id: String(data.business_id || existing?.business_id || ''),
    name: String(data.name || existing?.name || ''),
    category: String(data.category || existing?.category || 'general'),
    subcategory: String(data.subcategory || existing?.subcategory || ''),
    sku: data.sku || existing?.sku || `CARN-${Date.now().toString(36).toUpperCase().slice(-6)}`,
    pricePerKg: Number(data.pricePerKg ?? existing?.pricePerKg ?? 0),
    priceUpdatedAt: data.priceUpdatedAt || existing?.priceUpdatedAt || now,
    stockKg: Number(data.stockKg ?? existing?.stockKg ?? 0),
    minStockKg: Number(data.minStockKg ?? existing?.minStockKg ?? 0),
    unit: String(data.unit || existing?.unit || 'kg'),
    active: data.active !== undefined ? Boolean(data.active) : (existing?.active ?? true),
    conservation: String(data.conservation || existing?.conservation || 'refrigerado'),
    image: String(data.image || existing?.image || ''),
    allergens: Array.isArray(data.allergens) ? data.allergens : (existing?.allergens || []),
    supplierId: String(data.supplierId || existing?.supplierId || ''),
    supplierName: String(data.supplierName || existing?.supplierName || ''),
    notes: String(data.notes || existing?.notes || ''),
    createdAt: existing?.createdAt || now, updatedAt: now,
  };
}

export function sanitizeButcherProduct(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'butcher_product', id: doc._id, user_id: doc.user_id,
    business_id: doc.business_id || '', name: doc.name || '',
    category: doc.category || 'general', subcategory: doc.subcategory || '',
    sku: doc.sku || '', pricePerKg: Number(doc.pricePerKg || 0),
    costPerKg: Number(doc.costPerKg || 0),
    priceUpdatedAt: doc.priceUpdatedAt || '', stockKg: Number(doc.stockKg || 0),
    minStockKg: Number(doc.minStockKg || 0), unit: doc.unit || 'kg',
    active: doc.active !== undefined ? Boolean(doc.active) : true,
    conservation: doc.conservation || 'refrigerado', image: doc.image || '',
    allergens: Array.isArray(doc.allergens) ? doc.allergens : [],
    supplierId: doc.supplierId || '', supplierName: doc.supplierName || '',
    notes: doc.notes || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listButcherProductsByUser(req, userId) {
  const db = getButcherDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'butcher_product' && !doc?.deletedAt && (!userId || doc?.user_id === userId))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export function buildButcherBatchDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `bbatch-${uuidv4()}`;
  return {
    _id: id, _rev: existing?._rev, type: 'butcher_batch', id, user_id: userId,
    business_id: String(data.business_id || existing?.business_id || ''),
    productId: String(data.productId || existing?.productId || ''),
    productName: String(data.productName || existing?.productName || ''),
    batchNumber: data.batchNumber || existing?.batchNumber || `LOT-${Date.now().toString(36).toUpperCase().slice(-8)}`,
    origin: String(data.origin || existing?.origin || ''),
    slaughterhouse: String(data.slaughterhouse || existing?.slaughterhouse || ''),
    healthGuide: String(data.healthGuide || existing?.healthGuide || ''),
    animalId: String(data.animalId || existing?.animalId || ''),
    receptionDate: data.receptionDate || existing?.receptionDate || now,
    expirationDate: data.expirationDate || existing?.expirationDate || '',
    receptionWeightKg: Number(data.receptionWeightKg ?? existing?.receptionWeightKg ?? 0),
    currentWeightKg: Number(data.currentWeightKg ?? existing?.currentWeightKg ?? 0),
    status: String(data.status || existing?.status || 'active'),
    temperature: data.temperature !== undefined ? Number(data.temperature) : (existing?.temperature ?? null),
    healthStatus: String(data.healthStatus || existing?.healthStatus || 'approved'),
    zone: String(data.zone || existing?.zone || ''),
    purchaseOrderId: String(data.purchaseOrderId || existing?.purchaseOrderId || ''),
    notes: String(data.notes || existing?.notes || ''),
    createdAt: existing?.createdAt || now, updatedAt: now,
  };
}

export function sanitizeButcherBatch(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'butcher_batch', id: doc._id, user_id: doc.user_id,
    business_id: doc.business_id || '', productId: doc.productId || '',
    productName: doc.productName || '', batchNumber: doc.batchNumber || '',
    origin: doc.origin || '', slaughterhouse: doc.slaughterhouse || '',
    healthGuide: doc.healthGuide || '', animalId: doc.animalId || '',
    receptionDate: doc.receptionDate || '', expirationDate: doc.expirationDate || '',
    receptionWeightKg: Number(doc.receptionWeightKg || 0),
    currentWeightKg: Number(doc.currentWeightKg || 0),
    status: doc.status || 'active',
    temperature: doc.temperature !== undefined && doc.temperature !== null ? Number(doc.temperature) : null,
    healthStatus: doc.healthStatus || 'approved', zone: doc.zone || '',
    purchaseOrderId: doc.purchaseOrderId || '', notes: doc.notes || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listButcherBatchesByUser(req, userId) {
  const db = getButcherDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'butcher_batch' && !doc?.deletedAt && (!userId || doc?.user_id === userId))
    .sort((a, b) => String(b.receptionDate || '').localeCompare(String(a.receptionDate || '')));
}

export function buildButcherWasteDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `bwaste-${uuidv4()}`;
  const VALID_WASTE_TYPES = ['hueso', 'grasa', 'recortes', 'caducado', 'rotura', 'perdida_manual'];
  const VALID_REVIEW_STATUSES = ['pending', 'approved', 'rejected'];
  const VALID_SEVERITIES = ['low', 'medium', 'high'];

  const wasteType = VALID_WASTE_TYPES.includes(data.wasteType) ? data.wasteType
    : VALID_WASTE_TYPES.includes(existing?.wasteType) ? existing.wasteType : 'perdida_manual';
  const reviewStatus = VALID_REVIEW_STATUSES.includes(data.reviewStatus) ? data.reviewStatus
    : VALID_REVIEW_STATUSES.includes(existing?.reviewStatus) ? existing.reviewStatus : 'pending';
  const estimatedCost = Number(data.estimatedCost ?? existing?.estimatedCost ?? 0);
  const severity = VALID_SEVERITIES.includes(data.severity) ? data.severity
    : VALID_SEVERITIES.includes(existing?.severity) ? existing.severity
    : estimatedCost > 50 ? 'high' : estimatedCost > 20 ? 'medium' : 'low';

  return {
    _id: id, _rev: existing?._rev, type: 'butcher_waste', id, user_id: userId,
    business_id: String(data.business_id || existing?.business_id || ''),
    productId: String(data.productId || existing?.productId || ''),
    productName: String(data.productName || existing?.productName || ''),
    batchId: String(data.batchId || existing?.batchId || ''),
    date: data.date || existing?.date || now.slice(0, 10),
    wasteKg: Number(data.wasteKg ?? existing?.wasteKg ?? 0),
    reason: String(data.reason || existing?.reason || ''),
    category: String(data.category || existing?.category || 'proceso'),
    notes: String(data.notes || existing?.notes || ''),
    registeredBy: String(data.registeredBy || existing?.registeredBy || userId),
    wasteType,
    catalogItemId: String(data.catalogItemId || existing?.catalogItemId || ''),
    catalogItemName: String(data.catalogItemName || existing?.catalogItemName || ''),
    estimatedCost,
    costPriceAtTime: Number(data.costPriceAtTime ?? existing?.costPriceAtTime ?? 0),
    registeredByName: String(data.registeredByName || existing?.registeredByName || ''),
    reviewStatus,
    reviewedBy: String(data.reviewedBy || existing?.reviewedBy || ''),
    reviewedByName: String(data.reviewedByName || existing?.reviewedByName || ''),
    reviewNotes: String(data.reviewNotes || existing?.reviewNotes || ''),
    reviewedAt: String(data.reviewedAt || existing?.reviewedAt || ''),
    stockMovementId: String(data.stockMovementId || existing?.stockMovementId || ''),
    financeMovementId: String(data.financeMovementId || existing?.financeMovementId || ''),
    severity,
    createdAt: existing?.createdAt || now, updatedAt: now,
  };
}

export function sanitizeButcherWaste(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'butcher_waste', id: doc._id, user_id: doc.user_id,
    business_id: doc.business_id || '', productId: doc.productId || '',
    productName: doc.productName || '', batchId: doc.batchId || '',
    date: doc.date || '', wasteKg: Number(doc.wasteKg || 0),
    reason: doc.reason || '', category: doc.category || 'proceso',
    notes: doc.notes || '', registeredBy: doc.registeredBy || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listButcherWasteByUser(req, userId, dateFrom, dateTo, filters = {}) {
  const db = getButcherDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => {
      if (!doc || doc.type !== 'butcher_waste' || doc.deletedAt) return false;
      if (userId && doc.user_id !== userId) return false;
      if (dateFrom && doc.date < dateFrom) return false;
      if (dateTo && doc.date > dateTo) return false;
      if (filters.wasteType && doc.wasteType !== filters.wasteType) return false;
      if (filters.reviewStatus && doc.reviewStatus !== filters.reviewStatus) return false;
      if (filters.registeredBy && doc.registeredBy !== filters.registeredBy) return false;
      if (filters.catalogItemId && doc.catalogItemId !== filters.catalogItemId) return false;
      return true;
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export function buildButcherScaleStatusDocument(data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `bscale-${data.business_id || 'unknown'}-${data.scaleId || uuidv4()}`;
  return {
    _id: id, _rev: existing?._rev, type: 'butcher_scale_status', id,
    business_id: String(data.business_id || existing?.business_id || ''),
    scaleId: String(data.scaleId || existing?.scaleId || ''),
    name: String(data.name || existing?.name || ''),
    connected: data.connected !== undefined ? Boolean(data.connected) : (existing?.connected ?? true),
    lastPingAt: data.lastPingAt || existing?.lastPingAt || now,
    ip: String(data.ip || existing?.ip || ''),
    model: String(data.model || existing?.model || ''),
    location: String(data.location || existing?.location || 'mostrador'),
    lastWeight: data.lastWeight !== undefined ? Number(data.lastWeight) : (existing?.lastWeight ?? null),
    lastStatus: String(data.lastStatus || existing?.lastStatus || ''),
    createdAt: existing?.createdAt || now, updatedAt: now,
  };
}

export function sanitizeButcherScaleStatus(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'butcher_scale_status', id: doc._id,
    business_id: doc.business_id || '', scaleId: doc.scaleId || '',
    name: doc.name || '', connected: Boolean(doc.connected),
    lastPingAt: doc.lastPingAt || '', ip: doc.ip || '',
    model: doc.model || '', location: doc.location || 'mostrador',
    lastWeight: doc.lastWeight !== undefined && doc.lastWeight !== null ? Number(doc.lastWeight) : null,
    lastStatus: doc.lastStatus || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listButcherScalesByBusiness(req, businessId) {
  const db = getButcherDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'butcher_scale_status' && !doc?.deletedAt && (!businessId || doc?.business_id === businessId));
}

export function buildButcherInventoryCountDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `binvcount-${uuidv4()}`;
  const items = Array.isArray(data.items) ? data.items.map((item) => ({
    productId: String(item.productId || ''),
    productName: String(item.productName || ''),
    expectedKg: Number(item.expectedKg || 0),
    countedKg: Number(item.countedKg || 0),
    differenceKg: Number(item.countedKg || 0) - Number(item.expectedKg || 0),
    differencePct: Number(item.expectedKg || 0) > 0
      ? Math.round(((Number(item.countedKg || 0) - Number(item.expectedKg || 0)) / Number(item.expectedKg)) * 1000) / 10
      : 0,
  })) : (existing?.items || []);
  const totalDifferenceKg = items.reduce((sum, i) => sum + i.differenceKg, 0);

  return {
    _id: id, _rev: existing?._rev, type: 'butcher_inventory_count', id, user_id: userId,
    business_id: String(data.business_id || existing?.business_id || ''),
    date: data.date || existing?.date || now.slice(0, 10),
    countedBy: String(data.countedBy || existing?.countedBy || userId),
    status: String(data.status || existing?.status || 'completed'),
    items, totalDifferenceKg,
    notes: String(data.notes || existing?.notes || ''),
    createdAt: existing?.createdAt || now, updatedAt: now,
  };
}

export function sanitizeButcherInventoryCount(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'butcher_inventory_count', id: doc._id,
    user_id: doc.user_id, business_id: doc.business_id || '',
    date: doc.date || '', countedBy: doc.countedBy || '',
    status: doc.status || 'completed',
    items: Array.isArray(doc.items) ? doc.items : [],
    totalDifferenceKg: Number(doc.totalDifferenceKg || 0),
    notes: doc.notes || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listButcherInventoryCountsByUser(req, userId) {
  const db = getButcherDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'butcher_inventory_count' && !doc?.deletedAt && (!userId || doc?.user_id === userId))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PREPARATION EXPENSES (vehicle preparation costs)
// ═══════════════════════════════════════════════════════════════════════════════

export const PREPARATION_EXPENSE_TYPES = ['pintura', 'mecanica', 'chapa', 'electricidad', 'tapiceria', 'limpieza', 'itv', 'transporte', 'documentacion', 'otro'];
export const PREPARATION_EXPENSE_STATUSES = ['pendiente', 'aprobado', 'pagado', 'rechazado'];

export function buildPreparationExpenseDocument(userId, data = {}, existing = null, businessId = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data.id || `prep-expense-${uuidv4()}`;
  return {
    _id: id, _rev: existing?._rev, type: 'preparation_expense', id,
    user_id: userId,
    business_id: businessId || data.business_id || existing?.business_id || '',
    active: data.active !== false,
    vehicleId: String(data.vehicleId || existing?.vehicleId || ''),
    vehiclePlate: String(data.vehiclePlate || existing?.vehiclePlate || ''),
    vehicleLabel: String(data.vehicleLabel || existing?.vehicleLabel || ''),
    expenseType: PREPARATION_EXPENSE_TYPES.includes(data.expenseType) ? data.expenseType : (existing?.expenseType || 'otro'),
    status: PREPARATION_EXPENSE_STATUSES.includes(data.status) ? data.status : (existing?.status || 'pendiente'),
    description: String(data.description || existing?.description || ''),
    amount: Number(data.amount ?? existing?.amount ?? 0),
    date: String(data.date || existing?.date || now.slice(0, 10)),
    supplierId: String(data.supplierId || existing?.supplierId || ''),
    supplierName: String(data.supplierName || existing?.supplierName || ''),
    documentId: String(data.documentId || existing?.documentId || ''),
    invoiceNumber: String(data.invoiceNumber || existing?.invoiceNumber || ''),
    notes: String(data.notes || existing?.notes || ''),
    createdBy: String(data.createdBy || existing?.createdBy || userId),
    approvedBy: String(data.approvedBy || existing?.approvedBy || ''),
    approvedAt: data.approvedAt || existing?.approvedAt || null,
    createdAt: existing?.createdAt || now, updatedAt: now,
    deletedAt: existing?.deletedAt || null,
  };
}

export function sanitizePreparationExpense(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, id: doc._id, type: 'preparation_expense',
    user_id: doc.user_id, business_id: doc.business_id || '',
    vehicleId: doc.vehicleId || '', vehiclePlate: doc.vehiclePlate || '', vehicleLabel: doc.vehicleLabel || '',
    expenseType: doc.expenseType || 'otro', status: doc.status || 'pendiente',
    description: doc.description || '', amount: Number(doc.amount || 0),
    date: doc.date || '', supplierId: doc.supplierId || '', supplierName: doc.supplierName || '',
    documentId: doc.documentId || '', invoiceNumber: doc.invoiceNumber || '',
    notes: doc.notes || '', createdBy: doc.createdBy || '',
    approvedBy: doc.approvedBy || '', approvedAt: doc.approvedAt || null,
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listPreparationExpensesByUser(req, userId, businessId = null) {
  await ensureDatabase(req, VEHICLES_DB);
  const docs = await getAllDocuments(req, VEHICLES_DB);
  return docs.filter((d) => {
    if (d?.type !== 'preparation_expense' || d?.active === false || d?.deletedAt) return false;
    if (businessId) return d.business_id === businessId;
    return d.user_id === userId;
  }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export async function listPreparationExpensesByVehicle(req, userId, vehicleId) {
  const all = await listPreparationExpensesByUser(req, userId);
  return all.filter((d) => d.vehicleId === vehicleId);
}

export async function getPreparationExpenseTotalByVehicle(req, userId, vehicleId) {
  const expenses = await listPreparationExpensesByVehicle(req, userId, vehicleId);
  return expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
}


// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE EXECUTION (cleaning service execution tracking)
// ═══════════════════════════════════════════════════════════════════════════════

export function buildServiceExecution(data = {}, existing = null) {
  return {
    status: String(data.status || existing?.status || 'not_started'),
    checkInAt: data.checkInAt || existing?.checkInAt || null,
    checkInGeo: data.checkInGeo || existing?.checkInGeo || null,
    checkOutAt: data.checkOutAt || existing?.checkOutAt || null,
    checkOutGeo: data.checkOutGeo || existing?.checkOutGeo || null,
    plannedMinutes: Number(data.plannedMinutes ?? existing?.plannedMinutes ?? 0),
    realMinutes: Number(data.realMinutes ?? existing?.realMinutes ?? 0),
    deviationMinutes: Number(data.deviationMinutes ?? existing?.deviationMinutes ?? 0),
    workerNotes: String(data.workerNotes || existing?.workerNotes || ''),
    pauseLog: Array.isArray(data.pauseLog) ? data.pauseLog : (existing?.pauseLog || []),
    incidents: Array.isArray(data.incidents) ? data.incidents : (existing?.incidents || []),
    photosBefore: Array.isArray(data.photosBefore) ? data.photosBefore : (existing?.photosBefore || []),
    photosAfter: Array.isArray(data.photosAfter) ? data.photosAfter : (existing?.photosAfter || []),
    validatedBy: data.validatedBy || existing?.validatedBy || '',
    validatedAt: data.validatedAt || existing?.validatedAt || null,
    validationNotes: String(data.validationNotes || existing?.validationNotes || ''),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLEANING CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════════

export function getCleaningContractsDbName() { return 'cleaning_contracts'; }

export function buildCleaningContractDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data.id || `cleaning-contract-${uuidv4()}`;
  return {
    _id: id, _rev: existing?._rev, type: 'cleaning_contract', id,
    user_id: userId, business_id: data.business_id || existing?.business_id || '',
    clientId: String(data.clientId || existing?.clientId || ''),
    clientName: String(data.clientName || existing?.clientName || ''),
    title: String(data.title || existing?.title || ''),
    description: String(data.description || existing?.description || ''),
    startDate: String(data.startDate || existing?.startDate || ''),
    endDate: String(data.endDate || existing?.endDate || ''),
    amount: Number(data.amount ?? existing?.amount ?? 0),
    frequency: String(data.frequency || existing?.frequency || 'mensual'),
    status: String(data.status || existing?.status || 'activo'),
    services: Array.isArray(data.services) ? data.services : (existing?.services || []),
    notes: String(data.notes || existing?.notes || ''),
    createdAt: existing?.createdAt || now, updatedAt: now,
    deletedAt: existing?.deletedAt || null,
  };
}

export function sanitizeCleaningContract(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, id: doc._id, type: 'cleaning_contract',
    user_id: doc.user_id, business_id: doc.business_id || '',
    clientId: doc.clientId || '', clientName: doc.clientName || '',
    title: doc.title || '', description: doc.description || '',
    startDate: doc.startDate || '', endDate: doc.endDate || '',
    amount: Number(doc.amount || 0), frequency: doc.frequency || 'mensual',
    status: doc.status || 'activo',
    services: Array.isArray(doc.services) ? doc.services : [],
    notes: doc.notes || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listCleaningContractsByUser(req, userId) {
  const db = getCleaningContractsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((d) => d?.type === 'cleaning_contract' && !d?.deletedAt && d?.user_id === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUTCHER PURCHASE ENTRIES
// ═══════════════════════════════════════════════════════════════════════════════

export function buildButcherPurchaseEntryDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data.id || `butcher-purchase-${uuidv4()}`;
  return {
    _id: id, _rev: existing?._rev, type: 'butcher_purchase_entry', id,
    user_id: userId, business_id: data.business_id || existing?.business_id || '',
    supplierId: String(data.supplierId || existing?.supplierId || ''),
    supplierName: String(data.supplierName || existing?.supplierName || ''),
    date: String(data.date || existing?.date || now.slice(0, 10)),
    items: Array.isArray(data.items) ? data.items : (existing?.items || []),
    totalKg: Number(data.totalKg ?? existing?.totalKg ?? 0),
    totalAmount: Number(data.totalAmount ?? existing?.totalAmount ?? 0),
    invoiceNumber: String(data.invoiceNumber || existing?.invoiceNumber || ''),
    notes: String(data.notes || existing?.notes || ''),
    status: String(data.status || existing?.status || 'recibido'),
    createdAt: existing?.createdAt || now, updatedAt: now,
    deletedAt: existing?.deletedAt || null,
  };
}

export function sanitizeButcherPurchaseEntry(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, id: doc._id, type: 'butcher_purchase_entry',
    user_id: doc.user_id, business_id: doc.business_id || '',
    supplierId: doc.supplierId || '', supplierName: doc.supplierName || '',
    date: doc.date || '',
    items: Array.isArray(doc.items) ? doc.items : [],
    totalKg: Number(doc.totalKg || 0), totalAmount: Number(doc.totalAmount || 0),
    invoiceNumber: doc.invoiceNumber || '', notes: doc.notes || '',
    status: doc.status || 'recibido',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listButcherPurchaseEntriesByUser(req, userId) {
  const db = getButcherDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((d) => d?.type === 'butcher_purchase_entry' && !d?.deletedAt && d?.user_id === userId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERT CENTER (NOTIFICATIONS_DB — business-scoped)
// ═══════════════════════════════════════════════════════════════════════════════

function normalizeAlertScopeId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

const alertScopeDocsCache = new Map();
const alertScopeDocsInflight = new Map();
const ALERT_SCOPE_DOCS_TTL_MS = 12_000;

/**
 * Docs del centro de alertas para un negocio/usuario.
 * Antes: getAllDocuments(notifications) en cada list/summary → segundos en móvil.
 * Ahora: Mango por businessId / user_id + singleflight cache corta.
 */
async function getNotificationDocsForScope(req, scopeId) {
  const scope = normalizeAlertScopeId(scopeId);
  if (!scope) return [];

  const cached = alertScopeDocsCache.get(scope);
  if (cached && Date.now() - cached.at < ALERT_SCOPE_DOCS_TTL_MS) {
    return cached.docs;
  }
  const inflight = alertScopeDocsInflight.get(scope);
  if (inflight) return inflight;

  const promise = (async () => {
    await ensureDatabase(req, NOTIFICATIONS_DB);
    await setupDatabaseIndexes(req, NOTIFICATIONS_DB).catch(() => null);

    const bizVariants = [scope, `business:${scope}`];
    const queries = [
      ...bizVariants.map((businessId) =>
        findDocuments(
          req,
          NOTIFICATIONS_DB,
          { type: 'notification', businessId },
          { pageSize: 400, maxDocs: 4_000 },
        ).catch(() => []),
      ),
      // Scope = user_id (sin empresa activa). Con businessId en el doc, matchesScope ya no mezcla empresas.
      findDocuments(
        req,
        NOTIFICATIONS_DB,
        { type: 'notification', user_id: scope },
        { pageSize: 400, maxDocs: 4_000 },
      ).catch(() => []),
    ];

    let batches = await Promise.all(queries);
    const any = batches.some((b) => Array.isArray(b) && b.length > 0);
    if (!any) {
      // Fallback legado si el índice aún no está listo
      try {
        const all = await getAllDocuments(req, NOTIFICATIONS_DB);
        batches = [all];
      } catch {
        batches = [];
      }
    }

    const byId = new Map();
    for (const batch of batches) {
      for (const doc of batch || []) {
        if (doc?._id && notificationMatchesScope(doc, scope, { includeDeleted: true })) {
          byId.set(doc._id, doc);
        }
      }
    }
    const docs = [...byId.values()];
    alertScopeDocsCache.set(scope, { at: Date.now(), docs });
    return docs;
  })().finally(() => {
    alertScopeDocsInflight.delete(scope);
  });

  alertScopeDocsInflight.set(scope, promise);
  return promise;
}

export function invalidateAlertScopeDocsCache(scopeId) {
  const scope = normalizeAlertScopeId(scopeId);
  if (!scope) {
    alertScopeDocsCache.clear();
    return;
  }
  alertScopeDocsCache.delete(scope);
}

export function notificationMatchesScope(doc, scopeId, { includeDeleted = false } = {}) {
  if (!doc || doc.type !== 'notification') return false;
  if (doc.deletedAt && !includeDeleted) return false;
  const scope = normalizeAlertScopeId(scopeId);
  if (!scope) return false;
  const docBiz = normalizeAlertScopeId(doc.businessId);
  // Con empresa: solo esa empresa (no mezclar Modomio ↔ PAUNILPOL por user_id).
  if (docBiz) {
    return docBiz === scope || String(doc.businessId || '') === scopeId;
  }
  // Legado sin businessId: solo si el scope es el user_id del aviso.
  return String(doc.user_id || '') === scope;
}

function normalizeNotificationStatus(doc) {
  if (doc.status && VALID_ALERT_STATUSES.includes(doc.status)) return doc.status;
  return doc.read ? 'seen' : 'new';
}

function filterAlertsForScope(docs, scopeId, filters = {}) {
  const includeDeleted = filters.includeDeleted === true || filters.includeDeleted === 'true';
  let items = docs.filter((d) => notificationMatchesScope(d, scopeId, { includeDeleted }));

  // Alertas positivas (fue bien) no entran en el Centro de problemas.
  items = items.filter((d) => {
    if (d?.polarity === 'positive' || d?.metadata?.polarity === 'positive') return false;
    if (d?.excludeFromAlertCenter === true) return false;
    if (d?.kind === 'activity' || d?.kind === 'positive') return false;
    if (d?.metadata?.excludeFromAlertCenter === true) return false;
    if (d?.metadata?.kind === 'activity' || d?.metadata?.kind === 'positive') return false;
    return true;
  });

  if (filters.historyOnly === true || filters.historyOnly === 'true') {
    items = items.filter((d) => d.deletedAt || normalizeNotificationStatus(d) === 'resolved');
    if (!includeDeleted) {
      items = items.filter((d) => !d.deletedAt);
    }
  }

  if (filters.status) {
    const statuses = String(filters.status).split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length > 0) {
      items = items.filter((d) => statuses.includes(normalizeNotificationStatus(d)));
    }
  }

  if (filters.priority) {
    const priorities = String(filters.priority).split(',').map((s) => s.trim()).filter(Boolean);
    if (priorities.length > 0) {
      items = items.filter((d) => {
        const p = d.priority && VALID_PRIORITIES.includes(d.priority)
          ? d.priority
          : (LEVEL_PRIORITY_MAP[normalizeNotificationLevel(d.level)] || 'medium');
        return priorities.includes(p);
      });
    }
  }

  if (filters.source) {
    const sources = String(filters.source).split(',').map((s) => s.trim()).filter(Boolean);
    if (sources.length > 0) {
      items = items.filter((d) => {
        const src = d.source && VALID_SOURCES.includes(d.source)
          ? d.source
          : (CATEGORY_SOURCE_MAP[String(d.category || '')] || 'sistema');
        return sources.includes(src);
      });
    }
  }

  if (filters.assignedTo) {
    const assignee = String(filters.assignedTo).trim();
    items = items.filter((d) => {
      const ids = Array.isArray(d.assignedTo?.userIds) ? d.assignedTo.userIds : [];
      return ids.includes(assignee) || d.user_id === assignee;
    });
  }

  if (filters.search) {
    const q = String(filters.search).trim().toLowerCase();
    if (q) {
      items = items.filter((d) => {
        const hay = [
          d.title, d.message, d.category, d.source, d.entityType, d.entityId,
        ].map((v) => String(v || '').toLowerCase()).join(' ');
        return hay.includes(q);
      });
    }
  }

  if (filters.from) {
    const fromTs = new Date(filters.from).getTime();
    if (!Number.isNaN(fromTs)) {
      items = items.filter((d) => {
        const ref = filters.historyOnly ? alertHistorySortKey(d) : (d.createdAt || '');
        return new Date(ref || 0).getTime() >= fromTs;
      });
    }
  }

  if (filters.to) {
    const toTs = new Date(filters.to).getTime();
    if (!Number.isNaN(toTs)) {
      items = items.filter((d) => {
        const ref = filters.historyOnly ? alertHistorySortKey(d) : (d.createdAt || '');
        return new Date(ref || 0).getTime() <= toTs;
      });
    }
  }

  const sortField = String(filters.sort || 'createdAt');
  const order = filters.order === 'asc' ? 1 : -1;
  if (sortField === 'resolvedAt' || (filters.historyOnly && sortField === 'createdAt')) {
    items.sort((a, b) => order * String(alertHistorySortKey(a)).localeCompare(String(alertHistorySortKey(b))));
  } else {
    items.sort((a, b) => order * String(a[sortField] || '').localeCompare(String(b[sortField] || '')));
  }

  return items;
}

export async function listAlertsByBusiness(req, scopeId, filters = {}) {
  const docs = await getNotificationDocsForScope(req, scopeId);
  const items = filterAlertsForScope(docs, scopeId, filters);

  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 25));
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;

  return {
    items: items.slice(start, start + limit),
    total,
    page,
    limit,
    pages,
  };
}

export async function getAlertsSummary(req, scopeId) {
  const docs = await getNotificationDocsForScope(req, scopeId);
  const items = filterAlertsForScope(docs, scopeId, {});

  const byPriority = { high: 0, medium: 0, low: 0 };
  const byStatus = { new: 0, seen: 0, resolved: 0 };
  const bySource = {};
  let unresolved = 0;
  let lastAlertAt = null;

  for (const doc of items) {
    const status = normalizeNotificationStatus(doc);
    byStatus[status] = (byStatus[status] || 0) + 1;
    const isOpen = status !== 'resolved';
    if (isOpen) unresolved += 1;

    const priority = doc.priority && VALID_PRIORITIES.includes(doc.priority)
      ? doc.priority
      : (LEVEL_PRIORITY_MAP[normalizeNotificationLevel(doc.level)] || 'medium');
    // Solo abiertas: si no, Visión general / riesgo sumaba críticas ya resueltas.
    if (isOpen) {
      byPriority[priority] = (byPriority[priority] || 0) + 1;
    }

    const source = doc.source && VALID_SOURCES.includes(doc.source)
      ? doc.source
      : (CATEGORY_SOURCE_MAP[String(doc.category || '')] || 'sistema');
    if (isOpen) {
      bySource[source] = (bySource[source] || 0) + 1;
    }

    const createdAt = String(doc.createdAt || '');
    if (createdAt && (!lastAlertAt || createdAt > lastAlertAt)) {
      lastAlertAt = createdAt;
    }
  }

  return {
    total: items.length,
    byPriority,
    byStatus,
    bySource,
    unresolved,
    lastAlertAt,
    historyTotal: items.filter((d) => d.deletedAt || normalizeNotificationStatus(d) === 'resolved').length,
  };
}

// ── Vehicle Acquisition (Compras y Retiradas) ─────────────────────────────────

export const ACQUISITION_TYPES = ['compra_particular', 'compra_empresa', 'subasta', 'retirada', 'grua_externa'];
export const ACQUISITION_STATUSES = ['borrador', 'pendiente_aprobacion', 'aprobada', 'rechazada', 'en_transito', 'recibida', 'documentada', 'cerrada', 'cancelada'];
export const ACQUISITION_PAYMENT_METHODS = ['efectivo', 'transferencia', 'cheque', 'aplazado', 'compensacion', 'otro'];
export const ACQUISITION_PAYMENT_STATUSES = ['pendiente', 'parcial', 'pagado'];
export const ACQUISITION_SELLER_TYPES = ['particular', 'empresa', 'aseguradora', 'subasta', 'organismo'];

export const SCRAPYARD_COST_CATEGORIES = [
  'compra', 'transporte', 'gestoria', 'documentacion', 'descontaminacion',
  'compactacion', 'almacenamiento', 'reparacion_pieza', 'otro',
];

const ACQUISITION_STATUS_TRANSITIONS = {
  borrador: ['pendiente_aprobacion', 'cancelada'],
  pendiente_aprobacion: ['aprobada', 'rechazada', 'cancelada'],
  aprobada: ['en_transito', 'recibida', 'cancelada'],
  rechazada: ['borrador', 'cancelada'],
  en_transito: ['recibida', 'cancelada'],
  recibida: ['documentada', 'cerrada'],
  documentada: ['cerrada'],
  cerrada: [],
  cancelada: [],
};

export function isValidAcquisitionTransition(from, to) {
  return (ACQUISITION_STATUS_TRANSITIONS[from] || []).includes(to);
}

export function recalcAcquisitionTotalCost(doc) {
  return (
    (Number(doc.costCompra) || 0) +
    (Number(doc.costTransporte) || 0) +
    (Number(doc.costGestoria) || 0) +
    (Number(doc.costDocumentacion) || 0) +
    (Number(doc.costDescontaminacion) || 0) +
    (Number(doc.costOtros) || 0)
  );
}

export function buildVehicleAcquisitionDocument(userId, data = {}, existing = null, businessId = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `vacq:${uuidv4()}`;

  const costCompra = normalizeRequiredNumber(data.costCompra);
  const costTransporte = normalizeRequiredNumber(data.costTransporte);
  const costGestoria = normalizeRequiredNumber(data.costGestoria);
  const costDocumentacion = normalizeRequiredNumber(data.costDocumentacion);
  const costDescontaminacion = normalizeRequiredNumber(data.costDescontaminacion);
  const costOtros = normalizeRequiredNumber(data.costOtros);
  const costTotal = costCompra + costTransporte + costGestoria + costDocumentacion + costDescontaminacion + costOtros;

  const rawChecklist = Array.isArray(data.requiredDocsChecklist)
    ? data.requiredDocsChecklist
    : existing?.requiredDocsChecklist || [];
  const requiredDocsChecklist = rawChecklist.map((c) => ({
    docType: String(c.docType || ''),
    present: Boolean(c.present),
    documentId: c.documentId || null,
  }));
  const hasRequiredDocs = requiredDocsChecklist.length > 0 && requiredDocsChecklist.every((c) => c.present);

  const statusHistory = Array.isArray(data.statusHistory)
    ? data.statusHistory
    : existing?.statusHistory || [{ status: 'borrador', date: now, userId, note: '' }];

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'vehicle_acquisition',
    user_id: userId,
    business_id: businessId || data.business_id || existing?.business_id || undefined,
    vehicleId: normalizeText(data.vehicleId || existing?.vehicleId || ''),
    tradeInId: normalizeOptionalText(data.tradeInId) || existing?.tradeInId || undefined,
    registrationPlate: normalizeText(data.registrationPlate || existing?.registrationPlate || '').toUpperCase(),
    acquisitionType: ACQUISITION_TYPES.includes(data.acquisitionType) ? data.acquisitionType : 'compra_particular',
    sellerType: ACQUISITION_SELLER_TYPES.includes(data.sellerType) ? data.sellerType : 'particular',
    sellerName: normalizeText(data.sellerName || existing?.sellerName || ''),
    sellerNif: normalizeOptionalText(data.sellerNif),
    sellerPhone: normalizeOptionalText(data.sellerPhone),
    sellerEmail: normalizeOptionalText(data.sellerEmail),
    sellerAddress: normalizeOptionalText(data.sellerAddress),
    supplierId: normalizeOptionalText(data.supplierId),
    costCompra,
    costTransporte,
    costGestoria,
    costDocumentacion,
    costDescontaminacion,
    costOtros,
    costOtrosDetalle: normalizeOptionalText(data.costOtrosDetalle),
    costTotal,
    paymentMethod: ACQUISITION_PAYMENT_METHODS.includes(data.paymentMethod) ? data.paymentMethod : 'transferencia',
    paymentReference: normalizeOptionalText(data.paymentReference),
    paymentDate: normalizeOptionalText(data.paymentDate),
    paymentStatus: ACQUISITION_PAYMENT_STATUSES.includes(data.paymentStatus) ? data.paymentStatus : 'pendiente',
    paymentNotes: normalizeOptionalText(data.paymentNotes),
    status: ACQUISITION_STATUSES.includes(data.status || existing?.status) ? (data.status || existing?.status) : 'borrador',
    statusHistory,
    approvedBy: normalizeOptionalText(data.approvedBy || existing?.approvedBy),
    approvedAt: normalizeOptionalText(data.approvedAt || existing?.approvedAt),
    linkedDocumentIds: Array.isArray(data.linkedDocumentIds) ? data.linkedDocumentIds : existing?.linkedDocumentIds || [],
    linkedInvoiceIds: Array.isArray(data.linkedInvoiceIds) ? data.linkedInvoiceIds : existing?.linkedInvoiceIds || [],
    hasRequiredDocs,
    requiredDocsChecklist,
    ocrData: data.ocrData || existing?.ocrData || null,
    acquisitionDate: normalizeOptionalText(data.acquisitionDate) || now.slice(0, 10),
    receptionDate: normalizeOptionalText(data.receptionDate || existing?.receptionDate),
    closedAt: normalizeOptionalText(data.closedAt || existing?.closedAt),
    notes: normalizeOptionalText(data.notes),
    internalNotes: normalizeOptionalText(data.internalNotes || existing?.internalNotes),
    createdBy: existing?.createdBy || userId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeVehicleAcquisition(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    _rev: doc._rev,
    type: 'vehicle_acquisition',
    user_id: doc.user_id,
    business_id: doc.business_id || undefined,
    vehicleId: doc.vehicleId || '',
    tradeInId: doc.tradeInId || '',
    registrationPlate: doc.registrationPlate || '',
    acquisitionType: doc.acquisitionType || 'compra_particular',
    sellerType: doc.sellerType || 'particular',
    sellerName: doc.sellerName || '',
    sellerNif: doc.sellerNif || '',
    sellerPhone: doc.sellerPhone || '',
    sellerEmail: doc.sellerEmail || '',
    sellerAddress: doc.sellerAddress || '',
    supplierId: doc.supplierId || '',
    costCompra: Number(doc.costCompra) || 0,
    costTransporte: Number(doc.costTransporte) || 0,
    costGestoria: Number(doc.costGestoria) || 0,
    costDocumentacion: Number(doc.costDocumentacion) || 0,
    costDescontaminacion: Number(doc.costDescontaminacion) || 0,
    costOtros: Number(doc.costOtros) || 0,
    costOtrosDetalle: doc.costOtrosDetalle || '',
    costTotal: Number(doc.costTotal) || 0,
    paymentMethod: doc.paymentMethod || 'transferencia',
    paymentReference: doc.paymentReference || '',
    paymentDate: doc.paymentDate || '',
    paymentStatus: doc.paymentStatus || 'pendiente',
    paymentNotes: doc.paymentNotes || '',
    status: doc.status || 'borrador',
    statusHistory: Array.isArray(doc.statusHistory) ? doc.statusHistory : [],
    approvedBy: doc.approvedBy || '',
    approvedAt: doc.approvedAt || '',
    linkedDocumentIds: Array.isArray(doc.linkedDocumentIds) ? doc.linkedDocumentIds : [],
    linkedInvoiceIds: Array.isArray(doc.linkedInvoiceIds) ? doc.linkedInvoiceIds : [],
    hasRequiredDocs: Boolean(doc.hasRequiredDocs),
    requiredDocsChecklist: Array.isArray(doc.requiredDocsChecklist) ? doc.requiredDocsChecklist : [],
    ocrData: doc.ocrData || null,
    acquisitionDate: doc.acquisitionDate || '',
    receptionDate: doc.receptionDate || '',
    closedAt: doc.closedAt || '',
    notes: doc.notes || '',
    internalNotes: doc.internalNotes || '',
    createdBy: doc.createdBy || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listVehicleAcquisitionsByUser(req, userId) {
  await ensureDatabase(req, VEHICLES_DB);
  const docs = await getAllDocuments(req, VEHICLES_DB);
  return docs
    .filter((d) => d?.type === 'vehicle_acquisition' && !d?.deletedAt && (!userId || d?.user_id === userId))
    .sort((a, b) => String(b.acquisitionDate || b.createdAt || '').localeCompare(String(a.acquisitionDate || a.createdAt || '')));
}

// ── Consultas fiscales compraventa ─────────────────────────────────────────────

export function buildFiscalConsultationDocument(userId, data = {}, existing = null, businessId = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data._id || `fiscal:${uuidv4()}`;
  return {
    _id: id,
    type: 'fiscal_consultation',
    user_id: userId,
    business_id: businessId || data.business_id || existing?.business_id || null,
    vehicleId: normalizeOptionalText(data.vehicleId) || existing?.vehicleId || '',
    acquisitionId: normalizeOptionalText(data.acquisitionId) || existing?.acquisitionId || '',
    form: data.form || existing?.form || {},
    result: data.result || existing?.result || {},
    summary: data.summary || existing?.summary || {},
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deletedAt: existing?.deletedAt || null,
  };
}

export function sanitizeFiscalConsultation(doc) {
  if (!doc || doc.type !== 'fiscal_consultation' || doc.deletedAt) return null;
  return {
    id: doc._id,
    _rev: doc._rev,
    businessId: doc.business_id || undefined,
    vehicleId: doc.vehicleId || '',
    acquisitionId: doc.acquisitionId || '',
    form: doc.form || {},
    result: doc.result || {},
    summary: doc.summary || {},
    createdAt: doc.createdAt || doc.updatedAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
  };
}

export async function listFiscalConsultationsByUser(req, userId, businessId = null) {
  await ensureDatabase(req, VEHICLES_DB);
  const docs = await getAllDocuments(req, VEHICLES_DB);
  return docs
    .filter((d) => {
      if (d?.type !== 'fiscal_consultation' || d?.deletedAt) return false;
      if (userId && d?.user_id !== userId) return false;
      if (businessId && String(d?.business_id || '') !== String(businessId)) return false;
      return true;
    })
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}
