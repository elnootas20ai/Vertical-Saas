import { toast } from 'sonner';
import type { VertialPrinterConfig } from './printerConfig';
import { sendNativeEscpos } from './nativePrintClient';
import {
  NATIVE_PRINTER_PRINT_FAILED_MESSAGE,
  resolveNativePrinterForPrint,
} from './nativePrinterFlow';
import { NATIVE_WIFI_PRINTER_SETUP_MESSAGE } from './nativePrintRouting';
import { sanitizePrinterPort } from './nativePrintGuard';

/**
 * Único camino nativo con UI: valida config → ESC/POS → error con reintento.
 * Usado por tickets de pedido, documentos TPV y pruebas.
 */
export async function printNativeEscposWithUi(
  bytes: Uint8Array,
  config: VertialPrinterConfig,
  options?: {
    timeoutMs?: number;
    retry?: boolean;
    /** Si true, no muestra toast de error (el caller lo hace). */
    silentError?: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  const prepared = resolveNativePrinterForPrint({
    ...config,
    networkPort: sanitizePrinterPort(config.networkPort),
  });
  if (!prepared.ready) {
    const error = prepared.error || NATIVE_WIFI_PRINTER_SETUP_MESSAGE;
    if (!options?.silentError) {
      toast.error(error, { duration: 12000 });
    }
    return { ok: false, error };
  }

  const printConfig = prepared.config;
  const result = await sendNativeEscpos(bytes, printConfig, {
    timeoutMs: options?.timeoutMs ?? 8_000,
    retry: options?.retry,
  });

  if (result.ok) return { ok: true };

  const error = result.error || NATIVE_PRINTER_PRINT_FAILED_MESSAGE;
  if (!options?.silentError) {
    toast.error(error, {
      duration: 12000,
      action: {
        label: 'Reintentar',
        onClick: () => {
          toast.loading('Reintentando impresión…', { id: 'native-print-retry' });
          void sendNativeEscpos(bytes, printConfig, {
            retry: false,
            timeoutMs: 10_000,
          }).then((retry) => {
            toast.dismiss('native-print-retry');
            if (retry.ok) toast.success('Ticket impreso');
            else toast.error(retry.error || NATIVE_PRINTER_PRINT_FAILED_MESSAGE, { duration: 10000 });
          });
        },
      },
    });
  }
  return { ok: false, error };
}
