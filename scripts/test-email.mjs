/**
 * Prueba SMTP/email con la misma carga de env que el backend (NODE_ENV).
 * Uso: cross-env NODE_ENV=development node scripts/test-email.mjs <correo>
 */
import '../config/env.js';
import { sendEmail } from '../services/email.js';

const NODE_ENV = process.env.NODE_ENV || 'development';

const to = process.argv[2];
if (!to || !to.includes('@')) {
  console.error('Uso: node scripts/test-email.mjs <correo@ejemplo.com>');
  console.error(`NODE_ENV=${NODE_ENV} (usa cross-env NODE_ENV=development si quieres .env.development)`);
  process.exit(1);
}

console.log(`NODE_ENV=${NODE_ENV}`);
console.log(`EMAIL_PROVIDER=${process.env.EMAIL_PROVIDER || '(vacío)'}`);
console.log(`SMTP_HOST=${process.env.SMTP_HOST ? 'definido' : 'FALTA'}`);
console.log(`SMTP_USER=${process.env.SMTP_USER ? 'definido' : 'FALTA'}`);
console.log(`Enviando prueba a ${to}...`);

try {
  await sendEmail({
    to,
    subject: `[Vertial] Prueba SMTP ${new Date().toISOString()}`,
    html: '<p>Si recibes esto, el envío desde el backend está bien configurado.</p>',
  });
  console.log('OK: sendEmail terminó sin lanzar error.');
} catch (e) {
  console.error('ERROR:', e?.message || e);
  process.exit(1);
}
