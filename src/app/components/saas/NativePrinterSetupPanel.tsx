import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Wifi,
  Bluetooth,
  Usb,
} from 'lucide-react';
import {
  discoverNativeNetworkPrinters,
  identifyNativePrinter,
  printTestTicket,
  savePrinterConfig,
  completeLocalNetworkPermissionFlow,
  buildPrinterDiscoveryHelpMessage,
  getNativeLocalNetworkInfo,
  pingNativeHost,
  hasUserCompletedLanPermissionFlow,
  LAN_PERMISSION_MODAL_EVENT,
  openNativeAppSettings,
  type NativeNetworkPrinterDiscoveryDiagnostics,
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

type ConnectionTab = 'wifi' | 'bluetooth' | 'usb';

const CONNECTION_TABS: Array<{ id: ConnectionTab; label: string; icon: typeof Wifi }> = [
  { id: 'wifi', label: 'WiFi', icon: Wifi },
  { id: 'bluetooth', label: 'Bluetooth', icon: Bluetooth },
  { id: 'usb', label: 'USB', icon: Usb },
];

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
  const [activeTab, setActiveTab] = useState<ConnectionTab>('wifi');
  const [scanDiagnostics, setScanDiagnostics] = useState<NativeNetworkPrinterDiscoveryDiagnostics | null>(null);
  const [deviceIp, setDeviceIp] = useState<string | null>(null);
  const [devicePrefix, setDevicePrefix] = useState<string | null>(null);
  const [testingManualIp, setTestingManualIp] = useState(false);
  const scanInFlightRef = useRef(false);

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

  useEffect(() => {
    void getNativeLocalNetworkInfo().then((info) => {
      if (info?.ip) {
        setDeviceIp(info.ip);
        setDevicePrefix(info.prefix || null);
      } else {
        setDeviceIp(null);
        setDevicePrefix(null);
      }
    });
  }, []);

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

  const handleScanNetworkPrinters = useCallback(async (options?: {
    skipPermissionGate?: boolean;
    deepScan?: boolean;
  }) => {
    if (!options?.skipPermissionGate && !hasUserCompletedLanPermissionFlow()) {
      setShowLanPermissionModal(true);
      return;
    }
    if (scanInFlightRef.current) return;
    scanInFlightRef.current = true;

    setScanningNetwork(true);
    setScanDone(false);
    setScanError(null);
    setScanProgress(null);
    setScanDiagnostics(null);
    setNetworkPrinters([]);
    setIdentifyResults({});

    try {
      const deviceNetwork = await getNativeLocalNetworkInfo();
      if (deviceNetwork?.ip) {
        setDeviceIp(deviceNetwork.ip);
        setDevicePrefix(deviceNetwork.prefix || null);
      } else {
        setDeviceIp(null);
        setDevicePrefix(null);
      }

      const subnetHintHost = config.networkHost || deviceNetwork?.ip || undefined;
      const deepScan = Boolean(options?.deepScan);
      const result = await withNativeCallTimeout(
        discoverNativeNetworkPrinters({
          timeoutMs: deepScan ? 8_000 : 6_000,
          deepScan,
          subnetHintHost,
          onProgress: (checked, total) => setScanProgress({ checked, total }),
        }),
        deepScan ? 38_000 : 28_000,
        'Búsqueda de impresoras',
      );

      setScanDiagnostics(result.diagnostics || null);

      if (!result.ok) {
        setScanError(result.error || 'No se pudo buscar impresoras');
        toast.error(result.error || 'No se pudo buscar impresoras');
        return;
      }

      setNetworkPrinters(result.printers);
      setScanDone(true);

      if (result.printers.length === 0) {
        const hint = result.error || buildPrinterDiscoveryHelpMessage({
          onWifi: Boolean(deviceNetwork?.prefix),
          wifiPrefix: deviceNetwork?.prefix,
        });
        setScanError(hint);
        return;
      }

      setScanError(null);
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
      scanInFlightRef.current = false;
      setScanningNetwork(false);
      setScanProgress(null);
    }
  }, [config.networkHost, selectNetworkPrinter]);

  const handleTestManualIp = useCallback(async () => {
    const host = String(config.networkHost || '').trim();
    if (!isValidIpv4(host)) {
      toast.error('Introduce una IP válida (ejemplo: 192.168.1.50)');
      return;
    }
    setTestingManualIp(true);
    try {
      for (const port of [9100, 9101, 9102]) {
        const probe = await pingNativeHost(host, port);
        if (probe.ok) {
          selectNetworkPrinter(host, port);
          toast.success(`Impresora responde en ${host}:${port}`);
          return;
        }
      }
      toast.error(`La IP ${host} no responde. Comprueba: impresora encendida, misma WiFi, y en Ajustes → Vertial activa «Red local».`, { duration: 10000 });
    } finally {
      setTestingManualIp(false);
    }
  }, [config.networkHost, selectNetworkPrinter]);

  const handleLanPermissionContinue = useCallback(async () => {
    setLanPermissionBusy(true);
    try {
      const result = await completeLocalNetworkPermissionFlow();
      setShowLanPermissionModal(false);
      if (!result.onWifi) {
        toast.message('Conecta el dispositivo a la WiFi del local antes de buscar impresoras.', { duration: 9000 });
      }
    } catch {
      toast.error('No se pudo pedir el permiso. Abre Ajustes → Vertial → Red local.', { duration: 9000 });
      return;
    } finally {
      setLanPermissionBusy(false);
    }
    toast.message('Permiso listo. Pulsa «Buscar impresoras» para escanear la WiFi.', { duration: 6000 });
  }, []);

  const handleOpenAppSettings = useCallback(async () => {
    const opened = await openNativeAppSettings();
    if (!opened) {
      toast.message('Ve a Ajustes → Vertial → activa «Red local».', { duration: 8000 });
    }
  }, []);

  useEffect(() => {
    const onShowModal = () => setShowLanPermissionModal(true);
    window.addEventListener(LAN_PERMISSION_MODAL_EVENT, onShowModal);
    return () => {
      window.removeEventListener(LAN_PERMISSION_MODAL_EVENT, onShowModal);
    };
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
      await withNativeCallTimeout(printTestTicket(), 12_000, 'Impresión de prueba');
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
    () => (canPersistToStore ? `Se guarda en ${storeLabel}. Todos los TPV la heredan.` : 'Elige cómo conectar la impresora térmica.'),
    [canPersistToStore, storeLabel],
  );

  const networkSummary = useMemo(() => {
    if (!deviceIp && !devicePrefix) {
      return {
        title: 'Sin WiFi del local',
        detail: 'Conecta el iPhone o iPad a la misma WiFi que la impresora (no uses solo datos móviles).',
        tone: 'warn' as const,
      };
    }
    return {
      title: `Tu dispositivo: ${deviceIp}`,
      detail: `Red del local: ${devicePrefix}.x — La impresora debe estar en esta misma red (puerto 9100).`,
      tone: 'ok' as const,
    };
  }, [deviceIp, devicePrefix]);

  return (
    <div className={variant === 'page' ? 'space-y-6 max-w-2xl' : 'flex flex-col min-h-0'}>
      {variant === 'modal' && (
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Impresora térmica</h2>
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
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Impresora térmica</h2>
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

        <div className={`${settingsListCardClass()} p-1.5`}>
          <div className="grid grid-cols-3 gap-1">
            {CONNECTION_TABS.map(({ id, label, icon: Icon }) => {
              const selected = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-semibold transition-colors touch-manipulation ${
                    selected
                      ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === 'wifi' ? (
          <>
        <NativeLocalNetworkPermissionCard />

        <div className={`${settingsListCardClass()} space-y-2`}>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{networkSummary.title}</p>
          <p className={`text-xs leading-relaxed ${networkSummary.tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-gray-600 dark:text-gray-400'}`}>
            {networkSummary.detail}
          </p>
          {scanDiagnostics?.scannedPrefix && scanningNetwork && (
            <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
              Buscando en {scanDiagnostics.scannedPrefix}.1–254 (puerto 9100)…
            </p>
          )}
        </div>

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
              onClick={() => void handleScanNetworkPrinters({ deepScan: false })}
              disabled={scanningNetwork || saving}
              className={`${settingsPrimaryBtnClass} flex-1`}
            >
              {scanningNetwork ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4" />}
              {scanningNetwork ? 'Buscando…' : scanDone ? 'Buscar de nuevo' : 'Buscar impresoras'}
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
                  onClick={() => void handleScanNetworkPrinters({ skipPermissionGate: true, deepScan: true })}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700"
                >
                  <Radar className="w-3.5 h-3.5" />
                  Búsqueda amplia
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('wifi')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-red-300 dark:border-red-700 text-red-800 dark:text-red-200"
                >
                  Poner IP manual
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
              No se encontró ninguna impresora. Pon la IP manual (suele salir en el ticket de configuración de la impresora).
            </p>
          )}
        </div>

        <div className={`${settingsListCardClass()} space-y-3`}>
          <label className="block space-y-2">
            <span className={settingsLabelClass}>IP de la impresora (WiFi)</span>
            <input
              className={settingsInputClass}
              value={config.networkHost}
              onChange={(e) => patch({ networkHost: e.target.value.trim(), connectionType: 'network' })}
              placeholder="Ejemplo: 192.168.1.20"
              inputMode="decimal"
              autoComplete="off"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Imprime el ticket de configuración de la impresora (botón Feed al encender) o mira su pantalla/menú de red.
            </p>
          </label>
          <button
            type="button"
            onClick={() => void handleTestManualIp()}
            disabled={testingManualIp || !config.networkHost}
            className={`${settingsPrimaryBtnClass} w-full`}
          >
            {testingManualIp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {testingManualIp ? 'Comprobando IP…' : 'Probar esta IP'}
          </button>
        </div>
          </>
        ) : null}

        {activeTab === 'bluetooth' ? (
          <div className={`${settingsListCardClass()} space-y-3`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                <Bluetooth className="w-5 h-5 text-blue-600 dark:text-blue-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Bluetooth</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Próximamente en la app móvil</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              Por ahora en iPhone/iPad usa <strong>WiFi</strong> con la IP de la impresora (puerto 9100).
              La mayoría de impresoras térmicas de mostrador (Epson, HPRT, etc.) funcionan por red.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('wifi')}
              className={`${settingsPrimaryBtnClass} w-full`}
            >
              <Wifi className="w-4 h-4" />
              Configurar por WiFi
            </button>
          </div>
        ) : null}

        {activeTab === 'usb' ? (
          <div className={`${settingsListCardClass()} space-y-3`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center">
                <Usb className="w-5 h-5 text-violet-600 dark:text-violet-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">USB / PC del mostrador</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Solo en ordenador con Vertial Print</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              En iPhone/iPad no se puede imprimir por cable USB directamente.
              Si tienes un PC en caja, instala <strong>Vertial Print</strong> y conecta la impresora al PC por USB.
              Desde el móvil usa WiFi hacia la impresora en la misma red.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('wifi')}
              className={`${settingsPrimaryBtnClass} w-full`}
            >
              <Wifi className="w-4 h-4" />
              Usar impresora WiFi
            </button>
          </div>
        ) : null}

        {activeTab === 'wifi' ? (
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
        ) : null}

        {status?.tone === 'ok' && activeTab === 'wifi' && (
          <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            Impresora lista · {config.networkHost}:{config.networkPort || 9100}
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
