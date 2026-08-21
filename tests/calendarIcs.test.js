import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildGoogleCalendarUrl,
  buildIcsCalendar,
  calendarIcsFromParts,
  formatIcsDateLocal,
  formatIcsDateTimeLocal,
  isPhoneCalendarSent,
  markPhoneCalendarSent,
  slugIcsFilename,
} from '../src/app/lib/calendarIcs.ts';

function installMemoryLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(String(k), String(v));
    },
    removeItem: (k) => {
      store.delete(String(k));
    },
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe('calendarIcs', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('formatea fechas locales', () => {
    const d = new Date(2026, 7, 21, 15, 30, 0);
    expect(formatIcsDateLocal(d)).toBe('20260821');
    expect(formatIcsDateTimeLocal(d)).toBe('20260821T153000');
  });

  it('genera VEVENT de día completo sin hora', () => {
    const ev = calendarIcsFromParts({
      uid: 'vertial-test@vertial.app',
      title: 'Boda Ana',
      date: '2026-08-21',
      location: 'Madrid',
    });
    expect(ev.allDay).toBe(true);
    const ics = buildIcsCalendar([ev]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260821');
    expect(ics).toContain('SUMMARY:Boda Ana');
    expect(ics).toContain('LOCATION:Madrid');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('genera VEVENT con hora', () => {
    const ev = calendarIcsFromParts({
      uid: 'vertial-appt-1@vertial.app',
      title: 'Cita cliente',
      date: '2026-08-21',
      timeHhMm: '10:00',
      durationMinutes: 90,
    });
    expect(ev.allDay).toBe(false);
    const ics = buildIcsCalendar([ev]);
    expect(ics).toContain('DTSTART:20260821T100000');
    expect(ics).toContain('DTEND:20260821T113000');
  });

  it('slug de fichero', () => {
    expect(slugIcsFilename('Boda Ana & Luis')).toMatch(/\.ics$/);
  });

  it('genera URL de Google Calendar sin archivo', () => {
    const ev = calendarIcsFromParts({
      uid: 'vertial-test@vertial.app',
      title: 'Boda Ana',
      date: '2026-08-21',
      timeHhMm: '20:00',
      location: 'Madrid',
    });
    const url = buildGoogleCalendarUrl(ev);
    expect(url).toContain('calendar.google.com');
    expect(url).toContain('action=TEMPLATE');
    expect(url).toContain('Boda');
    expect(url).toContain('20260821T200000');
  });

  it('marca enviados al móvil para no repetir en este dispositivo', () => {
    expect(isPhoneCalendarSent('ev-1')).toBe(false);
    markPhoneCalendarSent('ev-1');
    expect(isPhoneCalendarSent('ev-1')).toBe(true);
    expect(isPhoneCalendarSent('ev-2')).toBe(false);
  });

  it('detecta dispositivo Apple móvil', async () => {
    const { isLikelyAppleMobileDevice } = await import('../src/app/lib/calendarIcs.ts');
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 },
    });
    expect(isLikelyAppleMobileDevice()).toBe(true);
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', maxTouchPoints: 5 },
    });
    expect(isLikelyAppleMobileDevice()).toBe(false);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: original });
  });
});
