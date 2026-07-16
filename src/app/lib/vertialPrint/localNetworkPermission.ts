import { isVertialNativeApp } from './isNativeApp';
import { getEscposPlugin, getNativeLocalNetworkInfo, type NativeLocalNetworkInfo } from './escposPlugin';
import { COMMON_LAN_PREFIXES } from './nativePrintClient';
import { withNativeCallTimeout } from './nativeCallTimeout';

const LAN_PERMISSION_ACK_KEY = 'vertial_lan_permission_ack_v2';
const LAN_USER_COMPLETED_KEY = 'vertial_lan_user_completed_v1';

export const LAN_PERMISSION_ATTEMPTED_EVENT = 'vertial-lan-permission-attempted';
export const LAN_PERMISSION_MODAL_EVENT = 'vertial-show-lan-permission-modal';

/** El usuario pulsó «Continuar» en el modal (no implica que iOS concedió red local). */
export function hasUserCompletedLanPermissionFlow(): boolean {
  try {
    return localStorage.getItem(LAN_USER_COMPLETED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markLanPermissionFlowCompleted(): void {
  try {
    localStorage.setItem(LAN_USER_COMPLETED_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function resetLanPermissionFlowCompleted(): void {
  try {
    localStorage.removeItem(LAN_USER_COMPLETED_KEY);
  } catch {
    /* ignore */
  }
}

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
    localStorage.removeItem(LAN_USER_COMPLETED_KEY);
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

/** Hosts TCP para forzar el aviso de «red local» de iOS (prioriza la WiFi del dispositivo). */
export function buildLanProbeHosts(info?: NativeLocalNetworkInfo | null): string[] {
  const hosts = new Set<string>();
  const prefix = String(info?.prefix || '').trim();
  if (prefix) {
    hosts.add(`${prefix}.1`);
    hosts.add(`${prefix}.254`);
    hosts.add(`${prefix}.100`);
  }
  for (const common of COMMON_LAN_PREFIXES) {
    hosts.add(`${common}.1`);
  }
  hosts.add('10.0.0.1');
  return Array.from(hosts);
}

/**
 * Dispara el aviso de «red local» de iOS/Android.
 * Apple solo muestra el popup (y el toggle en Ajustes → Vertial) cuando la app
 * intenta acceder a la LAN (Bonjour + TCP a IPs privadas).
 */
export async function requestNativeLocalNetworkAccess(options?: {
  /** IP de la impresora: prioriza un ping real para forzar el permiso. */
  printerIp?: string;
}): Promise<void> {
  if (!isVertialNativeApp()) return;

  const printerIp = String(options?.printerIp || '').trim();

  const activate = async () => {
    // Primero: Bonjour nativo propio (fuerza el popup / toggle «Red local» en iPad).
    try {
      const { registerPlugin } = await import('@capacitor/core');
      const VertialIosBridge = registerPlugin<{
        requestLocalNetworkAccess: () => Promise<{ triggered?: boolean }>;
      }>('VertialIosBridge');
      await Promise.race([VertialIosBridge.requestLocalNetworkAccess(), wait(4000)]);
    } catch {
      /* seguir con escpos */
    }

    const plugin = await getEscposPlugin();
    const networkInfo = await getNativeLocalNetworkInfo();

    try {
      await Promise.race([
        plugin.discover({ ports: [9100], timeout: 2500 }),
        wait(3000),
      ]);
    } catch {
      /* El aviso del sistema puede haber salido aunque falle el discover */
    }

    await wait(250);

    const probeHosts = new Set<string>();
    if (isValidLanIpv4(printerIp)) {
      probeHosts.add(printerIp);
    }
    for (const ip of buildLanProbeHosts(networkInfo).slice(0, 4)) {
      probeHosts.add(ip);
    }

    await Promise.all(
      Array.from(probeHosts).slice(0, 5).map((ip) =>
        Promise.race([
          plugin.ping({ ip, port: 9100 }).catch(() => undefined),
          wait(600),
        ]),
      ),
    );
  };

  try {
    await withNativeCallTimeout(activate(), 12000, 'Activación permiso red local');
  } catch {
    /* Cortamos si tarda demasiado; el usuario puede seguir con IP manual */
  }
}

function isValidLanIpv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    const n = Number(part);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

/** Reinicia el flujo de permiso y vuelve a disparar el aviso de iOS. */
export async function rerequestNativeLocalNetworkPermission(): Promise<void> {
  resetLocalNetworkPermissionAck();
  await requestNativeLocalNetworkAccess();
  markLanPermissionFlowCompleted();
  dispatchLocalNetworkPermissionAttempted();
}

/** Abre la ficha de Vertial en Ajustes del dispositivo (donde está «Red local»). */
export async function openNativeAppSettings(): Promise<boolean> {
  if (!isVertialNativeApp()) return false;
  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core');
    const platform = Capacitor.getPlatform();
    if (platform !== 'ios' && platform !== 'android') return false;

    // 1) Plugin propio: UIApplication.openSettingsURLString en hilo principal (iPad).
    try {
      const VertialIosBridge = registerPlugin<{
        openAppSettings: () => Promise<{ opened?: boolean }>;
      }>('VertialIosBridge');
      const result = await VertialIosBridge.openAppSettings();
      if (result?.opened !== false) return true;
    } catch {
      /* siguiente fallback */
    }

    // 2) capacitor-native-settings
    try {
      const { NativeSettings, AndroidSettings, IOSSettings } = await import(
        'capacitor-native-settings'
      );
      const result = await NativeSettings.open({
        optionAndroid: AndroidSettings.ApplicationDetails,
        optionIOS: IOSSettings.App,
      });
      if ((result as { success?: boolean; status?: boolean })?.success !== false) return true;
    } catch {
      /* siguiente fallback */
    }

    // 3) Último recurso (en iPad a menudo solo muestra banner).
    const { App } = await import('@capacitor/app');
    const opened = await App.openUrl({ url: 'app-settings:' });
    return Boolean(opened?.completed);
  } catch {
    /* ignore */
  }
  return false;
}

export type LocalNetworkPermissionFlowResult = {
  /** El usuario completó el flujo (Continuar). */
  acknowledged: boolean;
  /** Hay WiFi local detectada en el dispositivo. */
  onWifi: boolean;
  wifiIp: string;
  wifiPrefix: string;
};

/**
 * Flujo completo: explicar → pedir permiso al sistema → marcar como intentado.
 * Llamar cuando el usuario pulsa «Continuar» en el modal.
 */
export async function completeLocalNetworkPermissionFlow(): Promise<LocalNetworkPermissionFlowResult> {
  await requestNativeLocalNetworkAccess();
  markLanPermissionFlowCompleted();
  const networkInfo = await withNativeCallTimeout(getNativeLocalNetworkInfo(), 3000, 'Lectura WiFi').catch(
    () => null,
  );
  if (networkInfo?.prefix) {
    acknowledgeLocalNetworkPermission();
  }
  return {
    acknowledged: true,
    onWifi: Boolean(networkInfo?.prefix),
    wifiIp: networkInfo?.ip || '',
    wifiPrefix: networkInfo?.prefix || '',
  };
}

/** Mensaje de ayuda cuando la búsqueda no encuentra impresoras. */
export function buildPrinterDiscoveryHelpMessage(options?: {
  onWifi?: boolean;
  wifiPrefix?: string;
}): string {
  if (options?.onWifi === false) {
    return 'Conecta el iPhone o iPad a la WiFi del local (no uses solo datos móviles) e inténtalo de nuevo.';
  }
  const prefixHint = options?.wifiPrefix ? ` (${options.wifiPrefix}.x)` : '';
  return `No se encontró ninguna impresora en la WiFi${prefixHint}. Comprueba que la impresora térmica está encendida, en la misma red, y que Vertial tiene «Red local» activado en Ajustes → Vertial. Si la conoces, pon la IP manualmente.`;
}
