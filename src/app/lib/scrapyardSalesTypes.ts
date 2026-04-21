import { v4 as uuidv4 } from 'uuid';

// ─── Enums / Literals ────────────────────────────────────────────────────────

export type SaleChannel = 'mostrador' | 'telefono' | 'web' | 'talleres' | 'marketplace';
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'bizum' | 'financiacion' | 'contrareembolso';
export type PaymentStatus = 'pendiente' | 'parcial' | 'cobrada';
export type DeliveryType = 'recogida' | 'envio';
export type OrderStatus = 'borrador' | 'confirmada' | 'preparando' | 'lista' | 'enviada' | 'entregada' | 'cancelada';
export type ClientType = 'particular' | 'taller' | 'empresa';

// ─── Sub-types ───────────────────────────────────────────────────────────────

export interface ScrapyardSaleLine {
  id: string;
  piezaId: string;
  referencia: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  coste: number;
  descuento: number;
  subtotal: number;
}

export interface ScrapyardSalePayment {
  id: string;
  importe: number;
  metodo: PaymentMethod;
  fecha: string;
  nota: string;
}

export interface ShippingInfo {
  direccion: string;
  cp: string;
  ciudad: string;
  provincia: string;
  transportista: string;
  numSeguimiento: string;
  costeEnvio: number;
}

export interface SaleHistoryEntry {
  id: string;
  accion: string;
  fecha: string;
  usuario: string;
  detalle: string;
}

export interface SaleDocumentEntry {
  id: string;
  tipo: string;
  nombre: string;
  fecha: string;
  fileData?: string;
  mimeType?: string;
}

// ─── Main document ───────────────────────────────────────────────────────────

