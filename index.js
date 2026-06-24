import './config/env.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import fs from 'node:fs';
import logger from './services/logger.js';
import { runHuellaIndexer } from './index-huella.js';

// SEC-02: Red de seguridad para que un fallo aislado no tumbe el proceso.
// Antes de esto, una promesa rechazada sin .catch() o un throw fuera de try
// hacía que Node se reiniciara (o, peor, se quedara en estado indefinido)
// y el VPS dejaba de aceptar `/api/*`. Ahora se loguea y se sigue sirviendo.
process.on('unhandledRejection', (reason) => {
  logger.error(
    { tag: 'PROCESS', kind: 'unhandledRejection', reason: reason?.stack || reason?.message || String(reason) },
    'Promise rechazada sin .catch — el proceso continúa',
  );
});
process.on('uncaughtException', (err) => {
  logger.error(
    { tag: 'PROCESS', kind: 'uncaughtException', err: err?.message, stack: err?.stack },
    'Excepción no capturada — el proceso continúa',
  );
});
process.on('warning', (warning) => {
  logger.warn(
    { tag: 'PROCESS', name: warning?.name, message: warning?.message },
    'process warning',
  );
});
import { authRouter } from './routers/authRouter.js';
import { businessRouter } from './routers/businessRouter.js';
import { groupRouter } from './routers/groupRouter.js';
import { notificationRouter } from './routers/notificationRouter.js';
import { vehicleRouter } from './routers/vehicleRouter.js';
import { tokenRouter } from './routers/tokenRouter.js';
import { publicApiRouter } from './routers/publicApiRouter.js';
import { docsRouter } from './routers/docsRouter.js';
import { webhooksRouter } from './routers/webhooksRouter.js';
import { salesRouter } from './routers/salesRouter.js';
import { salesMetricsRouter } from './routers/salesMetricsRouter.js';
import { reservationRouter } from './routers/reservationRouter.js';
import { leadsRouter } from './routers/leadsRouter.js';
import { clientsRouter } from './routers/clientsRouter.js';
import { financeRouter } from './routers/financeRouter.js';
import { bankReconciliationRouter } from './routers/bankReconciliationRouter.js';
import { invoicesRouter } from './routers/invoicesRouter.js';
import { documentsRouter } from './routers/documentsRouter.js';
import { locationsRouter } from './routers/locationsRouter.js';
import { emailRouter } from './routers/emailRouter.js';
import { embedRouter } from './routers/embedRouter.js';
import { sseRouter } from './routers/sseRouter.js';
import { pushRouter } from './routers/pushRouter.js';
import { workflowsRouter } from './routers/workflowsRouter.js';
import { portalRouter } from './routers/portalRouter.js';
import { runWorkflowsForUser, WORKFLOWS_DB } from './controllers/workflowsController.js';
import { crmSegmentsRouter } from './routers/crmSegmentsRouter.js';
import { leadAssignmentRouter } from './routers/leadAssignmentRouter.js';
import { crmRouter } from './routers/crmRouter.js';
import { runLeadEngineForUser } from './controllers/leadAssignmentController.js';
import { fleetRouter } from './routers/fleetRouter.js';
import { supplierInvoiceRouter } from './routers/supplierInvoiceRouter.js';
import { tradeInRouter } from './routers/tradeInRouter.js';
import { preparationExpenseRouter } from './routers/preparationExpenseRouter.js';
import { appointmentsRouter } from './routers/appointmentsRouter.js';
import { bookingRouter } from './routers/bookingRouter.js';
import { workshopRouter } from './routers/workshopRouter.js';
import { deliveryRouter } from './routers/deliveryRouter.js';
import { deliveryCrmRouter } from './routers/deliveryCrmRouter.js';
import { webhookRouter } from './routers/integrationWebhookRouter.js';
import { brandRouter } from './routers/brandRouter.js';
import { cleaningRouter } from './routers/cleaningRouter.js';
import { cleaningContractRouter } from './routers/cleaningContractRouter.js';
import { cleaningHubRouter } from './routers/cleaningHubRouter.js';
import { cleaningBillingRouter } from './routers/cleaningBillingRouter.js';
import { cleaningMaterialsRouter } from './routers/cleaningMaterialsRouter.js';
import { constructionRouter } from './routers/constructionRouter.js';
import { webPublicRouter, webProtectedRouter } from './routers/webRouter.js';
import { gdprRouter } from './routers/gdprRouter.js';
import { settingsRouter } from './routers/settingsRouter.js';
import { subscriptionRouter } from './routers/subscriptionRouter.js';
import { chatRouter } from './routers/chatRouter.js';
import { orgchartRouter } from './routers/orgchartRouter.js';
import { clockinsRouter } from './routers/clockinsRouter.js';
import { clockinAlertsRouter } from './routers/clockinAlertsRouter.js';
import { teamAlertsRouter } from './routers/teamAlertsRouter.js';
import { salaRouter } from './routers/salaRouter.js';
import { cleaningClientsRouter } from './routers/cleaningClientsRouter.js';
import { ocrApiRouter } from './routers/ocrRouter.js';
import aiParserRouter from './routers/aiParserRouter.js';
import { affiliateRouter } from './routers/affiliateRouter.js';
import { quoteRouter } from './routers/quoteRouter.js';
import { catalogConfigRouter } from './routers/catalogConfigRouter.js';
import { purchaseOrderRouter } from './routers/purchaseOrderRouter.js';
import { stockMovementRouter } from './routers/stockMovementRouter.js';
import { warehouseRouter } from './routers/warehouseRouter.js';
import { alertRouter } from './routers/alertRouter.js';
import { recipeRouter } from './routers/recipeRouter.js';
import { wasteRouter } from './routers/wasteRouter.js';
import { stockCountRouter } from './routers/stockCountRouter.js';
import { butcherRouter } from './routers/butcherRouter.js';
import { deliveryAlertRouter } from './routers/deliveryAlertRouter.js';
import { deliveryReportsRouter } from './routers/deliveryReportsRouter.js';
import { compraventaAlertRouter } from './routers/compraventaAlertRouter.js';
import { signatureRouter } from './routers/signatureRouter.js';
import { scrapyardRouter } from './routers/scrapyardRouter.js';
import { opportunitiesRouter } from './routers/opportunitiesRouter.js';
import { vehicleAcquisitionRouter } from './routers/vehicleAcquisitionRouter.js';
import { compraventaRouter } from './routers/compraventaRouter.js';
import { butcherClientsRouter } from './routers/butcherClientsRouter.js';
import { butcherOrdersRouter } from './routers/butcherOrdersRouter.js';
import { butcherSalesRouter } from './routers/butcherSalesRouter.js';
import {
  viewSignaturePublic,
  acceptSignaturePublic,
  rejectSignaturePublic,
} from './controllers/signatureController.js';
import { setupProgressRouter } from './routers/setupProgressRouter.js';
import { workerPerformanceRouter } from './routers/workerPerformanceRouter.js';
import { scrapyardSalesRouter } from './routers/scrapyardSalesRouter.js';
import scrapyardAlertRouter from './routers/scrapyardAlertRouter.js';
import { adminMoneiRouter } from './routers/adminMoneiRouter.js';
import {
  canEmitCatalogStockAlerts,
  filterStockTrackedCatalogItems,
  filterStockTrackedParts,
  hasPartsStockSetup,
} from './services/stockAlertUtils.js';
import {
  canEmitCrmAlerts,
  canEmitFinanceAlerts,
  canEmitHrAlerts,
  canEmitVehicleAlerts,
} from './services/moduleAlertUtils.js';
import { startAlertEngine } from './services/alertEngine.js';
import { startButcherAlertEngine } from './services/butcherAlertEngine.js';
import { startConstructionAlertEngine } from './services/constructionAlertEngine.js';
import { startDeliveryAlertEngine } from './services/deliveryAlertEngine.js';
import { startCleaningAlertEngine } from './services/cleaningAlertEngine.js';
import { startSupplierInvoicePolling } from './services/supplierInvoiceScheduler.js';
import { runAutoOrdersForAllUsers } from './services/autoOrderService.js';
import { startSubscriptionLifecycle } from './services/subscriptionLifecycle.js';
import { createVerticalRouter } from './services/verticalCrudFactory.js';
import { allVerticalConfigs } from './verticalConfigs/all.js';
import { requireAuthAndEmailVerified } from './middleware/auth.js';
import { apiLimiter, planAwareLimiter, burstLimiter, sensitiveOpLimiter, getAbuseStats } from './middleware/rateLimiter.js';
import { correlationIdMiddleware } from './middleware/correlationId.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { activityLogger } from './middleware/activityLogger.js';
import { runHealthCheck, recordLatency } from './services/healthService.js';
import { sendAdminAlert } from './services/adminAlerts.js';
import { closeAllSSEClients } from './services/sseService.js';
import {
  isClockinsDb,
  filterClockinsDocsForRequester,
  assertClockinDocReadAccess,
  validateClockinDocWrite,
} from './middleware/couchClockinsGuard.js';
import { validateWorkCenterEntitlementWrite } from './services/entitlementEnforcement.js';

const _5xxTimes = [];
const _5xxAlertSkipPaths = [
  '/health',
  '/api/push/vapid-public-key',
];
function shouldSkip5xxAlert(url) {
  const path = String(url || '').split('?')[0];
  return _5xxAlertSkipPaths.some((p) => path === p || path.endsWith(p));
}
function track5xxAndMaybeAlert(url) {
  if (shouldSkip5xxAlert(url)) return;
  const now = Date.now();
  const windowMs = Number(process.env.ALERT_5XX_WINDOW_MS || 60_000);
  const threshold = Number(process.env.ALERT_5XX_THRESHOLD || 10);
  while (_5xxTimes.length && now - _5xxTimes[0] > windowMs) _5xxTimes.shift();
  _5xxTimes.push(now);
  if (_5xxTimes.length >= threshold) {
    _5xxTimes.length = 0;
    sendAdminAlert({
      key: 'spike_5xx',
      subject: `🚨 Vertial: pico de errores 5xx (>=${threshold}/min)`,
      html: `<p><b>Pico de errores 5xx</b></p><ul><li>umbral: ${threshold} / ${Math.round(windowMs / 1000)}s</li><li>última url: ${escapeHtml(url)}</li></ul>`,
      cooldownMs: Number(process.env.ALERT_5XX_COOLDOWN_MS || 10 * 60_000),
    }).catch(() => null);
  }
}
import * as cacheService from './services/cache.js';
import { cacheResponse, invalidateOnWrite } from './middleware/cache.js';
import { startBackupScheduler, runBackup, getBackupState } from './services/backupScheduler.js';
import { runSaasBootstrapIfEnabled } from './services/saasBootstrapStartup.js';
import {
  VEHICLES_DB,
  ACCOUNTS_DB,
  NOTIFICATIONS_DB,
  setupDatabaseIndexes,
  ensureDesignDocument,
  queryView,
  queryChangelog,
  writeChangelog,
  ensureDatabase,
  getAllDocuments,
  putDocument,
  VEHICLES_DESIGN_VIEWS,
  ACCOUNTS_DESIGN_VIEWS,
  NOTIFICATIONS_DESIGN_VIEWS,
  getCouchConfig as getCouchConfigFromService,
  waitForCouchDbReady,
  getWorkshopDbName,
  getFinanceDbName,
  getClockinsDbName,
  getCatalogDbName,
  getPartsDbName,
  getLeadsDbName as getLeadsDbNameFromService,
  couchRequest,
  buildCouchAuthHeader,
} from './services/couchdb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
// SEC-03: CORS restrictivo con whitelist de dominios configurada via ALLOWED_ORIGINS.
// Los orígenes base se infieren del entorno para evitar acoplar el código a un dominio fijo.
const CORE_ALLOWED_ORIGINS = [
  process.env.APP_URL,
  process.env.VITE_API_URL,
].filter(Boolean);
const ALLOWED_ORIGINS = Array.from(
  new Set([
    ...CORE_ALLOWED_ORIGINS,
    ...(process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  ]),
);

const TRUSTED_ORIGIN_SUFFIXES = (process.env.ALLOWED_ORIGIN_SUFFIXES || '')
  .split(',')
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);

function isTrustedConfiguredOrigin(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return TRUSTED_ORIGIN_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.includes(origin) || isTrustedConfiguredOrigin(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (ALLOWED_ORIGINS.length === 0) {
    // Sin lista configurada solo se permite el mismo host (localhost dev)
    res.setHeader('Access-Control-Allow-Origin', req.headers.host ? `http://${req.headers.host}` : '');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-api-version',
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return next();
});

// I-07: Correlation ID — asigna X-Request-ID único por petición y lo propaga
// a través de AsyncLocalStorage para trazabilidad end-to-end en logs.
app.use(correlationIdMiddleware);

// Liveness mínima (Docker/proxy): sin CouchDB ni chequeos pesados — evita RST si /health tarda o falla.
app.get('/live', (_req, res) => {
  res.status(200).json({ ok: true, service: 'express-backend', time: new Date().toISOString() });
});

// I-03b: Health "exterior" servido a través de nginx (/api/*). Igual de barato que /live
// (no toca CouchDB) pero accesible desde fuera del VPS: lo usa UptimeRobot/BetterStack
// y cualquier monitor externo para detectar caídas como la del invite+team-login.
// Para health profundo (CouchDB, latencia, disco…) sigue usándose /health internamente.
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'vertial-backend',
    uptime: Number(process.uptime().toFixed(2)),
    time: new Date().toISOString(),
  });
});

// B-02: Cabecera de versión de API en todas las respuestas.
// El cliente puede leer X-API-Version para detectar la versión activa.
app.use((req, res, next) => {
  res.setHeader('X-API-Version', '2');
  next();
});

const metrics = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  successRequests: 0,
  errorRequests: 0,
  bytesIn: 0,
  bytesOut: 0,
  peakRssBytes: 0,
  peakHeapUsedBytes: 0,
};

const uniqueVisitors = new Set();
const activeSockets = new Set();

