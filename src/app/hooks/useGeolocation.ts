import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import type { GeoLocation } from '../lib/clockinsApi';
import { isVertialNativeApp } from '../lib/vertialPrint/isNativeApp';

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
/** Fichaje: tiempo razonable para GPS + diálogo de permiso. */
const GEO_CLOCK_TIMEOUT = 12_000;
const GEO_MAX_AGE = 30_000;

type GeoRequestOptions = {
  timeoutMs?: number;
  highAccuracy?: boolean;
};

function toGeoLocation(coords: { latitude: number; longitude: number; accuracy: number }): GeoLocation {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
  };
}

/**
 * En app nativa: pide permiso de ubicación al SO (Android/iOS) y luego GPS.
 * En web: navigator.geolocation (popup del navegador).
 */
export async function fetchGeolocation(options: GeoRequestOptions = {}): Promise<{
  geo: GeoLocation | null;
  status: GeoStatus;
  error: string | null;
}> {
  const timeoutMs = options.timeoutMs ?? GEO_TIMEOUT;
  const highAccuracy = options.highAccuracy ?? true;

  if (isVertialNativeApp() && (Capacitor.getPlatform() === 'ios' || Capacitor.getPlatform() === 'android')) {
    try {
      let perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
        perm = await Geolocation.requestPermissions();
      }
      const ok = perm.location === 'granted' || perm.coarseLocation === 'granted';
      if (!ok) {
        return {
          geo: null,
          status: 'denied',
          error:
            'Permiso de ubicación denegado. Actívalo en Ajustes → Vertial → Ubicación para registrar el fichaje en el mapa.',
        };
      }
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: highAccuracy,
        timeout: timeoutMs,
        maximumAge: GEO_MAX_AGE,
      });
      return {
        geo: toGeoLocation(position.coords),
        status: 'granted',
        error: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || '');
      if (/denied|permission/i.test(msg)) {
        return {
          geo: null,
          status: 'denied',
          error:
            'Permiso de ubicación denegado. Actívalo en Ajustes → Vertial → Ubicación.',
        };
      }
      if (/timeout/i.test(msg)) {
        return { geo: null, status: 'timeout', error: 'Tiempo de espera agotado obteniendo la ubicación' };
      }
      return { geo: null, status: 'unavailable', error: 'No se pudo obtener la ubicación' };
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      geo: null,
      status: 'unavailable',
      error: 'Geolocalización no disponible en este dispositivo',
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          geo: toGeoLocation(position.coords),
          status: 'granted',
          error: null,
        });
      },
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            resolve({
              geo: null,
              status: 'denied',
              error:
                'Permiso de ubicación denegado. Actívalo en Ajustes → Vertial → Ubicación (o en el navegador si no usas la app).',
            });
            break;
          case err.TIMEOUT:
            resolve({
              geo: null,
              status: 'timeout',
              error: 'Tiempo de espera agotado obteniendo la ubicación',
            });
            break;
          default:
            resolve({
              geo: null,
              status: 'unavailable',
              error: 'No se pudo obtener la ubicación',
            });
        }
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout: timeoutMs,
        maximumAge: GEO_MAX_AGE,
      },
    );
  });
}

/** Solo pide el diálogo de permiso (sin esperar GPS). Útil al entrar en la app. */
export async function ensureLocationPermissionPrompt(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!isVertialNativeApp()) {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
    // En web el permiso solo aparece al llamar getCurrentPosition.
    return 'unsupported';
  }
  const platform = Capacitor.getPlatform();
  if (platform !== 'ios' && platform !== 'android') return 'unsupported';
  try {
    let perm = await Geolocation.checkPermissions();
    if (perm.location === 'granted' || perm.coarseLocation === 'granted') return 'granted';
    if (perm.location === 'denied' && perm.coarseLocation === 'denied') return 'denied';
    perm = await Geolocation.requestPermissions();
    if (perm.location === 'granted' || perm.coarseLocation === 'granted') return 'granted';
    return 'denied';
  } catch {
    return 'unsupported';
  }
}

/** Ubicación al fichar (TPV / trabajador). No bloquea si falla. */
export async function requestClockinGeo(): Promise<GeoLocation | undefined> {
  const { geo } = await fetchGeolocation({
    timeoutMs: GEO_CLOCK_TIMEOUT,
    highAccuracy: true,
  });
  return geo || undefined;
}

export function useGeolocation(): UseGeolocationResult {
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (options: GeoRequestOptions): Promise<GeoLocation | null> => {
    setStatus('requesting');
    setError(null);
    const result = await fetchGeolocation(options);
    setStatus(result.status);
    setError(result.error);
    if (result.geo) setLocation(result.geo);
    return result.geo;
  }, []);

  const requestLocation = useCallback((): Promise<GeoLocation | null> => {
    return run({ timeoutMs: GEO_TIMEOUT, highAccuracy: true });
  }, [run]);

  /** Ubicación al fichar: pide permiso y GPS (alta precisión). */
  const requestLocationForClock = useCallback((): Promise<GeoLocation | null> => {
    return run({ timeoutMs: GEO_CLOCK_TIMEOUT, highAccuracy: true });
  }, [run]);

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
