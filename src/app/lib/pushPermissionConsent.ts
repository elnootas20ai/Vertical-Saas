/**
 * Consentimiento de notificaciones del sistema (1 vez por cuenta).
 *
 * - unset: aún no se pidió el permiso del SO
 * - accepted: concedió → se guarda en cuenta forever (updates no vuelven a preguntar)
 * - declined: denegó → no volver a pedir
 *
 * Caché local + sync a notificationPreferences.pushConsent en la cuenta.
 */

import {
  getNotificationPreferencesRequest,
  updateNotificationPreferencesRequest,
} from './authApi';

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

function writeLocal(
  userId: string,
  decision: Exclude<PushConsentDecision, 'unset'>,
): PushConsentRecord {
  const record: PushConsentRecord = {
    v: 1,
    decision,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(record));
  } catch {
    /* private mode */
  }
  try {
    window.dispatchEvent(
      new CustomEvent('vertial:push-consent-changed', {
        detail: { userId, decision },
      }),
    );
  } catch {
    /* ignore */
  }
  return record;
}

/**
 * Guarda decisión. Si ya hay «accepted», no baja a declined salvo force.
 * Persiste en local + cuenta (best-effort).
 */
export function writePushConsent(
  userId: string | null | undefined,
  decision: Exclude<PushConsentDecision, 'unset'>,
  options: { force?: boolean; syncRemote?: boolean } = {},
): void {
  const id = String(userId || '').trim();
  if (!id || typeof window === 'undefined') return;

  const current = readPushConsent(id);
  if (current.decision === 'accepted' && decision === 'declined' && !options.force) {
    return;
  }

  const record = writeLocal(id, decision);
  if (options.syncRemote === false) return;

  void updateNotificationPreferencesRequest({
    pushConsent: {
      decision,
      decidedAt: record.updatedAt,
      ...(options.force ? { force: true } : {}),
    },
  }).catch(() => {
    /* red: queda en local; se reintenta en hydrate */
  });
}

/** ¿Hay que pedir el permiso del sistema? Solo si aún no decidió. */
export function shouldShowPushSoftPrompt(userId: string | null | undefined): boolean {
  return readPushConsent(userId).decision === 'unset';
}

/**
 * Une local + cuenta. «accepted» gana siempre.
 * Devuelve la decisión efectiva tras sync.
 */
export async function hydratePushConsentFromAccount(
  userId: string | null | undefined,
): Promise<PushConsentDecision> {
  const id = String(userId || '').trim();
  if (!id) return 'unset';

  const local = readPushConsent(id).decision;

  try {
    const prefs = await getNotificationPreferencesRequest();
    const remote = (prefs.pushConsent?.decision || 'unset') as PushConsentDecision;

    if (local === 'accepted' || remote === 'accepted') {
      if (local !== 'accepted') writeLocal(id, 'accepted');
      if (remote !== 'accepted') {
        void updateNotificationPreferencesRequest({
          pushConsent: {
            decision: 'accepted',
            decidedAt: new Date().toISOString(),
          },
        }).catch(() => {});
      }
      return 'accepted';
    }

    if (remote === 'declined') {
      if (local !== 'declined') writeLocal(id, 'declined');
      return 'declined';
    }

    if (local === 'declined') {
      void updateNotificationPreferencesRequest({
        pushConsent: {
          decision: 'declined',
          decidedAt: new Date().toISOString(),
        },
      }).catch(() => {});
      return 'declined';
    }

    return 'unset';
  } catch {
    return local;
  }
}
