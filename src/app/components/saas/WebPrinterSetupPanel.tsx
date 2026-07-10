import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Printer,
  Receipt,
  Radar,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  Store,
} from 'lucide-react';
import {
  fetchBridgeHealth,
  fetchBridgeNetworkPrinters,
  fetchBridgePrinters,
  printTestTicket,
  savePrinterConfig,
  type VertialPrinterConfig,
} from '../../lib/vertialPrint';
import { normalizeVertialPrinterConfig } from '../../lib/vertialPrint/printerConfigNormalize';
import {
  evaluatePrinterStatus,
  isAppleMobileWebBrowser,
  isValidIpv4,
  type PrinterStatusSnapshot,
} from '../../lib/vertialPrint/printerSetupStatus';
import {
  settingsInputClass,
  settingsLabelClass,
  settingsPrimaryBtnClass,
  settingsChoiceCardClass,
  settingsListCardClass,
} from './settings/settingsFormStyles';
import { VertialPrintInstallHint } from './VertialPrintInstallHint';
import type { TpvPrinterScope } from './TpvPrinterSetupPanel';
import type { PrinterConfigTarget } from '../../lib/vertialPrint/printerPdvSync';

function statusToneClass(tone: PrinterStatusSnapshot['tone']): string {
  if (tone === 'ok') return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-800';
  if (tone === 'warn') return 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800';
  return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
}

