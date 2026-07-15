import { fetchBridgeHealth, fetchBridgePingPrinter } from './printBridgeClient';
import { isVertialNativeApp } from './isNativeApp';
import { pingNativePrinter } from './nativePrintClient';
import { checkEposConnection, shouldUseEposPrint } from './eposPrintClient';
import type { VertialPrinterConfig, VertialPrinterConnectionType } from './printerConfig';

export type PrinterSetupKind = 'wifi' | 'pc' | 'browser';

export function setupKindToConnection(kind: PrinterSetupKind): VertialPrinterConnectionType {
  if (kind === 'wifi') return 'network';
  if (kind === 'pc') return 'system';
  return 'browser';
}

export function connectionToSetupKind(type: VertialPrinterConnectionType): PrinterSetupKind {
  if (type === 'network') return 'wifi';
  if (type === 'system') return 'pc';
  return 'browser';
}

export function isAppleMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** iPad/iPhone en navegador que necesita IP del PC (no aplica en dev con proxy /local-print). */
export function isAppleMobileWebBrowser(): boolean {
  if (!isAppleMobileDevice()) return false;
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return false;
  return true;
}

export function isValidIpv4(value: string): boolean {
  const parts = String(value || '').trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    const n = Number(part);
    return Number.isInteger(n) && n >= 0 && n <= 255 && String(n) === part.trim();
  });
}

export type PrinterStatusTone = 'ok' | 'warn' | 'idle';

export interface PrinterStatusSnapshot {
  tone: PrinterStatusTone;
  label: string;
  detail: string;
  bridgeOk: boolean;
  configured: boolean;
}

export async function evaluatePrinterStatus(config: VertialPrinterConfig): Promise<PrinterStatusSnapshot> {
  const kind = connectionToSetupKind(config.connectionType);

  if (kind === 'browser') {
    return {
      tone: 'idle',
      label: 'Ventana del dispositivo',
      detail: 'Al imprimir se abrirá la pantalla de tu tablet o PC.',
      bridgeOk: false,
      configured: true,
    };
  }

  if (kind === 'wifi' && !isValidIpv4(config.networkHost)) {
    return {
      tone: 'warn',
      label: 'Falta el número de la impresora',
      detail: isVertialNativeApp()
        ? 'Pulsa «Buscar impresoras» y elige la tuya en la lista.'
        : 'Pon la IP de la impresora Epson (ej. 192.168.1.200). Sale en el ticket de configuración.',
      bridgeOk: false,
      configured: false,
    };
  }

  if (kind === 'wifi' && isVertialNativeApp()) {
    const printerOk = (await pingNativePrinter(config)).ok;
    if (!printerOk) {
      return {
        tone: 'warn',
        label: 'Impresora no responde',
        detail: `Comprueba que la impresora está encendida y en la misma WiFi (${config.networkHost}).`,
        bridgeOk: true,
        configured: true,
      };
    }
    return {
      tone: 'ok',
      label: 'Impresora WiFi lista',
      detail: `Conectada a ${config.networkHost}`,
      bridgeOk: true,
      configured: true,
    };
  }

  if (kind === 'wifi' && shouldUseEposPrint(config) && String(config.bridgeHost || '').trim()) {
    const bridgeOk = (await fetchBridgeHealth(1400, config)).ok;
    if (bridgeOk) {
      return {
        tone: 'ok',
        label: 'Impresora vía PC del mostrador',
        detail: `Vertial Print en ${config.bridgeHost} → Epson ${config.networkHost}`,
        bridgeOk: true,
        configured: true,
      };
    }
  }

  if (kind === 'wifi' && shouldUseEposPrint(config)) {
    const eposOk = (await checkEposConnection(config)).ok;
    if (!eposOk) {
      return {
        tone: 'warn',
        label: 'Autoriza la impresora en el iPad',
        detail: `En EpsonNet Config activa ePOS-Print y ePOS-Device (Enable → Send). Luego https://${config.networkHost}:8043 (certificado) y «Probar impresión».`,
        bridgeOk: true,
        configured: true,
      };
    }
    return {
      tone: 'ok',
      label: 'Impresora WiFi lista',
      detail: `Epson conectada · ${config.networkHost} (Safari/iPad)`,
      bridgeOk: true,
      configured: true,
    };
  }

  if (kind === 'pc' && isVertialNativeApp()) {
    return {
      tone: 'warn',
      label: 'Impresora en PC del mostrador',
      detail: 'En el móvil elige «Impresora por WiFi» (Epson en la misma WiFi) o «Sin térmica».',
      bridgeOk: false,
      configured: false,
    };
  }

  if (kind === 'pc' && !String(config.systemPrinterName || '').trim()) {
    return {
      tone: 'warn',
      label: 'Elige la impresora del PC',
      detail: 'Selecciona la impresora instalada en el ordenador del mostrador.',
      bridgeOk: false,
      configured: false,
    };
  }

  if (isVertialNativeApp()) {
    return {
      tone: 'warn',
      label: 'Configura impresora WiFi',
      detail: 'Pulsa «Buscar impresoras» para escanear la WiFi del local.',
      bridgeOk: false,
      configured: false,
    };
  }

  const bridgeOk = (await fetchBridgeHealth(1400, config)).ok;
  if (!bridgeOk) {
    const onIpad = isAppleMobileWebBrowser();
    return {
      tone: 'warn',
      label: onIpad ? 'Conecta el PC del mostrador' : 'Activa Vertial Print',
      detail: onIpad
        ? 'En el navegador del iPad hace falta un PC con Vertial Print en la misma WiFi. Para imprimir directo, usa la app Vertial.'
        : 'Descarga e inicia Vertial Print en este PC (VertialPrint.exe).',
      bridgeOk: false,
      configured: true,
    };
  }

  if (kind === 'wifi') {
    const host = String(config.networkHost || '').trim();
    const ping = await fetchBridgePingPrinter(host, config, {
      port: config.networkPort || 9100,
      timeoutMs: 1800,
    });
    if (!ping.ok) {
      return {
        tone: 'warn',
        label: 'Impresora no responde',
        detail: ping.error || `Comprueba que la Epson está encendida (${host}).`,
        bridgeOk: true,
        configured: true,
      };
    }
    return {
      tone: 'ok',
      label: 'Impresora WiFi lista',
      detail: `Conectada a ${config.networkHost}`,
      bridgeOk: true,
      configured: true,
    };
  }

  return {
    tone: 'ok',
    label: 'Impresora del PC lista',
    detail: String(config.systemPrinterName || '').trim(),
    bridgeOk: true,
    configured: true,
  };
}
