import { describe, expect, it } from 'vitest';
import {
  enforceNativeProductionApiOrigin,
  isUnsafeNativeApiOrigin,
  NATIVE_PRODUCTION_API_ORIGIN,
} from '../src/app/lib/nativeProductionGuard.ts';

describe('nativeProductionGuard', () => {
  it('marca localhost y redes privadas como inseguras', () => {
    expect(isUnsafeNativeApiOrigin('http://127.0.0.1:3001')).toBe(true);
    expect(isUnsafeNativeApiOrigin('http://192.168.1.50')).toBe(true);
    expect(isUnsafeNativeApiOrigin('http://10.0.0.5')).toBe(true);
    expect(isUnsafeNativeApiOrigin('http://172.16.0.1')).toBe(true);
    expect(isUnsafeNativeApiOrigin('http://localhost:5173')).toBe(true);
  });

  it('acepta solo HTTPS de producción', () => {
    expect(isUnsafeNativeApiOrigin('https://vertialapp.com')).toBe(false);
  });

  it('fuerza producción si el origen es local', () => {
    expect(enforceNativeProductionApiOrigin('http://127.0.0.1:3001')).toBe(NATIVE_PRODUCTION_API_ORIGIN);
    expect(enforceNativeProductionApiOrigin('https://vertialapp.com/')).toBe(NATIVE_PRODUCTION_API_ORIGIN);
  });
});
