import { createVerticalApi } from './verticalApiFactory';
import {
  isActiveWaitlistStatus,
  partySizeNumber,
  type RestaurantWaitlistEntry,
  type WaitlistFormData,
  type WaitlistStatus,
} from './restaurantWaitlistTypes';

const api = createVerticalApi<RestaurantWaitlistEntry>('restaurant', 'waitlist');

export function listWaitlist(userId: string) {
  return api.list(userId);
}

export function listWaitlistForBusiness(userId: string, businessId: string) {
  return listWaitlist(userId).then((items) =>
    items.filter((item) => {
      const bid = String(item.businessId || '').trim();
      if (!businessId) return true;
      // Legacy sin businessId: visible solo si es la única empresa / sin filtro estricto
      if (!bid) return true;
      return bid === businessId;
    }),
  );
}

export async function createWaitlistEntry(
  userId: string,
  businessId: string,
  form: WaitlistFormData,
  clientId = '',
): Promise<RestaurantWaitlistEntry> {
  const guestName = String(form.guestName || '').trim();
  if (!guestName) throw new Error('Indica el nombre');

  return api.create(userId, {
    guestName,
    partySize: String(partySizeNumber(form.partySize)),
    phone: String(form.phone || '').trim(),
    estimatedWait: String(form.estimatedWait || '').trim(),
    notes: String(form.notes || '').trim(),
    zone: String(form.zone || '').trim(),
    clientId: String(clientId || '').trim(),
    businessId: String(businessId || '').trim(),
    status: 'waiting',
  } as Partial<RestaurantWaitlistEntry>);
}

export function updateWaitlistStatus(
  userId: string,
  entryId: string,
  status: WaitlistStatus,
) {
  return api.update(userId, entryId, { status } as Partial<RestaurantWaitlistEntry>);
}

export function updateWaitlistEntry(
  userId: string,
  entryId: string,
  data: Partial<RestaurantWaitlistEntry>,
) {
  return api.update(userId, entryId, data);
}

export function removeWaitlistEntry(userId: string, entryId: string) {
  return api.remove(userId, entryId);
}

export function countWaiting(entries: RestaurantWaitlistEntry[]): {
  parties: number;
  guests: number;
} {
  const active = entries.filter((e) => isActiveWaitlistStatus(e.status));
  return {
    parties: active.length,
    guests: active.reduce((sum, e) => sum + partySizeNumber(e.partySize), 0),
  };
}

/** Cola FIFO: más antiguos primero. */
export function sortWaitlistQueue(entries: RestaurantWaitlistEntry[]): RestaurantWaitlistEntry[] {
  return [...entries].sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
  );
}
