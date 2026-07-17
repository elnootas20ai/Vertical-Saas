import type { TicketDocument } from './ticketDocument';
import { sanitizeEscposText } from './escposEncode';

type EposBuilder = {
  addTextAlign: (align: string) => void;
  addText: (text: string) => void;
  addTextStyle?: (reverse?: boolean, ul?: boolean, em?: boolean) => void;
  addCut?: (type: number) => void;
  CUT_FEED?: number;
};

function money(value: number): string {
  return `${Number(value || 0).toFixed(2)} EUR`;
}

function row(left: string, right: string, width = 42): string {
  const l = sanitizeEscposText(left);
  const r = sanitizeEscposText(right);
  const space = Math.max(1, width - l.length - r.length);
  return `${l}${' '.repeat(space)}${r}`.slice(0, width);
}

function line(builder: EposBuilder, text: string, width: number): void {
  builder.addText(`${sanitizeEscposText(text).slice(0, width)}\n`);
}

function sep(builder: EposBuilder, width: number): void {
  line(builder, '-'.repeat(Math.min(width, 32)), width);
}

function pushLineDetail(
  builder: EposBuilder,
  item: TicketDocument['lines'][number],
  width: number,
): void {
  line(builder, `${item.qty}x ${item.name}`, width);
  for (const name of item.added || []) line(builder, `  + ${name}`, width);
  for (const name of item.removed || []) line(builder, `  SIN ${name}`, width);
  if (item.note) line(builder, `  NOTA: ${item.note}`, width);
}

function boldLine(builder: EposBuilder, text: string, width: number): void {
  if (builder.addTextStyle) builder.addTextStyle(false, false, true);
  line(builder, text, width);
  if (builder.addTextStyle) builder.addTextStyle(false, false, false);
}

export function buildEposTicket(
  builder: EposBuilder,
  doc: TicketDocument,
  paperWidthMm: 58 | 80 = 80,
): void {
  const width = paperWidthMm === 58 ? 32 : 42;

  builder.addTextAlign('center');
  line(builder, doc.issuer, width);
  if (doc.taxId) line(builder, `NIF/CIF: ${doc.taxId}`, width);
  if (doc.addressLine) line(builder, doc.addressLine, width);
  if (doc.phone) line(builder, `Tel: ${doc.phone}`, width);

  sep(builder, width);
  boldLine(builder, doc.title, width);
  line(builder, `${doc.ticketNo} · ${doc.dateLabel}`, width);
  sep(builder, width);

  builder.addTextAlign('left');
  if (doc.salesPointName) line(builder, `Tienda: ${doc.salesPointName}`, width);
  line(builder, `Pedido: #${doc.orderNumber}`, width);

  if (doc.variant === 'kitchen') {
    if (doc.deliveryTypeLabel) line(builder, doc.deliveryTypeLabel, width);
    line(builder, `Cliente: ${doc.customerName}`, width);
    if (doc.customerPhone) line(builder, `Tel: ${doc.customerPhone}`, width);
    if (doc.customerAddress) line(builder, `Dir: ${doc.customerAddress}`, width);
    if (doc.cashierName) line(builder, `Atendido: ${doc.cashierName}`, width);
    sep(builder, width);
    for (const item of doc.lines) pushLineDetail(builder, item, width);
    if (doc.orderNotes) {
      sep(builder, width);
      line(builder, `NOTA: ${doc.orderNotes}`, width);
    }
  } else if (doc.variant === 'delivery') {
    if (doc.deliveryTypeLabel) line(builder, doc.deliveryTypeLabel, width);
    line(builder, doc.customerName, width);
    if (doc.customerPhone) line(builder, `Tel: ${doc.customerPhone}`, width);
    if (doc.customerAddress) line(builder, `Dir: ${doc.customerAddress}`, width);
    sep(builder, width);
    for (const item of doc.lines) pushLineDetail(builder, item, width);
    sep(builder, width);
    boldLine(builder, row('TOTAL', money(doc.total), width), width);
    line(builder, doc.paymentStatusLabel, width);
    if (doc.paymentLabel && doc.paymentLabel !== '-') line(builder, doc.paymentLabel, width);
    if (doc.orderNotes) line(builder, `NOTA: ${doc.orderNotes}`, width);
  } else {
    line(builder, `Cliente: ${doc.customerName}`, width);
    if (doc.customerPhone) line(builder, `Tel: ${doc.customerPhone}`, width);
    if (doc.customerAddress) line(builder, `Dir: ${doc.customerAddress}`, width);
    if (doc.deliveryTypeLabel) line(builder, doc.deliveryTypeLabel, width);
    if (doc.cashierName) line(builder, `Atendido: ${doc.cashierName}`, width);
    sep(builder, width);
    for (const item of doc.lines) {
      line(builder, row(`${item.qty}x ${item.name}`, money(item.total), width), width);
      for (const name of item.added || []) line(builder, `  + ${name}`, width);
      for (const name of item.removed || []) line(builder, `  SIN ${name}`, width);
      if (item.note) line(builder, `  NOTA: ${item.note}`, width);
    }
    sep(builder, width);
    line(builder, row('Base imponible', money(doc.base), width), width);
    line(builder, row(`IVA ${doc.vatRate}%`, money(doc.vat), width), width);
    sep(builder, width);
    boldLine(
      builder,
      row(doc.isRefund ? 'TOTAL DEVUELTO' : 'TOTAL', `${doc.isRefund ? '-' : ''}${money(doc.total)}`, width),
      width,
    );
    sep(builder, width);
    line(builder, `Metodo: ${doc.paymentLabel}`, width);
    if (doc.refundReason) line(builder, `Motivo: ${doc.refundReason}`, width);
  }

  builder.addTextAlign('center');
  line(builder, doc.footer, width);
  if (doc.variant === 'customer') line(builder, 'Gracias por su visita', width);
  builder.addText('\n\n');

  if (typeof builder.addCut === 'function') {
    builder.addCut(builder.CUT_FEED ?? 1);
  }
}