export interface ScrapyardSale {
  _id: string;
  _rev?: string;
  type: 'scrapyard_sale';
  id: string;
  user_id: string;
  numVenta: string;
  canal: SaleChannel;
  canalDetalle: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientTipo: ClientType;
  lineas: ScrapyardSaleLine[];
  importeTotal: number;
  descuentoGlobal: number;
  importeNeto: number;
  iva: number;
  importeConIva: number;
  formaPago: PaymentMethod;
  estadoPago: PaymentStatus;
  pagos: ScrapyardSalePayment[];
  entrega: DeliveryType;
  envio: ShippingInfo;
  estado: OrderStatus;
  reservaExpira: string;
  observaciones: string;
  responsable: string;
  garantia: string;
  documentos: SaleDocumentEntry[];
  historial: SaleHistoryEntry[];
  margen: number;
  financeIncomeCreated: boolean;
  cancelMotivo: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ─── Config maps ─────────────────────────────────────────────────────────────

export const SALE_CHANNEL_CONFIG: Record<SaleChannel, { label: string; icon: string }> = {
  mostrador: { label: 'Mostrador', icon: 'Store' },
  telefono: { label: 'Teléfono', icon: 'Phone' },
  web: { label: 'Web', icon: 'Globe' },
  talleres: { label: 'Talleres', icon: 'Wrench' },
  marketplace: { label: 'Marketplace', icon: 'ShoppingBag' },
};

export const PAYMENT_METHOD_CONFIG: Record<PaymentMethod, { label: string }> = {
  efectivo: { label: 'Efectivo' },
  tarjeta: { label: 'Tarjeta' },
  transferencia: { label: 'Transferencia' },
  bizum: { label: 'Bizum' },
  financiacion: { label: 'Financiación' },
  contrareembolso: { label: 'Contrareembolso' },
};

export const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  parcial: { label: 'Parcial', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  cobrada: { label: 'Cobrada', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
};

export const ORDER_STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; step: number }> = {
  borrador: { label: 'Borrador', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', step: 0 },
  confirmada: { label: 'Confirmada', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', step: 1 },
  preparando: { label: 'Preparando', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300', step: 2 },
  lista: { label: 'Lista', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', step: 3 },
  enviada: { label: 'Enviada', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300', step: 4 },
  entregada: { label: 'Entregada', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', step: 5 },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', step: -1 },
};

export const CLIENT_TYPE_CONFIG: Record<ClientType, { label: string }> = {
  particular: { label: 'Particular' },
  taller: { label: 'Taller' },
  empresa: { label: 'Empresa' },
};

export const ALL_CHANNELS: SaleChannel[] = ['mostrador', 'telefono', 'web', 'talleres', 'marketplace'];
export const ALL_PAYMENT_METHODS: PaymentMethod[] = ['efectivo', 'tarjeta', 'transferencia', 'bizum', 'financiacion', 'contrareembolso'];
export const ALL_ORDER_STATUSES: OrderStatus[] = ['borrador', 'confirmada', 'preparando', 'lista', 'enviada', 'entregada', 'cancelada'];
export const ALL_CLIENT_TYPES: ClientType[] = ['particular', 'taller', 'empresa'];

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface ScrapyardSaleMetrics {
  ventasHoy: number;
  ventasMes: number;
  ingresosMes: number;
  ticketMedio: number;
  porCanal: Record<SaleChannel, number>;
  porEstado: Record<OrderStatus, number>;
  margenMes: number;
  pendientesCobro: number;
}

// ─── Create payload ──────────────────────────────────────────────────────────

export interface CreateScrapyardSalePayload {
  canal: SaleChannel;
  canalDetalle?: string;
  clientId: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  clientTipo?: ClientType;
  lineas: Omit<ScrapyardSaleLine, 'id' | 'subtotal'>[];
  descuentoGlobal?: number;
  iva?: number;
  formaPago: PaymentMethod;
  importeInicial?: number;
  entrega: DeliveryType;
  envio?: Partial<ShippingInfo>;
  observaciones?: string;
  responsable: string;
  garantia?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function emptyShipping(): ShippingInfo {
  return { direccion: '', cp: '', ciudad: '', provincia: '', transportista: '', numSeguimiento: '', costeEnvio: 0 };
}

export function calcLineTotals(lineas: ScrapyardSaleLine[]): number {
  return lineas.reduce((sum, l) => sum + l.subtotal, 0);
}

export function calcMargen(lineas: ScrapyardSaleLine[]): number {
  return lineas.reduce((sum, l) => sum + (l.precioUnitario - l.coste) * l.cantidad, 0);
}

export function getNextStatusAction(status: OrderStatus, entrega: DeliveryType): { next: OrderStatus; label: string } | null {
  const map: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
    borrador: { next: 'confirmada', label: 'Confirmar venta' },
    confirmada: { next: 'preparando', label: 'Iniciar preparación' },
    preparando: { next: 'lista', label: 'Marcar como lista' },
    lista: entrega === 'envio'
      ? { next: 'enviada', label: 'Registrar envío' }
      : { next: 'entregada', label: 'Registrar entrega' },
    enviada: { next: 'entregada', label: 'Confirmar entrega' },
  };
  return map[status] || null;
}

export function normalizeScrapyardSale(value: unknown): ScrapyardSale | null {
  if (!value || typeof value !== 'object') return null;
  const doc = value as Record<string, unknown>;
  if (doc.type !== 'scrapyard_sale') return null;
  const id = String(doc.id || doc._id || '');
  if (!id) return null;

  return {
    _id: String(doc._id || id),
    _rev: doc._rev as string | undefined,
    type: 'scrapyard_sale',
    id,
    user_id: String(doc.user_id || ''),
    numVenta: String(doc.numVenta || ''),
    canal: (doc.canal as SaleChannel) || 'mostrador',
    canalDetalle: String(doc.canalDetalle || ''),
    clientId: String(doc.clientId || ''),
    clientName: String(doc.clientName || ''),
    clientPhone: String(doc.clientPhone || ''),
    clientEmail: String(doc.clientEmail || ''),
    clientTipo: (doc.clientTipo as ClientType) || 'particular',
    lineas: Array.isArray(doc.lineas) ? doc.lineas as ScrapyardSaleLine[] : [],
    importeTotal: Number(doc.importeTotal || 0),
    descuentoGlobal: Number(doc.descuentoGlobal || 0),
    importeNeto: Number(doc.importeNeto || 0),
    iva: Number(doc.iva || 21),
    importeConIva: Number(doc.importeConIva || 0),
    formaPago: (doc.formaPago as PaymentMethod) || 'efectivo',
    estadoPago: (doc.estadoPago as PaymentStatus) || 'pendiente',
    pagos: Array.isArray(doc.pagos) ? doc.pagos as ScrapyardSalePayment[] : [],
    entrega: (doc.entrega as DeliveryType) || 'recogida',
    envio: (doc.envio as ShippingInfo) || emptyShipping(),
    estado: (doc.estado as OrderStatus) || 'borrador',
    reservaExpira: String(doc.reservaExpira || ''),
    observaciones: String(doc.observaciones || ''),
    responsable: String(doc.responsable || 'Sin asignar'),
    garantia: String(doc.garantia || '3 meses'),
    documentos: Array.isArray(doc.documentos) ? doc.documentos as SaleDocumentEntry[] : [],
    historial: Array.isArray(doc.historial) ? doc.historial as SaleHistoryEntry[] : [],
    margen: Number(doc.margen || 0),
    financeIncomeCreated: Boolean(doc.financeIncomeCreated),
    cancelMotivo: String(doc.cancelMotivo || ''),
    createdAt: String(doc.createdAt || new Date().toISOString()),
    updatedAt: String(doc.updatedAt || new Date().toISOString()),
    deletedAt: (doc.deletedAt as string | null) || null,
  };
}
