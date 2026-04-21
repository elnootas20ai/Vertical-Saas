import { v4 as uuidv4 } from 'uuid';

const LOGS_DB = 'activity-logs';

const SKIP_PATH_PREFIXES = [
  '/health',
  '/metrics',
  '/api/plugin/',
  '/api/cursor/',
  '/api/sse',
  '/api/stats',
];

const RESOURCE_LABELS = {
  businesses: 'negocio',
  vehicles: 'vehículo',
  clients: 'cliente',
  leads: 'lead',
  sales: 'venta',
  invoices: 'factura',
  finance: 'finanza',
  documents: 'documento',
  settings: 'configuración',
  users: 'usuario',
  auth: 'sesión',
  notifications: 'notificación',
  workshop: 'taller',
  delivery: 'entrega',
  cleaning: 'limpieza',
  appointments: 'cita',
  booking: 'reserva',
  tradeins: 'tasación',
  email: 'email',
  webhooks: 'webhook',
  workflows: 'workflow',
  subscriptions: 'suscripción',
  tokens: 'token',
  groups: 'grupo',
  orgchart: 'organigrama',
  locations: 'ubicación',
  segments: 'segmento',
  assignment: 'asignación',
  portal: 'portal',
  gdpr: 'RGPD',
  chat: 'chat',
  push: 'notificación push',
  backup: 'backup',
  couch: 'base de datos',
  dashboard: 'dashboard',
  changelog: 'historial de cambios',
  ocr: 'OCR',
  calls: 'llamada',
  affiliates: 'afiliado',
};

function getCouchBaseUrl() {
  const url = process.env.COUCHDB_URL || process.env.VITE_COUCHDB_URL || 'http://localhost:5984';
  return url.replace(/\/+$/, '');
}

function getCouchAuth() {
  const user = process.env.COUCHDB_USER || process.env.VITE_COUCHDB_USER || '';
  const pass = process.env.COUCHDB_PASSWORD || process.env.VITE_COUCHDB_PASSWORD || '';
  if (!user || !pass) return '';
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

let _dbEnsured = false;
let _designEnsured = false;

async function ensureLogsDb() {
  if (_dbEnsured) return;
  try {
    const base = getCouchBaseUrl();
    const auth = getCouchAuth();
    const headers = auth ? { Authorization: auth } : {};
    await fetch(`${base}/${LOGS_DB}`, { method: 'PUT', headers }).catch(() => null);
    _dbEnsured = true;
  } catch {
    // Silenciar errores de inicialización
  }
}

async function ensureDesignDoc() {
  if (_designEnsured) return;
  try {
    const base = getCouchBaseUrl();
    const auth = getCouchAuth();
    const headers = { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) };
    const designId = '_design/logs';
    const designUrl = `${base}/${LOGS_DB}/${designId}`;

    const existing = await fetch(designUrl, { headers: auth ? { Authorization: auth } : {} }).catch(() => null);
    let rev = null;
    if (existing && existing.ok) {
      const data = await existing.json().catch(() => ({}));
      rev = data._rev || null;
    }

    const design = {
      _id: designId,
      ...(rev ? { _rev: rev } : {}),
      language: 'javascript',
      views: {
        by_timestamp: {
          map: 'function(doc) { if (doc.type === "activity-log") { emit(doc.timestamp, null); } }',
        },
        by_user: {
          map: 'function(doc) { if (doc.type === "activity-log") { emit(doc.user, null); } }',
          reduce: '_count',
        },
        by_category: {
          map: 'function(doc) { if (doc.type === "activity-log") { emit(doc.category, null); } }',
          reduce: '_count',
        },
        by_level: {
          map: 'function(doc) { if (doc.type === "activity-log") { emit(doc.level, null); } }',
          reduce: '_count',
        },
        by_action: {
          map: 'function(doc) { if (doc.type === "activity-log") { emit(doc.action, null); } }',
          reduce: '_count',
        },
      },
    };

    await fetch(designUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(design),
    }).catch(() => null);

    _designEnsured = true;
  } catch {
    // Silenciar errores de inicialización
  }
}

