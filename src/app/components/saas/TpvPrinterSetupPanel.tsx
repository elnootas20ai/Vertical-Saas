import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { CheckCircle2, CircleAlert, ExternalLink, Loader2, Network, Printer, Shield, Smartphone } from 'lucide-react';
import { pointOfSaleDisplayLabel, type PointOfSale } from '../../lib/deliveryApi';
import { IMPRESORA_SETTINGS_PATH } from '../../lib/vertialPrint/nativePrinterFlow';
import { isVertialNativeApp } from '../../lib/vertialPrint/isNativeApp';
import {
  ensureNativeLocalNetworkReady,
  isLocalNetworkFlowReady,
  markLocalNetworkReady,
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
import {
  loadLegacyPrinterConfig,
  loadPdvPrinterCache,
  cachePdvPrinterConfig,
  type VertialPrinterConfig,
} from '../../lib/vertialPrint/printerConfig';
import { normalizeVertialPrinterConfig } from '../../lib/vertialPrint/printerConfigNormalize';
import { isValidIpv4, sanitizeIpv4Input } from '../../lib/vertialPrint/printerSetupStatus';
import { savePrinterConfigToPdv } from '../../lib/vertialPrint/printerPdvSync';

const LAN_MANUAL_CONFIRM_KEY = 'vertial_lan_manual_confirmed_v1';

export interface TpvPrinterScope {
  userId: string;
  pdvId: string;
  pdv?: PointOfSale | null;
  terminalId?: string;
  storeLabel?: string;
  terminalLabel?: string;
  /** Tiendas visibles en el selector (TPV / Ajustes). */
  availableStores?: PointOfSale[];
  onStoreSelect?: (pdvId: string) => void;
  onPdvUpdated?: (pdv: PointOfSale) => void;
}

function readLanManualConfirmed(): boolean {
  try {
    if (localStorage.getItem(LAN_MANUAL_CONFIRM_KEY) === '1') return true;
  } catch {
    /* ignore */
  }
  return isLocalNetworkFlowReady();
}

function writeLanManualConfirmed(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(LAN_MANUAL_CONFIRM_KEY, '1');
      markLocalNetworkReady();
    } else {
      localStorage.removeItem(LAN_MANUAL_CONFIRM_KEY);
    }
  } catch {
    /* ignore */
  }
}

