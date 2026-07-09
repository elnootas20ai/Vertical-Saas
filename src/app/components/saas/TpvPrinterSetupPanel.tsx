import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Printer,
  Wifi,
  Monitor,
  Smartphone,
  Receipt,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  Store,
  Radar,
} from 'lucide-react';
import type { PointOfSale } from '../../lib/deliveryApi';
import {
  DEFAULT_PRINTER_CONFIG,
  discoverNativeNetworkPrinters,
  fetchBridgePrinters,
  fetchBridgeNetworkPrinters,
  identifyNativePrinter,
  isVertialNativeApp,
  shouldUseEposPrint,
  loadLegacyPrinterConfig,
  printTestTicket,
  resolveEffectivePrinterConfig,
  savePrinterConfig,
  type VertialPrinterConfig,
} from '../../lib/vertialPrint';
import { withNativeCallTimeout } from '../../lib/vertialPrint/nativeCallTimeout';
import { savePrinterConfigToPdv, type PrinterConfigTarget } from '../../lib/vertialPrint/printerPdvSync';
import { isVertialPrinterConfigConfigured, normalizeVertialPrinterConfig } from '../../lib/vertialPrint/printerConfigNormalize';
import {
  connectionToSetupKind,
  evaluatePrinterStatus,
  isAppleMobileDevice,
  setupKindToConnection,
  type PrinterSetupKind,
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

const SETUP_OPTIONS: Array<{ id: PrinterSetupKind; label: string; hint: string; icon: typeof Wifi }> = [
  {
    id: 'wifi',
    label: 'Impresora por WiFi',
    hint: 'Epson u otra térmica en la misma red del local. Ideal para iPad y tablets.',
    icon: Wifi,
  },
  {
    id: 'pc',
    label: 'Impresora en el PC del mostrador',
    hint: 'Enchufada por USB al ordenador. El TPV manda imprimir a ese PC.',
    icon: Monitor,
  },
  {
    id: 'browser',
    label: 'Sin térmica / ventana del dispositivo',
    hint: 'Abre la pantalla de imprimir del sistema. En iPad solo impresoras AirPrint.',
    icon: Smartphone,
  },
];

export interface TpvPrinterScope {
  userId: string;
  pdvId: string;
  pdv?: PointOfSale | null;
  terminalId?: string;
  storeLabel?: string;
  terminalLabel?: string;
  onPdvUpdated?: (pdv: PointOfSale) => void;
}

function statusToneClass(tone: PrinterStatusSnapshot['tone']): string {
  if (tone === 'ok') return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-800';
  if (tone === 'warn') return 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800';
  return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
}

function initialConfig(scope?: TpvPrinterScope): VertialPrinterConfig {
  if (scope?.pdv) {
    return resolveEffectivePrinterConfig({
      pdv: scope.pdv,
      terminalId: scope.terminalId,
      localFallback: loadLegacyPrinterConfig(),
    });
  }
  return loadLegacyPrinterConfig();
}

export function TpvPrinterSetupPanel({
  variant = 'page',
  onClose,
  scope,
}: {
  variant?: 'page' | 'modal';
  onClose?: () => void;
  scope?: TpvPrinterScope;
}) {
  const [pdv, setPdv] = useState<PointOfSale | null | undefined>(scope?.pdv);
  const [config, setConfig] = useState<VertialPrinterConfig>(() => initialConfig(scope));
  const [kind, setKind] = useState<PrinterSetupKind>(() => connectionToSetupKind(initialConfig(scope).connectionType));
  const [saveTarget, setSaveTarget] = useState<PrinterConfigTarget>(
    scope?.terminalId ? 'terminal' : 'store',
  );
  const [printers, setPrinters] = useState<Array<{ name: string }>>([]);
  const [networkPrinters, setNetworkPrinters] = useState<Array<{ host: string; port: number; label?: string }>>([]);
  const [scanningNetwork, setScanningNetwork] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{ checked: number; total: number } | null>(null);
  const [identifyingHost, setIdentifyingHost] = useState<string | null>(null);
  const [identifyResults, setIdentifyResults] = useState<Record<string, 'ok' | 'error'>>({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [status, setStatus] = useState<PrinterStatusSnapshot | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const saveTimerRef = useRef<number | null>(null);
  const pendingConfigRef = useRef<VertialPrinterConfig | null>(null);
  const autoScanAttemptedRef = useRef(false);

  const canPersistToStore = Boolean(scope?.userId && scope?.pdvId && pdv?._id);
  const terminalLabel = scope?.terminalLabel?.trim() || 'este TPV';
  const storeLabel = scope?.storeLabel?.trim() || 'toda la tienda';
  const hasTerminalScope = Boolean(scope?.terminalId);
  const isNativeApp = isVertialNativeApp();
  const usesDirectWifi = isNativeApp || shouldUseEposPrint(config);
  const visibleSetupOptions = useMemo(
    () => (isNativeApp ? SETUP_OPTIONS.filter((option) => option.id === 'wifi') : SETUP_OPTIONS),
    [isNativeApp],
  );
  const activeKind: PrinterSetupKind = isNativeApp ? 'wifi' : kind;

  const terminalHasOverride = useMemo(() => {
    if (!scope?.terminalId || !pdv) return false;
    const term = pdv.terminals.find((t) => t.id === scope.terminalId);
    return Boolean(term?.printerConfig && isVertialPrinterConfigConfigured(normalizeVertialPrinterConfig(term.printerConfig)));
  }, [pdv, scope?.terminalId]);

  useEffect(() => {
    setPdv(scope?.pdv);
    const next = initialConfig(scope);
    setConfig(next);
    setKind(connectionToSetupKind(next.connectionType));
    setSaveTarget(scope?.terminalId && terminalHasOverride ? 'terminal' : 'store');
  }, [scope?.pdv?._id, scope?.pdv?._rev, scope?.pdvId, scope?.terminalId, terminalHasOverride]);

  const refreshStatus = useCallback(async (nextConfig = config) => {
    setStatusLoading(true);
    try {
      setStatus(await evaluatePrinterStatus(nextConfig));
      if (nextConfig.connectionType !== 'browser' && !isVertialNativeApp()) {
        setPrinters(await fetchBridgePrinters(nextConfig));
      }
    } finally {
      setStatusLoading(false);
    }
  }, [config]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!isNativeApp) return;
    if (config.connectionType === 'network') return;
    patch({ connectionType: 'network' });
    setKind('wifi');
  }, [isNativeApp, config.connectionType]);

  useEffect(() => {
    if (status && !status.configured && !showSetup) {
      setShowSetup(true);
    }
  }, [status, showSetup]);

  const persistToStore = useCallback(async (next: VertialPrinterConfig, target: PrinterConfigTarget) => {
    if (!scope?.userId || !pdv?._id) return;
    setSaving(true);
    try {
      const saved = await savePrinterConfigToPdv(
        scope.userId,
        pdv,
        next,
        target,
        target === 'terminal' ? scope.terminalId : undefined,
      );
      setPdv(saved);
      scope.onPdvUpdated?.(saved);
    } catch (error) {
      const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
      toast.error(`No se pudo guardar la impresora en la tienda${detail}`, {
        duration: 9000,
        action: {
          label: 'Reintentar',
          onClick: () => void persistToStore(next, target),
        },
      });
    } finally {
      setSaving(false);
    }
  }, [pdv, scope]);

  const schedulePersist = useCallback((next: VertialPrinterConfig, target: PrinterConfigTarget) => {
    pendingConfigRef.current = next;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const cfg = pendingConfigRef.current;
      pendingConfigRef.current = null;
      if (cfg && canPersistToStore) void persistToStore(cfg, target);
    }, 600);
  }, [canPersistToStore, persistToStore]);

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
  }, []);

  const patch = (partial: Partial<VertialPrinterConfig>) => {
    setConfig((prev) => {
      const next = normalizeVertialPrinterConfig({ ...prev, ...partial });
      savePrinterConfig(next);
      if (canPersistToStore) schedulePersist(next, saveTarget);
      void refreshStatus(next);
      return next;
    });
  };

  const selectKind = (next: PrinterSetupKind) => {
    setKind(next);
    if (next !== 'wifi') autoScanAttemptedRef.current = false;
    patch({ connectionType: setupKindToConnection(next) });
    setShowSetup(true);
  };

  const handleTargetChange = (target: PrinterConfigTarget) => {
    setSaveTarget(target);
    if (!canPersistToStore) return;
    schedulePersist(config, target);
  };

  const handleTest = async () => {
    savePrinterConfig(config);
    if (canPersistToStore) await persistToStore(config, saveTarget);
    setTesting(true);
    try {
      await withNativeCallTimeout(
        printTestTicket(),
        isNativeApp ? 14_000 : 45_000,
        'Impresión de prueba',
      );
      await refreshStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo imprimir la prueba';
      toast.error(message, { duration: 8000 });
    } finally {
      setTesting(false);
    }
  };

  const showIpadBridgeHint = !usesDirectWifi && isAppleMobileDevice() && kind !== 'browser';

  const handleScanNetworkPrinters = useCallback(async () => {
    setScanningNetwork(true);
    setScanDone(false);
    setScanError(null);
    setScanProgress(null);
    setNetworkPrinters([]);
    setIdentifyResults({});
    try {
      if (isNativeApp) {
        const result = await withNativeCallTimeout(
          discoverNativeNetworkPrinters({
            timeoutMs: 5000,
            onProgress: (checked, total) => setScanProgress({ checked, total }),
          }),
          14_000,
          'Búsqueda de impresoras',
        );
        if (!result.ok) {
          setScanError(result.error || 'No se pudo buscar impresoras');
          toast.error(result.error || 'No se pudo buscar impresoras');
          return;
        }
        setNetworkPrinters(result.printers);
        setScanDone(true);
        if (result.printers.length === 0) {
          const hint =
            result.error ||
            'No se encontró ninguna impresora. Activa el permiso de «red local» para Vertial o escribe la IP manualmente.';
          setScanError(hint);
          toast.message(hint, { duration: 7000 });
          return;
        }
        if (result.printers.length === 1) {
          patch({ networkHost: result.printers[0].host, networkPort: result.printers[0].port || 9100 });
          toast.success(`Impresora detectada: ${result.printers[0].host}`);
        } else {
          toast.success(`${result.printers.length} impresoras encontradas. Pulsa «¿Cuál es?» para identificar la tuya.`);
        }
        return;
      }

      if (shouldUseEposPrint(config)) {
        toast.message('En iPad/Safari escribe la IP de la impresora (ej. 192.168.1.200). Sale en su ticket de configuración.');
        return;
      }

      const health = await evaluatePrinterStatus(config);
      if (!health.bridgeOk) {
        toast.error(
          isAppleMobileDevice()
            ? 'Primero activa Vertial Print en el PC del mostrador (misma WiFi).'
            : 'Descarga e inicia Vertial Print en este PC.',
        );
        return;
      }
      const result = await fetchBridgeNetworkPrinters(config, { port: config.networkPort || 9100 });
      if (!result.ok) {
        setScanError(result.error || 'No se pudo buscar impresoras');
        toast.error(result.error || 'No se pudo buscar impresoras');
        return;
      }
      setNetworkPrinters(result.printers);
      setScanDone(true);
      if (result.printers.length === 0) {
        toast.message('No se encontró ninguna impresora térmica en la WiFi del local.');
      } else if (result.printers.length === 1) {
        patch({ networkHost: result.printers[0].host, networkPort: result.printers[0].port || 9100 });
        toast.success(`Impresora detectada: ${result.printers[0].host}`);
      } else {
        toast.success(`${result.printers.length} impresoras encontradas. Elige la tuya.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo buscar impresoras';
      setScanError(message);
      toast.error(message, { duration: 8000 });
    } finally {
      setScanningNetwork(false);
      setScanProgress(null);
    }
  }, [config, isNativeApp]);

  // En la app nativa, al abrir la sección WiFi buscamos impresoras sin que el usuario tenga que hacer nada.
  useEffect(() => {
    if (!isNativeApp || kind !== 'wifi' || !showSetup) return;
    if (autoScanAttemptedRef.current) return;
    autoScanAttemptedRef.current = true;
    void handleScanNetworkPrinters();
  }, [isNativeApp, kind, showSetup, handleScanNetworkPrinters]);

  const handleIdentifyPrinter = useCallback(async (host: string, port: number) => {
    const key = `${host}:${port}`;
    setIdentifyingHost(key);
    try {
      const result = await identifyNativePrinter(host, port, config.paperWidthMm);
      setIdentifyResults((prev) => ({ ...prev, [key]: result.ok ? 'ok' : 'error' }));
      if (result.ok) {
        toast.success('Mira qué impresora ha sacado el ticket «ESTA ES TU IMPRESORA» y pulsa «Usar esta».');
      } else {
        toast.error(result.error || `La impresora ${host} no ha respondido`);
      }
    } finally {
      setIdentifyingHost(null);
    }
  }, [config.paperWidthMm]);

  return (
    <div className={variant === 'page' ? 'space-y-6 max-w-2xl' : 'flex flex-col min-h-0'}>
      {variant === 'modal' && (
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Impresora de tickets</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {canPersistToStore ? `Se guarda en ${storeLabel}. Todos los TPV la heredan.` : 'Se configura una vez por tienda. Funciona en iPad y PC.'}
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>
      )}

      <div className={variant === 'modal' ? 'flex-1 overflow-y-auto px-5 py-4 space-y-5' : 'space-y-5'}>
        {variant === 'page' && (
          <header className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <Receipt className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Impresión de tickets</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {canPersistToStore
                    ? `Configuración de ${storeLabel}. Se aplica a todos los dispositivos de esta tienda.`
                    : 'También disponible en el TPV (icono de impresora con la caja abierta)'}
                </p>
              </div>
            </div>
          </header>
        )}

        {canPersistToStore && (
          <div className={`${settingsListCardClass()} flex items-start gap-3`}>
            <Store className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{storeLabel}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                La IP y el tipo de conexión quedan guardados en la tienda, no solo en este dispositivo.
                {saving ? ' Guardando…' : ' Cambios guardados automáticamente.'}
              </p>
            </div>
          </div>
        )}

        <section className={`${settingsListCardClass()} space-y-4`}>
          <div className="flex items-start gap-3">
            <div className={`shrink-0 w-2.5 h-2.5 rounded-full mt-1.5 ${statusLoading ? 'bg-gray-300 animate-pulse' : status?.tone === 'ok' ? 'bg-emerald-500' : status?.tone === 'warn' ? 'bg-amber-500' : 'bg-gray-400'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {statusLoading ? 'Comprobando…' : status?.label || 'Sin configurar'}
              </p>
              {!statusLoading && status?.detail && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{status.detail}</p>
              )}
            </div>
            {!statusLoading && status && (
              <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg border ${statusToneClass(status.tone)}`}>
                {status.tone === 'ok' ? 'Lista' : status.tone === 'warn' ? 'Revisar' : 'Básica'}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testing || saving}
              className={`${settingsPrimaryBtnClass} flex-1`}
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              {testing ? 'Imprimiendo…' : 'Probar impresión'}
            </button>
            {isNativeApp && kind === 'wifi' && status?.tone === 'warn' && (
              <button
                type="button"
                onClick={() => {
                  setShowSetup(true);
                  void handleScanNetworkPrinters();
                }}
                disabled={scanningNetwork}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                {scanningNetwork ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4" />}
                Buscar de nuevo
              </button>
            )}
          </div>
        </section>

        {!statusLoading && !usesDirectWifi && kind !== 'browser' && !status?.bridgeOk && (
          <VertialPrintInstallHint remotePc={isAppleMobileDevice()} />
        )}

        {shouldUseEposPrint(config) && kind === 'wifi' && config.networkHost && (
          <div className={`${settingsListCardClass()} space-y-3`}>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              iPad — impresora <strong>{config.networkHost}</strong>
            </p>
            {isAppleMobileDevice() && (
              <div className="space-y-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/20 p-3">
                <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                  Si no imprime directo: PC del mostrador + Vertial Print
                </p>
                <ol className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed list-decimal list-inside space-y-1">
                  <li>En el PC Windows: descarga e inicia <strong>VertialPrint.exe</strong> (ventana negra abierta).</li>
                  <li>Pon abajo la IP de ese PC (misma WiFi). Ejemplo: 192.168.1.50</li>
                  <li>Guardar → Probar impresión</li>
                </ol>
                <label className="block">
                  <span className={settingsLabelClass}>IP del PC con Vertial Print</span>
                  <input
                    className={settingsInputClass}
                    value={config.bridgeHost}
                    onChange={(e) => patch({ bridgeHost: e.target.value.trim() })}
                    placeholder="Ejemplo: 192.168.1.50"
                    inputMode="decimal"
                    autoComplete="off"
                  />
                </label>
              </div>
            )}
            <details className="text-xs text-gray-500 dark:text-gray-400">
              <summary className="cursor-pointer font-medium text-gray-600 dark:text-gray-300">
                Impresión directa iPad (ePOS, opcional)
              </summary>
              <ol className="mt-2 leading-relaxed list-decimal list-inside space-y-1">
                <li>
                  Abre{' '}
                  <a
                    href={`https://${config.networkHost}:8043`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-indigo-600 dark:text-indigo-400 underline underline-offset-2"
                  >
                    https://{config.networkHost}:8043
                  </a>
                  {' '}→ acepta el certificado.
                </li>
                <li>Vuelve al TPV y prueba otra vez.</li>
              </ol>
            </details>
          </div>
        )}

        {isNativeApp && kind === 'wifi' && (
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            La app busca impresoras térmicas en la WiFi del local automáticamente al abrir la configuración. Si no aparece la tuya, pulsa «Buscar de nuevo».
          </p>
        )}

        <div>
          <button
            type="button"
            onClick={() => setShowSetup((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200 py-2"
          >
            <span>{showSetup ? 'Ocultar configuración' : 'Configurar impresora'}</span>
            {showSetup ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {showSetup && (
            <div className="space-y-4 mt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Elige cómo está conectada en tu local. Todos los iPad y PC de la misma tienda usarán esta misma impresora.
              </p>

              {canPersistToStore && hasTerminalScope && (
                <div className={`${settingsListCardClass()} space-y-3`}>
                  <p className={settingsLabelClass}>¿Dónde guardar esta configuración?</p>
                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => handleTargetChange('store')}
                      className={settingsChoiceCardClass(saveTarget === 'store') + ' text-left px-4 py-3'}
                    >
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Toda la tienda</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Todos los TPV de {storeLabel} imprimen aquí.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTargetChange('terminal')}
                      className={settingsChoiceCardClass(saveTarget === 'terminal') + ' text-left px-4 py-3'}
                    >
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Solo {terminalLabel}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Útil si esta caja tiene otra impresora distinta.</p>
                    </button>
                  </div>
                </div>
              )}

              <div className="grid gap-2">
                {visibleSetupOptions.map(({ id, label, hint, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectKind(id)}
                    className={`${settingsChoiceCardClass(activeKind === id)} flex gap-3 items-start text-left w-full`}
                  >
                    <Icon className="w-5 h-5 text-gray-600 dark:text-gray-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                        {isNativeApp
                          ? 'La app envía el ticket directo a la térmica WiFi, sin ventana de imprimir.'
                          : hint}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {activeKind === 'wifi' && (
                <div className={`${settingsListCardClass()} space-y-4`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={settingsLabelClass}>Impresora en la WiFi del local</p>
                    <button
                      type="button"
                      onClick={() => void handleScanNetworkPrinters()}
                      disabled={scanningNetwork || saving}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {scanningNetwork ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Radar className="w-3.5 h-3.5" />
                      )}
                      {scanningNetwork ? 'Buscando…' : scanDone || networkPrinters.length > 0 ? 'Buscar de nuevo' : 'Buscar impresora'}
                    </button>
                  </div>

                  {scanningNetwork && (
                    <div className="flex items-center gap-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/20 px-4 py-3">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">Buscando impresoras en la WiFi…</p>
                        <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80 mt-0.5">
                          {scanProgress && scanProgress.total > 0
                            ? `Escaneando red… ${Math.min(100, Math.round((scanProgress.checked / scanProgress.total) * 100))}%`
                            : 'Unos segundos (máx. 14 s). No cierres esta pantalla.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {!scanningNetwork && scanError && (
                    <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/70 dark:bg-red-950/20 px-4 py-3 space-y-2">
                      <p className="text-sm font-semibold text-red-900 dark:text-red-200 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        No se pudo buscar impresoras
                      </p>
                      <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">{scanError}</p>
                      <button
                        type="button"
                        onClick={() => void handleScanNetworkPrinters()}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700"
                      >
                        <Radar className="w-3.5 h-3.5" />
                        Reintentar búsqueda
                      </button>
                    </div>
                  )}

                  {!scanningNetwork && scanDone && networkPrinters.length === 0 && (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3 space-y-1.5">
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        No se encontró ninguna impresora
                      </p>
                      <ul className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed list-disc list-inside space-y-0.5">
                        {isNativeApp && (
                          <li>
                            <strong>¿Te acaba de salir el aviso de «red local»?</strong> Acéptalo y pulsa «Buscar de nuevo»:
                            la primera búsqueda se hace antes de que des el permiso.
                          </li>
                        )}
                        <li>Comprueba que la impresora está encendida y con papel.</li>
                        <li>Tiene que estar en la misma WiFi que este dispositivo.</li>
                        {isNativeApp && <li>Ajustes del dispositivo → Vertial → activa «Red local».</li>}
                        <li>Si tienes su IP, escríbela abajo a mano.</li>
                      </ul>
                    </div>
                  )}

                  {networkPrinters.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {networkPrinters.length === 1
                          ? 'Impresora detectada en la WiFi:'
                          : `${networkPrinters.length} impresoras detectadas. Si no sabes cuál es la tuya, pulsa «¿Cuál es?»: sacará un ticket que dice «ESTA ES TU IMPRESORA».`}
                      </p>
                      <div className="grid gap-2">
                        {networkPrinters.map((item) => {
                          const key = `${item.host}:${item.port || 9100}`;
                          const selected = config.networkHost === item.host;
                          const identifying = identifyingHost === key;
                          const identified = identifyResults[key];
                          return (
                            <div
                              key={key}
                              className={settingsChoiceCardClass(selected) + ' px-4 py-3 w-full'}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${selected ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'bg-gray-100 dark:bg-gray-800'}`}>
                                  <Printer className={`w-4 h-4 ${selected ? 'text-indigo-600 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                                    {item.host}
                                    {identified === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                    {item.label || `Impresora térmica · puerto ${item.port || 9100}`}
                                  </p>
                                </div>
                                {selected && (
                                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg bg-indigo-600 text-white">
                                    En uso
                                  </span>
                                )}
                              </div>
                              {identified === 'ok' && (
                                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  {selected
                                    ? 'Ticket de prueba impreso. Esta impresora funciona.'
                                    : 'Ticket de prueba impreso. Si salió aquí, pulsa «Usar esta».'}
                                </p>
                              )}
                              {identified === 'error' && (
                                <p className="mt-2 text-xs text-red-700 dark:text-red-300 flex items-center gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  No ha respondido. Comprueba que está encendida y prueba otra vez.
                                </p>
                              )}
                              <div className="flex gap-2 mt-3">
                                {!selected && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      patch({ networkHost: item.host, networkPort: item.port || 9100 });
                                      toast.success(`Impresora guardada: ${item.host}`);
                                    }}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Usar esta
                                  </button>
                                )}
                                {isNativeApp && (
                                  <button
                                    type="button"
                                    onClick={() => void handleIdentifyPrinter(item.host, item.port || 9100)}
                                    disabled={identifyingHost !== null}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                                  >
                                    {identifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />}
                                    {identifying ? 'Imprimiendo…' : selected ? 'Imprimir prueba' : '¿Cuál es?'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <label className="block">
                    <span className={settingsLabelClass}>Número de la impresora (IP)</span>
                    <input
                      className={settingsInputClass}
                      value={config.networkHost}
                      onChange={(e) => patch({ networkHost: e.target.value.trim() })}
                      placeholder="Ejemplo: 192.168.0.50"
                      inputMode="decimal"
                      autoComplete="off"
                    />
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    {isNativeApp
                      ? 'Se rellena sola al elegir una impresora detectada. También puedes escribirla a mano (sale en el ticket de configuración de la Epson).'
                      : 'Pulsa «Buscar impresora» para detectarla en la WiFi, o escribe la IP manualmente (sale en el ticket de configuración de la Epson).'}
                  </p>
                </div>
              )}

              {kind === 'pc' && (
                <div className={`${settingsListCardClass()} space-y-3`}>
                  <label className="block">
                    <span className={settingsLabelClass}>Impresora en este PC</span>
                    <select
                      className={settingsInputClass}
                      value={config.systemPrinterName}
                      onChange={(e) => patch({ systemPrinterName: e.target.value })}
                    >
                      <option value="">— Elige en la lista —</option>
                      {printers.map((p) => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                  {printers.length === 0 && !status?.bridgeOk && (
                    <VertialPrintInstallHint remotePc={false} compact />
                  )}
                  {printers.length === 0 && status?.bridgeOk && (
                    <p className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      Instala la impresora en Windows y elígela en la lista de arriba.
                    </p>
                  )}
                </div>
              )}

              {kind === 'browser' && (
                <div className={`${settingsListCardClass()} space-y-2`}>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    Al cobrar se abrirá la ventana de imprimir de tu dispositivo, como una foto o un PDF.
                  </p>
                  {isAppleMobileDevice() && (
                    <p className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      En iPad solo aparecen impresoras AirPrint. Para una Epson térmica, usa «Impresora por WiFi».
                    </p>
                  )}
                </div>
              )}

              {showIpadBridgeHint && (
                <div className={`${settingsListCardClass()} space-y-3`}>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    ¿Usas iPad u otra tablet?
                  </p>
                  <label className="block">
                    <span className={settingsLabelClass}>Número del PC del mostrador (opcional)</span>
                    <input
                      className={settingsInputClass}
                      value={config.bridgeHost}
                      onChange={(e) => patch({ bridgeHost: e.target.value.trim() })}
                      placeholder="Ejemplo: 192.168.0.20"
                      inputMode="decimal"
                      autoComplete="off"
                    />
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    Déjalo vacío si imprimes desde el mismo PC. En iPad, pon la IP del PC encendido del mostrador (misma WiFi).
                  </p>
                </div>
              )}

              <div className={`${settingsListCardClass()} space-y-3`}>
                <p className={settingsLabelClass}>Ancho del ticket</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => patch({ paperWidthMm: 80 })}
                    className={settingsChoiceCardClass(config.paperWidthMm === 80) + ' px-4 py-2 text-sm font-medium'}
                  >
                    Normal (80 mm)
                  </button>
                  <button
                    type="button"
                    onClick={() => patch({ paperWidthMm: 58 })}
                    className={settingsChoiceCardClass(config.paperWidthMm === 58) + ' px-4 py-2 text-sm font-medium'}
                  >
                    Estrecho (58 mm)
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
                onClick={() => {
                  patch({ ...DEFAULT_PRINTER_CONFIG, connectionType: 'browser' });
                  setKind('browser');
                  toast.success('Restaurado');
                }}
              >
                Restaurar valores por defecto
              </button>
            </div>
          )}
        </div>

        {status?.bridgeOk && (
          <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            {isNativeApp
              ? 'Impresora lista. La tablet imprime directo por WiFi.'
              : shouldUseEposPrint(config)
                ? 'Impresora Epson lista para Safari/iPad.'
                : 'Servicio de impresión conectado. iPad y PC pueden imprimir tickets.'}
          </p>
        )}
      </div>

      {variant === 'modal' && onClose && (
        <div className="shrink-0 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Listo
          </button>
        </div>
      )}
    </div>
  );
}

export function TpvPrinterSetupModal({
  open,
  onClose,
  scope,
}: {
  open: boolean;
  onClose: () => void;
  scope?: TpvPrinterScope;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex p-3 sm:p-4 items-end sm:items-center justify-center">
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[min(92svh,720px)] flex flex-col overflow-hidden"
        role="dialog"
        aria-labelledby="tpv-printer-setup-title"
      >
        <TpvPrinterSetupPanel variant="modal" onClose={onClose} scope={scope} />
      </div>
    </div>
  );
}
