import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, Smartphone } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { isWorkerAccount } from '../../../lib/authApi';
import { isVertialNativeApp } from '../../../lib/vertialPrint/isNativeApp';
import { canUseNativePushRegistration } from '../../../lib/nativePushRuntime';
import {
  readPushConsent,
  writePushConsent,
  type PushConsentDecision,
} from '../../../lib/pushPermissionConsent';

type DeviceStatus = 'loading' | 'granted' | 'denied' | 'prompt' | 'unsupported';

async function readDeviceStatus(): Promise<DeviceStatus> {
  if (isVertialNativeApp()) {
    const platform = Capacitor.getPlatform();
    if (platform !== 'ios' && platform !== 'android') return 'unsupported';
    if (platform === 'android' && !canUseNativePushRegistration()) return 'unsupported';
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

/** Bloque Ajustes: estado del dispositivo + reactivar solo si el usuario cambió de idea. Solo CEO/empresa. */
export function DevicePushStatusCard() {
  const { user } = useAuth();
  const userId = user?.user_id || null;
  const isWorker = isWorkerAccount(user);
  const [device, setDevice] = useState<DeviceStatus>('loading');
  const [consent, setConsent] = useState<PushConsentDecision>('unset');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const status = await readDeviceStatus();
    setDevice(status);
    setConsent(readPushConsent(userId).decision);
  }, [userId]);

  useEffect(() => {
    if (isWorker) return;
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener('vertial:push-consent-changed', onChange);
    return () => window.removeEventListener('vertial:push-consent-changed', onChange);
  }, [refresh, isWorker]);

  const handleEnable = async () => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      if (device === 'denied') {
        toast.message(
          isVertialNativeApp()
            ? 'Actívalas en Ajustes del iPhone → Vertial → Notificaciones'
            : 'Activa las notificaciones en la configuración del navegador',
        );
        return;
      }

      if (isVertialNativeApp()) {
        if (Capacitor.getPlatform() === 'android' && !canUseNativePushRegistration()) {
          toast.message('Push en Android requiere configurar Firebase (google-services.json) en el APK.');
          return;
        }
        try {
          const req = await PushNotifications.requestPermissions();
          if (req.receive === 'granted') {
            writePushConsent(userId, 'accepted');
            window.dispatchEvent(new CustomEvent('vertial:push-register-now'));
            toast.success('Avisos activados');
          } else {
            writePushConsent(userId, 'declined', { force: true });
            toast.message('Sin permiso del sistema');
          }
        } catch {
          toast.message('No se pudieron activar las notificaciones en este dispositivo');
        }
      } else if ('Notification' in window) {
        const result = await Notification.requestPermission();
        if (result === 'granted') {
          writePushConsent(userId, 'accepted');
          window.dispatchEvent(new CustomEvent('vertial:push-register-now'));
          toast.success('Avisos activados');
        } else {
          writePushConsent(userId, 'declined', { force: true });
          toast.message('Sin permiso del navegador');
        }
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (isWorker) return null;
  if (device === 'unsupported' || device === 'loading') return null;

  const active = device === 'granted' || consent === 'accepted';

  return (
    <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="px-5 py-4 flex items-start gap-3">
        <div
          className={`flex items-center justify-center w-10 h-10 rounded-xl border-2 shrink-0 ${
            active
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-900/40 dark:text-gray-400 dark:border-gray-700'
          }`}
        >
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            Avisos en este dispositivo
            {active ? <Bell className="w-4 h-4 text-emerald-600" /> : <BellOff className="w-4 h-4 text-gray-400" />}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {active
              ? 'Activos. Te llegan cierres de caja, fichajes y alertas importantes.'
              : device === 'denied'
                ? 'Bloqueados en el sistema. Actívalos en Ajustes del teléfono.'
                : 'Desactivados. Puedes activarlos aquí cuando quieras.'}
          </p>
          {!active ? (
            <button
              type="button"
              onClick={() => void handleEnable()}
              disabled={busy}
              className="mt-3 inline-flex items-center gap-2 min-h-[40px] px-3 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
              {device === 'denied' ? 'Cómo activarlas' : 'Activar avisos'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
