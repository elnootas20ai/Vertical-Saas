import {
  formatKitchenExtraLabel,
  formatRemovedIngredientLabel,
} from '../deliveryTicketHelpers';
import { walkTicketLineCustomization, type TicketDocument } from './ticketDocument';

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Tamaño de fuente ESC/POS (GS ! n). */
const SIZE_NORMAL = 0x00;
/** Doble alto — cuerpo legible en cocina/mostrador. */
const SIZE_TALL = 0x01;
/** Doble ancho + doble alto — títulos. */
const SIZE_TITLE = 0x11;

/** Simplifica caracteres para impresoras térmicas antiguas. */
export function sanitizeEscposText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/€/g, 'EUR')
    .replace(/[×✕✖⨉]/g, 'x') // cantidades combo: "Aquarius x3" (si no, sale "?3")
    .replace(/[·•]/g, '-') // punto medio → guion (si no, sale "?")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '?');
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function colsForSize(paperWidthMm: 58 | 80, size: number): number {
  const base = paperWidthMm === 58 ? 32 : 42;
  return (size & 0x10) ? Math.floor(base / 2) : base;
}

/** Parte texto largo en varias líneas (antes se cortaba y no se veía). */
export function wrapEscposLines(value: string, width: number): string[] {
  const text = sanitizeEscposText(value);
  if (!text) return [''];
  const safeWidth = Math.max(8, width);
  const out: string[] = [];
  let rest = text;
  while (rest.length > safeWidth) {
    let cut = rest.lastIndexOf(' ', safeWidth);
    if (cut < Math.floor(safeWidth * 0.4)) cut = safeWidth;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length) out.push(rest);
  return out.length ? out : [''];
}

function textLine(value: string, width = 42): Uint8Array {
  const lines = wrapEscposLines(value, width);
  return concat(
    lines.map(
      (line) => new Uint8Array([...line.split('').map((c) => c.charCodeAt(0)), LF]),
    ),
  );
}

