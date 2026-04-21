import { v4 as uuidv4 } from 'uuid';
import {
  couchRequest,
  ensureDatabase,
  findAccountByUserId,
  sanitizeAccount,
  saveSession,
} from '../services/couchdb.js';
import {
  signAccessToken,
  signRefreshToken,
} from '../middleware/auth.js';

const SETTINGS_DB = 'settings';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureSettingsDb(req) {
  await ensureDatabase(req, SETTINGS_DB);
}

function settingsDocId(type, id) {
  return `${type}:${id}`;
}

async function getSettingsDoc(req, type, id) {
  await ensureSettingsDb(req);
  const docId = settingsDocId(type, id);
  const res = await couchRequest(req, `/${encodeURIComponent(SETTINGS_DB)}/${encodeURIComponent(docId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Error leyendo settings: ${res.status}`);
  return res.json();
}

async function saveSettingsDoc(req, type, id, data) {
  await ensureSettingsDb(req);
  const docId = settingsDocId(type, id);
  const existing = await getSettingsDoc(req, type, id);
  const doc = {
    ...(existing || {}),
    _id: docId,
    type: `settings_${type}`,
    ...data,
    updatedAt: new Date().toISOString(),
  };
  const res = await couchRequest(req, `/${encodeURIComponent(SETTINGS_DB)}/${encodeURIComponent(docId)}`, {
    method: 'PUT',
    body: JSON.stringify(doc),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.reason || `Error guardando settings: ${res.status}`);
  }
  return res.json();
}

// ─── ADM-02: Branding ─────────────────────────────────────────────────────────

