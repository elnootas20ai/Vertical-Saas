/**
 * Ajustes de presupuestos de eventos (por empresa).
 * Solo aplica lo que el usuario configura — sin inventar reglas.
 */
import * as XLSX from 'xlsx';
import type { QuoteLine } from './eventsTypes';

export const EVENTS_QUOTE_TEMPLATE_FILENAME = 'plantilla_partidas_presupuesto.xlsx';
export const EVENTS_QUOTE_TEMPLATE_SHEET = 'partidas';

/** Diseño del documento de presupuesto. */
export type EventsQuoteDesignMode = 'vertial' | 'custom';

export type EventsQuoteTemplateLine = {
  concepto: string;
  cantidad: number;
  precioUnitario: number;
};

export type EventsQuoteSettings = {
  /** Diseño Vertial (base) o plantilla propia subida. */
  designMode: EventsQuoteDesignMode;
  customTemplateFileName: string;
  /** data URL de la plantilla propia (PDF/imagen/Office), opcional. */
  customTemplateDataUrl: string;

  /** % depósito / anticipo sobre el total. */
  depositPercent: number;
  /** % resto a liquidar (sobre el total). */
  balancePercent: number;
  /** Días de validez (0 = sin regla). */
  validityDays: number;
  /** Anotaciones / reglas del presupuesto (texto libre). */
  annotations: string;

  /** Si true y hay partidas, el asistente arranca con ellas. */
  applyLinesOnNew: boolean;
  defaultLines: EventsQuoteTemplateLine[];

  /** Al marcar Finalizado, enviar por email el enlace de reseña. */
  reviewAutoSendOnFinish: boolean;
  /** URL de reseña (Google, Trustpilot, etc.). Solo tú la defines. */
  reviewUrl: string;
  /** Texto opcional del email de reseña. */
  reviewMessage: string;
};

/** Vacío a propósito: no inventamos % ni textos. */
export const DEFAULT_EVENTS_QUOTE_SETTINGS: EventsQuoteSettings = {
  designMode: 'vertial',
  customTemplateFileName: '',
  customTemplateDataUrl: '',
  depositPercent: 0,
  balancePercent: 0,
  validityDays: 0,
  annotations: '',
  applyLinesOnNew: false,
  defaultLines: [],
  reviewAutoSendOnFinish: false,
  reviewUrl: '',
  reviewMessage: '',
};

const CUSTOM_TEMPLATE_MAX_BYTES = 1_800_000;

function storageKey(businessId: string): string {
  const bid = String(businessId || '').replace(/^business:/, '').trim() || 'default';
  return `vertial:events:quote-settings:${bid}`;
}

function clampPercent(n: unknown): number {
  return Math.min(100, Math.max(0, Number(n) || 0));
}

function sanitizeLine(raw: unknown): EventsQuoteTemplateLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const concepto = String(row.concepto || '').trim();
  if (!concepto) return null;
  const cantidad = Math.max(0, Number(row.cantidad) || 0) || 1;
  const precioUnitario = Math.max(0, Number(row.precioUnitario) || 0);
  return { concepto, cantidad, precioUnitario };
}

export function normalizeEventsQuoteSettings(
  raw: Partial<EventsQuoteSettings> & { defaultNotes?: string } | null | undefined,
): EventsQuoteSettings {
  const incoming = raw || {};
  const designMode: EventsQuoteDesignMode =
    incoming.designMode === 'custom' ? 'custom' : 'vertial';
  const lines = Array.isArray(incoming.defaultLines)
    ? (incoming.defaultLines.map(sanitizeLine).filter(Boolean) as EventsQuoteTemplateLine[])
    : [];
  const annotations = String(
    incoming.annotations != null ? incoming.annotations : (incoming.defaultNotes || ''),
  ).trim();

  return {
    designMode,
    customTemplateFileName: String(incoming.customTemplateFileName || '').trim(),
    customTemplateDataUrl: String(incoming.customTemplateDataUrl || ''),
    depositPercent: clampPercent(incoming.depositPercent),
    balancePercent: clampPercent(incoming.balancePercent),
    validityDays: Math.min(365, Math.max(0, Math.round(Number(incoming.validityDays) || 0))),
    annotations,
    applyLinesOnNew: Boolean(incoming.applyLinesOnNew) && lines.length > 0,
    defaultLines: lines,
    reviewUrl: String(incoming.reviewUrl || '').trim(),
    reviewMessage: String(incoming.reviewMessage || '').trim(),
    reviewAutoSendOnFinish:
      Boolean(incoming.reviewAutoSendOnFinish) && Boolean(String(incoming.reviewUrl || '').trim()),
  };
}

export function loadEventsQuoteSettings(businessId: string): EventsQuoteSettings {
  try {
    const raw = localStorage.getItem(storageKey(businessId));
    if (!raw) return { ...DEFAULT_EVENTS_QUOTE_SETTINGS };
    return normalizeEventsQuoteSettings(JSON.parse(raw) as Partial<EventsQuoteSettings>);
  } catch {
    return { ...DEFAULT_EVENTS_QUOTE_SETTINGS };
  }
}

