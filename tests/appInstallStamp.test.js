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

  it('no borra si la build es la misma', () => {
    expect(shouldWipeSessionOnStampChange('native:1.0:34', 'native:1.0:34')).toBe(false);
  });

  it('borra si cambia la versión de marketing', () => {
    expect(shouldWipeSessionOnStampChange('native:1.0:40', 'native:1.1:1')).toBe(true);
  });
});
