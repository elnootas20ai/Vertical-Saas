import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Scale, PlugZap, Unplug, RotateCcw, Target,
  Check, AlertTriangle, Loader2, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import type { WeighUnit } from '../../lib/deliveryApi';
import type { UseScaleReturn, ScaleStatus } from '../../hooks/useScale';

export type ScaleWidgetMode = 'card' | 'inline' | 'compact';
type CaptureMode = 'automatic' | 'manual';

interface ScaleWeightWidgetProps {
  scale: UseScaleReturn;
  onWeightAccepted?: (weight: number, unit: WeighUnit) => void;
  mode?: ScaleWidgetMode;
  showManualFallback?: boolean;
}

const STATUS_CONFIG: Record<ScaleStatus, { label: string; dot: string; bg: string }> = {
  disconnected: { label: 'Desconectada', dot: 'bg-gray-400', bg: 'bg-gray-50 dark:bg-gray-800' },
  connecting: { label: 'Conectando...', dot: 'bg-amber-400 animate-pulse', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  connected: { label: 'Conectada', dot: 'bg-green-500', bg: 'bg-white dark:bg-gray-900' },
  reading: { label: 'Leyendo', dot: 'bg-green-500', bg: 'bg-white dark:bg-gray-900' },
  error: { label: 'Error', dot: 'bg-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
};

function formatWeight(weight: number, precision: number, unit: WeighUnit): string {
  if (weight === 0 && precision > 0) return `0.${'0'.repeat(precision)}`;
  return weight.toFixed(precision);
}

export function ScaleWeightWidget({
  scale,
  onWeightAccepted,
  mode = 'card',
  showManualFallback = true,
}: ScaleWeightWidgetProps) {
  const [captureMode, setCaptureMode] = useState<CaptureMode>(() => {
    return (localStorage.getItem('scale_capture_mode') as CaptureMode) || 'manual';
  });
  const [manualWeight, setManualWeight] = useState('');
  const [useManual, setUseManual] = useState(false);
  const acceptedRef = useRef(false);

  const precision = scale.scaleDevice?.weighing.precision ?? 3;
  const unit = scale.currentUnit || (scale.scaleDevice?.weighing.unit as WeighUnit) || 'kg';
  const statusCfg = STATUS_CONFIG[scale.status] || STATUS_CONFIG.disconnected;

  useEffect(() => {
    localStorage.setItem('scale_capture_mode', captureMode);
  }, [captureMode]);

  useEffect(() => {
    if (acceptedRef.current) acceptedRef.current = false;
  }, [scale.currentWeight]);

  const stabilityPercent = useMemo(() => {
    if (!scale.isConnected) return 0;
    if (scale.isStable) return 100;
    return 60;
  }, [scale.isConnected, scale.isStable]);

  const stabilityColor = useMemo(() => {
    if (stabilityPercent >= 100) return 'bg-green-500';
    if (stabilityPercent >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  }, [stabilityPercent]);

  const handleAcceptWeight = useCallback(() => {
    if (useManual) {
      const w = parseFloat(manualWeight.replace(',', '.'));
      if (!Number.isFinite(w) || w <= 0) {
        toast.error('Introduce un peso válido');
        return;
      }
      onWeightAccepted?.(w, unit);
      setManualWeight('');
      return;
    }

    if (!scale.isStable) {
      toast.warning('Espera a que el peso se estabilice');
      return;
    }
    const w = scale.acceptWeight();
    if (w <= 0) {
      toast.warning('El peso debe ser mayor que cero');
      return;
    }
    acceptedRef.current = true;
    onWeightAccepted?.(w, unit);
  }, [scale, useManual, manualWeight, unit, onWeightAccepted]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAcceptWeight();
    }
  }, [handleAcceptWeight]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!scale.hasScale) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 't' || e.key === 'T') { scale.tare(); e.preventDefault(); }
      if (e.key === '0' && e.ctrlKey) { scale.zero(); e.preventDefault(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [scale]);

  if (!scale.hasScale && !showManualFallback) return null;

  // Manual-only mode when no scale assigned
  if (!scale.hasScale || useManual) {
    if (!showManualFallback) return null;
    return (
      <div className={`rounded-2xl border border-gray-200 dark:border-gray-700 p-3 ${mode === 'compact' ? 'flex items-center gap-2' : ''}`}>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
          <Pencil className="w-4 h-4" />
          <span>Peso manual</span>
          {scale.hasScale && (
            <button
              type="button"
              onClick={() => setUseManual(false)}
              className="ml-auto text-xs text-blue-600 hover:underline"
            >
              Usar báscula
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={manualWeight}
            onChange={(e) => setManualWeight(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`0.${'0'.repeat(precision)}`}
            className="w-28 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xl font-mono text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-lg text-gray-500">{unit}</span>
          <button
            type="button"
            onClick={handleAcceptWeight}
            className="ml-auto flex items-center gap-1 rounded-xl bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            <span className="sr-only sm:not-sr-only">Aceptar</span>
          </button>
        </div>
      </div>
    );
  }

  // ─── Compact mode ──────────────────────────────────────────────────────

  if (mode === 'compact') {
    return (
      <div className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm ${statusCfg.bg}`}>
        <Scale className="w-4 h-4 text-gray-500" />
        <span className={`font-mono tabular-nums text-lg font-bold ${scale.isStable ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
          {scale.isConnected ? formatWeight(scale.currentWeight, precision, unit) : '---'}
        </span>
        <span className="text-gray-400 text-xs">{unit}</span>
        <span className={`w-2 h-2 rounded-full ${statusCfg.dot}`} />
        {scale.isConnected && scale.isStable && (
          <button
            type="button"
            onClick={handleAcceptWeight}
            className="rounded-lg bg-green-600 p-1 text-white hover:bg-green-700"
            title="Aceptar peso"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  // ─── Inline mode ───────────────────────────────────────────────────────

  if (mode === 'inline') {
    return (
      <div className={`flex items-center gap-2 ${statusCfg.bg} rounded-xl px-3 py-1.5`}>
        <Scale className="w-4 h-4 text-gray-400" />
        <span className={`font-mono tabular-nums font-semibold ${scale.isStable ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
          {scale.isConnected ? formatWeight(scale.currentWeight, precision, unit) : '---'}
        </span>
        <span className="text-xs text-gray-400">{unit}</span>
        {scale.isConnected && (
          <button
            type="button"
            onClick={handleAcceptWeight}
            disabled={!scale.isStable}
            className="rounded-lg bg-green-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Pesar
          </button>
        )}
        {!scale.isConnected && (
          <button
            type="button"
            onClick={() => setUseManual(true)}
            className="text-xs text-blue-600 hover:underline"
          >
            Manual
          </button>
        )}
      </div>
    );
  }

  // ─── Card mode (default) ───────────────────────────────────────────────

  return (
    <div className={`rounded-2xl border-2 ${scale.isStable ? 'border-green-300 dark:border-green-700' : 'border-gray-200 dark:border-gray-700'} ${statusCfg.bg} p-4 transition-colors duration-300`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm">
          <Scale className="w-4 h-4 text-gray-500" />
          <span className="text-gray-600 dark:text-gray-400 truncate max-w-48">
            {scale.scaleDevice?.name || 'Báscula'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className={`w-2 h-2 rounded-full ${statusCfg.dot}`} />
          <span className="text-gray-500 dark:text-gray-400">{statusCfg.label}</span>
          {scale.error && scale.status === 'error' && (
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
          )}
        </div>
      </div>

      {/* Weight display */}
      <div className="text-center py-2">
        {scale.isConnected ? (
          <div className={`transition-opacity duration-200 ${scale.isStable ? 'opacity-100' : 'opacity-60'}`}>
            <span className="font-mono tabular-nums text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
              {formatWeight(scale.currentWeight, precision, unit)}
            </span>
            <span className="ml-2 text-xl text-gray-400">{unit}</span>
          </div>
        ) : scale.status === 'connecting' ? (
          <div className="flex items-center justify-center gap-2 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-lg">Conectando...</span>
          </div>
        ) : (
          <div className="text-3xl font-mono tabular-nums text-gray-300 dark:text-gray-600">
            ---{'.'}{'-'.repeat(precision)}
          </div>
        )}
      </div>

      {/* Stability bar */}
      {scale.isConnected && (
        <div className="mt-2 mb-3">
          <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${stabilityColor}`}
              style={{ width: `${stabilityPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {scale.error && scale.status === 'error' && (
        <div className="mb-3 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {scale.error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {scale.isConnected ? (
          <>
            {scale.scaleDevice?.weighing.tareSupported && (
              <button
                type="button"
                onClick={() => { scale.tare(); toast.info('Tara aplicada'); }}
                className="flex items-center gap-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                title="Tara (T)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Tara
              </button>
            )}
            <button
              type="button"
              onClick={() => { scale.zero(); toast.info('Puesto a cero'); }}
              className="flex items-center gap-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              title="Cero (Ctrl+0)"
            >
              <Target className="w-3.5 h-3.5" />
              Cero
            </button>
            <button
              type="button"
              onClick={handleAcceptWeight}
              disabled={!scale.isStable || scale.currentWeight <= 0}
              className="ml-auto flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Check className="w-4 h-4" />
              Aceptar peso
            </button>
          </>
        ) : scale.status === 'disconnected' || scale.status === 'error' ? (
          <>
            <button
              type="button"
              onClick={() => scale.connect()}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <PlugZap className="w-4 h-4" />
              Conectar
            </button>
            <button
              type="button"
              onClick={() => setUseManual(true)}
              className="flex items-center gap-1.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Pencil className="w-3.5 h-3.5" />
              Manual
            </button>
          </>
        ) : null}
      </div>

      {/* Capture mode toggle */}
      {scale.isConnected && (
        <div className="mt-3 flex items-center justify-center gap-3 text-xs text-gray-400 dark:text-gray-500">
          <button
            type="button"
            onClick={() => setCaptureMode('automatic')}
            className={`px-2 py-0.5 rounded-lg transition-colors ${captureMode === 'automatic' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium' : 'hover:text-gray-600 dark:hover:text-gray-300'}`}
          >
            Automático
          </button>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <button
            type="button"
            onClick={() => setCaptureMode('manual')}
            className={`px-2 py-0.5 rounded-lg transition-colors ${captureMode === 'manual' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium' : 'hover:text-gray-600 dark:hover:text-gray-300'}`}
          >
            Manual
          </button>
        </div>
      )}
    </div>
  );
}
