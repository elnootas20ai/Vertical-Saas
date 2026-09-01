/**
 * PDV temporal + código TPV por evento.
 * Al crear el evento: centro temporal → PDV → código tablet → almacén → carga de carta.
 * No importa eventsFlow (evita ciclo): parse local + update vía vertical API.
 */
import {
  ensureDeliveryPdvForWorkCenter,
  ensureTabletCodesForPointsOfSale,
  listCatalogItemsRequest,
  type CatalogItem,
  type PointOfSale,
} from './deliveryApi';
import { notifyDeliveryWorkCentersChanged, resolveBusinessScopeId } from './deliverySetup';
import {
  createWorkCenter,
  getWorkCenterById,
  listSalesPoints,
  updateWorkCenter,
  type WorkCenter,
} from './workCentersApi';
import {
  createWarehouseRequest,
  listWarehousesRequest,
  type Warehouse,
} from './warehouseApi';
import { createAdjustmentRequest } from './stockMovementApi';
import { storeWarehouseDisplayName } from './warehouseStockQty';
import { createVerticalApi } from './verticalApiFactory';
import type { EventRecord } from './eventsTypes';

const eventsApi = createVerticalApi<EventRecord>('events', 'events');

export type EventTpvLoadLine = {
  catalogItemId: string;
  name: string;
  qty: number;
};

export type EventPortableTpvBusiness = {
  business_id?: string;
  id?: string;
  name?: string;
  members?: { user_id?: string }[];
} | null;

function truncName(raw: string, max = 48): string {
  const s = String(raw || '').trim() || 'Evento';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function parseJsonArray(raw: unknown): Record<string, unknown>[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => row && typeof row === 'object') as Record<string, unknown>[];
  } catch {
    return [];
  }
}

/** Productos Carta del presupuesto + extras de ruta (cantidades sumadas). */
export function aggregateEventTpvLoad(event: EventRecord): EventTpvLoadLine[] {
  const byId = new Map<string, EventTpvLoadLine>();

  const add = (catalogItemId: string, name: string, qty: number) => {
    const id = String(catalogItemId || '').trim();
    const q = Math.max(0, Math.floor(Number(qty) || 0));
    if (!id || q <= 0) return;
    const prev = byId.get(id);
    if (prev) {
      prev.qty += q;
      return;
    }
    byId.set(id, {
      catalogItemId: id,
      name: String(name || '').trim() || id,
      qty: q,
    });
  };

  for (const line of parseJsonArray(event.lineasPresupuesto)) {
    const cid = String(line.catalogItemId || '').trim();
    if (!cid) continue;
    add(cid, String(line.concepto || ''), Number(line.cantidad) || 0);
  }

  for (const row of parseJsonArray(event.routeExtraStock)) {
    const cid = String(row.catalogItemId || '').trim();
    if (!cid) continue;
    add(cid, String(row.name || ''), Number(row.qty) || 0);
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function eventTpvCatalogAllowlist(event: EventRecord | null | undefined): string[] | null {
  if (!event) return null;
  const load = aggregateEventTpvLoad(event);
  if (load.length === 0) return [];
  return load.map((l) => l.catalogItemId);
}

function findWarehouseForSalesPoint(warehouses: Warehouse[], salesPointId: string): Warehouse | null {
  const pdvId = String(salesPointId || '').trim();
  if (!pdvId) return null;
  return (
    warehouses.find(
      (w) => w.active !== false && String(w.salesPointId || '').trim() === pdvId,
    ) || null
  );
}

async function ensureWarehouseForPdv(
  userId: string,
  pdv: PointOfSale,
): Promise<Warehouse> {
  const list = await listWarehousesRequest(userId).catch(() => [] as Warehouse[]);
  const linked = findWarehouseForSalesPoint(list, pdv._id);
  if (linked) return linked;
  const name = storeWarehouseDisplayName(pdv.name || pdv.code || 'Evento');
  return createWarehouseRequest(userId, {
    name,
    salesPointId: pdv._id,
    warehouseType: 'store',
    isDefault: false,
    active: true,
  });
}

function parseSeededQty(raw: unknown): Record<string, number> {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const id = String(k || '').trim();
      const q = Math.max(0, Math.floor(Number(v) || 0));
      if (id && q > 0) out[id] = q;
    }
    return out;
  } catch {
    return {};
  }
}