async function saveLog(doc) {
  try {
    const base = getCouchBaseUrl();
    const auth = getCouchAuth();
    const headers = { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) };
    await fetch(`${base}/${LOGS_DB}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(doc),
    });
  } catch {
    // Silenciar errores de escritura para no afectar la respuesta
  }
}

function detectCategory(method, path) {
  const p = path.toLowerCase();
  if (p.includes('/auth') || p.includes('/login') || p.includes('/logout') || p.includes('/register')) {
    return 'auth';
  }
  if (p.includes('/settings') || p.includes('/config') || p.includes('/numbering')) {
    return 'config';
  }
  if (
    p.includes('/subscriptions') ||
    p.includes('/invoices') ||
    p.includes('/finance') ||
    p.includes('/payments') ||
    p.includes('/monei')
  ) {
    return 'payment';
  }
  if (p.includes('/backup') || p.includes('/export') || p.includes('/replicate')) {
    return 'export';
  }
  if (p.includes('/api/v1') || p.includes('/api/public') || p.includes('/webhooks') || p.includes('/tokens')) {
    return 'api';
  }
  if (method === 'GET') {
    return 'navigation';
  }
  return 'crud';
}

function extractResource(path) {
  const segments = path.split('/').filter((s) => s && !s.startsWith(':'));
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i].toLowerCase().replace(/[-_]/g, '');
    for (const [key, label] of Object.entries(RESOURCE_LABELS)) {
      if (seg.includes(key.replace(/[-_]/g, '').toLowerCase())) {
        return label;
      }
    }
  }
  return segments[segments.length - 1] || 'recurso';
}

const ACTION_VERBS = {
  GET: { success: 'Consultó', error: 'Error al consultar' },
  POST: { success: 'Creó', error: 'Error al crear' },
  PUT: { success: 'Actualizó', error: 'Error al actualizar' },
  PATCH: { success: 'Modificó', error: 'Error al modificar' },
  DELETE: { success: 'Eliminó', error: 'Error al eliminar' },
};

const PATH_DETAILS = {
  '/api/auth/login': { POST: 'Inició sesión' },
  '/api/auth/logout': { POST: 'Cerró sesión', GET: 'Cerró sesión' },
  '/api/auth/register': { POST: 'Registró nueva cuenta' },
  '/api/auth/me': { GET: 'Consultó su perfil' },
  '/api/auth/refresh': { POST: 'Renovó token de sesión' },
  '/api/backup/run': { POST: 'Ejecutó backup manual' },
  '/api/backup/replicate': { POST: 'Inició replicación de base de datos' },
  '/api/ocr/scan': { POST: 'Escaneó documento con OCR' },
};

function generateDetails(method, originalPath, statusCode) {
  const cleanPath = originalPath.split('?')[0];

  // Buscar detalles específicos para rutas conocidas
  for (const [pattern, methods] of Object.entries(PATH_DETAILS)) {
    if (cleanPath === pattern || cleanPath.startsWith(pattern)) {
      const detail = methods[method];
      if (detail) return detail;
    }
  }

  const resource = extractResource(cleanPath);
  const isError = statusCode >= 400;
  const verbs = ACTION_VERBS[method] || { success: 'Accedió a', error: 'Error al acceder a' };
  const verb = isError ? verbs.error : verbs.success;

  // Casos especiales por método y contexto
  if (method === 'POST' && cleanPath.includes('/auth/login')) return 'Inició sesión';
  if (method === 'POST' && cleanPath.includes('/auth/logout')) return 'Cerró sesión';
  if (method === 'GET' && cleanPath.includes('/export')) return `Exportó ${resource}`;
  if (cleanPath.includes('/stats')) return `Consultó estadísticas de ${resource}`;
  if (cleanPath.includes('/search')) return `Buscó en ${resource}`;

  return `${verb} ${resource}`;
}

function determineLevel(method, statusCode) {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warning';
  if (method === 'GET') return 'info';
  return 'success';
}

function getClientIp(req) {
  const header = req.headers['x-forwarded-for'];
  if (typeof header === 'string' && header.length > 0) {
    return header.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

// Inicializar DB y design doc de forma asíncrona al cargar el módulo
Promise.resolve()
  .then(() => ensureLogsDb())
  .then(() => ensureDesignDoc())
  .catch(() => null);

export function activityLogger(req, res, next) {
  const path = req.originalUrl || req.url || '';

  // Saltar rutas que no queremos loguear
  const shouldSkip = SKIP_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
  if (shouldSkip) return next();

  // Saltar rutas estáticas (con extensión de archivo)
  if (/\.[a-z0-9]{1,6}(\?.*)?$/i.test(path)) return next();

  const method = req.method;
  if (method === 'OPTIONS') return next();

  res.on('finish', () => {
    try {
      const statusCode = res.statusCode;
      const user =
        req.authUser?.email ||
        req.authUser?.userId ||
        req.authUser?.user_id ||
        'anonymous';

      const cleanPath = path.split('?')[0];
      const action = `${method} ${cleanPath}`;
      const category = detectCategory(method, cleanPath);
      const level = determineLevel(method, statusCode);
      const details = generateDetails(method, path, statusCode);
      const resource = extractResource(cleanPath);
      const ip = getClientIp(req);

      const doc = {
        _id: `log:${Date.now()}:${uuidv4()}`,
        type: 'activity-log',
        timestamp: new Date().toISOString(),
        user,
        action,
        category,
        details,
        level,
        ip,
        resource,
        statusCode,
        method,
        path: cleanPath,
      };

      void saveLog(doc);
    } catch {
      // Nunca propagar errores del logger
    }
  });

  next();
}
