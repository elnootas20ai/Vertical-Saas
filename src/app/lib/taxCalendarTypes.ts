import { v4 as uuidv4 } from 'uuid';

export type TaxModel =
  | 'modelo_303'
  | 'modelo_111'
  | 'modelo_115'
  | 'modelo_130'
  | 'modelo_200'
  | 'modelo_390'
  | 'modelo_190'
  | 'modelo_347'
  | 'ibi'
  | 'iae'
  | 'custom';

export type TaxObligationStatus = 'pending' | 'in_progress' | 'filed' | 'paid' | 'overdue';

export interface TaxObligation {
  _id: string;
  _rev?: string;
  id: string;
  type: 'tax_obligation';
  user_id: string;
  model: TaxModel;
  modelName: string;
  period: string;
  periodLabel: string;
  dueDate: string;
  filingDate?: string;
  status: TaxObligationStatus;
  estimatedAmount?: number;
  actualAmount?: number;
  documentId?: string;
  notes: string;
  reminderDaysBefore: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CreateTaxObligationPayload {
  user_id: string;
  model: TaxModel;
  modelName?: string;
  period: string;
  periodLabel?: string;
  dueDate: string;
  status?: TaxObligationStatus;
  estimatedAmount?: number;
  notes?: string;
  reminderDaysBefore?: number;
}

export interface FiscalPreset {
  model: TaxModel;
  name: string;
  periods: ('Q1' | 'Q2' | 'Q3' | 'Q4' | 'annual')[];
  dueDates: Record<string, string>;
}

function str(value: unknown, fallback = ''): string {
  return String(value ?? '').trim() || fallback;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const VALID_STATUSES: TaxObligationStatus[] = ['pending', 'in_progress', 'filed', 'paid', 'overdue'];

function normalizeStatus(value: unknown): TaxObligationStatus {
  const s = String(value || '');
  return VALID_STATUSES.includes(s as TaxObligationStatus) ? (s as TaxObligationStatus) : 'pending';
}

export const TAX_MODEL_NAMES: Record<TaxModel, string> = {
  modelo_303: 'Modelo 303 — IVA trimestral',
  modelo_111: 'Modelo 111 — Retenciones IRPF',
  modelo_115: 'Modelo 115 — Retenciones alquiler',
  modelo_130: 'Modelo 130 — Pago fraccionado IRPF',
  modelo_200: 'Modelo 200 — Impuesto de Sociedades',
  modelo_390: 'Modelo 390 — Resumen anual IVA',
  modelo_190: 'Modelo 190 — Resumen anual retenciones',
  modelo_347: 'Modelo 347 — Operaciones con terceros',
  ibi: 'IBI — Impuesto bienes inmuebles',
  iae: 'IAE — Impuesto actividades económicas',
  custom: 'Obligación personalizada',
};

export const FISCAL_CALENDAR_ES: FiscalPreset[] = [
  {
    model: 'modelo_303', name: 'Modelo 303 — IVA',
    periods: ['Q1', 'Q2', 'Q3', 'Q4'],
    dueDates: { Q1: '04-20', Q2: '07-20', Q3: '10-20', Q4: '01-30' },
  },
  {
    model: 'modelo_111', name: 'Modelo 111 — Retenciones IRPF',
    periods: ['Q1', 'Q2', 'Q3', 'Q4'],
    dueDates: { Q1: '04-20', Q2: '07-20', Q3: '10-20', Q4: '01-20' },
  },
  {
    model: 'modelo_115', name: 'Modelo 115 — Retenciones alquiler',
    periods: ['Q1', 'Q2', 'Q3', 'Q4'],
    dueDates: { Q1: '04-20', Q2: '07-20', Q3: '10-20', Q4: '01-20' },
  },
  {
    model: 'modelo_130', name: 'Modelo 130 — Pago fraccionado IRPF',
    periods: ['Q1', 'Q2', 'Q3', 'Q4'],
    dueDates: { Q1: '04-20', Q2: '07-20', Q3: '10-20', Q4: '01-30' },
  },
  {
    model: 'modelo_390', name: 'Modelo 390 — Resumen anual IVA',
    periods: ['annual'],
    dueDates: { annual: '01-30' },
  },
  {
    model: 'modelo_190', name: 'Modelo 190 — Resumen anual retenciones',
    periods: ['annual'],
    dueDates: { annual: '01-31' },
  },
  {
    model: 'modelo_200', name: 'Modelo 200 — Impuesto de Sociedades',
    periods: ['annual'],
    dueDates: { annual: '07-25' },
  },
  {
    model: 'modelo_347', name: 'Modelo 347 — Operaciones con terceros',
    periods: ['annual'],
    dueDates: { annual: '02-28' },
  },
];

const PERIOD_LABELS: Record<string, string> = {
  Q1: '1T', Q2: '2T', Q3: '3T', Q4: '4T', annual: 'Anual',
};

function getDueDateForPeriod(dueDateMmDd: string, year: number, period: string): string {
  const isNextYear = period === 'Q4' && dueDateMmDd.startsWith('01');
  const y = isNextYear ? year + 1 : year;
  return `${y}-${dueDateMmDd}`;
}

export function createTaxObligationRecord(payload: CreateTaxObligationPayload): TaxObligation {
  const now = new Date().toISOString();
  const id = `tax_obligation-${uuidv4()}`;

  return {
    _id: id,
    id,
    type: 'tax_obligation',
    user_id: str(payload.user_id),
    model: payload.model,
    modelName: str(payload.modelName) || TAX_MODEL_NAMES[payload.model] || payload.model,
    period: str(payload.period),
    periodLabel: str(payload.periodLabel) || str(payload.period),
    dueDate: str(payload.dueDate),
    status: normalizeStatus(payload.status),
    estimatedAmount: payload.estimatedAmount != null ? num(payload.estimatedAmount) : undefined,
    notes: str(payload.notes),
    reminderDaysBefore: num(payload.reminderDaysBefore, 7),
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeTaxObligation(value: unknown): TaxObligation | null {
  if (!value || typeof value !== 'object') return null;

  const doc = value as Partial<TaxObligation> & { _id?: string; type?: string };
  if (doc.type !== 'tax_obligation') return null;

  const id = str(doc.id || doc._id);
  const userId = str(doc.user_id);
  if (!id || !userId) return null;

  return {
    _id: str(doc._id) || id,
    _rev: str(doc._rev) || undefined,
    id,
    type: 'tax_obligation',
    user_id: userId,
    model: doc.model || 'custom',
    modelName: str(doc.modelName) || TAX_MODEL_NAMES[doc.model || 'custom'] || '',
    period: str(doc.period),
    periodLabel: str(doc.periodLabel),
    dueDate: str(doc.dueDate),
    filingDate: str(doc.filingDate) || undefined,
    status: normalizeStatus(doc.status),
    estimatedAmount: doc.estimatedAmount != null ? num(doc.estimatedAmount) : undefined,
    actualAmount: doc.actualAmount != null ? num(doc.actualAmount) : undefined,
    documentId: str(doc.documentId) || undefined,
    notes: str(doc.notes),
    reminderDaysBefore: num(doc.reminderDaysBefore, 7),
    createdAt: str(doc.createdAt) || new Date().toISOString(),
    updatedAt: str(doc.updatedAt || doc.createdAt) || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export function generateDefaultCalendar(
  userId: string,
  year: number,
  isAutonomo = true,
): TaxObligation[] {
  const obligations: TaxObligation[] = [];

  for (const preset of FISCAL_CALENDAR_ES) {
    if (preset.model === 'modelo_130' && !isAutonomo) continue;
    if (preset.model === 'modelo_200' && isAutonomo) continue;

    for (const period of preset.periods) {
      const dueDateMmDd = preset.dueDates[period];
      if (!dueDateMmDd) continue;

      const dueDate = getDueDateForPeriod(dueDateMmDd, year, period);
      const periodKey = period === 'annual' ? String(year) : `${year}-${period}`;
      const periodLabel = period === 'annual'
        ? `Anual ${year}`
        : `${PERIOD_LABELS[period]} ${year}`;

      obligations.push(
        createTaxObligationRecord({
          user_id: userId,
          model: preset.model,
          modelName: preset.name,
          period: periodKey,
          periodLabel,
          dueDate,
          notes: '',
          reminderDaysBefore: 7,
        }),
      );
    }
  }

  return obligations.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function getUpcomingDeadlines(
  obligations: TaxObligation[],
  daysAhead = 30,
): TaxObligation[] {
  const now = new Date();
  const limit = new Date(now.getTime() + daysAhead * 86_400_000);

  return obligations
    .filter((o) => {
      if (o.status === 'filed' || o.status === 'paid' || o.deletedAt) return false;
      const due = new Date(o.dueDate);
      return due >= now && due <= limit;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function getOverdueObligations(obligations: TaxObligation[]): TaxObligation[] {
  const now = new Date();
  return obligations
    .filter((o) => {
      if (o.status === 'filed' || o.status === 'paid' || o.deletedAt) return false;
      return new Date(o.dueDate) < now;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function daysUntilDue(obligation: TaxObligation): number {
  const now = new Date();
  const due = new Date(obligation.dueDate);
  return Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
}