function command(bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

function setSize(size: number): Uint8Array {
  return command([GS, 0x21, size & 0xff]);
}

function money(value: number): string {
  return `${Number(value || 0).toFixed(2)} EUR`;
}

function row(left: string, right: string, width = 42): string {
  const l = sanitizeEscposText(left);
  const r = sanitizeEscposText(right);
  const space = Math.max(1, width - l.length - r.length);
  return `${l}${' '.repeat(space)}${r}`.slice(0, width);
}

function sepLine(width: number): string {
  return '-'.repeat(Math.min(width, 32));
}

/** Fila importe: el nombre se envuelve; el precio va en la última línea. */
function pushMoneyRow(chunks: Uint8Array[], left: string, right: string, width: number) {
  const r = sanitizeEscposText(right);
  const maxLeft = Math.max(8, width - r.length - 1);
  const wrapped = wrapEscposLines(left, maxLeft);
  for (let i = 0; i < wrapped.length; i += 1) {
    if (i === wrapped.length - 1) {
      chunks.push(textLine(row(wrapped[i], r, width), width));
    } else {
      chunks.push(textLine(wrapped[i], width));
    }
  }
}

function pushLineDetail(
  chunks: Uint8Array[],
  line: TicketDocument['lines'][number],
  width: number,
  paperWidthMm: 58 | 80,
) {
  const tallCols = colsForSize(paperWidthMm, SIZE_TALL);
  chunks.push(setSize(SIZE_TALL));
  chunks.push(setBold(true));
  chunks.push(textLine(`${line.qty}x ${line.name}`, tallCols));
  chunks.push(setBold(false));
  chunks.push(setSize(SIZE_NORMAL));
  walkTicketLineCustomization(line, {
    onComposition: (name) => chunks.push(textLine(`  > ${name}`, width)),
    onAdded: (name, nested) => chunks.push(textLine(`${nested ? '    ' : '  '}+ ${name}`, width)),
    onRemoved: (name, nested) =>
      chunks.push(textLine(`${nested ? '    ' : '  '}${formatRemovedIngredientLabel(name)}`, width)),
    onNote: (note, nested) => chunks.push(textLine(`${nested ? '    ' : '  '}NOTA: ${note}`, width)),
  });
}

/** ESC E n — negrita on/off. */
function setBold(on: boolean): Uint8Array {
  return command([ESC, 0x45, on ? 1 : 0]);
}

/** ESC r n — color (0 negro / 1 rojo si la impresora tiene 2 colores). */
function setPrintColor(red: boolean): Uint8Array {
  return command([ESC, 0x72, red ? 1 : 0]);
}

/**
 * Línea de producto en comanda cocina:
 * `xN Nombre` negrita + doble ancho/alto (un poco más grande).
 * Composición / extras / notas en normal.
 */
function pushKitchenLineDetail(
  chunks: Uint8Array[],
  line: TicketDocument['lines'][number],
  paperWidthMm: 58 | 80,
) {
  const titleCols = colsForSize(paperWidthMm, SIZE_TITLE);
  chunks.push(setSize(SIZE_TITLE));
  chunks.push(setBold(true));
  chunks.push(textLine(`${line.qty}x ${line.name}`, titleCols));
  chunks.push(setBold(false));
  chunks.push(setSize(SIZE_NORMAL));

  walkTicketLineCustomization(line, {
    onComposition: (name) => {
      chunks.push(textLine(`  > ${name}`, widthFor(paperWidthMm)));
    },
    onAdded: (name, nested) => {
      chunks.push(setPrintColor(true));
      chunks.push(
        textLine(
          `${nested ? '    ' : '  '}${formatKitchenExtraLabel(name)}`,
          widthFor(paperWidthMm),
        ),
      );
      chunks.push(setPrintColor(false));
    },
    onRemoved: (name, nested) => {
      chunks.push(setPrintColor(true));
      chunks.push(
        textLine(
          `${nested ? '    ' : '  '}${formatRemovedIngredientLabel(name)}`,
          widthFor(paperWidthMm),
        ),
      );
      chunks.push(setPrintColor(false));
    },
    onNote: (note, nested) => {
      chunks.push(textLine(`${nested ? '    ' : '  '}NOTA: ${note}`, widthFor(paperWidthMm)));
    },
  });
}

function widthFor(paperWidthMm: 58 | 80): number {
  return colsForSize(paperWidthMm, SIZE_NORMAL);
}

/** Blanco fijo al final (antes del corte). El cuerpo crece con el pedido. */
export const TICKET_TAIL_FEED_CM = {
  kitchen: 6,
  /** Default cliente/delivery; se puede sobrescribir por PDV (ticketBottomFeedCm). */
  customer: 8,
  delivery: 8,
} as const;

/** 203 dpi típico Epson TM ≈ 8 dots/mm. */
const DOTS_PER_MM = 8;

/**
 * Margen superior: la cuchilla suele dejar el inicio del papel encima del cabezal.
 * Antes: 1 línea (~0,4 cm). Ahora ~0,1 cm (bajamos ~0,3 cm a petición).
 */
const TICKET_TOP_FEED_CM = 0.1;

function pushTopMargin(chunks: Uint8Array[]) {
  pushFeedDots(chunks, TICKET_TOP_FEED_CM * 10 * DOTS_PER_MM);
}

/** ESC J n — avanza n dots (máx. 255 por comando). */
function pushFeedDots(chunks: Uint8Array[], dots: number) {
  let left = Math.max(0, Math.round(dots));
  while (left > 0) {
    const n = Math.min(255, left);
    chunks.push(command([ESC, 0x4a, n]));
    left -= n;
  }
}

/**
 * Avance de base en cm + corte. Cocina ~6 cm; ticket normal ~8 cm (ajustable por PDV).
 * Solo el pie en blanco: si hay más líneas, el ticket se alarga solo.
 */
function pushFeedAndCut(chunks: Uint8Array[], feedCm: number) {
  chunks.push(setSize(SIZE_NORMAL));
  pushFeedDots(chunks, feedCm * 10 * DOTS_PER_MM);
  // GS V 0 — un solo corte completo
  chunks.push(command([GS, 0x56, 0]));
}

export type EncodeTicketFeedOptions = {
  /** Blanco abajo cliente/delivery (cm). Cocina ignora este valor. */
  customerTailFeedCm?: number;
};

export function tailFeedCmForVariant(
  variant: TicketDocument['variant'],
  customerTailFeedCm?: number,
): number {
  if (variant === 'kitchen') return TICKET_TAIL_FEED_CM.kitchen;
  const n = Number(customerTailFeedCm);
  if (Number.isFinite(n)) {
    // Mismo rango que clampTicketBottomFeedCm (4–18); evitar import circular.
    return Math.min(18, Math.max(4, Math.round(n)));
  }
  if (variant === 'delivery') return TICKET_TAIL_FEED_CM.delivery;
  return TICKET_TAIL_FEED_CM.customer;
}

/** Dirección del cliente: en domicilio un poco más marcada (negrita). */
function pushCustomerDir(
  chunks: Uint8Array[],
  doc: TicketDocument,
  width: number,
  paperWidthMm: 58 | 80,
) {
  if (!doc.customerAddress) return;
  const tallCols = colsForSize(paperWidthMm, SIZE_TALL);
  chunks.push(setSize(SIZE_TALL));
  if (doc.emphasizeCustomerAddress) {
    chunks.push(command([ESC, 0x45, 1]));
  }
  chunks.push(textLine(`Dir: ${doc.customerAddress}`, tallCols));
  if (doc.emphasizeCustomerAddress) {
    chunks.push(command([ESC, 0x45, 0]));
  }
  chunks.push(setSize(SIZE_NORMAL));
}

function pushCenteredTitle(chunks: Uint8Array[], title: string, paperWidthMm: 58 | 80) {
  const cols = colsForSize(paperWidthMm, SIZE_TITLE);
  chunks.push(command([ESC, 0x61, 1]));
  chunks.push(setSize(SIZE_TITLE));
  chunks.push(command([ESC, 0x45, 1]));
  chunks.push(textLine(title, cols));
  chunks.push(command([ESC, 0x45, 0]));
  chunks.push(setSize(SIZE_NORMAL));
}

export function encodeTicketEscpos(
  doc: TicketDocument,
  paperWidthMm: 58 | 80 = 80,
  feedOptions?: EncodeTicketFeedOptions,
): Uint8Array {
  const width = colsForSize(paperWidthMm, SIZE_NORMAL);
  const tallCols = colsForSize(paperWidthMm, SIZE_TALL);
  const customerFeed = feedOptions?.customerTailFeedCm;
  const chunks: Uint8Array[] = [
    command([ESC, 0x40]),
  ];
  pushTopMargin(chunks);

  // Comanda cocina: nombre + calle arriba del todo; luego pedido/tipo/tel, productos, notas.
  // Sin importes ni datos fiscales. Misma plantilla para todas las tiendas del negocio.
  if (doc.variant === 'kitchen') {
    chunks.push(command([ESC, 0x61, 0]));
    if (doc.customerName) {
      chunks.push(setSize(SIZE_TITLE));
      chunks.push(setBold(true));
      chunks.push(textLine(doc.customerName, colsForSize(paperWidthMm, SIZE_TITLE)));
      chunks.push(setBold(false));
      chunks.push(setSize(SIZE_NORMAL));
    }
    if (doc.customerAddress) {
      chunks.push(setSize(SIZE_TALL));
      chunks.push(setBold(true));
      chunks.push(textLine(doc.customerAddress, tallCols));
      chunks.push(setBold(false));
      chunks.push(setSize(SIZE_NORMAL));
    }
    chunks.push(textLine(sepLine(width), width));

    pushCenteredTitle(chunks, doc.title, paperWidthMm);
    chunks.push(command([ESC, 0x61, 1]));
    chunks.push(textLine(`${doc.ticketNo} - ${doc.dateLabel}`, width));
    chunks.push(textLine(sepLine(width), width));
    chunks.push(command([ESC, 0x61, 0]));

    // +2 negrita: doble alto + ESC E (antes solo doble alto).
    chunks.push(setSize(SIZE_TALL));
    chunks.push(setBold(true));
    chunks.push(textLine(`Pedido: #${doc.orderNumber}`, tallCols));
    chunks.push(setBold(false));
    chunks.push(setSize(SIZE_NORMAL));
    if (doc.deliveryTypeLabel) {
      // Un poco más marcado que Pedido/Tel: doble ancho+alto + negrita (domicilio / recogida).
      chunks.push(setSize(SIZE_TITLE));
      chunks.push(setBold(true));
      chunks.push(textLine(doc.deliveryTypeLabel, colsForSize(paperWidthMm, SIZE_TITLE)));
      chunks.push(setBold(false));
      chunks.push(setSize(SIZE_NORMAL));
    }
    if (doc.customerPhone) {
      chunks.push(setSize(SIZE_TALL));
      chunks.push(setBold(true));
      chunks.push(textLine(`Tel: ${doc.customerPhone}`, tallCols));
      chunks.push(setBold(false));
      chunks.push(setSize(SIZE_NORMAL));
    }
    if (doc.paymentLabel) {
      chunks.push(setSize(SIZE_TALL));
      chunks.push(setBold(true));
      chunks.push(textLine(`Pago: ${doc.paymentLabel}`, tallCols));
      chunks.push(setBold(false));
      chunks.push(setSize(SIZE_NORMAL));
    }
    chunks.push(textLine(sepLine(width), width));
    for (const line of doc.lines) {
      pushKitchenLineDetail(chunks, line, paperWidthMm);
    }
    if (doc.orderNotes) {
      chunks.push(textLine(sepLine(width), width));
      chunks.push(setSize(SIZE_TALL));
      chunks.push(setBold(true));
      chunks.push(textLine(`NOTA: ${doc.orderNotes}`, tallCols));
      chunks.push(setBold(false));
      chunks.push(setSize(SIZE_NORMAL));
    }
    chunks.push(command([ESC, 0x61, 1]));
    chunks.push(textLine(doc.footer, width));
    pushFeedAndCut(chunks, tailFeedCmForVariant(doc.variant, customerFeed));
    return concat(chunks);
  }

  chunks.push(command([ESC, 0x61, 1]));

  // Emisor más grande
  chunks.push(setSize(SIZE_TALL));
  chunks.push(textLine(doc.issuer, tallCols));
  chunks.push(setSize(SIZE_NORMAL));

  if (doc.taxId) chunks.push(textLine(`NIF/CIF: ${doc.taxId}`, width));
  if (doc.addressLine) chunks.push(textLine(doc.addressLine, width));
  if (doc.phone) chunks.push(textLine(`Tel: ${doc.phone}`, width));

  chunks.push(textLine(sepLine(width), width));
  pushCenteredTitle(chunks, doc.title, paperWidthMm);
  chunks.push(command([ESC, 0x61, 1]));
  chunks.push(textLine(`${doc.ticketNo} - ${doc.dateLabel}`, width));
  chunks.push(textLine(sepLine(width), width));
  chunks.push(command([ESC, 0x61, 0]));

  if (doc.salesPointName) chunks.push(textLine(`Tienda: ${doc.salesPointName}`, width));
  chunks.push(setSize(SIZE_TALL));
  chunks.push(textLine(`Pedido: #${doc.orderNumber}`, tallCols));
  chunks.push(setSize(SIZE_NORMAL));

  if (doc.variant === 'delivery') {
    // Hoja de fuera / rider: dirección y teléfono bien grandes
    if (doc.deliveryTypeLabel) {
      chunks.push(setSize(SIZE_TALL));
      chunks.push(textLine(doc.deliveryTypeLabel, tallCols));
      chunks.push(setSize(SIZE_NORMAL));
    }
    chunks.push(setSize(SIZE_TITLE));
    chunks.push(textLine(doc.customerName, colsForSize(paperWidthMm, SIZE_TITLE)));
    chunks.push(setSize(SIZE_NORMAL));
    if (doc.customerPhone) {
      chunks.push(setSize(SIZE_TALL));
      chunks.push(textLine(`Tel: ${doc.customerPhone}`, tallCols));
      chunks.push(setSize(SIZE_NORMAL));
    }
    pushCustomerDir(chunks, doc, width, paperWidthMm);
    chunks.push(textLine(sepLine(width), width));
    for (const line of doc.lines) {
      pushLineDetail(chunks, line, width, paperWidthMm);
    }
    chunks.push(textLine(sepLine(width), width));
    chunks.push(setSize(SIZE_TITLE));
    chunks.push(command([ESC, 0x45, 1]));
    pushMoneyRow(chunks, 'TOTAL', money(doc.total), colsForSize(paperWidthMm, SIZE_TITLE));
    chunks.push(command([ESC, 0x45, 0]));
    chunks.push(setSize(SIZE_NORMAL));
    if (doc.paymentLabel) {
      chunks.push(setSize(SIZE_TALL));
      chunks.push(textLine(`Metodo: ${doc.paymentLabel}`, tallCols));
      chunks.push(setSize(SIZE_NORMAL));
    }
    if (doc.paymentStatusLabel) {
      chunks.push(textLine(doc.paymentStatusLabel, width));
    }
    if (doc.orderNotes) {
      chunks.push(setSize(SIZE_TALL));
      chunks.push(textLine(`NOTA: ${doc.orderNotes}`, tallCols));
      chunks.push(setSize(SIZE_NORMAL));
    }
  } else {
    // Ticket cliente (el que va fuera con el pedido): legible y con total grande
    chunks.push(setSize(SIZE_TALL));
    chunks.push(textLine(`Cliente: ${doc.customerName}`, tallCols));
    chunks.push(setSize(SIZE_NORMAL));
    if (doc.customerPhone) {
      chunks.push(setSize(SIZE_TALL));
      chunks.push(textLine(`Tel: ${doc.customerPhone}`, tallCols));
      chunks.push(setSize(SIZE_NORMAL));
    }
    pushCustomerDir(chunks, doc, width, paperWidthMm);
    if (doc.deliveryTypeLabel) chunks.push(textLine(doc.deliveryTypeLabel, width));
    if (doc.cashierName) chunks.push(textLine(`Atendido: ${doc.cashierName}`, width));
    chunks.push(textLine(sepLine(width), width));

    for (const line of doc.lines) {
      chunks.push(setSize(SIZE_TALL));
      chunks.push(setBold(true));
      pushMoneyRow(chunks, `${line.qty}x ${line.name}`, money(line.total), tallCols);
      chunks.push(setBold(false));
      chunks.push(setSize(SIZE_NORMAL));
      walkTicketLineCustomization(line, {
        onComposition: (name) => chunks.push(textLine(`  > ${name}`, width)),
        onAdded: (name, nested) =>
          chunks.push(textLine(`${nested ? '    ' : '  '}+ ${name}`, width)),
        onRemoved: (name, nested) =>
          chunks.push(
            textLine(`${nested ? '    ' : '  '}${formatRemovedIngredientLabel(name)}`, width),
          ),
        onNote: (note, nested) =>
          chunks.push(textLine(`${nested ? '    ' : '  '}NOTA: ${note}`, width)),
      });
    }

    chunks.push(textLine(sepLine(width), width));
    pushMoneyRow(chunks, 'Base imponible', money(doc.base), width);
    pushMoneyRow(chunks, `IVA ${doc.vatRate}%`, money(doc.vat), width);
    chunks.push(textLine(sepLine(width), width));
    chunks.push(setSize(SIZE_TITLE));
    chunks.push(command([ESC, 0x45, 1]));
    pushMoneyRow(
      chunks,
      doc.isRefund ? 'TOTAL DEV.' : 'TOTAL',
      `${doc.isRefund ? '-' : ''}${money(doc.total)}`,
      colsForSize(paperWidthMm, SIZE_TITLE),
    );
    chunks.push(command([ESC, 0x45, 0]));
    chunks.push(setSize(SIZE_NORMAL));
    chunks.push(textLine(sepLine(width), width));
    if (doc.paymentLabel) {
      chunks.push(setSize(SIZE_TALL));
      chunks.push(textLine(`Metodo: ${doc.paymentLabel}`, tallCols));
      chunks.push(setSize(SIZE_NORMAL));
    }
    if (doc.paymentStatusLabel) {
      chunks.push(textLine(doc.paymentStatusLabel, width));
    }

    if (doc.refundReason) chunks.push(textLine(`Motivo: ${doc.refundReason}`, width));
  }

  chunks.push(command([ESC, 0x61, 1]));
  chunks.push(textLine(doc.footer, width));
  if (doc.variant === 'customer') {
    chunks.push(textLine('Gracias por su visita', width));
  }
  pushFeedAndCut(chunks, tailFeedCmForVariant(doc.variant, customerFeed));

  return concat(chunks);
}

/** Ticket corto para identificar una impresora concreta durante la búsqueda WiFi. */
export function encodeIdentifyTicketEscpos(host: string, port: number, paperWidthMm: 58 | 80 = 80): Uint8Array {
  const width = colsForSize(paperWidthMm, SIZE_NORMAL);
  const titleCols = colsForSize(paperWidthMm, SIZE_TITLE);
  const now = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  return concat([
    command([ESC, 0x40]),
    command([ESC, 0x64, 1]),
    command([ESC, 0x61, 1]),
    command([ESC, 0x45, 1]),
    setSize(SIZE_TALL),
    textLine('VERTIAL', colsForSize(paperWidthMm, SIZE_TALL)),
    command([ESC, 0x45, 0]),
    setSize(SIZE_NORMAL),
    textLine('', width),
    setSize(SIZE_TITLE),
    textLine('ESTA ES TU', titleCols),
    textLine('IMPRESORA', titleCols),
    setSize(SIZE_NORMAL),
    textLine('', width),
    textLine(`${host}:${port}`, width),
    textLine(now, width),
    textLine('', width),
    textLine('Vuelve a la app y pulsa', width),
    textLine('"Usar esta impresora"', width),
    textLine('', width),
    command([ESC, 0x64, 4]),
    command([GS, 0x56, 0]),
  ]);
}

export function encodeTestTicketEscpos(
  paperWidthMm: 58 | 80 = 80,
  feedOptions?: EncodeTicketFeedOptions,
): Uint8Array {
  const now = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  return encodeTicketEscpos({
    variant: 'customer',
    title: 'PRUEBA',
    ticketNo: 'TEST-001',
    dateLabel: now,
    issuer: 'Vertial Print',
    taxId: '',
    addressLine: '',
    phone: '',
    salesPointName: '',
    orderNumber: '0000',
    customerName: 'Impresion de prueba',
    customerPhone: '',
    customerAddress: '',
    emphasizeCustomerAddress: false,
    deliveryTypeLabel: '',
    cashierName: '',
    lines: [{ qty: 1, name: 'Producto demo', total: 9.99 }],
    base: 8.26,
    vat: 1.73,
    vatRate: 10,
    total: 9.99,
    paymentLabel: 'Efectivo',
    paymentStatusLabel: 'Cobrado',
    refundReason: '',
    orderNotes: '',
    footer: 'Si ves esto, la impresora funciona',
    isRefund: false,
  }, paperWidthMm, feedOptions);
}

/** Etiqueta de mostrador carnicería (sin IVA ni layout de ticket de venta). */
export function encodeButcherLabelEscpos(
  data: {
    businessName?: string;
    nombre: string;
    precioKg: number;
    pesoKg?: number;
    lote?: string | null;
    caducidad?: string | null;
    origen?: string | null;
    alergenos?: string | null;
  },
  paperWidthMm: 58 | 80 = 58,
): Uint8Array {
  const width = colsForSize(paperWidthMm, SIZE_NORMAL);
  const titleW = colsForSize(paperWidthMm, SIZE_TITLE);
  const moneyFmt = (n: number) => `${Number(n || 0).toFixed(2)} EUR`;
  const cad = String(data.caducidad || '').slice(0, 10);
  let cadLabel = '';
  if (cad) {
    const [y, m, d] = cad.split('-');
    cadLabel = y && m && d ? `${d}/${m}/${y}` : cad;
  }
  const peso = Number(data.pesoKg || 0);
  const chunks: Uint8Array[] = [
    command([ESC, 0x40]),
    command([ESC, 0x61, 0x01]),
    setSize(SIZE_NORMAL),
    textLine(data.businessName || 'Carniceria', width),
    setSize(SIZE_TITLE),
    ...wrapEscposLines(data.nombre || 'Producto', titleW).map((l) => textLine(l, titleW)),
    setSize(SIZE_TALL),
    textLine(`${moneyFmt(data.precioKg)}/kg`, colsForSize(paperWidthMm, SIZE_TALL)),
  ];
  if (peso > 0) {
    chunks.push(setSize(SIZE_NORMAL));
    chunks.push(textLine(`Peso ${peso.toFixed(3)} kg`, width));
    chunks.push(setSize(SIZE_TALL));
    chunks.push(textLine(moneyFmt(peso * data.precioKg), colsForSize(paperWidthMm, SIZE_TALL)));
  }
  chunks.push(setSize(SIZE_NORMAL));
  chunks.push(command([ESC, 0x61, 0x00]));
  if (data.lote) chunks.push(textLine(`Lote: ${data.lote}`, width));
  if (cadLabel) chunks.push(textLine(`Cad: ${cadLabel}`, width));
  if (data.origen) chunks.push(textLine(`Origen: ${data.origen}`, width));
  if (data.alergenos) chunks.push(textLine(`Alergenos: ${data.alergenos}`, width));
  chunks.push(textLine('----------------', width));
  chunks.push(textLine('Producto fresco', width));
  chunks.push(command([LF, LF]));
  chunks.push(command([GS, 0x56, 0x00]));
  return concat(chunks);
}
