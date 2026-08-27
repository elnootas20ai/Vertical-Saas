import { createClientRequest, searchClientsByPhoneRequest } from './crmApi';
import type { Client } from '../context/AppContext';
import { normalizeBusinessScopeId } from './deliverySetup';

export type EnsureReservationClientInput = {
  userId: string;
  businessId?: string;
  searchBusinessId?: string;
  guestName: string;
  phone?: string;
  email?: string;
  clientId?: string;
  actorName?: string;
};

/**
 * Vincula la reserva a un cliente del CRM (módulo /saas/clients).
 * Busca por teléfono o crea uno nuevo si hace falta.
 */
export async function ensureReservationCrmClient(input: EnsureReservationClientInput): Promise<string> {
  const {
    userId,
    businessId,
    searchBusinessId,
    guestName,
    phone,
    email,
    clientId,
    actorName,
  } = input;

  const linkedId = String(clientId || '').trim();
  if (linkedId) return linkedId;

  const name = guestName.trim();
  if (!name) return '';

  const phoneDigits = String(phone || '').replace(/\D/g, '');
  if (phoneDigits.length < 9) return '';

  const matches = await searchClientsByPhoneRequest(
    userId,
    phoneDigits,
    5,
    undefined,
    searchBusinessId,
  );
  if (matches.clients.length > 0) {
    const exact = matches.clients.find(
      (m) => String(m.phone || '').replace(/\D/g, '') === phoneDigits,
    );
    return (exact || matches.clients[0]).id;
  }

  const bid = normalizeBusinessScopeId(businessId || '');
  const clientPayload = {
    type: 'client' as const,
    user_id: userId,
    ...(bid ? { businessId: bid, business_id: bid } : {}),
    clientType: 'particular' as const,
    name,
    phone: phoneDigits,
    phonePrefix: '+34',
    email: String(email || '').trim(),
    status: 'active' as const,
    responsible: actorName || 'Reservas',
    tags: ['reserva'],
    notes: '',
    consents: { dataProcessing: false, commercial: false, thirdParty: false },
    stats: {
      totalOrders: 0,
      lastOrderDate: null,
      orderFrequencyDays: 0,
      favoriteAddressId: null,
      totalSpent: 0,
      createdFrom: 'vertical' as const,
    },
  } satisfies Omit<Client, 'id' | 'createdAt'>;

  const { client, duplicates } = await createClientRequest(userId, clientPayload as Client);
  if (client?.id) return client.id;
  if (duplicates.length > 0) return duplicates[0].id;
  return '';
}
