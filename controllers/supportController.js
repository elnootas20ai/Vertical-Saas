import logger from '../services/logger.js';
import { sendEmail } from '../services/email.js';
import { getAdminInbox } from '../services/adminInbox.js';
import { pushClientError, listClientErrors } from '../services/clientErrorLog.js';
import { isVertialSuperAdminEmail } from '../utils/superAdmin.js';

const lastReportAtByUser = new Map();
const MIN_INTERVAL_MS = 30_000;
const MAX_DESCRIPTION = 4000;
const MAX_SCREENSHOT_CHARS = 3_500_000;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function getAdminInboxForBugReport() {
  return getAdminInbox();
}

function normalizeScreenshot(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value)) {
    return { error: 'La captura debe ser una imagen PNG, JPEG o WebP.' };
  }
  if (value.length > MAX_SCREENSHOT_CHARS) {
    return { error: 'La captura es demasiado grande. Prueba otra imagen más pequeña.' };
  }
  return { value };
}

function categoryLabel(category) {
  switch (String(category || '').trim()) {
    case 'error':
      return 'Error / pantalla rota';
    case 'suggestion':
      return 'Sugerencia';
    default:
      return 'Bug / comportamiento incorrecto';
  }
}

export async function submitBugReport(req, res) {
  try {
    const authUser = req.authUser || {};
    const userId = String(authUser.userId || authUser.user_id || '').trim();
    const userEmail = String(authUser.email || '').trim();
    const userName = String(authUser.fullName || authUser.name || userEmail || 'Usuario').trim();

    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Sesión no válida' });
    }

    const now = Date.now();
    const lastSent = lastReportAtByUser.get(userId) || 0;
    if (now - lastSent < MIN_INTERVAL_MS) {
      return res.status(429).json({
        ok: false,
        error: 'Espera unos segundos antes de enviar otro reporte.',
      });
    }

    const {
      description,
      category,
      pageUrl,
      userAgent,
      businessId,
      businessName,
      stepsToReproduce,
      screenshotBase64,
    } = req.body || {};

    const text = String(description || '').trim();
    if (text.length < 10) {
      return res.status(400).json({
        ok: false,
        error: 'Describe el problema con al menos 10 caracteres.',
      });
    }
    if (text.length > MAX_DESCRIPTION) {
      return res.status(400).json({ ok: false, error: 'La descripción es demasiado larga.' });
    }

    const screenshot = normalizeScreenshot(screenshotBase64);
    if (screenshot?.error) {
      return res.status(400).json({ ok: false, error: screenshot.error });
    }

    const adminTo = getAdminInboxForBugReport();
    if (!adminTo) {
      logger.error({ tag: 'BUG_REPORT', userId }, 'Falta BUG_REPORT_EMAIL o ALERTS_ADMIN_EMAIL');
      return res.status(503).json({
        ok: false,
        error: 'El canal de reportes no está configurado en el servidor.',
      });
    }

    const reportId = `BR-${Date.now().toString(36).toUpperCase()}`;
    const envTag = process.env.NODE_ENV === 'production' ? '' : `[${process.env.NODE_ENV || 'dev'}] `;
    const subject = `${envTag}[Vertial Bug] ${categoryLabel(category)} · ${userName}`;

    const screenshotBlock = screenshot?.value
      ? `<div style="margin-top:18px;">
          <p style="margin:0 0 10px;color:#71717a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;">Captura adjunta</p>
          <img src="${screenshot.value}" alt="Captura del reporte" style="max-width:100%;border:1px solid #e4e4e7;border-radius:12px;" />
        </div>`
      : `<p style="margin:18px 0 0;color:#71717a;font-size:13px;">Sin captura adjunta.</p>`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;background:#f4f4f5;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;box-shadow:0 4px 24px rgba(0,0,0,.06);">
        <tr>
          <td style="background:linear-gradient(135deg,#b45309 0%,#dc2626 100%);padding:22px 26px;">
            <p style="margin:0;color:#fff;font-size:15px;font-weight:700;">Reporte a Vertial</p>
            <p style="margin:6px 0 0;color:#ffedd5;font-size:13px;">${escapeHtml(reportId)} · ${escapeHtml(categoryLabel(category))}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:26px;">
            <p style="margin:0 0 16px;color:#18181b;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(text)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#18181b;border-collapse:collapse;">
              <tr><td style="padding:8px 0;border-bottom:1px solid #f4f4f5;color:#71717a;width:34%;">Usuario</td><td style="padding:8px 0;border-bottom:1px solid #f4f4f5;font-weight:500;">${escapeHtml(userName)}</td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #f4f4f5;color:#71717a;">Email</td><td style="padding:8px 0;border-bottom:1px solid #f4f4f5;font-weight:500;"><a href="mailto:${encodeURIComponent(userEmail)}" style="color:#18181b;">${escapeHtml(userEmail || '—')}</a></td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #f4f4f5;color:#71717a;">Empresa</td><td style="padding:8px 0;border-bottom:1px solid #f4f4f5;font-weight:500;">${escapeHtml(String(businessName || '—'))}</td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #f4f4f5;color:#71717a;">Business ID</td><td style="padding:8px 0;border-bottom:1px solid #f4f4f5;font-weight:500;">${escapeHtml(String(businessId || '—'))}</td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #f4f4f5;color:#71717a;">Página</td><td style="padding:8px 0;border-bottom:1px solid #f4f4f5;font-weight:500;word-break:break-all;">${escapeHtml(String(pageUrl || '—'))}</td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #f4f4f5;color:#71717a;vertical-align:top;">Pasos</td><td style="padding:8px 0;border-bottom:1px solid #f4f4f5;font-weight:500;white-space:pre-wrap;">${escapeHtml(String(stepsToReproduce || '—'))}</td></tr>
              <tr><td style="padding:8px 0;color:#71717a;vertical-align:top;">Navegador</td><td style="padding:8px 0;font-size:12px;line-height:1.5;word-break:break-word;">${escapeHtml(String(userAgent || '—'))}</td></tr>
            </table>
            ${screenshotBlock}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await sendEmail({
      to: adminTo,
      subject,
      html,
      replyTo: userEmail || undefined,
      requireDelivery: true,
      _skipAdminAlert: true,
    });

    lastReportAtByUser.set(userId, now);
    logger.info({ tag: 'BUG_REPORT', reportId, userId, adminTo }, 'Reporte de bug enviado');

    return res.json({ ok: true, reportId });
  } catch (error) {
    logger.error({ tag: 'BUG_REPORT', err: error?.message }, 'Fallo enviando reporte de bug');
    return res.status(500).json({
      ok: false,
      error: error?.message || 'No se pudo enviar el reporte. Inténtalo de nuevo.',
    });
  }
}

