import { useState, useCallback } from 'react';
import type { GeoLocation } from '../lib/clockinsApi';

export type GeoStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable' | 'timeout';

export interface UseGeolocationResult {
  location: GeoLocation | null;
  status: GeoStatus;
  error: string | null;
  requestLocation: () => Promise<GeoLocation | null>;
}

const GEO_TIMEOUT = 15_000;
const GEO_MAX_AGE = 60_000;

export function useGeolocation(): UseGeolocationResult {
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback((): Promise<GeoLocation | null> => {
    if (!navigator.geolocation) {
      setStatus('unavailable');
      setError('Geolocalización no disponible en este dispositivo');
      return Promise.resolve(null);
    }

    setStatus('requesting');
    setError(null);

    return new Promise((resolve) => {
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
              msg = 'Permiso de ubicación denegado. Actívalo en los ajustes del navegador.';
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
          enableHighAccuracy: true,
          timeout: GEO_TIMEOUT,
          maximumAge: GEO_MAX_AGE,
        },
      );
    });
  }, []);

  return { location, status, error, requestLocation };
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
