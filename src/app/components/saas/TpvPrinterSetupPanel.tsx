import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { toUserFacingMessage } from '../../lib/userFacingError';
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Loader2,
  Network,
  Printer,
  Shield,
  Smartphone,
} from 'lucide-react';
import { pointOfSaleDisplayLabel, listPointsOfSaleRequest, type PointOfSale } from '../../lib/deliveryApi';
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
  DEFAULT_PRINTER_CONFIG,
  DEFAULT_TICKET_BOTTOM_FEED_CM,
  MAX_TICKET_BOTTOM_FEED_CM,
  MIN_TICKET_BOTTOM_FEED_CM,
  clampTicketBottomFeedCm,
  loadLegacyPrinterConfig,
  loadPdvPrinterCache,
  cachePdvPrinterConfig,
  type VertialPrinterConfig,
} from '../../lib/vertialPrint/printerConfig';
import { normalizeVertialPrinterConfig } from '../../lib/vertialPrint/printerConfigNormalize';
import { isValidIpv4, sanitizeIpv4Input } from '../../lib/vertialPrint/printerSetupStatus';
import { savePrinterConfigToPdv } from '../../lib/vertialPrint/printerPdvSync';

const LAN_MANUAL_CONFIRM_KEY = 'vertial_lan_manual_confirmed_v1';

/** Empresa + sus tiendas (Ajustes → Impresora). */
export interface TpvPrinterStoreGroup {
  businessId: string;
  businessName: string;
  stores: PointOfSale[];
}

export interface TpvPrinterScope {
  userId: string;
  pdvId: string;
  pdv?: PointOfSale | null;
  terminalId?: string;
  storeLabel?: string;
  terminalLabel?: string;
  /** Tiendas visibles en el selector (TPV / Ajustes). */
  availableStores?: PointOfSale[];
  /** Si viene, se muestra por empresa (evita mezclar PDVs fantasma). */
  availableStoreGroups?: TpvPrinterStoreGroup[];
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

