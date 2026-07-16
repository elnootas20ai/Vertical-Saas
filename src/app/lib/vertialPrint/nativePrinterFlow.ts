import { isVertialNativeApp } from './isNativeApp';
import { resolveEffectivePrinterConfig } from './printerActiveScope';
import { normalizeVertialPrinterConfig } from './printerConfigNormalize';
import { isNativeWifiPrinterReady, NATIVE_WIFI_PRINTER_SETUP_MESSAGE } from './nativePrintRouting';
import type { VertialPrinterConfig } from './printerConfig';

/** Ruta visible para el usuario (dueño vía Ajustes). */
export const IMPRESORA_SETTINGS_PATH = 'Ajustes → Empresa → Impresora';

export const NATIVE_PRINTER_NOT_CONFIGURED_MESSAGE = NATIVE_WIFI_PRINTER_SETUP_MESSAGE;

export const NATIVE_PRINTER_PERMISSION_HINT =
  'Activa «Red local» en Ajustes del iPhone/iPad → Vertial. El cliente lo hace manualmente en el sistema.';

export const NATIVE_PRINTER_PRINT_FAILED_MESSAGE =
  'No se pudo imprimir. Comprueba que la impresora está encendida, en la misma WiFi, y que «Red local» está activado en Ajustes → Vertial.';

export type NativePrinterPrepareResult = {
  ready: boolean;
  config: VertialPrinterConfig;
  error?: string;
};

/** Comprueba que hay IP configurada. El permiso de red local lo activa el cliente en Ajustes → Vertial. */
export function resolveNativePrinterForPrint(
  overrideConfig?: Partial<VertialPrinterConfig>,
): NativePrinterPrepareResult {
  const base = resolveEffectivePrinterConfig();
  const config = overrideConfig
    ? normalizeVertialPrinterConfig({ ...base, ...overrideConfig })
    : base;

  if (!isVertialNativeApp()) {
    return { ready: true, config };
  }

  if (!isNativeWifiPrinterReady(config)) {
    return {
      ready: false,
      config,
      error: NATIVE_PRINTER_NOT_CONFIGURED_MESSAGE,
    };
  }

  return { ready: true, config };
}

/** Alias async para compatibilidad con llamadas existentes (sin acciones automáticas). */
export async function prepareNativePrinterForPrint(
  overrideConfig?: Partial<VertialPrinterConfig>,
): Promise<NativePrinterPrepareResult> {
  return resolveNativePrinterForPrint(overrideConfig);
}
