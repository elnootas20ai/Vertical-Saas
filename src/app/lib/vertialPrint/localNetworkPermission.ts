import { isVertialNativeApp } from './isNativeApp';

const LAN_PERMISSION_ACK_KEY = 'vertial_lan_permission_ack_v1';

export const LAN_PERMISSION_ATTEMPTED_EVENT = 'vertial-lan-permission-attempted';
export const LAN_PERMISSION_MODAL_EVENT = 'vertial-show-lan-permission-modal';

export function hasAcknowledgedLocalNetworkPermission(): boolean {
  try {
    return localStorage.getItem(LAN_PERMISSION_ACK_KEY) === '1';
  } catch {
    return false;
  }
}

export function acknowledgeLocalNetworkPermission(): void {
  try {
    localStorage.setItem(LAN_PERMISSION_ACK_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function resetLocalNetworkPermissionAck(): void {
  try {
    localStorage.removeItem(LAN_PERMISSION_ACK_KEY);
  } catch {
    /* ignore */
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Notifica a la app que el usuario completó el flujo de permiso (p. ej. auto-búsqueda). */
export function dispatchLocalNetworkPermissionAttempted(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LAN_PERMISSION_ATTEMPTED_EVENT));
}

/** Abre el modal de permiso en el panel de impresora (solo al tocar impresoras). */
export function dispatchNativeLocalNetworkPermissionPrompt(): void {
  if (typeof window === 'undefined') return;
  resetLocalNetworkPermissionAck();
  window.dispatchEvent(new CustomEvent(LAN_PERMISSION_MODAL_EVENT));
}

/**
 * Dispara el aviso de «red local» de iOS/Android.
 * Apple solo muestra el popup cuando la app intenta acceder a la LAN.
 */
export async function requestNativeLocalNetworkAccess(): Promise<void> {
  if (!isVertialNativeApp()) return;

  let mod: typeof import('esc-pos-proxy-capacitor-plugin');
  try {
    mod = await import('esc-pos-proxy-capacitor-plugin');
  } catch {
    throw new Error('Plugin de impresión nativo no disponible');
  }

  try {
    await Promise.race([
      mod.ESCPOSProxy.discover({ ports: [9100, 9101, 9102], timeout: 3500 }),
      wait(4000),
    ]);
  } catch {
    /* El aviso del sistema puede haber salido aunque falle el discover */
  }

  const probeHosts = ['192.168.1.1', '192.168.0.1', '10.0.0.1'];
  for (const ip of probeHosts) {
    try {
      await Promise.race([
        mod.ESCPOSProxy.ping({ ip, port: 9100 }),
        wait(700),
      ]);
    } catch {
      /* ping de activación del permiso iOS */
    }
  }

  await wait(500);
}

/** Reinicia el flujo de permiso y vuelve a disparar el aviso de iOS. */
export async function rerequestNativeLocalNetworkPermission(): Promise<void> {
  resetLocalNetworkPermissionAck();
  await requestNativeLocalNetworkAccess();
  dispatchLocalNetworkPermissionAttempted();
}

/** Abre la ficha de Vertial en Ajustes del dispositivo (donde está «Red local»). */
export async function openNativeAppSettings(): Promise<boolean> {
  if (!isVertialNativeApp()) return false;
  try {
    const { Capacitor } = await import('@capacitor/core');
    const platform = Capacitor.getPlatform();
    if (platform === 'ios') {
      window.location.href = 'app-settings:';
      return true;
    }
    if (platform === 'android') {
      window.location.href = 'app-settings:';
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Flujo completo: explicar → pedir permiso al sistema → marcar como intentado.
 * Llamar cuando el usuario pulsa «Continuar» en el modal.
 */
export async function completeLocalNetworkPermissionFlow(): Promise<void> {
  await requestNativeLocalNetworkAccess();
  acknowledgeLocalNetworkPermission();
  dispatchLocalNetworkPermissionAttempted();
}
