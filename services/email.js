import nodemailer from 'nodemailer';
import logger from './logger.js';

function getAppBaseUrl() {
  return (process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, '');
}

function getFromAddress() {
  return process.env.EMAIL_FROM || process.env.SMTP_FROM || 'noreply@udar.app';
}

async function sendViaResend(to, subject, html) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: getFromAddress(), to, subject, html }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || `Resend error ${response.status}`);
  }
}

async function sendViaSMTP(to, subject, html) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    html,
  });
}

export async function sendEmail({ to, subject, html }) {
  if (process.env.RESEND_API_KEY) {
    return sendViaResend(to, subject, html);
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return sendViaSMTP(to, subject, html);
  }

  logger.warn({ tag: 'EMAIL_DEV', to, subject }, 'Email no enviado: sin proveedor configurado (RESEND_API_KEY o SMTP_HOST). Modo desarrollo.');
  logger.debug({ tag: 'EMAIL_DEV', html }, 'Contenido HTML del email simulado');
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
    delivery: 'Delivery', carDealership: 'Concesionario', workshop: 'Taller', hairSalon: 'Peluquer\u00eda',
    gym: 'Gimnasio', clinic: 'Cl\u00ednica', hotel: 'Hotel', construction: 'Constructora', academy: 'Academia',
    realEstate: 'Inmobiliaria', lawyer: 'Abogados', nightclub: 'Discoteca', events: 'Eventos',
    cleaning: 'Limpieza', scrapyard: 'Desguace', spareParts: 'Recambios', taxi: 'Taxi',
    pharmacy: 'Farmacia', carWash: 'Lavadero', vet: 'Veterinario', tobaccoShop: 'Estanco', butcherShop: 'Carnicer\u00eda',
  };
  const verticalLabel = verticalNames[businessType] || businessType || 'Tu negocio';

  return {
    to: null,
    subject: '\u00a1Bienvenido a UDAR EDGE! Tu prueba gratuita ha comenzado',
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:32px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:24px;">\u00a1Bienvenido a UDAR EDGE!</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Tu prueba gratuita de 14 d\u00edas ha comenzado</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:16px;color:#111;">Hola <strong>${firstName || 'usuario'}</strong>,</p>
          <p style="font-size:14px;color:#444;line-height:1.6;">
            Gracias por registrar <strong>${companyName || 'tu empresa'}</strong> en UDAR EDGE.
            Tu prueba gratuita del plan <strong>${planName || 'Basic'}</strong> est\u00e1 activa hasta el <strong>${endDateStr}</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;margin:16px 0;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#92400e;">Tu configuraci\u00f3n</p>
              <p style="margin:0;font-size:13px;color:#78350f;">Vertical: <strong>${verticalLabel}</strong></p>
              ${activeModules.length > 0 ? `<p style="margin:4px 0 0;font-size:13px;color:#78350f;">M\u00f3dulos: <strong>${activeModules.join(', ')}</strong></p>` : ''}
            </td></tr>
          </table>
          <p style="font-size:14px;color:#444;line-height:1.6;">
            El siguiente paso es completar la configuraci\u00f3n de tu negocio: datos de empresa, equipo, sedes y m\u00e1s.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
            <tr><td style="background:#111;border-radius:10px;">
              <a href="${setupUrl}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-weight:600;font-size:14px;">Completar configuraci\u00f3n</a>
            </td></tr>
          </table>
          <p style="font-size:13px;color:#888;line-height:1.5;">
            No se te cobrar\u00e1 hasta el ${endDateStr}. Puedes cancelar en cualquier momento desde Ajustes &rarr; Suscripci\u00f3n.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#aaa;font-size:12px;">UDAR EDGE &middot; Plataforma de gesti\u00f3n integral</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  };
}

