import { isPlanAddonId, type PlanAddonId } from './planAddonCatalog';

export type BillingSelectionPayload = {
  selectedPlanId?: string;
  billingMode?: 'monthly' | 'annual';
  requestedAddon?: PlanAddonId | null;
};

export function billingSelectionStorageKey(userId: string): string {
  return `billing_selection_${userId}`;
}

export function readBillingSelection(userId: string): BillingSelectionPayload | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(billingSelectionStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BillingSelectionPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      selectedPlanId: parsed.selectedPlanId,
      billingMode: parsed.billingMode === 'annual' ? 'annual' : parsed.billingMode === 'monthly' ? 'monthly' : undefined,
      requestedAddon: isPlanAddonId(parsed.requestedAddon) ? parsed.requestedAddon : null,
    };
  } catch {
    return null;
  }
}

export function writeBillingSelection(userId: string, payload: BillingSelectionPayload): void {
  if (!userId) return;
  try {
    const current = readBillingSelection(userId) || {};
    const next: BillingSelectionPayload = {
      ...current,
      ...payload,
    };
    if (payload.requestedAddon === null) {
      delete next.requestedAddon;
    }
    localStorage.setItem(billingSelectionStorageKey(userId), JSON.stringify(next));
  } catch {
    // Storage may be unavailable.
  }
}

export function clearBillingSelectionAddon(userId: string): void {
  writeBillingSelection(userId, { requestedAddon: null });
}
