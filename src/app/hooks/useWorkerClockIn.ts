import { useState, useEffect, useCallback, useRef } from 'react';
import {
  type ClockinRecord,
  type ClockinEventType,
  type GeoLocation,
  listTodayClockinSessions,
  clockIn,
  clockOut,
  startBreak,
  endBreak,
  notifyClockinEvent,
} from '../lib/clockinsApi';
import { useGeolocation, isMobileDevice } from './useGeolocation';
import {
  getAutoClockOutRemainingMs,
  shouldAutoClockOut,
} from '../lib/clockinAutoOut';
import {
  pickActiveClockinRecord,
} from '../lib/clockinHistoryUtils';

/** Tope duro al GPS de fichaje (incluye diálogo de permiso). */
const GEO_HARD_TIMEOUT_MS = 8_000;

function isValidGeo(geo: GeoLocation | null | undefined): geo is GeoLocation {
  if (!geo) return false;
  return Number.isFinite(geo.latitude) && Number.isFinite(geo.longitude);
}

/**
 * Segundos trabajados en vivo para el contador de UI.
 * No aplica plantilla de horario (eso es solo para nómina/totales): si se mezcla
 * scheduled_start con husos, el reloj puede saltar minutos al fichar.
 */
export function computeClockinLiveSeconds(
  record: ClockinRecord | null,
  nowMs: number = Date.now(),
): { worked: number; breakSec: number } {
  if (!record) return { worked: 0, breakSec: 0 };
  const entries = record.entries;
  const clockInEntry = entries.find((e) => e.type === 'clock_in');
  if (!clockInEntry) return { worked: 0, breakSec: 0 };

  const startMs = new Date(clockInEntry.time).getTime();
  if (!Number.isFinite(startMs)) return { worked: 0, breakSec: 0 };
  const clockOutEntry = entries.find((e) => e.type === 'clock_out');
  const endMs = clockOutEntry ? new Date(clockOutEntry.time).getTime() : nowMs;

  const totalMs = Math.max(0, endMs - startMs);

  let breakMs = 0;
  let breakStart: number | null = null;
  for (const e of entries) {
    if (e.type === 'break_start') breakStart = new Date(e.time).getTime();
    if (e.type === 'break_end' && breakStart !== null) {
      const bStart = Math.max(breakStart, startMs);
      const bEnd = Math.min(new Date(e.time).getTime(), endMs);
      if (bEnd > bStart) breakMs += bEnd - bStart;
      breakStart = null;
    }
  }
  if (breakStart !== null) {
    const bStart = Math.max(breakStart, startMs);
    const bEnd = Math.min(clockOutEntry ? new Date(clockOutEntry.time).getTime() : nowMs, endMs);
    if (bEnd > bStart) breakMs += bEnd - bStart;
  }

  const workedMs = Math.max(0, totalMs - breakMs);
  return { worked: Math.floor(workedMs / 1000), breakSec: Math.floor(breakMs / 1000) };
}

export function getClockinContinuousMs(record: ClockinRecord | null, nowMs: number = Date.now()): number {
  if (!record || record.status === 'completed') return 0;
  const entries = record.entries;
  let lastResume: number | null = null;
  for (const e of entries) {
    if (e.type === 'clock_in' || e.type === 'break_end') lastResume = new Date(e.time).getTime();
    if (e.type === 'break_start' || e.type === 'clock_out') lastResume = null;
  }
  if (lastResume === null) return 0;
  return Math.max(0, nowMs - lastResume);
}

