import nodemailer from 'nodemailer';
import logger from './logger.js';
import { sendAdminAlert } from './adminAlerts.js';

function getAppBaseUrl() {
  const explicit = String(process.env.APP_URL || process.env.VITE_APP_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'development') {
    const devPort = process.env.VITE_PORT || '3015';
    return `http://localhost:${devPort}`;
  }
  return `http://localhost:${process.env.PORT || 3001}`.replace(/\/+$/, '');
}

function getFromAddress() {
  return process.env.EMAIL_FROM || process.env.SMTP_FROM || 'noreply@vertialapp.com';
}

/** Remitente con nombre visible (p. ej. "Vertial" &lt;vertial.noreply@gmail.com&gt;). */
export function getFormattedFromAddress() {
  const addr = getFromAddress();
  const name = String(process.env.EMAIL_FROM_NAME || 'Vertial').trim();
  if (!name) return addr;
  const safeName = name.replace(/"/g, "'");
  return `"${safeName}" <${addr}>`;
}

/** Reply-To por defecto. Preferir contacto público (no el buzón personal de alertas). */
function resolveReplyTo(explicitReplyTo) {
  const ex = explicitReplyTo ? String(explicitReplyTo).trim() : '';
  if (ex) return ex;
  return (
    String(process.env.PUBLIC_SUPPORT_EMAIL || '').trim()
    || String(process.env.DEFAULT_CONTACT_EMAIL || '').trim()
    || String(process.env.EMAIL_REPLY_TO || '').trim()
  );
}

/**
 * Contacto visible en emails al cliente (código, recuperar, etc.).
 * Nunca usar ALERTS_ADMIN_EMAIL / EMAIL_REPLY_TO personal (p. ej. elnootas…).
 */
function getSupportMailto() {
  const publicMail =
    String(process.env.PUBLIC_SUPPORT_EMAIL || '').trim()
    || String(process.env.DEFAULT_CONTACT_EMAIL || '').trim();
  if (publicMail && publicMail.includes('@')) return publicMail;
  return process.env.EMAIL_FROM || process.env.SMTP_FROM || 'vertial.noreply@gmail.com';
}

/** Keys reales de Resend empiezan por re_; evita activar Resend con placeholders tipo CAMBIAR_… */
function hasUsableResendKey() {
  const k = String(process.env.RESEND_API_KEY || '').trim();
  return k.startsWith('re_') && k.length > 12;
}

async function sendViaResend(to, subject, html, replyTo) {
  const payload = { from: getFormattedFromAddress(), to, subject, html };
  if (replyTo) payload.reply_to = replyTo;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.EMAIL_SEND_TIMEOUT_MS || 15000));
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeout);
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || `Resend error ${response.status}`);
  }
}

