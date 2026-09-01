import { jsPDF } from 'jspdf';
import type { FinanceMovementRecord } from './financeTypes';

export interface InvoiceIssuer {
  companyName: string;
  nif?: string;
  address?: string;
  city?: string;
  cp?: string;
  phone?: string;
  email?: string;
}

export interface InvoiceRecipient {
  name: string;
  nif?: string;
  address?: string;
  city?: string;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export interface InvoiceData {
  number: string;
  date: string;
  dueDate?: string;
  issuer: InvoiceIssuer;
  recipient: InvoiceRecipient;
  lines: InvoiceLine[];
  notes?: string;
  payMethod?: string;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function drawHRule(doc: jsPDF, y: number, x1 = 15, x2 = 195, color: [number, number, number] = [226, 232, 240]) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.line(x1, y, x2, y);
}

export function buildInvoiceNumber(sequence: number, year?: number): string {
  const y = year || new Date().getFullYear();
  return `FAC-${y}-${String(sequence).padStart(4, '0')}`;
}

export function generateInvoicePdf(invoice: InvoiceData): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;
  const margin = 15;
  const contentW = pageW - margin * 2;

  // ─── Header background ───────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageW, 42, 'F');

  // Company name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(invoice.issuer.companyName || 'Empresa', margin, 18);

