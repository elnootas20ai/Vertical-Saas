import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Printer, Radar } from 'lucide-react';
import type { PointOfSale } from '../../lib/deliveryApi';
import {
  discoverNativeNetworkPrinters,
  fetchBridgeHealth,
  fetchBridgeNetworkPrinters,
  isVertialNativeApp,
  loadLegacyPrinterConfig,
  printTestTicket,
  resolveEffectivePrinterConfig,
  savePrinterConfig,
  type VertialPrinterConfig,
} from '../../lib/vertialPrint';
import { savePrinterConfigToPdv, type PrinterConfigTarget } from '../../lib/vertialPrint/printerPdvSync';
import { normalizeVertialPrinterConfig } from '../../lib/vertialPrint/printerConfigNormalize';
import { settingsPrimaryBtnClass, settingsListCardClass } from './settings/settingsFormStyles';

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
 * Pantalla única de impresora: buscar en la WiFi, elegir y probar. Sin más opciones.
 * En la app iOS/Android busca directamente; en navegador usa Vertial Print si está en el PC.
 */
export function TpvPrinterSetupPanel({ scope }: { scope?: TpvPrinterScope }) {
  const [pdv, setPdv] = useState<PointOfSale | null | undefined>(scope?.pdv);
  const [config, setConfig] = useState<VertialPrinterConfig>(() => initialConfig(scope));
  const [found, setFound] = useState<FoundPrinter[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
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
    setFound([]);

    try {
      if (isNative) {
        const result = await discoverNativeNetworkPrinters({});
        const printers = (result.printers || []).map((p) => ({ host: p.host, port: p.port || 9100 }));
        if (printers.length === 0) {
          setScanMessage(result.error || 'No se encontró ninguna impresora. Comprueba que está encendida y en la misma WiFi, y que Vertial tiene «Red local» activado en Ajustes del iPhone/iPad.');
          return;
        }
        setFound(printers);
        if (printers.length === 1) selectPrinter(printers[0].host, printers[0].port);
      } else {
        const health = await fetchBridgeHealth(2500, config);
        if (!health.ok) {
          setScanMessage('Para buscar desde el navegador necesitas Vertial Print abierto en un PC de la misma red. Desde la app del móvil o tablet la búsqueda es directa.');
          return;
        }
        const result = await fetchBridgeNetworkPrinters(config, { port: 9100 });
        const printers = (result.ok ? result.printers : []).map((p) => ({ host: p.host, port: p.port || 9100 }));
        if (printers.length === 0) {
          setScanMessage(result.ok ? 'No se encontró ninguna impresora en la WiFi. Comprueba que está encendida.' : result.error || 'No se pudo buscar impresoras.');
          return;
        }
        setFound(printers);
        if (printers.length === 1) selectPrinter(printers[0].host, printers[0].port);
      }
    } catch (error) {
      setScanMessage(error instanceof Error ? error.message : 'No se pudo buscar impresoras.');
    } finally {
      scanRef.current = false;
      setScanning(false);
    }
  }, [config, isNative, selectPrinter]);

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

  const body = (
    <div className="space-y-4">
      {selectedHost ? (
        <div className={`${settingsListCardClass()} flex items-center gap-3`}>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
            <Printer className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Impresora conectada</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{selectedHost}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
            {testing ? 'Imprimiendo…' : 'Probar'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Enciende la impresora, conéctala a la WiFi del local y pulsa buscar.
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleSearch()}
        disabled={scanning}
        className={`${settingsPrimaryBtnClass} w-full`}
      >
        {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4" />}
        {scanning ? 'Buscando impresora WiFi…' : 'Buscar impresora WiFi'}
      </button>

      {found.length > 1 && (
        <div className="grid gap-2">
          {found.map((item) => {
            const selected = selectedHost === item.host;
            return (
              <button
                key={`${item.host}:${item.port}`}
                type="button"
                onClick={() => selectPrinter(item.host, item.port)}
                className={`${settingsListCardClass()} flex items-center gap-3 text-left w-full ${selected ? 'ring-2 ring-emerald-500' : ''}`}
              >
                <Printer className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{item.host}</span>
                {selected && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      {!scanning && scanMessage && (
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">{scanMessage}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-5 max-w-2xl">
      <header className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <Printer className="w-5 h-5 text-gray-700 dark:text-gray-300" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Impresora</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {scope?.storeLabel ? `Se guarda en ${scope.storeLabel}.` : 'Impresora de tickets del TPV.'}
          </p>
        </div>
      </header>
      {body}
    </div>
  );
}
