import { afterEach, describe, expect, it } from 'vitest';
import { buildEmailVerificationEmail } from '../services/email.js';

describe('buildEmailVerificationEmail', () => {
  const prevAppUrl = process.env.APP_URL;

  afterEach(() => {
    if (prevAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevAppUrl;
  });

  it('genera asunto y HTML con enlace de verificación', () => {
    process.env.APP_URL = 'https://app.vertial.test';
    const email = 'usuario@ejemplo.com';
    const token = 'abc123token';

    const { subject, html } = buildEmailVerificationEmail(email, token);

    expect(subject).toBe('Verifica tu email · Vertial');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Confirma tu dirección de email');
    expect(html).toContain('Verificar mi email');
    expect(html).toContain('24 horas');
    expect(html).toContain('#2563eb');
    expect(html).toContain('#09090b');
    expect(html).toContain(
      'https://app.vertial.test/auth/verify-email-pending?token=abc123token&email=usuario%40ejemplo.com',
    );
  });

  it('codifica email y token en la URL', () => {
    process.env.APP_URL = 'https://app.vertial.test';
    const email = 'test+alias@dominio.es';
    const token = 'token/con+especial&chars';

    const { html } = buildEmailVerificationEmail(email, token);

    expect(html).toContain('email=test%2Balias%40dominio.es');
    expect(html).toContain('token=token%2Fcon%2Bespecial%26chars');
  });
});
