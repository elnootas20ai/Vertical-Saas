import type { DiningTable, DiningTableStatus } from './salaApi';

const TABLE_STATUS_LABELS: Record<DiningTableStatus, string> = {
  available: 'Libre',
  occupied: 'Ocupada',
  pending_order: 'Con pedido',
  served: 'Servida',
  pending_payment: 'Pendiente cobro',
  unavailable: 'No disponible',
  reserved: 'Reservada',
  hidden: 'Oculta',
};

/** Mesas que se pueden elegir al crear/asignar reserva. */
const PICKABLE_TABLE_STATUSES = new Set<DiningTableStatus>(['available', 'reserved']);

export function diningTableStatusLabel(status: string | undefined): string {
  const key = String(status || '').trim() as DiningTableStatus;
  return TABLE_STATUS_LABELS[key] || 'Desconocido';
}

export function isDiningTablePickable(status: string | undefined): boolean {
  return PICKABLE_TABLE_STATUSES.has(String(status || '').trim() as DiningTableStatus);
}

export function diningTableDisplayName(table: Pick<DiningTable, 'name' | 'number'>): string {
  const name = String(table.name || '').trim();
  if (name) {
    // No reescribir nombres ya puestos (Mesa N / Taburete N / personalizados).
    return name;
  }
  return `Mesa ${table.number}`;
}

/** Orden: zona (A-Z) → número de mesa (numérico) → nombre. */
export function sortDiningTablesForPicker(tables: DiningTable[]): DiningTable[] {
  return [...tables].sort((a, b) => {
    const zoneA = String(a.zone || 'Sin zona').trim().toLocaleLowerCase('es');
    const zoneB = String(b.zone || 'Sin zona').trim().toLocaleLowerCase('es');
    if (zoneA !== zoneB) return zoneA.localeCompare(zoneB, 'es');
    const numA = Number(a.number) || 0;
    const numB = Number(b.number) || 0;
    if (numA !== numB) return numA - numB;
    return diningTableDisplayName(a).localeCompare(diningTableDisplayName(b), 'es');
  });
}

export function groupDiningTablesByZone(tables: DiningTable[]): Array<[string, DiningTable[]]> {
  const groups = new Map<string, DiningTable[]>();
  for (const table of sortDiningTablesForPicker(tables)) {
    const zone = String(table.zone || '').trim() || 'Sin zona';
    const list = groups.get(zone) || [];
    list.push(table);
    groups.set(zone, list);
  }
  return [...groups.entries()];
}

export function formatDiningTablePickerLabel(
  table: Pick<DiningTable, 'name' | 'number' | 'capacity' | 'status'>,
): string {
  const parts = [diningTableDisplayName(table)];
  if (Number(table.capacity) > 0) parts.push(`${table.capacity} pers.`);
  parts.push(diningTableStatusLabel(table.status));
  return parts.join(' · ');
}
