import { getNativeLocalNetworkInfo } from './escposPlugin';
import { isVertialNativeApp } from './isNativeApp';
import { isNativeWifiPrinterReady } from './nativePrintRouting';
import { resolveEffectivePrinterConfig } from './printerActiveScope';
import { loadLegacyPrinterConfig } from './printerConfig';
import { isValidIpv4 } from './printerSetupStatus';

export type NativePrinterDiagnostics = {
  deviceIp: string;
  devicePrefix: string;
  savedHost: string;
  savedPort: number;
  sameSubnet: boolean | null;
  ready: boolean;
  onWifi: boolean;
};

const PRINTER_VERIFIED_KEY = 'vertial_printer_verified_v1';

function printerPrefix(host: string): string {
  const match = String(host || '').trim().match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  return match?.[1] || '';
}

export function readPrinterVerifiedHost(): string {
  try {
    return String(localStorage.getItem(PRINTER_VERIFIED_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function writePrinterVerifiedHost(host: string): void {
  try {
    const ip = String(host || '').trim();
    if (ip) localStorage.setItem(PRINTER_VERIFIED_KEY, ip);
    else localStorage.removeItem(PRINTER_VERIFIED_KEY);
  } catch {
    /* ignore */
  }
}

export function clearPrinterVerifiedHost(): void {
  writePrinterVerifiedHost('');
}

/** Diagnóstico síncrono (sin IP del dispositivo). */
export function readNativePrinterDiagnosticsSync(): NativePrinterDiagnostics {
  const config = resolveEffectivePrinterConfig();
  const savedHost = String(config.networkHost || '').trim();
  return {
    deviceIp: '',
    devicePrefix: '',
    savedHost,
    savedPort: Number(config.networkPort || 9100) || 9100,
    sameSubnet: null,
    ready: isNativeWifiPrinterReady(config),
    onWifi: false,
  };
}

/** Diagnóstico completo en app nativa (incluye WiFi del dispositivo). */
export async function loadNativePrinterDiagnostics(): Promise<NativePrinterDiagnostics> {
  const config = resolveEffectivePrinterConfig({
    localFallback: loadLegacyPrinterConfig(),
  });
  const savedHost = String(config.networkHost || '').trim();
  const savedPort = Number(config.networkPort || 9100) || 9100;

  if (!isVertialNativeApp()) {
    return {
      deviceIp: '',
      devicePrefix: '',
      savedHost,
      savedPort,
      sameSubnet: null,
      ready: isNativeWifiPrinterReady(config),
      onWifi: false,
    };
  }

  let deviceIp = '';
  let devicePrefix = '';
  try {
    const net = await getNativeLocalNetworkInfo();
    deviceIp = String(net?.ip || '').trim();
    devicePrefix = String(net?.prefix || '').trim();
  } catch {
    /* plugin no disponible o sin WiFi */
  }

  const hostPrefix = printerPrefix(savedHost);
  const sameSubnet = devicePrefix && isValidIpv4(savedHost)
    ? devicePrefix === hostPrefix
    : null;

  return {
    deviceIp,
    devicePrefix,
    savedHost,
    savedPort,
    sameSubnet,
    ready: isNativeWifiPrinterReady(config),
    onWifi: Boolean(devicePrefix),
  };
}