async function syncWarehouseToLoad(
  userId: string,
  warehouseId: string,
  warehouseName: string,
  load: EventTpvLoadLine[],
  eventId: string,
  seeded: Record<string, number>,
): Promise<Record<string, number>> {
  if (!warehouseId) return seeded;
  const nextSeeded = { ...seeded };
  if (load.length === 0) return nextSeeded;

  const catalog = await listCatalogItemsRequest(userId, 'catalog').catch(() => [] as CatalogItem[]);
  const byId = new Map(catalog.map((c) => [c._id, c]));

  for (const line of load) {
    const item = byId.get(line.catalogItemId);
    if (!item) continue;
    const already = Math.max(0, Math.floor(Number(nextSeeded[line.catalogItemId]) || 0));
    const delta = line.qty - already;
    if (delta <= 0) {
      nextSeeded[line.catalogItemId] = Math.max(already, line.qty);
      continue;
    }
    try {
      await createAdjustmentRequest(userId, {
        catalogItemId: line.catalogItemId,
        quantity: delta,
        type: 'in',
        warehouseId,
        notes: `Carga TPV evento ${eventId} → ${warehouseName}`,
      });
      nextSeeded[line.catalogItemId] = already + delta;
    } catch {
      /* no bloquear el alta del evento por un ajuste puntual */
    }
  }
  return nextSeeded;
}

/**
 * Crea (o reutiliza) el PDV temporal del evento, genera código TPV y sincroniza stock.
 * Idempotente: si ya hay portablePdvId, solo refresca código y carga.
 */
