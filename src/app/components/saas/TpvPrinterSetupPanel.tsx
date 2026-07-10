import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { PointOfSale } from '../../lib/deliveryApi';
import {
  isVertialNativeApp,
  loadLegacyPrinterConfig,
  resolveEffectivePrinterConfig,
  savePrinterConfig,
  type VertialPrinterConfig,
} from '../../lib/vertialPrint';
import { savePrinterConfigToPdv, type PrinterConfigTarget } from '../../lib/vertialPrint/printerPdvSync';
import { isVertialPrinterConfigConfigured, normalizeVertialPrinterConfig } from '../../lib/vertialPrint/printerConfigNormalize';
import { NativePrinterSetupPanel } from './NativePrinterSetupPanel';
import { WebPrinterSetupPanel } from './WebPrinterSetupPanel';

export interface TpvPrinterScope {
  userId: string;
  pdvId: string;
  pdv?: PointOfSale | null;
  terminalId?: string;
  storeLabel?: string;
  terminalLabel?: string;
  onPdvUpdated?: (pdv: PointOfSale) => void;
}

function initialConfig(scope?: TpvPrinterScope): VertialPrinterConfig {
  const raw = scope?.pdv
    ? resolveEffectivePrinterConfig({
        pdv: scope.pdv,
        terminalId: scope.terminalId,
        localFallback: loadLegacyPrinterConfig(),
      })
    : loadLegacyPrinterConfig();
  // El panel TPV solo configura impresora WiFi; evitar quedarse en «browser» sin IP.
  const cfg = raw.connectionType === 'browser' && !raw.networkHost
    ? { ...raw, connectionType: 'network' as const }
    : raw;
  return normalizeVertialPrinterConfig(cfg);
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
  const [saveTarget, setSaveTarget] = useState<PrinterConfigTarget>('store');
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const pendingConfigRef = useRef<VertialPrinterConfig | null>(null);

  const isNativeApp = isVertialNativeApp();
  const canPersistToStore = Boolean(scope?.userId && scope?.pdvId && pdv?._id);
  const storeLabel = scope?.storeLabel?.trim() || 'toda la tienda';

  const terminalHasOverride = useMemo(() => {
    if (!scope?.terminalId || !pdv) return false;
    const term = pdv.terminals.find((t) => t.id === scope.terminalId);
    return Boolean(term?.printerConfig && isVertialPrinterConfigConfigured(normalizeVertialPrinterConfig(term.printerConfig)));
  }, [pdv, scope?.terminalId]);

  useEffect(() => {
    setPdv(scope?.pdv);
    const next = initialConfig(scope);
    setConfig(next);
    setSaveTarget(scope?.terminalId && terminalHasOverride ? 'terminal' : 'store');
  }, [scope?.pdv?._id, scope?.pdv?._rev, scope?.pdvId, scope?.terminalId, terminalHasOverride]);

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

  const handleConfigChange = useCallback((next: VertialPrinterConfig) => {
    setConfig(next);
    savePrinterConfig(next);
    if (canPersistToStore) schedulePersist(next, saveTarget);
  }, [canPersistToStore, saveTarget, schedulePersist]);

  const sharedProps = {
    variant,
    onClose,
    config,
    onConfigChange: handleConfigChange,
    onPersist: persistToStore,
    saveTarget,
    canPersistToStore,
    storeLabel,
    saving,
    scope,
  };

  if (isNativeApp) {
    return <NativePrinterSetupPanel {...sharedProps} />;
  }

  return <WebPrinterSetupPanel {...sharedProps} />;
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
