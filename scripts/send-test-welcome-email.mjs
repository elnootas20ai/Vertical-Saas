/**
 * Envía bienvenida empresa (plan) o trabajador.
 * Uso:
 *   node scripts/send-test-welcome-email.mjs [email] [nombre]
 *   node scripts/send-test-welcome-email.mjs --worker [email] [nombre] [empresa] [tienda] [horario]
 */
import '../config/env.js';
import {
  sendEmail,
  buildCompanyWelcomeEmail,
  buildWorkerWelcomeEmail,
} from '../services/email.js';

const args = process.argv.slice(2);
const isWorker = args[0] === '--worker';
const rest = isWorker ? args.slice(1) : args;

if (isWorker) {
  const to = String(rest[0] || 'elnootas2.0@gmail.com').trim();
  const displayName = String(rest[1] || 'Pol').trim();
  const companyName = String(rest[2] || 'hoypecamos').trim();
  const storeName = String(rest[3] || 'BADALONA').trim();
  const scheduleLabel = String(rest[4] || '19:00–23:30').trim();
  const { subject, html } = buildWorkerWelcomeEmail({
    name: displayName,
    companyName,
    storeName,
    role: 'Usuario',
    scheduleLabel,
  });
  await sendEmail({ to, subject: `[Prueba] ${subject}`, html, requireDelivery: true });
  console.log(`OK trabajador: enviado a ${to}`);
} else {
  const to = String(rest[0] || 'elnootas2.0@gmail.com').trim();
  const displayName = String(rest[1] || 'Uriel').trim();
  const planName = String(rest[2] || 'Pro').trim();
  const { subject, html } = buildCompanyWelcomeEmail(to, displayName, {
    planName,
    companyName: 'Vertial',
    billingMode: 'monthly',
  });
  await sendEmail({ to, subject: `[Prueba] ${subject}`, html, requireDelivery: true });
  console.log(`OK empresa: enviado a ${to}`);
}
