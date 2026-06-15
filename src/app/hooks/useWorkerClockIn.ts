import { useState, useEffect, useCallback, useRef } from 'react';
import {
  type ClockinRecord,
  type ClockinEventType,
  type GeoLocation,
  getTodayClockin,
  clockIn,
  clockOut,
  startBreak,
  endBreak,
  notifyClockinEvent,
} from '../lib/clockinsApi';
import { useGeolocation, isMobileDevice } from './useGeolocation';

const MAX_CONTINUOUS_MS = 4 * 60 * 60 * 1000;

function parseSchedMs(dateStr: string, timeHHMM: string): number {
  const [h, m] = timeHHMM.split(':').map(Number);
  return new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
}

export function computeClockinLiveSeconds(record: ClockinRecord | null): { worked: number; breakSec: number } {
  if (!record) return { worked: 0, breakSec: 0 };
  const entries = record.entries;
  const clockInEntry = entries.find((e) => e.type === 'clock_in');
  if (!clockInEntry) return { worked: 0, breakSec: 0 };

  const clockOutEntry = entries.find((e) => e.type === 'clock_out');
  const now = Date.now();

  let startMs = new Date(clockInEntry.time).getTime();
  let endMs = clockOutEntry ? new Date(clockOutEntry.time).getTime() : now;

  if (record.date && record.scheduled_start) {
    const schedStartMs = parseSchedMs(record.date, record.scheduled_start);
    if (startMs < schedStartMs) startMs = schedStartMs;
  }
  if (record.date && record.scheduled_end) {
    const schedEndMs = parseSchedMs(record.date, record.scheduled_end);
    if (endMs > schedEndMs) endMs = schedEndMs;
  }

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
    const bEnd = Math.min(clockOutEntry ? new Date(clockOutEntry.time).getTime() : now, endMs);
    if (bEnd > bStart) breakMs += bEnd - bStart;
  }

  const workedMs = Math.max(0, totalMs - breakMs);
  return { worked: Math.floor(workedMs / 1000), breakSec: Math.floor(breakMs / 1000) };
}

export function getClockinContinuousMs(record: ClockinRecord | null): number {
  if (!record || record.status === 'completed') return 0;
  const entries = record.entries;
  let lastResume: number | null = null;
  for (const e of entries) {
    if (e.type === 'clock_in' || e.type === 'break_end') lastResume = new Date(e.time).getTime();
    if (e.type === 'break_start' || e.type === 'clock_out') lastResume = null;
  }
  if (lastResume === null) return 0;
  return Date.now() - lastResume;
}

export function formatClockTimer(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function useWorkerClockIn(
  businessId: string,
  memberId: string,
  memberName: string,
  storeContext?: { sales_point_id?: string; sales_point_name?: string },
) {
  const isMobile = isMobileDevice();
  const { location: geoLocation, status: geoStatus, requestLocationForClock } = useGeolocation();
  const autoClockOutTriggered = useRef(false);

  const [record, setRecord] = useState<ClockinRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [, setTick] = useState(0);

  const getGeoForAction = useCallback(async (): Promise<GeoLocation | undefined> => {
    const loc = await requestLocationForClock();
    return loc || undefined;
  }, [requestLocationForClock]);

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
      return null;
    }
    setLoading(true);
    setError('');
    try {
      const today = await getTodayClockin(businessId, memberId);
      if (today && today.status !== 'completed') {
        const contMs = getClockinContinuousMs(today);
        if (contMs >= MAX_CONTINUOUS_MS) {
          try {
            const stopped = await clockOut(today);
            setRecord(stopped);
            return stopped;
          } catch {
            setRecord(today);
            return today;
          }
        }
        setRecord(today);
        return today;
      }
      setRecord(today);
      return today;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error cargando fichajes');
      return null;
    } finally {
      setLoading(false);
    }
  }, [businessId, memberId]);

  useEffect(() => {
    void reloadToday();
  }, [reloadToday]);

  const isClockedIn = record?.status === 'active' || record?.status === 'break';
  const isOnBreak = record?.status === 'break';
  const { worked: elapsedSeconds, breakSec: breakSeconds } = computeClockinLiveSeconds(record);
  const continuousMs = getClockinContinuousMs(record);

  useEffect(() => {
    if (!isClockedIn) return;
    const interval = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(interval);
  }, [isClockedIn]);

  const handleClockOut = useCallback(async () => {
    if (acting || !record) return null;
    setActing(true);
    setError('');
    try {
      const geo = await getGeoForAction();
      const rec = await clockOut(record, geo);
      setRecord(rec);
      fireClockinNotification('clock_out', rec, Boolean(geo));
      return rec;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al fichar salida');
      return null;
    } finally {
      setActing(false);
    }
  }, [acting, record, getGeoForAction, fireClockinNotification]);

  useEffect(() => {
    if (!isClockedIn || !record || acting) return;
    if (record.status === 'break') return;
    if (continuousMs < MAX_CONTINUOUS_MS) return;
    if (autoClockOutTriggered.current) return;
    autoClockOutTriggered.current = true;
    void handleClockOut();
  }, [continuousMs, isClockedIn, record, acting, handleClockOut]);

  const handleClockIn = useCallback(async () => {
    if (acting || !businessId || !memberId) return null;
    setActing(true);
    setError('');
    try {
      const geo = await getGeoForAction();
      const rec = await clockIn(businessId, memberId, memberName, {
        geo,
        device_type: isMobile ? 'mobile' : 'desktop',
        sales_point_id: storeContext?.sales_point_id,
        sales_point_name: storeContext?.sales_point_name,
      });
      setRecord(rec);
      fireClockinNotification('clock_in', rec, Boolean(geo));
      return rec;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al fichar entrada');
      return null;
    } finally {
      setActing(false);
    }
  }, [acting, businessId, memberId, memberName, getGeoForAction, fireClockinNotification, isMobile, storeContext?.sales_point_id, storeContext?.sales_point_name]);

  const handleBreakToggle = useCallback(async () => {
    if (acting || !record) return null;
    setActing(true);
    setError('');
    try {
      const geo = await getGeoForAction();
      const wasOnBreak = isOnBreak;
      const rec = wasOnBreak ? await endBreak(record, geo) : await startBreak(record, geo);
      setRecord(rec);
      fireClockinNotification(wasOnBreak ? 'break_end' : 'break_start', rec, Boolean(geo));
      return rec;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al gestionar descanso');
      return null;
    } finally {
      setActing(false);
    }
  }, [acting, record, isOnBreak, getGeoForAction, fireClockinNotification]);

  const remainingAutoStop = Math.max(0, MAX_CONTINUOUS_MS - continuousMs);
  const remainingMinutes = Math.floor(remainingAutoStop / 60000);

  return {
    record,
    loading,
    acting,
    error,
    isClockedIn,
    isOnBreak,
    elapsedSeconds,
    breakSeconds,
    continuousMs,
    remainingMinutes,
    geoLocation,
    geoStatus,
    reloadToday,
    handleClockIn,
    handleClockOut,
    handleBreakToggle,
  };
}