export async function getBranding(req, res) {
  try {
    const businessId = String(req.params.businessId || '').trim();
    if (!businessId) return res.status(400).json({ ok: false, error: 'Falta businessId' });
    const doc = await getSettingsDoc(req, 'branding', businessId);
    return res.json({
      ok: true,
      branding: doc
        ? {
            logo: doc.logo || '',
            primaryColor: doc.primaryColor || '#3B82F6',
            secondaryColor: doc.secondaryColor || '#1E40AF',
            accentColor: doc.accentColor || '#F59E0B',
            customDomain: doc.customDomain || '',
            businessName: doc.businessName || '',
            tagline: doc.tagline || '',
            favicon: doc.favicon || '',
          }
        : {
            logo: '',
            primaryColor: '#3B82F6',
            secondaryColor: '#1E40AF',
            accentColor: '#F59E0B',
            customDomain: '',
            businessName: '',
            tagline: '',
            favicon: '',
          },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function saveBranding(req, res) {
  try {
    const businessId = String(req.params.businessId || '').trim();
    if (!businessId) return res.status(400).json({ ok: false, error: 'Falta businessId' });
    const {
      logo,
      primaryColor,
      secondaryColor,
      accentColor,
      customDomain,
      businessName,
      tagline,
      favicon,
    } = req.body || {};
    await saveSettingsDoc(req, 'branding', businessId, {
      logo: String(logo || ''),
      primaryColor: String(primaryColor || '#3B82F6'),
      secondaryColor: String(secondaryColor || '#1E40AF'),
      accentColor: String(accentColor || '#F59E0B'),
      customDomain: String(customDomain || ''),
      businessName: String(businessName || ''),
      tagline: String(tagline || ''),
      favicon: String(favicon || ''),
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── ADM-03: Pipeline config ──────────────────────────────────────────────────

const DEFAULT_PIPELINE_STAGES = [
  { id: 'new',         label: 'Nuevo',       visible: true, order: 0 },
  { id: 'contacted',   label: 'Contactado',  visible: true, order: 1 },
  { id: 'appointment', label: 'Cita',        visible: true, order: 2 },
  { id: 'reserved',    label: 'Reservado',   visible: true, order: 3 },
  { id: 'negotiation', label: 'Negociación', visible: true, order: 4 },
  { id: 'won',         label: 'Ganado',      visible: true, order: 5 },
  { id: 'lost',        label: 'Perdido',     visible: true, order: 6 },
];

export async function getPipelineConfig(req, res) {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });
    const doc = await getSettingsDoc(req, 'pipeline', userId);
    return res.json({
      ok: true,
      stages: doc?.stages || DEFAULT_PIPELINE_STAGES,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function savePipelineConfig(req, res) {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });
    const stages = req.body?.stages;
    if (!Array.isArray(stages)) return res.status(400).json({ ok: false, error: 'stages debe ser un array' });
    const sanitized = stages.map((s, i) => ({
      id: String(s.id || ''),
      label: String(s.label || '').slice(0, 50),
      visible: Boolean(s.visible !== false),
      order: typeof s.order === 'number' ? s.order : i,
    }));
    await saveSettingsDoc(req, 'pipeline', userId, { stages: sanitized });
    return res.json({ ok: true, stages: sanitized });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── ADM-05: Email templates ──────────────────────────────────────────────────

const DEFAULT_EMAIL_TEMPLATES = [
  {
    id: 'welcome',
    name: 'Bienvenida',
    subject: 'Bienvenido a {{businessName}}',
    body: '<h1>Hola {{firstName}},</h1><p>Bienvenido a <strong>{{businessName}}</strong>. Estamos encantados de tenerte con nosotros.</p><p>Saludos,<br>El equipo de {{businessName}}</p>',
    variables: ['firstName', 'businessName'],
    isSystem: true,
  },
  {
    id: 'invitation',
    name: 'Invitación de equipo',
    subject: 'Te han invitado a unirte a {{businessName}}',
    body: '<h1>Hola {{firstName}},</h1><p><strong>{{inviterName}}</strong> te ha invitado a unirte al equipo de <strong>{{businessName}}</strong>.</p><p><a href="{{inviteUrl}}">Aceptar invitación</a></p>',
    variables: ['firstName', 'inviterName', 'businessName', 'inviteUrl'],
    isSystem: true,
  },
  {
    id: 'quote',
    name: 'Presupuesto al cliente',
    subject: 'Tu presupuesto de {{businessName}} — Ref. {{quoteNumber}}',
    body: '<h1>Estimado/a {{clientName}},</h1><p>Adjunto encontrará el presupuesto <strong>{{quoteNumber}}</strong> por importe de <strong>{{total}} €</strong>.</p><p>Este presupuesto es válido hasta el {{validUntil}}.</p><p>No dude en contactarnos ante cualquier duda.</p><p>Atentamente,<br>{{senderName}}<br>{{businessName}}</p>',
    variables: ['clientName', 'quoteNumber', 'total', 'validUntil', 'senderName', 'businessName'],
    isSystem: false,
  },
  {
    id: 'appointment_reminder',
    name: 'Recordatorio de cita',
    subject: 'Recordatorio: tu cita con {{businessName}} el {{date}}',
    body: '<h1>Hola {{clientName}},</h1><p>Te recordamos que tienes una cita con nosotros el <strong>{{date}} a las {{time}}</strong>.</p><p>Dirección: {{address}}</p><p>Si necesitas cambiar la cita, contáctanos.<br>{{businessName}}</p>',
    variables: ['clientName', 'date', 'time', 'address', 'businessName'],
    isSystem: false,
  },
  {
    id: 'sale_confirmation',
    name: 'Confirmación de venta',
    subject: 'Confirmación de tu compra — {{vehicleName}}',
    body: '<h1>Estimado/a {{clientName}},</h1><p>Le confirmamos la compra de <strong>{{vehicleName}}</strong> por importe de <strong>{{total}} €</strong>.</p><p>Número de operación: {{saleNumber}}</p><p>Gracias por confiar en nosotros.<br>{{businessName}}</p>',
    variables: ['clientName', 'vehicleName', 'total', 'saleNumber', 'businessName'],
    isSystem: false,
  },
];

export async function getEmailTemplates(req, res) {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });
    const doc = await getSettingsDoc(req, 'emailtemplates', userId);
    return res.json({
      ok: true,
      templates: doc?.templates || DEFAULT_EMAIL_TEMPLATES,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function saveEmailTemplates(req, res) {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });
    const templates = req.body?.templates;
    if (!Array.isArray(templates)) return res.status(400).json({ ok: false, error: 'templates debe ser un array' });
    const sanitized = templates.map((t) => ({
      id: String(t.id || uuidv4()),
      name: String(t.name || '').slice(0, 100),
      subject: String(t.subject || '').slice(0, 200),
      body: String(t.body || ''),
      variables: Array.isArray(t.variables) ? t.variables.map((v) => String(v)) : [],
      isSystem: Boolean(t.isSystem),
      updatedAt: new Date().toISOString(),
    }));
    await saveSettingsDoc(req, 'emailtemplates', userId, { templates: sanitized });
    return res.json({ ok: true, templates: sanitized });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── ADM-07: Business hours ───────────────────────────────────────────────────

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const DEFAULT_BUSINESS_HOURS = {
  timezone: 'Europe/Madrid',
  schedule: {
    monday:    { open: true,  from: '09:00', to: '19:00' },
    tuesday:   { open: true,  from: '09:00', to: '19:00' },
    wednesday: { open: true,  from: '09:00', to: '19:00' },
    thursday:  { open: true,  from: '09:00', to: '19:00' },
    friday:    { open: true,  from: '09:00', to: '19:00' },
    saturday:  { open: true,  from: '10:00', to: '14:00' },
    sunday:    { open: false, from: '10:00', to: '14:00' },
  },
  holidays: [],
  lunchBreak: { enabled: false, from: '14:00', to: '16:00' },
};

export async function getBusinessHours(req, res) {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });
    const doc = await getSettingsDoc(req, 'hours', userId);
    return res.json({
      ok: true,
      hours: doc
        ? {
            timezone: doc.timezone || DEFAULT_BUSINESS_HOURS.timezone,
            schedule: doc.schedule || DEFAULT_BUSINESS_HOURS.schedule,
            holidays: Array.isArray(doc.holidays) ? doc.holidays : [],
            lunchBreak: doc.lunchBreak || DEFAULT_BUSINESS_HOURS.lunchBreak,
          }
        : DEFAULT_BUSINESS_HOURS,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function saveBusinessHours(req, res) {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });
    const { timezone, schedule, holidays, lunchBreak } = req.body || {};

    const sanitizedSchedule = {};
    for (const day of WEEKDAYS) {
      const d = schedule?.[day] || {};
      sanitizedSchedule[day] = {
        open: Boolean(d.open),
        from: String(d.from || '09:00').slice(0, 5),
        to: String(d.to || '18:00').slice(0, 5),
      };
    }

    const sanitizedHolidays = Array.isArray(holidays)
      ? holidays.slice(0, 365).map((h) => ({
          date: String(h.date || '').slice(0, 10),
          name: String(h.name || '').slice(0, 100),
          recurring: Boolean(h.recurring),
        }))
      : [];

    const sanitizedLunch = {
      enabled: Boolean(lunchBreak?.enabled),
      from: String(lunchBreak?.from || '14:00').slice(0, 5),
      to: String(lunchBreak?.to || '16:00').slice(0, 5),
    };

    await saveSettingsDoc(req, 'hours', userId, {
      timezone: String(timezone || 'Europe/Madrid'),
      schedule: sanitizedSchedule,
      holidays: sanitizedHolidays,
      lunchBreak: sanitizedLunch,
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── ADM-06: Data Export ──────────────────────────────────────────────────────

export async function exportTenantData(req, res) {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const dbName = String(
      process.env.VITE_COUCHDB_DB || 'udar',
    );
    const userDbName = `${dbName}-${userId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    const collections = ['vehicles', 'clients', 'leads', 'sales', 'documents', 'finance', 'workshop'];
    const exported = {};
    let totalDocs = 0;

    for (const col of collections) {
      try {
        const colDb = `${userDbName}-${col}`;
        const r = await couchRequest(req, `/${encodeURIComponent(colDb)}/_all_docs?include_docs=true`);
        if (r.ok) {
          const data = await r.json();
          const docs = (data.rows || []).map((row) => row.doc).filter((d) => d && !d._id.startsWith('_design/'));
          exported[col] = docs;
          totalDocs += docs.length;
        } else {
          exported[col] = [];
        }
      } catch {
        exported[col] = [];
      }
    }

    const filename = `export-${userId}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.json({
      exportedAt: new Date().toISOString(),
      userId,
      totalDocuments: totalDocs,
      collections: exported,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function importTenantData(req, res) {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const { collections } = req.body || {};
    if (!collections || typeof collections !== 'object') {
      return res.status(400).json({ ok: false, error: 'Formato de importación inválido' });
    }

    const dbName = String(process.env.VITE_COUCHDB_DB || 'udar');
    const userDbName = `${dbName}-${userId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    const results = {};
    let totalImported = 0;

    for (const [col, docs] of Object.entries(collections)) {
      if (!Array.isArray(docs)) continue;
      const colDb = `${userDbName}-${col}`;
      await ensureDatabase(req, colDb);

      const toImport = docs.slice(0, 5000).map((doc) => {
        const d = { ...doc };
        delete d._rev;
        d._id = d._id || uuidv4();
        d.importedAt = new Date().toISOString();
        d.importedByUserId = userId;
        return d;
      });

      const bulkRes = await couchRequest(req, `/${encodeURIComponent(colDb)}/_bulk_docs`, {
        method: 'POST',
        body: JSON.stringify({ docs: toImport }),
      });

      if (bulkRes.ok) {
        const bulkData = await bulkRes.json();
        const imported = Array.isArray(bulkData) ? bulkData.filter((r) => !r.error).length : 0;
        results[col] = { imported, total: toImport.length };
        totalImported += imported;
      } else {
        results[col] = { imported: 0, total: toImport.length, error: 'Error en bulk import' };
      }
    }

    return res.json({ ok: true, totalImported, results });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── ADM-01: Impersonation ────────────────────────────────────────────────────

export async function impersonateUser(req, res) {
  try {
    const adminUser = req.authUser;
    if (adminUser?.role !== 'Admin') {
      return res.status(403).json({ ok: false, error: 'Solo los administradores pueden impersonar usuarios' });
    }

    const targetUserId = String(req.params.userId || '').trim();
    if (!targetUserId) return res.status(400).json({ ok: false, error: 'Falta userId' });
    if (targetUserId === adminUser.userId) {
      return res.status(400).json({ ok: false, error: 'No puedes impersonarte a ti mismo' });
    }

    const targetAccount = await findAccountByUserId(req, targetUserId);
    if (!targetAccount) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const sessionId = uuidv4();
    const payload = {
      userId: targetAccount.user_id,
      email: targetAccount.email,
      role: targetAccount.role || 'User',
      emailVerified: Boolean(targetAccount.emailVerified),
      sessionId,
      impersonatedBy: adminUser.userId,
      impersonatedAt: new Date().toISOString(),
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken({ userId: targetAccount.user_id, sessionId });

    await saveSession(req, targetAccount, refreshToken, sessionId, '', 'impersonation');

    return res.json({
      ok: true,
      accessToken,
      user: sanitizeAccount(targetAccount),
      impersonatedBy: adminUser.userId,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── ADM-09: Alerts config ───────────────────────────────────────────────────

const DEFAULT_ALERT_RULES = [
  { id: 'stock_low',           category: 'stock',      label: 'Stock bajo',                  description: 'Cuando un producto o vehículo alcanza el stock mínimo configurado',          enabled: true,  channels: ['push', 'inApp'],          urgency: 'high',     schedule: 'instant', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'stock_new_entry',     category: 'stock',      label: 'Nueva entrada de stock',      description: 'Cuando se registra una nueva unidad en el inventario',                       enabled: true,  channels: ['inApp'],                  urgency: 'low',      schedule: 'instant', recipientRoles: ['Admin', 'Comercial'], customRecipients: [] },
  { id: 'sale_completed',      category: 'ventas',     label: 'Venta completada',            description: 'Cuando una operación de venta se marca como completada',                     enabled: true,  channels: ['push', 'email', 'inApp'], urgency: 'medium',   schedule: 'instant', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'sale_cancelled',      category: 'ventas',     label: 'Venta cancelada',             description: 'Cuando una operación de venta se cancela',                                   enabled: true,  channels: ['push', 'inApp'],          urgency: 'high',     schedule: 'instant', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'lead_new',            category: 'crm',        label: 'Nuevo lead',                  description: 'Cuando se recibe un nuevo lead desde web, portal o manualmente',             enabled: true,  channels: ['push', 'inApp'],          urgency: 'medium',   schedule: 'instant', recipientRoles: ['Admin', 'Comercial'], customRecipients: [] },
  { id: 'lead_stale',          category: 'crm',        label: 'Lead sin actividad',          description: 'Cuando un lead lleva más de 48h sin interacción',                            enabled: true,  channels: ['email', 'inApp'],         urgency: 'medium',   schedule: 'digest_daily', recipientRoles: ['Comercial'], customRecipients: [] },
  { id: 'appointment_reminder',category: 'citas',      label: 'Recordatorio de cita',        description: 'Recordatorio automático antes de una cita programada',                       enabled: true,  channels: ['push', 'email', 'inApp'], urgency: 'medium',   schedule: 'instant', recipientRoles: ['Comercial'], customRecipients: [] },
  { id: 'appointment_missed',  category: 'citas',      label: 'Cita no atendida',            description: 'Cuando una cita pasa sin confirmación de asistencia',                        enabled: true,  channels: ['push', 'inApp'],          urgency: 'high',     schedule: 'instant', recipientRoles: ['Admin', 'Comercial'], customRecipients: [] },
  { id: 'workshop_ready',      category: 'taller',     label: 'Vehículo listo en taller',    description: 'Cuando una orden de trabajo se marca como completada',                       enabled: true,  channels: ['push', 'email', 'inApp'], urgency: 'medium',   schedule: 'instant', recipientRoles: ['Admin', 'Taller'], customRecipients: [] },
  { id: 'workshop_delayed',    category: 'taller',     label: 'Reparación retrasada',        description: 'Cuando una orden de trabajo supera la fecha estimada de entrega',             enabled: true,  channels: ['push', 'inApp'],          urgency: 'high',     schedule: 'instant', recipientRoles: ['Admin', 'Taller'], customRecipients: [] },
  { id: 'payment_received',    category: 'finanzas',   label: 'Pago recibido',               description: 'Cuando se registra un cobro o pago en una operación',                        enabled: true,  channels: ['inApp'],                  urgency: 'low',      schedule: 'instant', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'payment_overdue',     category: 'finanzas',   label: 'Pago vencido',                description: 'Cuando un cobro pendiente supera la fecha de vencimiento',                   enabled: true,  channels: ['push', 'email', 'inApp'], urgency: 'critical', schedule: 'instant', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'invoice_generated',   category: 'finanzas',   label: 'Factura generada',            description: 'Cuando se genera una nueva factura automática o manualmente',                enabled: false, channels: ['inApp'],                  urgency: 'low',      schedule: 'digest_daily', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'user_login_new',      category: 'seguridad',  label: 'Nuevo inicio de sesión',      description: 'Cuando un usuario inicia sesión desde un dispositivo o ubicación nueva',     enabled: true,  channels: ['email', 'inApp'],         urgency: 'high',     schedule: 'instant', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'user_role_changed',   category: 'seguridad',  label: 'Cambio de rol de usuario',    description: 'Cuando se modifica el rol o permisos de un usuario',                         enabled: true,  channels: ['email', 'inApp'],         urgency: 'high',     schedule: 'instant', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'document_expiring',   category: 'documentos', label: 'Documento por vencer',        description: 'Cuando un documento (ITV, seguro, etc.) está próximo a su vencimiento',      enabled: true,  channels: ['push', 'email', 'inApp'], urgency: 'high',     schedule: 'digest_daily', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'system_update',       category: 'sistema',    label: 'Actualización del sistema',   description: 'Notificaciones sobre nuevas versiones y mantenimientos programados',         enabled: true,  channels: ['inApp'],                  urgency: 'low',      schedule: 'instant', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'worker_no_clockin',   category: 'equipo',     label: 'Trabajador no fichó',         description: 'Cuando un miembro activo del equipo no registra fichaje en el día',          enabled: true,  channels: ['push', 'inApp'],          urgency: 'high',     schedule: 'instant', recipientRoles: ['Admin', 'Gerente'], customRecipients: [] },
  { id: 'worker_late_clockin', category: 'equipo',     label: 'Fichaje tardío',              description: 'Cuando un trabajador ficha después de la hora configurada + tolerancia',     enabled: true,  channels: ['inApp'],                  urgency: 'medium',   schedule: 'instant', recipientRoles: ['Admin', 'Gerente'], customRecipients: [] },
  { id: 'contract_expiring',   category: 'equipo',     label: 'Contrato próximo a vencer',   description: 'Cuando el contrato de un trabajador vence en los próximos 30 días',          enabled: true,  channels: ['push', 'email', 'inApp'], urgency: 'high',     schedule: 'digest_daily', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'document_expired',    category: 'documentos', label: 'Documento caducado',          description: 'Cuando un documento ha superado su fecha de validez',                        enabled: true,  channels: ['push', 'email', 'inApp'], urgency: 'high',     schedule: 'instant', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'fleet_itv_expiring',  category: 'documentos', label: 'ITV próxima a vencer',        description: 'Cuando la ITV de un vehículo de flota está próxima a caducar',               enabled: true,  channels: ['push', 'email', 'inApp'], urgency: 'high',     schedule: 'digest_daily', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'fleet_insurance_expiring', category: 'documentos', label: 'Seguro próximo a vencer', description: 'Cuando el seguro de un vehículo de flota está próximo a caducar',           enabled: true,  channels: ['push', 'email', 'inApp'], urgency: 'high',     schedule: 'digest_daily', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'client_payment_overdue', category: 'finanzas', label: 'Impago de cliente',          description: 'Cuando una factura de venta vence sin cobrar',                               enabled: true,  channels: ['push', 'email', 'inApp'], urgency: 'high',     schedule: 'instant', recipientRoles: ['Admin', 'Administración'], customRecipients: [] },
  { id: 'negative_cash_flow',  category: 'finanzas',   label: 'Flujo de caja negativo',      description: 'Cuando los gastos del mes superan los ingresos significativamente',           enabled: false, channels: ['push', 'inApp'],          urgency: 'high',     schedule: 'digest_daily', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'purchase_order_delayed', category: 'stock',    label: 'Pedido de compra retrasado',  description: 'Cuando un pedido a proveedor supera la fecha esperada de entrega',            enabled: true,  channels: ['push', 'inApp'],          urgency: 'high',     schedule: 'instant', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'negative_stock',      category: 'stock',      label: 'Stock negativo',              description: 'Cuando un producto muestra stock negativo (posible error de inventario)',     enabled: true,  channels: ['push', 'inApp'],          urgency: 'high',     schedule: 'instant', recipientRoles: ['Admin'], customRecipients: [] },
  { id: 'invoice_pending_validation', category: 'ocr',  label: 'Factura pendiente de validar', description: 'Factura escaneada por OCR pendiente de revisión manual',                    enabled: true,  channels: ['inApp'],                  urgency: 'medium',   schedule: 'digest_daily', recipientRoles: ['Admin', 'Administración'], customRecipients: [] },
  { id: 'bank_unreconciled',   category: 'conciliacion', label: 'Movimientos sin conciliar', description: 'Movimientos bancarios importados sin emparejar con registros financieros',    enabled: true,  channels: ['inApp'],                  urgency: 'medium',   schedule: 'digest_daily', recipientRoles: ['Admin', 'Administración'], customRecipients: [] },
];

const DEFAULT_ALERTS_GLOBAL = {
  muteAll: false,
  quietHoursEnabled: false,
  quietHoursFrom: '22:00',
  quietHoursTo: '08:00',
  digestTime: '09:00',
  defaultChannels: ['push', 'inApp'],
};

const VALID_CHANNELS = ['push', 'email', 'sms', 'inApp'];
const VALID_URGENCIES = ['low', 'medium', 'high', 'critical'];
const VALID_SCHEDULES = ['instant', 'digest_daily', 'digest_weekly'];

export async function getAlertsConfig(req, res) {
  try {
    const businessId = String(req.params.businessId || '').trim();
    if (!businessId) return res.status(400).json({ ok: false, error: 'Falta businessId' });
    const doc = await getSettingsDoc(req, 'alerts', businessId);
    return res.json({
      ok: true,
      alerts: doc
        ? {
            global: { ...DEFAULT_ALERTS_GLOBAL, ...(doc.global || {}) },
            rules: Array.isArray(doc.rules) ? doc.rules : DEFAULT_ALERT_RULES,
          }
        : { global: DEFAULT_ALERTS_GLOBAL, rules: DEFAULT_ALERT_RULES },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function saveAlertsConfig(req, res) {
  try {
    const businessId = String(req.params.businessId || '').trim();
    if (!businessId) return res.status(400).json({ ok: false, error: 'Falta businessId' });

    const { global: g, rules } = req.body || {};

    const sanitizedGlobal = {
      muteAll: Boolean(g?.muteAll),
      quietHoursEnabled: Boolean(g?.quietHoursEnabled),
      quietHoursFrom: String(g?.quietHoursFrom || '22:00').slice(0, 5),
      quietHoursTo: String(g?.quietHoursTo || '08:00').slice(0, 5),
      digestTime: String(g?.digestTime || '09:00').slice(0, 5),
      defaultChannels: Array.isArray(g?.defaultChannels)
        ? g.defaultChannels.filter((c) => VALID_CHANNELS.includes(c))
        : ['push', 'inApp'],
    };

    const sanitizedRules = Array.isArray(rules)
      ? rules.slice(0, 100).map((r) => ({
          id: String(r.id || ''),
          category: String(r.category || '').slice(0, 50),
          label: String(r.label || '').slice(0, 100),
          description: String(r.description || '').slice(0, 500),
          enabled: Boolean(r.enabled),
          channels: Array.isArray(r.channels)
            ? r.channels.filter((c) => VALID_CHANNELS.includes(c))
            : [],
          urgency: VALID_URGENCIES.includes(r.urgency) ? r.urgency : 'medium',
          schedule: VALID_SCHEDULES.includes(r.schedule) ? r.schedule : 'instant',
          recipientRoles: Array.isArray(r.recipientRoles) ? r.recipientRoles.map((x) => String(x).slice(0, 50)) : [],
          customRecipients: Array.isArray(r.customRecipients) ? r.customRecipients.map((x) => String(x).slice(0, 200)) : [],
        }))
      : DEFAULT_ALERT_RULES;

    await saveSettingsDoc(req, 'alerts', businessId, {
      global: sanitizedGlobal,
      rules: sanitizedRules,
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── ADM-10: Payment Gateway (Pasarela de pago) ──────────────────────────────

const VALID_GATEWAY_MODES = ['test', 'live'];

export async function getPaymentGateway(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const doc = await getSettingsDoc(req, 'payment_gateway', userId);
    if (!doc) {
      return res.json({
        ok: true,
        gateway: {
          mode: 'test',
          testApiKey: '',
          liveApiKey: '',
          provider: 'monei',
        },
      });
    }

    return res.json({
      ok: true,
      gateway: {
        mode: doc.mode || 'test',
        testApiKey: doc.testApiKey ? maskKey(doc.testApiKey) : '',
        liveApiKey: doc.liveApiKey ? maskKey(doc.liveApiKey) : '',
        hasTestKey: Boolean(doc.testApiKey),
        hasLiveKey: Boolean(doc.liveApiKey),
        provider: doc.provider || 'monei',
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function savePaymentGateway(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const { mode, testApiKey, liveApiKey, provider = 'monei' } = req.body || {};

    if (mode && !VALID_GATEWAY_MODES.includes(mode)) {
      return res.status(400).json({ ok: false, error: 'Modo inválido. Usa "test" o "live".' });
    }

    const existing = await getSettingsDoc(req, 'payment_gateway', userId);
    const update = {};

    if (mode) update.mode = mode;
    if (provider) update.provider = String(provider).slice(0, 30);

    if (testApiKey !== undefined) {
      update.testApiKey = testApiKey === '' ? '' : String(testApiKey).slice(0, 500);
    } else if (existing?.testApiKey) {
      update.testApiKey = existing.testApiKey;
    }

    if (liveApiKey !== undefined) {
      update.liveApiKey = liveApiKey === '' ? '' : String(liveApiKey).slice(0, 500);
    } else if (existing?.liveApiKey) {
      update.liveApiKey = existing.liveApiKey;
    }

    await saveSettingsDoc(req, 'payment_gateway', userId, update);

    return res.json({
      ok: true,
      gateway: {
        mode: update.mode || existing?.mode || 'test',
        testApiKey: update.testApiKey ? maskKey(update.testApiKey) : '',
        liveApiKey: update.liveApiKey ? maskKey(update.liveApiKey) : '',
        hasTestKey: Boolean(update.testApiKey),
        hasLiveKey: Boolean(update.liveApiKey),
        provider: update.provider || existing?.provider || 'monei',
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function getActiveGatewayKey(req, userId) {
  const doc = await getSettingsDoc(req, 'payment_gateway', userId);
  if (!doc) return null;
  const key = doc.mode === 'live' ? doc.liveApiKey : doc.testApiKey;
  return key || null;
}

function maskKey(key) {
  if (!key || key.length < 8) return '••••••••';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

// ─── ADM-08: Platform changelog ───────────────────────────────────────────────

const PLATFORM_CHANGELOG = [
  {
    version: '2.8.0',
    date: '2026-03-14',
    tag: 'nuevo',
    title: 'Panel de administración ampliado',
    description: 'Impersonación de usuarios, personalización de marca, configuración de pipeline, plantillas de email, horarios laborales y portabilidad de datos.',
    items: [
      'ADM-01: Impersonación de tenants desde el panel superadmin',
      'ADM-02: Personalización de logo, colores y dominio por concesionario',
      'ADM-03: Renombrar y reordenar etapas del pipeline de ventas',
      'ADM-05: Editor de plantillas de email desde la UI',
      'ADM-06: Exportación e importación completa de datos del concesionario',
      'ADM-07: Horarios laborales, festivos y zona horaria por sede',
      'ADM-08: Log de novedades de la plataforma visible por los usuarios',
    ],
  },
  {
    version: '2.7.0',
    date: '2026-02-28',
    tag: 'mejora',
    title: 'Taller y órdenes de trabajo mejoradas',
    description: 'Vista de técnico, seguimiento de piezas y repuestos, y firma digital en órdenes de reparación.',
    items: [
      'Vista dedicada para técnicos de taller',
      'Control de stock de piezas y repuestos',
      'Firma digital en órdenes de trabajo',
      'Estados avanzados: diagnóstico, en espera de piezas, listo para entrega',
    ],
  },
  {
    version: '2.6.0',
    date: '2026-02-10',
    tag: 'nuevo',
    title: 'Grupos empresariales y multi-sede',
    description: 'Gestión centralizada de grupos con KPIs consolidados, transferencia de vehículos entre sedes y usuarios multi-negocio.',
    items: [
      'Panel de grupos empresariales con KPIs consolidados',
      'Transferencia de stock entre sedes del grupo',
      'Usuario con acceso a múltiples negocios',
      'Facturación y reporting unificado por grupo',
    ],
  },
  {
    version: '2.5.0',
    date: '2026-01-20',
    tag: 'mejora',
    title: 'CRM y pipeline de ventas',
    description: 'Pipeline Kanban con drag & drop, scoring de leads, workflows automáticos y portal del cliente.',
    items: [
      'Pipeline Kanban con drag & drop',
      'Sistema de scoring de leads con IA',
      'Workflows de seguimiento automático configurable',
      'Portal del cliente con acceso a documentos',
    ],
  },
  {
    version: '2.4.0',
    date: '2025-12-15',
    tag: 'nuevo',
    title: 'Módulo financiero completo',
    description: 'Control de cobros, financiaciones, cash flow y panel financiero con gráficas.',
    items: [
      'Registro de cobros y pagos por operación',
      'Gestión de financiaciones y tasaciones',
      'Panel de cash flow mensual',
      'Facturas de compra/venta con numeración personalizable',
    ],
  },
  {
    version: '2.3.0',
    date: '2025-11-28',
    tag: 'mejora',
    title: 'Gestión de compras y proveedores',
    description: 'Módulo de compras con órdenes de compra, recepción de stock y gestión de proveedores.',
    items: [
      'Órdenes de compra a proveedores',
      'Recepción y control de stock entrante',
      'Histórico de precios por proveedor',
      'Integración con ANCOVE para vehículos de ocasión',
    ],
  },
];

// ─── Driver Cash Config ──────────────────────────────────────────────────────

const DEFAULT_DRIVER_CASH_CONFIG = {
  defaultFloat: 50,
  blockDuplicateSession: true,
  autoRegisterDeliveryPayments: true,
  integrateWithFinance: true,
  requireManagerApproval: false,
  mismatchIncidentThreshold: 5,
  requireJustificationAbove: 10,
  driverSessionMaxOpenHours: 10,
  driverMismatchAlertEnabled: true,
  unregisteredCashAlertEnabled: true,
};

export async function getDriverCashConfig(req, res) {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });
    const doc = await getSettingsDoc(req, 'driver_cash', userId);
    return res.json({
      ok: true,
      config: { ...DEFAULT_DRIVER_CASH_CONFIG, ...(doc?.config || {}) },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function saveDriverCashConfig(req, res) {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });
    const { config } = req.body || {};
    if (!config || typeof config !== 'object') return res.status(400).json({ ok: false, error: 'Falta config' });

    const sanitized = {
      defaultFloat: Math.max(0, Number(config.defaultFloat ?? DEFAULT_DRIVER_CASH_CONFIG.defaultFloat)),
      blockDuplicateSession: config.blockDuplicateSession !== false,
      autoRegisterDeliveryPayments: config.autoRegisterDeliveryPayments !== false,
      integrateWithFinance: config.integrateWithFinance !== false,
      requireManagerApproval: config.requireManagerApproval === true,
      mismatchIncidentThreshold: Math.max(0, Number(config.mismatchIncidentThreshold ?? DEFAULT_DRIVER_CASH_CONFIG.mismatchIncidentThreshold)),
      requireJustificationAbove: Math.max(0, Number(config.requireJustificationAbove ?? DEFAULT_DRIVER_CASH_CONFIG.requireJustificationAbove)),
      driverSessionMaxOpenHours: Math.max(1, Number(config.driverSessionMaxOpenHours ?? DEFAULT_DRIVER_CASH_CONFIG.driverSessionMaxOpenHours)),
      driverMismatchAlertEnabled: config.driverMismatchAlertEnabled !== false,
      unregisteredCashAlertEnabled: config.unregisteredCashAlertEnabled !== false,
    };

    await saveSettingsDoc(req, 'driver_cash', userId, { config: sanitized });
    return res.json({ ok: true, config: sanitized });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── CFG: Config status (estado global de configuración) ─────────────────────

export async function getConfigStatus(req, res) {
  try {
    const { businessId } = req.params;
    const doc = await getSettingsDoc(req, 'config_status', businessId);
    return res.json({
      ok: true,
      configStatus: doc || {
        activeModules: [],
        contractedModules: ['dashboard', 'crm', 'catalog', 'stock', 'sales', 'suppliers', 'invoices', 'finance', 'documents', 'team', 'clockins', 'schedules', 'payroll'],
        invoiceReceiptEmail: '',
        invoiceReceiptEnabled: false,
        initialImportStatus: { stock: 'pending', clients: 'pending', catalog: 'pending' },
        onboardingImportPending: true,
        importConfig: { duplicateRule: 'ignore', dateFormat: 'DD/MM/YYYY', csvSeparator: ';', encoding: 'UTF-8' },
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function saveConfigStatus(req, res) {
  try {
    const { businessId } = req.params;
    const data = req.body;
    await saveSettingsDoc(req, 'config_status', businessId, data);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── CFG: Modules (módulos activos) ──────────────────────────────────────────

export async function getModulesConfig(req, res) {
  try {
    const { businessId } = req.params;
    const doc = await getSettingsDoc(req, 'modules', businessId);
    return res.json({
      ok: true,
      modules: doc || {
        activeModules: ['dashboard', 'crm', 'catalog', 'sales', 'finance', 'documents', 'team'],
        contractedModules: ['dashboard', 'crm', 'catalog', 'stock', 'sales', 'suppliers', 'invoices', 'finance', 'documents', 'team', 'clockins', 'schedules', 'payroll'],
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function saveModulesConfig(req, res) {
  try {
    const { businessId } = req.params;
    const { activeModules } = req.body;
    if (!Array.isArray(activeModules)) {
      return res.status(400).json({ ok: false, error: 'activeModules debe ser un array' });
    }
    const doc = await getSettingsDoc(req, 'modules', businessId);
    const contracted = doc?.contractedModules || [];
    const invalid = activeModules.filter((m) => contracted.length > 0 && !contracted.includes(m));
    if (invalid.length > 0) {
      return res.status(403).json({
        ok: false,
        error: `Módulos no contratados: ${invalid.join(', ')}`,
      });
    }
    await saveSettingsDoc(req, 'modules', businessId, { ...doc, activeModules });
    return res.json({ ok: true, activeModules });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── CFG: Invoice email (correo recepción facturas) ──────────────────────────

export async function getInvoiceEmail(req, res) {
  try {
    const { businessId } = req.params;
    const doc = await getSettingsDoc(req, 'invoice_email', businessId);
    return res.json({
      ok: true,
      invoiceEmail: doc || {
        email: `facturas-${businessId}@udaredge.com`,
        enabled: false,
        customEmail: '',
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function saveInvoiceEmail(req, res) {
  try {
    const { businessId } = req.params;
    const { email, enabled, customEmail } = req.body;
    await saveSettingsDoc(req, 'invoice_email', businessId, {
      email: email || `facturas-${businessId}@udaredge.com`,
      enabled: Boolean(enabled),
      customEmail: customEmail || '',
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── CFG: Import config (configuración de importación) ───────────────────────

export async function getImportConfig(req, res) {
  try {
    const { businessId } = req.params;
    const doc = await getSettingsDoc(req, 'import_config', businessId);
    return res.json({
      ok: true,
      importConfig: doc || {
        duplicateRule: 'ignore',
        dateFormat: 'DD/MM/YYYY',
        csvSeparator: ';',
        encoding: 'UTF-8',
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function saveImportConfig(req, res) {
  try {
    const { businessId } = req.params;
    const { duplicateRule, dateFormat, csvSeparator, encoding } = req.body;
    const validRules = ['ignore', 'overwrite', 'create_new'];
    await saveSettingsDoc(req, 'import_config', businessId, {
      duplicateRule: validRules.includes(duplicateRule) ? duplicateRule : 'ignore',
      dateFormat: dateFormat || 'DD/MM/YYYY',
      csvSeparator: csvSeparator || ';',
      encoding: encoding || 'UTF-8',
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── CFG: Initial import status ──────────────────────────────────────────────

export async function getInitialImportStatus(req, res) {
  try {
    const { businessId } = req.params;
    const doc = await getSettingsDoc(req, 'initial_import', businessId);
    return res.json({
      ok: true,
      initialImport: doc || {
        stock: 'pending',
        clients: 'pending',
        catalog: 'pending',
        onboardingImportPending: true,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function saveInitialImportStatus(req, res) {
  try {
    const { businessId } = req.params;
    const { stock, clients, catalog } = req.body;
    const validStatuses = ['pending', 'completed', 'skipped'];
    const safeStock = validStatuses.includes(stock) ? stock : 'pending';
    const safeClients = validStatuses.includes(clients) ? clients : 'pending';
    const safeCatalog = validStatuses.includes(catalog) ? catalog : 'pending';
    const allDone = [safeStock, safeClients, safeCatalog].every((s) => s === 'completed' || s === 'skipped');
    await saveSettingsDoc(req, 'initial_import', businessId, {
      stock: safeStock,
      clients: safeClients,
      catalog: safeCatalog,
      onboardingImportPending: !allDone,
    });
    return res.json({ ok: true, onboardingImportPending: !allDone });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── Platform Changelog ──────────────────────────────────────────────────────

export async function getPlatformChangelog(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    return res.json({
      ok: true,
      changelog: PLATFORM_CHANGELOG.slice(0, limit),
      total: PLATFORM_CHANGELOG.length,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export async function upsertChangelogEntry(req, res) {
  try {
    if (req.authUser?.role !== 'Admin') {
      return res.status(403).json({ ok: false, error: 'Solo los administradores pueden gestionar el changelog' });
    }
    return res.status(501).json({ ok: false, error: 'Gestión dinámica de changelog no implementada en esta versión' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
