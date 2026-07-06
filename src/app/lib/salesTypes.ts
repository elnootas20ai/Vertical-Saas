import { v4 as uuidv4 } from 'uuid';

export type SaleStage = 'interested' | 'reserved' | 'documentation' | 'sold' | 'delivered';

export interface SaleHistoryEntry {
  id: string;
  type: 'created' | 'stage' | 'payment' | 'note' | 'document';
  title: string;
  description: string;
  date: string;
  user: string;
  metadata?: Record<string, unknown>;
}

export interface SalePaymentEntry {
  id: string;
  amount: number;
  method: string;
  date: string;
  note?: string;
}

export interface SaleNoteEntry {
  id: string;
  text: string;
  date: string;
  user: string;
}

export interface SalePriceHistoryEntry {
  id: string;
  previousPrice: number;
  newPrice: number;
  reason: string;
  date: string;
  user: string;
  approvedBy?: string;
  belowMinimum?: boolean;
}

export interface SaleDeliveryChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  notes: string;
}

export const DEFAULT_DELIVERY_CHECKLIST: Omit<SaleDeliveryChecklistItem, 'checked' | 'notes'>[] = [
  { id: 'payment',     label: 'Cobro completo verificado' },
  { id: 'contract',    label: 'Contrato de compraventa firmado por ambas partes' },
  { id: 'invoice',     label: 'Factura de venta emitida y entregada' },
  { id: 'docs',        label: 'Documentación completa (ficha técnica, ITV, permiso circulación)' },
  { id: 'transfer',    label: 'Transferencia de titularidad tramitada' },
  { id: 'keys',        label: 'Llaves entregadas (principal + copia)' },
  { id: 'accessories', label: 'Accesorios incluidos (alfombrillas, triángulos, chaleco)' },
  { id: 'condition',   label: 'Estado del vehículo verificado (sin daños nuevos)' },
  { id: 'manual',      label: 'Manual del propietario entregado' },
  { id: 'warranty',    label: 'Garantía y condiciones explicadas al cliente' },
  { id: 'clean',       label: 'Vehículo limpio y preparado para entrega' },
  { id: 'fuel',        label: 'Nivel de combustible verificado y registrado' },
  { id: 'mileage',     label: 'Kilometraje registrado en el acta de entrega' },
];

/** Une checklist guardado con plantilla actual (añade filas nuevas sin borrar checks). */
export function mergeDeliveryChecklistWithDefaults(
  existing: SaleDeliveryChecklistItem[],
): SaleDeliveryChecklistItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  return DEFAULT_DELIVERY_CHECKLIST.map((def) => {
    const cur = byId.get(def.id);
    return cur
      ? { ...def, checked: cur.checked, notes: cur.notes }
      : { ...def, checked: false, notes: '' };
  });
}

export interface SaleDocumentEntry {
  id: string;
  name: string;
  status: 'ok' | 'pending';
  type: string;
  size: string;
  date: string;
  fileData?: string;
  mimeType?: string;
}

export interface SaleClosureData {
  closedAt: string;
  closedBy: string;
  approvedBy?: string;
  paymentComplete: boolean;
  contractSigned: boolean;
  documentationComplete: boolean;
  closureNotes: string;
  finalPrice: number;
  finalMargin: number;
  finalMarginPercent: number;
  associatedCosts: number;
  commissionAmount?: number;
  commissionAgent?: string;
}

export interface SaleDeliveryData {
  scheduledDate: string;
  actualDate?: string;
  deliveredBy: string;
  receivedBy: string;
  receivedByDni?: string;
  receivedByPhone?: string;
  deliveryLocation: string;
  deliveryNotes: string;
  signatureData?: string;
  actaDocumentId?: string;
  fuelLevel?: string;
  mileageAtDelivery?: number;
  conditionNotes?: string;
  photosAtDelivery?: string[];
}

export type SaleBlockReason = 'sold' | 'reserved' | 'pending_delivery';

