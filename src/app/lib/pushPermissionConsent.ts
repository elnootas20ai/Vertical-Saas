/**
 * Consentimiento de push — una decisión profesional, sin spamear.
 *
 * - unset: aún no eligió → se muestra el aviso in-app
 * - accepted: activó avisos → no volver a preguntar
 * - declined: dijo que no (o el sistema denegó) → no volver a preguntar
 */

export type PushConsentDecision = 'unset' | 'accepted' | 'declined';

export type PushConsentRecord = {
  v: 1;
  decision: PushConsentDecision;
  updatedAt: string;
};

const STORAGE_PREFIX = 'vertial.pushConsent.v1.';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${String(userId || '').trim()}`;
}

export function readPushConsent(userId: string | null | undefined): PushConsentRecord {
  const id = String(userId || '').trim();
  if (!id || typeof window === 'undefined') {
    return { v: 1, decision: 'unset', updatedAt: '' };
  }
  try {
    const raw = window.localStorage.getItem(storageKey(id));
    if (!raw) return { v: 1, decision: 'unset', updatedAt: '' };
    const parsed = JSON.parse(raw) as PushConsentRecord;
    if (!parsed || parsed.v !== 1) return { v: 1, decision: 'unset', updatedAt: '' };
    if (parsed.decision !== 'accepted' && parsed.decision !== 'declined') {
      return { v: 1, decision: 'unset', updatedAt: '' };
    }
    return {
      v: 1,
      decision: parsed.decision,
      updatedAt: String(parsed.updatedAt || ''),
    };
  } catch {
    return { v: 1, decision: 'unset', updatedAt: '' };
  }
}

export function writePushConsent(
  userId: string | null | undefined,
  decision: Exclude<PushConsentDecision, 'unset'>,
): void {
  const id = String(userId || '').trim();
  if (!id || typeof window === 'undefined') return;
  const record: PushConsentRecord = {
    v: 1,
    decision,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(storageKey(id), JSON.stringify(record));
  } catch {
    /* private mode */
  }
  try {
    window.dispatchEvent(
      new CustomEvent('vertial:push-consent-changed', { detail: { userId: id, decision } }),
    );
  } catch {
    /* ignore */
  }
}

/** ¿Hay que mostrar el aviso in-app? Solo si aún no decidió. */
export function shouldShowPushSoftPrompt(userId: string | null | undefined): boolean {
  return readPushConsent(userId).decision === 'unset';
}
