import { v4 as uuidv4 } from 'uuid';

export type FinanceMovementDocType = 'cobro' | 'pago';
export type FinanceMovementStatus = 'paid' | 'pending';
export type FinanceMovementSource =
  | 'manual'
  | 'invoice'
  | 'ocr'
  | 'sale'
  | 'tpv_session'
  | 'delivery_order'
  | 'delivery_order_refund'
  | 'labor_month'
  | 'supplier_invoice'
  | 'rent_contract';

export interface LinkedDocument {
  id: string;
  type: 'client_invoice' | 'purchase_invoice' | 'document' | 'file';
  name: string;
  url?: string;
}

export interface FinanceMovementRecord {
  _id: string;
  _rev?: string;
  id: string;
  type: FinanceMovementDocType;
  user_id: string;
  companyName?: string;
  concept: string;
  reference: string;
  category: string;
  categoryIcon?: string;
  categoryColor?: string;
  amountBase: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  date: string;
  payMethod: string;
  notes: string;
  status: FinanceMovementStatus;
  dueDate: string;
  paidAt: string;
  reconciled: boolean;
  reconciledBankTxId: string;
  linkedDocuments: LinkedDocument[];
  attachmentUrl: string;
  source: FinanceMovementSource;
  sourceRef: string;
  dismissedDuplicates: string[];
  bankAccountId?: string;
  bankAccountName?: string;
  linkedInvoiceId?: string;
  linkedInvoiceType?: 'client_invoice' | 'purchase_invoice' | 'vertical_billing';
  businessId?: string;
  businessName?: string;
  workCenterId?: string;
  workCenterName?: string;
  pointOfSaleId?: string;
  pointOfSaleName?: string;
  brandId?: string;
  brandName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFinanceMovementPayload {
  type: FinanceMovementDocType;
  user_id: string;
  companyName?: string;
  concept: string;
  reference?: string;
  category: string;
  categoryIcon?: string;
  categoryColor?: string;
  amountBase: number;
  taxRate?: number;
  date: string;
  payMethod: string;
  notes?: string;
  status?: FinanceMovementStatus;
  dueDate?: string;
  paidAt?: string;
  linkedDocuments?: LinkedDocument[];
  attachmentUrl?: string;
  source?: FinanceMovementSource;
  sourceRef?: string;
  bankAccountId?: string;
  bankAccountName?: string;
  linkedInvoiceId?: string;
  linkedInvoiceType?: 'client_invoice' | 'purchase_invoice' | 'vertical_billing';
  businessId?: string;
  businessName?: string;
  workCenterId?: string;
  workCenterName?: string;
  pointOfSaleId?: string;
  pointOfSaleName?: string;
  brandId?: string;
  brandName?: string;
}

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeNumber(value: unknown, fallback = 0) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

export function buildFinanceReference(
  movementType: FinanceMovementDocType,
  date: string,
  sequence: number,
) {
  const year = String(date || new Date().toISOString()).slice(0, 4) || String(new Date().getFullYear());
  const prefix = movementType === 'cobro' ? 'COB' : 'PAG';
  return `${prefix}-${year}-${String(Math.max(1, sequence)).padStart(4, '0')}`;
}

export function createFinanceMovementRecord(
  payload: CreateFinanceMovementPayload,
): FinanceMovementRecord {
  const now = new Date().toISOString();
  const amountBase = normalizeNumber(payload.amountBase);
  const taxRate = normalizeNumber(payload.taxRate);
  const taxAmount = Number((amountBase * (taxRate / 100)).toFixed(2));
  const totalAmount = Number((amountBase + taxAmount).toFixed(2));
  const id = `finance-${uuidv4()}`;

  return {
    _id: id,
    id,
    type: payload.type,
    user_id: normalizeText(payload.user_id),
    companyName: normalizeText(payload.companyName),
    concept: normalizeText(payload.concept),
    reference: normalizeText(payload.reference),
    category: normalizeText(payload.category),
    categoryIcon: normalizeText(payload.categoryIcon),
    categoryColor: normalizeText(payload.categoryColor),
    amountBase,
    taxRate,
    taxAmount,
    totalAmount,
    date: normalizeText(payload.date) || now.slice(0, 10),
    payMethod: normalizeText(payload.payMethod),
    notes: normalizeText(payload.notes),
    status: payload.status === 'pending' ? 'pending' : 'paid',
    dueDate: normalizeText(payload.dueDate),
    paidAt: payload.status === 'paid' ? now : normalizeText(payload.paidAt),
    reconciled: false,
    reconciledBankTxId: '',
    linkedDocuments: payload.linkedDocuments || [],
    attachmentUrl: normalizeText(payload.attachmentUrl),
    source: normalizeText(payload.source) || 'manual',
    sourceRef: normalizeText(payload.sourceRef),
    dismissedDuplicates: [],
    bankAccountId: normalizeText(payload.bankAccountId) || undefined,
    bankAccountName: normalizeText(payload.bankAccountName) || undefined,
    linkedInvoiceId: normalizeText(payload.linkedInvoiceId) || undefined,
    linkedInvoiceType: payload.linkedInvoiceType || undefined,
    businessId: normalizeText(payload.businessId) || undefined,
    businessName: normalizeText(payload.businessName) || undefined,
    workCenterId: normalizeText(payload.workCenterId) || undefined,
    workCenterName: normalizeText(payload.workCenterName) || undefined,
    pointOfSaleId: normalizeText(payload.pointOfSaleId) || undefined,
    pointOfSaleName: normalizeText(payload.pointOfSaleName) || undefined,
    brandId: normalizeText(payload.brandId) || undefined,
    brandName: normalizeText(payload.brandName) || undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeFinanceMovementRecord(value: unknown): FinanceMovementRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const doc = value as Partial<FinanceMovementRecord> & { _id?: string; id?: string; type?: string };
  if (doc.type !== 'cobro' && doc.type !== 'pago') {
    return null;
  }

  const id = normalizeText(doc.id || doc._id);
  const userId = normalizeText(doc.user_id);
  const concept = normalizeText(doc.concept);
  const category = normalizeText(doc.category);
  if (!id || !userId || !concept || !category) {
    return null;
  }

  const amountBase = normalizeNumber(doc.amountBase);
  const taxRate = normalizeNumber(doc.taxRate);
  const taxAmount =
    doc.taxAmount !== undefined
      ? normalizeNumber(doc.taxAmount)
      : Number((amountBase * (taxRate / 100)).toFixed(2));
  const totalAmount =
    doc.totalAmount !== undefined
      ? normalizeNumber(doc.totalAmount)
      : Number((amountBase + taxAmount).toFixed(2));

  const status = (doc as any).status === 'pending' ? 'pending' : 'paid';

  return {
    _id: normalizeText(doc._id) || id,
    _rev: normalizeText(doc._rev) || undefined,
    id,
    type: doc.type,
    user_id: userId,
    companyName: normalizeText(doc.companyName) || undefined,
    concept,
    reference: normalizeText(doc.reference),
    category,
    categoryIcon: normalizeText(doc.categoryIcon) || undefined,
    categoryColor: normalizeText(doc.categoryColor) || undefined,
    amountBase,
    taxRate,
    taxAmount,
    totalAmount,
    date: normalizeText(doc.date) || new Date().toISOString().slice(0, 10),
    payMethod: normalizeText(doc.payMethod),
    notes: normalizeText(doc.notes),
    status,
    dueDate: normalizeText((doc as any).dueDate),
    paidAt: normalizeText((doc as any).paidAt),
    reconciled: Boolean((doc as any).reconciled),
    reconciledBankTxId: normalizeText((doc as any).reconciledBankTxId),
    linkedDocuments: Array.isArray((doc as any).linkedDocuments) ? (doc as any).linkedDocuments : [],
    attachmentUrl: normalizeText((doc as any).attachmentUrl),
    source: normalizeText((doc as any).source) || 'manual',
    sourceRef: normalizeText((doc as any).sourceRef),
    dismissedDuplicates: Array.isArray((doc as any).dismissedDuplicates) ? (doc as any).dismissedDuplicates : [],
    bankAccountId: normalizeText((doc as any).bankAccountId) || undefined,
    bankAccountName: normalizeText((doc as any).bankAccountName) || undefined,
    linkedInvoiceId: normalizeText((doc as any).linkedInvoiceId) || undefined,
    linkedInvoiceType: (doc as any).linkedInvoiceType || undefined,
    businessId: normalizeText((doc as any).businessId) || undefined,
    businessName: normalizeText((doc as any).businessName) || undefined,
    workCenterId: normalizeText((doc as any).workCenterId) || undefined,
    workCenterName: normalizeText((doc as any).workCenterName) || undefined,
    pointOfSaleId: normalizeText((doc as any).pointOfSaleId) || undefined,
    pointOfSaleName: normalizeText((doc as any).pointOfSaleName) || undefined,
    brandId: normalizeText((doc as any).brandId) || undefined,
    brandName: normalizeText((doc as any).brandName) || undefined,
    createdAt: normalizeText(doc.createdAt) || new Date().toISOString(),
    updatedAt: normalizeText(doc.updatedAt || doc.createdAt) || new Date().toISOString(),
  } as FinanceMovementRecord;
}