export interface SaleRecord {
  _id: string;
  _rev?: string;
  type: 'sale';
  id: string;
  user_id?: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  vehicleYear?: number;
  vehicleMileage?: number;
  vehicleFuel?: string;
  purchasePrice: number;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientDni?: string;
  stage: SaleStage;
  totalPrice: number;
  depositPaid: number;
  financingAmount: number;
  financingBank?: string;
  paymentMethod?: string;
  operationType?: string;
  createdAt: string;
  updatedAt: string;
  expectedDelivery?: string;
  deliveredAt?: string;
  responsible: string;
  responsibleId?: string;
  notes: string;
  stageHistory: SaleHistoryEntry[];
  paymentHistory: SalePaymentEntry[];
  internalNotes: SaleNoteEntry[];
  generatedDocuments: SaleDocumentEntry[];
  priceHistory: SalePriceHistoryEntry[];
  deliveryChecklist: SaleDeliveryChecklistItem[];
  minimumPrice?: number;
  workCenterId?: string;
  workCenterName?: string;
  closureData?: SaleClosureData;
  deliveryData?: SaleDeliveryData;
  vehicleBlocked?: boolean;
  vehicleBlockReason?: SaleBlockReason;
  vehicleStatusBeforeSale?: string;
  leadId?: string;
  financeIncomeCreated?: boolean;
}

export interface CreateSalePayload {
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  vehicleYear?: number;
  vehicleMileage?: number;
  vehicleFuel?: string;
  purchasePrice: number;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  stage: SaleStage;
  totalPrice: number;
  depositPaid: number;
  financingAmount: number;
  financingBank?: string;
  paymentMethod?: string;
  operationType?: string;
  expectedDelivery?: string;
  responsible: string;
  responsibleId?: string;
  notes: string;
  workCenterId?: string;
  workCenterName?: string;
  vehicleStatusBeforeSale?: string;
  leadId?: string;
}

export const SALE_STAGE_LABELS: Record<SaleStage, string> = {
  interested: 'Interesado',
  reserved: 'Reserva',
  documentation: 'Documentación',
  sold: 'Vendido',
  delivered: 'Entregado',
};

export function createSaleRecord(payload: CreateSalePayload): SaleRecord {
  const id = `sale-${uuidv4()}`;
  const now = new Date().toISOString();

  return {
    _id: id,
    type: 'sale',
    id,
    vehicleId: payload.vehicleId,
    vehicleName: payload.vehicleName,
    vehiclePlate: payload.vehiclePlate,
    vehicleYear: payload.vehicleYear,
    vehicleMileage: payload.vehicleMileage,
    vehicleFuel: payload.vehicleFuel,
    purchasePrice: payload.purchasePrice,
    clientId: payload.clientId,
    clientName: payload.clientName,
    clientPhone: payload.clientPhone,
    clientEmail: payload.clientEmail,
    stage: payload.stage,
    totalPrice: payload.totalPrice,
    depositPaid: payload.depositPaid,
    financingAmount: payload.financingAmount,
    financingBank: payload.financingBank || '',
    paymentMethod: payload.paymentMethod || '',
    operationType: payload.operationType || '',
    createdAt: now,
    updatedAt: now,
    expectedDelivery: payload.expectedDelivery || '',
    deliveredAt: payload.stage === 'delivered' ? now : '',
    responsible: payload.responsible,
    responsibleId: payload.responsibleId || undefined,
    notes: payload.notes,
    stageHistory: [
      {
        id: `hist-${uuidv4()}`,
        type: 'created',
        title: 'Operación creada',
        description: `Venta registrada en fase ${SALE_STAGE_LABELS[payload.stage]}.`,
        date: now,
        user: payload.responsible,
      },
    ],
    paymentHistory:
      payload.depositPaid > 0
        ? [
            {
              id: `pay-${uuidv4()}`,
              amount: payload.depositPaid,
              method: payload.paymentMethod || 'No especificado',
              date: now,
              note: 'Importe inicial registrado al crear la venta',
            },
          ]
        : [],
    internalNotes: payload.notes
      ? [
          {
            id: `note-${uuidv4()}`,
            text: payload.notes,
            date: now,
            user: payload.responsible,
          },
        ]
      : [],
    generatedDocuments: [],
    priceHistory: [],
    deliveryChecklist: DEFAULT_DELIVERY_CHECKLIST.map((item) => ({ ...item, checked: false, notes: '' })),
    minimumPrice: payload.purchasePrice,
    workCenterId: payload.workCenterId || '',
    workCenterName: payload.workCenterName || '',
    vehicleBlocked: payload.stage !== 'interested',
    vehicleBlockReason:
      payload.stage === 'reserved' || payload.stage === 'documentation'
        ? 'reserved'
        : payload.stage === 'sold' || payload.stage === 'delivered'
          ? 'sold'
          : undefined,
    vehicleStatusBeforeSale: payload.vehicleStatusBeforeSale,
    leadId: payload.leadId,
  };
}