  // Con tienda elegida: SOLO config de esa tienda (servidor → caché PDV). Nunca pedir prestada la IP de otra.
  if (pdvId) {
    const fromStore = pdv?.printerConfig
      ? normalizeVertialPrinterConfig({
          ...DEFAULT_PRINTER_CONFIG,
          ...pdv.printerConfig,
          connectionType: 'network',
        })
      : null;
    if (fromStore && isValidIpv4(String(fromStore.networkHost || '').trim())) {
      return fromStore;
    }
    const cached = loadPdvPrinterCache(pdvId);
    if (cached && isValidIpv4(String(cached.networkHost || '').trim())) {
      return normalizeVertialPrinterConfig({ ...cached, connectionType: 'network' });
    }
    return normalizeVertialPrinterConfig({
      ...DEFAULT_PRINTER_CONFIG,
      connectionType: 'network',
      networkHost: '',
      networkPort: 9100,
      paperWidthMm: 80,
    });
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
      className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div className="mb-2.5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 leading-snug">{description}</p>
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
  const [manualBottomFeedCm, setManualBottomFeedCm] = useState(() =>
    clampTicketBottomFeedCm(initialConfig(scope).ticketBottomFeedCm),
  );
  const [ipDirty, setIpDirty] = useState(false);
  const [feedDirty, setFeedDirty] = useState(false);
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
  const savedBottomFeedCm = clampTicketBottomFeedCm(config.ticketBottomFeedCm);
  const hasUnsavedIp =
    ipDirty && (manualIp.trim() !== selectedHost || manualPort !== selectedPort);
  const hasUnsavedFeed = feedDirty && manualBottomFeedCm !== savedBottomFeedCm;
  const hasUnsavedChanges = hasUnsavedIp || hasUnsavedFeed;
  // IP siempre editable. Tras detectar red local (o si ya estaba concedida) se puede comprobar/probar.
  const canProbeNetwork = !isNative || lanConfirmed;
  const canTest = isConfigured && !hasUnsavedChanges && canProbeNetwork;

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
    setManualBottomFeedCm(clampTicketBottomFeedCm(next.ticketBottomFeedCm));
    setFeedDirty(false);
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
      ticketBottomFeedCm: clampTicketBottomFeedCm(manualBottomFeedCm),
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
      if (scope?.userId && pdvId) {
        try {
          let pdvDoc = pdv && pdv._id === pdvId ? pdv : null;
          if (!pdvDoc) {
            const list = await listPointsOfSaleRequest(scope.userId, {
              includeInactive: true,
              suppressLogout: true,
            });
            pdvDoc = list.find((p) => p._id === pdvId) || null;
          }
          if (!pdvDoc) {
            throw new Error('No se encontró la tienda para guardar la impresora');
          }
          const saved = await savePrinterConfigToPdv(scope.userId, pdvDoc, next, 'store', undefined, {
            suppressLogout: true,
          });
          syncActiveScope(next, saved);
          scope.onPdvUpdated?.(saved);
          syncedToStore = true;
        } catch (error) {
          const message = toUserFacingMessage(error, 'sin conexión con la tienda');
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
      setManualBottomFeedCm(clampTicketBottomFeedCm(next.ticketBottomFeedCm));
      ipDirtyRef.current = false;
      setIpDirty(false);
      setFeedDirty(false);
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
  }, [config, manualBottomFeedCm, pdv, scope, syncActiveScope, refreshDiagnostics]);

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
    if (hasUnsavedChanges) {
      toast.error('Guarda primero los cambios (IP o blanco del ticket) antes de probar.');
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
      toast.error(toUserFacingMessage(error, 'No se pudo imprimir la prueba'), { duration: 8000 });
    } finally {
      setTesting(false);
    }
  }, [hasUnsavedChanges, isConfigured, refreshDiagnostics, scope?.pdv, scope?.terminalId, canProbeNetwork]);

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

  const storeGroups = (scope?.availableStoreGroups || []).filter((g) => g.businessId);
  const stores = (
    storeGroups.length > 0
      ? storeGroups.flatMap((g) => g.stores)
      : scope?.availableStores || []
  ).filter((p) => p.active !== false);
  const selectedStoreId = String(pdv?._id || scope?.pdvId || '').trim();
  const storeFromList = stores.find((p) => p._id === selectedStoreId);
  const selectedStoreLabel =
    scope?.storeLabel
    || (pdv ? pointOfSaleDisplayLabel(pdv) : '')
    || (storeFromList ? pointOfSaleDisplayLabel(storeFromList) : '');

  const selectedBusinessId = useMemo(() => {
    if (!selectedStoreId) return storeGroups[0]?.businessId || '';
    const hit = storeGroups.find((g) =>
      g.stores.some((s) => s._id === selectedStoreId && s.active !== false),
    );
    return hit?.businessId || storeGroups[0]?.businessId || '';
  }, [selectedStoreId, storeGroups]);

  const [expandedBusinessId, setExpandedBusinessId] = useState('');
  useEffect(() => {
    if (!storeGroups.length) {
      setExpandedBusinessId('');
      return;
    }
    setExpandedBusinessId((prev) => {
      if (prev && storeGroups.some((g) => g.businessId === prev)) return prev;
      return selectedBusinessId || storeGroups[0].businessId;
    });
  }, [storeGroups, selectedBusinessId]);

  const handleStoreChange = useCallback(
    (pdvId: string) => {
      const id = String(pdvId || '').trim();
      if (!id || id === selectedStoreId) return;
      ipDirtyRef.current = false;
      setIpDirty(false);
      setFeedDirty(false);
      scope?.onStoreSelect?.(id);
    },
    [scope, selectedStoreId],
  );

  const renderStoreButton = (store: PointOfSale) => {
    const selected = store._id === (selectedStoreId || stores[0]?._id);
    return (
      <button
        key={store._id}
        type="button"
        onClick={() => handleStoreChange(store._id)}
        className={`h-8 w-full px-2.5 rounded-lg text-xs font-semibold touch-manipulation transition-colors text-left truncate ${
          selected
            ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
            : 'border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-gray-900'
        }`}
      >
        {pointOfSaleDisplayLabel(store)}
      </button>
    );
  };

  return (
    <div className="space-y-3 max-w-3xl">
      <header>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Impresora</h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {selectedStoreLabel
            ? `Tienda «${selectedStoreLabel}».`
            : 'Impresora WiFi de tickets del TPV.'}
        </p>
      </header>

      {storeGroups.length > 0 ? (
        <SettingsSection
          title="Empresa y tienda"
          description="Elige empresa y tienda. La IP se guarda solo en esa tienda."
        >
          <div className="space-y-1.5">
            {storeGroups.map((group) => {
              const activeStores = group.stores.filter((p) => p.active !== false);
              const expanded = expandedBusinessId === group.businessId;
              const hasSelected = activeStores.some((s) => s._id === selectedStoreId);
              return (
                <div
                  key={group.businessId}
                  className={`rounded-lg border overflow-hidden ${
                    hasSelected || expanded
                      ? 'border-gray-300 dark:border-gray-600'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedBusinessId((prev) =>
                        prev === group.businessId ? '' : group.businessId,
                      )
                    }
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left touch-manipulation hover:bg-gray-50 dark:hover:bg-gray-800/60"
                    aria-expanded={expanded}
                  >
                    <div className="min-w-0 flex items-baseline gap-2">
                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {group.businessName}
                      </p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
                        {activeStores.length === 0
                          ? 'Sin tiendas'
                          : `${activeStores.length} tienda${activeStores.length === 1 ? '' : 's'}`}
                        {hasSelected ? ' · sel.' : ''}
                      </p>
                    </div>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${
                        expanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {expanded && (
                    <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/40 px-2 py-1.5 space-y-1">
                      {activeStores.length > 0 ? (
                        activeStores.map((store) => renderStoreButton(store))
                      ) : (
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 px-0.5">
                          Sin tiendas. Créala en Ajustes → Empresa → Tienda.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SettingsSection>
      ) : stores.length > 0 ? (
        <SettingsSection
          title="Tienda"
          description="Pulsa la tienda. La IP se guarda solo en esa."
        >
          <div className="flex flex-col gap-1">
            {stores.map((store) => renderStoreButton(store))}
          </div>
        </SettingsSection>
      ) : null}

      {isNative ? (
        <SettingsSection
          title="1. Red local"
          description="Si ya diste Permitir en iOS, la app lo detecta sola. Puedes escribir la IP abajo sin pulsar nada."
        >
          {lanConfirmed ? (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 px-2.5 py-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900 dark:text-emerald-100 leading-snug">
                  <p className="font-semibold">Red local lista</p>
                  <p className="mt-0.5 text-emerald-800/90 dark:text-emerald-200/90">
                    Puedes poner la IP y guardar. Si no imprime, revisa Ajustes → Vertial → Red local.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 px-2.5 py-2">
              <div className="flex items-start gap-2">
                {lanDetecting || requestingLan ? (
                  <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 animate-spin" />
                ) : (
                  <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                )}
                <div className="text-xs text-blue-900 dark:text-blue-100 leading-snug">
                  <p className="font-semibold">
                    {lanDetecting || requestingLan ? 'Detectando permiso de red…' : 'Activando acceso a la WiFi del local'}
                  </p>
                  <p className="mt-0.5 text-blue-800/90 dark:text-blue-200/90">
                    Mientras tanto ya puedes escribir la IP abajo. Si iOS muestra un aviso, pulsa Permitir.
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="mt-2 flex flex-col gap-1.5 sm:flex-row">
            <button
              type="button"
              onClick={() => void handleRequestLanPermission()}
              disabled={requestingLan || lanDetecting}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 text-xs font-semibold touch-manipulation active:bg-gray-50 dark:active:bg-gray-700 disabled:opacity-60"
            >
              {requestingLan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Network className="w-3.5 h-3.5" />}
              {requestingLan ? 'Pidiendo…' : 'Volver a pedir permiso'}
            </button>
            <button
              type="button"
              onClick={() => void handleOpenSettings()}
              disabled={requestingLan || lanDetecting}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 text-xs font-semibold touch-manipulation active:bg-gray-50 dark:active:bg-gray-700 disabled:opacity-60"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir Ajustes
            </button>
          </div>
        </SettingsSection>
      ) : (
        <SettingsSection
          title="Tablet / móvil"
          description={`Para imprimir y probar el ticket usa la app en la tablet (${IMPRESORA_SETTINGS_PATH}). Aquí puedes guardar la IP de la tienda.`}
        >
          <div className="flex items-start gap-2">
            <Smartphone className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-snug">
              Guarda la IP por tienda abajo. La prueba de impresión WiFi sale mejor desde la tablet del local.
            </p>
          </div>
        </SettingsSection>
      )}

      <SettingsSection
        title={isNative ? '2. IP y puerto' : 'IP y puerto'}
        description="Se guardan en la tienda seleccionada arriba (no se mezclan con otras tiendas)."
      >
            {isConfigured && !hasUnsavedChanges ? (
              <div className="mb-2.5 flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 px-2.5 py-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">Impresora guardada</p>
                  <p className="text-xs text-emerald-800/90 dark:text-emerald-200/90 font-mono">
                    {selectedHost}:{selectedPort} · abajo {savedBottomFeedCm} cm
                  </p>
                </div>
              </div>
            ) : hasUnsavedChanges ? (
              <div className="mb-2.5 flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 px-2.5 py-1.5">
                <CircleAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-xs text-amber-900 dark:text-amber-100">
                  Cambios sin guardar. Pulsa «Guardar impresora».
                </p>
              </div>
            ) : (
              <div className="mb-2.5 flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 px-2.5 py-1.5">
                <CircleAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-xs text-amber-900 dark:text-amber-100">
                  HPRT: IP del ticket SELF-TEST y puerto <strong>9100</strong>.
                </p>
              </div>
            )}
            <label className="block">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                IP
              </span>
              <div className="mt-1 flex gap-1.5">
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
                  className="min-w-0 flex-1 h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 font-mono"
                />
                <button
                  type="button"
                  onClick={handleInsertIpDot}
                  aria-label="Insertar punto"
                  className="shrink-0 h-9 w-9 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-lg font-bold text-gray-800 dark:text-gray-100 touch-manipulation active:bg-gray-100 dark:active:bg-gray-700"
                >
                  .
                </button>
              </div>
            </label>
            <label className="block mt-2.5">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Puerto
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="9100"
                value={String(manualPort)}
                onChange={(e) => handleManualPortChange(e.target.value)}
                className="mt-1 w-full h-9 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 font-mono"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PRINTER_PORT_OPTIONS.map((port) => (
                  <button
                    key={port}
                    type="button"
                    onClick={() => handleManualPortChange(String(port))}
                    className={`h-8 px-2.5 rounded-lg border text-xs font-semibold font-mono touch-manipulation ${
                      manualPort === port
                        ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                        : 'border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100'
                    }`}
                  >
                    {port}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                Por defecto <strong>9100</strong>. Si no conecta, prueba 9101 o 9102.
              </p>
            </label>
            <label className="block mt-2.5">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Blanco abajo del ticket (cm)
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={MIN_TICKET_BOTTOM_FEED_CM}
                max={MAX_TICKET_BOTTOM_FEED_CM}
                step={1}
                autoComplete="off"
                value={manualBottomFeedCm}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setManualBottomFeedCm(DEFAULT_TICKET_BOTTOM_FEED_CM);
                    setFeedDirty(true);
                    return;
                  }
                  setManualBottomFeedCm(clampTicketBottomFeedCm(Number(raw)));
                  setFeedDirty(true);
                }}
                className="mt-1 w-full h-9 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 font-mono"
              />
              <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                Solo ticket cliente/delivery. Rango {MIN_TICKET_BOTTOM_FEED_CM}–{MAX_TICKET_BOTTOM_FEED_CM} cm
                (por defecto {DEFAULT_TICKET_BOTTOM_FEED_CM}). Cocina sigue en 6 cm. Guarda y prueba.
              </p>
            </label>
            {isNative && (diagLoading || diagnostics) ? (
              <div className="mt-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-2.5 py-2 text-[11px] text-gray-700 dark:text-gray-300 space-y-1">
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
            ) : isNative ? (
              <button
                type="button"
                onClick={refreshDiagnostics}
                disabled={diagLoading}
                className="mt-2.5 w-full h-8 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-700 dark:text-gray-300 touch-manipulation"
              >
                Ver estado de red de la tablet
              </button>
            ) : null}
            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={handleCheckConnection}
                disabled={pingingIp || !manualIp.trim() || !canProbeNetwork}
                className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 text-xs font-semibold touch-manipulation active:bg-gray-50 dark:active:bg-gray-700 disabled:opacity-60"
              >
                {pingingIp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Network className="w-3.5 h-3.5" />}
                {pingingIp ? 'Comprobando…' : 'Comprobar conexión'}
              </button>
              <button
                type="button"
                onClick={handleRequestSave}
                disabled={savingIp || !manualIp.trim()}
                className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-semibold touch-manipulation active:opacity-80 disabled:opacity-60"
              >
                {savingIp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                {savingIp ? 'Guardando…' : 'Guardar impresora'}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400 font-mono">
              Se guardará: {(manualIp.trim() || '—')}:{manualPort}
            </p>
            {pingingIp ? (
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                La comprobación puede fallar por la red; igual puedes pulsar «Guardar impresora» con la IP del ticket.
              </p>
            ) : null}
          </SettingsSection>

          <SettingsSection
            title={isNative ? '3. Probar ticket' : 'Probar ticket'}
            description={
              isNative
                ? (canProbeNetwork
                  ? 'Solo después de guardar la impresora.'
                  : 'Guarda la IP. Para la prueba, confirma también Red local.')
                : 'Mejor desde la tablet del local (misma WiFi que la impresora).'
            }
            disabled={false}
          >
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testing || !canTest}
              className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 text-xs font-semibold touch-manipulation active:bg-gray-50 dark:active:bg-gray-700 disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              {testing ? 'Imprimiendo…' : 'Probar ticket'}
            </button>
            {!canTest && canProbeNetwork && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {hasUnsavedChanges
                  ? 'Guarda la IP / blanco del ticket antes de imprimir la prueba.'
                  : 'Guarda primero la impresora.'}
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
    </div>
  );
}
