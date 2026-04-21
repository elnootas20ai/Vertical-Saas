import { jsPDF } from 'jspdf';
import type { ContractRecord } from './contractsApi';

const BRAND_COLOR: [number, number, number] = [15, 23, 42];
const ACCENT_COLOR: [number, number, number] = [59, 130, 246];
const LIGHT_GRAY: [number, number, number] = [248, 250, 252];
const MEDIUM_GRAY: [number, number, number] = [100, 116, 139];
const DARK_GRAY: [number, number, number] = [30, 41, 59];

function setRgb(doc: jsPDF, rgb: [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function setFillRgb(doc: jsPDF, rgb: [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

function setDrawRgb(doc: jsPDF, rgb: [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

function hLine(doc: jsPDF, x1: number, y: number, x2: number, thickness = 0.3) {
  setDrawRgb(doc, [226, 232, 240]);
  doc.setLineWidth(thickness);
  doc.line(x1, y, x2, y);
}

function labelValue(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  valueX: number,
) {
  doc.setFontSize(8);
  setRgb(doc, MEDIUM_GRAY);
  doc.text(label, x, y);
  doc.setFontSize(9);
  setRgb(doc, DARK_GRAY);
  doc.text(value || '—', valueX, y);
}

function sectionTitle(doc: jsPDF, title: string, y: number, margin: number, pageW: number) {
  setFillRgb(doc, [241, 245, 249]);
  setDrawRgb(doc, [226, 232, 240]);
  doc.setLineWidth(0.1);
  doc.roundedRect(margin, y - 4, pageW - margin * 2, 9, 1, 1, 'FD');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  setRgb(doc, BRAND_COLOR);
  doc.text(title.toUpperCase(), margin + 3, y + 2.5);
  doc.setFont('helvetica', 'normal');
}

const CONTRACT_TYPE_LABEL: Record<string, string> = {
  venta: 'CONTRATO DE COMPRAVENTA',
  reserva: 'CONTRATO DE RESERVA',
  compra: 'CONTRATO DE COMPRA',
};

function formatDate(iso?: string) {
  if (!iso) return new Date().toLocaleDateString('es-ES');
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatCurrency(value: number) {
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function generateContractPdf(
  contract: ContractRecord,
  signatureBase64?: string,
  signerName?: string,
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  let y = margin;

  // ── Header bar ──────────────────────────────────────────────────────────────
  setFillRgb(doc, BRAND_COLOR);
  doc.rect(0, 0, pageW, 28, 'F');

  // Accent stripe
  setFillRgb(doc, ACCENT_COLOR);
  doc.rect(0, 28, pageW, 1.5, 'F');

  // Company name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(contract.companyName || 'Concesionario', margin, 13);

  // CIF
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  const cifLabel = contract.companyCif ? `CIF ${contract.companyCif}` : '';
  const addrLabel = contract.companyAddress || '';
  doc.text([cifLabel, addrLabel].filter(Boolean).join('  ·  '), margin, 20);

  // Contract type (right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  const titleLabel = CONTRACT_TYPE_LABEL[contract.contractType] || 'CONTRATO';
  doc.text(titleLabel, pageW - margin, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`Fecha: ${formatDate(contract.createdAt)}`, pageW - margin, 20, { align: 'right' });

  y = 38;

  // ── Reference block ──────────────────────────────────────────────────────────
  setFillRgb(doc, LIGHT_GRAY);
  setDrawRgb(doc, [226, 232, 240]);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, y, pageW - margin * 2, 10, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setRgb(doc, MEDIUM_GRAY);
  doc.text('Nº CONTRATO', margin + 4, y + 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setRgb(doc, BRAND_COLOR);
  doc.text(contract.id.replace('contract-', '').toUpperCase().slice(0, 16), margin + 4, y + 8.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setRgb(doc, MEDIUM_GRAY);
  doc.text('RESPONSABLE', pageW / 2, y + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setRgb(doc, DARK_GRAY);
  doc.text(contract.responsible || '—', pageW / 2, y + 8.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setRgb(doc, MEDIUM_GRAY);
  doc.text('ESTADO', pageW - margin - 4, y + 4, { align: 'right' });
  const statusLabel = contract.status === 'signed' ? 'FIRMADO' : contract.status === 'cancelled' ? 'CANCELADO' : 'BORRADOR';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setRgb(doc, contract.status === 'signed' ? [16, 185, 129] : contract.status === 'cancelled' ? [239, 68, 68] : [100, 116, 139]);
  doc.text(statusLabel, pageW - margin - 4, y + 8.5, { align: 'right' });

  y += 16;

  // ── Section: Datos del cliente ───────────────────────────────────────────────
  sectionTitle(doc, 'Datos del cliente', y, margin, pageW);
  y += 12;

  labelValue(doc, 'Nombre completo:', contract.clientName || '—', margin + 2, y, margin + 40);
  y += 6;
  labelValue(doc, 'DNI / NIF:', contract.clientDni || '—', margin + 2, y, margin + 40);
  labelValue(doc, 'Teléfono:', contract.clientPhone || '—', pageW / 2, y, pageW / 2 + 28);
  y += 6;
  labelValue(doc, 'Email:', contract.clientEmail || '—', margin + 2, y, margin + 40);
  y += 10;

  // ── Section: Datos del vehículo ──────────────────────────────────────────────
  sectionTitle(doc, 'Datos del vehículo', y, margin, pageW);
  y += 12;

  labelValue(doc, 'Marca / Modelo:', `${contract.vehicleBrand} ${contract.vehicleModel}`, margin + 2, y, margin + 40);
  labelValue(doc, 'Año:', String(contract.vehicleYear || '—'), pageW / 2, y, pageW / 2 + 28);
  y += 6;
  labelValue(doc, 'Matrícula:', contract.vehiclePlate || '—', margin + 2, y, margin + 40);
  labelValue(doc, 'Vehículo:', contract.vehicleName || '—', pageW / 2, y, pageW / 2 + 28);
  y += 10;

  // ── Section: Condiciones económicas ─────────────────────────────────────────
  sectionTitle(doc, 'Condiciones económicas', y, margin, pageW);
  y += 12;

  labelValue(doc, 'Importe total:', formatCurrency(contract.price), margin + 2, y, margin + 40);
  labelValue(doc, 'Forma de pago:', contract.paymentMethod || '—', pageW / 2, y, pageW / 2 + 28);
  y += 8;

  // Price highlight box
  setFillRgb(doc, [239, 246, 255]);
  setDrawRgb(doc, ACCENT_COLOR);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, 80, 12, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setRgb(doc, ACCENT_COLOR);
  doc.text('PRECIO TOTAL DE VENTA', margin + 4, y + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setRgb(doc, BRAND_COLOR);
  doc.text(formatCurrency(contract.price), margin + 4, y + 10);
  y += 18;

  // ── Section: Notas / Condiciones ─────────────────────────────────────────────
  if (contract.notes?.trim()) {
    sectionTitle(doc, 'Notas y condiciones particulares', y, margin, pageW);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setRgb(doc, DARK_GRAY);
    const splitNotes = doc.splitTextToSize(contract.notes, pageW - margin * 2 - 4);
    doc.text(splitNotes, margin + 2, y);
    y += splitNotes.length * 4.5 + 6;
  }

  // ── Section: Cláusula legal ───────────────────────────────────────────────────
  const legalText =
    'Las partes reconocen haber leído y comprendido el presente contrato, comprometiéndose a su fiel cumplimiento. ' +
    'Este contrato se rige por la legislación española vigente. En caso de discrepancia, las partes se someten a los ' +
    'juzgados y tribunales del domicilio del vendedor.';

  if (y + 30 > pageH - 50) {
    doc.addPage();
    y = margin;
  }

  sectionTitle(doc, 'Cláusula legal', y, margin, pageW);
  y += 12;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  setRgb(doc, MEDIUM_GRAY);
  const splitLegal = doc.splitTextToSize(legalText, pageW - margin * 2 - 4);
  doc.text(splitLegal, margin + 2, y);
  y += splitLegal.length * 4 + 10;

  // ── Section: Firma digital ────────────────────────────────────────────────────
  if (y + 55 > pageH - 10) {
    doc.addPage();
    y = margin;
  }

  sectionTitle(doc, 'Firma y conformidad', y, margin, pageW);
  y += 12;

  const sigBoxW = (pageW - margin * 2 - 10) / 2;

  // Vendor box
  setFillRgb(doc, LIGHT_GRAY);
  setDrawRgb(doc, [203, 213, 225]);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, y, sigBoxW, 40, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setRgb(doc, MEDIUM_GRAY);
  doc.text('VENDEDOR', margin + sigBoxW / 2, y + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setRgb(doc, DARK_GRAY);
  doc.text(contract.responsible || contract.companyName || '—', margin + sigBoxW / 2, y + 11, { align: 'center' });
  // Signature line
  hLine(doc, margin + 5, y + 32, margin + sigBoxW - 5, 0.5);
  doc.setFontSize(7);
  setRgb(doc, MEDIUM_GRAY);
  doc.text('Firma y sello', margin + sigBoxW / 2, y + 37, { align: 'center' });

  // Buyer box
  const buyerX = margin + sigBoxW + 10;
  setFillRgb(doc, LIGHT_GRAY);
  doc.roundedRect(buyerX, y, sigBoxW, 40, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setRgb(doc, MEDIUM_GRAY);
  doc.text('COMPRADOR', buyerX + sigBoxW / 2, y + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setRgb(doc, DARK_GRAY);
  doc.text(contract.clientName || '—', buyerX + sigBoxW / 2, y + 11, { align: 'center' });

  if (signatureBase64) {
    try {
      doc.addImage(signatureBase64, 'PNG', buyerX + 5, y + 14, sigBoxW - 10, 16);
    } catch {
      // si la imagen no se puede cargar, dejamos el espacio en blanco
    }
  }

  hLine(doc, buyerX + 5, y + 32, buyerX + sigBoxW - 5, 0.5);
  doc.setFontSize(7);
  setRgb(doc, MEDIUM_GRAY);
  doc.text(
    signerName ? `Firmado digitalmente por: ${signerName}` : 'Firma del comprador',
    buyerX + sigBoxW / 2,
    y + 37,
    { align: 'center' },
  );

  y += 46;

  if (signatureBase64 && signerName) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    setRgb(doc, [16, 185, 129]);
    doc.text(
      `✓ Documento firmado digitalmente el ${formatDate(new Date().toISOString())} por ${signerName}`,
      margin,
      y,
    );
    y += 6;
  }

  // ── Footer ────────────────────────────────────────────────────────────────────
  const footerY = pageH - 12;
  hLine(doc, margin, footerY - 4, pageW - margin, 0.3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setRgb(doc, MEDIUM_GRAY);
  doc.text(
    `${contract.companyName || ''} · ${contract.companyCif || ''} · ${contract.companyAddress || ''}`,
    pageW / 2,
    footerY,
    { align: 'center' },
  );
  doc.text(`Pág. 1`, pageW - margin, footerY, { align: 'right' });

  const filename = `Contrato-${(contract.vehiclePlate || contract.id.slice(-8)).replace(/\s+/g, '')}.pdf`;
  doc.save(filename);
}
