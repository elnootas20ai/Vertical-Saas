// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { shouldWipeSessionOnStampChange } from '../src/app/lib/appInstallStamp';

describe('shouldWipeSessionOnStampChange', () => {
  it('no borra en instalación limpia sin sesión previa', () => {
    expect(shouldWipeSessionOnStampChange(null, 'native:1.0:34')).toBe(false);
    expect(shouldWipeSessionOnStampChange('', 'native:1.0:34', { hasPersistedSession: false })).toBe(false);
  });

  it('borra la primera vez si había sesión de una build antigua', () => {
    expect(shouldWipeSessionOnStampChange(null, 'native:1.0:34', { hasPersistedSession: true })).toBe(true);
  });

  it('borra al subir de build TestFlight', () => {
    expect(shouldWipeSessionOnStampChange('native:1.0:33', 'native:1.0:34')).toBe(true);
  });

  it('borra si cambia el stamp del bundle JS (mismo nº de build)', () => {
    expect(
      shouldWipeSessionOnStampChange('native:1.8:50:old-bundle', 'native:1.8:50:new-bundle'),
    ).toBe(true);
  });

  it('no borra si la build es la misma', () => {
    expect(shouldWipeSessionOnStampChange('native:1.0:34:x', 'native:1.0:34:x')).toBe(false);
  });

  it('borra si cambia la versión de marketing', () => {
    expect(shouldWipeSessionOnStampChange('native:1.0:40:a', 'native:1.1:1:a')).toBe(true);
  });
});
