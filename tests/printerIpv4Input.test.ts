import { describe, expect, it } from 'vitest';
import { isValidIpv4, sanitizeIpv4Input } from '../src/app/lib/vertialPrint/printerSetupStatus';

describe('sanitizeIpv4Input', () => {
  it('convierte comas del teclado iOS español en puntos', () => {
    expect(sanitizeIpv4Input('192,168,1,20')).toBe('192.168.1.20');
    expect(isValidIpv4('192,168,1,20')).toBe(true);
  });

  it('elimina caracteres no válidos', () => {
    expect(sanitizeIpv4Input('192.168.1.20abc')).toBe('192.168.1.20');
  });
});