export async function ensureEventPortableTpv(
  userId: string,
  event: EventRecord,
  business: EventPortableTpvBusiness,
): Promise<EventRecord> {
  const uid = String(userId || '').trim();
  if (!uid || !event?._id) return event;

  const businessId = resolveBusinessScopeId(business);
  let workCenterId = String(event.portableWorkCenterId || '').trim();
  let pdvId = String(event.portablePdvId || '').trim();
  let terminalCode = String(event.portableTerminalCode || '').trim().toUpperCase();
  let warehouseId = String(event.portableWarehouseId || '').trim();

  let wc: WorkCenter | null = workCenterId ? await getWorkCenterById(workCenterId) : null;
  if (wc && wc.deletedAt) wc = null;

  // Reutilizar PDV ya ligado a este evento (evita duplicados por carrera / reintentos).
  if (!wc) {
    try {
      const all = await listSalesPoints(uid);
      const hit = all.find(
        (row) =>
          !row.deletedAt
          && String(row.linkedEventId || '').trim() === event._id
          && row.eventsPdvKind === 'temporary',
      );
      if (hit) {
        wc = hit;
        workCenterId = hit._id;
      }
    } catch {
      /* crear abajo */
    }
  }

  if (!wc) {
    const address = String(event.lugar || '').trim();
    const safeAddr = address.length >= 5 ? address : `Evento · ${event.nombre || event._id}`;
    wc = await createWorkCenter(uid, {
      name: truncName(`Evento · ${event.nombre || 'Sin nombre'}`),
      centerType: 'punto_de_venta',
      ownership: 'propiedad',
      active: true,
      address: safeAddr,
      city: '',
      postalCode: '',
      expectedStaffCount: 1,
      businessId: businessId || undefined,
      eventsPdvKind: 'temporary',
      linkedEventId: event._id,
    });
    workCenterId = wc._id;
  } else if (String(wc.linkedEventId || '').trim() !== event._id) {
    wc = await updateWorkCenter({ ...wc, linkedEventId: event._id, eventsPdvKind: 'temporary' });
  }

  let pdv = await ensureDeliveryPdvForWorkCenter(uid, wc, {
    business: business as { members?: { user_id?: string }[]; business_id?: string; id?: string } | null,
    pdvName: wc.name,
  });
  if (!pdv) {
    throw new Error('No se pudo crear el PDV temporal del evento');
  }
  const [withTablet] = await ensureTabletCodesForPointsOfSale(uid, [pdv]);
  pdv = withTablet ?? pdv;
  pdvId = pdv._id;
  terminalCode = String(pdv.terminalCode || '').trim().toUpperCase();
  if (!terminalCode) {
    throw new Error('PDV temporal creado, pero sin código TPV');
  }

  const warehouse = await ensureWarehouseForPdv(uid, pdv);
  warehouseId = warehouse._id;

  const load = aggregateEventTpvLoad(event);
  const seeded = parseSeededQty(event.portableTpvSeededQty);
  const nextSeeded = await syncWarehouseToLoad(
    uid,
    warehouseId,
    warehouse.name || wc.name,
    load,
    event._id,
    seeded,
  );

  notifyDeliveryWorkCentersChanged(businessId);

  const patch = {
    portableWorkCenterId: workCenterId,
    portablePdvId: pdvId,
    portableTerminalCode: terminalCode,
    portableWarehouseId: warehouseId,
    portableTpvSeededQty: JSON.stringify(nextSeeded),
    ...(!event.portableTpvAt && terminalCode
      ? { portableTpvAt: new Date().toISOString() }
      : {}),
  };

  if (
    event.portableWorkCenterId === patch.portableWorkCenterId &&
    event.portablePdvId === patch.portablePdvId &&
    event.portableTerminalCode === patch.portableTerminalCode &&
    event.portableWarehouseId === patch.portableWarehouseId &&
    String(event.portableTpvSeededQty || '') === patch.portableTpvSeededQty
  ) {
    return { ...event, ...patch };
  }

  const updated = await eventsApi.update(uid, event._id, { ...event, ...patch });
  return { ...event, ...updated, ...patch };
}

/** Tras cambiar presupuesto o carga de ruta: reajusta stock del almacén del evento. */
export async function syncEventPortableTpvStock(
  userId: string,
  event: EventRecord,
): Promise<EventRecord> {
  const uid = String(userId || '').trim();
  const warehouseId = String(event.portableWarehouseId || '').trim();
  const pdvId = String(event.portablePdvId || '').trim();
  if (!uid || !warehouseId || !pdvId) return event;

  const warehouses = await listWarehousesRequest(uid).catch(() => [] as Warehouse[]);
  const wh = warehouses.find((w) => w._id === warehouseId);
  const load = aggregateEventTpvLoad(event);
  const seeded = parseSeededQty(event.portableTpvSeededQty);
  const nextSeeded = await syncWarehouseToLoad(
    uid,
    warehouseId,
    wh?.name || event.nombre || 'Evento',
    load,
    event._id,
    seeded,
  );
  const serialized = JSON.stringify(nextSeeded);
  if (String(event.portableTpvSeededQty || '') === serialized) return event;
  const updated = await eventsApi.update(uid, event._id, {
    ...event,
    portableTpvSeededQty: serialized,
  });
  return { ...event, ...updated, portableTpvSeededQty: serialized };
}

export function filterCatalogByEventAllowlist(
  items: CatalogItem[],
  allowlist: string[] | null | undefined,
): CatalogItem[] {
  if (allowlist == null) return items;
  if (allowlist.length === 0) return [];
  const set = new Set(allowlist.map((id) => String(id).trim()).filter(Boolean));
  return items.filter((item) => set.has(String(item._id || '').trim()));
}
