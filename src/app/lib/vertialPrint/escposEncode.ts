import type { TicketDocument } from './ticketDocument';

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

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

function textLine(value: string, width = 42): Uint8Array {
  const line = sanitizeEscposText(value).slice(0, width);
  return new Uint8Array([...line.split('').map((c) => c.charCodeAt(0)), LF]);
}

function command(bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
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

function pushLineDetail(chunks: Uint8Array[], line: TicketDocument['lines'][number], width: number) {
  chunks.push(textLine(`${line.qty}x ${line.name}`, width));
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

export function encodeTicketEscpos(doc: TicketDocument, paperWidthMm: 58 | 80 = 80): Uint8Array {
  const width = paperWidthMm === 58 ? 32 : 42;
  const chunks: Uint8Array[] = [
    command([ESC, 0x40]),
    command([ESC, 0x61, 1]),
    textLine(doc.issuer, width),
  ];

  if (doc.taxId) chunks.push(textLine(`NIF/CIF: ${doc.taxId}`, width));
  if (doc.addressLine) chunks.push(textLine(doc.addressLine, width));
  if (doc.phone) chunks.push(textLine(`Tel: ${doc.phone}`, width));

  chunks.push(
    textLine('--------------------------------', width),
    command([ESC, 0x45, 1]),
    textLine(doc.title, width),
    command([ESC, 0x45, 0]),
    textLine(`${doc.ticketNo} · ${doc.dateLabel}`, width),
    textLine('--------------------------------', width),
    command([ESC, 0x61, 0]),
  );

  if (doc.salesPointName) chunks.push(textLine(`Tienda: ${doc.salesPointName}`, width));
  chunks.push(textLine(`Pedido: #${doc.orderNumber}`, width));

  if (doc.variant === 'kitchen') {
    if (doc.deliveryTypeLabel) chunks.push(textLine(doc.deliveryTypeLabel, width));
    chunks.push(textLine(`Cliente: ${doc.customerName}`, width));
    if (doc.customerPhone) chunks.push(textLine(`Tel: ${doc.customerPhone}`, width));
    if (doc.customerAddress) chunks.push(textLine(doc.customerAddress, width));
    if (doc.cashierName) chunks.push(textLine(`Atendido: ${doc.cashierName}`, width));
    chunks.push(textLine('--------------------------------', width));
    for (const line of doc.lines) {
      pushLineDetail(chunks, line, width);
    }
    if (doc.orderNotes) {
      chunks.push(textLine('--------------------------------', width));
      chunks.push(textLine(`NOTA: ${doc.orderNotes}`, width));
    }
  } else if (doc.variant === 'delivery') {
    chunks.push(textLine(doc.customerName, width));
    if (doc.customerPhone) chunks.push(textLine(`Tel: ${doc.customerPhone}`, width));
    if (doc.customerAddress) chunks.push(textLine(doc.customerAddress, width));
    chunks.push(textLine('--------------------------------', width));
    for (const line of doc.lines) {
      pushLineDetail(chunks, line, width);
    }
    chunks.push(
      textLine('--------------------------------', width),
      command([ESC, 0x45, 1]),
      textLine(row('TOTAL', money(doc.total), width), width),
      command([ESC, 0x45, 0]),
      textLine(doc.paymentStatusLabel, width),
    );
    if (doc.paymentLabel && doc.paymentLabel !== '-') {
      chunks.push(textLine(doc.paymentLabel, width));
    }
    if (doc.orderNotes) chunks.push(textLine(`NOTA: ${doc.orderNotes}`, width));
  } else {
    chunks.push(textLine(`Cliente: ${doc.customerName}`, width));
    if (doc.cashierName) chunks.push(textLine(`Atendido: ${doc.cashierName}`, width));
    chunks.push(textLine('--------------------------------', width));

    for (const line of doc.lines) {
      chunks.push(textLine(row(`${line.qty}x ${line.name}`, money(line.total), width), width));
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

    chunks.push(
      textLine('--------------------------------', width),
      textLine(row('Base imponible', money(doc.base), width), width),
      textLine(row(`IVA ${doc.vatRate}%`, money(doc.vat), width), width),
      textLine('--------------------------------', width),
      command([ESC, 0x45, 1]),
      textLine(
        row(doc.isRefund ? 'TOTAL DEVUELTO' : 'TOTAL', `${doc.isRefund ? '-' : ''}${money(doc.total)}`, width),
        width,
      ),
      command([ESC, 0x45, 0]),
      textLine('--------------------------------', width),
      textLine(`Metodo: ${doc.paymentLabel}`, width),
    );

    if (doc.refundReason) chunks.push(textLine(`Motivo: ${doc.refundReason}`, width));
  }

  chunks.push(
    command([ESC, 0x61, 1]),
    textLine(doc.footer, width),
    textLine(doc.variant === 'customer' ? 'Gracias por su visita' : '', width),
    textLine('', width),
    textLine('', width),
    command([GS, 0x56, 0]),
  );

  return concat(chunks);
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
