import { useState, useCallback } from 'react';
import type { GeoLocation } from '../lib/clockinsApi';

export type GeoStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable' | 'timeout';

export interface UseGeolocationResult {
  location: GeoLocation | null;
  status: GeoStatus;
  error: string | null;
  requestLocation: () => Promise<GeoLocation | null>;
  /** Timeout corto para fichaje; no bloquea el botón más de unos segundos. */
  requestLocationForClock: () => Promise<GeoLocation | null>;
}

const GEO_TIMEOUT = 15_000;
/** Fichaje: no bloquear la UI más de unos segundos esperando GPS. */
const GEO_CLOCK_TIMEOUT = 4_000;
const GEO_MAX_AGE = 60_000;

type GeoRequestOptions = {
  timeoutMs?: number;
  highAccuracy?: boolean;
};

function readPosition(
  resolve: (geo: GeoLocation | null) => void,
  setLocation: (g: GeoLocation) => void,
  setStatus: (s: GeoStatus) => void,
  setError: (e: string | null) => void,
  options: GeoRequestOptions,
): void {
  if (!navigator.geolocation) {
    setStatus('unavailable');
    setError('Geolocalización no disponible en este dispositivo');
    resolve(null);
    return;
  }

  setStatus('requesting');
  setError(null);

  const timeoutMs = options.timeoutMs ?? GEO_TIMEOUT;
  const highAccuracy = options.highAccuracy ?? true;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const geo: GeoLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      setLocation(geo);
      setStatus('granted');
      resolve(geo);
    },
    (err) => {
      let msg: string;
      let nextStatus: GeoStatus;
      switch (err.code) {
        case err.PERMISSION_DENIED:
          msg =
            'Permiso de ubicación denegado. Actívalo en Ajustes → Vertial → Ubicación (o en el navegador si no usas la app).';
          nextStatus = 'denied';
          break;
        case err.TIMEOUT:
          msg = 'Tiempo de espera agotado obteniendo la ubicación';
          nextStatus = 'timeout';
          break;
        default:
          msg = 'No se pudo obtener la ubicación';
          nextStatus = 'unavailable';
      }
      setStatus(nextStatus);
      setError(msg);
      resolve(null);
    },
    {
      enableHighAccuracy: highAccuracy,
      timeout: timeoutMs,
      maximumAge: GEO_MAX_AGE,
    },
  );
}

export function useGeolocation(): UseGeolocationResult {
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback((): Promise<GeoLocation | null> => {
    return new Promise((resolve) => {
      readPosition(resolve, setLocation, setStatus, setError, {
        timeoutMs: GEO_TIMEOUT,
        highAccuracy: true,
      });
    });
  }, []);

  /** Ubicación rápida al fichar: sin alta precisión y con timeout corto. */
  const requestLocationForClock = useCallback((): Promise<GeoLocation | null> => {
    return new Promise((resolve) => {
      readPosition(resolve, setLocation, setStatus, setError, {
        timeoutMs: GEO_CLOCK_TIMEOUT,
        highAccuracy: false,
      });
    });
  }, []);

  return { location, status, error, requestLocation, requestLocationForClock };
}

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) &&
    !/iPad/i.test(ua) && window.innerWidth < 768;
}

export function isTabletOrDesktop(): boolean {
  return !isMobileDevice();
}
