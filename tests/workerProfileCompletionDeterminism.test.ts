/**
 * @vitest-environment node
 *
 * Regresión: computeWorkerProfileCompletion metía `new Date().toISOString()`
 * en el resultado. Al persistir la sesión en localStorage, cada escritura era
 * distinta y dos pestañas abiertas entraban en un ping-pong infinito de
 * eventos `storage` + /api/auth/me (tormenta de peticiones, dashboard roto).
 */
import { describe, expect, it } from 'vitest';
import { computeWorkerProfileCompletion } from '../src/app/lib/workerProfileCompletion.ts';

const account = {
  updatedAt: '2026-08-11T10:00:00.000Z',
  personalData: {
    dni: '12345678Z',
    birthDate: '1990-01-01',
    nationality: 'Española',
    address: 'Calle Mayor 1',
    city: 'Barcelona',
    postalCode: '08001',
    socialSecurityNumber: '281234567890',
  },
  employment: {
    emergencyContact: 'Contacto',
    emergencyPhone: '600000000',
    bankAccount: 'ES9121000418450200051332',
    startDate: '2024-01-01',
    contributionGroup: '1',
    mutualInsurance: 'Mutua',
  },
} as never;

describe('computeWorkerProfileCompletion', () => {
  it('es determinista: mismas entradas → mismo JSON en llamadas repetidas', async () => {
    const first = computeWorkerProfileCompletion(account);
    await new Promise((r) => setTimeout(r, 5));
    const second = computeWorkerProfileCompletion(account);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('usa el updatedAt de la cuenta (nunca un timestamp fresco)', () => {
    const result = computeWorkerProfileCompletion(account);
    expect(result.updatedAt).toBe('2026-08-11T10:00:00.000Z');
    const withoutDate = computeWorkerProfileCompletion({ personalData: {}, employment: {} } as never);
    expect(withoutDate.updatedAt).toBe('');
  });
});
