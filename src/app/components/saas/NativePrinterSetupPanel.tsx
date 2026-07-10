import { useCallback, useEffect, useMemo, useState } from 'react';
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
  discoverNativeNetworkPrinters,
  identifyNativePrinter,
  printTestTicket,
  savePrinterConfig,
  hasAcknowledgedLocalNetworkPermission,
  completeLocalNetworkPermissionFlow,
  LAN_PERMISSION_ATTEMPTED_EVENT,
  LAN_PERMISSION_MODAL_EVENT,
  openNativeAppSettings,
  type VertialPrinterConfig,
} from '../../lib/vertialPrint';
import { withNativeCallTimeout } from '../../lib/vertialPrint/nativeCallTimeout';
import { normalizeVertialPrinterConfig } from '../../lib/vertialPrint/printerConfigNormalize';
import { evaluatePrinterStatus, isValidIpv4, type PrinterStatusSnapshot } from '../../lib/vertialPrint/printerSetupStatus';
import {
  settingsInputClass,
  settingsLabelClass,
  settingsPrimaryBtnClass,
  settingsChoiceCardClass,
  settingsListCardClass,
} from './settings/settingsFormStyles';
import { LocalNetworkPermissionModal } from './LocalNetworkPermissionModal';
import { NativeLocalNetworkPermissionCard } from '../native/NativeLocalNetworkPermissionCard';
import type { TpvPrinterScope } from './TpvPrinterSetupPanel';
import type { PrinterConfigTarget } from '../../lib/vertialPrint/printerPdvSync';

function statusToneClass(tone: PrinterStatusSnapshot['tone']): string {
  if (tone === 'ok') return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-800';
  if (tone === 'warn') return 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800';
  return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
}

