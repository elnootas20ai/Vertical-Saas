#!/usr/bin/env node
/**
 * Reenvía a Pol el email de afiliado aceptado con el código bien visible.
 *   node scripts/send-pol-affiliate-code-email.mjs --apply
 */
import '../config/env.js';
import { sendEmail } from '../services/email.js';

const APPLY = process.argv.includes('--apply');
const AFF_ID = 'aff-3ec6a8d3-060b-417f-8445-1a12fac469df';
const EXTRA_TO = ['munozluis.pol@gmail.com', 'munozluis.com@gmail.com'];

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

function portalUrl() {
  const base = String(process.env.APP_URL || process.env.PUBLIC_SITE_URL || 'https://vertialapp.com').replace(/\/+$/, '');
  return `${base}/panel-afiliado`;
}

function buildHtml(aff) {
  const code = String(aff.affiliateCode || '').trim();
  const ref = String(aff.referralCode || '—').trim();
  const url = portalUrl();
  return `<!DOCTYPE html>
<html lang="es"><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
<tr><td style="background:#16a34a;padding:24px 32px;">
  <span style="color:#fff;font-size:22px;font-weight:bold;">Vertial · Afiliado aceptado</span>
</td></tr>
<tr><td style="padding:32px;">
  <h2 style="margin:0 0 12px;color:#111;font-size:22px;">¡Bienvenido, ${esc(aff.name)}!</h2>
  <p style="color:#555;margin:0 0 20px;line-height:1.6;">
    Tu solicitud ha sido <strong>aceptada</strong>. Guarda este correo: aquí tienes tu
    <strong>código de afiliado</strong> para entrar al panel (aparte del SaaS de trabajador).
  </p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#052e16;border-radius:12px;">
    <tr><td style="padding:20px 24px;text-align:center;">
      <p style="margin:0 0 8px;color:#86efac;font-size:13px;font-weight:600;text-transform:uppercase;">Tu código de afiliado</p>
      <p style="margin:0;font-size:28px;font-weight:800;letter-spacing:3px;font-family:monospace;color:#fff;">${esc(code)}</p>
    </td></tr>
  </table>
  <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;"><tr><td style="background:#111;border-radius:8px;">
    <a href="${esc(url)}" style="display:inline-block;background:#111;color:#fff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
      Abrir panel de afiliado
    </a>
  </td></tr></table>
  <p style="color:#6b7280;margin:0 0 16px;font-size:13px;line-height:1.5;">
    Entra en <strong>Código</strong> y pega <strong style="font-family:monospace;">${esc(code)}</strong>.
    También puedes usar email y contraseña de tu cuenta Vertial en ese mismo panel.
  </p>
  <p style="color:#555;margin:0;font-size:14px;">Código de referido para clientes: <strong style="font-family:monospace;">${esc(ref)}</strong></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const res = await fetch(`${BASE}/affiliates/${encodeURIComponent(AFF_ID)}`, {
  headers: { Authorization: AUTH },
});
if (!res.ok) {
  console.error('No se pudo cargar afiliado', res.status, await res.text());
  process.exit(1);
}
const aff = await res.json();
const code = aff.affiliateCode || '—';
const recipients = [...new Set([
  String(aff.email || '').trim().toLowerCase(),
  ...EXTRA_TO.map((e) => e.toLowerCase()),
].filter(Boolean))];

console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log('Afiliado:', aff.name, code, aff.status);
console.log('Destinos:', recipients.join(', '));

if (!APPLY) {
  console.log('Sin envío. --apply para mandar.');
  process.exit(0);
}

const subject = `Tu código de afiliado ${code} · Vertial`;
const html = buildHtml(aff);
for (const to of recipients) {
  await sendEmail({ to, subject, html });
  console.log('  ✓ enviado a', to);
}
console.log('Listo.');
