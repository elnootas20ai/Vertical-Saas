import { describe, expect, it } from 'vitest';
import { payrollSampleFileNameForMember } from '../src/app/lib/payrollSampleZip';

describe('payrollSampleZip', () => {
  it('generates filename from worker name and period', () => {
    const fileName = payrollSampleFileNameForMember(
      {
        user_id: 'u1',
        fullName: 'Uriel García',
        status: 'active',
      },
      '2026-05',
    );
    expect(fileName).toBe('nomina_uriel_garcia_2026_05.pdf');
  });

  it('generates filename for Ana', () => {
    const fileName = payrollSampleFileNameForMember(
      {
        user_id: 'u2',
        firstName: 'Ana',
        lastName: 'López',
        status: 'active',
      },
      '2026-05',
    );
    expect(fileName).toBe('nomina_ana_lopez_2026_05.pdf');
  });
});
