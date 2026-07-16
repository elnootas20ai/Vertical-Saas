import type { DiningFloorConfig } from './salaApi';

import type { SalaRoomType } from './salaStudioTypes';



const PENDING_KEY = 'vertial.sala.setupPending';



export type SalaQuickSetupRoomDraft = {

  name: string;

  roomType: SalaRoomType;

  tableCount: number;

  defaultCapacity: number;

  /** Capacidad por mesa (si difiere del defaultCapacity). */
  capacities?: number[];

};



type SalaSetupPendingPayload = {

  businessId: string;

  pdvId: string;

};



function normalizeBusinessScopeId(value: string | null | undefined): string {

  return String(value || '').replace(/^business:/, '').trim();

}



function parsePending(raw: string | null): SalaSetupPendingPayload | null {

  if (!raw) return null;

  const trimmed = raw.trim();

  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {

    try {

      const parsed = JSON.parse(trimmed) as Partial<SalaSetupPendingPayload>;

      const businessId = normalizeBusinessScopeId(parsed.businessId);

      const pdvId = String(parsed.pdvId || '').trim();

      if (businessId && pdvId) return { businessId, pdvId };

    } catch {

      return null;

    }

  }

  return null;

}



export function writeSalaSetupPending(businessId: string, pdvId: string): void {

  const payload: SalaSetupPendingPayload = {

    businessId: normalizeBusinessScopeId(businessId),

    pdvId: String(pdvId || '').trim(),

  };

  if (!payload.businessId || !payload.pdvId) return;

  try {

    sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));

  } catch {

    /* ignore */

  }

}



export function consumeSalaSetupPending(expectedBusinessId?: string): string | null {
  try {
    const pending = parsePending(sessionStorage.getItem(PENDING_KEY));
    if (!pending) return null;
    const expected = normalizeBusinessScopeId(expectedBusinessId);
    if (expected && pending.businessId !== expected) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return pending.pdvId;
  } catch {
    return null;
  }
}



export function peekSalaSetupPending(expectedBusinessId?: string): string | null {

  try {

    const pending = parsePending(sessionStorage.getItem(PENDING_KEY));

    if (!pending) return null;

    const expected = normalizeBusinessScopeId(expectedBusinessId);

    if (expected && pending.businessId !== expected) return null;

    return pending.pdvId;

  } catch {

    return null;

  }

}



export function isSalaQuickSetupComplete(config: DiningFloorConfig | null | undefined): boolean {

  return config?.salaQuickSetupComplete === true;

}



export function defaultRoomDrafts(count: number): SalaQuickSetupRoomDraft[] {

  const presets: Array<{ name: string; roomType: SalaRoomType; tableCount: number }> = [

    { name: 'Salón Principal', roomType: 'salon', tableCount: 12 },

    { name: 'Terraza', roomType: 'terraza', tableCount: 8 },

    { name: 'Terraza 2', roomType: 'terraza', tableCount: 6 },

    { name: 'Barra', roomType: 'barra', tableCount: 6 },

    { name: 'Privado', roomType: 'privado', tableCount: 4 },

    { name: 'VIP', roomType: 'vip', tableCount: 4 },

  ];

  return Array.from({ length: Math.max(1, Math.min(count, 8)) }, (_, i) => {

    const preset = presets[i] || { name: `Sala ${i + 1}`, roomType: 'salon' as SalaRoomType, tableCount: 8 };

    return {

      name: preset.name,

      roomType: preset.roomType,

      tableCount: preset.tableCount,

      defaultCapacity: 4,

    };

  });

}

