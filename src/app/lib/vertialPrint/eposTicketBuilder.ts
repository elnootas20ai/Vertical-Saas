import type { TicketDocument } from './ticketDocument';
import {
  sanitizeEscposText,
  wrapEscposLines,
  tailFeedCmForVariant,
} from './escposEncode';

type EposBuilder = {
  addTextAlign: (align: string) => void;
  addText: (text: string) => void;
  addTextStyle?: (reverse?: boolean, ul?: boolean, em?: boolean) => void;
  addTextSize?: (width: number, height: number) => void;
  addFeedLine?: (lines: number) => void;
  addFeedUnit?: (unit: number) => void;
  addCut?: (type: number) => void;
  CUT_FEED?: number;
  CUT_NO_FEED?: number;
};

/** 203 dpi ≈ 8 dots/mm; espaciado típico de línea ≈ 30 dots (~3.75 mm). */
const DOTS_PER_MM = 8;
const MM_PER_LINE = 3.75;

function feedBaseCm(builder: EposBuilder, feedCm: number) {
  const dots = Math.max(0, Math.round(feedCm * 10 * DOTS_PER_MM));
  if (typeof builder.addFeedUnit === 'function') {
    let left = dots;
    while (left > 0) {
      const n = Math.min(255, left);
      builder.addFeedUnit(n);
      left -= n;
    }
    return;
  }
  const lines = Math.max(1, Math.round((feedCm * 10) / MM_PER_LINE));
  if (typeof builder.addFeedLine === 'function') {
    builder.addFeedLine(lines);
  } else {
    builder.addText('\n'.repeat(lines));
  }
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
  for (const name of item.composition || []) line(builder, `  > ${name}`, width);
  for (const name of item.added || []) line(builder, `  + ${name}`, width);
  for (const name of item.removed || []) line(builder, `  SIN ${name}`, width);
  if (item.note) line(builder, `  NOTA: ${item.note}`, width);
}

/** Comanda cocina: doble alto + negrita; menú completo remarcado; mods con énfasis. */
function pushKitchenLineDetail(
  builder: EposBuilder,
  item: TicketDocument['lines'][number],
  paperWidthMm: 58 | 80,
): void {
  const tallCols = colsForSize(paperWidthMm, false);
  setTextSize(builder, 1, 2);
  boldLine(builder, `${item.qty}x ${item.name}`, tallCols);
  for (const name of item.composition || []) {
    if (builder.addTextStyle) builder.addTextStyle(false, false, true);
    setTextSize(builder, 1, 2);
    line(builder, `  > ${name}`, tallCols);
    if (builder.addTextStyle) builder.addTextStyle(false, false, false);
  }
  for (const name of item.added || []) {
    // reverse=false, underline=false, emphasize=true — máximo contraste en 1 color.
    if (builder.addTextStyle) builder.addTextStyle(false, false, true);
    setTextSize(builder, 1, 2);
    line(builder, `  + DE MAS ${name}`, tallCols);
    if (builder.addTextStyle) builder.addTextStyle(false, false, false);
  }
  for (const name of item.removed || []) {
    // reverse=true + emphasize: se ve “de menos” aún en papel monocromo.
    if (builder.addTextStyle) builder.addTextStyle(true, false, true);
    setTextSize(builder, 1, 2);
    line(builder, `  - DE MENOS ${name}`, tallCols);
    if (builder.addTextStyle) builder.addTextStyle(false, false, false);
  }
  if (item.note) {
    setTextSize(builder, 1, 2);
    boldLine(builder, `  NOTA: ${item.note}`, tallCols);
  }
  setTextSize(builder, 1, 1);
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
  feedOptions?: { customerTailFeedCm?: number },
): void {
  const width = colsForSize(paperWidthMm, false);
  const tallCols = colsForSize(paperWidthMm, false);
  const titleCols = colsForSize(paperWidthMm, true);
  const customerFeed = feedOptions?.customerTailFeedCm;

  // Margen superior mínimo (~0,1 cm; antes 1 línea / ~0,4 cm).
  // Sin feed de línea completa: ahorra ~0,3 cm arriba.

  // Comanda cocina: solo pedido + productos + notas (sin cliente ni datos fiscales)
  if (doc.variant === 'kitchen') {
    builder.addTextAlign('center');
    setTextSize(builder, 2, 2);
    boldLine(builder, doc.title, titleCols);
    setTextSize(builder, 1, 1);
    line(builder, `${doc.ticketNo} - ${doc.dateLabel}`, width);
    sep(builder, width);
    builder.addTextAlign('left');
    setTextSize(builder, 1, 2);
    boldLine(builder, `Pedido: #${doc.orderNumber}`, tallCols);
    setTextSize(builder, 1, 1);
    if (doc.deliveryTypeLabel) {
      setTextSize(builder, 1, 2);
      boldLine(builder, doc.deliveryTypeLabel, tallCols);
      setTextSize(builder, 1, 1);
    }
    sep(builder, width);
    for (const item of doc.lines) {
      pushKitchenLineDetail(builder, item, paperWidthMm);
    }
    if (doc.orderNotes) {
      sep(builder, width);
      setTextSize(builder, 1, 2);
      boldLine(builder, `NOTA: ${doc.orderNotes}`, tallCols);
      setTextSize(builder, 1, 1);
    }
    builder.addTextAlign('center');
    line(builder, doc.footer, width);
    feedBaseCm(builder, tailFeedCmForVariant(doc.variant, customerFeed));
    if (typeof builder.addCut === 'function') {
      builder.addCut(builder.CUT_NO_FEED ?? builder.CUT_FEED ?? 1);
    }
    return;
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

  if (doc.variant === 'delivery') {
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
    if (doc.paymentLabel) {
      setTextSize(builder, 1, 2);
      line(builder, `Metodo: ${doc.paymentLabel}`, tallCols);
      setTextSize(builder, 1, 1);
    }
    if (doc.paymentStatusLabel) line(builder, doc.paymentStatusLabel, width);
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
      for (const name of item.composition || []) line(builder, `  > ${name}`, width);
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
    if (doc.paymentLabel) {
      setTextSize(builder, 1, 2);
      line(builder, `Metodo: ${doc.paymentLabel}`, tallCols);
      setTextSize(builder, 1, 1);
    }
    if (doc.paymentStatusLabel) line(builder, doc.paymentStatusLabel, width);
    if (doc.refundReason) line(builder, `Motivo: ${doc.refundReason}`, width);
  }

  builder.addTextAlign('center');
  line(builder, doc.footer, width);
  if (doc.variant === 'customer') line(builder, 'Gracias por su visita', width);

  feedBaseCm(builder, tailFeedCmForVariant(doc.variant, customerFeed));

  if (typeof builder.addCut === 'function') {
    builder.addCut(builder.CUT_NO_FEED ?? builder.CUT_FEED ?? 1);
  }
}