function bytesToMB(bytes) {
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

function getClientIp(req) {
  const header = req.headers['x-forwarded-for'];
  if (typeof header === 'string' && header.length > 0) {
    return header.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function normalizeDbName(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_$()+/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const CALLS_DB_NAME = normalizeDbName(
  process.env.VITE_CALLS_DB || `${process.env.VITE_COUCHDB_DB || 'vertial'}-calls`,
);

function getAiConfig() {
  return {
    openAiApiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_KEY || '',
    openAiBaseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
    summaryModel: process.env.OPENAI_SUMMARY_MODEL || 'gpt-4o-mini',
    replicateToken: process.env.REPLICATE_API_TOKEN || '',
    replicateModel: process.env.REPLICATE_TRANSCRIBE_MODEL || 'openai/gpt-4o-transcribe',
    replicateInputField: process.env.REPLICATE_TRANSCRIBE_INPUT_FIELD || 'audio',
  };
}

function sanitizeAttachmentName(fileName, mimeType) {
  const safeName = String(fileName || 'audio')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (safeName && /\.[a-z0-9]+$/i.test(safeName)) {
    return safeName;
  }

  const extension =
    {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/mp4': 'mp4',
      'audio/wav': 'wav',
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/x-m4a': 'm4a',
      'audio/aac': 'aac',
    }[String(mimeType || '').toLowerCase()] || 'webm';

  return `${safeName || 'audio'}.${extension}`;
}

function stripDataUrlPrefix(value) {
  return String(value || '').replace(/^data:[^;]+;base64,/, '');
}

function getTextFromOpenAiResponse(payload) {
  const directText = payload?.choices?.[0]?.message?.content;
  if (typeof directText === 'string') {
    return directText.trim();
  }

  if (Array.isArray(directText)) {
    return directText
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (item && typeof item === 'object' && typeof item.text === 'string') {
          return item.text;
        }
        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

function safeParseJsonObject(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (_error) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (_nestedError) {
        return null;
      }
    }
    return null;
  }
}

function normalizeAiAnalysis(transcript, analysis) {
  const keyPoints = Array.isArray(analysis?.keyPoints)
    ? analysis.keyPoints.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const nextSteps = Array.isArray(analysis?.nextSteps)
    ? analysis.nextSteps.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const mentionedVehicles = Array.isArray(analysis?.variables?.mentionedVehicles)
    ? analysis.variables.mentionedVehicles.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  return {
    objective: String(analysis?.objective || 'Analizar la llamada del cliente').trim(),
    summary: String(analysis?.summary || transcript.slice(0, 400)).trim(),
    keyPoints,
    nextSteps,
    variables: {
      intent: String(analysis?.variables?.intent || 'general').trim(),
      sentiment: String(analysis?.variables?.sentiment || 'neutral').trim(),
      urgency: String(analysis?.variables?.urgency || 'media').trim(),
      appointmentRequested: Boolean(analysis?.variables?.appointmentRequested),
      financingInterest: Boolean(analysis?.variables?.financingInterest),
      tradeInInterest: Boolean(analysis?.variables?.tradeInInterest),
      mentionedVehicles,
      language: String(analysis?.variables?.language || 'es').trim(),
    },
  };
}

function buildFallbackCallAnalysis(transcript) {
  const normalizedTranscript = String(transcript || '').trim();
  const lines = normalizedTranscript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sentences = normalizedTranscript
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return normalizeAiAnalysis(normalizedTranscript, {
    objective: sentences[0] || 'Analizar la llamada del cliente',
    summary: sentences.slice(0, 3).join(' ') || normalizedTranscript.slice(0, 400),
    keyPoints: (sentences.length ? sentences : lines).slice(0, 4),
    nextSteps: [],
    variables: {
      intent: /prueba|cita|visita/i.test(normalizedTranscript) ? 'concertar cita' : 'consulta',
      sentiment: /interes|gracias|perfecto|bien/i.test(normalizedTranscript) ? 'positivo' : 'neutral',
      urgency: /hoy|urgente|cuanto antes/i.test(normalizedTranscript) ? 'alta' : 'media',
      appointmentRequested: /prueba|cita|visita/i.test(normalizedTranscript),
      financingInterest: /financi/i.test(normalizedTranscript),
      tradeInInterest: /tasaci|entrega|coche actual|veh[ií]culo actual/i.test(normalizedTranscript),
      mentionedVehicles: Array.from(
        new Set(
          (normalizedTranscript.match(/\b(?:bmw|audi|mercedes|volkswagen|toyota|ford|seat|cupra|peugeot|renault)[^.,\n]*/gi) || [])
            .map((item) => item.trim()),
        ),
      ),
      language: 'es',
    },
  });
}

async function getCouchDocument(req, dbName, docId) {
  const response = await couchRequest(
    req,
    `/${encodeURIComponent(dbName)}/${encodeURIComponent(docId)}`,
  );

  if (response.status === 404) {
    return null;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.reason || payload?.error || 'Error obteniendo documento en CouchDB');
  }

  return payload;
}

async function transcribeAudioWithOpenAi({ audioBuffer, mimeType, fileName, language }) {
  const cfg = getAiConfig();
  if (!cfg.openAiApiKey) {
    throw new Error('Falta OPENAI_API_KEY para transcribir audio');
  }

  const form = new FormData();
  form.append('model', cfg.transcriptionModel);
  form.append('response_format', 'json');
  if (language) {
    form.append('language', String(language));
  }
  form.append('file', new Blob([audioBuffer], { type: mimeType || 'audio/webm' }), fileName || 'audio.webm');

  const response = await fetch(`${cfg.openAiBaseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.openAiApiKey}`,
    },
    body: form,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Error transcribiendo audio con OpenAI');
  }

  return String(payload?.text || '').trim();
}

function isReplicateCompleted(status) {
  return ['successful', 'succeeded', 'failed', 'canceled'].includes(String(status || '').toLowerCase());
}

async function pollReplicatePrediction(getUrl, headers) {
  if (!getUrl) {
    throw new Error('Replicate no devolvio URL de seguimiento');
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(getUrl, { headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.detail || payload?.error || 'Error consultando prediccion en Replicate');
    }
    if (isReplicateCompleted(payload?.status)) {
      return payload;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error('Replicate tardo demasiado en completar la transcripcion');
}

function extractReplicateOutputText(output) {
  if (typeof output === 'string') {
    return output.trim();
  }

  if (Array.isArray(output)) {
    return output.map((item) => extractReplicateOutputText(item)).filter(Boolean).join('\n').trim();
  }

  if (output && typeof output === 'object') {
    if (typeof output.text === 'string') {
      return output.text.trim();
    }
    if (typeof output.transcript === 'string') {
      return output.transcript.trim();
    }
    if (Array.isArray(output.segments)) {
      return output.segments
        .map((segment) => String(segment?.text || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
    }
  }

  return '';
}

async function transcribeAudioWithReplicate({ dataUrl, language }) {
  const cfg = getAiConfig();
  if (!cfg.replicateToken) {
    throw new Error('Falta REPLICATE_API_TOKEN para transcribir audio');
  }

  const headers = {
    Authorization: `Bearer ${cfg.replicateToken}`,
    'Content-Type': 'application/json',
    Prefer: 'wait=60',
  };

  const response = await fetch(
    `https://api.replicate.com/v1/models/${cfg.replicateModel}/predictions`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input: {
          [cfg.replicateInputField]: dataUrl,
          ...(language ? { language } : {}),
        },
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.detail || payload?.error || 'Error transcribiendo audio con Replicate');
  }

  const prediction = isReplicateCompleted(payload?.status)
    ? payload
    : await pollReplicatePrediction(payload?.urls?.get, {
        Authorization: `Bearer ${cfg.replicateToken}`,
      });

  if (!['successful', 'succeeded'].includes(String(prediction?.status || '').toLowerCase())) {
    throw new Error(prediction?.error || 'Replicate no completo la transcripcion');
  }

  const text = extractReplicateOutputText(prediction?.output);
  if (!text) {
    throw new Error('Replicate no devolvio texto de transcripcion');
  }

  return text;
}

async function summarizeTranscriptionWithOpenAi({ transcript, clientName, clientPhone, direction }) {
  const cfg = getAiConfig();
  if (!cfg.openAiApiKey) {
    return buildFallbackCallAnalysis(transcript);
  }

  const response = await fetch(`${cfg.openAiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.summaryModel,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Eres un analista comercial de llamadas de concesionario. Devuelve solo JSON valido con las claves objective, summary, keyPoints, nextSteps y variables. variables debe incluir intent, sentiment, urgency, appointmentRequested, financingInterest, tradeInInterest, mentionedVehicles y language. Responde siempre en espanol.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            clientName,
            clientPhone,
            direction,
            transcript,
          }),
        },
      ],
      temperature: 0.2,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return buildFallbackCallAnalysis(transcript);
  }

  const parsed = safeParseJsonObject(getTextFromOpenAiResponse(payload));
  if (!parsed || typeof parsed !== 'object') {
    return buildFallbackCallAnalysis(transcript);
  }

  return normalizeAiAnalysis(transcript, parsed);
}

app.use((req, res, next) => {
  const startedAtMs = Date.now();
  const ip = getClientIp(req);

  let bytesIn = 0;
  const contentLength = req.headers['content-length'];
  if (contentLength) {
    bytesIn = Number(contentLength) || 0;
  }

  metrics.totalRequests += 1;
  metrics.bytesIn += bytesIn;
  uniqueVisitors.add(ip);

  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  let bytesOut = 0;

  res.write = (chunk, encoding, callback) => {
    if (chunk) {
      bytesOut += Buffer.byteLength(chunk, encoding);
    }
    return originalWrite(chunk, encoding, callback);
  };

  res.end = (chunk, encoding, callback) => {
    if (chunk) {
      bytesOut += Buffer.byteLength(chunk, encoding);
    }
    metrics.bytesOut += bytesOut;

    if (res.statusCode >= 200 && res.statusCode < 400) {
      metrics.successRequests += 1;
    } else {
      metrics.errorRequests += 1;
    }

    const elapsedMs = Date.now() - startedAtMs;
    const ua = req.headers['user-agent'] || '-';
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    // I-03: Registrar latencia para el health check (P50/P95/P99)
    recordLatency(elapsedMs);

    // I-07: Incluir requestId en todos los logs de request
    logger[level]({
      tag: 'REQ',
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: elapsedMs,
      bytesIn,
      bytesOut,
      ip,
      ua,
    });

    if (res.statusCode >= 500) {
      try {
        track5xxAndMaybeAlert(req.originalUrl);
      } catch {
        // noop
      }
    }

    return originalEnd(chunk, encoding, callback);
  };

  next();
});

// I-03: Health check robusto — CouchDB, DBs individuales, memoria, disco,
//        proceso (loadAvg), conexiones activas y latencia P50/P95/P99.
app.get('/health', async (req, res) => {
  try {
    const cfg        = getCouchConfigFromService(req);
    const authHeader = buildCouchAuthHeader(req);

    const result = await runHealthCheck({
      baseUrl:       cfg.baseUrl,
      authHeader,
      activeSockets: activeSockets.size,
    });

    if (!result.ok) {
      logger.error({ tag: 'HEALTH', requestId: req.requestId }, 'Health check crítico — servicio degradado');
    } else if (result.degraded) {
      logger.warn({ tag: 'HEALTH', requestId: req.requestId }, 'Health check con advertencias');
    }

    res.status(result.ok ? 200 : 503).json(result);
  } catch (err) {
    logger.error({ tag: 'HEALTH', requestId: req.requestId, err: err?.message }, 'Excepción en /health');
    res.status(503).json({
      ok: false,
      service: 'express-backend',
      error: err instanceof Error ? err.message : 'health_failed',
      time: new Date().toISOString(),
    });
  }
});

app.get('/metrics', (req, res) => {
  const mem = process.memoryUsage();
  metrics.peakRssBytes = Math.max(metrics.peakRssBytes, mem.rss);
  metrics.peakHeapUsedBytes = Math.max(metrics.peakHeapUsedBytes, mem.heapUsed);

  res.json({
    uptimeSeconds: Number(process.uptime().toFixed(2)),
    memoryMB: {
      rss: bytesToMB(mem.rss),
      heapTotal: bytesToMB(mem.heapTotal),
      heapUsed: bytesToMB(mem.heapUsed),
      external: bytesToMB(mem.external),
      arrayBuffers: bytesToMB(mem.arrayBuffers),
      peakRss: bytesToMB(metrics.peakRssBytes),
      peakHeapUsed: bytesToMB(metrics.peakHeapUsedBytes),
    },
    traffic: {
      requestsTotal: metrics.totalRequests,
      requestsOk: metrics.successRequests,
      requestsError: metrics.errorRequests,
      inMB: bytesToMB(metrics.bytesIn),
      outMB: bytesToMB(metrics.bytesOut),
      inBytes: metrics.bytesIn,
      outBytes: metrics.bytesOut,
    },
    cache: cacheService.getStats(),
    users: {
      connectedSockets: activeSockets.size,
      uniqueVisitors: uniqueVisitors.size,
      ipsPreview: Array.from(uniqueVisitors).slice(0, 20),
    },
    startedAt: metrics.startedAt,
    now: new Date().toISOString(),
  });
});

app.get('/api/stats', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    message: 'Backend activo',
    mb: {
      rss: bytesToMB(mem.rss),
      heapUsed: bytesToMB(mem.heapUsed),
    },
    trafficMB: {
      in: bytesToMB(metrics.bytesIn),
      out: bytesToMB(metrics.bytesOut),
    },
    usersConnected: activeSockets.size,
    cache: cacheService.getStats(),
  });
});

app.get('/api/cache/stats', (req, res) => {
  res.json({ ok: true, cache: cacheService.getStats() });
});

app.post('/api/cache/clear', requireAuthAndEmailVerified, (req, res) => {
  const role = req.authUser?.role;
  if (!['Admin', 'Gerente'].includes(role)) {
    return res.status(403).json({ ok: false, error: 'Se requiere rol Admin o Gerente' });
  }
  cacheService.clear();
  return res.json({ ok: true, message: 'Caché limpiada correctamente' });
});

// Activity logger — registra todas las peticiones API en CouchDB (activity-logs)
app.use(activityLogger);

// ─── API interna (autenticada) ────────────────────────────────────────────────
// B-09: planAwareLimiter aplica límites según el plan del usuario autenticado.
// I-06: burstLimiter se monta antes de planAwareLimiter para detener ráfagas cortas.
// B-02: Cada ruta se monta en /api/* (v1 legacy) y /api/v2/* (versión estable actual).

app.use('/api/auth', authRouter);

// OT pública: estado de orden de trabajo sin autenticación
app.get('/api/workshop/public/:workOrderId', async (req, res) => {
  try {
    const workOrderId = String(req.params.workOrderId || '').trim();
    if (!workOrderId) return res.status(400).json({ ok: false, error: 'Falta workOrderId' });

    const db = getWorkshopDbName();
    const encodedDb = encodeURIComponent(db);
    const encodedId = encodeURIComponent(workOrderId);
    const response = await couchRequest(req, `/${encodedDb}/${encodedId}`);
    if (response.status === 404) return res.status(404).json({ ok: false, error: 'Orden no encontrada' });
    const doc = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ ok: false, error: 'Error al cargar la orden' });
    if (!doc || doc.type !== 'work_order' || doc.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Orden no encontrada' });
    }

    const workOrder = {
      _id: doc._id,
      woNumber: doc.woNumber || '',
      vehicleBrand: doc.vehicleBrand || '',
      vehicleModel: doc.vehicleModel || '',
      vehiclePlate: doc.vehiclePlate || '',
      vehicleMileage: Number(doc.vehicleMileage || 0),
      clientName: doc.clientName || '',
      clientPhone: doc.clientPhone || '',
      status: doc.status || 'pending',
      serviceType: doc.serviceType || 'revision',
      description: doc.description || '',
      responsible: doc.responsible || '',
      estimatedCompletion: doc.estimatedCompletion || '',
      stageHistory: Array.isArray(doc.stageHistory) ? doc.stageHistory : [],
      createdAt: doc.createdAt || '',
      updatedAt: doc.updatedAt || '',
    };

    return res.json({ ok: true, workOrder });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al cargar orden' });
  }
});

const internalRouters = [
  ['/api/businesses',    requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, businessRouter],
  ['/api/orgchart',      requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, orgchartRouter],
  ['/api/clockins',        requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, clockinsRouter],
  ['/api/clockin-alerts',  requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, clockinAlertsRouter],
  ['/api/team-alerts',     requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, teamAlertsRouter],
  ['/api/groups',        requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, groupRouter],
  ['/api/notifications', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, notificationRouter],
  ['/api/vehicles',      requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, vehicleRouter],
  ['/api/fleet',         requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, fleetRouter],
  ['/api/tradeins',      requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, tradeInRouter],
  ['/api/sales',         requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, salesRouter],
  ['/api/sales-metrics', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, salesMetricsRouter],
  ['/api/reservations',  requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, reservationRouter],
  ['/api/leads',          requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, leadsRouter],
  ['/api/clients',        requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, clientsRouter],
  ['/api/crm/segments',   requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, crmSegmentsRouter],
  ['/api/crm/assignment', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, leadAssignmentRouter],
  ['/api/crm',            requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, crmRouter],
  ['/api/finance',               requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, financeRouter],
  ['/api/bank-reconciliation',   requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, bankReconciliationRouter],
  ['/api/invoices',              requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, invoicesRouter],
  ['/api/documents',     requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, documentsRouter],
  ['/api/locations',     requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, locationsRouter],
  ['/api/workshop',      requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, workshopRouter],
  ['/api/brands',        requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, brandRouter],
  ['/api/delivery',      requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, deliveryRouter],
  ['/api/sala',           requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, salaRouter],
  ['/api/delivery-crm',  requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, deliveryCrmRouter],
  ['/api/cleaning',      requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, cleaningRouter],
  ['/api/cleaning/clients',   requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, cleaningClientsRouter],
  ['/api/cleaning/contracts', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, cleaningContractRouter],
  ['/api/cleaning/billing',   requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, cleaningBillingRouter],
  ['/api/cleaning/hub',        requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, cleaningHubRouter],
  ['/api/cleaning/materials',  requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, cleaningMaterialsRouter],
  ...allVerticalConfigs.map(cfg => [`/api/${cfg.name}`, requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, createVerticalRouter(cfg)]),
  ['/api/construction',   requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, constructionRouter],
  ['/api/email',         requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, emailRouter],
  ['/api/gdpr',          requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, gdprRouter],
  ['/api/chat',          requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, chatRouter],
  ['/api/catalog-config', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, catalogConfigRouter],
  ['/api/purchase-orders', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, purchaseOrderRouter],
  ['/api/supplier-invoices', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, supplierInvoiceRouter],
  ['/api/warehouses',       requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, warehouseRouter],
  ['/api/alerts',          requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, alertRouter],
  ['/api/butcher',         requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, butcherRouter],
  ['/api/delivery/alerts', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, deliveryAlertRouter],
  ['/api/delivery-reports', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, deliveryReportsRouter],
  ['/api/recipes',         requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, recipeRouter],
  ['/api/waste',           requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, wasteRouter],
  ['/api/stock-counts',    requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, stockCountRouter],
  ['/api/stock-movements', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, stockMovementRouter],
  ['/api/setup-progress',  requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, setupProgressRouter],
  ['/api/signatures',      requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, signatureRouter],
  ['/api/vehicle-acquisitions', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, vehicleAcquisitionRouter],
  ['/api/scrapyard/alerts', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, scrapyardAlertRouter],
  ['/api/scrapyard',       requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, scrapyardRouter],
  ['/api/compraventa',     requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, compraventaRouter],
  ['/api/compraventa/alerts', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, compraventaAlertRouter],
  ['/api/opportunities',   requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, opportunitiesRouter],
];

for (const [path, ...middlewares] of internalRouters) {
  // Ruta legacy /api/*
  app.use(path, ...middlewares);
  // B-02: Alias /api/v2/* — misma implementación, prefijo versionado
  app.use(path.replace('/api/', '/api/v2/'), ...middlewares);
}
// LEG-01/02: Panel RGPD — consentimientos, derechos y derecho al olvido

// ADM: Settings — branding, pipeline, email templates, horarios, export/import, impersonation, changelog
app.use('/api/settings', settingsRouter);
app.use('/api/v2/settings', settingsRouter);

// MONEI Subscriptions — rutas protegidas + webhooks públicos internos
app.use('/api/subscriptions', subscriptionRouter);
app.use('/api/v2/subscriptions', subscriptionRouter);

// Admin MONEI — panel de gestión de pagos (solo Admin)
app.use('/api/admin/monei', adminMoneiRouter);
app.use('/api/v2/admin/monei', adminMoneiRouter);

// API-01: Documentación interactiva Swagger/OpenAPI (pública, sin auth)
app.use('/api/docs', docsRouter);

// Afiliados — formulario público (sin auth)
app.use('/api/affiliate', affiliateRouter);

// Presupuestos — rutas públicas (accept/reject por token) + protegidas (envío)
app.use('/api/quotes', quoteRouter);

// API-03: Webhooks salientes (requiere JWT)
app.use('/api/webhooks', requireAuthAndEmailVerified, webhooksRouter);

// Webhooks ENTRANTES de plataformas delivery (Glovo, Just Eat, Uber Eats).
// SIN auth JWT: las plataformas autentican por `x-webhook-token` o `?token=` por negocio.
app.use('/api/delivery-webhooks', burstLimiter, webhookRouter);

// API pública v1 (requiere API Token Bearer)
app.use('/api/tokens', requireAuthAndEmailVerified, tokenRouter);
app.use('/api/v1', apiLimiter, publicApiRouter);
// WEB Storefront — rutas públicas (sin auth) + protegidas
app.use('/api/web', webPublicRouter);
app.use('/api/web', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, webProtectedRouter);

// CRM-01: Formulario embebible público (sin requireAuth — acceso por dealerId)
app.use('/api/appointments', requireAuthAndEmailVerified, appointmentsRouter);
app.use('/api/booking', bookingRouter);
app.use('/api/embed', embedRouter);
// CRM-02: Workflows de seguimiento automático
app.use('/api/workflows', requireAuthAndEmailVerified, workflowsRouter);

// CRM-08: Portal del cliente — acceso público por token
app.use('/api/portal', portalRouter);

// FD-02: Firma digital — rutas públicas (sin auth, validadas por token JWT del firmante)
app.get('/api/sign/view/:token', burstLimiter, viewSignaturePublic);
app.post('/api/sign/accept/:token', burstLimiter, acceptSignaturePublic);
app.post('/api/sign/reject/:token', burstLimiter, rejectSignaturePublic);

// V-09: Ficha pública de vehículo (sin auth)
app.get('/api/public/vehicle/:vehicleId', async (req, res) => {
  try {
    const vehicleId = String(req.params.vehicleId || '').trim();
    if (!vehicleId) return res.status(400).json({ ok: false, error: 'Falta vehicleId' });

    const encodedDb = encodeURIComponent('vehicles');
    const encodedId = encodeURIComponent(vehicleId);
    const response = await couchRequest(req, `/${encodedDb}/${encodedId}`);
    if (response.status === 404) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });
    const doc = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ ok: false, error: 'Error al cargar el vehículo' });
    if (!doc || doc.type !== 'car' || doc.active === false || doc.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Vehículo no disponible' });
    }

    const publicVehicle = {
      id: doc._id,
      brand: doc.brand || '',
      model: doc.model || '',
      version: doc.version || '',
      year: doc.year || 0,
      color: doc.color || '',
      fuelType: doc.fuelType,
      mileage: doc.mileage,
      transmission: doc.transmission,
      doors: doc.doors,
      power: doc.power,
      bodyType: doc.bodyType,
      salePrice: doc.salePrice,
      images: Array.isArray(doc.images) ? doc.images : [],
      notes: doc.notes,
      status: doc.status || 'available',
      registrationPlate: doc.registrationPlate ? doc.registrationPlate.replace(/.(?=.{3})/g, '*') : '',
    };

    return res.json({ ok: true, vehicle: publicVehicle });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al cargar vehículo' });
  }
});

// Plugin — Agent Hub: REMOVED (security hardening)

// OCR Transversal — procesamiento, clasificación y enrutamiento de documentos
app.use('/api/ocr', requireAuthAndEmailVerified, ocrApiRouter);

// AI Parser — procesamiento de texto libre con IA para módulos SaaS
app.use('/api/ai', requireAuthAndEmailVerified, aiParserRouter);

// RT-01: SSE — sin requireAuth middleware (usa JWT por query param)
app.use('/api/sse', sseRouter);

// RT-02: Web Push — suscripción y gestión de tokens push
// vapid-public-key se gestiona dentro del pushRouter sin requireAuth
app.use('/api/push', pushRouter);

// S-04: Rate limiting por usuario autenticado (no por IP — varios usuarios en la misma red).
app.use('/api/couch', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter);
app.use('/api/calls', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter);

// I-06: sensitiveOpLimiter — procesamiento de llamadas con IA es costoso (10/min por usuario)
app.post('/api/calls/process/:callId', sensitiveOpLimiter, async (req, res) => {
  try {
    const callId = String(req.params.callId || '').trim();
    const audioBase64 = stripDataUrlPrefix(req.body?.audioBase64);
    const mimeType = String(req.body?.audioContentType || 'audio/webm').trim();
    const fileName = sanitizeAttachmentName(req.body?.audioFileName, mimeType);
    const provider = String(req.body?.provider || 'openai').trim().toLowerCase();
    const userId = String(req.body?.userId || 'guest').trim() || 'guest';
    const clientName = String(req.body?.clientName || 'Contacto sin identificar').trim();
    const clientPhone = String(req.body?.clientPhone || '').trim();
    const direction = String(req.body?.direction || 'incoming').trim();
    const notes = String(req.body?.notes || '').trim();
    const language = String(req.body?.language || 'es').trim();
    const duration = Number(req.body?.duration || 0);
    const audioSize = Number(req.body?.audioSize || 0);

    if (!callId) {
      return res.status(400).json({ error: 'Falta callId para procesar la llamada' });
    }

    if (!audioBase64) {
      return res.status(400).json({ error: 'Falta el audio codificado en base64' });
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const dataUrl = `data:${mimeType};base64,${audioBase64}`;

    await couchRequest(req, `/${encodeURIComponent(CALLS_DB_NAME)}`, { method: 'PUT' }).catch(() => null);

    const existingDoc = await getCouchDocument(req, CALLS_DB_NAME, callId);
    const transcript =
      provider === 'replicate'
        ? await transcribeAudioWithReplicate({ dataUrl, language })
        : await transcribeAudioWithOpenAi({ audioBuffer, mimeType, fileName, language });
    const analysis = await summarizeTranscriptionWithOpenAi({
      transcript,
      clientName,
      clientPhone,
      direction,
    });

    const document = {
      _id: callId,
      _rev: existingDoc?._rev,
      type: 'call',
      user_id: userId,
      id: callId,
      clientName,
      clientPhone,
      direction,
      status: 'completed',
      duration: Number.isFinite(duration) ? duration : 0,
      date: existingDoc?.date || new Date().toISOString(),
      notes,
      transcriptionText: transcript,
      aiSummary: analysis,
      aiVariables: analysis.variables,
      hasAudio: true,
      hasTranscription: Boolean(transcript),
      hasAISummary: true,
      audio: {
        attachmentName: fileName,
        contentType: mimeType,
        size: audioSize || audioBuffer.length,
        uploadedAt: new Date().toISOString(),
      },
      createdAt: existingDoc?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transcriptionProvider: provider,
      summaryProvider: 'openai',
      _attachments: {
        [fileName]: {
          content_type: mimeType,
          data: audioBase64,
        },
      },
    };

    const saveResponse = await couchRequest(
      req,
      `/${encodeURIComponent(CALLS_DB_NAME)}/${encodeURIComponent(callId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(document),
      },
    );
    const savePayload = await saveResponse.json().catch(() => ({}));

    if (!saveResponse.ok) {
      return res.status(saveResponse.status).json({
        error: 'No se pudo guardar la llamada en CouchDB',
        details: savePayload,
      });
    }

    return res.json({
      ok: true,
      call: {
        ...document,
        _rev: savePayload?.rev || document._rev,
        audioUrl: `/api/couch/attachment/${encodeURIComponent(CALLS_DB_NAME)}/${encodeURIComponent(callId)}/${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error procesando llamada',
    });
  }
});

// ── OCR: Escaneo de documentos con OpenAI Vision ─────────────────────────────
async function convertPdfToImageBase64(pdfBase64) {
  const { execSync } = await import('node:child_process');
  const tmpDir = os.tmpdir();
  const id = `ocr-${Date.now()}`;
  const pdfPath = path.join(tmpDir, `${id}.pdf`);
  const outPrefix = path.join(tmpDir, id);

  fs.writeFileSync(pdfPath, Buffer.from(pdfBase64, 'base64'));
  try {
    execSync(`pdftoppm -png -r 300 -singlefile "${pdfPath}" "${outPrefix}"`, { timeout: 15000 });
    const pngPath = `${outPrefix}.png`;
    if (!fs.existsSync(pngPath)) throw new Error('pdftoppm no generó imagen');
    const pngBuffer = fs.readFileSync(pngPath);
    fs.unlinkSync(pngPath);
    return pngBuffer.toString('base64');
  } finally {
    try { fs.unlinkSync(pdfPath); } catch {}
  }
}

app.post('/api/ocr/scan', requireAuthAndEmailVerified, sensitiveOpLimiter, async (req, res) => {
  const t0 = Date.now();
  try {
    const cfg = getAiConfig();
    if (!cfg.openAiApiKey) {
      return res.status(500).json({ error: 'Falta OPENAI_API_KEY para OCR' });
    }

    const { imageBase64, mimeType, context, ocrMode } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: 'Se requiere imageBase64' });
    }

    let cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const prefix = cleanBase64.substring(0, 20);
    let detectedMime = 'image/png';

    if (prefix.startsWith('/9j/')) detectedMime = 'image/jpeg';
    else if (prefix.startsWith('iVBOR')) detectedMime = 'image/png';
    else if (prefix.startsWith('R0lG')) detectedMime = 'image/gif';
    else if (prefix.startsWith('UklG')) detectedMime = 'image/webp';
    else if (prefix.startsWith('JVBE') || prefix.startsWith('JVBERi') || mimeType === 'application/pdf') {
      logger.info({ tag: 'OCR' }, 'Converting PDF to PNG');
      try {
        cleanBase64 = await convertPdfToImageBase64(cleanBase64);
        detectedMime = 'image/png';
      } catch (pdfErr) {
        logger.error({ tag: 'OCR', error: pdfErr.message }, 'PDF conversion failed');
        return res.status(400).json({ error: 'No se pudo convertir el PDF a imagen. Asegúrate de que es un PDF válido.' });
      }
    }

    const sourceHash = await import('node:crypto').then(c =>
      c.createHash('sha256').update(cleanBase64).digest('hex'),
    );

    logger.info({ tag: 'OCR', detectedMime, base64Len: cleanBase64.length, sourceHash }, 'Sending to OpenAI Vision');

    const dataUrl = `data:${detectedMime};base64,${cleanBase64}`;

    const VEHICLE_OCR_PROMPT = `Eres un experto en OCR de documentos de automoción españoles, incluyendo documentos de desguaces y centros autorizados de tratamiento (CAT).
Reconoces: permisos de circulación, fichas técnicas, contratos de compraventa, ITV, facturas, seguros, informes de tráfico, bajas temporales/definitivas DGT, certificados de destrucción, certificados de descontaminación, actas de retirada, albaranes de grúa y documentos de tasación.
Analiza la imagen y extrae toda la información posible en formato JSON estricto.
Responde SOLO con JSON válido, sin markdown ni texto adicional.
El JSON debe tener esta estructura:
{
  "documentType": "permiso_circulacion" | "ficha_tecnica" | "contrato_compra" | "contrato_venta" | "factura_compra" | "factura_venta" | "itv" | "seguro" | "reparacion" | "doc_cliente" | "informe_trafico" | "baja_temporal" | "baja_definitiva" | "certificado_destruccion" | "certificado_descontaminacion" | "acta_retirada" | "albaran_grua" | "doc_tasacion" | "otro",
  "documentTypeLabel": "Descripción legible del tipo en español",
  "confidenceScore": 85,
  "registrationPlate": "matrícula del vehículo (ej: 1234 ABC)" ,
  "vin": "número de bastidor / VIN",
  "vehicleBrand": "marca del vehículo",
  "vehicleModel": "modelo del vehículo",
  "vehicleYear": 2021,
  "ownerName": "nombre del titular / propietario",
  "ownerNif": "NIF/NIE/CIF del titular",
  "buyerName": "nombre del comprador (si contrato/factura)",
  "buyerNif": "NIF/NIE/CIF del comprador",
  "sellerName": "nombre del vendedor (si contrato/factura)",
  "sellerNif": "NIF/NIE/CIF del vendedor",
  "date": "fecha del documento en formato YYYY-MM-DD",
  "expiryDate": "fecha de caducidad (ITV, seguro) en YYYY-MM-DD",
  "documentNumber": "número de documento",
  "subtotal": 0.00,
  "taxRate": 21,
  "taxAmount": 0.00,
  "total": 0.00,
  "currency": "EUR",
  "lines": [
    { "description": "Concepto", "quantity": 1, "unitPrice": 0.00, "total": 0.00 }
  ],
  "notes": "cualquier dato adicional relevante",
  "deregistrationDate": "fecha de baja (solo si es baja temporal/definitiva)",
  "deregistrationType": "temporal | definitiva (solo si es baja)",
  "treatmentCenter": "nombre del centro autorizado de tratamiento (CAT)",
  "towCompany": "empresa de grúa / transporte (solo si es albarán de grúa)",
  "wasteType": "tipo de residuo (solo docs medioambientales)",
  "isScrapyard": true
}
confidenceScore es un número 0-100 indicando tu nivel de certeza global.
Si algún campo no se puede determinar, usa null.
Los campos financieros (subtotal, taxRate, lines, etc.) solo se rellenan si el documento contiene importes.
isScrapyard se pone true si el documento es de un desguace/CAT, false si es de compraventa general.`;

    const contextHint = context?.targetModule
      ? `\nContexto adicional: el usuario subió este documento desde el módulo "${context.targetModule}".`
      : '';

    const isVehicleMode = ocrMode === 'vehicle';

    const response = await fetch(`${cfg.openAiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 3000,
        messages: [
          {
            role: 'system',
            content: isVehicleMode
              ? VEHICLE_OCR_PROMPT + contextHint
              : `Eres un experto en OCR de documentos empresariales. Analiza la imagen y extrae toda la información posible.
Responde SOLO con JSON válido, sin markdown ni texto adicional.${contextHint}

Clasifica el documento en uno de estos tipos:
- "factura_proveedor": factura recibida de un proveedor
- "factura_cliente": factura emitida a un cliente
- "ticket_gasto": ticket de compra, recibo de gasto menor
- "recibo": recibo de pago o cobro
- "albaran": albarán de entrega o recepción de mercancía
- "nomina": nómina o recibo de salario
- "contrato_laboral": contrato de trabajo, anexo laboral
- "certificado_laboral": certificado de empresa, vida laboral
- "baja_it": parte de baja, incapacidad temporal
- "contrato_comercial": contrato mercantil, acuerdo comercial
- "presupuesto": presupuesto o cotización
- "documento_cliente": documento genérico de/para un cliente
- "documento_vertical": documento específico de un sector (obra, clínica, legal, etc.)
- "otro": cualquier otro documento no clasificable

El JSON debe tener esta estructura:
{
  "documentType": "uno de los tipos anteriores",
  "documentTypeLabel": "Descripción legible del tipo en español",
  "confidenceScore": 85,

  "emitter": "Nombre del emisor/empresa",
  "emitterCIF": "CIF/NIF del emisor si aparece",
  "receiver": "Nombre del receptor",
  "receiverCIF": "CIF/NIF del receptor si aparece",
  "date": "Fecha del documento (YYYY-MM-DD)",
  "documentNumber": "Número de factura/recibo/albarán/contrato",

  "subtotal": 0.00,
  "taxRate": 21,
  "taxAmount": 0.00,
  "total": 0.00,
  "currency": "EUR",
  "lines": [
    { "description": "Concepto", "quantity": 1, "unitPrice": 0.00, "total": 0.00 }
  ],

  "workerName": "Nombre del trabajador (solo docs laborales)",
  "workerDNI": "DNI/NIE del trabajador (solo docs laborales)",
  "periodStart": "Fecha inicio periodo (YYYY-MM-DD, para nóminas/contratos)",
  "periodEnd": "Fecha fin periodo (YYYY-MM-DD, para nóminas/contratos)",
  "contractDuration": "Duración del contrato si aplica",

  "notes": "Cualquier nota, observación o dato relevante adicional"
}

confidenceScore es un número 0-100 indicando tu nivel de certeza global sobre la lectura.
Si algún campo no se puede determinar, usa null.
Los campos laborales (workerName, workerDNI, periodStart, periodEnd, contractDuration) solo se rellenan si el documento es de tipo laboral.
Los campos financieros (subtotal, taxRate, lines, etc.) solo se rellenan si el documento contiene importes.`,
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analiza este documento y extrae toda la información.' },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      logger.warn({ tag: 'OCR', status: response.status, errBody: errBody?.substring(0, 500), detectedMime, base64Len: cleanBase64.length, prefix }, 'OpenAI rejected image');
      return res.status(response.status).json({ error: `OpenAI error: ${response.status}`, details: errBody });
    }

    const payload = await response.json();
    const rawContent = payload.choices?.[0]?.message?.content || '{}';
    const usage = payload.usage || {};

    let parsed;
    try {
      const cleaned = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { raw: rawContent, parseError: true };
    }

    const processingTimeMs = Date.now() - t0;
    logger.info({ tag: 'OCR', processingTimeMs, documentType: parsed.documentType, confidence: parsed.confidenceScore, sourceHash }, 'OCR completed');

    const INCOME_DOC_TYPES = ['factura_cliente', 'recibo'];
    const EXPENSE_DOC_TYPES = ['factura_proveedor', 'ticket_gasto', 'nomina'];
    const docType = String(parsed.documentType || '');
    let suggestedMovement = null;
    if (INCOME_DOC_TYPES.includes(docType) || EXPENSE_DOC_TYPES.includes(docType)) {
      const isIncome = INCOME_DOC_TYPES.includes(docType);
      const categoryMap = {
        factura_proveedor: 'materiales', ticket_gasto: 'otros_gastos', nomina: 'personal',
        factura_cliente: 'ventas', recibo: 'otros_ingresos',
      };
      suggestedMovement = {
        type: isIncome ? 'cobro' : 'pago',
        concept: `${parsed.documentTypeLabel || docType} ${parsed.documentNumber || ''} — ${parsed.emitter || ''}`.trim(),
        category: categoryMap[docType] || (isIncome ? 'otros_ingresos' : 'otros_gastos'),
        amountBase: Number(parsed.subtotal || 0),
        taxRate: Number(parsed.taxRate || 0),
        totalAmount: Number(parsed.total || 0),
        date: parsed.date || new Date().toISOString().slice(0, 10),
        companyName: isIncome ? (parsed.receiver || '') : (parsed.emitter || ''),
        reference: parsed.documentNumber || '',
        source: 'ocr',
      };
    }

    return res.json({
      ok: true,
      data: parsed,
      suggestedMovement,
      meta: {
        sourceHash,
        processingTimeMs,
        tokensUsed: { prompt: usage.prompt_tokens || 0, completion: usage.completion_tokens || 0 },
        model: 'gpt-4o',
      },
    });
  } catch (error) {
    logger.error({ tag: 'OCR', error: error instanceof Error ? error.message : String(error) }, 'OCR exception');
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error procesando OCR',
    });
  }
});

// S-05: Bases de datos CouchDB accesibles según rol
const COUCH_ADMIN_ROLES = new Set(['Admin', 'Gerente']);
const COUCH_ALLOWED_DBS = new Set(['vehicles', 'notifications', 'cards', 'accounts', 'invoice', 'schedules', 'vacations', 'payroll', 'staff-expenses']);

function requireCouchDbAccess(req, res, next) {
  const dbName = String(req.params.dbName || '').toLowerCase().trim();
  if (!dbName) return next();
  const role = req.authUser?.role;
  if (COUCH_ADMIN_ROLES.has(role)) return next();
  if (COUCH_ALLOWED_DBS.has(dbName)) return next();
  for (const allowed of COUCH_ALLOWED_DBS) {
    if (dbName.endsWith(`-${allowed}`)) return next();
  }
  return res.status(403).json({ ok: false, error: 'Acceso a esta base de datos no está permitido' });
}

app.get('/api/couch/dbs', cacheResponse({ ttl: cacheService.TTL_PRESETS.DB_LIST, keyFn: () => 'db:_all_dbs' }), async (req, res) => {
  try {
    const response = await couchRequest(req, '/_all_dbs');
    const payload = await response.json();
    if (!response.ok) {
      logger.warn({ tag: 'COUCH', op: 'list-dbs', status: response.status }, 'list dbs error');
      return res.status(response.status).json({ error: 'Couch list dbs fallo', details: payload });
    }
    logger.debug({ tag: 'COUCH', op: 'list-dbs', count: Array.isArray(payload) ? payload.length : 0 });
    return res.json(payload);
  } catch (error) {
    logger.error({ tag: 'COUCH', op: 'list-dbs', err: error.message }, 'list dbs catch');
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error couch dbs' });
  }
});

app.put('/api/couch/db/:dbName', async (req, res) => {
  try {
    const dbName = encodeURIComponent(req.params.dbName);
    const response = await couchRequest(req, `/${dbName}`, { method: 'PUT' });
    const payload = await response.json().catch(() => ({}));
    if (![201, 202, 412].includes(response.status)) {
      logger.warn({ tag: 'COUCH', op: 'ensure-db', status: response.status, db: req.params.dbName }, 'ensure db error');
      return res.status(response.status).json({ error: 'Couch ensure db fallo', details: payload });
    }
    logger.debug({ tag: 'COUCH', op: 'ensure-db', status: response.status, db: req.params.dbName });
    cacheService.invalidate('db:_all_dbs');
    return res.json({ ok: true, dbName: req.params.dbName, details: payload });
  } catch (error) {
    logger.error({ tag: 'COUCH', op: 'ensure-db', db: req.params.dbName, err: error.message }, 'ensure db catch');
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error couch ensure db' });
  }
});

app.get('/api/couch/docs/:dbName', requireCouchDbAccess, cacheResponse({ ttl: cacheService.TTL_PRESETS.DOCS_LIST, keyFn: (req) => `db:${req.params.dbName}:all_docs` }), async (req, res) => {
  try {
    const dbName = encodeURIComponent(req.params.dbName);
    const response = await couchRequest(req, `/${dbName}/_all_docs?include_docs=true`);
    const payload = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Couch get docs fallo',
        details: payload,
      });
    }
    const docs = (payload.rows || []).map((row) => row.doc).filter(Boolean);
    if (isClockinsDb(req.params.dbName)) {
      const filtered = await filterClockinsDocsForRequester(req, docs);
      return res.json({ docs: filtered });
    }
    return res.json({ docs });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error couch get docs' });
  }
});

app.get('/api/couch/doc/:dbName/:docId', requireCouchDbAccess, cacheResponse({ ttl: cacheService.TTL_PRESETS.SINGLE_DOC, keyFn: (req) => `db:${req.params.dbName}:doc:${req.params.docId}` }), async (req, res) => {
  try {
    const dbName = encodeURIComponent(req.params.dbName);
    const docId = encodeURIComponent(req.params.docId);
    const response = await couchRequest(req, `/${dbName}/${docId}`);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Couch get doc fallo',
        details: payload,
      });
    }

    if (isClockinsDb(req.params.dbName)) {
      const allowed = await assertClockinDocReadAccess(req, payload);
      if (!allowed) {
        return res.status(403).json({ error: 'No autorizado para ver este fichaje' });
      }
    }

    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error couch get doc' });
  }
});

app.get('/api/couch/attachment/:dbName/:docId/:attachmentName', requireCouchDbAccess, async (req, res) => {
  try {
    const dbName = encodeURIComponent(req.params.dbName);
    const docId = encodeURIComponent(req.params.docId);
    const attachmentName = encodeURIComponent(req.params.attachmentName);

    const response = await couchRequest(req, `/${dbName}/${docId}/${attachmentName}`, {
      headers: {
        Accept: '*/*',
      },
    });

    if (!response.ok) {
      const payload = await response.text().catch(() => '');
      return res.status(response.status).json({
        error: 'Couch get attachment fallo',
        details: payload,
      });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');
    const body = Buffer.from(await response.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    return res.send(body);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error couch get attachment',
    });
  }
});

app.put('/api/couch/attachment/:dbName/:docId/:attachmentName', requireCouchDbAccess, async (req, res) => {
  try {
    const dbName = encodeURIComponent(req.params.dbName);
    const docId = encodeURIComponent(req.params.docId);
    const attachmentName = encodeURIComponent(req.params.attachmentName);
    const rev = req.query.rev ? `?rev=${encodeURIComponent(req.query.rev)}` : '';
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const response = await couchRequest(req, `/${dbName}/${docId}/${attachmentName}${rev}`, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Couch put attachment fallo', details: payload });
    }
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error couch put attachment' });
  }
});

app.delete('/api/couch/attachment/:dbName/:docId/:attachmentName', requireCouchDbAccess, async (req, res) => {
  try {
    const dbName = encodeURIComponent(req.params.dbName);
    const docId = encodeURIComponent(req.params.docId);
    const attachmentName = encodeURIComponent(req.params.attachmentName);
    const rev = req.query.rev ? `?rev=${encodeURIComponent(req.query.rev)}` : '';

    const response = await couchRequest(req, `/${dbName}/${docId}/${attachmentName}${rev}`, {
      method: 'DELETE',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Couch delete attachment fallo', details: payload });
    }
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error couch delete attachment' });
  }
});

app.post('/api/couch/doc/:dbName', requireCouchDbAccess, async (req, res) => {
  try {
    const actorEmail = req.authUser?.email || '';
    const wcCheck = await validateWorkCenterEntitlementWrite(
      req,
      req.params.dbName,
      req.body,
      req.body?._id || null,
      actorEmail,
    );
    if (!wcCheck.ok) {
      return res.status(wcCheck.status).json({ ok: false, error: wcCheck.error, code: wcCheck.code });
    }
    const dbName = encodeURIComponent(req.params.dbName);
    const response = await couchRequest(req, `/${dbName}`, {
      method: 'POST',
      body: JSON.stringify(req.body || {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      logger.warn({ tag: 'COUCH', op: 'add-doc', status: response.status, db: req.params.dbName }, 'add doc error');
      return res.status(response.status).json({ error: 'Couch add doc fallo', details: payload });
    }
    cacheService.invalidateDb(req.params.dbName);
    logger.debug({ tag: 'COUCH', op: 'add-doc', status: response.status, db: req.params.dbName });
    return res.json(payload);
  } catch (error) {
    logger.error({ tag: 'COUCH', op: 'add-doc', db: req.params.dbName, err: error.message }, 'add doc catch');
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error couch add doc' });
  }
});

app.put('/api/couch/doc/:dbName/:docId', requireCouchDbAccess, async (req, res) => {
  try {
    if (isClockinsDb(req.params.dbName)) {
      const validation = await validateClockinDocWrite(req, req.body, req.params.docId);
      if (!validation.ok) {
        return res.status(validation.status).json({ error: validation.error });
      }
    }
    const actorEmail = req.authUser?.email || '';
    const wcCheck = await validateWorkCenterEntitlementWrite(
      req,
      req.params.dbName,
      req.body,
      req.params.docId,
      actorEmail,
    );
    if (!wcCheck.ok) {
      return res.status(wcCheck.status).json({ ok: false, error: wcCheck.error, code: wcCheck.code });
    }
    const dbName = encodeURIComponent(req.params.dbName);
    const docId = encodeURIComponent(req.params.docId);
    const response = await couchRequest(req, `/${dbName}/${docId}`, {
      method: 'PUT',
      body: JSON.stringify(req.body || {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Couch update doc fallo',
        details: payload,
      });
    }
    cacheService.invalidateDb(req.params.dbName);
    cacheService.invalidate(cacheService.buildKey('db', req.params.dbName, 'doc', req.params.docId));
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error couch update doc' });
  }
});

app.delete('/api/couch/doc/:dbName/:docId', requireCouchDbAccess, async (req, res) => {
  try {
    const dbName = encodeURIComponent(req.params.dbName);
    const docId = encodeURIComponent(req.params.docId);

    const getResponse = await couchRequest(req, `/${dbName}/${docId}`);
    const doc = await getResponse.json().catch(() => ({}));
    if (!getResponse.ok) {
      return res.status(getResponse.status).json({
        error: 'Couch remove doc fallo al obtener documento',
        details: doc,
      });
    }

    const now = new Date().toISOString();
    const updatedDoc = { ...doc, deletedAt: now, updatedAt: now };

    const putResponse = await couchRequest(req, `/${dbName}/${docId}`, {
      method: 'PUT',
      body: JSON.stringify(updatedDoc),
    });
    const payload = await putResponse.json().catch(() => ({}));
    if (!putResponse.ok) {
      return res.status(putResponse.status).json({
        error: 'Couch remove doc fallo',
        details: payload,
      });
    }
    cacheService.invalidateDb(req.params.dbName);
    cacheService.invalidate(cacheService.buildKey('db', req.params.dbName, 'doc', req.params.docId));
    return res.json({ ok: true, id: doc._id, rev: payload.rev });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error couch remove doc' });
  }
});

// ── CouchDB Manager: endpoints adicionales ──────────────────────────────────

app.get('/api/couch/db/:dbName/info', cacheResponse({ ttl: cacheService.TTL_PRESETS.SUMMARY, keyFn: (req) => `db:${req.params.dbName}:info` }), async (req, res) => {
  try {
    const dbName = encodeURIComponent(req.params.dbName);
    const response = await couchRequest(req, `/${dbName}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: 'DB info failed', details: payload });
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error couch db info' });
  }
});

app.delete('/api/couch/db/:dbName', async (req, res) => {
  try {
    const dbName = encodeURIComponent(req.params.dbName);
    const response = await couchRequest(req, `/${dbName}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: 'Delete DB failed', details: payload });
    cacheService.invalidate('db:_all_dbs');
    cacheService.invalidateDb(req.params.dbName);
    return res.json({ ok: true, dbName: req.params.dbName });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error couch delete db' });
  }
});

app.get('/api/couch/docs-paginated/:dbName', cacheResponse({ ttl: cacheService.TTL_PRESETS.DOCS_LIST, keyFn: (req) => `db:${req.params.dbName}:paginated:${req.query.limit || 25}:${req.query.skip || 0}:${req.query.descending || ''}` }), async (req, res) => {
  try {
    const dbName = encodeURIComponent(req.params.dbName);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 200);
    const skip = Math.max(parseInt(req.query.skip) || 0, 0);
    const descending = req.query.descending === 'true';
    const qs = `include_docs=true&limit=${limit}&skip=${skip}${descending ? '&descending=true' : ''}`;
    const response = await couchRequest(req, `/${dbName}/_all_docs?${qs}`);
    const payload = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: 'Paginated docs failed', details: payload });
    const docs = (payload.rows || []).map((row) => row.doc).filter(Boolean);
    return res.json({ docs, total_rows: payload.total_rows || 0, offset: payload.offset || 0 });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error couch paginated docs' });
  }
});

app.post('/api/couch/db/:dbName/find', async (req, res) => {
  try {
    const dbName = encodeURIComponent(req.params.dbName);
    const response = await couchRequest(req, `/${dbName}/_find`, {
      method: 'POST',
      body: JSON.stringify(req.body || {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: 'Find failed', details: payload });
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error couch find' });
  }
});

app.post('/api/couch/db/:dbName/bulk-delete', async (req, res) => {
  try {
    const dbName = encodeURIComponent(req.params.dbName);
    const { docs } = req.body || {};
    if (!Array.isArray(docs) || docs.length === 0) return res.status(400).json({ error: 'docs array required' });
    const deleteDocs = docs.map((d) => ({ _id: d._id, _rev: d._rev, _deleted: true }));
    const response = await couchRequest(req, `/${dbName}/_bulk_docs`, {
      method: 'POST',
      body: JSON.stringify({ docs: deleteDocs }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: 'Bulk delete failed', details: payload });
    cacheService.invalidateDb(req.params.dbName);
    return res.json({ ok: true, results: payload });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error couch bulk delete' });
  }
});

app.post('/api/couch/doc-hard/:dbName/:docId', async (req, res) => {
  try {
    const dbName = encodeURIComponent(req.params.dbName);
    const docId = encodeURIComponent(req.params.docId);
    const rev = req.query.rev ? `?rev=${encodeURIComponent(req.query.rev)}` : '';
    const response = await couchRequest(req, `/${dbName}/${docId}${rev}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: 'Hard delete failed', details: payload });
    cacheService.invalidateDb(req.params.dbName);
    return res.json({ ok: true, ...payload });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error couch hard delete' });
  }
});

app.post('/api/index-huella', async (req, res) => {
  try {
    const targetDir = typeof req.body?.targetDir === 'string' && req.body.targetDir.trim() ? req.body.targetDir.trim() : 'src';
    const dryRun = Boolean(req.body?.dryRun);
    const result = await runHuellaIndexer({
      rootDir: __dirname,
      targetDir,
      dryRun,
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error ejecutando index-huella',
    });
  }
});

// ─── Dashboard KPIs: agregaciones en tiempo real desde CouchDB ────────────────
app.get('/api/dashboard/kpis/:userId', async (req, res) => {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'Falta userId' });
    }

    // Determine business vertical to adapt KPIs (delivery vs others)
    let businessType = '';
    try {
      const { findAccountByUserId } = await import('./services/couchdb.js');
      const account = await findAccountByUserId(req, userId).catch(() => null);
      businessType = String(account?.businessType || '').trim();
    } catch { /* best-effort */ }

    const cacheKey = cacheService.buildKey('kpi', userId, 'v2');
    const cached = cacheService.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }
    res.setHeader('X-Cache', 'MISS');

    const leadsDb = normalizeDbName(
      process.env.VITE_CRM_LEADS_DB || `${process.env.VITE_COUCHDB_DB || 'vertial'}-leads`,
    );
    const salesDb = normalizeDbName(
      process.env.VITE_SALES_DB || `${process.env.VITE_COUCHDB_DB || 'vertial'}-sales`,
    );
    const vehiclesDb = 'vehicles';
    const financeDb = getFinanceDbName();
    const clockinsDb = getClockinsDbName();
    const catalogDb = getCatalogDbName();
    const partsDb = getPartsDbName();
    const workshopDb = getWorkshopDbName();
    const deliveryDb = getDeliveryDbName();

    async function fetchAllDocs(dbName) {
      return cacheService.getOrFetch(
        cacheService.buildKey('db', dbName, '_raw_docs'),
        async () => {
          const resp = await couchRequest(req, `/${encodeURIComponent(dbName)}/_all_docs?include_docs=true`);
          if (!resp.ok) return [];
          const body = await resp.json().catch(() => ({ rows: [] }));
          return (body.rows || [])
            .map((row) => row.doc)
            .filter((d) => d && !String(d._id || '').startsWith('_design/'));
        },
        cacheService.TTL_PRESETS.KPI,
      );
    }

    const [vehicleDocs, leadDocs, saleDocs, financeDocs, clockinDocs, catalogDocs, partsDocs, workshopDocs, deliveryDocs] = await Promise.all([
      fetchAllDocs(vehiclesDb).catch(() => []),
      fetchAllDocs(leadsDb).catch(() => []),
      fetchAllDocs(salesDb).catch(() => []),
      fetchAllDocs(financeDb).catch(() => []),
      fetchAllDocs(clockinsDb).catch(() => []),
      fetchAllDocs(catalogDb).catch(() => []),
      fetchAllDocs(partsDb).catch(() => []),
      fetchAllDocs(workshopDb).catch(() => []),
      fetchAllDocs(deliveryDb).catch(() => []),
    ]);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStr = todayStr.slice(0, 7);
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // ── Vehicle KPIs (backward compat) ──
    const userVehicles = vehicleDocs.filter(
      (v) => v.user_id === userId && v.active !== false && v.type === 'car',
    );
    const userLeads = leadDocs.filter((l) => l.user_id === userId && l.type === 'lead');

    const inStockStatuses = ['entrada', 'preparacion', 'listo', 'available', 'workshop'];
    const stockCount = userVehicles.filter((v) => inStockStatuses.includes(v.status)).length;
    const reservedCount = userVehicles.filter((v) => v.status === 'reservado' || v.status === 'reserved').length;
    const totalVehicles = userVehicles.length;
    const enPreparacion = userVehicles.filter((v) => v.status === 'preparacion' || v.status === 'preparation').length;
    const entradaCount = userVehicles.filter((v) => v.status === 'entrada').length;
    const listoCount = userVehicles.filter((v) => v.status === 'listo' || v.status === 'available').length;

    const soldThisMonth = userVehicles.filter((v) => {
      if (v.status !== 'vendido' && v.status !== 'sold') return false;
      if (!v.soldAt) return false;
      return String(v.soldAt) >= firstOfMonth;
    });

    const salesVolume = soldThisMonth.reduce((s, v) => s + Number(v.salePrice || 0), 0);
    const vehicleCostCalc = (v) => (Array.isArray(v.associatedCosts) ? v.associatedCosts : []).reduce((sum, c) => sum + (Number(c?.amount) || 0), 0);
    const marginTotal = soldThisMonth.reduce(
      (s, v) => s + (Number(v.salePrice || 0) - Number(v.purchasePrice || 0) - vehicleCostCalc(v)),
      0,
    );
    const marginPct = salesVolume > 0 ? Math.round((marginTotal / salesVolume) * 100) : 0;

    function crmSalePendingAmount(doc) {
      const t = Number(doc.totalPrice || 0);
      return Math.max(0, t - Number(doc.depositPaid || 0) - Number(doc.financingAmount || 0));
    }
    const userCrmSales = saleDocs.filter((s) => s.type === 'sale' && s.user_id === userId);
    const salesClosure = {
      activePipeline: userCrmSales.filter((s) => ['interested', 'reserved', 'documentation'].includes(s.stage)).length,
      soldAwaitingDelivery: userCrmSales.filter((s) => s.stage === 'sold').length,
      pendingPayment: userCrmSales.filter(
        (s) => ['reserved', 'documentation', 'sold'].includes(s.stage) && crmSalePendingAmount(s) > 0,
      ).length,
      deliveredThisMonth: userCrmSales.filter(
        (s) => s.stage === 'delivered' && s.deliveredAt && String(s.deliveredAt).startsWith(monthStr),
      ).length,
    };

    const pendingSales = saleDocs.filter((s) => s.status === 'pending');
    const pendingFinanceMovements = userFinance.filter((d) => d.status === 'pending' && !d.deletedAt);
    const cobrosPendientes = pendingFinanceMovements.reduce(
      (sum, d) => sum + Number(d.totalAmount || 0),
      0,
    ) + pendingSales.reduce(
      (sum, s) => sum + Number(s.totalAmount || s.salePrice || 0),
      0,
    );
    const cobrosCount = pendingFinanceMovements.length + pendingSales.length;
    const oportunidades = userLeads.filter((l) => l.status !== 'won' && l.status !== 'lost').length;
    // NOTE: pendingDeliveries means different things depending on vertical.
    // - carDealership: deliveries of sold vehicles pending
    // - delivery: active delivery orders pending completion
    let pendingDeliveries = saleDocs.filter((s) => s.status === 'pending').length;

    const funnelStages = ['new', 'contacted', 'appointment', 'reserved', 'negotiation', 'won', 'lost'];
    const funnel = {};
    funnelStages.forEach((stage) => {
      funnel[stage] = userLeads.filter((l) => l.status === stage).length;
    });

    // ── GENERAL KPIs ──

    // Finance: cobros (income) y pagos (expenses) del usuario
    const userFinance = financeDocs.filter((d) => d.user_id === userId && !d.deletedAt);
    const incomeToday = userFinance
      .filter((d) => d.type === 'cobro' && d.date === todayStr)
      .reduce((s, d) => s + Number(d.totalAmount || 0), 0);
    const incomeMonth = userFinance
      .filter((d) => d.type === 'cobro' && String(d.date || '').startsWith(monthStr))
      .reduce((s, d) => s + Number(d.totalAmount || 0), 0);
    const expensesMonth = userFinance
      .filter((d) => d.type === 'pago' && String(d.date || '').startsWith(monthStr))
      .reduce((s, d) => s + Number(d.totalAmount || 0), 0);

    // ── Delivery revenue (delivery orders delivered) ──
    const userDeliveryOrders = deliveryDocs.filter((d) => d?.type === 'delivery_order' && d?.user_id === userId && !d?.deletedAt);
    const deliveredDeliveryOrdersToday = userDeliveryOrders.filter((o) => o.status === 'entregado' && String(o.deliveredAt || '').startsWith(todayStr));
    const deliveredDeliveryOrdersMonth = userDeliveryOrders.filter((o) => o.status === 'entregado' && String(o.deliveredAt || '').startsWith(monthStr));
    const deliveryRevenueToday = deliveredDeliveryOrdersToday.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
    const deliveryRevenueMonth = deliveredDeliveryOrdersMonth.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
    const activeDeliveryOrders = userDeliveryOrders.filter((o) => !['entregado', 'cancelled'].includes(String(o.status || '')));
    if (businessType === 'delivery') {
      pendingDeliveries = activeDeliveryOrders.length;
    }

    // Ventas hoy: vehicle sales + finance income today + delivery revenue today
    const soldToday = userVehicles.filter((v) => {
      if (v.status !== 'vendido' && v.status !== 'sold') return false;
      if (!v.soldAt) return false;
      return String(v.soldAt).startsWith(todayStr);
    });
    const vehicleSalesToday = soldToday.reduce((s, v) => s + Number(v.salePrice || 0), 0);
    const salesToday = vehicleSalesToday + incomeToday + deliveryRevenueToday;
    const salesTodayCount =
      soldToday.length +
      userFinance.filter((d) => d.type === 'cobro' && d.date === todayStr).length +
      deliveredDeliveryOrdersToday.length;

    // Ventas mes total (vehicle sales + finance income + delivery revenue month)
    const salesMonthTotal = salesVolume + incomeMonth + deliveryRevenueMonth;

    // Beneficio estimado
    const estimatedProfit = salesMonthTotal - expensesMonth;

    // Caja actual: all-time incomes - all-time expenses
    const totalIncomes = userFinance.filter((d) => d.type === 'cobro').reduce((s, d) => s + Number(d.totalAmount || 0), 0);
    const totalExpenses = userFinance.filter((d) => d.type === 'pago').reduce((s, d) => s + Number(d.totalAmount || 0), 0);
    const cashBalance = totalIncomes - totalExpenses;

    // Stock crítico: solo si hay infraestructura de inventario y artículos inventariables
    const userCatalog = catalogDocs.filter((d) => d.user_id === userId && d.active !== false && !d.deletedAt);
    const catalogInfraDocs = catalogDocs.filter((d) => d.user_id === userId && !d.deletedAt && (d.type === 'warehouse' || d.type === 'stock_movement'));
    const stockAlertsEnabled = canEmitCatalogStockAlerts(
      userCatalog.filter((d) => d.type === 'catalog_item'),
      catalogInfraDocs,
    );
    const stockTrackedCatalog = filterStockTrackedCatalogItems(userCatalog);
    const userParts = partsDocs.filter((d) => d.user_id === userId && !d.deletedAt);
    const stockTrackedParts = filterStockTrackedParts(userParts);
    const criticalStockItems = stockAlertsEnabled
      ? stockTrackedCatalog.filter((d) => d.minStock > 0 && Number(d.stockQuantity || 0) <= Number(d.minStock))
      : [];
    const criticalStockParts = hasPartsStockSetup(userParts)
      ? stockTrackedParts.filter((d) => Number(d.stockQuantity || 0) <= Number(d.minStock))
      : [];
    const criticalStockCount = criticalStockItems.length + criticalStockParts.length;

    // ── Stock & Purchase KPIs ──
    const stockProducts = stockAlertsEnabled
      ? stockTrackedCatalog.filter((i) => i.type === 'catalog_item' && i.itemType === 'product')
      : [];
    const stockValue = stockProducts.reduce((s, i) => s + (Number(i.stockQuantity || 0) * Number(i.costPrice || 0)), 0);
    const lowStockCount = stockAlertsEnabled
      ? stockProducts.filter((i) => i.minStock > 0 && Number(i.stockQuantity || 0) > 0 && Number(i.stockQuantity) <= i.minStock).length
      : 0;
    const outOfStockCount = stockAlertsEnabled
      ? stockProducts.filter((i) => i.minStock > 0 && Number(i.stockQuantity || 0) <= 0).length
      : 0;
    const negativeStockCount = stockAlertsEnabled
      ? stockProducts.filter((i) => Number(i.stockQuantity || 0) < 0).length
      : 0;

    const purchaseOrders = catalogDocs.filter((d) => d?.type === 'purchase_order' && d?.user_id === userId && !d?.deletedAt);
    const pendingPurchaseOrders = purchaseOrders.filter((o) => ['draft', 'pending', 'sent', 'partial'].includes(o.status)).length;
    const overduePurchaseOrders = purchaseOrders.filter((o) => {
      if (!['sent', 'pending'].includes(o.status)) return false;
      return o.expectedDate && new Date(o.expectedDate) < now;
    }).length;
    const purchasesMonth = purchaseOrders
      .filter((o) => o.status === 'received' && o.receivedAt && String(o.receivedAt).startsWith(monthStr))
      .reduce((s, o) => s + Number(o.total || 0), 0);

    // Trabajadores activos: clockins for today
    const todayClockins = clockinDocs.filter((d) => d.type === 'clockin' && d.date === todayStr && !d.deletedAt);
    const clockedInUserIds = new Set(todayClockins.filter((d) => d.clockIn && !d.clockOut).map((d) => d.user_id));
    const activeWorkers = clockedInUserIds.size;
    const totalClockinsToday = new Set(todayClockins.map((d) => d.user_id)).size;

    // Incidencias abiertas: workshop + other incidents
    const userWorkshop = workshopDocs.filter((d) => d.user_id === userId && !d.deletedAt);
    const openWorkOrders = userWorkshop.filter((d) => d.type === 'work_order' && ['pending', 'in_progress'].includes(d.status));
    const openIncidents = openWorkOrders.length;

    // ── ALERTS (hybrid: centro global + inline fallback) ──
    let dashAlerts = [];
    try {
      const globalAlerts = await listAlertsByBusiness(req, userId, { status: 'new,seen', limit: 10, sort: 'createdAt', order: 'desc' });
      if (globalAlerts?.items?.length > 0) {
        const LEVEL_SEVERITY = { alert: 'error', warning: 'warning', info: 'info', success: 'info' };
        dashAlerts = globalAlerts.items.map((a) => ({
          id: a._id || a.category,
          severity: LEVEL_SEVERITY[a.level] || 'warning',
          type: a.category || a.source || 'system',
          message: a.message || a.title,
          count: 1,
          route: a.route || '/saas/alerts',
          priority: a.priority || 'medium',
          source: a.source || 'sistema',
        }));
      }
    } catch { /* fallback to inline */ }

    const financeReady = canEmitFinanceAlerts({ financeDocs: userFinance });
    const hrReady = clockinDocs.some((d) => d.type === 'clockin' && !d.deletedAt);
    const vehiclesReady = canEmitVehicleAlerts({ vehicles: userVehicles });
    const crmReady = canEmitCrmAlerts({ leads: userLeads });

    if (dashAlerts.length === 0) {
      if (financeReady && cobrosCount > 0) {
        dashAlerts.push({ id: 'unpaid', severity: 'error', type: 'unpaid', message: `${cobrosCount} pago${cobrosCount > 1 ? 's' : ''} pendiente${cobrosCount > 1 ? 's' : ''} · ${Math.round(cobrosPendientes).toLocaleString('es-ES')} €`, count: cobrosCount, route: '/saas/income-expenses' });
      }
      if (criticalStockCount > 0) {
        dashAlerts.push({ id: 'low_stock', severity: 'warning', type: 'low_stock', message: `${criticalStockCount} producto${criticalStockCount > 1 ? 's' : ''} con stock crítico`, count: criticalStockCount, route: '/saas/compras-stock?tab=stock' });
      }
      if (hrReady && totalClockinsToday === 0 && now.getHours() >= 9) {
        dashAlerts.push({ id: 'no_clockins', severity: 'warning', type: 'no_clockins', message: 'Nadie ha fichado hoy', count: 0, route: '/saas/clockins' });
      }
      if (financeReady && cashBalance < 0) {
        dashAlerts.push({ id: 'negative_cash', severity: 'error', type: 'negative_cash', message: `Caja en negativo: ${Math.round(cashBalance).toLocaleString('es-ES')} €`, count: 1, route: '/saas/finance' });
      }
      if (financeReady && salesMonthTotal > 0 && estimatedProfit / salesMonthTotal < 0.1) {
        dashAlerts.push({ id: 'low_margin', severity: 'warning', type: 'low_margin', message: `Margen bajo este mes: ${Math.round((estimatedProfit / salesMonthTotal) * 100)}%`, count: 1, route: '/saas/ebitda' });
      }
      const agingVehicles = vehiclesReady
        ? userVehicles.filter((v) => v.status === 'available' && v.daysInStock > 90).length
        : 0;
      if (agingVehicles > 0) {
        dashAlerts.push({ id: 'aging_stock', severity: 'warning', type: 'aging_stock', message: `${agingVehicles} vehículo${agingVehicles > 1 ? 's' : ''} con más de 90 días en stock`, count: agingVehicles, route: '/saas/vehicles' });
      }
      const staleLeads = crmReady
        ? userLeads.filter((l) => { if (l.status === 'won' || l.status === 'lost') return false; if (!l.lastContact) return true; return (now.getTime() - new Date(l.lastContact).getTime()) / (1000 * 60 * 60) > 48; }).length
        : 0;
      if (staleLeads > 0) {
        dashAlerts.push({ id: 'stale_leads', severity: 'info', type: 'stale_leads', message: `${staleLeads} oportunidad${staleLeads > 1 ? 'es' : ''} sin contacto en +48h`, count: staleLeads, route: '/saas/clients' });
      }

      // Scrapyard-specific dashboard alerts
      try {
        const { findAccountByUserId: findAcct } = await import('./services/couchdb.js');
        const accountDoc = await findAcct(req, userId).catch(() => null);
        if (accountDoc?.businessType === 'scrapyard') {
          const { getScrapyardDbName: getScrapDb, getScrapyardSalesDbName: getScrapSalesDb } = await import('./services/couchdb.js');
          const [scrapParts, scrapSalesAll] = await Promise.all([
            fetchAllDocs(getScrapDb()).then((d) => d.filter((i) => i.type === 'scrapyard_part' && i.user_id === userId && !i.deletedAt)).catch(() => []),
            fetchAllDocs(getScrapSalesDb()).then((d) => d.filter((i) => i.type === 'scrapyard_sale' && i.user_id === userId && !i.deletedAt)).catch(() => []),
          ]);
          const scrapVehiclesPendingBaja = userVehicles.filter((v) => {
            const hasProcedencia = !!(v.procedencia || v.entryDate || v.dismantlingStartedAt);
            if (!hasProcedencia || v.status === 'scrapped') return false;
            const docs = Array.isArray(v.documents) ? v.documents : [];
            return !docs.some((d) => ['baja_temporal', 'baja_definitiva', 'certificado_destruccion'].includes(d.documentType));
          });
          if (scrapVehiclesPendingBaja.length > 0) {
            dashAlerts.push({ id: 'scrap_pending_baja', severity: 'error', type: 'scrapyard_pending_deregistration', message: `${scrapVehiclesPendingBaja.length} vehículo${scrapVehiclesPendingBaja.length > 1 ? 's' : ''} sin baja tramitada`, count: scrapVehiclesPendingBaja.length, route: '/saas/vertical/desguaces/vehiculos' });
          }
          const partsNoPrice = scrapParts.filter((p) => p.estado === 'disponible' && p.active !== false && (!p.precioVenta || Number(p.precioVenta) <= 0));
          if (partsNoPrice.length > 0) {
            dashAlerts.push({ id: 'scrap_parts_no_price', severity: 'warning', type: 'scrapyard_part_no_price', message: `${partsNoPrice.length} pieza${partsNoPrice.length > 1 ? 's' : ''} sin precio de venta`, count: partsNoPrice.length, route: '/saas/vertical/desguaces/piezas' });
          }
          const scrapUnpaid = scrapSalesAll.filter((s) => !['borrador', 'cancelada'].includes(s.estado) && s.estadoPago !== 'cobrada');
          if (scrapUnpaid.length > 0) {
            const totalPending = scrapUnpaid.reduce((sum, s) => {
              const paid = Array.isArray(s.pagos) ? s.pagos.reduce((a, p) => a + Number(p.importe || 0), 0) : 0;
              return sum + Math.max(0, Number(s.importeConIva || 0) - paid);
            }, 0);
            dashAlerts.push({ id: 'scrap_unpaid', severity: 'error', type: 'scrapyard_sale_unpaid', message: `${scrapUnpaid.length} venta${scrapUnpaid.length > 1 ? 's' : ''} con cobro pendiente (${Math.round(totalPending).toLocaleString('es-ES')} €)`, count: scrapUnpaid.length, route: '/saas/vertical/desguaces/ventas' });
          }
        }
      } catch { /* scrapyard dashboard alerts best-effort */ }
    }

    // ── Quick Finance ──
    const quickFinance = {
      incomeMonth: incomeMonth + salesVolume + deliveryRevenueMonth,
      expensesMonth,
      estimatedProfit,
      pendingInvoices: cobrosCount,
      pendingAmount: cobrosPendientes,
      cashBalance,
      marginPct: salesMonthTotal > 0 ? Math.round((estimatedProfit / salesMonthTotal) * 100) : 0,
    };

    // ── Butcher KPIs (solo si el negocio es carniceria) ──
    let butcherKpis = null;
    try {
      const { getButcherDbName, findAccountByUserId: findAccount } = await import('./services/couchdb.js');
      const account = await findAccount(req, userId).catch(() => null);
      const businessType = account?.businessType || '';
      if (businessType === 'butcherShop') {
        const bDb = getButcherDbName();
        const bDocs = await fetchAllDocs(bDb).catch(() => []);
        const bProducts = bDocs.filter((d) => d.type === 'butcher_product' && !d.deletedAt && d.user_id === userId);
        const bBatches = bDocs.filter((d) => d.type === 'butcher_batch' && !d.deletedAt && d.user_id === userId);
        const bWaste = bDocs.filter((d) => d.type === 'butcher_waste' && !d.deletedAt && d.user_id === userId && d.date === now.toISOString().slice(0, 10));
        const bScales = bDocs.filter((d) => d.type === 'butcher_scale_status' && !d.deletedAt);
        const bInvCounts = bDocs.filter((d) => d.type === 'butcher_inventory_count' && !d.deletedAt && d.user_id === userId).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

        const activeProducts = bProducts.filter((p) => p.active);
        const outOfStockCount = activeProducts.filter((p) => p.minStockKg > 0 && Number(p.stockKg || 0) <= 0).length;
        const lowStockCount = activeProducts.filter((p) => p.minStockKg > 0 && Number(p.stockKg || 0) > 0 && Number(p.stockKg) <= p.minStockKg).length;
        const activeBatches = bBatches.filter((b) => b.status === 'active');
        const expiredCount = activeBatches.filter((b) => b.expirationDate && new Date(b.expirationDate) < now).length;
        const expiringCount = activeBatches.filter((b) => {
          if (!b.expirationDate) return false;
          const d = Math.floor((new Date(b.expirationDate).getTime() - now.getTime()) / 86_400_000);
          return d >= 0 && d <= 3;
        }).length;
        const todayWasteKg = bWaste.reduce((s, r) => s + Number(r.wasteKg || 0), 0);
        const totalRecKg = activeBatches.reduce((s, b) => s + Number(b.receptionWeightKg || 0), 0);
        const connectedScales = bScales.filter((s) => s.connected).length;
        const disconnectedScales = bScales.filter((s) => !s.connected).length;
        const latestInv = bInvCounts[0];
        const invDiscreps = latestInv ? (latestInv.items || []).filter((i) => Math.abs(i.differencePct || 0) >= 3).length : 0;
        const stalePrices = activeProducts.filter((p) => {
          if (!p.priceUpdatedAt) return false;
          const d = new Date(p.priceUpdatedAt);
          return (now.getTime() - d.getTime()) / 86_400_000 >= 30;
        }).length;

        butcherKpis = {
          totalProducts: activeProducts.length,
          outOfStockProducts: outOfStockCount,
          lowStockProducts: lowStockCount,
          activeBatches: activeBatches.length,
          expiringBatches: expiringCount,
          expiredBatches: expiredCount,
          todayWasteKg: Math.round(todayWasteKg * 100) / 100,
          todayWastePct: totalRecKg > 0 ? Math.round((todayWasteKg / totalRecKg) * 1000) / 10 : 0,
          connectedScales,
          disconnectedScales,
          lastInventoryDate: latestInv?.date || null,
          inventoryDiscrepancies: invDiscreps,
          stalePriceProducts: stalePrices,
        };

        if (expiredCount > 0) dashAlerts.push({ id: 'butcher_expired', severity: 'error', type: 'butcher_expired', message: `${expiredCount} lote${expiredCount > 1 ? 's' : ''} caducado${expiredCount > 1 ? 's' : ''} — Retirar inmediatamente`, count: expiredCount, route: '/saas/butcher-traceability' });
        if (outOfStockCount > 0) dashAlerts.push({ id: 'butcher_out_of_stock', severity: 'error', type: 'butcher_out_of_stock', message: `${outOfStockCount} producto${outOfStockCount > 1 ? 's' : ''} agotado${outOfStockCount > 1 ? 's' : ''}`, count: outOfStockCount, route: '/saas/butcher-products' });
        if (expiringCount > 0) dashAlerts.push({ id: 'butcher_expiring', severity: 'warning', type: 'butcher_expiring', message: `${expiringCount} lote${expiringCount > 1 ? 's' : ''} caduca${expiringCount > 1 ? 'n' : ''} en menos de 3 dias`, count: expiringCount, route: '/saas/butcher-traceability' });
        if (lowStockCount > 0) dashAlerts.push({ id: 'butcher_low_stock', severity: 'warning', type: 'butcher_low_stock', message: `${lowStockCount} producto${lowStockCount > 1 ? 's' : ''} con stock bajo`, count: lowStockCount, route: '/saas/butcher-inventory' });
        if (disconnectedScales > 0) dashAlerts.push({ id: 'butcher_scale_down', severity: 'error', type: 'butcher_scale_down', message: `${disconnectedScales} bascula${disconnectedScales > 1 ? 's' : ''} desconectada${disconnectedScales > 1 ? 's' : ''}`, count: disconnectedScales, route: '/saas/butcher-products' });
      }
    } catch { /* carniceria KPIs no bloquean el dashboard */ }

    // ── CONSTRUCTION KPIs ──
    let constructionKpis = null;
    try {
      const conDb = getConstructionDbName();
      await ensureDatabase(req, conDb);
      const conDocs = await getAllDocuments(req, conDb);
      const conByUser = conDocs.filter(d => d?.user_id === userId && !d?.deletedAt);

      const conProjects = conByUser.filter(d => d.type === 'construction_project');
      const conBudgets = conByUser.filter(d => d.type === 'construction_budget');
      const conWorkers = conByUser.filter(d => d.type === 'construction_worker');
      const conReports = conByUser.filter(d => d.type === 'construction_daily_report');
      const conIncidents = conByUser.filter(d => d.type === 'construction_incident');
      const conObraDocs = conByUser.filter(d => d.type === 'construction_obra_document');
      const conTasks = conByUser.filter(d => d.type === 'construction_task');

      if (conProjects.length > 0 || conBudgets.length > 0) {
        const obrasActivas = conProjects.filter(p => p.estado === 'en_obra');
        const obrasPausadas = conProjects.filter(p => p.estado === 'pausada');
        const activeWorkerProjIds = new Set(conWorkers.filter(w => w.activo && w.obraAsignada).map(w => w.obraAsignada));
        const obrasSinResponsable = conProjects.filter(p =>
          (p.estado === 'en_obra' || p.estado === 'planificación') && !p.responsable && !p.responsableNombre && !activeWorkerProjIds.has(p._id)
        );
        const presupuestosSinRespuesta = conBudgets.filter(b => b.estado === 'enviado' && b.updatedAt && (now - new Date(b.updatedAt)) / 86_400_000 >= 7);

        let cobrosVencidosCount = 0;
        let importeCobrosPendientes = 0;
        const acceptedBuds = conBudgets.filter(b => b.estado === 'aceptado');
        for (const b of acceptedBuds) {
          for (const pago of (b.pagos || [])) {
            if (!pago.pagado && pago.fecha && pago.fecha < today) {
              cobrosVencidosCount++;
              importeCobrosPendientes += Number(pago.importe || 0);
            }
          }
        }

        const todayReportWorkerIds = new Set(conReports.filter(r => r.fecha === today).map(r => r.trabajadorId));
        const activeProjectIds = new Set(obrasActivas.map(p => p._id));
        const trabajadoresSinParte = conWorkers.filter(w => w.activo && w.obraAsignada && activeProjectIds.has(w.obraAsignada) && !todayReportWorkerIds.has(w._id));

        const openInc = conIncidents.filter(i => ['abierta', 'en_revision', 'reabierta', 'en_progreso'].includes(i.estado));
        const criticalInc = openInc.filter(i => i.gravedad === 'critica' || i.gravedad === 'alta');
        const docsFaltantes = conObraDocs.filter(d => d.obligatorio && d.estado === 'pendiente');
        const docsCaducados = conObraDocs.filter(d => d.estado === 'caducado');

        let obraConMayorDesviacion = null;
        for (const p of conProjects) {
          if (p.estado !== 'en_obra' && p.estado !== 'finalizada') continue;
          const bud = acceptedBuds.find(b => b.proyectoId === p._id || b._id === p.presupuestoId);
          if (!bud) continue;
          const pres = Number(bud.totalConMargen) || 0;
          if (pres <= 0) continue;
          const coste = Number(p.costeAcumulado) || 0;
          const pct = Math.round((coste / pres) * 100);
          if (!obraConMayorDesviacion || pct > obraConMayorDesviacion.porcentaje) {
            obraConMayorDesviacion = { nombre: p.nombre, presupuesto: pres, costeAcumulado: coste, porcentaje: pct };
          }
        }

        constructionKpis = {
          obrasActivas: obrasActivas.length,
          obrasPausadas: obrasPausadas.length,
          obrasSinResponsable: obrasSinResponsable.length,
          obrasFinalizadasSinCerrar: conProjects.filter(p => p.estado === 'finalizada' && p.updatedAt && (now - new Date(p.updatedAt)) / 86_400_000 >= 15).length,
          presupuestosPendientes: conBudgets.filter(b => b.estado === 'enviado').length,
          presupuestosSinRespuesta: presupuestosSinRespuesta.length,
          cobrosVencidos: cobrosVencidosCount,
          importeCobrosPendientes,
          partesHoy: conReports.filter(r => r.fecha === today).length,
          partesPendientesValidacion: conReports.filter(r => r.estado === 'enviado').length,
          trabajadoresSinParte: trabajadoresSinParte.length,
          incidenciasAbiertas: openInc.length,
          incidenciasCriticas: criticalInc.length,
          obraConMayorDesviacion,
          documentosFaltantes: docsFaltantes.length,
          documentosCaducados: docsCaducados.length,
          tareasVencidas: conTasks.filter(t => (t.estado === 'pendiente' || t.estado === 'en_progreso') && t.fechaLimite && t.fechaLimite < today).length,
        };

        if (cobrosVencidosCount > 0) {
          dashAlerts.push({ id: 'construction_collection_overdue', severity: 'error', type: 'construction_collection_overdue', message: `${cobrosVencidosCount} cobro${cobrosVencidosCount > 1 ? 's' : ''} vencido${cobrosVencidosCount > 1 ? 's' : ''} — ${Math.round(importeCobrosPendientes).toLocaleString('es-ES')} € pendientes`, count: cobrosVencidosCount, route: '/saas/construction-budgets' });
        }
        if (criticalInc.length > 0) {
          dashAlerts.push({ id: 'construction_incident_critical', severity: 'error', type: 'construction_incident_critical', message: `${criticalInc.length} incidencia${criticalInc.length > 1 ? 's' : ''} crítica${criticalInc.length > 1 ? 's' : ''} abierta${criticalInc.length > 1 ? 's' : ''}`, count: criticalInc.length, route: '/saas/construction-execution' });
        }
        if (obrasSinResponsable.length > 0) {
          dashAlerts.push({ id: 'construction_project_no_responsible', severity: 'warning', type: 'construction_project_no_responsible', message: `${obrasSinResponsable.length} obra${obrasSinResponsable.length > 1 ? 's' : ''} sin responsable asignado`, count: obrasSinResponsable.length, route: '/saas/construction-projects' });
        }
        if (trabajadoresSinParte.length > 0 && now.getHours() >= 18) {
          dashAlerts.push({ id: 'construction_worker_no_report', severity: 'warning', type: 'construction_worker_no_report', message: `${trabajadoresSinParte.length} trabajador${trabajadoresSinParte.length > 1 ? 'es' : ''} sin parte hoy`, count: trabajadoresSinParte.length, route: '/saas/construction-execution' });
        }
        if (obraConMayorDesviacion && obraConMayorDesviacion.porcentaje >= 100) {
          dashAlerts.push({ id: 'construction_cost_overrun', severity: 'error', type: 'construction_cost_overrun', message: `"${obraConMayorDesviacion.nombre}" supera presupuesto (${obraConMayorDesviacion.porcentaje}%)`, count: 1, route: '/saas/construction-budgets' });
        }
        if (docsFaltantes.length > 0 || docsCaducados.length > 0) {
          const total = docsFaltantes.length + docsCaducados.length;
          dashAlerts.push({ id: 'construction_documents', severity: 'warning', type: 'construction_document_pending', message: `${docsCaducados.length} documento${docsCaducados.length !== 1 ? 's' : ''} caducado${docsCaducados.length !== 1 ? 's' : ''}, ${docsFaltantes.length} faltante${docsFaltantes.length !== 1 ? 's' : ''}`, count: total, route: '/saas/construction-workers' });
        }
        if (presupuestosSinRespuesta.length > 0) {
          dashAlerts.push({ id: 'construction_budget_no_response', severity: 'info', type: 'construction_budget_no_response', message: `${presupuestosSinRespuesta.length} presupuesto${presupuestosSinRespuesta.length > 1 ? 's' : ''} sin respuesta`, count: presupuestosSinRespuesta.length, route: '/saas/construction-budgets' });
        }
      }
    } catch { /* construction KPIs no bloquean el dashboard */ }

    const result = {
      ok: true,
      kpis: {
        stockCount,
        reservedCount,
        totalVehicles,
        enPreparacion,
        soldThisMonthCount: soldThisMonth.length,
        salesVolume,
        marginTotal,
        marginPct,
        cobrosPendientes,
        cobrosCount,
        oportunidades,
        pendingDeliveries,
        salesToday,
        salesTodayCount,
        salesMonth: salesMonthTotal,
        expensesMonth,
        estimatedProfit,
        cashBalance,
        criticalStockCount,
        stockValue: Math.round(stockValue * 100) / 100,
        lowStockCount,
        outOfStockCount,
        negativeStockCount,
        pendingPurchaseOrders,
        overduePurchaseOrders,
        purchasesMonth: Math.round(purchasesMonth * 100) / 100,
        activeWorkers,
        totalClockinsToday,
        openIncidents,
      },
      funnel,
      alerts: dashAlerts,
      quickFinance,
      ...(butcherKpis ? { butcherKpis } : {}),
      ...(constructionKpis ? { constructionKpis } : {}),
      ...(cleaningClientsKpis ? { cleaningClientsKpis } : {}),
      salesClosure,
      updatedAt: now.toISOString(),
    };

    cacheService.set(cacheKey, result, cacheService.TTL_PRESETS.KPI);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error calculando KPIs del dashboard',
    });
  }
});

// ─── D-02: Consulta de vistas MapReduce ───────────────────────────────────────
app.get('/api/views/:dbName/:designName/:viewName', cacheResponse({ ttl: cacheService.TTL_PRESETS.VIEW, keyFn: (req) => `view:${req.params.dbName}:${req.params.designName}:${req.params.viewName}:${JSON.stringify(req.query)}` }), async (req, res) => {
  try {
    const { dbName, designName, viewName } = req.params;
    const params = {};
    if (req.query.group) params.group = true;
    if (req.query.group_level !== undefined) params.group_level = Number(req.query.group_level);
    if (req.query.reduce !== undefined) params.reduce = req.query.reduce !== 'false';
    if (req.query.key !== undefined) params.key = JSON.parse(req.query.key);
    if (req.query.startkey !== undefined) params.startkey = JSON.parse(req.query.startkey);
    if (req.query.endkey !== undefined) params.endkey = JSON.parse(req.query.endkey);
    if (req.query.limit !== undefined) params.limit = Number(req.query.limit);
    if (req.query.descending) params.descending = true;
    const result = await queryView(req, dbName, designName, viewName, params);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error consultando vista' });
  }
});

// ─── D-06: Consulta de changelog de auditoría ────────────────────────────────
app.get('/api/changelog', async (req, res) => {
  try {
    const filters = {
      entity: req.query.entity ? String(req.query.entity) : undefined,
      actorUserId: req.query.actorUserId ? String(req.query.actorUserId) : undefined,
      entityId: req.query.entityId ? String(req.query.entityId) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 200,
    };
    const entries = await queryChangelog(req, filters);
    return res.json({ ok: true, entries });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error cargando changelog' });
  }
});

// ─── D-03: Endpoints de backup ───────────────────────────────────────────────
app.get('/api/backup/dbs', async (req, res) => {
  try {
    const listRes = await couchRequest(req, '/_all_dbs');
    const dbNames = await listRes.json().catch(() => []);
    if (!listRes.ok) return res.status(listRes.status).json({ error: 'Error listando bases de datos' });

    const dbInfo = await Promise.all(
      dbNames
        .filter((n) => !n.startsWith('_'))
        .map(async (name) => {
          const infoRes = await couchRequest(req, `/${encodeURIComponent(name)}`);
          const info = await infoRes.json().catch(() => ({}));
          return {
            name,
            docCount: info?.doc_count ?? 0,
            deletedCount: info?.doc_del_count ?? 0,
            diskSize: info?.sizes?.file ?? info?.disk_size ?? 0,
            dataSize: info?.sizes?.active ?? info?.data_size ?? 0,
          };
        }),
    );

    return res.json({ ok: true, dbs: dbInfo });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error obteniendo info de DBs' });
  }
});

// I-06: Exportación de DB es costosa — limitar a 10/min por usuario
app.get('/api/backup/export/:dbName', sensitiveOpLimiter, async (req, res) => {
  try {
    const dbName = String(req.params.dbName || '').trim();
    if (!dbName) return res.status(400).json({ error: 'Falta dbName' });

    const docsRes = await couchRequest(req, `/${encodeURIComponent(dbName)}/_all_docs?include_docs=true`);
    const payload = await docsRes.json().catch(() => ({}));
    if (!docsRes.ok) return res.status(docsRes.status).json({ error: payload?.reason || 'Error exportando DB' });

    const docs = (payload.rows || []).map((row) => row.doc).filter(Boolean);
    const exportData = {
      exportedAt: new Date().toISOString(),
      database: dbName,
      docCount: docs.length,
      docs,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${dbName}-backup-${new Date().toISOString().slice(0, 10)}.json"`);

    // ADM-04: Registrar exportación en auditoría
    const actor = req.user || {};
    void writeChangelog(req, {
      entity: 'export',
      entityId: dbName,
      entityLabel: `Exportación DB: ${dbName}`,
      action: 'export',
      actorUserId: actor.userId || actor.user_id || 'system',
      actorName: actor.fullName || actor.email || 'Admin',
      changes: {},
      metadata: { database: dbName, docCount: docs.length },
    });

    return res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error exportando DB' });
  }
});

// I-06: Replicación es una operación muy costosa — limitar a 10/min por usuario
app.post('/api/backup/replicate', sensitiveOpLimiter, async (req, res) => {
  try {
    const { targetUrl, targetUser, targetPassword, databases } = req.body || {};
    if (!targetUrl) return res.status(400).json({ ok: false, error: 'Falta targetUrl para la replicación' });

    const listRes = await couchRequest(req, '/_all_dbs');
    const allDbs = await listRes.json().catch(() => []);
    const dbsToReplicate = Array.isArray(databases) && databases.length > 0
      ? databases
      : allDbs.filter((n) => !n.startsWith('_'));

    const cfg = getCouchConfigFromService(req);
    const sourceBase = cfg.baseUrl;
    const sourceAuth = cfg.username ? `${encodeURIComponent(cfg.username)}:${encodeURIComponent(cfg.password)}@` : '';
    const targetBase = String(targetUrl).replace(/\/+$/, '');
    const targetAuth = targetUser ? `${encodeURIComponent(targetUser)}:${encodeURIComponent(targetPassword || '')}@` : '';
    const targetBaseWithAuth = targetBase.replace(/^(https?:\/\/)/, `$1${targetAuth}`);
    const sourceBaseWithAuth = sourceBase.replace(/^(https?:\/\/)/, `$1${sourceAuth}`);

    const results = [];
    for (const dbName of dbsToReplicate) {
      const body = JSON.stringify({
        source: `${sourceBaseWithAuth}/${encodeURIComponent(dbName)}`,
        target: `${targetBaseWithAuth}/${encodeURIComponent(dbName)}`,
        create_target: true,
      });
      const repRes = await fetch(`${cfg.baseUrl}/_replicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.username ? { Authorization: `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}` } : {}),
        },
        body,
      });
      const repPayload = await repRes.json().catch(() => ({}));
      results.push({ db: dbName, ok: repRes.ok, details: repPayload });
    }

    const allOk = results.every((r) => r.ok);
    return res.status(allOk ? 200 : 207).json({ ok: allOk, results, replicatedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error en replicación' });
  }
});

// ─── Backup completo: exportar todo CouchDB en ZIP ───────────────────────────

app.get('/api/backup/export-all', requireAuthAndEmailVerified, sensitiveOpLimiter, async (req, res) => {
  const role = req.authUser?.role;
  if (!['Admin', 'Gerente'].includes(role)) {
    return res.status(403).json({ ok: false, error: 'Se requiere rol Admin o Gerente' });
  }
  try {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();

    const listRes = await couchRequest(req, '/_all_dbs');
    const dbNames = await listRes.json().catch(() => []);
    if (!listRes.ok) return res.status(500).json({ ok: false, error: 'Error listando bases de datos' });

    const filteredDbs = dbNames.filter((n) => !n.startsWith('_'));
    let totalDocs = 0;

    for (const dbName of filteredDbs) {
      const docsRes = await couchRequest(req, `/${encodeURIComponent(dbName)}/_all_docs?include_docs=true`);
      const payload = await docsRes.json().catch(() => ({}));
      const docs = (payload.rows || []).map((r) => r.doc).filter(Boolean);
      totalDocs += docs.length;
      zip.file(`${dbName}.json`, JSON.stringify({ database: dbName, docCount: docs.length, docs }, null, 2));
    }

    const meta = {
      exportedAt: new Date().toISOString(),
      dbCount: filteredDbs.length,
      totalDocs,
      version: '1.0',
    };
    zip.file('_manifest.json', JSON.stringify(meta, null, 2));

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });

    const actor = req.user || {};
    void writeChangelog(req, {
      entity: 'export',
      entityId: 'full-backup',
      entityLabel: 'Backup completo CouchDB (ZIP)',
      action: 'export',
      actorUserId: actor.userId || actor.user_id || 'system',
      actorName: actor.fullName || actor.email || 'Admin',
      changes: {},
      metadata: { dbCount: filteredDbs.length, totalDocs },
    });

    const filename = `couchdb-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    return res.send(zipBuffer);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error generando backup ZIP' });
  }
});

// ─── Backup completo: importar ZIP a CouchDB ─────────────────────────────────

app.post('/api/backup/import-all', requireAuthAndEmailVerified, sensitiveOpLimiter, async (req, res) => {
  const role = req.authUser?.role;
  if (!['Admin', 'Gerente'].includes(role)) {
    return res.status(403).json({ ok: false, error: 'Se requiere rol Admin o Gerente' });
  }
  try {
    const { default: JSZip } = await import('jszip');

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo' });

    const zip = await JSZip.loadAsync(buffer);
    const fileNames = Object.keys(zip.files).filter((n) => n.endsWith('.json') && n !== '_manifest.json');
    const results = [];
    let totalRestored = 0;

    for (const fileName of fileNames) {
      const content = await zip.file(fileName)?.async('string');
      if (!content) continue;
      let parsed;
      try { parsed = JSON.parse(content); } catch { continue; }

      const dbName = parsed.database || fileName.replace(/\.json$/, '');
      const docs = Array.isArray(parsed.docs) ? parsed.docs : [];
      if (docs.length === 0) { results.push({ db: dbName, ok: true, docs: 0, skipped: true }); continue; }

      await couchRequest(req, `/${encodeURIComponent(dbName)}`, { method: 'PUT' });

      const cleanDocs = docs.map((doc) => {
        const { _rev, ...rest } = doc;
        return rest;
      });

      const bulkRes = await couchRequest(req, `/${encodeURIComponent(dbName)}/_bulk_docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docs: cleanDocs }),
      });
      const bulkData = await bulkRes.json().catch(() => []);
      const inserted = Array.isArray(bulkData) ? bulkData.filter((r) => r.ok).length : 0;
      const errors = Array.isArray(bulkData) ? bulkData.filter((r) => r.error).length : 0;
      totalRestored += inserted;
      results.push({ db: dbName, ok: errors === 0, docs: inserted, errors });
    }

    const actor = req.user || {};
    void writeChangelog(req, {
      entity: 'export',
      entityId: 'full-import',
      entityLabel: 'Importación completa CouchDB (ZIP)',
      action: 'create',
      actorUserId: actor.userId || actor.user_id || 'system',
      actorName: actor.fullName || actor.email || 'Admin',
      changes: {},
      metadata: { dbCount: results.length, totalRestored },
    });

    const allOk = results.every((r) => r.ok);
    return res.json({ ok: allOk, results, totalRestored, importedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error importando backup ZIP' });
  }
});

// ─── Resumen de backup (sin nombres de DB) ───────────────────────────────────

app.get('/api/backup/summary', cacheResponse({ ttl: cacheService.TTL_PRESETS.SUMMARY, keyFn: () => 'backup:summary' }), async (req, res) => {
  try {
    const listRes = await couchRequest(req, '/_all_dbs');
    const dbNames = await listRes.json().catch(() => []);
    if (!listRes.ok) return res.status(500).json({ ok: false, error: 'Error listando bases de datos' });

    const filtered = dbNames.filter((n) => !n.startsWith('_'));
    let totalDocs = 0;
    let totalDiskSize = 0;

    for (const name of filtered) {
      const infoRes = await couchRequest(req, `/${encodeURIComponent(name)}`);
      const info = await infoRes.json().catch(() => ({}));
      totalDocs += info?.doc_count ?? 0;
      totalDiskSize += info?.sizes?.file ?? info?.disk_size ?? 0;
    }

    return res.json({ ok: true, dbCount: filtered.length, totalDocs, totalDiskSize });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error obteniendo resumen' });
  }
});

// ─── I-05: Gestión del backup automático ─────────────────────────────────────

// Estado del scheduler (lectura pública, sin auth para facilitar monitorización)
app.get('/api/backup/status', (req, res) => {
  res.json({ ok: true, backup: getBackupState() });
});

// Ejecutar backup manual inmediato (sólo admin)
app.post('/api/backup/run', requireAuthAndEmailVerified, sensitiveOpLimiter, async (req, res) => {
  const role = req.authUser?.role;
  if (!['Admin', 'Gerente'].includes(role)) {
    return res.status(403).json({ ok: false, error: 'Se requiere rol Admin o Gerente' });
  }
  try {
    const result = await runBackup();
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error en backup manual' });
  }
});

// ─── ADM-02: Numeración configurable de documentos ───────────────────────────

const SETTINGS_DB = normalizeDbName(
  `${(process.env.COUCHDB_DB || process.env.VITE_COUCHDB_DB || 'vertial').replace(/\/+$/, '')}-settings`,
);
const NUMBERING_CONFIG_ID = 'numbering-config';

const DEFAULT_NUMBERING = {
  invoice: { prefix: 'FAC', year: true, separator: '-', padding: 4, counter: 0 },
  quote: { prefix: 'PRE', year: true, separator: '-', padding: 4, counter: 0 },
  contract: { prefix: 'CON', year: true, separator: '-', padding: 4, counter: 0 },
  purchase: { prefix: 'COM', year: true, separator: '-', padding: 4, counter: 0 },
  sale: { prefix: 'VTA', year: true, separator: '-', padding: 4, counter: 0 },
  service_contract: { prefix: 'CTR', year: true, separator: '-', padding: 4, counter: 0 },
};

function buildDocNumber(cfg, counter) {
  const year = cfg.year ? String(new Date().getFullYear()) : null;
  const seq = String(counter).padStart(Number(cfg.padding) || 4, '0');
  const sep = cfg.separator || '-';
  const parts = [cfg.prefix, year, seq].filter(Boolean);
  return parts.join(sep);
}

app.get('/api/settings/numbering', requireAuthAndEmailVerified, cacheResponse({ ttl: cacheService.TTL_PRESETS.SETTINGS, keyFn: () => 'settings:numbering' }), async (req, res) => {
  try {
    await ensureDatabase(req, SETTINGS_DB);
    const docs = await getAllDocuments(req, SETTINGS_DB);
    const config = docs.find((d) => d._id === NUMBERING_CONFIG_ID);
    const numbering = config ? { ...DEFAULT_NUMBERING, ...config.numbering } : DEFAULT_NUMBERING;
    return res.json({ ok: true, numbering, _rev: config?._rev });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error cargando numeración' });
  }
});

app.put('/api/settings/numbering', requireAuthAndEmailVerified, async (req, res) => {
  try {
    const { numbering, _rev } = req.body || {};
    if (!numbering || typeof numbering !== 'object') {
      return res.status(400).json({ ok: false, error: 'Falta el objeto numbering' });
    }
    await ensureDatabase(req, SETTINGS_DB);
    const doc = {
      _id: NUMBERING_CONFIG_ID,
      ..._rev ? { _rev } : {},
      type: 'numbering_config',
      numbering,
      updatedAt: new Date().toISOString(),
    };
    const result = await putDocument(req, SETTINGS_DB, NUMBERING_CONFIG_ID, doc);
    const newRev = result?.rev || result?._rev;
    cacheService.invalidate('settings:numbering');
    return res.json({ ok: true, _rev: newRev });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error guardando numeración' });
  }
});

app.post('/api/settings/numbering/next/:docType', requireAuthAndEmailVerified, async (req, res) => {
  try {
    const docType = String(req.params.docType || '').trim();
    if (!docType) return res.status(400).json({ ok: false, error: 'Falta docType' });

    await ensureDatabase(req, SETTINGS_DB);
    const docs = await getAllDocuments(req, SETTINGS_DB);
    let config = docs.find((d) => d._id === NUMBERING_CONFIG_ID);

    const numbering = { ...DEFAULT_NUMBERING, ...(config?.numbering || {}) };
    if (!numbering[docType]) {
      return res.status(400).json({ ok: false, error: `Tipo de documento desconocido: ${docType}` });
    }

    const typeCfg = { ...numbering[docType] };
    typeCfg.counter = (Number(typeCfg.counter) || 0) + 1;
    numbering[docType] = typeCfg;

    const updatedDoc = {
      _id: NUMBERING_CONFIG_ID,
      ...(config?._rev ? { _rev: config._rev } : {}),
      type: 'numbering_config',
      numbering,
      updatedAt: new Date().toISOString(),
    };
    await putDocument(req, SETTINGS_DB, NUMBERING_CONFIG_ID, updatedDoc);

    const number = buildDocNumber(typeCfg, typeCfg.counter);
    return res.json({ ok: true, number, counter: typeCfg.counter });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error generando número' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API: Code Explorer – directory tree + file content
// ─────────────────────────────────────────────────────────────────────────────

const CODE_ROOT = __dirname;
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage', '__pycache__']);
const MAX_FILE_SIZE = 512 * 1024;

function buildTree(dirPath, relBase = '') {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const result = [];
  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });
  for (const entry of sorted) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push({ name: entry.name, path: rel, type: 'dir', children: buildTree(path.join(dirPath, entry.name), rel) });
    } else {
      result.push({ name: entry.name, path: rel, type: 'file' });
    }
  }
  return result;
}

app.get('/api/code/tree', (req, res) => {
  try {
    const tree = buildTree(CODE_ROOT);
    return res.json({ ok: true, root: '/', tree });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Error leyendo directorio' });
  }
});

app.get('/api/code/file', (req, res) => {
  try {
    const filePath = String(req.query.path || '');
    if (!filePath || filePath.includes('..')) return res.status(400).json({ ok: false, error: 'Ruta no válida' });
    const abs = path.join(CODE_ROOT, filePath);
    if (!abs.startsWith(CODE_ROOT)) return res.status(403).json({ ok: false, error: 'Acceso denegado' });
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return res.status(404).json({ ok: false, error: 'Archivo no encontrado' });
    if (fs.statSync(abs).size > MAX_FILE_SIZE) return res.status(413).json({ ok: false, error: 'Archivo demasiado grande' });
    const content = fs.readFileSync(abs, 'utf-8');
    const ext = path.extname(abs).slice(1);
    return res.json({ ok: true, path: filePath, content, extension: ext });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Error leyendo archivo' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

// API-04: SDK y widget embebible
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath, {
  setHeaders: (res, filePath) => {
    const normalized = String(filePath || '').replace(/\\/g, '/');
    const isRuntimeCritical =
      normalized.endsWith('/index.html') ||
      normalized.endsWith('/sw.js') ||
      normalized.endsWith('/registerSW.js') ||
      normalized.endsWith('/manifest.webmanifest');

    if (isRuntimeCritical) {
      // Evita que navegador/proxy retenga shell/SW antiguos tras cada deploy.
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return;
    }

    if (/\/assets\/.+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(normalized)) {
      // Los assets con hash son inmutables y seguros de cachear largo tiempo.
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// Servir SPA (React Router) en recargas/direct links como /mecanico.
// Se excluyen rutas API y archivos estáticos con extensión.
app.get(/.*/, (req, res, next) => {
  const reqPath = String(req.path || '');
  if (reqPath.startsWith('/api/')) return next();
  if (path.extname(reqPath)) return next();
  return res.sendFile(path.join(distPath, 'index.html'));
});

// B-07: Handlers centralizados al final de todos los middlewares.
app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  logger.info({ tag: 'BOOT', port: PORT, env: process.env.NODE_ENV || 'development' },
    `Backend Express escuchando en http://localhost:${PORT}`);
  logger.info({ tag: 'BOOT' }, 'Endpoints: /live, /health, /metrics, /api/stats');
});

// SSE y proxies: sin timeout de request (Node 20+ default 5 min cortaría streams largos).
server.requestTimeout = 0;
server.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 3_600_000);
server.keepAliveTimeout = Number(process.env.HTTP_KEEPALIVE_TIMEOUT_MS || 65_000);
server.maxConnections = Number(process.env.HTTP_MAX_CONNECTIONS || 500);

// Docker envía SIGTERM al recrear el contenedor. Cerrar conexiones SSE y el listener
// evita RST abruptos y "connection refused" en Nginx durante el swap de deploy.
let shuttingDown = false;
function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ tag: 'BOOT', signal }, 'Apagado graceful iniciado');
  closeAllSSEClients();
  server.close(() => {
    logger.info({ tag: 'BOOT' }, 'Servidor HTTP cerrado');
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn({ tag: 'BOOT' }, 'Timeout apagado graceful — forzando salida');
    process.exit(1);
  }, Number(process.env.SHUTDOWN_TIMEOUT_MS || 15_000)).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.on('connection', (socket) => {
  activeSockets.add(socket);
  socket.on('close', () => {
    activeSockets.delete(socket);
  });
});

// ─── D-01/D-02: Inicialización de índices y design docs ──────────────────────
async function initializeCouchDB() {
  const initReq = null;
  try {
    const { attempts } = await waitForCouchDbReady(initReq);
    if (attempts > 1) {
      logger.info({ tag: 'INIT', attempts }, 'CouchDB disponible tras reintentos');
    }
  } catch (err) {
    const { baseUrl } = getCouchConfigFromService(initReq);
    logger.warn(
      {
        tag: 'INIT',
        err: err instanceof Error ? err.message : String(err),
        couch: baseUrl || 'unset',
      },
      'CouchDB no alcanzable: omitiendo índices y design docs en este arranque. Local: docker compose -f deploy/docker-compose.couch-local.yml --env-file .env up -d',
    );
    return;
  }

  const dbs = [VEHICLES_DB, ACCOUNTS_DB, NOTIFICATIONS_DB];
  for (const db of dbs) {
    await setupDatabaseIndexes(initReq, db).catch((err) =>
      logger.error({ tag: 'INIT', db, err: err?.message }, `Índices fallaron en ${db}`),
    );
  }
  await ensureDesignDocument(initReq, VEHICLES_DB, 'stats', VEHICLES_DESIGN_VIEWS).catch((err) =>
    logger.error({ tag: 'INIT', db: VEHICLES_DB, err: err?.message }, 'Design doc vehicles falló'),
  );
  await ensureDesignDocument(initReq, ACCOUNTS_DB, 'stats', ACCOUNTS_DESIGN_VIEWS).catch((err) =>
    logger.error({ tag: 'INIT', db: ACCOUNTS_DB, err: err?.message }, 'Design doc accounts falló'),
  );
  await ensureDesignDocument(initReq, NOTIFICATIONS_DB, 'stats', NOTIFICATIONS_DESIGN_VIEWS).catch((err) =>
    logger.error({ tag: 'INIT', db: NOTIFICATIONS_DB, err: err?.message }, 'Design doc notifications falló'),
  );
  logger.info({ tag: 'INIT' }, 'Índices Mango y vistas MapReduce inicializados');
}

// Couch primero; SaaS bootstrap después (evita carrera en prod si Couch tarda).
setTimeout(() => {
  initializeCouchDB()
    .catch((err) =>
      logger.error({ tag: 'INIT', err: err?.message }, 'Error inicializando CouchDB'),
    )
    .finally(() => {
      void runSaasBootstrapIfEnabled();
    });
}, 3000);

// V-10 → ALERT_ENGINE: Motor unificado de alertas (Compras + Stock + Ventas + Operación)
// Reemplaza el antiguo runStockAlerts individual. Fase 1.
startAlertEngine();

// ALDV-02: Motor alertas delivery — eventos + barrido seguridad 15 min (umbrales CEO)
startDeliveryAlertEngine();

// ALLP-03: Motor alertas limpieza — ciclo rápido 120s independiente
startCleaningAlertEngine();

// CARN-ALR: Motor alertas carniceria — principal 30 min + bascula 5 min
startButcherAlertEngine();

// PO-01: Pedidos automáticos a proveedores — cada 2 horas
setTimeout(() => runAutoOrdersForAllUsers().catch(() => null), 15000);
setInterval(() => runAutoOrdersForAllUsers().catch(() => null), 2 * 3600000);

// I-05: Backup automático de CouchDB con gzip + rotación
startBackupScheduler();

// Facturas proveedor por email: polling IMAP (SUPPLIER_INVOICE_IMAP_* y/o credenciales por cuenta en CouchDB)
setTimeout(() => {
  startSupplierInvoicePolling().catch((err) =>
    logger.error({ tag: 'SINV_SCHED', err: err?.message }, 'Error iniciando polling facturas proveedor'),
  );
}, 22_000);

// S-06: Subscription lifecycle — trial expiry, grace period, suspension + emails
startSubscriptionLifecycle();

// CRM-02: Workflow engine scheduler — runs every 4 hours
async function runAllWorkflows() {
  try {
    const fakeReq = { headers: {} };
    // Load distinct user IDs from workflows DB
    const res = await couchRequest(fakeReq, `/${encodeURIComponent(WORKFLOWS_DB)}/_all_docs?include_docs=true`);
    if (!res.ok) return;
    const body = await res.json().catch(() => ({ rows: [] }));
    const userIds = [
      ...new Set(
        (body.rows || [])
          .map((r) => r.doc)
          .filter((d) => d && d.type === 'workflow' && !d.deletedAt && d.enabled !== false)
          .map((d) => d.user_id)
          .filter(Boolean),
      ),
    ];

    for (const userId of userIds) {
      await runWorkflowsForUser(fakeReq, userId).catch((err) =>
        logger.warn({ tag: 'WORKFLOWS', userId, err: err?.message }, 'Error ejecutando workflows'),
      );
    }
    if (userIds.length > 0) {
      logger.info({ tag: 'WORKFLOWS', users: userIds.length }, 'Workflows CRM ejecutados');
    }
  } catch (err) {
    logger.error({ tag: 'WORKFLOWS', err: err?.message }, 'Error en scheduler de workflows');
  }
}

setTimeout(() => runAllWorkflows().catch(() => null), 20000);
setInterval(() => runAllWorkflows().catch(() => null), 4 * 3600000);

// C-08/C-09: Lead engine — reasignación + SLA — cada hora
async function runLeadEngine() {
  try {
    const fakeReq = { headers: {} };
    const res = await couchRequest(fakeReq, `/${encodeURIComponent(ACCOUNTS_DB)}/_all_docs?include_docs=true`);
    if (!res.ok) return;
    const body = await res.json().catch(() => ({ rows: [] }));
    const userIds = [
      ...new Set(
        (body.rows || [])
          .map((r) => r.doc)
          .filter((d) => d && d.type === 'account' && !d.deletedAt)
          .map((d) => d.user_id)
          .filter(Boolean),
      ),
    ];

    for (const userId of userIds) {
      await runLeadEngineForUser(fakeReq, userId, { NOTIFICATIONS_DB }).catch((err) =>
        logger.warn({ tag: 'LEAD_ENGINE', userId, err: err?.message }, 'Error en lead engine'),
      );
    }
    if (userIds.length > 0) {
      logger.info({ tag: 'LEAD_ENGINE', users: userIds.length }, 'Lead engine (SLA + reasignación) ejecutado');
    }
  } catch (err) {
    logger.error({ tag: 'LEAD_ENGINE', err: err?.message }, 'Error en scheduler de lead engine');
  }
}

setTimeout(() => runLeadEngine().catch(() => null), 30000);
setInterval(() => runLeadEngine().catch(() => null), 3600000);

setInterval(() => {
  const mem = process.memoryUsage();
  metrics.peakRssBytes = Math.max(metrics.peakRssBytes, mem.rss);
  metrics.peakHeapUsedBytes = Math.max(metrics.peakHeapUsedBytes, mem.heapUsed);

  logger.info({
    tag: 'MONITOR',
    uptimeS: Math.floor(process.uptime()),
    requests: metrics.totalRequests,
    inMB: bytesToMB(metrics.bytesIn),
    outMB: bytesToMB(metrics.bytesOut),
    rssMB: bytesToMB(mem.rss),
    heapMB: bytesToMB(mem.heapUsed),
    sockets: activeSockets.size,
    visitors: uniqueVisitors.size,
  });

  // Alertas "gordas": RAM alta y disco bajo (anti-spam por cooldown).
  (async () => {
    try {
      const rssMB = bytesToMB(mem.rss);
      const heapMB = bytesToMB(mem.heapUsed);

      // RAM alta: RSS > 1200 MB o heap > 900 MB (ajustable por env).
      const rssLimitMB = Number(process.env.ALERT_RSS_MB || 1200);
      const heapLimitMB = Number(process.env.ALERT_HEAP_MB || 900);
      if (rssMB >= rssLimitMB || heapMB >= heapLimitMB) {
        await sendAdminAlert({
          key: 'ram_high',
          subject: `⚠️ Vertial: RAM alta (rss=${rssMB}MB heap=${heapMB}MB)`,
          html: `<p><b>RAM alta</b></p><ul><li>rssMB: ${rssMB}</li><li>heapMB: ${heapMB}</li><li>host: ${os.hostname()}</li></ul>`,
          cooldownMs: 30 * 60_000,
        });
      }

      // Disco casi lleno: usa statfs sobre el directorio del proyecto (Linux/VPS).
      if (typeof fs.statfs === 'function') {
        const st = await fs.promises.statfs(process.cwd());
        const freeBytes = Number(st.bavail) * Number(st.bsize);
        const totalBytes = Number(st.blocks) * Number(st.bsize);
        if (totalBytes > 0) {
          const freePct = (freeBytes / totalBytes) * 100;
          const freeGB = Math.round((freeBytes / (1024 ** 3)) * 10) / 10;
          const limitPct = Number(process.env.ALERT_DISK_FREE_PCT || 10);
          const limitGB = Number(process.env.ALERT_DISK_FREE_GB || 2);
          if (freePct <= limitPct || freeGB <= limitGB) {
            await sendAdminAlert({
              key: 'disk_low',
              subject: `⚠️ Vertial: disco bajo (${freeGB}GB libres, ${freePct.toFixed(1)}%)`,
              html: `<p><b>Disco casi lleno</b></p><ul><li>freeGB: ${freeGB}</li><li>freePct: ${freePct.toFixed(2)}%</li><li>path: ${process.cwd()}</li><li>host: ${os.hostname()}</li></ul>`,
              cooldownMs: 60 * 60_000,
            });
          }
        }
      }
    } catch (err) {
      logger.warn({ tag: 'ADMIN_ALERT', err: err?.message }, 'No se pudo evaluar RAM/disco para alertas');
    }
  })();
}, 30000);

// CouchDB caído: chequeo periódico del /_up (usa el mismo healthService).
let lastCouchOk = true;
setInterval(async () => {
  try {
    const cfg = getCouchConfigFromService({ headers: {} });
    const authHeader = buildCouchAuthHeader({ headers: {} });
    const result = await runHealthCheck({
      baseUrl: cfg.baseUrl,
      authHeader,
      activeSockets: activeSockets.size,
      // opcional: limitar trabajo
      mode: 'couchdb',
    });

    const couchOk = !!result?.checks?.couchdb?.ok;
    if (!couchOk && lastCouchOk) {
      await sendAdminAlert({
        key: 'couchdb_down',
        subject: '🚨 Vertial: CouchDB caído / no responde',
        html: `<p><b>CouchDB no responde</b></p><pre>${escapeHtml(JSON.stringify(result?.checks?.couchdb || result, null, 2))}</pre>`,
        cooldownMs: 15 * 60_000,
      });
    }
    lastCouchOk = couchOk;
  } catch (err) {
    if (lastCouchOk) {
      await sendAdminAlert({
        key: 'couchdb_down',
        subject: '🚨 Vertial: error chequeando CouchDB',
        html: `<p><b>Error chequeando CouchDB</b></p><pre>${escapeHtml(String(err?.message || err))}</pre>`,
        cooldownMs: 15 * 60_000,
      });
    }
    lastCouchOk = false;
  }
}, Number(process.env.ALERT_COUCH_INTERVAL_MS || 60_000));

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