export function normalizeSaleRecord(value: unknown): SaleRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const doc = value as Partial<SaleRecord> & { _id?: string; id?: string; type?: string };
  if (doc.type !== 'sale') {
    return null;
  }

  const id = String(doc.id || doc._id || '');
  if (!id) {
    return null;
  }

  const rawChecklist = Array.isArray(doc.deliveryChecklist) && doc.deliveryChecklist.length > 0
    ? doc.deliveryChecklist
    : DEFAULT_DELIVERY_CHECKLIST.map((item) => ({ ...item, checked: false, notes: '' }));

  return {
    _id: String(doc._id || id),
    _rev: doc._rev,
    type: 'sale',
    id,
    user_id: doc.user_id ? String(doc.user_id) : undefined,
    vehicleId: String(doc.vehicleId || ''),
    vehicleName: String(doc.vehicleName || ''),
    vehiclePlate: String(doc.vehiclePlate || ''),
    vehicleYear: Number(doc.vehicleYear || 0) || undefined,
    vehicleMileage: Number(doc.vehicleMileage || 0) || undefined,
    vehicleFuel: doc.vehicleFuel ? String(doc.vehicleFuel) : '',
    purchasePrice: Number(doc.purchasePrice || 0),
    clientId: String(doc.clientId || ''),
    clientName: String(doc.clientName || ''),
    clientPhone: String(doc.clientPhone || ''),
    clientEmail: String(doc.clientEmail || ''),
    clientDni: doc.clientDni ? String(doc.clientDni) : undefined,
    stage: (doc.stage as SaleStage) || 'interested',
    totalPrice: Number(doc.totalPrice || 0),
    depositPaid: Number(doc.depositPaid || 0),
    financingAmount: Number(doc.financingAmount || 0),
    financingBank: doc.financingBank ? String(doc.financingBank) : '',
    paymentMethod: doc.paymentMethod ? String(doc.paymentMethod) : '',
    operationType: doc.operationType ? String(doc.operationType) : '',
    createdAt: String(doc.createdAt || new Date().toISOString()),
    updatedAt: String(doc.updatedAt || doc.createdAt || new Date().toISOString()),
    expectedDelivery: doc.expectedDelivery ? String(doc.expectedDelivery) : '',
    deliveredAt: doc.deliveredAt ? String(doc.deliveredAt) : '',
    responsible: String(doc.responsible || 'Sin asignar'),
    responsibleId: doc.responsibleId ? String(doc.responsibleId) : undefined,
    notes: String(doc.notes || ''),
    stageHistory: Array.isArray(doc.stageHistory) ? doc.stageHistory : [],
    paymentHistory: Array.isArray(doc.paymentHistory) ? doc.paymentHistory : [],
    internalNotes: Array.isArray(doc.internalNotes) ? doc.internalNotes : [],
    generatedDocuments: Array.isArray(doc.generatedDocuments) ? doc.generatedDocuments : [],
    priceHistory: Array.isArray(doc.priceHistory) ? doc.priceHistory : [],
    deliveryChecklist: mergeDeliveryChecklistWithDefaults(rawChecklist as SaleDeliveryChecklistItem[]),
    minimumPrice: doc.minimumPrice ? Number(doc.minimumPrice) : undefined,
    workCenterId: doc.workCenterId ? String(doc.workCenterId) : undefined,
    workCenterName: doc.workCenterName ? String(doc.workCenterName) : undefined,
    closureData: doc.closureData && typeof doc.closureData === 'object' ? doc.closureData as SaleClosureData : undefined,
    deliveryData: doc.deliveryData && typeof doc.deliveryData === 'object' ? doc.deliveryData as SaleDeliveryData : undefined,
    vehicleBlocked: doc.vehicleBlocked ?? false,
    vehicleBlockReason: doc.vehicleBlockReason as SaleBlockReason | undefined,
    vehicleStatusBeforeSale: doc.vehicleStatusBeforeSale ? String(doc.vehicleStatusBeforeSale) : undefined,
    leadId: doc.leadId ? String(doc.leadId) : undefined,
    financeIncomeCreated: Boolean(doc.financeIncomeCreated),
  };
}