export function saveEventsQuoteSettings(businessId: string, settings: EventsQuoteSettings): void {
  const normalized = normalizeEventsQuoteSettings(settings);
  localStorage.setItem(storageKey(businessId), JSON.stringify(normalized));
}

export function templateLinesToQuoteLines(
  lines: EventsQuoteTemplateLine[],
  makeId: () => string = () => `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
): QuoteLine[] {
  return lines
    .map((l) => sanitizeLine(l))
    .filter(Boolean)
    .map((l) => {
      const line = l!;
      const cantidad = line.cantidad > 0 ? line.cantidad : 1;
      const precioUnitario = Math.max(0, line.precioUnitario);
      return {
        id: makeId(),
        concepto: line.concepto,
        cantidad,
        precioUnitario,
        total: Math.round(cantidad * precioUnitario * 100) / 100,
      };
    });
}

export function suggestedDepositFromTotal(total: number, percent: number): number {
  const p = clampPercent(percent);
  if (!(total > 0) || !(p > 0)) return 0;
  return Math.round(total * (p / 100) * 100) / 100;
}

/** ¿Hay que enviar reseña al finalizar? Solo si tú lo configuraste. */
export function shouldAutoSendReviewOnFinish(
  settings: EventsQuoteSettings,
  event: { clientEmail?: string; reviewInviteSentAt?: string } | null | undefined,
): boolean {
  if (!settings.reviewAutoSendOnFinish) return false;
  if (!settings.reviewUrl.trim()) return false;
  if (event?.reviewInviteSentAt) return false;
  const email = String(event?.clientEmail || '').trim();
  return Boolean(email && email.includes('@'));
}

/** Texto de reglas solo con lo configurado (sin inventar). */
export function buildQuoteRulesText(settings: EventsQuoteSettings): string {
  const parts: string[] = [];
  if (settings.annotations.trim()) parts.push(settings.annotations.trim());
  const ruleBits: string[] = [];
  if (settings.depositPercent > 0) {
    ruleBits.push(`Depósito / anticipo: ${settings.depositPercent}% del total`);
  }
  if (settings.balancePercent > 0) {
    ruleBits.push(`Resto a liquidar: ${settings.balancePercent}% del total`);
  }
  if (settings.validityDays > 0) {
    ruleBits.push(
      `Validez: ${settings.validityDays} día${settings.validityDays === 1 ? '' : 's'}`,
    );
  }
  if (ruleBits.length) parts.push(ruleBits.join(' · '));
  return parts.join('\n\n');
}

export function downloadEventsQuoteTemplate(lines?: EventsQuoteTemplateLine[]): void {
  const rows = (lines && lines.length > 0 ? lines : [{ concepto: '', cantidad: 1, precioUnitario: 0 }]).map((l) => ({
    Concepto: l.concepto || '',
    Cantidad: l.cantidad > 0 ? l.cantidad : 1,
    Precio: l.precioUnitario || 0,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, EVENTS_QUOTE_TEMPLATE_SHEET);
  XLSX.writeFile(wb, EVENTS_QUOTE_TEMPLATE_FILENAME);
}

function parseEsNumber(raw: unknown): number {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export async function parseEventsQuoteTemplateFile(file: File): Promise<EventsQuoteTemplateLine[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames.includes(EVENTS_QUOTE_TEMPLATE_SHEET)
    ? EVENTS_QUOTE_TEMPLATE_SHEET
    : wb.SheetNames[0];
  if (!sheetName) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: '' });
  const out: EventsQuoteTemplateLine[] = [];
  for (const row of rows) {
    const keys = Object.keys(row);
    const find = (...aliases: string[]) => {
      const hit = keys.find((k) => aliases.includes(String(k).trim().toLowerCase()));
      return hit ? row[hit] : '';
    };
    const concepto = String(
      find('concepto', 'nombre', 'descripcion', 'descripción', 'partida', 'servicio', 'concept') || '',
    ).trim();
    if (!concepto) continue;
    const cantidad = Math.max(0, parseEsNumber(find('cantidad', 'qty', 'uds', 'unidades', 'quantity'))) || 1;
    const precioUnitario = Math.max(
      0,
      parseEsNumber(find('precio', 'precio unitario', 'pvp', 'importe', 'price', 'tarifa')),
    );
    out.push({ concepto, cantidad, precioUnitario });
  }
  return out;
}

/** Lee plantilla de diseño (PDF/imagen/Office) como data URL. */
export function readDesignTemplateFile(file: File): Promise<{ fileName: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    if (file.size > CUSTOM_TEMPLATE_MAX_BYTES) {
      reject(new Error('La plantilla es demasiado grande (máx. ~1,5 MB)'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl.startsWith('data:')) {
        reject(new Error('No se pudo leer el archivo'));
        return;
      }
      resolve({ fileName: file.name, dataUrl });
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}
