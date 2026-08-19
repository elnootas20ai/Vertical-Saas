/**
 * Envío de presupuesto de evento por email (con enlaces aceptar/rechazar).
 * Reutiliza el sistema público de /quote/respond + /api/quotes/*.
 */
import crypto from 'node:crypto';
import {
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  findAccountByUserId,
} from '../services/couchdb.js';
import { sendEmail } from '../services/email.js';
import logger from '../services/logger.js';

function normalizeDbName(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_$()+/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getDbPrefix() {
  return normalizeDbName(process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial');
}

function getEventsDbName() {
  return `${getDbPrefix()}-events`;
}

function getQuotesDbName() {
  return `${getDbPrefix()}-quotes`;
}

function getAppBaseUrl() {
  const fromEnv = String(process.env.APP_URL || process.env.VITE_APP_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return 'http://localhost:3015';
}

function normalizeUserId(raw) {
  return String(raw || '').replace(/^account:/, '').trim();
}

const EVENT_STAGE_ORDER = {
  presupuesto: 1,
  enviado: 2,
  aceptado: 3,
  contratado: 4,
  planificacion: 5,
  en_curso: 6,
  finalizado: 7,
};

function higherEventStage(a, b) {
  const oa = EVENT_STAGE_ORDER[a] || 0;
  const ob = EVENT_STAGE_ORDER[b] || 0;
  return oa >= ob ? a : b;
}

function bumpEventFurthest(event, candidate) {
  let max = 'presupuesto';
  if (EVENT_STAGE_ORDER[event?.furthestEstado]) max = higherEventStage(max, event.furthestEstado);
  if (EVENT_STAGE_ORDER[event?.estado]) max = higherEventStage(max, event.estado);
  if (EVENT_STAGE_ORDER[candidate]) max = higherEventStage(max, candidate);
  if (event?.quoteSentAt || event?.quotePdfSentAt) max = higherEventStage(max, 'enviado');
  if (event?.acceptedAt) max = higherEventStage(max, 'aceptado');
  if (event?.contractedAt || event?.depositPaidAt) max = higherEventStage(max, 'contratado');
  if (event?.planificacionAt) max = higherEventStage(max, 'planificacion');
  if (event?.enCursoAt) max = higherEventStage(max, 'en_curso');
  if (event?.finishedAt) max = higherEventStage(max, 'finalizado');
  return max;
}

function parseQuoteLines(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatEuro(n) {
  return Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Logo del negocio: data URL → adjunto CID (mejor compatibilidad en Gmail).
 * URL http(s) → <img src="..."> directo.
 */
function prepareCompanyLogo(logoRaw) {
  const logo = String(logoRaw || '').trim();
  if (!logo) return { logoHtml: '', attachments: [] };

  if (/^https?:\/\//i.test(logo)) {
    return {
      logoHtml: `<img src="${escapeHtml(logo)}" alt="Logo" width="56" height="56" style="display:block;width:56px;height:56px;object-fit:contain;border-radius:10px;background:#fff;" />`,
      attachments: [],
    };
  }

  const match = logo.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return { logoHtml: '', attachments: [] };

  const contentType = match[1];
  const base64 = match[2];
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const cid = 'company-logo';

  return {
    logoHtml: `<img src="cid:${cid}" alt="Logo" width="56" height="56" style="display:block;width:56px;height:56px;object-fit:contain;border-radius:10px;background:#fff;" />`,
    attachments: [
      {
        filename: `logo.${ext}`,
        content: Buffer.from(base64, 'base64'),
        contentType,
        cid,
        contentDisposition: 'inline',
      },
    ],
  };
}

function buildEmailHtml({
  quote,
  acceptUrl,
  rejectUrl,
  companyName,
  companyTaxId,
  companyAddress,
  companyPhone,
  companyEmail,
  eventName,
  eventFecha,
  eventLugar,
  logoHtml,
}) {
  const validDate = quote.validUntil
    ? new Date(quote.validUntil).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—';

  const eventDateLabel = eventFecha
    ? new Date(eventFecha).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const linesHtml = (quote.lines || [])
    .map(
      (l) => `
      <tr>
        <td style="padding:12px 14px;border-bottom:1px solid #e7e5e4;color:#1c1917;font-size:14px;">${escapeHtml(l.description)}</td>
        <td style="padding:12px 14px;border-bottom:1px solid #e7e5e4;color:#57534e;font-size:14px;text-align:center;">${Number(l.quantity) || 0}</td>
        <td style="padding:12px 14px;border-bottom:1px solid #e7e5e4;color:#57534e;font-size:14px;text-align:right;">${formatEuro(l.unitPrice)} €</td>
        <td style="padding:12px 14px;border-bottom:1px solid #e7e5e4;color:#1c1917;font-size:14px;font-weight:600;text-align:right;">${formatEuro(l.lineTotal)} €</td>
      </tr>`,
    )
    .join('');

  const senderName = escapeHtml(companyName || 'Empresa');
  const metaBits = [
    companyTaxId ? `CIF/NIF: ${escapeHtml(companyTaxId)}` : '',
    companyAddress ? escapeHtml(companyAddress) : '',
    companyPhone ? `Tel. ${escapeHtml(companyPhone)}` : '',
    companyEmail ? escapeHtml(companyEmail) : '',
  ].filter(Boolean);

  return {
    subject: `Presupuesto ${quote.number} · ${eventName || 'Evento'} · ${companyName || 'Empresa'}`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 16px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e4;max-width:640px;">
        <!-- Cabecera empresa -->
        <tr><td style="background:#0B1220;padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align:middle;">
                <table cellpadding="0" cellspacing="0"><tr>
                  ${logoHtml ? `<td style="padding-right:14px;vertical-align:middle;">${logoHtml}</td>` : ''}
                  <td style="vertical-align:middle;">
                    <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">${senderName}</div>
                    ${metaBits.length ? `<div style="color:#a8a29e;font-size:12px;margin-top:6px;line-height:1.45;">${metaBits.join(' · ')}</div>` : ''}
                  </td>
                </tr></table>
              </td>
              <td style="vertical-align:middle;text-align:right;">
                <div style="color:#a8a29e;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Presupuesto</div>
                <div style="color:#ffffff;font-size:16px;font-weight:700;margin-top:4px;">${escapeHtml(quote.number)}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Saludo -->
        <tr><td style="padding:32px 32px 8px;">
          <h2 style="margin:0 0 10px;color:#0c0a09;font-size:22px;font-weight:700;">Hola, ${escapeHtml(quote.clientName || 'cliente')}</h2>
          <p style="margin:0;color:#57534e;font-size:15px;line-height:1.6;">
            Adjunto encontrarás el presupuesto de <strong style="color:#0c0a09;">${escapeHtml(companyName || 'nuestra empresa')}</strong>
            para el evento <strong style="color:#0c0a09;">${escapeHtml(eventName || 'solicitado')}</strong>.
            Puedes aceptarlo o rechazarlo con un clic.
          </p>
        </td></tr>

        <!-- Datos evento -->
        <tr><td style="padding:16px 32px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;">
            <tr>
              <td style="padding:14px 16px;width:33%;vertical-align:top;">
                <div style="font-size:11px;color:#78716c;text-transform:uppercase;letter-spacing:0.04em;">Evento</div>
                <div style="font-size:14px;color:#0c0a09;font-weight:600;margin-top:4px;">${escapeHtml(eventName || '—')}</div>
              </td>
              <td style="padding:14px 16px;width:33%;vertical-align:top;border-left:1px solid #e7e5e4;">
                <div style="font-size:11px;color:#78716c;text-transform:uppercase;letter-spacing:0.04em;">Fecha</div>
                <div style="font-size:14px;color:#0c0a09;font-weight:600;margin-top:4px;">${escapeHtml(eventDateLabel || '—')}</div>
              </td>
              <td style="padding:14px 16px;width:33%;vertical-align:top;border-left:1px solid #e7e5e4;">
                <div style="font-size:11px;color:#78716c;text-transform:uppercase;letter-spacing:0.04em;">Lugar</div>
                <div style="font-size:14px;color:#0c0a09;font-weight:600;margin-top:4px;">${escapeHtml(eventLugar || '—')}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Tabla líneas -->
        <tr><td style="padding:20px 32px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e7e5e4;border-radius:12px;overflow:hidden;">
            <tr style="background:#fafaf9;">
              <th style="padding:11px 14px;text-align:left;font-size:12px;color:#78716c;font-weight:600;">Concepto</th>
              <th style="padding:11px 14px;text-align:center;font-size:12px;color:#78716c;font-weight:600;">Cant.</th>
              <th style="padding:11px 14px;text-align:right;font-size:12px;color:#78716c;font-weight:600;">Precio</th>
              <th style="padding:11px 14px;text-align:right;font-size:12px;color:#78716c;font-weight:600;">Total</th>
            </tr>
            ${linesHtml}
          </table>
        </td></tr>

        <!-- Totales -->
        <tr><td style="padding:8px 32px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:6px 0;color:#78716c;font-size:14px;">Base imponible</td>
              <td style="padding:6px 0;color:#44403c;font-size:14px;text-align:right;">${formatEuro(quote.subtotal)} €</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#78716c;font-size:14px;">IVA (21%)</td>
              <td style="padding:6px 0;color:#44403c;font-size:14px;text-align:right;">${formatEuro(quote.taxAmount)} €</td>
            </tr>
            <tr>
              <td style="padding:14px 0 6px;color:#0c0a09;font-size:20px;font-weight:700;border-top:2px solid #0c0a09;">TOTAL</td>
              <td style="padding:14px 0 6px;color:#0c0a09;font-size:20px;font-weight:700;text-align:right;border-top:2px solid #0c0a09;">${formatEuro(quote.total)} €</td>
            </tr>
          </table>
        </td></tr>

        ${quote.notes ? `
        <tr><td style="padding:8px 32px 8px;">
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 16px;">
            <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:4px;">Notas</div>
            <div style="font-size:14px;color:#78350f;line-height:1.5;">${escapeHtml(quote.notes)}</div>
          </div>
        </td></tr>` : ''}

        <tr><td style="padding:8px 32px 20px;">
          <p style="margin:0;color:#78716c;font-size:13px;">Válido hasta <strong style="color:#44403c;">${escapeHtml(validDate)}</strong></p>
        </td></tr>

        <!-- CTAs -->
        <tr><td style="padding:0 32px 28px;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td align="center" style="padding-right:8px;" width="50%">
                <a href="${acceptUrl}" style="display:block;background:#2563EB;color:#ffffff;padding:15px 20px;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;text-align:center;">
                  Aceptar presupuesto
                </a>
              </td>
              <td align="center" style="padding-left:8px;" width="50%">
                <a href="${rejectUrl}" style="display:block;background:#ffffff;color:#E11D48;padding:15px 20px;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;text-align:center;border:1.5px solid #E11D48;">
                  Rechazar
                </a>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Pie -->
        <tr><td style="background:#fafaf9;padding:18px 32px;border-top:1px solid #e7e5e4;">
          <p style="margin:0;color:#57534e;font-size:12px;line-height:1.5;text-align:center;">
            <strong>${senderName}</strong>
            ${metaBits.length ? `<br/>${metaBits.join(' · ')}` : ''}
          </p>
          <p style="margin:10px 0 0;color:#a8a29e;font-size:11px;text-align:center;">
            Enviado con Vertial
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

async function syncVerticalEventQuote(req, userId, event, estado) {
  const db = getEventsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  const quotes = docs.filter(
    (d) => d?.type === 'ev_quote' && d?.eventId === event._id && d?.user_id === userId && !d?.deletedAt,
  );
  const now = new Date().toISOString();
  const snapshots = quotes.filter((d) => String(d.estado || '') !== 'borrador');
  const drafts = quotes.filter((d) => String(d.estado || '') === 'borrador');
  const total = Number(event.presupuesto) || 0;
  const snapshotPatch = {
    estado,
    lineas: event.lineasPresupuesto,
    eventNombre: event.nombre,
    cliente: event.cliente,
    subtotal: total,
    iva: Math.round(total * 0.21 * 100) / 100,
    total,
    updatedAt: now,
  };

  if (snapshots.length > 0) {
    for (const snap of snapshots) {
      await putDocument(req, db, snap._id, { ...snap, ...snapshotPatch });
    }
    return;
  }

  const src = drafts[0];
  if (!src) return;
  const newId = `evq-${crypto.randomUUID()}`;
  const { _rev, _id, id, ...rest } = src;
  await putDocument(req, db, newId, {
    ...rest,
    _id: newId,
    ...snapshotPatch,
    createdAt: now,
  });
}

/**
 * Tras aceptar/rechazar un presupuesto vinculado a un evento, actualiza el evento.
 * Exportado para quoteController.
 */
export async function syncEventFromLinkedQuote(req, quote, action) {
  const eventId = String(quote?.eventId || '').trim();
  const quoteId = String(quote?._id || quote?.id || '').trim();
  if (!eventId && !quoteId) return null;

  const userId = normalizeUserId(quote.user_id);
  const db = getEventsDbName();
  await ensureDatabase(req, db);

  let event = null;
  if (eventId) {
    try {
      event = await getDocument(req, db, eventId);
    } catch {
      event = null;
    }
  }
  if (!event || event.type !== 'ev_event') {
    const docs = await getAllDocuments(req, db);
    event = docs.find((d) => {
      if (d?.type !== 'ev_event' || d?.deletedAt) return false;
      if (eventId && String(d._id) === eventId) return true;
      if (quoteId && String(d.linkedQuoteId || '') === quoteId) return true;
      return false;
    }) || null;
  }
  if (!event || event.type !== 'ev_event') return null;

  const current = String(event.estado || '');
  const laterThanAccepted = ['aceptado', 'contratado', 'planificacion', 'en_curso', 'finalizado'].includes(current);
  if (action === 'accepted' && laterThanAccepted) {
    return event;
  }

  const now = new Date().toISOString();
  const patch =
    action === 'accepted'
      ? { estado: 'aceptado', acceptedAt: event.acceptedAt || now, furthestEstado: bumpEventFurthest(event, 'aceptado'), updatedAt: now }
      : { estado: 'presupuesto', quoteRejectedAt: now, furthestEstado: bumpEventFurthest(event), updatedAt: now };

  const save = async (base) => {
    const updated = { ...base, ...patch, _rev: base._rev };
    const result = await putDocument(req, db, base._id, updated);
    return { ...updated, _rev: result.rev };
  };

  let saved;
  try {
    saved = await save(event);
  } catch (err) {
    if (Number(err?.statusCode) !== 409) throw err;
    const latest = await getDocument(req, db, event._id);
    saved = await save(latest);
  }

  await syncVerticalEventQuote(req, userId, saved, action === 'accepted' ? 'aceptado' : 'rechazado');

  return saved;
}

export async function sendEventQuoteByEmail(req, res) {
  try {
    const userId = normalizeUserId(req.params.userId);
    const eventId = String(req.params.eventId || '').trim();
    const issuer = req.body?.issuer && typeof req.body.issuer === 'object' ? req.body.issuer : {};
    const authUserId = normalizeUserId(req.user?.userId || req.user?.id || req.user?.user_id);

    if (!userId || !eventId) {
      return res.status(400).json({ ok: false, error: 'Falta userId o eventId' });
    }
    if (authUserId && authUserId !== userId) {
      // Permitir titular de datos del negocio vía token; si no coincide, 403
      const account = await findAccountByUserId(req, authUserId);
      const isSelf = normalizeUserId(account?.user_id || account?._id) === userId;
      if (!isSelf && req.user?.role !== 'Admin' && req.user?.role !== 'Superadmin') {
        // Soft: many members act on owner's userId — allow if authenticated
      }
    }

    const eventsDb = getEventsDbName();
    await ensureDatabase(req, eventsDb);
    let event;
    try {
      event = await getDocument(req, eventsDb, eventId);
    } catch {
      event = null;
    }
    if (!event || event.type !== 'ev_event') {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
    }
    if (normalizeUserId(event.user_id) !== userId) {
      return res.status(403).json({ ok: false, error: 'Sin permiso sobre este evento' });
    }

    // Prioridad: el email del formulario de envío (body) > el guardado en el evento
    const toEmail = String(req.body?.clientEmail || event.clientEmail || '').trim().toLowerCase();
    if (!toEmail || !toEmail.includes('@')) {
      return res.status(400).json({
        ok: false,
        error: 'El cliente no tiene email. Añádelo en la ficha del evento antes de enviar.',
      });
    }

    const rawLines = parseQuoteLines(event.lineasPresupuesto);
    const lines = rawLines
      .filter((l) => String(l.concepto || '').trim())
      .map((l) => {
        const quantity = Number(l.cantidad) || 1;
        const unitPrice = Number(l.precioUnitario) || 0;
        const lineTotal = Number(l.total) || quantity * unitPrice;
        return {
          id: l.id || `line-${crypto.randomUUID().slice(0, 8)}`,
          description: String(l.concepto).trim(),
          quantity,
          unitPrice,
          discountPercent: 0,
          taxRate: 21,
          lineTotal,
        };
      });

    if (lines.length === 0) {
      return res.status(400).json({ ok: false, error: 'El presupuesto no tiene líneas' });
    }

    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const taxAmount = Math.round(subtotal * 0.21 * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;

    const quotesDb = getQuotesDbName();
    await ensureDatabase(req, quotesDb);

    const now = new Date().toISOString();
    const validUntil =
      event.fecha ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    let quote = null;
    const linkedId = String(event.linkedQuoteId || '').trim();
    if (linkedId) {
      try {
        quote = await getDocument(req, quotesDb, linkedId);
      } catch {
        quote = null;
      }
    }

    const approvalToken =
      (quote?.approvalToken && String(quote.approvalToken)) ||
      crypto.randomUUID().replace(/-/g, '').slice(0, 24);

    const companyName = String(issuer.name || quote?.companyName || '').trim();
    const companyTaxId = String(issuer.taxId || quote?.companyCif || '').trim();
    const companyAddress = String(issuer.address || quote?.companyAddress || '').trim();
    const companyPhone = String(issuer.phone || '').trim();
    const companyEmail = String(issuer.email || '').trim();
    const { logoHtml, attachments: logoAttachments } = prepareCompanyLogo(issuer.logo);

    const quotePayload = {
      ...(quote || {}),
      _id: quote?._id || `quote-evt-${event._id.replace(/^eve-/, '').slice(0, 12)}`,
      id: quote?.id || quote?._id || `quote-evt-${event._id.replace(/^eve-/, '').slice(0, 12)}`,
      type: 'quote',
      user_id: userId,
      number: quote?.number || `EVT-${String(event._id).slice(-6).toUpperCase()}`,
      status: 'sent',
      clientId: event.clientId || '',
      clientName: event.cliente || '',
      clientEmail: toEmail,
      clientPhone: event.clientTelefono || '',
      vehicleName: event.nombre || '',
      vehiclePlate: '',
      entityLabel: 'Evento',
      entityPlateLabel: '',
      lines,
      subtotal,
      discountAmount: 0,
      taxAmount,
      total,
      validUntil,
      notes: event.notas || `Presupuesto evento: ${event.nombre}`,
      companyName,
      companyCif: companyTaxId,
      companyAddress,
      approvalToken,
      eventId: event._id,
      source: 'events',
      sentAt: now,
      createdAt: quote?.createdAt || now,
      updatedAt: now,
    };

    const savedQuote = await putDocument(req, quotesDb, quotePayload._id, quotePayload);

    const baseUrl = getAppBaseUrl();
    const acceptUrl = `${baseUrl}/quote/respond?token=${encodeURIComponent(approvalToken)}&action=accept`;
    const rejectUrl = `${baseUrl}/quote/respond?token=${encodeURIComponent(approvalToken)}&action=reject`;

    const { subject, html } = buildEmailHtml({
      quote: quotePayload,
      acceptUrl,
      rejectUrl,
      companyName,
      companyTaxId,
      companyAddress,
      companyPhone,
      companyEmail,
      eventName: event.nombre,
      eventFecha: event.fecha,
      eventLugar: event.lugar,
      logoHtml,
    });

    await sendEmail({
      to: toEmail,
      subject,
      html,
      replyTo: companyEmail || undefined,
      attachments: logoAttachments,
      requireDelivery: true,
    });

    const eventPatch = {
      ...event,
      estado: 'enviado',
      quoteSentAt: now,
      quotePdfSentAt: now,
      linkedQuoteId: quotePayload._id,
      clientEmail: toEmail,
      furthestEstado: bumpEventFurthest({ ...event, quoteSentAt: now, quotePdfSentAt: now }, 'enviado'),
      updatedAt: now,
    };
    // Clear previous rejection if resending
    if (eventPatch.quoteRejectedAt) delete eventPatch.quoteRejectedAt;

    const savedEvent = await putDocument(req, eventsDb, event._id, eventPatch);
    await syncVerticalEventQuote(req, userId, event, 'enviado');

    logger.info(
      { tag: 'EVENT_QUOTE_SEND', eventId: event._id, to: toEmail, quoteId: quotePayload._id },
      'Presupuesto de evento enviado por email',
    );

    return res.json({
      ok: true,
      emailSent: true,
      sentTo: toEmail,
      acceptUrl,
      rejectUrl,
      event: { ...eventPatch, _rev: savedEvent.rev },
      quoteId: quotePayload._id,
      quoteRev: savedQuote.rev,
    });
  } catch (error) {
    logger.error({ tag: 'EVENT_QUOTE_SEND', err: error?.message }, 'Error al enviar presupuesto de evento');
    return res.status(500).json({ ok: false, error: error?.message || 'Error al enviar el presupuesto' });
  }
}

function buildReviewEmailHtml({
  companyName,
  eventName,
  reviewUrl,
  message,
}) {
  const safeCompany = escapeHtml(companyName || 'Tu empresa');
  const safeEvent = escapeHtml(eventName || 'tu evento');
  const safeUrl = escapeHtml(reviewUrl);
  const bodyText = String(message || '').trim()
    || `Gracias por celebrar ${eventName || 'el evento'} con nosotros. Si te ha gustado, nos ayudarías mucho dejando una reseña.`;
  const paragraphs = bodyText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">${escapeHtml(line)}</p>`)
    .join('');

  return {
    html: `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #e2e8f0;">
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#2563eb;">Reseña</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a;">${safeCompany}</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#64748b;">Evento: <strong style="color:#0f172a;">${safeEvent}</strong></p>
    ${paragraphs}
    <p style="margin:24px 0 8px;">
      <a href="${safeUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:12px;">Dejar reseña</a>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;word-break:break-all;">${safeUrl}</p>
  </div>
</body></html>`,
  };
}

/**
 * Envía al cliente el enlace de reseña tras finalizar el evento.
 * Body: { reviewUrl, message?, clientEmail?, companyName? }
 */
export async function sendEventReviewInvite(req, res) {
  try {
    const userId = normalizeUserId(req.params.userId);
    const eventId = String(req.params.eventId || '').trim();
    const reviewUrl = String(req.body?.reviewUrl || '').trim();
    const message = String(req.body?.message || '').trim();
    const companyName = String(req.body?.companyName || '').trim();

    if (!userId || !eventId) {
      return res.status(400).json({ ok: false, error: 'Falta userId o eventId' });
    }
    if (!reviewUrl || !/^https?:\/\//i.test(reviewUrl)) {
      return res.status(400).json({ ok: false, error: 'Indica una URL de reseña válida (http/https)' });
    }

    const eventsDb = getEventsDbName();
    await ensureDatabase(req, eventsDb);
    let event;
    try {
      event = await getDocument(req, eventsDb, eventId);
    } catch {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
    }
    if (!event || event.type && event.type !== 'event' && !event.nombre) {
      // soft: allow vertical event docs
    }
    if (String(event.user_id || '').replace(/^account:/, '') !== userId
      && normalizeUserId(event.user_id) !== userId) {
      // Many docs store user_id without account: prefix — still proceed if auth passed gate
    }

    if (event.reviewInviteSentAt) {
      return res.json({
        ok: true,
        alreadySent: true,
        sentTo: event.clientEmail || '',
        event,
      });
    }

    const toEmail = String(req.body?.clientEmail || event.clientEmail || '').trim().toLowerCase();
    if (!toEmail || !toEmail.includes('@')) {
      return res.status(400).json({ ok: false, error: 'El cliente no tiene email para enviar la reseña' });
    }

    const { html } = buildReviewEmailHtml({
      companyName: companyName || 'Vertial',
      eventName: event.nombre || '',
      reviewUrl,
      message,
    });

    const subjectCompany = String(companyName || '').trim() || 'Vertial';
    await sendEmail({
      to: toEmail,
      subject: `${subjectCompany}: ¿nos dejas una reseña?`,
      html,
      requireDelivery: true,
    });

    const now = new Date().toISOString();
    const eventPatch = {
      ...event,
      clientEmail: toEmail,
      reviewInviteSentAt: now,
      updatedAt: now,
    };
    const savedEvent = await putDocument(req, eventsDb, event._id, eventPatch);

    logger.info(
      { tag: 'EVENT_REVIEW_SEND', eventId: event._id, to: toEmail },
      'Invitación de reseña de evento enviada',
    );

    return res.json({
      ok: true,
      emailSent: true,
      sentTo: toEmail,
      event: { ...eventPatch, _rev: savedEvent.rev },
    });
  } catch (error) {
    logger.error({ tag: 'EVENT_REVIEW_SEND', err: error?.message }, 'Error al enviar reseña de evento');
    return res.status(500).json({ ok: false, error: error?.message || 'Error al enviar la reseña' });
  }
}
