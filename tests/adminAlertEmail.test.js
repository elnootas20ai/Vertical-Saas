import { describe, it, expect } from 'vitest';
import {
  wrapAdminAlertHtml,
  adminAlertSeverityForKey,
  escapeAdminHtml,
} from '../services/adminAlertEmail.js';
import { getAdminInbox } from '../services/adminInbox.js';
import { getFormattedFromAddress } from '../services/email.js';

describe('adminAlertEmail', () => {
  it('escapa HTML en alertas', () => {
    expect(escapeAdminHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('envuelve HTML corto con plantilla', () => {
    const html = wrapAdminAlertHtml('🚨 Test', '<p>Hola</p>', 'critical');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Hola');
    expect(html).toContain('#dc2626');
  });

  it('no envuelve documento completo', () => {
    const full = '<!DOCTYPE html><html><body>ok</body></html>';
    expect(wrapAdminAlertHtml('x', full)).toBe(full);
  });

  it('clasifica severidad por key', () => {
    expect(adminAlertSeverityForKey('couchdb_recovered')).toBe('success');
    expect(adminAlertSeverityForKey('backup_failed')).toBe('critical');
    expect(adminAlertSeverityForKey('ram_high')).toBe('warning');
  });
});

describe('adminInbox', () => {
  it('prioriza ALERTS_ADMIN_EMAIL', () => {
    const prev = process.env.ALERTS_ADMIN_EMAIL;
    process.env.ALERTS_ADMIN_EMAIL = 'admin@test.com';
    process.env.BUG_REPORT_EMAIL = 'bug@test.com';
    expect(getAdminInbox()).toBe('admin@test.com');
    if (prev === undefined) delete process.env.ALERTS_ADMIN_EMAIL;
    else process.env.ALERTS_ADMIN_EMAIL = prev;
  });
});

describe('getFormattedFromAddress', () => {
  it('incluye nombre Vertial', () => {
    const prevName = process.env.EMAIL_FROM_NAME;
    const prevFrom = process.env.EMAIL_FROM;
    process.env.EMAIL_FROM_NAME = 'Vertial';
    process.env.EMAIL_FROM = 'noreply@test.com';
    expect(getFormattedFromAddress()).toBe('"Vertial" <noreply@test.com>');
    if (prevName === undefined) delete process.env.EMAIL_FROM_NAME;
    else process.env.EMAIL_FROM_NAME = prevName;
    if (prevFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = prevFrom;
  });
});
