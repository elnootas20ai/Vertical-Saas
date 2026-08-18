import { describe, expect, it } from 'vitest';
import { resolveBusinessAfterReload } from '../src/app/lib/pickCurrentBusiness';

const bodegeta = { business_id: 'biz-bodegeta', name: 'bodegeta' };
const events = { business_id: 'biz-events', name: 'Eventos' };

describe('resolveBusinessAfterReload', () => {
  it('usa el id guardado si está en la lista', () => {
    const r = resolveBusinessAfterReload([bodegeta, events], {
      storedId: 'biz-events',
      previous: events,
    });
    expect(r.business?.business_id).toBe('biz-events');
    expect(r.persistStoredId).toBe(true);
  });

  it('no cae a bodegeta si el id activo aún no sale en el fetch', () => {
    const r = resolveBusinessAfterReload([bodegeta], {
      storedId: 'biz-events',
      previous: events,
    });
    expect(r.business?.business_id).toBe('biz-events');
    expect(r.persistStoredId).toBe(false);
  });

  it('conserva la empresa de pantalla si sigue en la lista y el guardado no cuadra', () => {
    const r = resolveBusinessAfterReload([bodegeta, events], {
      storedId: 'biz-fantasma',
      previous: events,
    });
    expect(r.business?.business_id).toBe('biz-events');
  });

  it('la empresa en pantalla gana al id guardado (otra pestaña / TPV no te saltan a bodegeta)', () => {
    const r = resolveBusinessAfterReload([bodegeta, events], {
      storedId: 'biz-bodegeta',
      previous: events,
    });
    expect(r.business?.business_id).toBe('biz-events');
    expect(r.persistStoredId).toBe(true);
  });

  it('sin id ni anterior deja al caller elegir (tablet / primera)', () => {
    const r = resolveBusinessAfterReload([bodegeta, events], {
      storedId: null,
      previous: null,
    });
    expect(r.business).toBeNull();
  });

  it('id guardado ausente y sin anterior: no elige bodegeta', () => {
    const r = resolveBusinessAfterReload([bodegeta], {
      storedId: 'biz-events',
      previous: null,
    });
    expect(r.business).toBeNull();
    expect(r.persistStoredId).toBe(false);
  });
});
