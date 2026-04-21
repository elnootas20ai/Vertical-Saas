import { jsPDF } from 'jspdf';
import type { SaleRecord } from './salesTypes';

export function buildDeliveryActaPdfBlob(sale: SaleRecord): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const dd = sale.deliveryData;
  let y = 20;

  doc.setFontSize(16);
  doc.text('Acta de entrega de vehículo', 20, y);
  y += 10;

  doc.setFontSize(10);
  doc.text(`Fecha: ${dd?.actualDate ? new Date(dd.actualDate).toLocaleString('es-ES') : new Date().toLocaleString('es-ES')}`, 20, y);
  y += 7;

  doc.setFont(undefined, 'bold');
  doc.text('Vehículo', 20, y);
  doc.setFont(undefined, 'normal');
  y += 6;
  doc.text(`${sale.vehicleName} — ${sale.vehiclePlate}`, 20, y);
  y += 6;
  if (sale.vehicleMileage) {
    doc.text(`Kilometraje en entrega: ${dd?.mileageAtDelivery ?? sale.vehicleMileage} km`, 20, y);
    y += 6;
  }
  if (dd?.fuelLevel) {
    doc.text(`Combustible: ${dd.fuelLevel}`, 20, y);
    y += 6;
  }

  doc.setFont(undefined, 'bold');
  doc.text('Cliente', 20, y);
  doc.setFont(undefined, 'normal');
  y += 6;
  doc.text(`${sale.clientName}`, 20, y);
  y += 5;
  doc.text(`Tel: ${sale.clientPhone} · Email: ${sale.clientEmail}`, 20, y);
  y += 8;

  doc.setFont(undefined, 'bold');
  doc.text('Entrega', 20, y);
  doc.setFont(undefined, 'normal');
  y += 6;
  doc.text(`Entregado por: ${dd?.deliveredBy || '—'}`, 20, y);
  y += 5;
  doc.text(`Recibido por: ${dd?.receivedBy || sale.clientName}`, 20, y);
  y += 5;
  if (dd?.receivedByDni) {
    doc.text(`DNI: ${dd.receivedByDni}`, 20, y);
    y += 5;
  }
  if (dd?.deliveryLocation) {
    doc.text(`Lugar: ${dd.deliveryLocation}`, 20, y);
    y += 5;
  }
  y += 4;

  doc.setFont(undefined, 'bold');
  doc.text('Observaciones', 20, y);
  doc.setFont(undefined, 'normal');
  y += 6;
  const obs = [dd?.deliveryNotes, dd?.conditionNotes].filter(Boolean).join('\n') || 'Sin incidencias.';
  const obsLines = doc.splitTextToSize(obs, 170);
  doc.text(obsLines, 20, y);
  y += obsLines.length * 5 + 8;

  doc.setFontSize(9);
  doc.text(
    'El receptor declara haber inspeccionado el vehículo y recibirlo en las condiciones descritas.',
    20,
    Math.min(y, 250),
  );

  if (dd?.signatureData && dd.signatureData.startsWith('data:image')) {
    try {
      doc.addImage(dd.signatureData, 'PNG', 20, Math.min(y + 10, 220), 60, 25);
      doc.text('Firma del receptor', 20, Math.min(y + 38, 255));
    } catch {
      doc.text('(Firma digital no incrustada)', 20, Math.min(y + 10, 250));
    }
  }

  return doc.output('blob');
}

export function downloadDeliveryActa(sale: SaleRecord, filename = 'acta-entrega.pdf') {
  const blob = buildDeliveryActaPdfBlob(sale);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
