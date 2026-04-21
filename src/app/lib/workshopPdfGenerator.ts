import { jsPDF } from 'jspdf';
import type { WorkOrder } from './workshopApi';

export interface WorkshopInvoiceOptions {
  workOrder: WorkOrder;
  issuerName?: string;
  issuerNif?: string;
  issuerAddress?: string;
  issuerPhone?: string;
  taxRate?: number;
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

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function drawHRule(doc: jsPDF, y: number, x1 = 15, x2 = 195, color: [number, number, number] = [226, 232, 240]) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.line(x1, y, x2, y);
}

const SERVICE_LABELS: Record<string, string> = {
  revision: 'Revisión',
  reparacion: 'Reparación',
  mantenimiento: 'Mantenimiento',
  puesta_punto: 'Puesta a punto',
  garantia: 'Garantía',
  otro: 'Otro',
};

export function generateWorkshopInvoicePdf(options: WorkshopInvoiceOptions): void {
  const { workOrder, issuerName = 'Taller', issuerNif = '', issuerAddress = '', issuerPhone = '', taxRate = 21 } = options;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = 15;

  // ─── Header ───────────────────────────────────────────────────────────────

  // Dark header band
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, pageW, 45, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('FACTURA DE TALLER', margin, 18);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(156, 163, 175);
  doc.text(`OT: ${workOrder.woNumber}`, margin, 26);
  doc.text(`Fecha: ${formatDate(workOrder.updatedAt)}`, margin, 32);

  if (issuerName) {
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(issuerName, pageW - margin, 18, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    if (issuerNif) doc.text(`NIF: ${issuerNif}`, pageW - margin, 25, { align: 'right' });
    if (issuerAddress) doc.text(issuerAddress, pageW - margin, 31, { align: 'right' });
    if (issuerPhone) doc.text(`Tel: ${issuerPhone}`, pageW - margin, 37, { align: 'right' });
  }

  y = 55;

  // ─── Vehicle & Client info ─────────────────────────────────────────────────

  doc.setTextColor(17, 24, 39);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL VEHÍCULO', margin, y);
  doc.text('DATOS DEL CLIENTE', margin + contentW / 2 + 5, y);
  y += 4;
  drawHRule(doc, y, margin, pageW - margin);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55, 65, 81);

  const leftLines: string[] = [
    `${workOrder.vehicleBrand} ${workOrder.vehicleModel}`,
    `Matrícula: ${workOrder.vehiclePlate || '—'}`,
    workOrder.vehicleVin ? `VIN: ${workOrder.vehicleVin}` : '',
    workOrder.vehicleMileage ? `Km entrada: ${workOrder.vehicleMileage.toLocaleString('es-ES')} km` : '',
    `Servicio: ${SERVICE_LABELS[workOrder.serviceType] || workOrder.serviceType}`,
    `Mecánico: ${workOrder.responsible || '—'}`,
  ].filter(Boolean);

  const rightLines: string[] = [
    workOrder.clientName || '—',
    workOrder.clientPhone ? `Tel: ${workOrder.clientPhone}` : '',
    workOrder.clientEmail ? workOrder.clientEmail : '',
  ].filter(Boolean);

  const maxLines = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < maxLines; i++) {
    doc.setFontSize(9);
    if (i < leftLines.length) doc.text(leftLines[i], margin, y + i * 5.5);
    if (i < rightLines.length) doc.text(rightLines[i], margin + contentW / 2 + 5, y + i * 5.5);
  }

  y += maxLines * 5.5 + 8;
  drawHRule(doc, y, margin, pageW - margin);
  y += 7;

  // ─── Labor Items ───────────────────────────────────────────────────────────

  if (workOrder.laborItems.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text('MANO DE OBRA', margin, y);
    y += 5;

    // Table header
    doc.setFillColor(249, 250, 251);
    doc.rect(margin, y, contentW, 7, 'F');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.setFont('helvetica', 'bold');
    doc.text('DESCRIPCIÓN', margin + 2, y + 5);
    doc.text('MECÁNICO', margin + 80, y + 5);
    doc.text('HORAS', margin + 115, y + 5);
    doc.text('€/H', margin + 135, y + 5);
    doc.text('TOTAL', margin + contentW - 2, y + 5, { align: 'right' });
    y += 9;

    let laborTotal = 0;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(55, 65, 81);
    for (const item of workOrder.laborItems) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(9);
      doc.text(item.description || '—', margin + 2, y);
      doc.text(item.mechanicName || '—', margin + 80, y);
      doc.text(String(item.hours), margin + 115, y);
      doc.text(formatCurrency(item.ratePerHour), margin + 135, y);
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(item.total), margin + contentW - 2, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      laborTotal += item.total;
      y += 6;
      drawHRule(doc, y);
      y += 2;
    }

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text('Subtotal mano de obra:', margin + 80, y + 3);
    doc.text(formatCurrency(laborTotal), margin + contentW - 2, y + 3, { align: 'right' });
    y += 9;
  }

  // ─── Material Items ────────────────────────────────────────────────────────

  if (workOrder.materialItems.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    y += 3;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text('MATERIALES Y RECAMBIOS', margin, y);
    y += 5;

    doc.setFillColor(249, 250, 251);
    doc.rect(margin, y, contentW, 7, 'F');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.setFont('helvetica', 'bold');
    doc.text('PIEZA / MATERIAL', margin + 2, y + 5);
    doc.text('REF.', margin + 90, y + 5);
    doc.text('CANT.', margin + 115, y + 5);
    doc.text('€/UD', margin + 135, y + 5);
    doc.text('TOTAL', margin + contentW - 2, y + 5, { align: 'right' });
    y += 9;

    let materialsTotal = 0;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(55, 65, 81);
    for (const item of workOrder.materialItems) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(9);
      doc.text(item.partName || '—', margin + 2, y);
      doc.text(item.reference || '—', margin + 90, y);
      doc.text(String(item.quantity), margin + 115, y);
      doc.text(formatCurrency(item.unitCost), margin + 135, y);
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(item.total), margin + contentW - 2, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      materialsTotal += item.total;
      y += 6;
      drawHRule(doc, y);
      y += 2;
    }

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text('Subtotal materiales:', margin + 80, y + 3);
    doc.text(formatCurrency(materialsTotal), margin + contentW - 2, y + 3, { align: 'right' });
    y += 9;
  }

  // ─── Time Tracking summary ─────────────────────────────────────────────────

  const completedTimeEntries = workOrder.timeEntries.filter(e => e.duration);
  if (completedTimeEntries.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    y += 3;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text('REGISTRO DE TIEMPOS', margin, y);
    y += 5;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(55, 65, 81);
    for (const te of completedTimeEntries) {
      if (y > 260) break;
      doc.text(
        `${te.mechanicName || '—'} — ${formatDate(te.startTime)} ${new Date(te.startTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} → ${te.endTime ? new Date(te.endTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'} (${te.duration ? formatDuration(te.duration) : '—'})`,
        margin + 2,
        y,
      );
      y += 5.5;
    }

    const totalMinutes = completedTimeEntries.reduce((s, e) => s + (e.duration || 0), 0);
    doc.setFont('helvetica', 'bold');
    doc.text(`Tiempo total: ${formatDuration(totalMinutes)}`, margin + 2, y);
    y += 8;
  }

  // ─── Totals ────────────────────────────────────────────────────────────────

  if (y > 240) { doc.addPage(); y = 20; }
  y += 5;
  drawHRule(doc, y, margin, pageW - margin, [17, 24, 39]);
  y += 6;

  const subtotal = workOrder.totalCost;
  const taxAmount = subtotal * taxRate / 100;
  const total = subtotal + taxAmount;

  const totalsX = margin + contentW - 60;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  doc.text('Base imponible:', totalsX, y);
  doc.setTextColor(17, 24, 39);
  doc.text(formatCurrency(subtotal), margin + contentW, y, { align: 'right' });
  y += 6;

  doc.setTextColor(107, 114, 128);
  doc.text(`IVA (${taxRate}%):`, totalsX, y);
  doc.setTextColor(17, 24, 39);
  doc.text(formatCurrency(taxAmount), margin + contentW, y, { align: 'right' });
  y += 6;

  // Total box
  doc.setFillColor(17, 24, 39);
  doc.rect(totalsX - 5, y, contentW - totalsX + margin + 5, 11, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL:', totalsX, y + 7.5);
  doc.text(formatCurrency(total), margin + contentW - 2, y + 7.5, { align: 'right' });
  y += 18;

  // ─── Notes ────────────────────────────────────────────────────────────────

  if (workOrder.notes) {
    y += 3;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(55, 65, 81);
    doc.text('Observaciones:', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    const noteLines = doc.splitTextToSize(workOrder.notes, contentW);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 5;
  }

  // ─── Signatures ───────────────────────────────────────────────────────────

  if (workOrder.mechanicSignature || workOrder.clientSignature) {
    if (y > 230) { doc.addPage(); y = 20; }
    y += 8;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text('FIRMAS', margin, y);
    y += 4;
    drawHRule(doc, y, margin, pageW - margin);
    y += 8;

    const sigW = 70;
    const sigH = 35;

    if (workOrder.mechanicSignature) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Firma del mecánico:', margin, y);
      try {
        doc.addImage(workOrder.mechanicSignature, 'PNG', margin, y + 3, sigW, sigH);
      } catch {
        // ignore signature rendering errors
      }
    }

    if (workOrder.clientSignature) {
      const rightX = margin + contentW / 2 + 5;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Firma del cliente (conforme):', rightX, y);
      try {
        doc.addImage(workOrder.clientSignature, 'PNG', rightX, y + 3, sigW, sigH);
      } catch {
        // ignore signature rendering errors
      }
    }
  }

  // ─── Footer ───────────────────────────────────────────────────────────────

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175);
    doc.text(
      `Página ${i} de ${pageCount} · ${workOrder.woNumber} · Generado el ${formatDate(new Date().toISOString())}`,
      pageW / 2,
      292,
      { align: 'center' },
    );
  }

  doc.save(`factura-taller-${workOrder.woNumber}.pdf`);
}
