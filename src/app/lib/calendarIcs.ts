/**
 * Core Vertial — calendario externo (Google / Apple .ics).
 * Android/PC: Google Calendar (sin archivo).
 * iPhone/iPad: Calendario de Apple vía .ics (con avisos).
 */

export type CalendarIcsEvent = {
  /** UID estable (p. ej. vertial-appt-xxx@vertial.app). */
  uid: string;
  title: string;
  description?: string;
  location?: string;
  /** Inicio (fecha/hora local del evento). */
  start: Date;
  /** Fin opcional; si falta: +1 h (con hora) o mismo día (todo el día). */
  end?: Date;
  /** Sin hora concreta → evento de día completo. */
  allDay?: boolean;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** YYYYMMDD (local). */
export function formatIcsDateLocal(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/** YYYYMMDDTHHMMSS (local, floating — el móvil lo interpreta en su zona). */
export function formatIcsDateTimeLocal(d: Date): string {
  return `${formatIcsDateLocal(d)}T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

/** UTC stamp para DTSTAMP. */
function formatIcsDateTimeUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

function escapeIcsText(value: string): string {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return parts.join('\r\n');
}

function resolveEnd(ev: CalendarIcsEvent): Date {
  if (ev.end && !Number.isNaN(ev.end.getTime())) return ev.end;
  const start = ev.start;
  if (ev.allDay) {
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    return end;
  }
  return new Date(start.getTime() + 60 * 60 * 1000);
}

function buildVEvent(ev: CalendarIcsEvent, now: Date): string {
  const lines: string[] = ['BEGIN:VEVENT'];
  lines.push(`UID:${escapeIcsText(ev.uid)}`);
  lines.push(`DTSTAMP:${formatIcsDateTimeUtc(now)}`);
  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDateLocal(ev.start)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcsDateLocal(resolveEnd(ev))}`);
  } else {
    lines.push(`DTSTART:${formatIcsDateTimeLocal(ev.start)}`);
    lines.push(`DTEND:${formatIcsDateTimeLocal(resolveEnd(ev))}`);
  }
  lines.push(`SUMMARY:${escapeIcsText(ev.title || 'Evento Vertial')}`);
  if (ev.description) lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
  if (ev.location) lines.push(`LOCATION:${escapeIcsText(ev.location)}`);
  lines.push('BEGIN:VALARM');
  lines.push('ACTION:DISPLAY');
  lines.push('DESCRIPTION:Recordatorio Vertial');
  lines.push('TRIGGER:-P1D');
  lines.push('END:VALARM');
  lines.push('BEGIN:VALARM');
  lines.push('ACTION:DISPLAY');
  lines.push('DESCRIPTION:Recordatorio Vertial');
  lines.push('TRIGGER:-PT1H');
  lines.push('END:VALARM');
  lines.push('END:VEVENT');
  return lines.map(foldIcsLine).join('\r\n');
}

