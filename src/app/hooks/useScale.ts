import { useState, useEffect, useCallback, useRef } from 'react';
import type { ScaleDevice, WeighUnit } from '../lib/deliveryApi';
import { getTerminalScaleRequest, reportScaleStatusRequest } from '../lib/deliveryApi';
import { ScaleService, getScaleCapabilities } from '../services/scaleService';
import type { ScaleReading, ScaleStatus } from '../services/scaleService';

export type { ScaleReading, ScaleStatus };

export interface UseScaleOptions {
  autoConnect?: boolean;
  continuousReading?: boolean;
  onStableWeight?: (reading: ScaleReading) => void;
}

export interface UseScaleReturn {
  status: ScaleStatus;
  isConnected: boolean;
  currentWeight: number;
  currentUnit: WeighUnit;
  isStable: boolean;
  lastReading: ScaleReading | null;
  error: string | null;
  scaleDevice: ScaleDevice | null;

  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  readWeight: () => Promise<ScaleReading>;
  tare: () => Promise<boolean>;
  zero: () => Promise<boolean>;
  acceptWeight: () => number;

  capabilities: ReturnType<typeof getScaleCapabilities>;
  hasScale: boolean;
  loading: boolean;
}

const RECONNECT_DELAYS = [2000, 5000, 10000];
const CACHE_PREFIX = 'scale_last_connected_';

export function useScale(
  userId: string,
  pdvId: string,
  terminalId: string,
  options: UseScaleOptions = {},
): UseScaleReturn {
  const { autoConnect = true, onStableWeight } = options;

  const [scaleDevice, setScaleDevice] = useState<ScaleDevice | null>(null);
  const [status, setStatus] = useState<ScaleStatus>('disconnected');
  const [currentWeight, setCurrentWeight] = useState(0);
  const [currentUnit, setCurrentUnit] = useState<WeighUnit>('kg');
  const [isStable, setIsStable] = useState(false);
  const [lastReading, setLastReading] = useState<ScaleReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const serviceRef = useRef<ScaleService | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const onStableWeightRef = useRef(onStableWeight);
  onStableWeightRef.current = onStableWeight;

  const getService = useCallback(() => {
    if (!serviceRef.current) {
      serviceRef.current = new ScaleService();
    }
    return serviceRef.current;
  }, []);

  // Load scale device config for this terminal
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function loadDevice() {
      if (!userId || !pdvId || !terminalId) {
        setLoading(false);
        return;
      }
      try {
        const device = await getTerminalScaleRequest(userId, pdvId, terminalId);
        if (cancelled) return;
        setScaleDevice(device);
        setLoading(false);

        if (device && autoConnect) {
          const svc = getService();
          setupListeners(svc);
          const ok = await svc.connect(device);
          if (ok && !cancelled) {
            localStorage.setItem(CACHE_PREFIX + terminalId, device._id);
            reconnectAttemptRef.current = 0;
          }
        }
      } catch {
        if (!cancelled) {
          setScaleDevice(null);
          setLoading(false);
        }
      }
    }

    loadDevice();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      serviceRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, pdvId, terminalId]);

  const setupListeners = useCallback((svc: ScaleService) => {
    svc.on('onWeightChange', (reading: ScaleReading) => {
      if (!mountedRef.current) return;
      setCurrentWeight(reading.weight);
      setCurrentUnit(reading.unit);
      setIsStable(reading.stable);
      setLastReading(reading);
      setError(reading.error);
    });

    svc.on('onStableWeight', (reading: ScaleReading) => {
      if (!mountedRef.current) return;
      onStableWeightRef.current?.(reading);
    });

    svc.on('onStatusChange', ({ status: newStatus, message }) => {
      if (!mountedRef.current) return;
      setStatus(newStatus);
      if (newStatus === 'error' || newStatus === 'disconnected') {
        setError(message || null);
        if (scaleDevice && userId) {
          reportScaleStatusRequest(userId, scaleDevice._id, newStatus, message, terminalId, pdvId).catch(() => {});
        }
        attemptReconnect();
      }
      if (newStatus === 'connected' || newStatus === 'reading') {
        setError(null);
        reconnectAttemptRef.current = 0;
      }
    });

    svc.on('onError', (msg: string) => {
      if (!mountedRef.current) return;
      setError(msg);
    });
  }, [scaleDevice, userId, terminalId, pdvId]);

  const attemptReconnect = useCallback(() => {
    if (!scaleDevice) return;
    if (reconnectAttemptRef.current >= RECONNECT_DELAYS.length) return;

    const delay = RECONNECT_DELAYS[reconnectAttemptRef.current] || 10000;
    reconnectAttemptRef.current += 1;

    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = setTimeout(async () => {
      if (!mountedRef.current || !scaleDevice) return;
      const svc = getService();
      try {
        await svc.connect(scaleDevice);
      } catch { /* reconnect failed, will try again via status handler */ }
    }, delay);
  }, [scaleDevice, getService]);

  const connect = useCallback(async () => {
    if (!scaleDevice) return false;
    const svc = getService();
    setupListeners(svc);
    const ok = await svc.connect(scaleDevice);
    if (ok) {
      localStorage.setItem(CACHE_PREFIX + terminalId, scaleDevice._id);
      reconnectAttemptRef.current = 0;
    }
    return ok;
  }, [scaleDevice, getService, setupListeners, terminalId]);

  const disconnect = useCallback(async () => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectAttemptRef.current = RECONNECT_DELAYS.length; // prevent auto-reconnect
    await getService().disconnect();
  }, [getService]);

  const readWeight = useCallback(async () => {
    return getService().readWeight();
  }, [getService]);

  const tare = useCallback(async () => {
    return getService().tare();
  }, [getService]);

  const zero = useCallback(async () => {
    return getService().zero();
  }, [getService]);

  const acceptWeight = useCallback(() => {
    if (!isStable) return 0;
    return currentWeight;
  }, [isStable, currentWeight]);

  return {
    status,
    isConnected: status === 'connected' || status === 'reading',
    currentWeight,
    currentUnit,
    isStable,
    lastReading,
    error,
    scaleDevice,
    connect,
    disconnect,
    readWeight,
    tare,
    zero,
    acceptWeight,
    capabilities: getScaleCapabilities(),
    hasScale: !!scaleDevice,
    loading,
  };
}
