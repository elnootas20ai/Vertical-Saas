import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { CheckCircle2, CircleAlert, ExternalLink, Loader2, Network, Printer, Shield, Smartphone } from 'lucide-react';
import type { PointOfSale } from '../../lib/deliveryApi';
import { IMPRESORA_SETTINGS_PATH } from '../../lib/vertialPrint/nativePrinterFlow';
import { isVertialNativeApp } from '../../lib/vertialPrint/isNativeApp';
import {
  openNativeAppSettings,
  requestNativeLocalNetworkAccess,
} from '../../lib/vertialPrint/localNetworkPermission';
import { pingNativeHost } from '../../lib/vertialPrint/nativePrintClient';
import {
  clearPrinterVerifiedHost,
  loadNativePrinterDiagnostics,
  readPrinterVerifiedHost,
  writePrinterVerifiedHost,
  type NativePrinterDiagnostics,
} from '../../lib/vertialPrint/nativePrinterDiagnostics';
import { printTestTicket } from '../../lib/vertialPrint/printDeliveryTicket';
import {
  resolveEffectivePrinterConfig,
  savePrinterConfig,
  setActivePrinterScope,
} from '../../lib/vertialPrint/printerActiveScope';
import { loadLegacyPrinterConfig, type VertialPrinterConfig } from '../../lib/vertialPrint/printerConfig';
import { normalizeVertialPrinterConfig } from '../../lib/vertialPrint/printerConfigNormalize';
import { isValidIpv4, sanitizeIpv4Input } from '../../lib/vertialPrint/printerSetupStatus';
import { savePrinterConfigToPdv, type PrinterConfigTarget } from '../../lib/vertialPrint/printerPdvSync';

const LAN_MANUAL_CONFIRM_KEY = 'vertial_lan_manual_confirmed_v1';

export interface TpvPrinterScope {
  userId: string;
  pdvId: string;
  pdv?: PointOfSale | null;
  terminalId?: string;
  storeLabel?: string;
  terminalLabel?: string;
  onPdvUpdated?: (pdv: PointOfSale) => void;
}

function readLanManualConfirmed(): boolean {
  try {
    return localStorage.getItem(LAN_MANUAL_CONFIRM_KEY) === '1';
  } catch {
    return false;
  }
}