/** Genera el contenido de un archivo .ics (uno o varios VEVENT). */
export function buildIcsCalendar(events: CalendarIcsEvent[]): string {
  const now = new Date();
  const body = events
    .filter((e) => e.start && !Number.isNaN(e.start.getTime()))
    .map((e) => buildVEvent(e, now))
    .join('\r\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vertial//Calendar//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    body,
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function slugIcsFilename(title: string, fallback = 'vertial-evento'): string {
  const base = String(title || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .toLowerCase();
  return `${base || fallback}.ics`;
}

/** Descarga / abre .ics (Calendario de Apple en iOS). */
export function downloadIcsFile(icsContent: string, filename: string): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function downloadCalendarIcs(events: CalendarIcsEvent[], filename?: string): void {
  const ics = buildIcsCalendar(events);
  const name = filename || slugIcsFilename(events[0]?.title || 'vertial-calendario');
  downloadIcsFile(ics, name);
}

/**
 * URL de Google Calendar (plantilla “crear evento”).
 * En móvil abre la app/web de Google Calendar → confirmar → avisos del móvil.
 */
export function buildGoogleCalendarUrl(ev: CalendarIcsEvent, timeZone = 'Europe/Madrid'): string {
  const end = resolveEnd(ev);
  const dates = ev.allDay
    ? `${formatIcsDateLocal(ev.start)}/${formatIcsDateLocal(end)}`
    : `${formatIcsDateTimeLocal(ev.start)}/${formatIcsDateTimeLocal(end)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title || 'Evento Vertial',
    dates,
    ctz: timeZone,
  });
  if (ev.description) params.set('details', ev.description);
  if (ev.location) params.set('location', ev.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function isLikelyMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

/** iPhone / iPad (incluye iPadOS que se hace pasar por Mac). */
export function isLikelyAppleMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  const nav = navigator as Navigator & { maxTouchPoints?: number; platform?: string };
  if (nav.platform === 'MacIntel' && Number(nav.maxTouchPoints || 0) > 1) return true;
  return false;
}

/**
 * Añadir al calendario del teléfono sin bajar archivo:
 * abre Google Calendar para confirmar el evento.
 */
export function openInGoogleCalendar(ev: CalendarIcsEvent, timeZone = 'Europe/Madrid'): 'google' {
  const url = buildGoogleCalendarUrl(ev, timeZone);
  window.open(url, '_blank', 'noopener,noreferrer');
  return 'google';
}

/** Abre .ics para Calendario de Apple (iPhone/iPad). */
export function openInAppleCalendar(events: CalendarIcsEvent[], filename?: string): 'ics' {
  const list = Array.isArray(events) ? events.filter(Boolean) : [];
  if (list.length === 0) return 'ics';
  const name =
    filename ||
    (list.length > 1
      ? 'vertial-eventos.ics'
      : slugIcsFilename(list[0]?.title || 'vertial-evento'));
  downloadCalendarIcs(list, name);
  return 'ics';
}

/** Ids ya enviados a Google desde este navegador/móvil (anti-duplicado local). */
const PHONE_SENT_STORAGE_KEY = 'vertial.phoneCalendarSent.v1';

function readPhoneCalendarSentIds(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PHONE_SENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => String(x || '')).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writePhoneCalendarSentIds(ids: string[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    // Limitar tamaño por si acumulan mucho
    const trimmed = ids.slice(-500);
    localStorage.setItem(PHONE_SENT_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore quota
  }
}

export function isPhoneCalendarSent(eventId: string): boolean {
  const id = String(eventId || '').trim();
  if (!id) return false;
  return readPhoneCalendarSentIds().includes(id);
}

export function markPhoneCalendarSent(eventId: string): void {
  const id = String(eventId || '').trim();
  if (!id) return;
  const ids = readPhoneCalendarSentIds();
  if (ids.includes(id)) return;
  writePhoneCalendarSentIds([...ids, id]);
}

export function listPhoneCalendarSentIds(): string[] {
  return readPhoneCalendarSentIds();
}

/**
 * Flujo Vertial:
 * - iPhone/iPad → Calendario Apple (.ics)
 * - Resto → Google Calendar
 * - preferIcsDownload → forzar .ics
 */
export function addEventToPhoneCalendar(
  ev: CalendarIcsEvent,
  options?: { timeZone?: string; preferIcsDownload?: boolean },
): 'google' | 'ics' {
  if (options?.preferIcsDownload || isLikelyAppleMobileDevice()) {
    openInAppleCalendar([ev]);
    return 'ics';
  }
  openInGoogleCalendar(ev, options?.timeZone || 'Europe/Madrid');
  return 'google';
}

/** Varios de golpe (ideal en iOS: un solo .ics). En Google solo el primero. */
export function addEventsToPhoneCalendar(
  events: CalendarIcsEvent[],
  options?: { timeZone?: string; preferIcsDownload?: boolean },
): 'google' | 'ics' {
  const list = (events || []).filter((e) => e?.start && !Number.isNaN(e.start.getTime()));
  if (list.length === 0) return 'google';
  if (options?.preferIcsDownload || isLikelyAppleMobileDevice()) {
    openInAppleCalendar(list);
    return 'ics';
  }
  openInGoogleCalendar(list[0], options?.timeZone || 'Europe/Madrid');
  return 'google';
}

/**
 * Construye inicio desde fecha + hora HH:mm opcional.
 * Sin hora → allDay.
 */
export function calendarIcsFromParts(input: {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  date: Date | string;
  timeHhMm?: string | null;
  durationMinutes?: number;
}): CalendarIcsEvent {
  const base =
    typeof input.date === 'string'
      ? new Date(`${String(input.date).slice(0, 10)}T12:00:00`)
      : new Date(input.date);
  const time = String(input.timeHhMm || '').trim();
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) {
    const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    return {
      uid: input.uid,
      title: input.title,
      description: input.description,
      location: input.location,
      start,
      allDay: true,
    };
  }
  const start = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    Number(m[1]),
    Number(m[2]),
    0,
  );
  const mins = Math.max(15, Number(input.durationMinutes) || 60);
  return {
    uid: input.uid,
    title: input.title,
    description: input.description,
    location: input.location,
    start,
    end: new Date(start.getTime() + mins * 60 * 1000),
    allDay: false,
  };
}
