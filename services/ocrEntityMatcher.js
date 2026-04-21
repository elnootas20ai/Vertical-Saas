/**
 * OCR Entity Matcher — Matching automático de entidades extraídas por OCR
 * contra proveedores, clientes y trabajadores existentes en la BD.
 */

import {
  couchRequest,
  ensureDatabase,
  getAllDocuments,
  getCatalogDbName,
  getClientsDbName,
  getPayrollDbName,
} from './couchdb.js';
import logger from './logger.js';

const ACCOUNTS_DB = process.env.VITE_ACCOUNTS_DB || 'accounts';
const fakeReq = { headers: {} };

// ─── Normalización y similitud ───────────────────────────────────────────────

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarityScore(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;

  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 0;

  const dist = levenshtein(na, nb);
  const score = Math.round((1 - dist / maxLen) * 100);

  if (na.includes(nb) || nb.includes(na)) {
    return Math.max(score, 75);
  }

  return Math.max(0, score);
}

function cifMatch(a, b) {
  const ca = normalize(a).replace(/\s/g, '');
  const cb = normalize(b).replace(/\s/g, '');
  if (!ca || !cb) return false;
  return ca === cb;
}

// ─── Carga de entidades ─────────────────────────────────────────────────────

async function loadSuppliers(userId) {
  try {
    const db = getCatalogDbName();
    await ensureDatabase(fakeReq, db);
    const docs = await getAllDocuments(fakeReq, db);
    return docs.filter(
      (d) => d?.type === 'supplier' && !d?.deletedAt && d?.user_id === userId,
    );
  } catch {
    return [];
  }
}

async function loadClients(userId) {
  try {
    const db = getClientsDbName();
    await ensureDatabase(fakeReq, db);
    const docs = await getAllDocuments(fakeReq, db);
    return docs.filter(
      (d) => (d?.type === 'client' || d?.type === 'lead') && !d?.deletedAt && d?.user_id === userId,
    );
  } catch {
    return [];
  }
}

async function loadWorkers(userId) {
  try {
    await ensureDatabase(fakeReq, ACCOUNTS_DB);
    const docs = await getAllDocuments(fakeReq, ACCOUNTS_DB);
    return docs.filter(
      (d) => d?.type === 'account' && d?.role === 'worker' && !d?.deletedAt && d?.parentUserId === userId,
    );
  } catch {
    return [];
  }
}

// ─── Matching ────────────────────────────────────────────────────────────────

export async function matchSupplier(ocrEmitter, ocrCIF, userId) {
  const suppliers = await loadSuppliers(userId);
  if (suppliers.length === 0) return { matchType: 'supplier', confidence: 0, matchedEntity: null, candidates: [], suggestNew: true };

  const scored = suppliers.map((s) => {
    let score = 0;

    if (ocrCIF && s.cif && cifMatch(ocrCIF, s.cif)) {
      score = 98;
    } else {
      const nameScore = similarityScore(ocrEmitter, s.name);
      const emailScore = ocrEmitter && s.email ? similarityScore(ocrEmitter, s.email) : 0;
      score = Math.max(nameScore, emailScore);
    }

    return { entity: s, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const candidates = scored.filter((s) => s.score >= 40).slice(0, 5).map((s) => ({
    _id: s.entity._id,
    name: s.entity.name,
    cif: s.entity.cif || '',
    confidence: s.score,
  }));

  return {
    matchType: 'supplier',
    confidence: best.score,
    matchedEntity: best.score >= 50 ? {
      _id: best.entity._id,
      name: best.entity.name,
      cif: best.entity.cif || '',
      email: best.entity.email || '',
    } : null,
    candidates,
    suggestNew: best.score < 50,
  };
}

export async function matchClient(ocrReceiver, ocrCIF, userId) {
  const clients = await loadClients(userId);
  if (clients.length === 0) return { matchType: 'client', confidence: 0, matchedEntity: null, candidates: [], suggestNew: true };

  const scored = clients.map((c) => {
    let score = 0;

    if (ocrCIF && c.nif && cifMatch(ocrCIF, c.nif)) {
      score = 98;
    } else if (ocrCIF && c.cif && cifMatch(ocrCIF, c.cif)) {
      score = 98;
    } else {
      const nameScore = similarityScore(ocrReceiver, c.name);
      const emailScore = ocrReceiver && c.email ? similarityScore(ocrReceiver, c.email) : 0;
      score = Math.max(nameScore, emailScore);
    }

    return { entity: c, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const candidates = scored.filter((s) => s.score >= 40).slice(0, 5).map((s) => ({
    _id: s.entity._id,
    name: s.entity.name,
    cif: s.entity.nif || s.entity.cif || '',
    confidence: s.score,
  }));

  return {
    matchType: 'client',
    confidence: best.score,
    matchedEntity: best.score >= 50 ? {
      _id: best.entity._id,
      name: best.entity.name,
      cif: best.entity.nif || best.entity.cif || '',
      email: best.entity.email || '',
    } : null,
    candidates,
    suggestNew: best.score < 50,
  };
}

export async function matchWorker(ocrWorkerName, ocrWorkerDNI, userId) {
  const workers = await loadWorkers(userId);
  if (workers.length === 0) return { matchType: 'worker', confidence: 0, matchedEntity: null, candidates: [], suggestNew: false };

  const scored = workers.map((w) => {
    let score = 0;
    const workerName = w.displayName || w.name || `${w.firstName || ''} ${w.lastName || ''}`.trim();

    if (ocrWorkerDNI && w.dni && cifMatch(ocrWorkerDNI, w.dni)) {
      score = 99;
    } else {
      score = similarityScore(ocrWorkerName, workerName);
    }

    return { entity: w, workerName, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const candidates = scored.filter((s) => s.score >= 40).slice(0, 5).map((s) => ({
    _id: s.entity._id,
    name: s.workerName,
    dni: s.entity.dni || '',
    confidence: s.score,
  }));

  return {
    matchType: 'worker',
    confidence: best.score,
    matchedEntity: best.score >= 50 ? {
      _id: best.entity._id,
      name: best.workerName,
      dni: best.entity.dni || '',
      email: best.entity.email || '',
    } : null,
    candidates,
    suggestNew: false,
  };
}

/**
 * Main entry: match entities based on OCR result and document type.
 */
export async function matchEntities(ocrResult, userId) {
  const docType = ocrResult?.documentType || '';
  const results = [];

  const laborTypes = ['nomina', 'contrato_laboral', 'certificado_laboral', 'baja_it'];
  const supplierTypes = ['factura_proveedor', 'albaran'];
  const clientTypes = ['factura_cliente', 'documento_cliente', 'presupuesto'];

  if (laborTypes.includes(docType) && (ocrResult.workerName || ocrResult.workerDNI)) {
    const match = await matchWorker(ocrResult.workerName, ocrResult.workerDNI, userId);
    results.push(match);
  }

  if (supplierTypes.includes(docType) || ocrResult.emitter) {
    const match = await matchSupplier(ocrResult.emitter, ocrResult.emitterCIF, userId);
    results.push(match);
  }

  if (clientTypes.includes(docType) || ocrResult.receiver) {
    const match = await matchClient(ocrResult.receiver, ocrResult.receiverCIF, userId);
    results.push(match);
  }

  if (results.length === 0 && ocrResult.emitter) {
    const match = await matchSupplier(ocrResult.emitter, ocrResult.emitterCIF, userId);
    results.push(match);
  }

  logger.info({ tag: 'OCR-MATCH', docType, matchCount: results.length, topConfidence: results[0]?.confidence }, 'Entity matching done');
  return results;
}
