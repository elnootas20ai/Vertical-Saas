import { v4 as uuidv4 } from 'uuid';
import type { VentaListItem, SaleStatus } from '../components/saas/compraventa/ventas/ventasListData';
import type {
  EntregaChecklistKey,
  EntregaListItem,
  EntregaStatus,
} from '../components/saas/compraventa/entregas/entregasListData';
import { ENTREGA_CHECKLIST_ITEMS } from '../components/saas/compraventa/entregas/entregasListData';
import { listSalesRecords, updateSaleInCouch } from './salesApi';
import {
  mergeDeliveryChecklistWithDefaults,
  type SaleDeliveryChecklistItem,
  type SaleRecord,
  type SaleStage,
} from './salesTypes';
import { syncVehicleWithSale } from './vehicleSaleSync';

export interface SaleResponsibleRef {
  responsible?: string;
  responsibleId?: string;
}

export function isWorkerAccount(user: {
  accountType?: string;
  invitedBy?: string;
} | null | undefined): boolean {
  return Boolean(user && (user.accountType === 'user' || user.invitedBy));
}

export function matchesSaleResponsible(
  sale: SaleResponsibleRef,
  userId: string,
  fullName: string,
): boolean {
  const responsibleId = String(sale.responsibleId || '').trim().toLowerCase();
  if (responsibleId && responsibleId === userId.toLowerCase()) return true;
  const value = String(sale.responsible || '').trim().toLowerCase();
  if (!value) return true;
  return value === userId.toLowerCase() || value === fullName.trim().toLowerCase();
}

export function filterSalesForWorker<T extends SaleResponsibleRef>(
  sales: T[],
  userId: string,
  fullName: string,
): T[] {
  return sales.filter((sale) => matchesSaleResponsible(sale, userId, fullName));
}

const SALE_CHECKLIST_TO_ENTREGA: Record<string, EntregaChecklistKey> = {
  docs: 'documentationReady',
  keys: 'keysDelivered',
  warranty: 'warrantyDelivered',
  condition: 'vehicleInspected',
  clean: 'cleaningDone',
  fuel: 'fuelDeposit',
  accessories: 'accessoriesIncluded',
  contract: 'clientSignature',
};

const ENTREGA_TO_SALE_CHECKLIST: Record<EntregaChecklistKey, string> = {
  documentationReady: 'docs',
  keysDelivered: 'keys',
  warrantyDelivered: 'warranty',
  vehicleInspected: 'condition',
  cleaningDone: 'clean',
  fuelDeposit: 'fuel',
  accessoriesIncluded: 'accessories',
  clientSignature: 'contract',
};

export function mapSaleStageToVentaStatus(stage: SaleStage): SaleStatus {
  if (stage === 'delivered') return 'entregada';
  if (stage === 'sold' || stage === 'documentation') return 'confirmada';
  return 'reserva';
}

export function vehicleExpensesTotal(
  associatedCosts?: { amount?: number }[],
): number {
  if (!Array.isArray(associatedCosts)) return 0;
  return associatedCosts.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}

export function mapSaleToVenta(
  sale: SaleRecord,
  vehicleExpenses = 0,
): VentaListItem {
  const vehicleLabel = [sale.vehicleName, sale.vehiclePlate ? `· ${sale.vehiclePlate}` : '']
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    id: sale.id,
    vehicleLabel: vehicleLabel || 'Vehículo sin identificar',
    status: mapSaleStageToVentaStatus(sale.stage),
    clientName: sale.clientName || '',
    saleDate: sale.createdAt?.slice(0, 10) || '',
    salePrice: sale.totalPrice || 0,
    sellerName: sale.responsible,
    purchasePrice: sale.purchasePrice,
    expenses: vehicleExpenses,
    reservationAmount: sale.depositPaid || 0,
    financing: (sale.financingAmount || 0) > 0,
    paymentMethod: sale.paymentMethod,
    expectedDeliveryDate: sale.expectedDelivery || sale.deliveryData?.scheduledDate,
  };
}

export function saleChecklistToEntregaMap(
  checklist: SaleDeliveryChecklistItem[] | undefined,
): Partial<Record<EntregaChecklistKey, boolean>> {
  const merged = mergeDeliveryChecklistWithDefaults(checklist || []);
  const out: Partial<Record<EntregaChecklistKey, boolean>> = {};
  for (const item of merged) {
    const key = SALE_CHECKLIST_TO_ENTREGA[item.id];
    if (key) out[key] = item.checked;
  }
  return out;
}