async function sendViaSMTP(to, subject, html, replyTo) {
  const smtpUser = String(process.env.SMTP_USER || '').trim();
  const smtpPass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
  if (!smtpPass) {
    throw new Error(
      'SMTP_PASS no está configurado en el servidor (.env). No se puede enviar el correo.',
    );
  }
  const transporter = nodemailer.createTransport({
    host: String(process.env.SMTP_HOST || '').trim(),
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 15000),
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const mail = {
    from: getFormattedFromAddress(),
    to,
    subject,
    html,
  };
  const rt = replyTo ? String(replyTo).trim() : '';
  if (rt) mail.replyTo = rt;

  await transporter.sendMail(mail);
}

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
  _skipAdminAlert,
  /** Si true, falla en lugar de ignorar silenciosamente cuando no hay proveedor usable (p. ej. recuperación de contraseña). */
  requireDelivery = false,
}) {
  const effectiveReplyTo = resolveReplyTo(replyTo);
  const provider = (process.env.EMAIL_PROVIDER || '').toLowerCase().trim();

  // Si defines EMAIL_PROVIDER=smtp, SIEMPRE usa SMTP (evita que un RESEND_API_KEY viejo/placeholder bloquee Gmail).
  if (provider === 'smtp') {
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      try {
        await sendViaSMTP(to, subject, html, effectiveReplyTo);
      } catch (err) {
        logger.error({ tag: 'EMAIL_SMTP', to, subject, err: err?.message }, 'Fallo envío SMTP');
        if (!_skipAdminAlert) {
          sendAdminAlert({
            key: 'email_send_fail',
            subject: '🚨 Vertial: fallo enviando email (SMTP)',
            html: `<p><b>Fallo envío SMTP</b></p><ul><li><b>to</b>: ${escapeHtml(to)}</li><li><b>subject</b>: ${escapeHtml(subject)}</li><li><b>err</b>: ${escapeHtml(err?.message || err)}</li></ul>`,
            cooldownMs: 15 * 60_000,
          }).catch(() => null);
        }
        throw err;
      }
      logger.info({ tag: 'EMAIL_SMTP', to, subject }, 'Email enviado por SMTP');
      return;
    }
    logger.warn({ tag: 'EMAIL', to, subject }, 'EMAIL_PROVIDER=smtp pero faltan SMTP_HOST o SMTP_USER');
    if (requireDelivery) {
      throw new Error(
        'No se pudo enviar el correo: tienes EMAIL_PROVIDER=smtp pero faltan SMTP_HOST o SMTP_USER en el .env del servidor.',
      );
    }
    return;
  }

  if (provider === 'resend') {
    if (!hasUsableResendKey()) {
      logger.warn({ tag: 'EMAIL', to, subject }, 'EMAIL_PROVIDER=resend pero RESEND_API_KEY no válida');
      if (requireDelivery) {
        throw new Error(
          'No se pudo enviar el correo: EMAIL_PROVIDER=resend requiere RESEND_API_KEY válida (clave que empiece por re_).',
        );
      }
      return;
    }
    try {
      await sendViaResend(to, subject, html, effectiveReplyTo);
    } catch (err) {
      logger.error({ tag: 'EMAIL_RESEND', to, subject, err: err?.message }, 'Fallo envío Resend');
      if (!_skipAdminAlert) {
        sendAdminAlert({
          key: 'email_send_fail',
          subject: '🚨 Vertial: fallo enviando email (Resend)',
          html: `<p><b>Fallo envío Resend</b></p><ul><li><b>to</b>: ${escapeHtml(to)}</li><li><b>subject</b>: ${escapeHtml(subject)}</li><li><b>err</b>: ${escapeHtml(err?.message || err)}</li></ul>`,
          cooldownMs: 15 * 60_000,
        }).catch(() => null);
      }
      throw err;
    }
    return;
  }

  // Sin EMAIL_PROVIDER: Resend solo si la key parece real; si no, SMTP.
  if (hasUsableResendKey()) {
    try {
      await sendViaResend(to, subject, html, effectiveReplyTo);
    } catch (err) {
      logger.error({ tag: 'EMAIL_RESEND', to, subject, err: err?.message }, 'Fallo envío Resend');
      if (!_skipAdminAlert) {
        sendAdminAlert({
          key: 'email_send_fail',
          subject: '🚨 Vertial: fallo enviando email (Resend)',
          html: `<p><b>Fallo envío Resend</b></p><ul><li><b>to</b>: ${escapeHtml(to)}</li><li><b>subject</b>: ${escapeHtml(subject)}</li><li><b>err</b>: ${escapeHtml(err?.message || err)}</li></ul>`,
          cooldownMs: 15 * 60_000,
        }).catch(() => null);
      }
      throw err;
    }
    return;
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    try {
      await sendViaSMTP(to, subject, html, effectiveReplyTo);
    } catch (err) {
      logger.error({ tag: 'EMAIL_SMTP', to, subject, err: err?.message }, 'Fallo envío SMTP');
      if (!_skipAdminAlert) {
        sendAdminAlert({
          key: 'email_send_fail',
          subject: '🚨 Vertial: fallo enviando email (SMTP)',
          html: `<p><b>Fallo envío SMTP</b></p><ul><li><b>to</b>: ${escapeHtml(to)}</li><li><b>subject</b>: ${escapeHtml(subject)}</li><li><b>err</b>: ${escapeHtml(err?.message || err)}</li></ul>`,
          cooldownMs: 15 * 60_000,
        }).catch(() => null);
      }
      throw err;
    }
    logger.info({ tag: 'EMAIL_SMTP', to, subject }, 'Email enviado por SMTP (fallback sin EMAIL_PROVIDER)');
    return;
  }

  logger.warn({ tag: 'EMAIL_DEV', to, subject }, 'Email no enviado: sin proveedor (RESEND_API_KEY, SMTP o EMAIL_PROVIDER).');
  logger.debug({ tag: 'EMAIL_DEV', html }, 'Contenido HTML del email simulado');
  if (requireDelivery) {
    throw new Error(
      'No se pudo enviar el correo: no hay proveedor configurado. Define EMAIL_PROVIDER=smtp con SMTP_HOST, SMTP_USER y SMTP_PASS (contraseña de aplicación Gmail), o una RESEND_API_KEY válida.',
    );
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * Marca Vertial en email (landing actual): zinc oscuro + acento verde→teal→azul.
 * CTA sólido azul (clientes de correo no pintan bien gradientes en botones).
 */
const EMAIL_BRAND = {
  pageBg: '#f4f4f5',
  cardBg: '#ffffff',
  headerBg: '#09090b',
  accentBar: 'linear-gradient(135deg,#22c55e 0%,#14b8a6 45%,#2563eb 100%)',
  ctaBg: '#2563eb',
  ctaHoverBorder: '#1d4ed8',
  text: '#18181b',
  muted: '#71717a',
  softBg: '#eff6ff',
  softBorder: '#bfdbfe',
  softText: '#1e40af',
  footerBg: '#fafafa',
  border: '#e4e4e7',
  footer: 'Vertial · Plataforma de gestión empresarial',
};

function emailCtaButton(href, label) {
  return `<table cellpadding="0" cellspacing="0" role="presentation"><tr><td style="background:${EMAIL_BRAND.ctaBg};border-radius:12px;">
            <a href="${href}"
               style="display:inline-block;background:${EMAIL_BRAND.ctaBg};color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;letter-spacing:0.2px;border:1px solid ${EMAIL_BRAND.ctaHoverBorder};">
              <span style="color:#ffffff;">${label}</span>
            </a>
          </td></tr></table>`;
}

/** Envuelve el cuerpo HTML de un email de cuenta con cabecera/footer de marca. */
function wrapAccountEmail({ bodyHtml, headerLabel = 'Vertial' }) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${EMAIL_BRAND.pageBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_BRAND.pageBg};padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:${EMAIL_BRAND.cardBg};border-radius:16px;overflow:hidden;border:1px solid ${EMAIL_BRAND.border};box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr><td style="background:${EMAIL_BRAND.headerBg};padding:28px 32px 20px;">
          <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">${escapeHtml(headerLabel)}</span>
        </td></tr>
        <tr><td style="height:4px;background:${EMAIL_BRAND.accentBar};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="background:${EMAIL_BRAND.footerBg};padding:16px 32px;border-top:1px solid ${EMAIL_BRAND.border};">
          <p style="margin:0;color:#a1a1aa;font-size:12px;">${EMAIL_BRAND.footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildSetupWelcomeEmail({ firstName, companyName, planName, trialEndDate, businessType, modules, onboardingUrl }) {
  const appUrl = getAppBaseUrl();
  const setupUrl = onboardingUrl || `${appUrl}/saas/onboarding`;
  const endDateStr = trialEndDate ? new Date(trialEndDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '14 d\u00edas';
  const activeModules = Object.entries(modules || {}).filter(([, v]) => v).map(([k]) => {
    const names = { inventory: 'Stock', sales: 'Ventas', crm: 'CRM', documentation: 'Documentos', analytics: 'Analytics', workshop: 'Taller' };
    return names[k] || k;
  });
  const verticalNames = {
    delivery: 'Delivery', restaurant: 'Restauración', carDealership: 'Concesionario', workshop: 'Taller', hairSalon: 'Peluquer\u00eda',
    gym: 'Gimnasio', clinic: 'Cl\u00ednica', hotel: 'Hotel', construction: 'Constructora', academy: 'Academia',
    realEstate: 'Inmobiliaria', lawyer: 'Abogados', nightclub: 'Discoteca', events: 'Eventos',
    cleaning: 'Limpieza', scrapyard: 'Desguace', spareParts: 'Recambios', taxi: 'Taxi',
    pharmacy: 'Farmacia', carWash: 'Lavadero', vet: 'Veterinario', tobaccoShop: 'Estanco', butcherShop: 'Carnicer\u00eda',
  };
  const verticalLabel = verticalNames[businessType] || businessType || 'Tu negocio';

  return {
    to: null,
    subject: '\u00a1Bienvenido a Vertial! Tu prueba gratuita ha comenzado',
    html: wrapAccountEmail({
      bodyHtml: `
          <h2 style="margin:0 0 8px;color:${EMAIL_BRAND.text};font-size:22px;font-weight:700;">\u00a1Bienvenido a Vertial!</h2>
          <p style="margin:0 0 20px;color:${EMAIL_BRAND.muted};font-size:14px;">Tu prueba gratuita de 14 d\u00edas ha comenzado</p>
          <p style="font-size:16px;color:${EMAIL_BRAND.text};">Hola <strong>${escapeHtml(firstName || 'usuario')}</strong>,</p>
          <p style="font-size:14px;color:#52525b;line-height:1.6;">
            Gracias por registrar <strong>${escapeHtml(companyName || 'tu empresa')}</strong> en Vertial.
            Tu prueba gratuita del plan <strong>${escapeHtml(planName || 'Basic')}</strong> est\u00e1 activa hasta el <strong>${escapeHtml(endDateStr)}</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_BRAND.softBg};border:1px solid ${EMAIL_BRAND.softBorder};border-radius:12px;margin:16px 0;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${EMAIL_BRAND.softText};">Tu configuraci\u00f3n</p>
              <p style="margin:0;font-size:13px;color:#1e3a8a;">Vertical: <strong>${escapeHtml(verticalLabel)}</strong></p>
              ${activeModules.length > 0 ? `<p style="margin:4px 0 0;font-size:13px;color:#1e3a8a;">M\u00f3dulos: <strong>${escapeHtml(activeModules.join(', '))}</strong></p>` : ''}
            </td></tr>
          </table>
          <p style="font-size:14px;color:#52525b;line-height:1.6;">
            El siguiente paso es completar la configuraci\u00f3n de tu negocio: datos de empresa, equipo, sedes y m\u00e1s.
          </p>
          <div style="margin:24px 0;">${emailCtaButton(setupUrl, 'Completar configuraci\u00f3n')}</div>
          <p style="font-size:13px;color:${EMAIL_BRAND.muted};line-height:1.5;">
            No se te cobrar\u00e1 hasta el ${escapeHtml(endDateStr)}. Puedes cancelar en cualquier momento desde Ajustes &rarr; Suscripci\u00f3n.
          </p>`,
    }),
  };
}

export function buildEmailVerificationEmail(email, token) {
  const baseUrl = getAppBaseUrl();
  const verifyUrl = `${baseUrl}/auth/verify-email-pending?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  return {
    subject: 'Verifica tu email · Vertial',
    html: wrapAccountEmail({
      bodyHtml: `
          <h2 style="margin:0 0 16px;color:${EMAIL_BRAND.text};font-size:22px;font-weight:700;">Confirma tu dirección de email</h2>
          <p style="color:#52525b;margin:0 0 24px;line-height:1.6;">
            Gracias por registrarte. Para activar tu cuenta y acceder al panel, confirma que este email
            te pertenece haciendo clic en el botón de abajo.
          </p>
          ${emailCtaButton(verifyUrl, 'Verificar mi email →')}
          <p style="color:${EMAIL_BRAND.muted};font-size:13px;margin:24px 0 0;line-height:1.5;">
            Este enlace expira en <strong>24 horas</strong>. Si no creaste esta cuenta, puedes ignorar este email.
          </p>`,
    }),
  };
}

// S-03: Email de notificación de bloqueo de cuenta
export function buildAccountLockedEmail(email, lockUntil, ipAddress) {
  const lockDate = lockUntil ? new Date(lockUntil).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : 'unos minutos';
  const ipInfo = ipAddress && ipAddress !== 'unknown'
    ? `<p style="color:#52525b;margin:0 0 8px;line-height:1.6;">IP detectada: <strong>${escapeHtml(ipAddress)}</strong></p>`
    : '';

  return {
    subject: '⚠️ Cuenta bloqueada temporalmente · Vertial',
    html: wrapAccountEmail({
      headerLabel: 'Vertial · Alerta de seguridad',
      bodyHtml: `
          <h2 style="margin:0 0 16px;color:${EMAIL_BRAND.text};font-size:22px;font-weight:700;">Tu cuenta ha sido bloqueada temporalmente</h2>
          <p style="color:#52525b;margin:0 0 16px;line-height:1.6;">
            Hemos detectado múltiples intentos de inicio de sesión fallidos en tu cuenta
            <strong>${escapeHtml(email)}</strong>.
          </p>
          ${ipInfo}
          <p style="color:#52525b;margin:0 0 24px;line-height:1.6;">
            Por seguridad, el acceso ha sido bloqueado hasta: <strong>${escapeHtml(lockDate)}</strong>.
          </p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;margin:0 0 24px;">
            <p style="color:#b91c1c;margin:0;font-size:14px;line-height:1.5;">
              Si no fuiste tú quien intentó acceder, te recomendamos cambiar tu contraseña
              inmediatamente una vez que se levante el bloqueo.
            </p>
          </div>
          <p style="color:${EMAIL_BRAND.muted};font-size:13px;margin:0;line-height:1.5;">
            Mientras tanto puedes entrar con un <strong>código por email</strong> desde la pantalla de acceso.
            Si necesitas ayuda, escribe a
            <a href="mailto:vertial.noreply@gmail.com" style="color:${EMAIL_BRAND.ctaBg};font-weight:600;">vertial.noreply@gmail.com</a>.
          </p>`,
    }),
  };
}

// S-06: Email de prueba por expirar (≤3 días antes)
export function buildTrialExpiringEmail(email, name, daysLeft, billingUrl) {
  const displayName = name ? name.split(' ')[0] : 'Usuario';
  const dayText = daysLeft === 1 ? '1 día' : `${daysLeft} días`;

  return {
    subject: `⏰ Tu prueba gratuita termina en ${dayText} · Vertial`,
    html: wrapAccountEmail({
      bodyHtml: `
          <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:12px;padding:12px 16px;margin-bottom:24px;">
            <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">Tu prueba termina en ${escapeHtml(dayText)}</p>
          </div>
          <h2 style="margin:0 0 16px;color:${EMAIL_BRAND.text};font-size:22px;font-weight:700;">Hola, ${escapeHtml(displayName)}</h2>
          <p style="color:#52525b;margin:0 0 16px;line-height:1.6;">
            Tu periodo de prueba gratuita de <strong>Vertial</strong> está a punto de finalizar.
            Para continuar usando todas las funcionalidades sin interrupciones, activa tu suscripción ahora.
          </p>
          <div style="background:${EMAIL_BRAND.footerBg};border:1px solid ${EMAIL_BRAND.border};border-radius:12px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 8px;color:${EMAIL_BRAND.text};font-size:14px;font-weight:600;">¿Qué incluye la suscripción?</p>
            <p style="margin:0 0 4px;color:#52525b;font-size:13px;">✓ Acceso completo a todos los módulos</p>
            <p style="margin:0 0 4px;color:#52525b;font-size:13px;">✓ Soporte prioritario</p>
            <p style="margin:0 0 4px;color:#52525b;font-size:13px;">✓ Actualizaciones automáticas</p>
            <p style="margin:0;color:#52525b;font-size:13px;">✓ Hasta 20% de descuento con el plan anual</p>
          </div>
          ${emailCtaButton(billingUrl, 'Activar suscripción')}
          <p style="color:${EMAIL_BRAND.muted};font-size:13px;margin:24px 0 0;line-height:1.5;">
            Si tienes alguna duda, responde a este email y te ayudaremos encantados.
          </p>`,
    }),
  };
}

// S-06: Email de pago fallido
export function buildPaymentFailedEmail(email, name, billingUrl) {
  const displayName = name ? name.split(' ')[0] : 'Usuario';

  return {
    subject: '❌ Error en tu pago · Vertial',
    html: wrapAccountEmail({
      headerLabel: 'Vertial · Error de pago',
      bodyHtml: `
          <h2 style="margin:0 0 16px;color:${EMAIL_BRAND.text};font-size:22px;font-weight:700;">No hemos podido procesar tu pago</h2>
          <p style="color:#52525b;margin:0 0 16px;line-height:1.6;">
            Hola <strong>${escapeHtml(displayName)}</strong>, hemos intentado cobrar tu suscripción de <strong>Vertial</strong>
            pero el pago no se pudo completar.
          </p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;color:#b91c1c;font-size:14px;font-weight:600;">¿Qué puedes hacer?</p>
            <p style="margin:8px 0 4px;color:#7f1d1d;font-size:13px;">• Verifica que los datos de tu tarjeta son correctos</p>
            <p style="margin:0 0 4px;color:#7f1d1d;font-size:13px;">• Asegúrate de que tiene fondos suficientes</p>
            <p style="margin:0;color:#7f1d1d;font-size:13px;">• Actualiza tu método de pago desde el panel</p>
          </div>
          <p style="color:#52525b;margin:0 0 24px;line-height:1.6;">
            Tienes un <strong>periodo de gracia de 72 horas</strong> para actualizar tu método de pago
            antes de que tu cuenta quede suspendida.
          </p>
          ${emailCtaButton(billingUrl, 'Actualizar método de pago')}`,
    }),
  };
}

// S-06: Email de periodo de gracia activo
export function buildGracePeriodEmail(email, name, gracePeriodEndsAt, billingUrl) {
  const displayName = name ? name.split(' ')[0] : 'Usuario';
  const endDate = gracePeriodEndsAt
    ? new Date(gracePeriodEndsAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'long', timeStyle: 'short' })
    : '72 horas';

  return {
    subject: '⚠️ Periodo de gracia activado — actúa antes de que expire · Vertial',
    html: wrapAccountEmail({
      headerLabel: 'Vertial · Acción requerida',
      bodyHtml: `
          <h2 style="margin:0 0 16px;color:${EMAIL_BRAND.text};font-size:22px;font-weight:700;">Tu cuenta está en periodo de gracia</h2>
          <p style="color:#52525b;margin:0 0 16px;line-height:1.6;">
            Hola <strong>${escapeHtml(displayName)}</strong>, el último intento de cobro de tu suscripción de
            <strong>Vertial</strong> falló y tu cuenta ha entrado en periodo de gracia.
          </p>
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 8px;color:#9a3412;font-size:14px;font-weight:600;">
              Tienes hasta el ${escapeHtml(endDate)} para regularizar tu pago
            </p>
            <p style="margin:0;color:#7c2d12;font-size:13px;line-height:1.5;">
              Pasada esta fecha, tu cuenta quedará suspendida y no podrás acceder a ningún módulo.
              Tus datos se conservarán de forma segura.
            </p>
          </div>
          ${emailCtaButton(billingUrl, 'Regularizar pago ahora')}`,
    }),
  };
}

// S-06: Email de cuenta suspendida
export function buildSuspensionEmail(email, name, billingUrl) {
  const displayName = name ? name.split(' ')[0] : 'Usuario';

  return {
    subject: '🚫 Tu cuenta ha sido suspendida · Vertial',
    html: wrapAccountEmail({
      headerLabel: 'Vertial · Cuenta suspendida',
      bodyHtml: `
          <h2 style="margin:0 0 16px;color:${EMAIL_BRAND.text};font-size:22px;font-weight:700;">Tu cuenta ha sido suspendida</h2>
          <p style="color:#52525b;margin:0 0 16px;line-height:1.6;">
            Hola <strong>${escapeHtml(displayName)}</strong>, lamentamos informarte que tu cuenta de
            <strong>Vertial</strong> ha sido suspendida por falta de pago.
          </p>
          <div style="background:${EMAIL_BRAND.softBg};border:1px solid ${EMAIL_BRAND.softBorder};border-radius:12px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 8px;color:${EMAIL_BRAND.softText};font-size:14px;font-weight:600;">¿Qué significa esto?</p>
            <p style="margin:0 0 4px;color:#1e3a8a;font-size:13px;">• No puedes acceder al panel de control</p>
            <p style="margin:0 0 4px;color:#1e3a8a;font-size:13px;">• Tus datos están seguros y se conservan</p>
            <p style="margin:0;color:#1e3a8a;font-size:13px;">• Puedes reactivar tu cuenta en cualquier momento</p>
          </div>
          <p style="color:#52525b;margin:0 0 24px;line-height:1.6;">
            Para reactivar tu cuenta, actualiza tu método de pago y realiza el pago pendiente.
            Tu cuenta quedará activa de inmediato.
          </p>
          ${emailCtaButton(billingUrl, 'Reactivar mi cuenta')}`,
    }),
  };
}

// A-04: Email de invitación de miembro del equipo
export function buildInvitationEmail({ name, email, inviteToken, temporaryPassword, invitedBy, role = 'Usuario', companyName = '', isExistingUser = false }) {
  const baseUrl = getAppBaseUrl();
  const acceptUrl = `${baseUrl}/auth/accept-invite?token=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(email)}${isExistingUser ? '&mode=existing' : ''}`;
  const loginUrl = `${baseUrl}/auth/login`;
  const inviterDisplay = invitedBy ? `<strong>${invitedBy}</strong>` : 'un administrador';
  const companyDisplay = companyName ? ` de <strong>${companyName}</strong>` : '';
  const subjectCompany = companyName ? ` · ${companyName}` : '';
  const subjectPrefix = isExistingUser
    ? `Únete al equipo${subjectCompany}`
    : `Te han invitado a unirte a Vertial${subjectCompany}`;

  const credentialsBlock = isExistingUser
    ? `
          <div style="background:${EMAIL_BRAND.softBg};border:1px solid ${EMAIL_BRAND.softBorder};border-radius:8px;padding:20px;margin:0 0 20px;">
            <p style="margin:0 0 4px;color:${EMAIL_BRAND.softText};font-size:14px;font-weight:700;">Ya tienes cuenta en Vertial</p>
            <p style="margin:0;color:#1e3a8a;font-size:13px;">Acepta la invitación con tu cuenta actual (<strong>${email}</strong>) y este equipo se añadirá automáticamente. No tienes que crear ninguna contraseña nueva.</p>
          </div>`
    : `
          <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:20px;margin:0 0 20px;">
            <p style="margin:0 0 8px;color:#92400e;font-size:14px;font-weight:700;">Tus credenciales de acceso:</p>
            <table cellpadding="0" cellspacing="0" style="width:100%;">
              <tr>
                <td style="padding:4px 0;color:#78350f;font-size:13px;font-weight:600;width:80px;">Email:</td>
                <td style="padding:4px 0;color:#451a03;font-size:13px;font-family:monospace;">${email}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#78350f;font-size:13px;font-weight:600;width:80px;">Contraseña:</td>
                <td style="padding:4px 0;color:#451a03;font-size:13px;font-family:monospace;">${temporaryPassword || '(la defines al aceptar)'}</td>
              </tr>
            </table>
            <p style="margin:10px 0 0;color:#a16207;font-size:12px;">Te recomendamos cambiar la contraseña después de tu primer acceso.</p>
          </div>`;

  return {
    subject: subjectPrefix,
    html: wrapAccountEmail({
      bodyHtml: `
          <h2 style="margin:0 0 16px;color:${EMAIL_BRAND.text};font-size:22px;font-weight:700;">Hola${name ? `, ${escapeHtml(name)}` : ''}!</h2>
          <p style="color:#52525b;margin:0 0 16px;line-height:1.6;">
            ${inviterDisplay} te ha invitado a unirte al equipo${companyDisplay} en <strong>Vertial</strong>
            con el rol de <strong>${escapeHtml(role)}</strong>.
          </p>
          ${companyName ? `
          <div style="background:${EMAIL_BRAND.softBg};border:1px solid ${EMAIL_BRAND.softBorder};border-radius:12px;padding:16px;margin:0 0 16px;">
            <p style="margin:0;color:${EMAIL_BRAND.softText};font-size:14px;font-weight:600;">${escapeHtml(companyName)}</p>
            <p style="margin:4px 0 0;color:#1e3a8a;font-size:13px;">Accederás directamente a esta empresa una vez aceptes la invitación.</p>
          </div>
          ` : ''}
          ${credentialsBlock}
          <p style="color:#52525b;margin:0 0 24px;line-height:1.6;">
            ${isExistingUser
              ? 'Haz clic en "Aceptar invitación" e inicia sesión con tu cuenta de Vertial para entrar en el nuevo equipo.'
              : 'Puedes acceder de dos formas: con el botón de abajo para aceptar la invitación, o directamente iniciando sesión con tus credenciales.'}
          </p>
          <div style="margin:0 0 12px;">${emailCtaButton(acceptUrl, 'Aceptar invitación')}</div>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${loginUrl}"
               style="display:inline-block;background:#fff;color:${EMAIL_BRAND.text};padding:12px 24px;text-decoration:none;border-radius:12px;font-weight:600;font-size:14px;border:1px solid ${EMAIL_BRAND.border};">
              Ir a iniciar sesión
            </a>
          </td></tr></table>
          <p style="color:${EMAIL_BRAND.muted};font-size:13px;margin:24px 0 0;line-height:1.5;">
            El enlace de invitación expira en <strong>72 horas</strong>, pero puedes iniciar sesión con tus credenciales en cualquier momento.
          </p>`,
    }),
  };
}

export function buildWelcomeTrialEmail(email, name, trialDays = 14) {
  const baseUrl = getAppBaseUrl();
  const dashboardUrl = `${baseUrl}/saas/dashboard`;
  const displayName = name ? name.split(' ')[0] : 'Usuario';

  return {
    subject: `Bienvenido a Vertial · ${trialDays} días gratis para ti`,
    html: wrapAccountEmail({
      bodyHtml: `
          <div style="background:${EMAIL_BRAND.softBg};border:1px solid ${EMAIL_BRAND.softBorder};border-radius:12px;padding:12px 16px;margin-bottom:24px;">
            <p style="margin:0;color:${EMAIL_BRAND.softText};font-size:13px;font-weight:600;">Tu cuenta está lista · ${trialDays} días de prueba gratuita</p>
          </div>
          <h2 style="margin:0 0 16px;color:${EMAIL_BRAND.text};font-size:22px;font-weight:700;">¡Hola, ${escapeHtml(displayName)}!</h2>
          <p style="color:#52525b;margin:0 0 16px;line-height:1.6;">
            Bienvenido a <strong>Vertial</strong>. Tu cuenta ya está activa y tienes <strong>${trialDays} días gratis</strong>
            para explorar todas las funcionalidades de la plataforma.
          </p>
          <div style="background:${EMAIL_BRAND.footerBg};border:1px solid ${EMAIL_BRAND.border};border-radius:12px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 8px;color:${EMAIL_BRAND.text};font-size:14px;font-weight:600;">Primeros pasos recomendados:</p>
            <p style="margin:0 0 4px;color:#52525b;font-size:13px;">1. Configura los datos de tu negocio</p>
            <p style="margin:0 0 4px;color:#52525b;font-size:13px;">2. Sube tus clientes (puedes importar desde Excel)</p>
            <p style="margin:0 0 4px;color:#52525b;font-size:13px;">3. Crea tu catálogo de productos/servicios</p>
            <p style="margin:0;color:#52525b;font-size:13px;">4. Realiza tu primera operación</p>
          </div>
          ${emailCtaButton(dashboardUrl, 'Ir a mi panel')}
          <p style="color:${EMAIL_BRAND.muted};font-size:13px;margin:24px 0 0;line-height:1.5;">
            Si tienes alguna duda, responde a este email y te ayudaremos encantados.
          </p>`,
    }),
  };
}

export function buildPaymentSuccessEmail(email, name, planName, billingMode) {
  const baseUrl = getAppBaseUrl();
  const dashboardUrl = `${baseUrl}/saas/dashboard`;
  const displayName = name ? name.split(' ')[0] : 'Usuario';
  const modeLabel = billingMode === 'annual' ? 'anual' : 'mensual';

  return {
    subject: 'Pago confirmado · Vertial',
    html: wrapAccountEmail({
      headerLabel: 'Vertial · Pago confirmado',
      bodyHtml: `
          <h2 style="margin:0 0 16px;color:${EMAIL_BRAND.text};font-size:22px;font-weight:700;">¡Gracias por tu pago, ${escapeHtml(displayName)}!</h2>
          <p style="color:#52525b;margin:0 0 16px;line-height:1.6;">
            Tu suscripción al plan <strong>${escapeHtml(planName || 'Vertial')}</strong> (${modeLabel}) se ha activado correctamente.
            Ya tienes acceso completo a todas las funcionalidades.
          </p>
          <div style="background:${EMAIL_BRAND.softBg};border:1px solid ${EMAIL_BRAND.softBorder};border-radius:12px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 8px;color:${EMAIL_BRAND.softText};font-size:14px;font-weight:600;">Tu suscripción está activa</p>
            <p style="margin:0;color:#1e3a8a;font-size:13px;">
              Plan: ${escapeHtml(planName || 'Vertial')} · Facturación: ${modeLabel}
            </p>
          </div>
          ${emailCtaButton(dashboardUrl, 'Ir a mi panel')}`,
    }),
  };
}

export function buildTrialExpiredEmail(email, name, billingUrl) {
  const displayName = name ? name.split(' ')[0] : 'Usuario';

  return {
    subject: '⛔ Tu periodo de prueba ha finalizado · Vertial',
    html: wrapAccountEmail({
      headerLabel: 'Vertial · Prueba finalizada',
      bodyHtml: `
          <h2 style="margin:0 0 16px;color:${EMAIL_BRAND.text};font-size:22px;font-weight:700;">Tu periodo de prueba ha terminado</h2>
          <p style="color:#52525b;margin:0 0 16px;line-height:1.6;">
            Hola <strong>${escapeHtml(displayName)}</strong>, tus <strong>14 días de prueba gratuita</strong> en
            <strong>Vertial</strong> han finalizado.
          </p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 8px;color:#b91c1c;font-size:14px;font-weight:600;">¿Qué ocurre ahora?</p>
            <p style="margin:0 0 4px;color:#7f1d1d;font-size:13px;">• El acceso a la plataforma queda restringido</p>
            <p style="margin:0 0 4px;color:#7f1d1d;font-size:13px;">• Tus datos se conservan de forma segura</p>
            <p style="margin:0;color:#7f1d1d;font-size:13px;">• Puedes activar tu suscripción en cualquier momento</p>
          </div>
          <p style="color:#52525b;margin:0 0 24px;line-height:1.6;">
            Para seguir utilizando Vertial sin interrupciones, activa tu suscripción ahora.
          </p>
          ${emailCtaButton(billingUrl, 'Activar suscripción')}`,
    }),
  };
}

export function buildLoginCodeEmail(email, code) {
  const support = getSupportMailto();
  const supportBlock = support
    ? `<p style="color:#555;font-size:13px;margin:20px 0 0;line-height:1.5;">
            ¿No fuiste tú? Escríbenos a
            <a href="mailto:${encodeURIComponent(support)}" style="color:#111;font-weight:600;">${escapeHtml(support)}</a>.
          </p>`
    : '';

  return {
    subject: 'Código de acceso · Vertial',
    html: wrapAccountEmail({
      bodyHtml: `
          <h2 style="margin:0 0 16px;color:${EMAIL_BRAND.text};font-size:22px;font-weight:700;">Tu código de acceso</h2>
          <p style="color:#52525b;margin:0 0 24px;line-height:1.6;">
            Usa este código para entrar a la cuenta <strong>${escapeHtml(email)}</strong>.
          </p>
          <div style="background:${EMAIL_BRAND.softBg};border:1px solid ${EMAIL_BRAND.softBorder};border-radius:12px;padding:20px;margin:0 0 8px;">
            <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:8px;color:${EMAIL_BRAND.text};text-align:center;">${escapeHtml(code)}</p>
          </div>
          <p style="color:${EMAIL_BRAND.muted};font-size:13px;margin:24px 0 0;line-height:1.5;text-align:center;">
            Válido <strong>10 minutos</strong>. No compartas este código.
          </p>
          ${supportBlock}`,
    }),
  };
}

export function buildPasswordResetEmail(email, token) {
  const baseUrl = getAppBaseUrl();
  const resetUrl = `${baseUrl}/auth/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  const support = getSupportMailto();
  const supportBlock = support
    ? `<p style="color:#555;font-size:13px;margin:20px 0 0;line-height:1.5;">
            ¿Dudas o no fuiste tú? Escríbenos a
            <a href="mailto:${encodeURIComponent(support)}" style="color:#111;font-weight:600;">${escapeHtml(support)}</a>.
          </p>`
    : '';

  return {
    subject: 'Recuperar contraseña · Vertial',
    html: wrapAccountEmail({
      bodyHtml: `
          <h2 style="margin:0 0 16px;color:${EMAIL_BRAND.text};font-size:22px;font-weight:700;">Recupera tu contraseña</h2>
          <p style="color:#52525b;margin:0 0 24px;line-height:1.6;">
            Hemos recibido una solicitud para restablecer la contraseña de la cuenta asociada a
            <strong>${escapeHtml(email)}</strong>.
          </p>
          ${emailCtaButton(resetUrl, 'Restablecer contraseña')}
          <p style="color:${EMAIL_BRAND.muted};font-size:13px;margin:24px 0 0;line-height:1.5;">
            Este enlace expira en <strong>1 hora</strong>. Si no solicitaste este cambio, puedes ignorar este email.
          </p>
          ${supportBlock}
          <p style="color:#a1a1aa;font-size:12px;margin:16px 0 0;">
            O copia y pega esta URL en tu navegador:<br>
            <span style="color:#52525b;word-break:break-all;">${resetUrl}</span>
          </p>`,
    }),
  };
}
