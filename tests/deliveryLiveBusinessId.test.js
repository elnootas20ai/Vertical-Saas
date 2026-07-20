import { describe, expect, it } from 'vitest';

/** Copia de la regla de broadcast: empresa del pedido manda sobre la cuenta. */
function resolveLiveBusinessId(account, doc) {
  return (
    String(doc?.business_id || doc?.businessId || '')
      .replace(/^business:/, '')
      .trim() ||
    String(account?.business_id || account?.businessId || '')
      .replace(/^business:/, '')
      .trim()
  );
}

describe('SSE live business scope', () => {
  it('usa business_id del pedido (modomio) aunque la cuenta tenga otra empresa', () => {
    const account = { business_id: 'empresa-cuenta' };
    const order = { business_id: 'modomio-id', orderNumber: 'PED-1' };
    expect(resolveLiveBusinessId(account, order)).toBe('modomio-id');
  });

  it('cae a la cuenta si el pedido no trae empresa', () => {
    expect(resolveLiveBusinessId({ business_id: 'empresa-cuenta' }, {})).toBe('empresa-cuenta');
  });
});
