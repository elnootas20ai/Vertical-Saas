import { describe, expect, it } from 'vitest';
import { PAYROLL_DOC_FOLDERS } from '../src/app/lib/payrollDocFolders';

describe('PAYROLL_DOC_FOLDERS', () => {
  it('clasifica tipos clave en carpetas distintas', () => {
    const pick = (type: Parameters<(typeof PAYROLL_DOC_FOLDERS)[0]['match']>[0]) =>
      PAYROLL_DOC_FOLDERS.find((f) => f.match(type))?.id;

    expect(pick('nomina')).toBe('nomina');
    expect(pick('contrato')).toBe('contrato');
    expect(pick('certificado')).toBe('certificado');
    expect(pick('justificante')).toBe('justificante');
    expect(pick('baja')).toBe('baja');
    expect(pick('dni_nie')).toBe('identity');
    expect(pick('pasaporte')).toBe('identity');
  });
});