export function NativePrinterSetupPanel({
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
  const [scanningNetwork, setScanningNetwork] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{ checked: number; total: number } | null>(null);
  const [identifyingHost, setIdentifyingHost] = useState<string | null>(null);
  const [identifyResults, setIdentifyResults] = useState<Record<string, 'ok' | 'error'>>({});
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<PrinterStatusSnapshot | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [showLanPermissionModal, setShowLanPermissionModal] = useState(false);
  const [lanPermissionBusy, setLanPermissionBusy] = useState(false);

  const refreshStatus = useCallback(async (nextConfig = config) => {
    setStatusLoading(true);
    try {
      setStatus(await evaluatePrinterStatus(nextConfig));
    } finally {
      setStatusLoading(false);
    }
  }, [config]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const selectNetworkPrinter = useCallback((host: string, port: number) => {
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
  }, [canPersistToStore, config, onConfigChange, onPersist, refreshStatus, saveTarget]);

  const handleScanNetworkPrinters = useCallback(async (options?: { skipPermissionGate?: boolean }) => {
    if (!options?.skipPermissionGate && !hasAcknowledgedLocalNetworkPermission()) {
      setShowLanPermissionModal(true);
      return;
    }

    setScanningNetwork(true);
    setScanDone(false);
    setScanError(null);
    setScanProgress(null);
    setNetworkPrinters([]);
    setIdentifyResults({});

    try {
      const result = await withNativeCallTimeout(
        discoverNativeNetworkPrinters({
          timeoutMs: 5000,
          subnetHintHost: config.networkHost || undefined,
          onProgress: (checked, total) => setScanProgress({ checked, total }),
        }),
        16_000,
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
        const hint = result.error || 'No se encontró ninguna impresora. Activa «Red local» para Vertial o busca de nuevo.';
        setScanError(hint);
        return;
      }

      if (result.printers.length === 1) {
        selectNetworkPrinter(result.printers[0].host, result.printers[0].port || 9100);
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
  }, [selectNetworkPrinter]);

  const handleLanPermissionContinue = useCallback(async () => {
    setLanPermissionBusy(true);
    try {
      await completeLocalNetworkPermissionFlow();
      setShowLanPermissionModal(false);
    } catch {
      toast.error('No se pudo pedir el permiso. Abre Ajustes → Vertial → Red local.', { duration: 9000 });
    } finally {
      setLanPermissionBusy(false);
    }
    void handleScanNetworkPrinters({ skipPermissionGate: true });
  }, [handleScanNetworkPrinters]);

  const handleOpenAppSettings = useCallback(async () => {
    const opened = await openNativeAppSettings();
    if (!opened) {
      toast.message('Ve a Ajustes → Vertial → activa «Red local».', { duration: 8000 });
    }
  }, []);

  useEffect(() => {
    const onPermissionAttempted = () => {
      void handleScanNetworkPrinters({ skipPermissionGate: true });
    };
    const onShowModal = () => setShowLanPermissionModal(true);
    window.addEventListener(LAN_PERMISSION_ATTEMPTED_EVENT, onPermissionAttempted);
    window.addEventListener(LAN_PERMISSION_MODAL_EVENT, onShowModal);
    return () => {
      window.removeEventListener(LAN_PERMISSION_ATTEMPTED_EVENT, onPermissionAttempted);
      window.removeEventListener(LAN_PERMISSION_MODAL_EVENT, onShowModal);
    };
  }, [handleScanNetworkPrinters]);

  // Al abrir impresoras (TPV o Ajustes): pedir permiso si aún no se ha dado.
  useEffect(() => {
    if (!hasAcknowledgedLocalNetworkPermission()) {
      setShowLanPermissionModal(true);
    }
  }, []);

  const handleIdentifyPrinter = useCallback(async (host: string, port: number) => {
    const key = `${host}:${port}`;
    setIdentifyingHost(key);
    try {
      const result = await identifyNativePrinter(host, port, config.paperWidthMm);
      setIdentifyResults((prev) => ({ ...prev, [key]: result.ok ? 'ok' : 'error' }));
      if (result.ok) {
        toast.success('Ticket «ESTA ES TU IMPRESORA» enviado. Si salió ahí, pulsa «Usar esta».');
      } else {
        toast.error(result.error || `La impresora ${host} no ha respondido`);
      }
    } finally {
      setIdentifyingHost(null);
    }
  }, [config.paperWidthMm]);

  const handleTest = async () => {
    savePrinterConfig(config);
    if (canPersistToStore) void onPersist(config, saveTarget);
    setTesting(true);
    try {
      await withNativeCallTimeout(printTestTicket(), 6_000, 'Impresión de prueba');
      await refreshStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo imprimir la prueba', { duration: 8000 });
    } finally {
      setTesting(false);
    }
  };

  const patch = (partial: Partial<VertialPrinterConfig>) => {
    const next = normalizeVertialPrinterConfig({ ...config, ...partial });
    onConfigChange(next);
    savePrinterConfig(next);
    if (canPersistToStore) void onPersist(next, saveTarget);
    void refreshStatus(next);
  };

  const headerSubtitle = useMemo(
    () => (canPersistToStore ? `Se guarda en ${storeLabel}. Todos los TPV la heredan.` : 'Busca, elige y listo.'),
    [canPersistToStore, storeLabel],
  );

  return (
    <div className={variant === 'page' ? 'space-y-6 max-w-2xl' : 'flex flex-col min-h-0'}>
      {variant === 'modal' && (
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Impresora WiFi</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{headerSubtitle}</p>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0" aria-label="Cerrar">
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
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Impresora WiFi</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{headerSubtitle}</p>
              </div>
            </div>
          </header>
        )}

        {canPersistToStore && (
          <div className={`${settingsListCardClass()} flex items-start gap-3`}>
            <Store className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{storeLabel}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {saving ? 'Guardando…' : 'Cambios guardados automáticamente.'}
              </p>
            </div>
          </div>
        )}

        <NativeLocalNetworkPermissionCard />

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
              onClick={() => void handleScanNetworkPrinters()}
              disabled={scanningNetwork || saving}
              className={`${settingsPrimaryBtnClass} flex-1`}
            >
              {scanningNetwork ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4" />}
              {scanningNetwork ? 'Buscando…' : 'Buscar impresoras'}
            </button>
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testing || saving || !config.networkHost}
              className={`${settingsPrimaryBtnClass} flex-1`}
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              {testing ? 'Imprimiendo…' : 'Probar ticket'}
            </button>
          </div>
        </section>

        <div className={`${settingsListCardClass()} space-y-4`}>
          {scanningNetwork && (
            <div className="flex items-center gap-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/20 px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">Buscando impresoras en la WiFi…</p>
                <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80 mt-0.5">
                  {scanProgress && scanProgress.total > 0
                    ? `Escaneando red… ${Math.min(100, Math.round((scanProgress.checked / scanProgress.total) * 100))}%`
                    : 'Acepta el permiso de «red local» si te lo pide el sistema.'}
                </p>
              </div>
            </div>
          )}

          {!scanningNetwork && scanError && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/70 dark:bg-red-950/20 px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-red-900 dark:text-red-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                No se encontró la impresora
              </p>
              <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">{scanError}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleScanNetworkPrinters({ skipPermissionGate: true })}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700"
                >
                  <Radar className="w-3.5 h-3.5" />
                  Buscar de nuevo
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenAppSettings()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-red-300 dark:border-red-700 text-red-800 dark:text-red-200"
                >
                  Abrir Ajustes
                </button>
              </div>
            </div>
          )}

          {networkPrinters.length > 0 && (
            <div className="space-y-2">
              <p className={settingsLabelClass}>
                {networkPrinters.length === 1 ? 'Impresora encontrada' : `${networkPrinters.length} impresoras encontradas`}
              </p>
              <div className="grid gap-2">
                {networkPrinters.map((item) => {
                  const key = `${item.host}:${item.port || 9100}`;
                  const selected = config.networkHost === item.host;
                  const identifying = identifyingHost === key;
                  const identified = identifyResults[key];
                  return (
                    <div key={key} className={settingsChoiceCardClass(selected) + ' px-4 py-3 w-full'}>
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${selected ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'bg-gray-100 dark:bg-gray-800'}`}>
                          <Printer className={`w-4 h-4 ${selected ? 'text-indigo-600 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.host}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                            {item.label || `Puerto ${item.port || 9100}`}
                          </p>
                        </div>
                        {selected && (
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg bg-indigo-600 text-white">
                            Seleccionada
                          </span>
                        )}
                      </div>
                      {identified === 'ok' && (
                        <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          Ticket de prueba impreso en esta impresora.
                        </p>
                      )}
                      <div className="flex gap-2 mt-3">
                        {!selected && (
                          <button
                            type="button"
                            onClick={() => selectNetworkPrinter(item.host, item.port || 9100)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Usar esta
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleIdentifyPrinter(item.host, item.port || 9100)}
                          disabled={identifyingHost !== null}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                        >
                          {identifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />}
                          {identifying ? 'Imprimiendo…' : '¿Cuál es?'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!scanningNetwork && scanDone && networkPrinters.length === 0 && !scanError && (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              No se encontró ninguna impresora. Comprueba que la Epson está encendida y en la misma WiFi.
            </p>
          )}
        </div>

        <label className={`${settingsListCardClass()} block space-y-2`}>
          <span className={settingsLabelClass}>IP de la impresora (manual)</span>
          <input
            className={settingsInputClass}
            value={config.networkHost}
            onChange={(e) => patch({ networkHost: e.target.value.trim(), connectionType: 'network' })}
            placeholder="Ejemplo: 192.168.0.50"
            inputMode="decimal"
            autoComplete="off"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Si la búsqueda no la encuentra, mira la IP en el ticket de configuración de la Epson.
          </p>
        </label>

        <div className={`${settingsListCardClass()} space-y-3`}>
          <p className={settingsLabelClass}>Ancho del ticket</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => patch({ paperWidthMm: 80 })} className={settingsChoiceCardClass(config.paperWidthMm === 80) + ' px-4 py-2 text-sm font-medium'}>
              Normal (80 mm)
            </button>
            <button type="button" onClick={() => patch({ paperWidthMm: 58 })} className={settingsChoiceCardClass(config.paperWidthMm === 58) + ' px-4 py-2 text-sm font-medium'}>
              Estrecho (58 mm)
            </button>
          </div>
        </div>

        {status?.tone === 'ok' && (
          <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            Impresora lista · {config.networkHost}
          </p>
        )}
      </div>

      <LocalNetworkPermissionModal
        open={showLanPermissionModal}
        busy={lanPermissionBusy}
        onContinue={() => void handleLanPermissionContinue()}
        onOpenSettings={() => void handleOpenAppSettings()}
        onClose={() => setShowLanPermissionModal(false)}
      />

      {variant === 'modal' && onClose && (
        <div className="shrink-0 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={onClose} className="w-full py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            Listo
          </button>
        </div>
      )}
    </div>
  );
}
