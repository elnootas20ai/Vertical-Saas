import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Printer, Radar, Smartphone } from 'lucide-react';
import type { PointOfSale } from '../../lib/deliveryApi';
import {
  discoverNativeNetworkPrinters,
  isVertialNativeApp,
  loadLegacyPrinterConfig,
  printTestTicket,
  resolveEffectivePrinterConfig,
  savePrinterConfig,
  type VertialPrinterConfig,
} from '../../lib/vertialPrint';
import { withNativeCallTimeout } from '../../lib/vertialPrint/nativeCallTimeout';
import { savePrinterConfigToPdv, type PrinterConfigTarget } from '../../lib/vertialPrint/printerPdvSync';
import { normalizeVertialPrinterConfig } from '../../lib/vertialPrint/printerConfigNormalize';

export interface TpvPrinterScope {
  userId: string;
  pdvId: string;
  pdv?: PointOfSale | null;
  terminalId?: string;
  storeLabel?: string;
  terminalLabel?: string;
  onPdvUpdated?: (pdv: PointOfSale) => void;
}

interface FoundPrinter {
  host: string;
  port: number;
}

function initialConfig(scope?: TpvPrinterScope): VertialPrinterConfig {
  const raw = scope?.pdv
    ? resolveEffectivePrinterConfig({
        pdv: scope.pdv,
        terminalId: scope.terminalId,
        localFallback: loadLegacyPrinterConfig(),
      })
    : loadLegacyPrinterConfig();
  return normalizeVertialPrinterConfig({ ...raw, connectionType: 'network' });
}

/**
 * Pantalla única de impresora, pensada para la app de tablet/móvil:
 * un botón de buscar en la WiFi, elegir y probar. Sin más opciones.
 */
