/**
 * Aviso profesional de notificaciones (1 vez).
 * - Activar → pide permiso al sistema una sola vez
 * - Ahora no → no vuelve a preguntar
 * Si ya está concedido/denegado a nivel OS, no molesta.
 */
import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { toast } from 'sonner';
import { isVertialNativeApp } from '../../lib/vertialPrint/isNativeApp';
import {
  readPushConsent,
  shouldShowPushSoftPrompt,
  writePushConsent,
} from '../../lib/pushPermissionConsent';

const SHOW_DELAY_MS = 1600;

async function systemReceiveStatus(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  if (isVertialNativeApp()) {
    const platform = Capacitor.getPlatform();
    if (platform !== 'ios' && platform !== 'android') return 'unsupported';
    try {
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'granted') return 'granted';
      if (perm.receive === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'unsupported';
    }
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

async function requestSystemPermission(): Promise<'granted' | 'denied'> {
  if (isVertialNativeApp()) {
    const req = await PushNotifications.requestPermissions();
    return req.receive === 'granted' ? 'granted' : 'denied';
  }
  if (!('Notification' in window)) return 'denied';
  const result = await Notification.requestPermission();
  return result === 'granted' ? 'granted' : 'denied';
}

function triggerPushRegister(): void {
  try {
    window.dispatchEvent(new CustomEvent('vertial:push-register-now'));
  } catch {
    /* ignore */
  }
}

export function PushPermissionGate({ userId }: { userId: string | null }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const reevaluate = useCallback(async () => {
    if (!userId) {
      setVisible(false);
      return;
    }

    const status = await systemReceiveStatus();
    if (status === 'unsupported') {
      setVisible(false);
      return;
    }

    // Ya concedido a nivel sistema → registrar y no preguntar nunca.
    if (status === 'granted') {
      if (readPushConsent(userId).decision !== 'accepted') {
        writePushConsent(userId, 'accepted');
      }
      triggerPushRegister();
      setVisible(false);
      return;
    }

    // Sistema ya denegó (p. ej. builds viejas) → no insistir con el popup OS.
    if (status === 'denied') {
      if (readPushConsent(userId).decision === 'unset') {
        writePushConsent(userId, 'declined');
      }
      setVisible(false);
      return;
    }

    // Aún puede pedir el OS → solo si el usuario no ha decidido en Vertial.
    setVisible(shouldShowPushSoftPrompt(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setVisible(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void reevaluate().then(() => {
        if (cancelled) return;
      });
    }, SHOW_DELAY_MS);

    const onConsent = () => {
      void reevaluate();
    };
    window.addEventListener('vertial:push-consent-changed', onConsent);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('vertial:push-consent-changed', onConsent);
    };
  }, [userId, reevaluate]);

  const handleEnable = async () => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      const result = await requestSystemPermission();
      if (result === 'granted') {
        writePushConsent(userId, 'accepted');
        triggerPushRegister();
        toast.success('Avisos activados en este dispositivo');
      } else {
        writePushConsent(userId, 'declined');
        toast.message(
          isVertialNativeApp()
            ? 'Sin avisos. Si cambias de idea: Ajustes del iPhone → Vertial → Notificaciones.'
            : 'Sin avisos. Puedes activarlos más tarde en el navegador o en Ajustes.',
        );
      }
      setVisible(false);
    } catch {
      writePushConsent(userId, 'declined');
      setVisible(false);
      toast.error('No se pudo activar las notificaciones');
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = () => {
    if (!userId || busy) return;
    writePushConsent(userId, 'declined');
    setVisible(false);
    toast.message('De acuerdo. No te volveremos a preguntar.');
  };

  if (!visible || !userId) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center p-4 pointer-events-none">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] pointer-events-auto" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-perm-title"
        className="relative pointer-events-auto w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden"
      >
        <button
          type="button"
          onClick={handleDecline}
          disabled={busy}
          className="absolute top-3 right-3 p-2 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
          aria-label="No, gracias"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3 pr-8">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shrink-0">
              <Bell className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2
                id="push-perm-title"
                className="text-lg font-bold text-zinc-900 dark:text-zinc-50 leading-snug"
              >
                Avisos en el móvil
              </h2>
              <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                Te avisamos si cierran caja, alguien ficha o hay un descuadre — aunque no tengas
                Vertial abierto.
              </p>
            </div>
          </div>

          <ul className="mt-4 space-y-1.5 text-[13px] text-zinc-600 dark:text-zinc-300">
            <li className="flex gap-2">
              <span className="text-emerald-600 font-bold">·</span>
              Cierre de caja y descuadres
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-600 font-bold">·</span>
              Fichajes del equipo
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-600 font-bold">·</span>
              Solo lo importante; sin ruido
            </li>
          </ul>

          <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleDecline}
              disabled={busy}
              className="flex-1 min-h-[48px] rounded-xl border-2 border-zinc-200 dark:border-zinc-600 text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <BellOff className="w-4 h-4" />
              Ahora no
            </button>
            <button
              type="button"
              onClick={() => void handleEnable()}
              disabled={busy}
              className="flex-1 min-h-[48px] rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-bold hover:bg-black dark:hover:bg-white disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <Bell className="w-4 h-4" />
              {busy ? 'Activando…' : 'Activar avisos'}
            </button>
          </div>

          <p className="mt-3 text-[11px] text-zinc-400 text-center leading-snug">
            Solo te lo pedimos una vez. Si dices que no, no insistimos.
          </p>
        </div>
      </div>
    </div>
  );
}
