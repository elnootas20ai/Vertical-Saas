import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { LocalNetworkPermissionModal } from '../saas/LocalNetworkPermissionModal';
import {
  completeLocalNetworkPermissionFlow,
  hasAcknowledgedLocalNetworkPermission,
  openNativeAppSettings,
} from '../../lib/vertialPrint/localNetworkPermission';
import { hasSeenNativeOnboarding } from '../../lib/nativeOnboardingStorage';

const NATIVE_ONBOARDING_SEEN_EVENT = 'vertial-native-onboarding-seen';

/**
 * Popup global en la app nativa: pide permiso de red local al entrar
 * (después del onboarding), antes de que el usuario abra Impresoras en el TPV.
 */
export function NativeLocalNetworkGate() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const maybeOpen = () => {
      if (!hasSeenNativeOnboarding()) return;
      if (hasAcknowledgedLocalNetworkPermission()) return;
      setOpen(true);
    };

    const timer = window.setTimeout(maybeOpen, 900);
    window.addEventListener(NATIVE_ONBOARDING_SEEN_EVENT, maybeOpen);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(NATIVE_ONBOARDING_SEEN_EVENT, maybeOpen);
    };
  }, []);

  const handleContinue = useCallback(async () => {
    setBusy(true);
    try {
      const result = await completeLocalNetworkPermissionFlow();
      setOpen(false);
      if (!result.onWifi) {
        toast.message('Conecta el dispositivo a la WiFi del local para buscar impresoras.', { duration: 9000 });
      } else {
        toast.success('Permiso solicitado. Cuando configures la impresora, Vertial la buscará sola.', { duration: 7000 });
      }
    } catch {
      toast.error('No se pudo pedir el permiso. Abre Ajustes → Vertial → Red local.', { duration: 9000 });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleOpenSettings = useCallback(async () => {
    const opened = await openNativeAppSettings();
    if (!opened) {
      toast.message('Ajustes → Privacidad → Red local → Vertial → activar.', { duration: 10000 });
    }
  }, []);

  return (
    <LocalNetworkPermissionModal
      open={open}
      busy={busy}
      blocking
      onContinue={() => void handleContinue()}
      onOpenSettings={() => void handleOpenSettings()}
    />
  );
}
