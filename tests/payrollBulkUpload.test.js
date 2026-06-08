import { describe, expect, it } from 'vitest';
import { suggestWorkerForPayrollFile } from '../src/app/lib/payrollBulkMatch.ts';
import { analyzePayrollBulkRows, parsePayrollManifestCsv } from '../src/app/lib/payrollBulkMatch.ts';

function member(partial) {
  const fullName = partial.fullName;
  const parts = fullName.split(' ');
  return {
    id: partial.user_id,
    user_id: partial.user_id,
    email: partial.email || `${fullName.toLowerCase().replace(/\s+/g, '.')}@test.local`,
    firstName: partial.firstName || parts[0] || '',
    lastName: partial.lastName || parts.slice(1).join(' ') || '',
    fullName,
    phone: '',
    avatar: '',
    accountType: 'user',
    role: 'Usuario',
    status: partial.status || 'active',
    companyName: '',
    createdAt: '',
    onboardingCompleted: true,
    emailVerified: true,
  };
}

describe('parsePayrollManifestCsv', () => {
  it('maps archivo and dni columns', () => {
    const csv = 'archivo;nombre;dni\nnomina_ana.pdf;Ana Trabajadora;12345678Z\n';
    const map = parsePayrollManifestCsv(csv);
    expect(map.get('nomina_ana.pdf')?.dni).toBe('12345678Z');
    expect(map.get('nomina_ana.pdf')?.name).toBe('Ana Trabajadora');
  });
});

describe('analyzePayrollBulkRows', () => {
  it('allows auto publish when all rows matched uniquely', () => {
    const rows = [
      { workerId: 'u1', fileName: 'a.pdf' },
      { workerId: 'u2', fileName: 'b.pdf' },
    ];
    expect(analyzePayrollBulkRows(rows).canAutoPublish).toBe(true);
  });
});
describe('suggestWorkerForPayrollFile', () => {
  const members = [
    member({ user_id: 'u1', fullName: 'Uriel', firstName: 'Uriel', lastName: '' }),
    member({ user_id: 'u2', fullName: 'Ana Trabajadora', firstName: 'Ana', lastName: 'Trabajadora' }),
  ];

  it('matches full name in filename', () => {
    const hit = suggestWorkerForPayrollFile('nomina_ana_trabajadora_marzo_2026.pdf', members);
    expect(hit?.workerId).toBe('u2');
  });

  it('matches first name when unique enough', () => {
    const hit = suggestWorkerForPayrollFile('recibo_uriel_03.pdf', members);
    expect(hit?.workerId).toBe('u1');
  });

  it('returns null when no match', () => {
    const hit = suggestWorkerForPayrollFile('documento_generico.pdf', members);
    expect(hit).toBeNull();
  });
});
