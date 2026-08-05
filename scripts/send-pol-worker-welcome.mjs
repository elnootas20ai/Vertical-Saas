#!/usr/bin/env node
/**
 * Envía el correo de bienvenida trabajador a Pol (prod).
 *
 *   node scripts/send-pol-worker-welcome.mjs           # dry
 *   node scripts/send-pol-worker-welcome.mjs --apply
 */
import '../config/env.js';
import { sendEmail } from '../services/email.js';

const APPLY = process.argv.includes('--apply');
const POL_EMAIL = 'munozluis.pol@gmail.com';
const APP_URL = String(process.env.APP_URL || process.env.VITE_APP_URL || 'https://vertialapp.com').replace(/\/+$/, '');

function couchBaseUrl() {
  const raw = String(process.env.COUCHDB_URL || '').trim();
  const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw || '127.0.0.1:5984'}`;
  const u = new URL(href);
  const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
  return `${u.origin}${pathPart}`.replace(/\/+$/, '');
}

const BASE = couchBaseUrl();
const AUTH = `Basic ${Buffer.from(
  `${process.env.COUCHDB_USER || ''}:${process.env.COUCHDB_PASSWORD || ''}`,
).toString('base64')}`;

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildWorkerWelcome({ name, companyName, storeName, role, scheduleLabel }) {
  const loginUrl = `${APP_URL}/auth/worker-login`;
  const displayName = name ? String(name).trim().split(/\s+/)[0] : '';
  const company = String(companyName || '').trim() || 'tu empresa';
  const store = String(storeName || '').trim();
  const roleLabel = String(role || '').trim();
  const schedule = String(scheduleLabel || '').trim();

  return {
    subject: `Bienvenido a Vertial · Ya formas parte de ${company}`,
    html: `<!DOCTYPE html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
<tr><td style="background:#0B1220;padding:20px 28px;"><p style="margin:0;color:#fff;font-weight:700;font-size:16px;">Vertial</p></td></tr>
<tr><td style="padding:28px;">
  <h2 style="margin:0 0 16px;color:#0B1220;font-size:22px;">¡Bienvenido a Vertial${displayName ? `, ${esc(displayName)}` : ''}!</h2>
  <p style="color:#52525b;margin:0 0 16px;line-height:1.6;">
    Ya eres trabajador de <strong>${esc(company)}</strong> en Vertial.
    Desde tu cuenta de empleado puedes fichar, ver tus tareas y consultar tu horario.
  </p>
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;margin:0 0 24px;">
    <p style="margin:0 0 8px;color:#1e40af;font-size:13px;font-weight:600;">Tu acceso</p>
    <p style="margin:0 0 4px;color:#1e3a8a;font-size:13px;">Empresa: <strong>${esc(company)}</strong></p>
    ${store ? `<p style="margin:0 0 4px;color:#1e3a8a;font-size:13px;">Tienda: <strong>${esc(store)}</strong></p>` : ''}
    ${roleLabel ? `<p style="margin:0 0 4px;color:#1e3a8a;font-size:13px;">Rol: <strong>${esc(roleLabel)}</strong></p>` : ''}
    ${schedule ? `<p style="margin:0;color:#1e3a8a;font-size:13px;">Horario: <strong>${esc(schedule)}</strong></p>` : ''}
  </div>
  <a href="${esc(loginUrl)}" style="display:inline-block;background:#2563EB;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;">Entrar como trabajador</a>
  <p style="color:#71717a;font-size:13px;margin:24px 0 0;line-height:1.5;">
    Entra con <strong>Acceso empleado</strong> usando el email con el que te registraste.
  </p>
</td></tr>
</table>
</td></tr></table>
</body></html>`,
  };
}

async function getAccount() {
  const res = await fetch(`${BASE}/accounts/_all_docs?include_docs=true`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
  return docs.find(
    (a) => a?.type === 'account' && String(a.email || '').toLowerCase() === POL_EMAIL,
  );
}

async function main() {
  const account = await getAccount();
  if (!account) throw new Error(`No encuentro ${POL_EMAIL}`);

  const { subject, html } = buildWorkerWelcome({
    name: account.fullName || 'Pol',
    companyName: account.companyName || 'hoypecamos',
    storeName: 'BADALONA',
    role: account.role || 'Usuario',
    scheduleLabel: account.employment?.schedule || '19:00–23:30',
  });

  console.log(APPLY ? '=== APPLY ===' : '=== DRY ===');
  console.log({ to: POL_EMAIL, subject, alreadySent: account.workerWelcomeEmailSentAt || null });

  if (!APPLY) {
    console.log('Sin envío. Usa --apply');
    return;
  }

  await sendEmail({ to: POL_EMAIL, subject, html, requireDelivery: true });

  const now = new Date().toISOString();
  const put = await fetch(`${BASE}/accounts/${encodeURIComponent(account._id)}`, {
    method: 'PUT',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...account,
      workerWelcomeEmailSentAt: now,
      updatedAt: now,
    }),
  });
  if (!put.ok) {
    const err = await put.json().catch(() => ({}));
    throw new Error(`Marcar sent: ${err.error || put.status}`);
  }
  console.log('✓ correo enviado y marcado workerWelcomeEmailSentAt');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
