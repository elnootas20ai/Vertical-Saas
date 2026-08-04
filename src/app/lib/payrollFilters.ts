import {
  formatPayrollPeriodLabel,
  PAYROLL_DOC_TYPE_LABELS,
  type PayrollDocument,
  type PayrollDocumentType,
} from './payrollApi';

export function normalizePayrollSearch(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Acepta `2026-08`, `08/2026` → `YYYY-MM` si se puede. */
export function parsePayrollPeriodQuery(raw: string): string {
  const t = String(raw || '').trim();
  if (/^\d{4}-\d{2}$/.test(t)) return t;
  const slash = t.match(/^(\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const mm = String(slash[1]).padStart(2, '0');
    return `${slash[2]}-${mm}`;
  }
  return '';
}

export function payrollDocumentMatchesSearch(
  doc: PayrollDocument,
  query: string,
): boolean {
  const q = normalizePayrollSearch(query);
  if (!q) return true;

  const periodParsed = parsePayrollPeriodQuery(query);
  if (periodParsed && doc.period === periodParsed) return true;

  const typeLabel = PAYROLL_DOC_TYPE_LABELS[doc.documentType] || doc.documentType;
  const periodLabel = formatPayrollPeriodLabel(doc.period);
  const haystack = normalizePayrollSearch(
    [
      doc.name,
      doc.worker_name,
      doc.fileName,
      doc.period,
      periodLabel,
      typeLabel,
      doc.documentType,
      doc.uploadedByName,
    ]
      .filter(Boolean)
      .join(' '),
  );
  return haystack.includes(q);
}

export type PayrollDocsFilterInput = {
  documents: PayrollDocument[];
  search?: string;
  documentType?: PayrollDocumentType | 'all';
  /** `YYYY-MM` — filtra por período de nómina/doc */
  period?: string;
};

export function filterPayrollDocuments(input: PayrollDocsFilterInput): PayrollDocument[] {
  const {
    documents,
    search = '',
    documentType = 'all',
    period = '',
  } = input;

  const periodKey = period.trim();

  return documents.filter((doc) => {
    if (documentType !== 'all' && doc.documentType !== documentType) return false;
    if (periodKey) {
      if (doc.period) {
        if (doc.period !== periodKey) return false;
      } else {
        const created = String(doc.createdAt || '').slice(0, 7);
        if (created !== periodKey) return false;
      }
    }
    if (search.trim() && !payrollDocumentMatchesSearch(doc, search)) return false;
    return true;
  });
}