  // FACTURA label
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('FACTURA', pageW - margin, 12, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(251, 191, 36); // amber-400
  doc.text(invoice.number, pageW - margin, 22, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(`Fecha: ${formatDate(invoice.date)}`, pageW - margin, 30, { align: 'right' });
  if (invoice.dueDate) {
    doc.text(`Vencimiento: ${formatDate(invoice.dueDate)}`, pageW - margin, 36, { align: 'right' });
  }

  let y = 55;

  // ─── Issuer / Recipient ────────────────────────────────────────────────────
  const colW = (contentW - 10) / 2;

  // Issuer box
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(margin, y - 4, colW, 38, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text('DATOS DEL EMISOR', margin + 4, y + 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(invoice.issuer.companyName || '—', margin + 4, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  if (invoice.issuer.nif) doc.text(`NIF: ${invoice.issuer.nif}`, margin + 4, y + 15);
  if (invoice.issuer.address) doc.text(invoice.issuer.address, margin + 4, y + 21);
  const cityLine = [invoice.issuer.cp, invoice.issuer.city].filter(Boolean).join(' ');
  if (cityLine) doc.text(cityLine, margin + 4, y + 26);
  if (invoice.issuer.email) doc.text(invoice.issuer.email, margin + 4, y + 31);

  // Recipient box
  const rx = margin + colW + 10;
  doc.setFillColor(240, 249, 255); // sky-50
  doc.roundedRect(rx, y - 4, colW, 38, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('DATOS DEL RECEPTOR', rx + 4, y + 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(invoice.recipient.name || '—', rx + 4, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  if (invoice.recipient.nif) doc.text(`NIF/DNI: ${invoice.recipient.nif}`, rx + 4, y + 15);
  if (invoice.recipient.address) doc.text(invoice.recipient.address, rx + 4, y + 21);
  if (invoice.recipient.city) doc.text(invoice.recipient.city, rx + 4, y + 26);

  y += 46;
  drawHRule(doc, y);
  y += 8;

  // ─── Lines table ────────────────────────────────────────────────────────────
  // Header row
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, y - 4, contentW, 9, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('DESCRIPCIÓN', margin + 3, y + 1.5);
  doc.text('CANT.', margin + 96, y + 1.5, { align: 'right' });
  doc.text('PRECIO UNIT.', margin + 122, y + 1.5, { align: 'right' });
  doc.text('IVA %', margin + 144, y + 1.5, { align: 'right' });
  doc.text('IMPORTE', margin + contentW - 1, y + 1.5, { align: 'right' });

  y += 9;

  // Lines
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  invoice.lines.forEach((line, index) => {
    const lineTotal = line.unitPrice * line.quantity;
    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y - 3.5, contentW, 8, 'F');
    }
    doc.setTextColor(15, 23, 42);
    const maxDescW = 88;
    const desc = doc.splitTextToSize(line.description, maxDescW) as string[];
    doc.text(desc[0] || '', margin + 3, y + 1);
    doc.setTextColor(71, 85, 105);
    doc.text(String(line.quantity), margin + 96, y + 1, { align: 'right' });
    doc.text(formatCurrency(line.unitPrice), margin + 122, y + 1, { align: 'right' });
    doc.text(`${line.taxRate}%`, margin + 144, y + 1, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(lineTotal), margin + contentW - 1, y + 1, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 8;
  });

  y += 4;
  drawHRule(doc, y);
  y += 8;

  // ─── Tax summary ─────────────────────────────────────────────────────────────
  const taxGroups = new Map<number, { base: number; tax: number }>();
  for (const line of invoice.lines) {
    const prev = taxGroups.get(line.taxRate) || { base: 0, tax: 0 };
    const lineBase = line.unitPrice * line.quantity;
    const lineTax = lineBase * (line.taxRate / 100);
    taxGroups.set(line.taxRate, { base: prev.base + lineBase, tax: prev.tax + lineTax });
  }

  const totalBase = Array.from(taxGroups.values()).reduce((s, g) => s + g.base, 0);
  const totalTax = Array.from(taxGroups.values()).reduce((s, g) => s + g.tax, 0);
  const totalAmount = totalBase + totalTax;

  // Resumen a la derecha: filas claras (sin columnas solapadas).
  const sumW = 78;
  const sumX = margin + contentW - sumW;
  const rateRows = Array.from(taxGroups.entries()).sort((a, b) => a[0] - b[0]);
  // 2 filas por tipo de IVA (base + cuota).
  const boxH = 6 + rateRows.length * 12;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(sumX, y - 2, sumW, boxH, 2, 2, 'F');

  let rowY = y + 3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  for (const [rate, group] of rateRows) {
    doc.setTextColor(71, 85, 105);
    doc.text(`Base IVA ${rate}%`, sumX + 3, rowY);
    doc.text(formatCurrency(group.base), sumX + sumW - 3, rowY, { align: 'right' });
    rowY += 6;
    doc.text(`Cuota IVA ${rate}%`, sumX + 3, rowY);
    doc.text(formatCurrency(group.tax), sumX + sumW - 3, rowY, { align: 'right' });
    rowY += 6;
  }

  rowY = Math.max(rowY, y - 2 + boxH) + 3;
  drawHRule(doc, rowY - 2, sumX + 3, sumX + sumW - 3, [203, 213, 225]);
  rowY += 3;

  doc.setFillColor(15, 23, 42);
  doc.roundedRect(sumX, rowY - 3, sumW, 12, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL FACTURA', sumX + 3, rowY + 4);
  doc.setFontSize(11);
  doc.setTextColor(251, 191, 36);
  doc.text(formatCurrency(totalAmount), sumX + sumW - 3, rowY + 4.5, { align: 'right' });

  // Método + totales a la izquierda (alineados con el bloque derecho).
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Método de pago: ${invoice.payMethod || 'No especificado'}`, margin, y + 3);
  doc.text(`Base imponible: ${formatCurrency(totalBase)}`, margin, y + 10);
  doc.text(`IVA: ${formatCurrency(totalTax)}`, margin, y + 17);

  y = Math.max(y + 22, rowY + 14);

  // ─── Notes ───────────────────────────────────────────────────────────────────
  if (invoice.notes) {
    y += 4;
    doc.setFillColor(255, 251, 235); // amber-50
    doc.roundedRect(margin, y, contentW, 14, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(146, 64, 14); // amber-800
    doc.text('OBSERVACIONES', margin + 3, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 53, 15);
    const noteLines = doc.splitTextToSize(invoice.notes, contentW - 6) as string[];
    doc.text(noteLines[0] || '', margin + 3, y + 11);
    y += 18;
  }

  // ─── Footer ──────────────────────────────────────────────────────────────────
  doc.setFillColor(248, 250, 252);
  doc.rect(0, pageH - 18, pageW, 18, 'F');
  drawHRule(doc, pageH - 18, 0, pageW, [203, 213, 225]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `${invoice.issuer.companyName} · Documento generado electrónicamente · ${invoice.number}`,
    pageW / 2,
    pageH - 10,
    { align: 'center' },
  );
  doc.text(
    `Factura emitida el ${formatDate(invoice.date)} · Esta factura tiene validez legal como justificante de operación`,
    pageW / 2,
    pageH - 5,
    { align: 'center' },
  );

  doc.save(`factura-${invoice.number}.pdf`);
}

// Build an InvoiceData from a FinanceMovementRecord
export function buildInvoiceFromMovement(
  movement: FinanceMovementRecord,
  issuer: InvoiceIssuer,
  invoiceNumber: string,
): InvoiceData {
  return {
    number: invoiceNumber,
    date: movement.date,
    issuer,
    recipient: {
      name: movement.companyName || 'Cliente',
    },
    lines: [
      {
        description: movement.concept,
        quantity: 1,
        unitPrice: movement.amountBase,
        taxRate: movement.taxRate,
      },
    ],
    notes: movement.notes || undefined,
    payMethod: movement.payMethod,
  };
}