export function buildEmailVerificationEmail(email, token) {
  const baseUrl = getAppBaseUrl();
  const verifyUrl = `${baseUrl}/auth/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  return {
    subject: 'Verifica tu email · UDAR',
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#FF5E00;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">UDAR</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#111;font-size:22px;">Confirma tu dirección de email</h2>
          <p style="color:#555;margin:0 0 24px;line-height:1.6;">
            Gracias por registrarte. Para activar tu cuenta y acceder al panel, confirma que este email
            te pertenece haciendo clic en el botón de abajo.
          </p>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${verifyUrl}"
               style="display:inline-block;background:#000;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
              Verificar mi email
            </a>
          </td></tr></table>
          <p style="color:#888;font-size:13px;margin:24px 0 0;line-height:1.5;">
            Este enlace expira en <strong>24 horas</strong>. Si no creaste esta cuenta, puedes ignorar este email.
          </p>
          <p style="color:#aaa;font-size:12px;margin:16px 0 0;">
            O copia y pega esta URL en tu navegador:<br>
            <span style="color:#555;word-break:break-all;">${verifyUrl}</span>
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#aaa;font-size:12px;">UDAR · Sistema de gestión de concesionario</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

// S-03: Email de notificación de bloqueo de cuenta
export function buildAccountLockedEmail(email, lockUntil, ipAddress) {
  const lockDate = lockUntil ? new Date(lockUntil).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : 'unos minutos';
  const ipInfo = ipAddress && ipAddress !== 'unknown' ? `<p style="color:#555;margin:0 0 8px;line-height:1.6;">IP detectada: <strong>${ipAddress}</strong></p>` : '';

  return {
    subject: '⚠️ Cuenta bloqueada temporalmente · UDAR',
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#dc2626;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">UDAR · Alerta de Seguridad</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#111;font-size:22px;">Tu cuenta ha sido bloqueada temporalmente</h2>
          <p style="color:#555;margin:0 0 16px;line-height:1.6;">
            Hemos detectado múltiples intentos de inicio de sesión fallidos en tu cuenta
            <strong>${email}</strong>.
          </p>
          ${ipInfo}
          <p style="color:#555;margin:0 0 24px;line-height:1.6;">
            Por seguridad, el acceso ha sido bloqueado hasta: <strong>${lockDate}</strong>.
          </p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px;margin:0 0 24px;">
            <p style="color:#b91c1c;margin:0;font-size:14px;line-height:1.5;">
              Si no fuiste tú quien intentó acceder, te recomendamos cambiar tu contraseña
              inmediatamente una vez que se levante el bloqueo.
            </p>
          </div>
          <p style="color:#888;font-size:13px;margin:0;line-height:1.5;">
            Si necesitas ayuda, contacta con el administrador del sistema.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#aaa;font-size:12px;">UDAR · Sistema de gestión de concesionario</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

// S-06: Email de prueba por expirar (≤3 días antes)
export function buildTrialExpiringEmail(email, name, daysLeft, billingUrl) {
  const displayName = name ? name.split(' ')[0] : 'Usuario';
  const dayText = daysLeft === 1 ? '1 día' : `${daysLeft} días`;

  return {
    subject: `⏰ Tu prueba gratuita termina en ${dayText} · UDAR`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#000;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">UDAR</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
            <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">⏰ Tu prueba termina en ${dayText}</p>
          </div>
          <h2 style="margin:0 0 16px;color:#111;font-size:22px;">Hola, ${displayName}</h2>
          <p style="color:#555;margin:0 0 16px;line-height:1.6;">
            Tu periodo de prueba gratuita de <strong>UDAR</strong> está a punto de finalizar.
            Para continuar usando todas las funcionalidades sin interrupciones, activa tu suscripción ahora.
          </p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 8px;color:#111;font-size:14px;font-weight:600;">¿Qué incluye la suscripción?</p>
            <p style="margin:0 0 4px;color:#555;font-size:13px;">✓ Acceso completo a todos los módulos</p>
            <p style="margin:0 0 4px;color:#555;font-size:13px;">✓ Soporte prioritario</p>
            <p style="margin:0 0 4px;color:#555;font-size:13px;">✓ Actualizaciones automáticas</p>
            <p style="margin:0;color:#555;font-size:13px;">✓ Hasta 20% de descuento con el plan anual</p>
          </div>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${billingUrl}"
               style="display:inline-block;background:#000;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
              Activar suscripción
            </a>
          </td></tr></table>
          <p style="color:#888;font-size:13px;margin:24px 0 0;line-height:1.5;">
            Si tienes alguna duda, responde a este email y te ayudaremos encantados.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#aaa;font-size:12px;">UDAR · Sistema de gestión de concesionario</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

// S-06: Email de pago fallido
export function buildPaymentFailedEmail(email, name, billingUrl) {
  const displayName = name ? name.split(' ')[0] : 'Usuario';

  return {
    subject: '❌ Error en tu pago · UDAR',
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#dc2626;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">UDAR · Error de Pago</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#111;font-size:22px;">No hemos podido procesar tu pago</h2>
          <p style="color:#555;margin:0 0 16px;line-height:1.6;">
            Hola <strong>${displayName}</strong>, hemos intentado cobrar tu suscripción de <strong>UDAR</strong>
            pero el pago no se pudo completar.
          </p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;color:#b91c1c;font-size:14px;font-weight:600;">¿Qué puedes hacer?</p>
            <p style="margin:8px 0 4px;color:#7f1d1d;font-size:13px;">• Verifica que los datos de tu tarjeta son correctos</p>
            <p style="margin:0 0 4px;color:#7f1d1d;font-size:13px;">• Asegúrate de que tiene fondos suficientes</p>
            <p style="margin:0;color:#7f1d1d;font-size:13px;">• Actualiza tu método de pago desde el panel</p>
          </div>
          <p style="color:#555;margin:0 0 24px;line-height:1.6;">
            Tienes un <strong>periodo de gracia de 72 horas</strong> para actualizar tu método de pago
            antes de que tu cuenta quede suspendida.
          </p>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${billingUrl}"
               style="display:inline-block;background:#dc2626;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
              Actualizar método de pago
            </a>
          </td></tr></table>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#aaa;font-size:12px;">UDAR · Sistema de gestión de concesionario</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

// S-06: Email de periodo de gracia activo
export function buildGracePeriodEmail(email, name, gracePeriodEndsAt, billingUrl) {
  const displayName = name ? name.split(' ')[0] : 'Usuario';
  const endDate = gracePeriodEndsAt
    ? new Date(gracePeriodEndsAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'long', timeStyle: 'short' })
    : '72 horas';

  return {
    subject: '⚠️ Periodo de gracia activado — actúa antes de que expire · UDAR',
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#ea580c;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">UDAR · Acción requerida</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#111;font-size:22px;">Tu cuenta está en periodo de gracia</h2>
          <p style="color:#555;margin:0 0 16px;line-height:1.6;">
            Hola <strong>${displayName}</strong>, el último intento de cobro de tu suscripción de
            <strong>UDAR</strong> falló y tu cuenta ha entrado en periodo de gracia.
          </p>
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 8px;color:#9a3412;font-size:14px;font-weight:600;">
              ⚠️ Tienes hasta el ${endDate} para regularizar tu pago
            </p>
            <p style="margin:0;color:#7c2d12;font-size:13px;line-height:1.5;">
              Pasada esta fecha, tu cuenta quedará suspendida y no podrás acceder a ningún módulo.
              Tus datos se conservarán de forma segura.
            </p>
          </div>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${billingUrl}"
               style="display:inline-block;background:#ea580c;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
              Regularizar pago ahora
            </a>
          </td></tr></table>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#aaa;font-size:12px;">UDAR · Sistema de gestión de concesionario</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

// S-06: Email de cuenta suspendida
export function buildSuspensionEmail(email, name, billingUrl) {
  const displayName = name ? name.split(' ')[0] : 'Usuario';

  return {
    subject: '🚫 Tu cuenta ha sido suspendida · UDAR',
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#1e293b;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">UDAR · Cuenta Suspendida</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#111;font-size:22px;">Tu cuenta ha sido suspendida</h2>
          <p style="color:#555;margin:0 0 16px;line-height:1.6;">
            Hola <strong>${displayName}</strong>, lamentamos informarte que tu cuenta de
            <strong>UDAR</strong> ha sido suspendida por falta de pago.
          </p>
          <div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 8px;color:#1e293b;font-size:14px;font-weight:600;">¿Qué significa esto?</p>
            <p style="margin:0 0 4px;color:#475569;font-size:13px;">• No puedes acceder al panel de control</p>
            <p style="margin:0 0 4px;color:#475569;font-size:13px;">• Tus datos están seguros y se conservan</p>
            <p style="margin:0;color:#475569;font-size:13px;">• Puedes reactivar tu cuenta en cualquier momento</p>
          </div>
          <p style="color:#555;margin:0 0 24px;line-height:1.6;">
            Para reactivar tu cuenta, actualiza tu método de pago y realiza el pago pendiente.
            Tu cuenta quedará activa de inmediato.
          </p>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${billingUrl}"
               style="display:inline-block;background:#000;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
              Reactivar mi cuenta
            </a>
          </td></tr></table>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#aaa;font-size:12px;">UDAR · Sistema de gestión de concesionario</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

// A-04: Email de invitación de miembro del equipo
export function buildInvitationEmail({ name, email, inviteToken, temporaryPassword, invitedBy, role = 'Usuario', companyName = '' }) {
  const baseUrl = getAppBaseUrl();
  const acceptUrl = `${baseUrl}/auth/accept-invite?token=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(email)}`;
  const loginUrl = `${baseUrl}/auth/login`;
  const inviterDisplay = invitedBy ? `<strong>${invitedBy}</strong>` : 'un administrador';
  const companyDisplay = companyName ? ` de <strong>${companyName}</strong>` : '';
  const subjectCompany = companyName ? ` · ${companyName}` : '';

  return {
    subject: `Te han invitado a unirte a UDAR${subjectCompany}`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#000;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">UDAR</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#111;font-size:22px;">Hola${name ? `, ${name}` : ''}!</h2>
          <p style="color:#555;margin:0 0 16px;line-height:1.6;">
            ${inviterDisplay} te ha invitado a unirte al equipo${companyDisplay} en <strong>UDAR</strong>
            con el rol de <strong>${role}</strong>.
          </p>
          ${companyName ? `
          <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:0 0 16px;">
            <p style="margin:0;color:#0369a1;font-size:14px;font-weight:600;">${companyName}</p>
            <p style="margin:4px 0 0;color:#0c4a6e;font-size:13px;">Accederás directamente a esta empresa una vez aceptes la invitación.</p>
          </div>
          ` : ''}
          <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:20px;margin:0 0 20px;">
            <p style="margin:0 0 8px;color:#92400e;font-size:14px;font-weight:700;">Tus credenciales de acceso:</p>
            <table cellpadding="0" cellspacing="0" style="width:100%;">
              <tr>
                <td style="padding:4px 0;color:#78350f;font-size:13px;font-weight:600;width:80px;">Email:</td>
                <td style="padding:4px 0;color:#451a03;font-size:13px;font-family:monospace;">${email}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#78350f;font-size:13px;font-weight:600;width:80px;">Contraseña:</td>
                <td style="padding:4px 0;color:#451a03;font-size:13px;font-family:monospace;">${temporaryPassword || '(definida por tu administrador)'}</td>
              </tr>
            </table>
            <p style="margin:10px 0 0;color:#a16207;font-size:12px;">Te recomendamos cambiar la contraseña después de tu primer acceso.</p>
          </div>
          <p style="color:#555;margin:0 0 24px;line-height:1.6;">
            Puedes acceder de dos formas: con el botón de abajo para aceptar la invitación, o directamente iniciando sesión con tus credenciales.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 12px;"><tr><td>
            <a href="${acceptUrl}"
               style="display:inline-block;background:#000;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
              Aceptar invitación
            </a>
          </td></tr></table>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${loginUrl}"
               style="display:inline-block;background:#fff;color:#000;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;border:2px solid #e5e7eb;">
              Ir a iniciar sesión
            </a>
          </td></tr></table>
          <p style="color:#888;font-size:13px;margin:24px 0 0;line-height:1.5;">
            El enlace de invitación expira en <strong>72 horas</strong>, pero puedes iniciar sesión con tus credenciales en cualquier momento.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#aaa;font-size:12px;">UDAR · Sistema de gestión de concesionario</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function buildWelcomeTrialEmail(email, name, trialDays = 14) {
  const baseUrl = getAppBaseUrl();
  const dashboardUrl = `${baseUrl}/saas/dashboard`;
  const displayName = name ? name.split(' ')[0] : 'Usuario';

  return {
    subject: `Bienvenido a UDAR 360 · ${trialDays} días gratis para ti`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#000;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">UDAR 360</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
            <p style="margin:0;color:#065f46;font-size:13px;font-weight:600;">🎉 ¡Tu cuenta está lista! Tienes ${trialDays} días de prueba gratuita.</p>
          </div>
          <h2 style="margin:0 0 16px;color:#111;font-size:22px;">¡Hola, ${displayName}!</h2>
          <p style="color:#555;margin:0 0 16px;line-height:1.6;">
            Bienvenido a <strong>UDAR 360</strong>. Tu cuenta ya está activa y tienes <strong>${trialDays} días gratis</strong>
            para explorar todas las funcionalidades de la plataforma.
          </p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 8px;color:#111;font-size:14px;font-weight:600;">Primeros pasos recomendados:</p>
            <p style="margin:0 0 4px;color:#555;font-size:13px;">1. Configura los datos de tu negocio</p>
            <p style="margin:0 0 4px;color:#555;font-size:13px;">2. Sube tus clientes (puedes importar desde Excel)</p>
            <p style="margin:0 0 4px;color:#555;font-size:13px;">3. Crea tu catálogo de productos/servicios</p>
            <p style="margin:0;color:#555;font-size:13px;">4. Realiza tu primera operación</p>
          </div>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${dashboardUrl}"
               style="display:inline-block;background:#000;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
              Ir a mi panel
            </a>
          </td></tr></table>
          <p style="color:#888;font-size:13px;margin:24px 0 0;line-height:1.5;">
            Si tienes alguna duda, responde a este email y te ayudaremos encantados.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#aaa;font-size:12px;">UDAR 360 · Plataforma de gestión empresarial</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function buildPaymentSuccessEmail(email, name, planName, billingMode) {
  const baseUrl = getAppBaseUrl();
  const dashboardUrl = `${baseUrl}/saas/dashboard`;
  const displayName = name ? name.split(' ')[0] : 'Usuario';
  const modeLabel = billingMode === 'annual' ? 'anual' : 'mensual';

  return {
    subject: '✅ Pago confirmado · UDAR',
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#16a34a;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">UDAR · Pago Confirmado</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#111;font-size:22px;">¡Gracias por tu pago, ${displayName}!</h2>
          <p style="color:#555;margin:0 0 16px;line-height:1.6;">
            Tu suscripción al plan <strong>${planName || 'UDAR'}</strong> (${modeLabel}) se ha activado correctamente.
            Ya tienes acceso completo a todas las funcionalidades.
          </p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 8px;color:#166534;font-size:14px;font-weight:600;">✅ Tu suscripción está activa</p>
            <p style="margin:0;color:#15803d;font-size:13px;">
              Plan: ${planName || 'UDAR'} · Facturación: ${modeLabel}
            </p>
          </div>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${dashboardUrl}"
               style="display:inline-block;background:#16a34a;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
              Ir a mi panel
            </a>
          </td></tr></table>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#aaa;font-size:12px;">UDAR · Plataforma de gestión empresarial</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function buildTrialExpiredEmail(email, name, billingUrl) {
  const displayName = name ? name.split(' ')[0] : 'Usuario';

  return {
    subject: '⛔ Tu periodo de prueba ha finalizado · UDAR',
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#dc2626;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">UDAR · Prueba Finalizada</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#111;font-size:22px;">Tu periodo de prueba ha terminado</h2>
          <p style="color:#555;margin:0 0 16px;line-height:1.6;">
            Hola <strong>${displayName}</strong>, tus <strong>14 días de prueba gratuita</strong> en
            <strong>UDAR</strong> han finalizado.
          </p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 8px;color:#b91c1c;font-size:14px;font-weight:600;">¿Qué ocurre ahora?</p>
            <p style="margin:0 0 4px;color:#7f1d1d;font-size:13px;">• El acceso a la plataforma queda restringido</p>
            <p style="margin:0 0 4px;color:#7f1d1d;font-size:13px;">• Tus datos se conservan de forma segura</p>
            <p style="margin:0;color:#7f1d1d;font-size:13px;">• Puedes activar tu suscripción en cualquier momento</p>
          </div>
          <p style="color:#555;margin:0 0 24px;line-height:1.6;">
            Para seguir utilizando UDAR sin interrupciones, activa tu suscripción ahora.
          </p>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${billingUrl}"
               style="display:inline-block;background:#dc2626;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
              Activar suscripción
            </a>
          </td></tr></table>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#aaa;font-size:12px;">UDAR · Plataforma de gestión empresarial</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function buildPasswordResetEmail(email, token) {
  const baseUrl = getAppBaseUrl();
  const resetUrl = `${baseUrl}/auth/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  return {
    subject: 'Recuperar contraseña · UDAR',
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#000;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">UDAR</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#111;font-size:22px;">Recupera tu contraseña</h2>
          <p style="color:#555;margin:0 0 24px;line-height:1.6;">
            Hemos recibido una solicitud para restablecer la contraseña de la cuenta asociada a
            <strong>${email}</strong>.
          </p>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${resetUrl}"
               style="display:inline-block;background:#000;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
              Restablecer contraseña
            </a>
          </td></tr></table>
          <p style="color:#888;font-size:13px;margin:24px 0 0;line-height:1.5;">
            Este enlace expira en <strong>1 hora</strong>. Si no solicitaste este cambio, puedes ignorar este email.
          </p>
          <p style="color:#aaa;font-size:12px;margin:16px 0 0;">
            O copia y pega esta URL en tu navegador:<br>
            <span style="color:#555;word-break:break-all;">${resetUrl}</span>
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#aaa;font-size:12px;">UDAR · Sistema de gestión de concesionario</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