function writeLanManualConfirmed(value: boolean): void {
  try {
    if (value) localStorage.setItem(LAN_MANUAL_CONFIRM_KEY, '1');
    else localStorage.removeItem(LAN_MANUAL_CONFIRM_KEY);
  } catch {
    /* ignore */
  }
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

function SettingsSection({
  title,
  description,
  children,
  disabled,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div className="mb-4">
        <h3 className="font-bold text-gray-900 dark:text-gray-100">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

const PRINTER_PORT_OPTIONS = [9100, 9101, 9102, 8008, 8043] as const;

function sanitizePortInput(raw: string): number {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 5);
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return 9100;
  return n;
}

/**
 * Flujo impresora tablet/móvil (100 % manual):
 * 1) Red local (permiso iOS)
 * 2) IP + puerto → Guardar
 * 3) Probar ticket
 */
export function TpvPrinterSetupPanel({ scope }: { scope?: TpvPrinterScope }) {
  const [pdv, setPdv] = useState<PointOfSale | null | undefined>(scope?.pdv);
  const [config, setConfig] = useState<VertialPrinterConfig>(() => initialConfig(scope));
  const [manualIp, setManualIp] = useState(() => {
    const host = String(initialConfig(scope).networkHost || '').trim();
    return host;
  });
  const [manualPort, setManualPort] = useState(() => {
    const port = Number(initialConfig(scope).networkPort || 9100);
    return Number.isFinite(port) && port > 0 ? port : 9100;
  });
  const [ipDirty, setIpDirty] = useState(false);
  const ipDirtyRef = useRef(false);
  const [testing, setTesting] = useState(false);
  const [pingingIp, setPingingIp] = useState(false);
  const [savingIp, setSavingIp] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [pendingSaveHost, setPendingSaveHost] = useState('');
  const [pendingSavePort, setPendingSavePort] = useState(9100);
  const [lanConfirmed, setLanConfirmed] = useState(() => readLanManualConfirmed());
  const [diagnostics, setDiagnostics] = useState<NativePrinterDiagnostics | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [requestingLan, setRequestingLan] = useState(false);

  const isNative = isVertialNativeApp();
  const selectedHost = String(config.networkHost || '').trim();
  const selectedPort = Number(config.networkPort || 9100) || 9100;
  const isConfigured = isValidIpv4(selectedHost);
  const stepsUnlocked = !isNative || lanConfirmed;
  const hasUnsavedIp =
    ipDirty && (manualIp.trim() !== selectedHost || manualPort !== selectedPort);
  const canTest = isConfigured && !hasUnsavedIp && stepsUnlocked;

  const refreshDiagnostics = useCallback(() => {
    if (!isNative) return;
    setDiagLoading(true);
    void (async () => {
      try {
        setDiagnostics(await loadNativePrinterDiagnostics());
      } catch {
        setDiagnostics(null);
      } finally {
        setDiagLoading(false);
      }
    })();
  }, [isNative]);

  useEffect(() => {
    ipDirtyRef.current = ipDirty;
  }, [ipDirty]);

  useEffect(() => {
    setPdv(scope?.pdv);
    if (ipDirtyRef.current) return;
    const next = initialConfig(scope);
    setConfig(next);
    setManualIp(String(next.networkHost || '').trim());
    setManualPort(Number(next.networkPort || 9100) || 9100);
  }, [scope?.pdv?._id, scope?.pdv?._rev, scope?.pdvId, scope?.terminalId]);

  const handleLanConfirmChange = useCallback((checked: boolean) => {
    setLanConfirmed(checked);
    writeLanManualConfirmed(checked);
  }, []);

  const syncActiveScope = useCallback((next: VertialPrinterConfig, pdvDoc?: PointOfSale | null) => {
    const base = pdvDoc ?? pdv;
    if (base?._id) {
      const merged = { ...base, printerConfig: next };
      setActivePrinterScope({ pdvId: base._id, pdv: merged, terminalId: scope?.terminalId });
      setPdv(merged);
      return;
    }
    const pdvId = String(scope?.pdvId || '').trim();
    if (pdvId) {
      setActivePrinterScope({ pdvId, terminalId: scope?.terminalId, pdv: base ?? undefined });
    }
  }, [pdv, scope?.pdvId, scope?.terminalId]);

  const syncToServerInBackground = useCallback((next: VertialPrinterConfig) => {
    if (!scope?.userId || !pdv?._id) return;
    void (async () => {
      try {
        const target: PrinterConfigTarget = 'store';
        const saved = await savePrinterConfigToPdv(scope.userId, pdv, next, target, undefined, {
          suppressLogout: true,
        });
        syncActiveScope(next, saved);
        scope.onPdvUpdated?.(saved);
      } catch {
        /* La impresora ya está guardada en el dispositivo; el sync al servidor puede esperar. */
      }
    })();
  }, [pdv, scope, syncActiveScope]);

  const commitSave = useCallback((host: string, port: number) => {
    const safePort = sanitizePortInput(String(port));
    const next = normalizeVertialPrinterConfig({
      ...config,
      connectionType: 'network',
      networkHost: host,
      networkPort: safePort,
      paperWidthMm: 80,
    });

    setSavingIp(true);
    try {
      savePrinterConfig(next);
      const readBack = loadLegacyPrinterConfig();
      const savedOk = String(readBack.networkHost || '').trim() === host;
      if (!savedOk) {
        toast.error('La IP no quedó guardada en el dispositivo. Inténtalo de nuevo.');
        return;
      }
      syncActiveScope(next);
      setConfig(next);
      setManualIp(host);
      setManualPort(safePort);
      ipDirtyRef.current = false;
      setIpDirty(false);
      clearPrinterVerifiedHost();
      toast.success(`Impresora guardada: ${host}:${safePort}`, {
        description: 'Ya puedes probar el ticket en el paso 3.',
        duration: 6000,
      });
      syncToServerInBackground(next);
      refreshDiagnostics();
    } catch {
      toast.error('No se pudo guardar la impresora en este dispositivo. Inténtalo de nuevo.');
    } finally {
      setSavingIp(false);
      setConfirmSaveOpen(false);
      setPendingSaveHost('');
      setPendingSavePort(9100);
    }
  }, [config, syncActiveScope, syncToServerInBackground, refreshDiagnostics]);

  const handleRequestSave = useCallback(() => {
    if (!stepsUnlocked) {
      toast.error('Primero confirma que «Red local» está activado en Ajustes → Vertial.');
      return;
    }
    const host = manualIp.trim();
    if (!isValidIpv4(host)) {
      toast.error('Escribe una IP válida, por ejemplo 192.168.1.20');
      return;
    }
    setPendingSaveHost(host);
    setPendingSavePort(sanitizePortInput(String(manualPort)));
    setConfirmSaveOpen(true);
  }, [manualIp, manualPort, stepsUnlocked]);

  const handleConfirmSave = useCallback(() => {
    const host = pendingSaveHost.trim();
    if (!isValidIpv4(host)) {
      setConfirmSaveOpen(false);
      setPendingSaveHost('');
      toast.error('La IP ya no es válida. Revísala e inténtalo de nuevo.');
      return;
    }
    commitSave(host, pendingSavePort);
  }, [commitSave, pendingSaveHost, pendingSavePort]);

  const handleCheckConnection = useCallback(() => {
    if (!stepsUnlocked) {
      toast.error('Primero confirma que «Red local» está activado en Ajustes → Vertial.');
      return;
    }
    const host = manualIp.trim();
    const port = sanitizePortInput(String(manualPort));
    if (!isValidIpv4(host)) {
      toast.error('Escribe una IP válida, por ejemplo 192.168.1.20');
      return;
    }
    setPingingIp(true);
    void (async () => {
      try {
        const ping = await Promise.race([
          pingNativeHost(host, port),
          new Promise<{ ok: false }>((resolve) => {
            globalThis.setTimeout(() => resolve({ ok: false }), 6_000);
          }),
        ]);
        if (ping.ok) {
          toast.success(`Responde en ${host}:${port}`, {
            description:
              'rtt' in ping && ping.rtt
                ? `Tiempo de respuesta: ${ping.rtt} ms`
                : 'Pulsa «Guardar impresora» para usarla en el TPV.',
            duration: 8000,
          });
          refreshDiagnostics();
        } else {
          toast.error(`No responde en ${host}:${port}`, {
            duration: 10000,
            description:
              'Prueba otro puerto (9100 / 9101 / 9102). Puedes guardar igual si los datos del ticket son correctos.',
          });
        }
      } catch {
        toast.error('No se pudo comprobar. Puedes guardar IP y puerto igualmente.');
      } finally {
        setPingingIp(false);
      }
    })();
  }, [manualIp, manualPort, stepsUnlocked, refreshDiagnostics]);

  const handleRequestLanPermission = useCallback(async () => {
    if (!isNative) return;
    setRequestingLan(true);
    try {
      await requestNativeLocalNetworkAccess({
        printerIp: manualIp.trim() || selectedHost || '192.168.1.20',
      });
      toast.message('Si iOS muestra el aviso, pulsa Permitir. Luego debería aparecer «Red local» en Ajustes → Vertial.', {
        duration: 10000,
      });
    } catch {
      toast.error('No se pudo pedir el permiso. Prueba Abrir Ajustes o reinicia la app.');
    } finally {
      setRequestingLan(false);
    }
  }, [isNative, manualIp, selectedHost]);

  const handleOpenSettings = useCallback(async () => {
    try {
      // Disparar Bonjour antes de abrir Ajustes para que exista el interruptor.
      setRequestingLan(true);
      await requestNativeLocalNetworkAccess({
        printerIp: manualIp.trim() || selectedHost || '192.168.1.20',
      }).catch(() => undefined);
      await new Promise((r) => globalThis.setTimeout(r, 900));
      const opened = await Promise.race([
        openNativeAppSettings(),
        new Promise<boolean>((resolve) => {
          globalThis.setTimeout(() => resolve(false), 4_000);
        }),
      ]);
      if (!opened) {
        toast.error('Abre Ajustes → Vertial (o Privacidad → Red local) y activa Vertial.');
      }
    } catch {
      toast.error('No se pudo abrir Ajustes. Ve manualmente a Ajustes → Vertial → Red local.');
    } finally {
      setRequestingLan(false);
    }
  }, [manualIp, selectedHost]);

  const handleTest = useCallback(async () => {
    if (!stepsUnlocked) {
      toast.error('Primero confirma que «Red local» está activado en Ajustes → Vertial.');
      return;
    }
    if (hasUnsavedIp) {
      toast.error('Guarda primero la IP antes de probar el ticket.');
      return;
    }
    if (!isConfigured) {
      toast.error('Guarda primero la impresora en el paso 2.');
      return;
    }
    setTesting(true);
    try {
      const effective = resolveEffectivePrinterConfig({
        pdv: scope?.pdv,
        terminalId: scope?.terminalId,
        localFallback: loadLegacyPrinterConfig(),
      });
      const result = await Promise.race([
        printTestTicket(effective).then((value) => ({ ...value, timedOut: false as const })),
        new Promise<{ ok: false; timedOut: true }>((resolve) => {
          globalThis.setTimeout(() => resolve({ ok: false, timedOut: true }), 12_000);
        }),
      ]);
      if (result.ok) {
        writePrinterVerifiedHost(effective.networkHost);
        refreshDiagnostics();
      } else if (result.timedOut) {
        toast.error('La prueba tardó demasiado. Revisa la impresora o guarda de nuevo la IP.', {
          duration: 8000,
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo imprimir la prueba', { duration: 8000 });
    } finally {
      setTesting(false);
    }
  }, [hasUnsavedIp, isConfigured, refreshDiagnostics, scope?.pdv, scope?.terminalId, stepsUnlocked]);

  const handleManualIpChange = useCallback((raw: string) => {
    const value = sanitizeIpv4Input(raw);
    setManualIp(value);
    const dirty = value !== selectedHost || manualPort !== selectedPort;
    ipDirtyRef.current = dirty;
    setIpDirty(dirty);
    if (dirty) clearPrinterVerifiedHost();
  }, [manualPort, selectedHost, selectedPort]);

  const handleManualPortChange = useCallback((raw: string) => {
    const port = sanitizePortInput(raw);
    setManualPort(port);
    const dirty = manualIp.trim() !== selectedHost || port !== selectedPort;
    ipDirtyRef.current = dirty;
    setIpDirty(dirty);
    if (dirty) clearPrinterVerifiedHost();
  }, [manualIp, selectedHost, selectedPort]);

  const handleInsertIpDot = useCallback(() => {
    setManualIp((current) => {
      const trimmed = String(current || '').trim();
      if (!trimmed || trimmed.endsWith('.')) return trimmed;
      const dotCount = (trimmed.match(/\./g) || []).length;
      if (dotCount >= 3) return trimmed;
      const next = `${trimmed}.`;
      ipDirtyRef.current = next !== selectedHost;
      setIpDirty(next !== selectedHost);
      if (next !== selectedHost) clearPrinterVerifiedHost();
      return next;
    });
  }, [selectedHost]);

  const confirmDescription =
    pendingSaveHost && selectedHost && (pendingSaveHost !== selectedHost || pendingSavePort !== selectedPort)
      ? `Vas a guardar ${pendingSaveHost}:${pendingSavePort} (antes ${selectedHost}:${selectedPort}).`
      : `Los tickets de este dispositivo se imprimirán en ${pendingSaveHost || '—'}:${pendingSavePort}.`;

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Impresora</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {scope?.storeLabel
            ? `Tickets del TPV en ${scope.storeLabel}.`
            : 'Impresora WiFi de tickets del TPV.'}
        </p>
      </header>

      {!isNative ? (
        <SettingsSection
          title="Usa la app en la tablet o el móvil"
          description="La impresora WiFi solo se configura desde la app instalada, no desde el navegador."
        >
          <div className="flex items-start gap-3">
            <Smartphone className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Abre Vertial en la tablet del local. En el TPV pulsa el icono de impresora, o ve a {IMPRESORA_SETTINGS_PATH}.
            </p>
          </div>
          {selectedHost && (
            <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
              IP guardada en este dispositivo: {selectedHost}
            </p>
          )}
        </SettingsSection>
      ) : (
        <>
          <SettingsSection
            title="1. Red local"
            description="iOS no muestra «Red local» en Ajustes hasta que Vertial lo pide. Sin Permitir, no imprime."
          >
            <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 px-4 py-3">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900 dark:text-blue-100 leading-relaxed">
                  <p className="font-semibold">Orden correcto</p>
                  <ol className="mt-2 space-y-1 list-decimal list-inside text-blue-800/90 dark:text-blue-200/90">
                    <li>Pulsa <strong>Pedir permiso de red local</strong> (sale el aviso de iOS → Permitir)</li>
                    <li>Opcional: <strong>Abrir Ajustes</strong> → Vertial → comprueba que «Red local» está ON</li>
                    <li>Marca la casilla de abajo y sigue con la IP</li>
                  </ol>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleRequestLanPermission()}
              disabled={requestingLan}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 min-h-[52px] rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-bold touch-manipulation active:opacity-80 disabled:opacity-60"
            >
              {requestingLan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Network className="w-4 h-4" />}
              {requestingLan ? 'Pidiendo permiso…' : 'Pedir permiso de red local'}
            </button>
            <button
              type="button"
              onClick={() => void handleOpenSettings()}
              disabled={requestingLan}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 text-sm font-bold touch-manipulation active:bg-gray-50 dark:active:bg-gray-700 disabled:opacity-60"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir Ajustes de Vertial
            </button>
            <label className="mt-4 flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3 cursor-pointer touch-manipulation">
              <input
                type="checkbox"
                checked={lanConfirmed}
                onChange={(e) => handleLanConfirmChange(e.target.checked)}
                className="mt-1 h-5 w-5 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
              />
              <span className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                <strong>Ya pulsé Permitir</strong> (o activé «Red local» en Ajustes → Vertial).
              </span>
            </label>
          </SettingsSection>

          <SettingsSection
            title="2. Datos de conexión (manual)"
            description={
              stepsUnlocked
                ? 'Pon IP y puerto a mano. Sin búsqueda automática.'
                : 'Completa el paso 1 antes de conectar.'
            }
            disabled={!stepsUnlocked}
          >
            {isConfigured && !hasUnsavedIp ? (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 px-4 py-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Impresora guardada</p>
                  <p className="text-sm text-emerald-800/90 dark:text-emerald-200/90 font-mono mt-0.5">
                    {selectedHost}:{selectedPort}
                  </p>
                </div>
              </div>
            ) : hasUnsavedIp ? (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 px-4 py-3">
                <CircleAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-sm text-amber-900 dark:text-amber-100">
                  Tienes cambios sin guardar. Pulsa «Guardar impresora».
                </p>
              </div>
            ) : (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 px-4 py-3">
                <CircleAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-sm text-amber-900 dark:text-amber-100">
                  IP del ticket SELF-TEST + puerto (HPRT suele ser 9100).
                </p>
              </div>
            )}
            <label className="block">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">IP</span>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  inputMode="text"
                  lang="en"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="192.168.1.20"
                  value={manualIp}
                  onChange={(e) => handleManualIpChange(e.target.value)}
                  className="min-w-0 flex-1 min-h-[52px] rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 text-lg font-semibold text-gray-900 dark:text-gray-100 font-mono"
                />
                <button
                  type="button"
                  onClick={handleInsertIpDot}
                  aria-label="Insertar punto"
                  className="shrink-0 min-h-[52px] min-w-[52px] rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-2xl font-bold text-gray-800 dark:text-gray-100 touch-manipulation active:bg-gray-100 dark:active:bg-gray-700"
                >
                  .
                </button>
              </div>
            </label>
            <label className="block mt-4">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Puerto</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="9100"
                value={String(manualPort)}
                onChange={(e) => handleManualPortChange(e.target.value)}
                className="mt-2 w-full min-h-[52px] rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 text-lg font-semibold text-gray-900 dark:text-gray-100 font-mono"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {PRINTER_PORT_OPTIONS.map((port) => (
                  <button
                    key={port}
                    type="button"
                    onClick={() => handleManualPortChange(String(port))}
                    className={`min-h-[40px] px-3 rounded-lg border text-sm font-bold font-mono touch-manipulation ${
                      manualPort === port
                        ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                        : 'border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100'
                    }`}
                  >
                    {port}
                  </button>
                ))}
              </div>
            </label>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Valores típicos: IP del ticket · puerto <strong>9100</strong> (ESC/POS). Alternativas: 9101, 9102. Epson ePOS a veces 8008/8043.
            </p>
            {(diagLoading || diagnostics) ? (
              <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3 text-xs text-gray-700 dark:text-gray-300 space-y-1.5">
                <p className="font-semibold text-gray-900 dark:text-gray-100">Estado de red en esta tablet</p>
                {diagLoading ? (
                  <p className="text-gray-500">Leyendo WiFi del dispositivo…</p>
                ) : diagnostics ? (
                  <>
                    <p>
                      Tablet:{' '}
                      {diagnostics.onWifi
                        ? <span className="font-mono">{diagnostics.deviceIp || '—'}</span>
                        : <span className="text-amber-700 dark:text-amber-300">Sin WiFi local detectada — conéctala a la red del local</span>}
                      {diagnostics.devicePrefix ? (
                        <span className="text-gray-500"> · red {diagnostics.devicePrefix}.x</span>
                      ) : null}
                    </p>
                    {isConfigured && diagnostics.sameSubnet === false && (
                      <p className="text-amber-800 dark:text-amber-200 font-medium">
                        La impresora ({selectedHost}) parece estar en otra subred que la tablet. Revisa que ambas usan la misma WiFi.
                      </p>
                    )}
                    {isConfigured && diagnostics.sameSubnet === true && (
                      <p className="text-emerald-800 dark:text-emerald-200">Tablet e impresora en la misma red WiFi.</p>
                    )}
                  </>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={refreshDiagnostics}
                disabled={diagLoading}
                className="mt-4 w-full min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 touch-manipulation"
              >
                Ver estado de red de la tablet
              </button>
            )}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleCheckConnection}
                disabled={pingingIp || !manualIp.trim()}
                className="w-full inline-flex items-center justify-center gap-2 min-h-[52px] rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 text-sm font-bold touch-manipulation active:bg-gray-50 dark:active:bg-gray-700 disabled:opacity-60"
              >
                {pingingIp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Network className="w-4 h-4" />}
                {pingingIp ? 'Comprobando…' : 'Comprobar conexión'}
              </button>
              <button
                type="button"
                onClick={handleRequestSave}
                disabled={savingIp || !manualIp.trim()}
                className="w-full inline-flex items-center justify-center gap-2 min-h-[52px] rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-bold touch-manipulation active:opacity-80 disabled:opacity-60"
              >
                {savingIp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                {savingIp ? 'Guardando…' : 'Guardar impresora'}
              </button>
            </div>
            {pingingIp ? (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                La comprobación puede fallar por la red; igual puedes pulsar «Guardar impresora» con la IP del ticket.
              </p>
            ) : null}
          </SettingsSection>

          <SettingsSection
            title="3. Probar ticket"
            description={stepsUnlocked ? 'Solo después de guardar la impresora en el paso 2.' : 'Completa los pasos 1 y 2 antes de probar.'}
            disabled={!stepsUnlocked}
          >
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testing || !canTest}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[52px] rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 text-sm font-bold touch-manipulation active:bg-gray-50 dark:active:bg-gray-700 disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              {testing ? 'Imprimiendo…' : 'Probar ticket'}
            </button>
            {!canTest && stepsUnlocked && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {hasUnsavedIp
                  ? 'Guarda la IP antes de imprimir la prueba.'
                  : 'Guarda primero la impresora en el paso 2.'}
              </p>
            )}
            {diagnostics?.ready && diagnostics.savedHost === readPrinterVerifiedHost() && (
              <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Ticket de prueba OK en {diagnostics.savedHost} — lista para el TPV.
              </p>
            )}
          </SettingsSection>

          {confirmSaveOpen && typeof document !== 'undefined' && createPortal(
            <div
              className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="printer-save-title"
            >
              <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-xl">
                <h3 id="printer-save-title" className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  ¿Guardar esta impresora?
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {confirmDescription}
                </p>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    disabled={savingIp}
                    onClick={() => {
                      if (savingIp) return;
                      setConfirmSaveOpen(false);
                      setPendingSaveHost('');
                      setPendingSavePort(9100);
                    }}
                    className="min-h-[44px] rounded-xl border-2 border-gray-300 dark:border-gray-600 px-4 text-sm font-bold text-gray-800 dark:text-gray-100 disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={savingIp}
                    onClick={handleConfirmSave}
                    className="min-h-[44px] rounded-xl bg-gray-900 dark:bg-gray-100 px-4 text-sm font-bold text-white dark:text-gray-900 disabled:opacity-60"
                  >
                    {savingIp ? 'Guardando…' : 'Sí, guardar'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}