export function formatClockTimer(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

type DisplayAnchor = {
  clientMs: number;
  worked: number;
  breakSec: number;
  onBreak: boolean;
};

export function useWorkerClockIn(
  businessId: string,
  memberId: string,
  memberName: string,
  storeContext?: { sales_point_id?: string; sales_point_name?: string; work_center_id?: string },
  options?: { onSessionCompleted?: (rec: ClockinRecord) => void },
) {
  const isMobile = isMobileDevice();
  const { location: geoLocation, status: geoStatus, requestLocationForClock } =
    useGeolocation();
  const autoClockOutTriggered = useRef(false);
  const displayAnchorRef = useRef<DisplayAnchor | null>(null);
  const [todaySessionCount, setTodaySessionCount] = useState(0);
  const onSessionCompletedRef = useRef(options?.onSessionCompleted);
  onSessionCompletedRef.current = options?.onSessionCompleted;

  const [record, setRecord] = useState<ClockinRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [, setTick] = useState(0);

  /**
   * Ancla el contador al reloj del dispositivo para que no “salte” minutos
   * por desfase con el servidor. En entrada nueva empieza en 00:00:00.
   */
  const reanchorDisplay = useCallback((rec: ClockinRecord | null, opts?: { freshClockIn?: boolean }) => {
    if (!rec || (rec.status !== 'active' && rec.status !== 'break')) {
      displayAnchorRef.current = null;
      return;
    }
    if (opts?.freshClockIn) {
      displayAnchorRef.current = {
        clientMs: Date.now(),
        worked: 0,
        breakSec: 0,
        onBreak: false,
      };
      return;
    }
    const live = computeClockinLiveSeconds(rec, Date.now());
    displayAnchorRef.current = {
      clientMs: Date.now(),
      worked: live.worked,
      breakSec: live.breakSec,
      onBreak: rec.status === 'break',
    };
  }, []);

  /**
   * GPS al fichar (opcional de momento).
   * Pide ubicación si se puede; si falla, no bloquea entrada ni salida.
   * Más adelante se podrá activar como obligatoria por configuración.
   */
  const getGeoForAction = useCallback(
    async (_required: boolean): Promise<GeoLocation | undefined> => {
      // Salida / descanso: no re-pedir permiso.
      if (!_required) {
        return isValidGeo(geoLocation) ? geoLocation : undefined;
      }

      const withHardTimeout = (p: Promise<GeoLocation | null>) =>
        Promise.race([
          p,
          new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), GEO_HARD_TIMEOUT_MS);
          }),
        ]);

      let loc = await withHardTimeout(requestLocationForClock());
      if (!isValidGeo(loc) && isValidGeo(geoLocation)) {
        loc = geoLocation;
      }
      // Opcional: no bloquear si no hay GPS.
      return isValidGeo(loc) ? loc : undefined;
    },
    [requestLocationForClock, geoLocation],
  );

  const fireClockinNotification = useCallback(
    (eventType: ClockinEventType, rec: ClockinRecord | null, hasGeo: boolean) => {
      if (!businessId || !memberId) return;
      const lateMinutes = (() => {
        if (eventType !== 'clock_in' || !rec?.scheduled_start) return 0;
        const entry = rec.entries.find((e) => e.type === 'clock_in');
        if (!entry) return 0;
        const [h, m] = rec.scheduled_start.split(':').map(Number);
        const scheduled = new Date(`${rec.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
        const actual = new Date(entry.time).getTime();
        return Math.max(0, Math.round((actual - scheduled) / 60000));
      })();
      const breakMinutes = (() => {
        if (eventType !== 'break_end' || !rec?.entries?.length) return 0;
        const entries = rec.entries;
        const lastEndIdx = entries.map((e) => e.type).lastIndexOf('break_end');
        const lastStartIdx = entries.map((e) => e.type).lastIndexOf('break_start');
        if (lastStartIdx < 0 || lastEndIdx < 0 || lastStartIdx > lastEndIdx) return 0;
        const start = new Date(entries[lastStartIdx].time).getTime();
        const end = new Date(entries[lastEndIdx].time).getTime();
        return Math.max(0, Math.round((end - start) / 60000));
      })();
      void notifyClockinEvent(businessId, {
        memberId,
        memberName,
        eventType,
        time: new Date().toISOString(),
        device: isMobile ? 'mobile' : 'desktop',
        lateMinutes,
        workedMinutes: eventType === 'clock_out' ? rec?.totalMinutes || 0 : 0,
        breakMinutes,
        hasGeo,
      }).catch((err) => {
        console.error('Error notificando fichaje:', err);
      });
    },
    [businessId, memberId, memberName, isMobile],
  );

  const reloadToday = useCallback(async () => {
    if (!businessId || !memberId) {
      setLoading(false);
      setRecord(null);
      setTodaySessionCount(0);
      displayAnchorRef.current = null;
      return null;
    }
    setLoading(true);
    setError('');
    try {
      const sessions = await listTodayClockinSessions(businessId, memberId);
      setTodaySessionCount(sessions.length);
      const today = pickActiveClockinRecord(sessions);
      if (today && today.status !== 'completed') {
        if (shouldAutoClockOut(today)) {
          try {
            const stopped = await clockOut(today);
            reanchorDisplay(stopped);
            // Sesión cerrada: liberar UI para poder abrir otra (si queda cupo).
            displayAnchorRef.current = null;
            setRecord(null);
            setTodaySessionCount((n) => Math.max(n, sessions.length));
            setInfo(
              today.scheduled_end
                ? 'Se cerró solo el fichaje (10 min después del fin de tu turno).'
                : 'Se cerró solo el fichaje por seguridad (tiempo máximo continuo).',
            );
            void listTodayClockinSessions(businessId, memberId).then((s) => {
              setTodaySessionCount(s.length);
            });
            return stopped;
          } catch {
            reanchorDisplay(today);
            setRecord(today);
            return today;
          }
        }
        reanchorDisplay(today);
        setRecord(today);
        return today;
      }
      displayAnchorRef.current = null;
      setRecord(null);
      return null;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error cargando fichajes');
      return null;
    } finally {
      setLoading(false);
    }
  }, [businessId, memberId, reanchorDisplay]);

  useEffect(() => {
    void reloadToday();
  }, [reloadToday]);

  const isClockedIn = record?.status === 'active' || record?.status === 'break';
  const isOnBreak = record?.status === 'break';

  const readDisplaySeconds = useCallback((): { worked: number; breakSec: number } => {
    const anchor = displayAnchorRef.current;
    if (!anchor || !isClockedIn) {
      return computeClockinLiveSeconds(record);
    }
    const delta = Math.max(0, Math.floor((Date.now() - anchor.clientMs) / 1000));
    if (anchor.onBreak || isOnBreak) {
      return { worked: anchor.worked, breakSec: anchor.breakSec + delta };
    }
    return { worked: anchor.worked + delta, breakSec: anchor.breakSec };
  }, [isClockedIn, isOnBreak, record]);

  const { worked: elapsedSeconds, breakSec: breakSeconds } = readDisplaySeconds();
  const continuousMs = getClockinContinuousMs(record);
  const remainingAutoOutMs = getAutoClockOutRemainingMs(record);
  const remainingMinutes = Number.isFinite(remainingAutoOutMs)
    ? Math.floor(remainingAutoOutMs / 60000)
    : 0;

  useEffect(() => {
    if (!isClockedIn) return;
    const interval = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(interval);
  }, [isClockedIn]);

  const handleClockOut = useCallback(async () => {
    if (acting || !record) return null;
    setActing(true);
    setError('');
    setInfo('');
    try {
      const geo = await getGeoForAction(false);
      const rec = await clockOut(record, geo);
      displayAnchorRef.current = null;
      setRecord(null);
      let used = todaySessionCount;
      if (businessId && memberId) {
        try {
          const sessions = await listTodayClockinSessions(businessId, memberId);
          used = sessions.length;
          setTodaySessionCount(used);
        } catch {
          used = Math.max(1, todaySessionCount);
          setTodaySessionCount(used);
        }
      }
      fireClockinNotification('clock_out', rec, Boolean(geo));
      try {
        onSessionCompletedRef.current?.(rec);
      } catch {
        /* UI history refresh best-effort */
      }
      if (used > 0) {
        setInfo(`Salida fichada. Puedes volver a entrar hoy (turnos hoy: ${used}).`);
      } else {
        setInfo('Salida fichada.');
      }
      return rec;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al fichar salida');
      return null;
    } finally {
      setActing(false);
    }
  }, [
    acting,
    record,
    getGeoForAction,
    fireClockinNotification,
    businessId,
    memberId,
    todaySessionCount,
  ]);

  useEffect(() => {
    if (!isClockedIn || !record || acting) return;
    if (record.status === 'break') return;
    if (!shouldAutoClockOut(record)) return;
    if (autoClockOutTriggered.current) return;
    autoClockOutTriggered.current = true;
    void handleClockOut().then((rec) => {
      if (rec) {
        setInfo(
          record.scheduled_end
            ? 'Se cerró solo el fichaje (10 min después del fin de tu turno).'
            : 'Se cerró solo el fichaje por seguridad (tiempo máximo continuo).',
        );
      }
    });
  }, [remainingAutoOutMs, isClockedIn, record, acting, handleClockOut]);

  const handleClockIn = useCallback(async () => {
    if (acting || !businessId || !memberId) return null;
    setActing(true);
    setError('');
    setInfo('');
    try {
      const geo = await getGeoForAction(false);
      const baseOpts = {
        geo,
        device_type: (isMobile ? 'mobile' : 'desktop') as 'mobile' | 'desktop',
        sales_point_id: storeContext?.sales_point_id,
        sales_point_name: storeContext?.sales_point_name,
        work_center_id: storeContext?.work_center_id,
      };
      let rec: ClockinRecord;
      try {
        rec = await clockIn(businessId, memberId, memberName, baseOpts);
      } catch (firstErr: unknown) {
        const msg = firstErr instanceof Error ? firstErr.message : '';
        // Si el backend viejo aún bloquea por tienda, reintentar sin PDV.
        if (/tienda/i.test(msg) && (baseOpts.sales_point_id || baseOpts.work_center_id)) {
          rec = await clockIn(businessId, memberId, memberName, {
            geo: baseOpts.geo,
            device_type: baseOpts.device_type,
          });
        } else {
          throw firstErr;
        }
      }
      const alreadyActive = Boolean((rec as ClockinRecord & { alreadyActive?: boolean }).alreadyActive);
      if (alreadyActive) {
        setInfo('Ya tenías un fichaje activo. Se ha reanudado ese turno (no se crea uno nuevo).');
        // Reanudar: anclar al cliente para no heredar desfase servidor (±minutos).
        const live = computeClockinLiveSeconds(rec, Date.now());
        displayAnchorRef.current = {
          clientMs: Date.now(),
          worked: live.worked,
          breakSec: live.breakSec,
          onBreak: rec.status === 'break',
        };
      } else {
        // Entrada nueva: el contador SIEMPRE arranca en 00:00:00 en este dispositivo.
        reanchorDisplay(rec, { freshClockIn: true });
        fireClockinNotification('clock_in', rec, Boolean(geo));
        setTodaySessionCount((n) => n + 1);
      }
      autoClockOutTriggered.current = false;
      setRecord(rec);
      setTick((v) => v + 1);
      return rec;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al fichar entrada');
      return null;
    } finally {
      setActing(false);
    }
  }, [
    acting,
    businessId,
    memberId,
    memberName,
    getGeoForAction,
    fireClockinNotification,
    isMobile,
    storeContext?.sales_point_id,
    storeContext?.sales_point_name,
    storeContext?.work_center_id,
    reanchorDisplay,
  ]);

  const handleBreakToggle = useCallback(async () => {
    if (acting || !record) return null;
    setActing(true);
    setError('');
    setInfo('');
    try {
      const geo = await getGeoForAction(false);
      const wasOnBreak = isOnBreak;
      const rec = wasOnBreak ? await endBreak(record, geo) : await startBreak(record, geo);
      reanchorDisplay(rec);
      setRecord(rec);
      fireClockinNotification(wasOnBreak ? 'break_end' : 'break_start', rec, Boolean(geo));
      return rec;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al gestionar descanso');
      return null;
    } finally {
      setActing(false);
    }
  }, [acting, record, isOnBreak, getGeoForAction, fireClockinNotification, reanchorDisplay]);

  /** Puede abrir un turno nuevo (no hay activo). Sin tope diario de sesiones. */
  const canStartNewSession = !isClockedIn;

  return {
    record,
    loading,
    acting,
    error,
    info,
    isClockedIn,
    isOnBreak,
    elapsedSeconds,
    breakSeconds,
    continuousMs,
    remainingMinutes,
    /** true si el auto-cierre usa fin de turno + 10 min (no el tope de 4 h). */
    autoOutUsesShiftEnd: Boolean(record?.scheduled_end),
    todaySessionCount,
    canStartNewSession,
    geoLocation,
    geoStatus,
    reloadToday,
    handleClockIn,
    handleClockOut,
    handleBreakToggle,
  };
}
