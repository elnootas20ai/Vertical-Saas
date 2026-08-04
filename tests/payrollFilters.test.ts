/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  filterPayrollDocuments,
  normalizePayrollSearch,
  payrollDocumentMatchesSearch,
} from '../src/app/lib/payrollFilters';

const doc = {
  _id: '1',
  type: 'payroll' as const,
  id: '1',
  worker_id: 'w1',
  worker_name: 'Ana García',
  documentType: 'nomina' as const,
  name: 'Nómina agosto',
  period: '2026-08',
  fileName: 'ana-agosto.pdf',
  uploadedBy: 'admin',
  createdAt: '2026-08-04T10:00:00.000Z',
  updatedAt: '2026-08-04T10:00:00.000Z',
};

describe('payrollFilters (trabajador)', () => {
  it('busca sin acentos y por mes', () => {
    expect(normalizePayrollSearch('García')).toBe('garcia');
    expect(payrollDocumentMatchesSearch(doc, 'nomina')).toBe(true);
    expect(payrollDocumentMatchesSearch(doc, '2026-08')).toBe(true);
  });

  it('filtra por período', () => {
    const other = { ...doc, _id: '2', id: '2', period: '2026-07' };
    expect(filterPayrollDocuments({ documents: [doc, other], period: '2026-08' })).toHaveLength(1);
  });
});
