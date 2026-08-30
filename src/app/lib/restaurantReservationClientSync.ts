import {
  createClientRequest,
  notifyCrmClientsSync,
  searchClientsByPhoneRequest,
  updateClientRequest,
} from './crmApi';
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

/** Normaliza móvil ES: 34612… / 0034612… → 612… (9 dígitos). */
export function normalizeReservationPhoneDigits(raw: string | null | undefined): string {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('34') && /^[67]\d{8}$/.test(digits.slice(2))) {
    return digits.slice(2);
  }
  if (digits.length === 12 && digits.startsWith('34') && /^[67]\d{8}$/.test(digits.slice(2))) {
    return digits.slice(2);
  }
  return digits;
}

function phonesMatch(a: string, b: string): boolean {
  const x = normalizeReservationPhoneDigits(a);
  const y = normalizeReservationPhoneDigits(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const ax = x.length > 9 ? x.slice(-9) : x;
  const ay = y.length > 9 ? y.slice(-9) : y;
  return ax.length >= 7 && ax === ay;
}

/**
 * Vincula la reserva a un cliente del CRM (módulo /saas/clients).
 * Alta manual (nombre + teléfono): crea ficha nueva o reutiliza la del mismo móvil.
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

  const phoneDigits = normalizeReservationPhoneDigits(phone);
  // Misma barra que el aviso de UI (móvil ES). Sin teléfono no hay ficha CRM.
  if (phoneDigits.length < 9) return '';

  const bid = normalizeBusinessScopeId(businessId || searchBusinessId || '');
  const scopeForSearch = bid || searchBusinessId;

  const matches = await searchClientsByPhoneRequest(
    userId,
    phoneDigits,
    8,
    undefined,
    scopeForSearch,
    { includeLegacy: true, fallbackAll: true },
  );

  const exact =
    matches.clients.find((m) => phonesMatch(m.phone || '', phoneDigits))
    || matches.clients[0];

  if (exact?.id) {
    const nextName = name;
    const nextEmail = String(email || '').trim();
    const needsName = nextName && nextName !== String(exact.name || exact.fullName || '').trim();
    const needsEmail = nextEmail && !String(exact.email || '').trim();
    if (needsName || needsEmail) {
      try {
        await updateClientRequest(userId, {
          ...exact,
          name: needsName ? nextName : exact.name,
          email: needsEmail ? nextEmail : exact.email,
        });
        notifyCrmClientsSync();
      } catch {
        /* vincular igual aunque falle el retitle */
      }
    }
    return exact.id;
  }

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
  notifyCrmClientsSync();

  if (client?.id) return client.id;
  if (duplicates.length > 0) return duplicates[0].id;
  throw new Error('No se pudo crear el cliente en el CRM');
}
