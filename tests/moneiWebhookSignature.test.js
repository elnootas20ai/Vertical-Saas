import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import {
  verifyWebhookSignature,
} from '../services/monei.js';

function signBody(apiKey, body, timestamp = Math.floor(Date.now() / 1000)) {
  const signedPayload = `${timestamp}.${body}`;
  const v1 = crypto.createHmac('sha256', apiKey).update(signedPayload, 'utf8').digest('hex');
  return { header: `t=${timestamp},v1=${v1}`, timestamp };
}

describe('verifyWebhookSignature', () => {
  const prev = {};

  beforeEach(() => {
    prev.TOKEN_API_KEY_TEST = process.env.TOKEN_API_KEY_TEST;
    prev.MONEI_WEBHOOK_SKIP_VERIFY = process.env.MONEI_WEBHOOK_SKIP_VERIFY;
    process.env.TOKEN_API_KEY_TEST = 'pk_test_monei_preflight_secret';
    delete process.env.MONEI_WEBHOOK_SKIP_VERIFY;
  });

  afterEach(() => {
    if (prev.TOKEN_API_KEY_TEST === undefined) delete process.env.TOKEN_API_KEY_TEST;
    else process.env.TOKEN_API_KEY_TEST = prev.TOKEN_API_KEY_TEST;
    if (prev.MONEI_WEBHOOK_SKIP_VERIFY === undefined) delete process.env.MONEI_WEBHOOK_SKIP_VERIFY;
    else process.env.MONEI_WEBHOOK_SKIP_VERIFY = prev.MONEI_WEBHOOK_SKIP_VERIFY;
  });

  it('acepta firma v1 válida', () => {
    const body = JSON.stringify({ id: 'pay_1', status: 'SUCCEEDED' });
    const { header } = signBody(process.env.TOKEN_API_KEY_TEST, body);
    expect(verifyWebhookSignature(body, header, process.env.TOKEN_API_KEY_TEST)).toBe(true);
  });

  it('rechaza firma incorrecta', () => {
    const body = JSON.stringify({ id: 'pay_1' });
    const { header } = signBody('pk_test_other_key', body);
    expect(verifyWebhookSignature(body, header, process.env.TOKEN_API_KEY_TEST)).toBe(false);
  });

  it('rechaza sin cabecera cuando skip verify está off', () => {
    expect(verifyWebhookSignature('{}', undefined, process.env.TOKEN_API_KEY_TEST)).toBe(false);
  });
});