const clientErrorRateLimit = new Map();
const CLIENT_ERROR_MIN_MS = 500;

export async function logClientError(req, res) {
  try {
    const authUser = req.authUser || {};
    const userId = String(authUser.userId || authUser.user_id || '').trim();
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Sesión no válida' });
    }

    const now = Date.now();
    const last = clientErrorRateLimit.get(userId) || 0;
    if (now - last < CLIENT_ERROR_MIN_MS) {
      return res.json({ ok: true, skipped: true });
    }
    clientErrorRateLimit.set(userId, now);

    const {
      message = '',
      technical = '',
      context = '',
      page = '',
      businessId = '',
      businessName = '',
    } = req.body || {};

    const row = pushClientError({
      userId,
      userEmail: String(authUser.email || '').trim(),
      userName: String(authUser.fullName || authUser.name || '').trim(),
      businessId: String(businessId || '').trim(),
      businessName: String(businessName || '').trim(),
      context: String(context || '').trim().slice(0, 120),
      page: String(page || req.headers.referer || '').trim().slice(0, 500),
      message: String(message || 'Error').trim().slice(0, 500),
      technical: String(technical || '').trim().slice(0, 4000),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    });

    return res.json({ ok: true, id: row.id });
  } catch (error) {
    logger.error({ tag: 'CLIENT_ERROR', err: error?.message }, 'Fallo registrando error cliente');
    return res.status(500).json({ ok: false, error: 'No se pudo registrar' });
  }
}

export async function getClientErrors(req, res) {
  try {
    const authUser = req.authUser || {};
    const userId = String(authUser.userId || authUser.user_id || '').trim();
    const email = String(authUser.email || '').trim();
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Sesión no válida' });
    }

    const limit = Number(req.query.limit) || 50;
    const all = isVertialSuperAdminEmail(email);
    const errors = listClientErrors({ userId, limit, all });

    return res.json({ ok: true, errors, all });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Error al listar' });
  }
}