export function getSaleCoveredAmount(sale: SaleRecord) {
  return sale.depositPaid + sale.financingAmount;
}

export function getSalePendingAmount(sale: SaleRecord) {
  return Math.max(0, sale.totalPrice - getSaleCoveredAmount(sale));
}

export function getSaleProgress(sale: SaleRecord) {
  if (!sale.totalPrice) {
    return 0;
  }
  return Math.min(100, Math.round((getSaleCoveredAmount(sale) / sale.totalPrice) * 100));
}

export function getSaleAssociatedCosts(sale: SaleRecord, extraVehicleCosts = 0): number {
  return extraVehicleCosts + (sale.closureData?.commissionAmount || 0);
}

export function getSaleFinalMargin(sale: SaleRecord, vehicleExtraCosts = 0): number {
  const comm = sale.closureData?.commissionAmount || 0;
  return sale.totalPrice - sale.purchasePrice - vehicleExtraCosts - comm;
}

export function isSaleReadyToClose(sale: SaleRecord): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (getSalePendingAmount(sale) > 0) missing.push('Cobro incompleto');
  const hasContract = sale.generatedDocuments.some((d) => d.type === 'contract' && d.status === 'ok');
  if (!hasContract) missing.push('Contrato de compraventa');
  const hasInvoice = sale.generatedDocuments.some((d) => d.type === 'invoice' && d.status === 'ok');
  if (!hasInvoice) missing.push('Factura de venta');
  return { ready: missing.length === 0, missing };
}

export function isSaleReadyToDeliver(sale: SaleRecord): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (sale.stage !== 'sold' && sale.stage !== 'delivered') missing.push('La venta no está cerrada');
  if (getSalePendingAmount(sale) > 0) missing.push('Cobro incompleto');
  const allChecked = sale.deliveryChecklist.length > 0 && sale.deliveryChecklist.every((i) => i.checked);
  if (!allChecked) missing.push('Checklist de entrega incompleto');
  return { ready: missing.length === 0, missing };
}

/** Severidad de alerta local (UI) para listados sin depender del motor backend. */
export type SaleUiAlertLevel = 'none' | 'warning' | 'critical';

export function computeSaleUiAlertLevel(sale: SaleRecord): SaleUiAlertLevel {
  const pending = getSalePendingAmount(sale);
  const covered = getSaleCoveredAmount(sale);
  const daysSince = (iso: string) => {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return 0;
    return Math.floor((Date.now() - t) / 86_400_000);
  };

  if (['reserved', 'documentation', 'sold'].includes(sale.stage) && pending > 0) {
    if (daysSince(sale.createdAt) >= 7) return 'critical';
    return 'warning';
  }

  if (sale.stage === 'sold' && !sale.deliveredAt) {
    const ref = sale.closureData?.closedAt || sale.updatedAt;
    if (sale.expectedDelivery && new Date(sale.expectedDelivery) < new Date()) return 'critical';
    if (daysSince(ref) >= 15) return 'critical';
    if (daysSince(ref) >= 3) return 'warning';
  }

  if (['documentation', 'sold'].includes(sale.stage)) {
    const hasContract = sale.generatedDocuments.some((d) => d.type === 'contract' && d.status === 'ok');
    if (!hasContract && daysSince(sale.updatedAt) >= 3) return 'warning';
  }

  return 'none';
}