function initialConfig(scope?: TpvPrinterScope): VertialPrinterConfig {
  const local = loadLegacyPrinterConfig();
  const pdv = scope?.pdv;
  const pdvId = String(pdv?._id || scope?.pdvId || '').trim();

  // En el panel de ajustes: priorizar lo de ESTA tienda (servidor → caché local por PDV).
  if (pdvId) {
    const fromStore = pdv?.printerConfig
      ? normalizeVertialPrinterConfig({ ...pdv.printerConfig, connectionType: 'network' })
      : null;
    if (fromStore && isValidIpv4(String(fromStore.networkHost || '').trim())) {
      return fromStore;
    }
    const cached = loadPdvPrinterCache(pdvId);
    if (cached && isValidIpv4(String(cached.networkHost || '').trim())) {
      return normalizeVertialPrinterConfig({ ...cached, connectionType: 'network' });
    }
  }

  const raw = pdv
    ? resolveEffectivePrinterConfig({
        pdv,
        terminalId: scope?.terminalId,
        localFallback: local,
      })
    : local;
  const normalized = normalizeVertialPrinterConfig({ ...raw, connectionType: 'network' });
  const host = String(normalized.networkHost || '').trim();
  const localHost = String(local.networkHost || '').trim();
  // No pisar una IP ya guardada en el dispositivo con un PDV vacío / sin config.
  if (!isValidIpv4(host) && isValidIpv4(localHost)) {
    return normalizeVertialPrinterConfig({
      ...local,
      connectionType: 'network',
      networkHost: localHost,
      networkPort: Number(local.networkPort || 9100) || 9100,
    });
  }
  return normalized;
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
  const [lanDetecting, setLanDetecting] = useState(false);
  const [diagnostics, setDiagnostics] = useState<NativePrinterDiagnostics | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [requestingLan, setRequestingLan] = useState(false);

  const isNative = isVertialNativeApp();
  const selectedHost = String(config.networkHost || '').trim();
  const selectedPort = Number(config.networkPort || 9100) || 9100;
  const isConfigured = isValidIpv4(selectedHost);
  const hasUnsavedIp =
    ipDirty && (manualIp.trim() !== selectedHost || manualPort !== selectedPort);
  // IP siempre editable. Tras detectar red local (o si ya estaba concedida) se puede comprobar/probar.
  const canProbeNetwork = !isNative || lanConfirmed;
  const canTest = isConfigured && !hasUnsavedIp && canProbeNetwork;

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

  /** Si ya diste «Permitir» en iOS, no hace falta el botón: lo detectamos al abrir. */
  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    // Desbloquear IP / prueba de inmediato; el probe nativo corre en segundo plano.
    writeLanManualConfirmed(true);
    setLanConfirmed(true);
    setLanDetecting(true);
    void (async () => {
      try {
        await ensureNativeLocalNetworkReady({
          printerIp: manualIp.trim() || selectedHost || undefined,
        });
        if (cancelled) return;
        refreshDiagnostics();
      } catch {
        /* Ya desbloqueado arriba */
      } finally {
        if (!cancelled) setLanDetecting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Solo al montar el panel nativo.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-once
  }, [isNative]);

  useEffect(() => {
    setPdv(scope?.pdv);
    if (ipDirtyRef.current) return;
    const next = initialConfig(scope);
    setConfig(next);
    setManualIp(String(next.networkHost || '').trim());
    setManualPort(Number(next.networkPort || 9100) || 9100);
  }, [scope?.pdv?._id, scope?.pdv?._rev, scope?.pdvId, scope?.terminalId]);

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

  const commitSave = useCallback(async (host: string, port: number) => {
    const safePort = sanitizePortInput(String(port));
    const next = normalizeVertialPrinterConfig({
      ...config,
      connectionType: 'network',
      networkHost: host,
      networkPort: safePort,
      paperWidthMm: 80,
    });

    const pdvId = String(pdv?._id || scope?.pdvId || '').trim();
    const storeLabel = pdv ? pointOfSaleDisplayLabel(pdv) : '';

    setSavingIp(true);
    try {
      // 1) Dispositivo + caché por tienda (siempre)
      if (pdvId) {
        setActivePrinterScope({
          pdvId,
          pdv: pdv ? { ...pdv, printerConfig: next } : undefined,
          terminalId: scope?.terminalId,
        });
      }
      try {
        savePrinterConfig(next, pdvId || undefined);
        if (pdvId) cachePdvPrinterConfig(pdvId, next);
      } catch {
        toast.error('No se pudo guardar la impresora en este dispositivo. Inténtalo de nuevo.');
        return;
      }

      const legacyHost = String(loadLegacyPrinterConfig().networkHost || '').trim();
      const cacheHost = pdvId
        ? String(loadPdvPrinterCache(pdvId)?.networkHost || '').trim()
        : '';
      if (legacyHost !== host && cacheHost !== host) {
        toast.error('IP o puerto no quedaron guardados. Inténtalo de nuevo.');
        return;
      }

      // 2) Misma tienda en servidor (Ajustes / Panel / otras tablets)
      let syncedToStore = false;
      if (scope?.userId && pdv?._id) {
        try {
          const saved = await savePrinterConfigToPdv(scope.userId, pdv, next, 'store', undefined, {
            suppressLogout: true,
          });
          syncActiveScope(next, saved);
          scope.onPdvUpdated?.(saved);
          syncedToStore = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Error de red';
          toast.warning(`Guardada en esta tablet, pero no llegó a la tienda: ${message}`, {
            duration: 10000,
            description: 'Reintenta «Guardar» o guárdala también en Ajustes → Impresora.',
          });
        }
      } else if (!pdvId) {
        toast.warning('Guardada en esta tablet. Elige una tienda para sincronizarla fuera del TPV.');
      }

      setConfig(next);
      setManualIp(host);
      setManualPort(safePort);
      ipDirtyRef.current = false;
      setIpDirty(false);
      clearPrinterVerifiedHost();
      toast.success(
        syncedToStore
          ? `Impresora guardada en «${storeLabel}»: ${host}:${safePort}`
          : `Impresora guardada en esta tablet: ${host}:${safePort}`,
        {
          description: syncedToStore
            ? 'Queda en el TPV y también en Ajustes / Panel de esa misma tienda.'
            : 'Sirve en este dispositivo. Si quieres verla fuera, vuelve a pulsar Guardar con la tienda seleccionada.',
          duration: 7000,
        },
      );
      refreshDiagnostics();
    } finally {
      setSavingIp(false);
      setConfirmSaveOpen(false);
      setPendingSaveHost('');
      setPendingSavePort(9100);
    }
  }, [config, pdv, scope, syncActiveScope, refreshDiagnostics]);

  const handleRequestSave = useCallback(() => {
    const host = manualIp.trim();
    if (!isValidIpv4(host)) {
      toast.error('Escribe una IP válida, por ejemplo 192.168.1.20');
      return;
    }
    setPendingSaveHost(host);
    setPendingSavePort(sanitizePortInput(String(manualPort)));
    setConfirmSaveOpen(true);
  }, [manualIp, manualPort]);

  const handleConfirmSave = useCallback(() => {
    const host = pendingSaveHost.trim();
    if (!isValidIpv4(host)) {
      setConfirmSaveOpen(false);
      setPendingSaveHost('');
      toast.error('La IP ya no es válida. Revísala e inténtalo de nuevo.');
      return;
    }
    void commitSave(host, pendingSavePort);
  }, [commitSave, pendingSaveHost, pendingSavePort]);

  const handleCheckConnection = useCallback(() => {
    if (!canProbeNetwork) {
      toast.error('Espera un segundo a que se active la red local, o pulsa «Volver a pedir permiso».');
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
  }, [manualIp, manualPort, canProbeNetwork, refreshDiagnostics]);

  const handleRequestLanPermission = useCallback(async () => {
    if (!isNative) return;
    setRequestingLan(true);
    try {
      await ensureNativeLocalNetworkReady({
        printerIp: manualIp.trim() || selectedHost || '192.168.1.20',
      });
      writeLanManualConfirmed(true);
      setLanConfirmed(true);
      refreshDiagnostics();
      toast.success('Red local lista. Ya puedes poner la IP y probar.', { duration: 6000 });
    } catch {
      writeLanManualConfirmed(true);
      setLanConfirmed(true);
      toast.message('Si iOS muestra el aviso, pulsa Permitir. Luego debería aparecer «Red local» en Ajustes → Vertial.', {
        duration: 10000,
      });
    } finally {
      setRequestingLan(false);
    }
  }, [isNative, manualIp, selectedHost, refreshDiagnostics]);

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
    if (!canProbeNetwork) {
      toast.error('Espera un segundo a que se active la red local, o pulsa «Volver a pedir permiso».');
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
  }, [hasUnsavedIp, isConfigured, refreshDiagnostics, scope?.pdv, scope?.terminalId, canProbeNetwork]);

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

  const stores = (scope?.availableStores || []).filter((p) => p.active !== false);
  const selectedStoreId = String(pdv?._id || scope?.pdvId || '').trim();
  const storeFromList = stores.find((p) => p._id === selectedStoreId);
  const selectedStoreLabel =
    scope?.storeLabel
    || (pdv ? pointOfSaleDisplayLabel(pdv) : '')
    || (storeFromList ? pointOfSaleDisplayLabel(storeFromList) : '');

  const handleStoreChange = useCallback(
    (pdvId: string) => {
      const id = String(pdvId || '').trim();
      if (!id || id === selectedStoreId) return;
      ipDirtyRef.current = false;
      setIpDirty(false);
      scope?.onStoreSelect?.(id);
    },
    [scope, selectedStoreId],
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Impresora</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {selectedStoreLabel
            ? `Configuras la impresora de la tienda «${selectedStoreLabel}».`
            : 'Impresora WiFi de tickets del TPV.'}
        </p>
      </header>

      {stores.length > 0 ? (
        <SettingsSection
          title="Tienda"
          description={
            stores.length > 1
              ? 'Elige la tienda. La IP se guarda en este dispositivo y en esa tienda.'
              : 'Tienda a la que se asocia esta impresora.'
          }
        >
          {stores.length === 1 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {pointOfSaleDisplayLabel(stores[0])}
              </p>
            </div>
          ) : (
            <label className="block">
              <span className="sr-only">Tienda</span>
              <select
                value={selectedStoreId || stores[0]?._id || ''}
                onChange={(e) => handleStoreChange(e.target.value)}
                className="w-full min-h-[52px] rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 text-sm font-semibold text-gray-900 dark:text-gray-100 touch-manipulation"
              >
                {stores.map((store) => (
                  <option key={store._id} value={store._id}>
                    {pointOfSaleDisplayLabel(store)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </SettingsSection>
      ) : null}

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
            <p className="mt-3 text-xs text-gray-400 dark:text-gray-500 font-mono">
              Guardada en este dispositivo: {selectedHost}:{selectedPort}
            </p>
          )}
        </SettingsSection>
      ) : (
        <>
          <SettingsSection
            title="1. Red local"
            description="Si ya diste Permitir en iOS, la app lo detecta sola. Puedes escribir la IP abajo sin pulsar nada."
          >
            {lanConfirmed ? (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 px-4 py-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-sm text-emerald-900 dark:text-emerald-100 leading-relaxed">
                    <p className="font-semibold">Red local lista</p>
                    <p className="mt-1 text-emerald-800/90 dark:text-emerald-200/90">
                      Puedes poner la IP y guardar. Si no imprime, revisa Ajustes → Vertial → Red local.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 px-4 py-3">
                <div className="flex items-start gap-3">
                  {lanDetecting || requestingLan ? (
                    <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 animate-spin" />
                  ) : (
                    <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  )}
                  <div className="text-sm text-blue-900 dark:text-blue-100 leading-relaxed">
                    <p className="font-semibold">
                      {lanDetecting || requestingLan ? 'Detectando permiso de red…' : 'Activando acceso a la WiFi del local'}
                    </p>
                    <p className="mt-1 text-blue-800/90 dark:text-blue-200/90">
                      Mientras tanto ya puedes escribir la IP abajo. Si iOS muestra un aviso, pulsa Permitir.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleRequestLanPermission()}
                disabled={requestingLan || lanDetecting}
                className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 text-sm font-bold touch-manipulation active:bg-gray-50 dark:active:bg-gray-700 disabled:opacity-60"
              >
                {requestingLan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Network className="w-4 h-4" />}
                {requestingLan ? 'Pidiendo…' : 'Volver a pedir permiso'}
              </button>
              <button
                type="button"
                onClick={() => void handleOpenSettings()}
                disabled={requestingLan || lanDetecting}
                className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 text-sm font-bold touch-manipulation active:bg-gray-50 dark:active:bg-gray-700 disabled:opacity-60"
              >
                <ExternalLink className="w-4 h-4" />
                Abrir Ajustes
              </button>
            </div>
          </SettingsSection>

          <SettingsSection
            title="2. IP y puerto"
            description="Guárdalos y quedan en este dispositivo hasta que los cambies."
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
                  Cambios sin guardar. Pulsa «Guardar impresora».
                </p>
              </div>
            ) : (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 px-4 py-3">
                <CircleAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-sm text-amber-900 dark:text-amber-100">
                  HPRT: IP del ticket SELF-TEST y puerto <strong>9100</strong>.
                </p>
              </div>
            )}
            <label className="block">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                IP
              </span>
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
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Puerto
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="9100"
                value={String(manualPort)}
                onChange={(e) => handleManualPortChange(e.target.value)}
                className="mt-2 w-full min-h-[52px] rounded-xl border-2 border-gray-900 dark:border-gray-100 bg-white dark:bg-gray-900 px-4 text-lg font-semibold text-gray-900 dark:text-gray-100 font-mono"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {PRINTER_PORT_OPTIONS.map((port) => (
                  <button
                    key={port}
                    type="button"
                    onClick={() => handleManualPortChange(String(port))}
                    className={`min-h-[44px] px-4 rounded-xl border-2 text-sm font-bold font-mono touch-manipulation ${
                      manualPort === port
                        ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                        : 'border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100'
                    }`}
                  >
                    {port}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Por defecto <strong>9100</strong> (casi todas las térmicas ESC/POS). Si no conecta, prueba 9101 o 9102.
              </p>
            </label>
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
                disabled={pingingIp || !manualIp.trim() || !canProbeNetwork}
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
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 font-mono">
              Se guardará: {(manualIp.trim() || '—')}:{manualPort}
            </p>
            {pingingIp ? (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                La comprobación puede fallar por la red; igual puedes pulsar «Guardar impresora» con la IP del ticket.
              </p>
            ) : null}
          </SettingsSection>

          <SettingsSection
            title="3. Probar ticket"
            description={
              canProbeNetwork
                ? 'Solo después de guardar la impresora en el paso 2.'
                : 'Guarda la IP en el paso 2. Para la prueba, confirma también Red local (paso 1).'
            }
            disabled={false}
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
            {!canTest && canProbeNetwork && (
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