export function deriveEntregaStatus(
  sale: SaleRecord,
  checklist: Partial<Record<EntregaChecklistKey, boolean>>,
): EntregaStatus {
  if (sale.stage === 'delivered') return 'entregada';
  const total = ENTREGA_CHECKLIST_ITEMS.length;
  const done = ENTREGA_CHECKLIST_ITEMS.filter(({ id }) => checklist[id]).length;
  if (done >= total) return 'lista';
  if (done > 0) return 'preparando';
  return 'pendiente';
}

export function isSaleEligibleForEntrega(sale: SaleRecord): boolean {
  return sale.stage === 'sold' || sale.stage === 'documentation';
}

export function mapSaleToEntrega(sale: SaleRecord): EntregaListItem {
  const checklist = saleChecklistToEntregaMap(sale.deliveryChecklist);
  const vehicleLabel = [sale.vehicleName, sale.vehiclePlate ? `· ${sale.vehiclePlate}` : '']
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    id: sale.id,
    vehicleLabel: vehicleLabel || 'Vehículo sin identificar',
    clientName: sale.clientName || '',
    expectedDate: sale.expectedDelivery || sale.deliveryData?.scheduledDate || sale.createdAt?.slice(0, 10) || '',
    status: deriveEntregaStatus(sale, checklist),
    salesPerson: sale.responsible,
    observations: sale.deliveryData?.deliveryNotes || sale.notes || '',
    checklist,
  };
}

function patchEntregaChecklistOnSale(
  sale: SaleRecord,
  key: EntregaChecklistKey,
  checked: boolean,
): SaleRecord {
  const saleItemId = ENTREGA_TO_SALE_CHECKLIST[key];
  const merged = mergeDeliveryChecklistWithDefaults(sale.deliveryChecklist || []);
  const deliveryChecklist = merged.map((item) =>
    item.id === saleItemId ? { ...item, checked } : item,
  );
  return { ...sale, deliveryChecklist, updatedAt: new Date().toISOString() };
}

export async function toggleEntregaChecklistItem(
  userId: string,
  sale: SaleRecord,
  key: EntregaChecklistKey,
  checked: boolean,
): Promise<SaleRecord> {
  const patched = patchEntregaChecklistOnSale(sale, key, checked);
  return updateSaleInCouch(userId, patched);
}

export async function updateSaleStage(
  userId: string,
  sale: SaleRecord,
  nextStage: SaleStage,
  note?: string,
): Promise<SaleRecord> {
  const now = new Date().toISOString();
  const updated: SaleRecord = {
    ...sale,
    stage: nextStage,
    updatedAt: now,
    deliveredAt: nextStage === 'delivered' ? now : sale.deliveredAt,
    deliveryChecklist: mergeDeliveryChecklistWithDefaults(sale.deliveryChecklist || []),
    ...(nextStage === 'sold' || nextStage === 'delivered'
      ? { vehicleBlocked: true, vehicleBlockReason: nextStage === 'sold' ? 'sold' : 'pending_delivery' as const }
      : {}),
    stageHistory: [
      ...(sale.stageHistory || []),
      {
        id: uuidv4(),
        type: 'stage',
        title: `Fase: ${nextStage}`,
        description: note || '',
        date: now,
        user: sale.responsible || 'Equipo comercial',
      },
    ],
  };

  const saved = await updateSaleInCouch(userId, updated);
  await syncVehicleWithSale(userId, saved).catch(() => undefined);
  return saved;
}

export async function markSaleDelivered(userId: string, sale: SaleRecord): Promise<SaleRecord> {
  const now = new Date().toISOString();
  const checklist = mergeDeliveryChecklistWithDefaults(sale.deliveryChecklist || []).map((item) => ({
    ...item,
    checked: true,
  }));

  const updated: SaleRecord = {
    ...sale,
    stage: 'delivered',
    updatedAt: now,
    deliveredAt: now,
    deliveryChecklist: checklist,
    deliveryData: {
      ...(sale.deliveryData || {
        scheduledDate: sale.expectedDelivery || now.slice(0, 10),
        deliveredBy: sale.responsible || '',
        receivedBy: sale.clientName || '',
        deliveryLocation: '',
        deliveryNotes: '',
      }),
      actualDate: now,
      deliveredBy: sale.deliveryData?.deliveredBy || sale.responsible || '',
      receivedBy: sale.deliveryData?.receivedBy || sale.clientName || '',
    },
    stageHistory: [
      ...(sale.stageHistory || []),
      {
        id: uuidv4(),
        type: 'stage',
        title: 'Vehículo entregado',
        description: 'Entrega confirmada desde módulo Entregas',
        date: now,
        user: sale.responsible || 'Equipo comercial',
      },
    ],
  };

  const saved = await updateSaleInCouch(userId, updated);
  await syncVehicleWithSale(userId, saved).catch(() => undefined);
  return saved;
}

export async function loadCompraventaSales(userId: string): Promise<SaleRecord[]> {
  return listSalesRecords(userId);
}