export function TpvPrinterSetupPanel({ scope }: { scope?: TpvPrinterScope }) {
  const [pdv, setPdv] = useState<PointOfSale | null | undefined>(scope?.pdv);
  const [config, setConfig] = useState<VertialPrinterConfig>(() => initialConfig(scope));
  const [found, setFound] = useState<FoundPrinter[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{ checked: number; total: number } | null>(null);
  const [testing, setTesting] = useState(false);
  const scanRef = useRef(false);

  const isNative = isVertialNativeApp();
  const selectedHost = String(config.networkHost || '').trim();

  useEffect(() => {
    setPdv(scope?.pdv);
    setConfig(initialConfig(scope));
  }, [scope?.pdv?._id, scope?.pdv?._rev, scope?.pdvId, scope?.terminalId]);

  const persist = useCallback(async (next: VertialPrinterConfig) => {
    savePrinterConfig(next);
    if (!scope?.userId || !pdv?._id) return;
    try {
      const target: PrinterConfigTarget = 'store';
      const saved = await savePrinterConfigToPdv(scope.userId, pdv, next, target);
      setPdv(saved);
      scope.onPdvUpdated?.(saved);
    } catch {
      toast.error('No se pudo guardar en la tienda. La impresora queda guardada en este dispositivo.', { duration: 8000 });
    }
  }, [pdv, scope]);

  const selectPrinter = useCallback((host: string, port: number) => {
    const next = normalizeVertialPrinterConfig({
      ...config,
      connectionType: 'network',
      networkHost: host,
      networkPort: port || 9100,
    });
    setConfig(next);
    void persist(next);
    toast.success(`Impresora guardada: ${host}`);
  }, [config, persist]);

  const handleSearch = useCallback(async () => {
    if (scanRef.current) return;
    scanRef.current = true;
    setScanning(true);
    setScanMessage(null);
    setScanProgress(null);
    setFound([]);

    try {
      // Tope duro: la búsqueda nunca puede dejar el botón girando indefinidamente.
      const result = await withNativeCallTimeout(
        discoverNativeNetworkPrinters({
          subnetHintHost: selectedHost || undefined,
          onProgress: (checked, total) => setScanProgress({ checked, total }),
        }),
        60_000,
        'Búsqueda de impresoras',
      );
      const printers = (result.printers || []).map((p) => ({ host: p.host, port: p.port || 9100 }));
      if (printers.length === 0) {
        setScanMessage(result.error || 'No se encontró ninguna impresora. Comprueba que está encendida y en la misma WiFi, y que Vertial tiene «Red local» activado en Ajustes del iPhone/iPad.');
        return;
      }
      setFound(printers);
      if (printers.length === 1) selectPrinter(printers[0].host, printers[0].port);
    } catch (error) {
      setScanMessage(error instanceof Error ? error.message : 'No se pudo buscar impresoras.');
    } finally {
      scanRef.current = false;
      setScanning(false);
      setScanProgress(null);
    }
  }, [selectPrinter, selectedHost]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    try {
      await printTestTicket();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo imprimir la prueba', { duration: 8000 });
    } finally {
      setTesting(false);
    }
  }, []);

  return (
    <div className="space-y-5 max-w-xl mx-auto">
      <header className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
          <Printer className="w-6 h-6 text-gray-700 dark:text-gray-300" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Impresora</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {scope?.storeLabel ? `Se guarda en ${scope.storeLabel}.` : 'Impresora de tickets del TPV.'}
          </p>
        </div>
      </header>

      {!isNative ? (
        <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 flex items-start gap-3">
          <Smartphone className="w-6 h-6 text-gray-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Configura la impresora desde la tablet o el móvil
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              Abre la app Vertial en la tablet o el móvil del local, entra en Ajustes → Empresa → Impresora y pulsa «Buscar impresora WiFi». La impresora quedará guardada para toda la tienda.
            </p>
            {selectedHost && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                Impresora guardada actualmente: {selectedHost}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {selectedHost ? (
            <div className="rounded-2xl border-2 border-emerald-200 dark:border-emerald-900 bg-white dark:bg-gray-800 p-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                <Printer className="w-6 h-6 text-emerald-700 dark:text-emerald-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Impresora conectada</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{selectedHost}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleTest()}
                disabled={testing}
                className="shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[48px] px-4 rounded-xl text-sm font-semibold border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 touch-manipulation active:bg-gray-100 dark:active:bg-gray-700 disabled:opacity-50"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                {testing ? 'Imprimiendo…' : 'Probar'}
              </button>
            </div>
          ) : (
            <p className="text-base text-gray-500 dark:text-gray-400 leading-relaxed">
              Enciende la impresora, conéctala a la WiFi del local y pulsa buscar.
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={scanning}
            className="w-full inline-flex items-center justify-center gap-2 min-h-[56px] rounded-2xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-base font-bold touch-manipulation active:opacity-80 disabled:opacity-60"
          >
            {scanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Radar className="w-5 h-5" />}
            {scanning ? 'Buscando impresora WiFi…' : 'Buscar impresora WiFi'}
          </button>

          {scanning && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              {scanProgress
                ? `Comprobando la red… ${scanProgress.checked} de ${scanProgress.total}`
                : 'Buscando en la WiFi del local… puede tardar hasta un minuto.'}
            </p>
          )}

          {found.length > 1 && (
            <div className="grid gap-2">
              {found.map((item) => {
                const selected = selectedHost === item.host;
                return (
                  <button
                    key={`${item.host}:${item.port}`}
                    type="button"
                    onClick={() => selectPrinter(item.host, item.port)}
                    className={`w-full min-h-[56px] rounded-2xl border-2 bg-white dark:bg-gray-800 px-4 flex items-center gap-3 text-left touch-manipulation active:bg-gray-50 dark:active:bg-gray-700 ${selected ? 'border-emerald-500' : 'border-gray-200 dark:border-gray-700'}`}
                  >
                    <Printer className="w-5 h-5 text-gray-500 shrink-0" />
                    <span className="flex-1 text-base font-semibold text-gray-900 dark:text-gray-100">{item.host}</span>
                    {selected && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {!scanning && scanMessage && (
            <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">{scanMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
