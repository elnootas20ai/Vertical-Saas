/**
 * Envía un correo de bienvenida de prueba (misma plantilla que buildWelcomeTrialEmail).
 * Uso: node scripts/send-test-welcome-email.mjs [email]
 * Requiere .env / .env.development con SMTP o Resend configurado (mismo criterio que el backend).
 */
import '../config/env.js';
import { sendEmail, buildWelcomeTrialEmail } from '../services/email.js';

const to = String(process.argv[2] || 'elnootas2.0@gmail.com').trim();
const displayName = String(process.argv[3] || 'Uriel elnot').trim();

const { subject, html } = buildWelcomeTrialEmail(to, displayName, 14);

await sendEmail({
  to,
  subject: `[Prueba] ${subject}`,
  html,
  requireDelivery: true,
});

console.log(`OK: enviado a ${to}`);
