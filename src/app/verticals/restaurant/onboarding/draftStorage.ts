import type { OnboardingDraft } from './types';

const KEY_PREFIX = 'vertial.restaurant.onboardingDraft:v1:';

function normalizeBusinessId(value: string | null | undefined): string {
  return String(value || '').replace(/^business:/, '').trim();
}

function storageKey(businessId: string): string {
  return `${KEY_PREFIX}${normalizeBusinessId(businessId)}`;
}

export function loadOnboardingDraft(businessId: string): OnboardingDraft | null {
  const bid = normalizeBusinessId(businessId);
  if (!bid || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(bid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingDraft;
    if (!parsed || !Array.isArray(parsed.spaces)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveOnboardingDraft(businessId: string, draft: OnboardingDraft): void {
  const bid = normalizeBusinessId(businessId);
  if (!bid || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      storageKey(bid),
      JSON.stringify({ ...draft, updatedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function clearOnboardingDraft(businessId: string): void {
  const bid = normalizeBusinessId(businessId);
  if (!bid || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(bid));
  } catch {
    /* ignore */
  }
}
