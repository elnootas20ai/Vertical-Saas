import type { TicketDocument } from './ticketDocument';

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
  chunks.push(textLine(`${line.qty}x ${line.name}`, tallCols));
  chunks.push(setSize(SIZE_NORMAL));
  for (const name of line.added || []) {
    chunks.push(textLine(`  + ${name}`, width));
  }
  for (const name of line.removed || []) {
    chunks.push(textLine(`  SIN ${name}`, width));
  }
  if (line.note) {
    chunks.push(textLine(`  NOTA: ${line.note}`, width));
  }
}

/**
 * Margen superior: la cuchilla suele dejar el inicio del papel encima del cabezal.
 * Sin este avance, el título/negocio salen cortados.
 */
function pushTopMargin(chunks: Uint8Array[]) {
  // 6 líneas: al imprimir Cocina + Cliente seguidos, el 2º no debe empezar cortado
  chunks.push(command([ESC, 0x64, 6]));
}

/**
 * Avance amplio + corte: el pie debe quedar por encima de la cuchilla.
 * Con ESC d 5 el pie del ticket anterior quedaba a medias en el siguiente.
 */
function pushFeedAndCut(chunks: Uint8Array[], width: number) {
  chunks.push(setSize(SIZE_NORMAL));
  chunks.push(textLine('', width));
  chunks.push(textLine('', width));
  chunks.push(textLine('', width));
  chunks.push(textLine('', width));
  // ~14 líneas ≈ margen seguro hasta la cuchilla en HPRT / térmicas 80 mm
  chunks.push(command([ESC, 0x64, 14]));
  // GS V 0 — un solo corte completo
  chunks.push(command([GS, 0x56, 0]));
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

export function encodeTicketEscpos(doc: TicketDocument, paperWidthMm: 58 | 80 = 80): Uint8Array {
  const width = colsForSize(paperWidthMm, SIZE_NORMAL);
  const tallCols = colsForSize(paperWidthMm, SIZE_TALL);
  const chunks: Uint8Array[] = [
    command([ESC, 0x40]),
  ];
  pushTopMargin(chunks);
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
  chunks.push(textLine(`${doc.ticketNo} · ${doc.dateLabel}`, width));
  chunks.push(textLine(sepLine(width), width));
  chunks.push(command([ESC, 0x61, 0]));

  if (doc.salesPointName) chunks.push(textLine(`Tienda: ${doc.salesPointName}`, width));
  chunks.push(setSize(SIZE_TALL));
  chunks.push(textLine(`Pedido: #${doc.orderNumber}`, tallCols));
  chunks.push(setSize(SIZE_NORMAL));

  if (doc.variant === 'kitchen') {
    if (doc.deliveryTypeLabel) chunks.push(textLine(doc.deliveryTypeLabel, width));
    chunks.push(textLine(`Cliente: ${doc.customerName}`, width));
    if (doc.customerPhone) chunks.push(textLine(`Tel: ${doc.customerPhone}`, width));
    if (doc.customerAddress) chunks.push(textLine(`Dir: ${doc.customerAddress}`, width));
    if (doc.cashierName) chunks.push(textLine(`Atendido: ${doc.cashierName}`, width));
    chunks.push(textLine(sepLine(width), width));
    for (const line of doc.lines) {
      pushLineDetail(chunks, line, width, paperWidthMm);
    }
    if (doc.orderNotes) {
      chunks.push(textLine(sepLine(width), width));
      chunks.push(setSize(SIZE_TALL));
      chunks.push(textLine(`NOTA: ${doc.orderNotes}`, tallCols));
      chunks.push(setSize(SIZE_NORMAL));
    }
  } else if (doc.variant === 'delivery') {
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
    if (doc.customerAddress) {
      chunks.push(setSize(SIZE_TALL));
      chunks.push(textLine(`Dir: ${doc.customerAddress}`, tallCols));
      chunks.push(setSize(SIZE_NORMAL));
    }
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
    chunks.push(setSize(SIZE_TALL));
    chunks.push(textLine(doc.paymentStatusLabel, tallCols));
    chunks.push(setSize(SIZE_NORMAL));
    if (doc.paymentLabel && doc.paymentLabel !== '-') {
      chunks.push(textLine(doc.paymentLabel, width));
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
    if (doc.customerAddress) {
      chunks.push(setSize(SIZE_TALL));
      chunks.push(textLine(`Dir: ${doc.customerAddress}`, tallCols));
      chunks.push(setSize(SIZE_NORMAL));
    }
    if (doc.deliveryTypeLabel) chunks.push(textLine(doc.deliveryTypeLabel, width));
    if (doc.cashierName) chunks.push(textLine(`Atendido: ${doc.cashierName}`, width));
    chunks.push(textLine(sepLine(width), width));

    for (const line of doc.lines) {
      chunks.push(setSize(SIZE_TALL));
      pushMoneyRow(chunks, `${line.qty}x ${line.name}`, money(line.total), tallCols);
      chunks.push(setSize(SIZE_NORMAL));
      for (const name of line.added || []) {
        chunks.push(textLine(`  + ${name}`, width));
      }
      for (const name of line.removed || []) {
        chunks.push(textLine(`  SIN ${name}`, width));
      }
      if (line.note) {
        chunks.push(textLine(`  NOTA: ${line.note}`, width));
      }
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
    chunks.push(setSize(SIZE_TALL));
    chunks.push(textLine(`Metodo: ${doc.paymentLabel}`, tallCols));
    chunks.push(setSize(SIZE_NORMAL));

    if (doc.refundReason) chunks.push(textLine(`Motivo: ${doc.refundReason}`, width));
  }

  chunks.push(command([ESC, 0x61, 1]));
  chunks.push(textLine(doc.footer, width));
  if (doc.variant === 'customer') {
    chunks.push(textLine('Gracias por su visita', width));
  }
  pushFeedAndCut(chunks, width);

  return concat(chunks);
}

/** Ticket corto para identificar una impresora concreta durante la búsqueda WiFi. */
export function encodeIdentifyTicketEscpos(host: string, port: number, paperWidthMm: 58 | 80 = 80): Uint8Array {
  const width = colsForSize(paperWidthMm, SIZE_NORMAL);
  const titleCols = colsForSize(paperWidthMm, SIZE_TITLE);
  const now = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  return concat([
    command([ESC, 0x40]),
    command([ESC, 0x64, 4]),
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
    textLine('', width),
    textLine('', width),
    command([ESC, 0x64, 14]),
    command([GS, 0x56, 0]),
  ]);
}

export function encodeTestTicketEscpos(paperWidthMm: 58 | 80 = 80): Uint8Array {
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
    deliveryTypeLabel: '',
    cashierName: '',
    lines: [{ qty: 1, name: 'Producto demo', total: 9.99 }],
    base: 8.26,
    vat: 1.73,
    vatRate: 21,
    total: 9.99,
    paymentLabel: 'Efectivo',
    paymentStatusLabel: 'Cobrado',
    refundReason: '',
    orderNotes: '',
    footer: 'Si ves esto, la impresora funciona',
    isRefund: false,
  }, paperWidthMm);
}
