/**
 * Borra mesas/zonas del mapa de sala de UNA empresa restaurant y deja el asistente listo.
 */

import {
  deleteDiningTableRequest,
  getFloorConfigRequest,
  listDiningTablesRequest,
  saveFloorConfigRequest,
} from '../../lib/salaApi';

function normalizeBusinessId(value: string | null | undefined): string {
  return String(value || '').replace(/^business:/, '').trim();
}

export async function wipeRestaurantSalaSetup(
  userId: string,
  businessId: string,
): Promise<{ deletedTables: number }> {
  const uid = String(userId || '').trim();
  const bid = normalizeBusinessId(businessId);
  if (!uid || !bid) return { deletedTables: 0 };

  const tables = await listDiningTablesRequest(uid).catch(() => []);
  let deletedTables = 0;
  for (const table of tables) {
    const tableBiz = normalizeBusinessId(
      (table as { businessId?: string }).businessId || '',
    );
    // Solo mesas de esta empresa; si no tienen businessId (legacy), también se limpian
    // al resetear un restaurante nuevo (cuentas de 1 negocio).
    if (tableBiz && tableBiz !== bid) continue;
    const id = String(table._id || '').trim();
    if (!id || id.startsWith('temp_')) continue;
    await deleteDiningTableRequest(uid, id).catch(() => undefined);
    deletedTables += 1;
  }

  const floor = await getFloorConfigRequest(uid).catch(() => null);
  if (floor) {
    const floorBiz = normalizeBusinessId(floor.businessId);
    if (!floorBiz || floorBiz === bid) {
      await saveFloorConfigRequest(uid, {
        ...floor,
        businessId: bid,
        rooms: [],
        zones: [],
        layoutDecor: [],
        salaQuickSetupComplete: false,
      }).catch(() => undefined);
    }
  }

  return { deletedTables };
}