export function WebPrinterSetupPanel({
  variant = 'page',
  onClose,
  config,
  onConfigChange,
  onPersist,
  saveTarget,
  canPersistToStore,
  storeLabel,
  saving,
}: {
  variant?: 'page' | 'modal';
  onClose?: () => void;
  config: VertialPrinterConfig;
  onConfigChange: (next: VertialPrinterConfig) => void;
  onPersist: (next: VertialPrinterConfig, target: PrinterConfigTarget) => Promise<void>;
  saveTarget: PrinterConfigTarget;
  canPersistToStore: boolean;
  storeLabel: string;
  saving: boolean;
  scope?: TpvPrinterScope;
}) {
  const [networkPrinters, setNetworkPrinters] = useState<Array<{ host: string; port: number; label?: string }>>([]);
  const [printers, setPrinters] = useState<Array<{ name: string }>>([]);
  const [scanningNetwork, setScanningNetwork] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<PrinterStatusSnapshot | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const statusTimerRef = useRef<number | null>(null);
  const initialScanStartedRef = useRef(false);
  const needsRemotePc = isAppleMobileWebBrowser();
  const isModal = variant === 'modal';

  const refreshStatus = useCallback(async (nextConfig = config) => {
    setStatusLoading(true);
    try {
      setStatus(await evaluatePrinterStatus(nextConfig));
      if (nextConfig.connectionType === 'system') {
        setPrinters(await fetchBridgePrinters(nextConfig));
      }
    } finally {
      setStatusLoading(false);
    }
  }, [config]);

  const scheduleStatusRefresh = useCallback((nextConfig: VertialPrinterConfig, delayMs = 700) => {
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => {
      void refreshStatus(nextConfig);
    }, delayMs);
  }, [refreshStatus]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => () => {
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
  }, []);

  useEffect(() => {
    if (!status?.bridgeOk || needsRemotePc) return;
    void fetchBridgePrinters(config).then(setPrinters);
  }, [status?.bridgeOk, needsRemotePc, config.bridgeHost]);

  const applyConfig = (partial: Partial<VertialPrinterConfig>, refresh: 'now' | 'debounced' | 'none' = 'now') => {
    const next = normalizeVertialPrinterConfig({ ...config, ...partial });
    onConfigChange(next);
    savePrinterConfig(next);
    if (canPersistToStore) void onPersist(next, saveTarget);
    if (refresh === 'now') void refreshStatus(next);
    else if (refresh === 'debounced') scheduleStatusRefresh(next);
  };

  const handleTest = useCallback(async (cfg = config) => {
    savePrinterConfig(cfg);
    if (canPersistToStore) void onPersist(cfg, saveTarget);
    setTesting(true);
    try {
      const result = await printTestTicket();
      await refreshStatus(cfg);
      if (!result.ok && result.method !== 'browser') {
        /* printTestTicket ya muestra el toast de error */
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo imprimir la prueba', { duration: 8000 });
    } finally {
      setTesting(false);
    }
  }, [canPersistToStore, config, onPersist, refreshStatus, saveTarget]);

  const selectNetworkPrinter = useCallback((host: string, port: number, autoTest = false) => {
    const next = normalizeVertialPrinterConfig({
      ...config,
      connectionType: 'network',
      networkHost: host,
      networkPort: port || 9100,
    });
    onConfigChange(next);
    savePrinterConfig(next);
    if (canPersistToStore) void onPersist(next, saveTarget);
    void refreshStatus(next);
    toast.success(`Impresora seleccionada: ${host}`);
    if (autoTest) {
      window.setTimeout(() => { void handleTest(next); }, 400);
    }
  }, [canPersistToStore, config, handleTest, isModal, onConfigChange, onPersist, refreshStatus, saveTarget]);

  const handleScanNetworkPrinters = useCallback(async () => {
    setScanningNetwork(true);
    setScanError(null);
    setNetworkPrinters([]);
    try {
      if (needsRemotePc && !String(config.bridgeHost || '').trim()) {
        const message = 'Primero indica la IP del PC con Vertial Print.';
        setScanError(message);
        toast.error(message);
        return;
      }
      const health = await fetchBridgeHealth(2500, config);
      if (!health.ok) {
        const message = needsRemotePc
          ? 'No llegamos al PC del mostrador. Comprueba que Vertial Print está abierto y la IP es correcta.'
          : 'Inicia Vertial Print en este PC (se abre solo con npm run dev:local).';
        setScanError(message);
        toast.error(message);
        return;
      }
      const result = await fetchBridgeNetworkPrinters(config, { port: config.networkPort || 9100 });
      if (!result.ok) {
        setScanError(result.error || 'No se pudo buscar impresoras');
        toast.error(result.error || 'No se pudo buscar impresoras');
        return;
      }
      setNetworkPrinters(result.printers);
      if (result.printers.length === 0) {
        setScanError('No se encontró ninguna impresora térmica en la WiFi. Comprueba que está encendida o pon la IP manual.');
      } else if (result.printers.length === 1) {
        selectNetworkPrinter(result.printers[0].host, result.printers[0].port || 9100);
      } else {
        toast.success(`${result.printers.length} impresoras encontradas. Elige la tuya.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo buscar impresoras';
      setScanError(message);
      toast.error(message);
    } finally {
      setScanningNetwork(false);
    }
  }, [config, needsRemotePc, selectNetworkPrinter]);

  useEffect(() => {
    if (initialScanStartedRef.current) return;
    if (config.networkHost && isValidIpv4(config.networkHost)) return;
    initialScanStartedRef.current = true;
    void (async () => {
      const health = await fetchBridgeHealth(2500, config);
      if (!health.ok) return;
      await handleScanNetworkPrinters();
    })();
  }, [config, handleScanNetworkPrinters]);

  const statusLine = statusLoading
    ? 'Comprobando…'
    : status?.tone === 'ok'
      ? `Lista · ${config.connectionType === 'system' ? config.systemPrinterName : config.networkHost}`
      : status?.label || 'Pulsa «Buscar impresoras»';

  const renderNetworkResults = () => networkPrinters.length > 0 ? (
    <div className={`${settingsListCardClass()} space-y-2`}>
      <p className={settingsLabelClass}>Impresoras encontradas</p>
      <div className="grid gap-2">
        {networkPrinters.map((item) => {
          const selected = config.networkHost === item.host;
          return (
            <button
              key={`${item.host}:${item.port}`}
              type="button"
              onClick={() => selectNetworkPrinter(item.host, item.port || 9100)}
              className={settingsChoiceCardClass(selected) + ' px-4 py-3 text-left w-full'}
            >
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.host}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.label || `Puerto ${item.port || 9100}`}</p>
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  const renderScanError = () => scanError ? (
    <p className="text-xs text-red-700 dark:text-red-300 flex items-start gap-1.5">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      {scanError}
    </p>
  ) : null;

  const renderManualIpField = (label: string) => (
    <label className={`${settingsListCardClass()} block space-y-2`}>
      <span className={settingsLabelClass}>{label}</span>
      <input
        className={settingsInputClass}
        value={config.networkHost}
        onChange={(e) => applyConfig({ networkHost: e.target.value.trim(), connectionType: 'network' }, 'debounced')}
        onBlur={() => {
          if (!isValidIpv4(config.networkHost)) {
            void refreshStatus();
          }
        }}
        placeholder="Ejemplo: 192.168.0.50"
        inputMode="decimal"
        autoComplete="off"
      />
    </label>
  );

  const renderCoreFlow = () => (
    <>
      {needsRemotePc && (
        <label className={`${settingsListCardClass()} block space-y-2`}>
          <span className={settingsLabelClass}>IP del PC con Vertial Print</span>
          <input
            className={settingsInputClass}
            value={config.bridgeHost}
            onChange={(e) => applyConfig({ bridgeHost: e.target.value.trim(), preferBridge: true }, 'debounced')}
            onBlur={() => void refreshStatus()}
            placeholder="Ejemplo: 192.168.1.50"
            inputMode="decimal"
            autoComplete="off"
          />
        </label>
      )}

      {!statusLoading && !status?.bridgeOk && (
        <VertialPrintInstallHint remotePc={needsRemotePc} compact={isModal} />
      )}

      <button
        type="button"
        onClick={() => void handleScanNetworkPrinters()}
        disabled={scanningNetwork || saving}
        className={`${settingsPrimaryBtnClass} w-full`}
      >
        {scanningNetwork ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4" />}
        {scanningNetwork ? 'Buscando en la WiFi…' : 'Buscar impresoras'}
      </button>

      {renderNetworkResults()}
      {renderScanError()}

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-gray-700" /></div>
        <div className="relative flex justify-center"><span className="bg-white dark:bg-gray-800 px-2 text-xs text-gray-400">o manual</span></div>
      </div>

      {renderManualIpField('IP de la impresora')}

      {isValidIpv4(config.networkHost) && (
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={testing || saving}
          className={`${settingsPrimaryBtnClass} w-full`}
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
          {testing ? 'Imprimiendo…' : 'Probar ticket'}
        </button>
      )}

      <p className={`text-xs ${status?.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500 dark:text-gray-400'}`}>
        {status?.tone === 'ok' ? (
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 shrink-0" />{statusLine}</span>
        ) : statusLine}
      </p>
    </>
  );

  return (
    <div className={variant === 'page' ? 'space-y-6 max-w-2xl' : 'flex flex-col min-h-0'}>
      {isModal && (
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Impresora</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {canPersistToStore ? storeLabel : 'Busca en la WiFi o pon la IP manual.'}
            </p>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0" aria-label="Cerrar">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>
      )}

      <div className={isModal ? 'flex-1 overflow-y-auto px-5 py-4 space-y-4' : 'space-y-5'}>
        {!isModal && (
          <header className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <Receipt className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Impresión desde navegador</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {canPersistToStore ? `Configuración de ${storeLabel}.` : 'Requiere Vertial Print en un PC de la misma red.'}
                </p>
              </div>
            </div>
          </header>
        )}

        {isModal ? renderCoreFlow() : (
          <>
            {canPersistToStore && (
              <div className={`${settingsListCardClass()} flex items-start gap-3`}>
                <Store className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{storeLabel}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{saving ? 'Guardando…' : 'Cambios guardados automáticamente.'}</p>
                </div>
              </div>
            )}

            <section className={`${settingsListCardClass()} space-y-4`}>
              <div className="flex items-start gap-3">
                <div className={`shrink-0 w-2.5 h-2.5 rounded-full mt-1.5 ${statusLoading ? 'bg-gray-300 animate-pulse' : status?.tone === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {statusLoading ? 'Comprobando…' : status?.label || 'Sin conectar'}
                  </p>
                  {!statusLoading && status?.detail && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{status.detail}</p>
                  )}
                </div>
                {!statusLoading && status && (
                  <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg border ${statusToneClass(status.tone)}`}>
                    {status.tone === 'ok' ? 'Lista' : 'Revisar'}
                  </span>
                )}
              </div>
            </section>

            {renderCoreFlow()}

            {!needsRemotePc && status?.bridgeOk && (
              <details className={`${settingsListCardClass()} text-sm`}>
                <summary className="cursor-pointer font-semibold text-gray-800 dark:text-gray-200">Impresora USB en este PC</summary>
                <div className="mt-3 space-y-2">
                  <select
                    className={settingsInputClass}
                    value={config.systemPrinterName}
                    onChange={(e) => applyConfig({
                      systemPrinterName: e.target.value,
                      connectionType: e.target.value ? 'system' : 'network',
                    })}
                  >
                    <option value="">— Impresora WiFi (recomendado) —</option>
                    {printers.map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </details>
            )}

            <div className={`${settingsListCardClass()} space-y-3`}>
              <p className={settingsLabelClass}>Ancho del ticket</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => applyConfig({ paperWidthMm: 80 })} className={settingsChoiceCardClass(config.paperWidthMm === 80) + ' px-4 py-2 text-sm font-medium'}>
                  Normal (80 mm)
                </button>
                <button type="button" onClick={() => applyConfig({ paperWidthMm: 58 })} className={settingsChoiceCardClass(config.paperWidthMm === 58) + ' px-4 py-2 text-sm font-medium'}>
                  Estrecho (58 mm)
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {isModal && onClose && (
        <div className="shrink-0 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={onClose} className="w-full py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            Listo
          </button>
        </div>
      )}
    </div>
  );
}
