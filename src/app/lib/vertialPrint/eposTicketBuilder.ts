import type { TicketDocument } from './ticketDocument';
import { sanitizeEscposText, wrapEscposLines } from './escposEncode';

type EposBuilder = {
  addTextAlign: (align: string) => void;
  addText: (text: string) => void;
  addTextStyle?: (reverse?: boolean, ul?: boolean, em?: boolean) => void;
  addTextSize?: (width: number, height: number) => void;
  addFeedLine?: (lines: number) => void;
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

function colsForSize(paperWidthMm: 58 | 80, doubleWidth: boolean): number {
  const base = paperWidthMm === 58 ? 32 : 42;
  return doubleWidth ? Math.floor(base / 2) : base;
}

function line(builder: EposBuilder, text: string, width: number): void {
  for (const part of wrapEscposLines(text, width)) {
    builder.addText(`${part}\n`);
  }
}

function moneyRow(builder: EposBuilder, left: string, right: string, width: number): void {
  const r = sanitizeEscposText(right);
  const maxLeft = Math.max(8, width - r.length - 1);
  const wrapped = wrapEscposLines(left, maxLeft);
  for (let i = 0; i < wrapped.length; i += 1) {
    if (i === wrapped.length - 1) {
      line(builder, row(wrapped[i], r, width), width);
    } else {
      line(builder, wrapped[i], width);
    }
  }
}

function sep(builder: EposBuilder, width: number): void {
  line(builder, '-'.repeat(Math.min(width, 32)), width);
}

function setTextSize(builder: EposBuilder, widthMul: number, heightMul: number): void {
  if (typeof builder.addTextSize === 'function') {
    builder.addTextSize(widthMul, heightMul);
  }
}

function pushLineDetail(
  builder: EposBuilder,
  item: TicketDocument['lines'][number],
  width: number,
  paperWidthMm: 58 | 80,
): void {
  const tallCols = colsForSize(paperWidthMm, false);
  setTextSize(builder, 1, 2);
  line(builder, `${item.qty}x ${item.name}`, tallCols);
  setTextSize(builder, 1, 1);
  for (const name of item.added || []) line(builder, `  + ${name}`, width);
  for (const name of item.removed || []) line(builder, `  SIN ${name}`, width);
  if (item.note) line(builder, `  NOTA: ${item.note}`, width);
}

function boldLine(builder: EposBuilder, text: string, width: number): void {
  if (builder.addTextStyle) builder.addTextStyle(false, false, true);
  line(builder, text, width);
  if (builder.addTextStyle) builder.addTextStyle(false, false, false);
}

function boldMoneyRow(builder: EposBuilder, left: string, right: string, width: number): void {
  if (builder.addTextStyle) builder.addTextStyle(false, false, true);
  moneyRow(builder, left, right, width);
  if (builder.addTextStyle) builder.addTextStyle(false, false, false);
}

export function buildEposTicket(
  builder: EposBuilder,
  doc: TicketDocument,
  paperWidthMm: 58 | 80 = 80,
): void {
  const width = colsForSize(paperWidthMm, false);
  const tallCols = colsForSize(paperWidthMm, false);
  const titleCols = colsForSize(paperWidthMm, true);

  if (typeof builder.addFeedLine === 'function') {
    builder.addFeedLine(1);
  } else {
    builder.addText('\n');
  }

  builder.addTextAlign('center');
  setTextSize(builder, 1, 2);
  line(builder, doc.issuer, tallCols);
  setTextSize(builder, 1, 1);
  if (doc.taxId) line(builder, `NIF/CIF: ${doc.taxId}`, width);
  if (doc.addressLine) line(builder, doc.addressLine, width);
  if (doc.phone) line(builder, `Tel: ${doc.phone}`, width);

  sep(builder, width);
  setTextSize(builder, 2, 2);
  boldLine(builder, doc.title, titleCols);
  setTextSize(builder, 1, 1);
  line(builder, `${doc.ticketNo} - ${doc.dateLabel}`, width);
  sep(builder, width);

  builder.addTextAlign('left');
  if (doc.salesPointName) line(builder, `Tienda: ${doc.salesPointName}`, width);
  setTextSize(builder, 1, 2);
  line(builder, `Pedido: #${doc.orderNumber}`, tallCols);
  setTextSize(builder, 1, 1);

  const pushDir = () => {
    if (!doc.customerAddress) return;
    setTextSize(builder, 1, 2);
    if (doc.emphasizeCustomerAddress) boldLine(builder, `Dir: ${doc.customerAddress}`, tallCols);
    else line(builder, `Dir: ${doc.customerAddress}`, tallCols);
    setTextSize(builder, 1, 1);
  };

  if (doc.variant === 'kitchen') {
    if (doc.deliveryTypeLabel) line(builder, doc.deliveryTypeLabel, width);
    line(builder, `Cliente: ${doc.customerName}`, width);
    if (doc.customerPhone) line(builder, `Tel: ${doc.customerPhone}`, width);
    pushDir();
    if (doc.cashierName) line(builder, `Atendido: ${doc.cashierName}`, width);
    sep(builder, width);
    for (const item of doc.lines) pushLineDetail(builder, item, width, paperWidthMm);
    if (doc.orderNotes) {
      sep(builder, width);
      setTextSize(builder, 1, 2);
      line(builder, `NOTA: ${doc.orderNotes}`, tallCols);
      setTextSize(builder, 1, 1);
    }
  } else if (doc.variant === 'delivery') {
    if (doc.deliveryTypeLabel) {
      setTextSize(builder, 1, 2);
      line(builder, doc.deliveryTypeLabel, tallCols);
      setTextSize(builder, 1, 1);
    }
    setTextSize(builder, 2, 2);
    line(builder, doc.customerName, titleCols);
    setTextSize(builder, 1, 1);
    if (doc.customerPhone) {
      setTextSize(builder, 1, 2);
      line(builder, `Tel: ${doc.customerPhone}`, tallCols);
      setTextSize(builder, 1, 1);
    }
    pushDir();
    sep(builder, width);
    for (const item of doc.lines) pushLineDetail(builder, item, width, paperWidthMm);
    sep(builder, width);
    setTextSize(builder, 2, 2);
    boldMoneyRow(builder, 'TOTAL', money(doc.total), titleCols);
    setTextSize(builder, 1, 1);
    setTextSize(builder, 1, 2);
    line(builder, doc.paymentStatusLabel, tallCols);
    setTextSize(builder, 1, 1);
    if (doc.paymentLabel && doc.paymentLabel !== '-') line(builder, doc.paymentLabel, width);
    if (doc.orderNotes) {
      setTextSize(builder, 1, 2);
      line(builder, `NOTA: ${doc.orderNotes}`, tallCols);
      setTextSize(builder, 1, 1);
    }
  } else {
    setTextSize(builder, 1, 2);
    line(builder, `Cliente: ${doc.customerName}`, tallCols);
    setTextSize(builder, 1, 1);
    if (doc.customerPhone) {
      setTextSize(builder, 1, 2);
      line(builder, `Tel: ${doc.customerPhone}`, tallCols);
      setTextSize(builder, 1, 1);
    }
    pushDir();
    if (doc.deliveryTypeLabel) line(builder, doc.deliveryTypeLabel, width);
    if (doc.cashierName) line(builder, `Atendido: ${doc.cashierName}`, width);
    sep(builder, width);
    for (const item of doc.lines) {
      setTextSize(builder, 1, 2);
      moneyRow(builder, `${item.qty}x ${item.name}`, money(item.total), tallCols);
      setTextSize(builder, 1, 1);
      for (const name of item.added || []) line(builder, `  + ${name}`, width);
      for (const name of item.removed || []) line(builder, `  SIN ${name}`, width);
      if (item.note) line(builder, `  NOTA: ${item.note}`, width);
    }
    sep(builder, width);
    moneyRow(builder, 'Base imponible', money(doc.base), width);
    moneyRow(builder, `IVA ${doc.vatRate}%`, money(doc.vat), width);
    sep(builder, width);
    setTextSize(builder, 2, 2);
    boldMoneyRow(
      builder,
      doc.isRefund ? 'TOTAL DEV.' : 'TOTAL',
      `${doc.isRefund ? '-' : ''}${money(doc.total)}`,
      titleCols,
    );
    setTextSize(builder, 1, 1);
    sep(builder, width);
    setTextSize(builder, 1, 2);
    line(builder, `Metodo: ${doc.paymentLabel}`, tallCols);
    setTextSize(builder, 1, 1);
    if (doc.refundReason) line(builder, `Motivo: ${doc.refundReason}`, width);
  }

  builder.addTextAlign('center');
  line(builder, doc.footer, width);
  if (doc.variant === 'customer') line(builder, 'Gracias por su visita', width);

  if (typeof builder.addFeedLine === 'function') {
    builder.addFeedLine(5);
  } else {
    builder.addText('\n\n\n');
  }

  if (typeof builder.addCut === 'function') {
    builder.addCut(builder.CUT_FEED ?? 1);
  }
}
