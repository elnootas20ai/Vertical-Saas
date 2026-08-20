import { jsPDF } from 'jspdf';
import {
  VERTIAL_PROVIDER,
  VERTIAL_SERVICE_AGREEMENT_VERSION,
  formatAgreementDateEs,
  type ServiceAgreementClause,
  type ServiceAgreementParty,
  type SignedServiceAgreement,
} from './vertialServiceAgreement';

function safeFilePart(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 40) || 'cliente';
}

function ensureSpace(
  doc: jsPDF,
  y: number,
  need: number,
  pageH: number,
  margin: number,
): number {
  if (y + need <= pageH - margin) return y;
  doc.addPage();
  return margin;
}

/**
 * PDF del contrato SaaS Vertial (datos empresa + cláusulas + firma si hay).
 */
export function downloadVertialServiceAgreementPdf(input: {
  party: ServiceAgreementParty;
  clauses: ServiceAgreementClause[];
  version?: string;
  signedAt?: string;
  signatureDataUrl?: string;
  signerName?: string;
}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentW = pageW - margin * 2;
  let y = margin;

  const version = input.version || VERTIAL_SERVICE_AGREEMENT_VERSION;
  const party = input.party;
  const signedAt = input.signedAt;
  const signerName = input.signerName || party.signerName || '';

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 26, 'F');
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 26, pageW, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('VERTIAL', margin, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text('Contrato de prestación de servicios SaaS', margin, 19);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(version, pageW - margin, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`Fecha: ${formatAgreementDateEs(signedAt)}`, pageW - margin, 19, { align: 'right' });

  y = 34;

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Contrato de servicio Vertial', margin, y);
  y += 8;

  // Provider box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentW, 16, 2, 2, 'FD');
  y += 6;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('PRESTADOR DEL SERVICIO', margin + 3, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.text(VERTIAL_PROVIDER.name, margin + 3, y);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${VERTIAL_PROVIDER.ownerName} · DNI ${VERTIAL_PROVIDER.taxId} · Tel. ${VERTIAL_PROVIDER.phone} · ${VERTIAL_PROVIDER.email}`,
    margin + 3 + doc.getTextWidth(VERTIAL_PROVIDER.name) + 4,
    y,
  );
  y += 9;

  // Party box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentW, 38, 2, 2, 'FD');
  y += 6;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('DATOS DEL CLIENTE', margin + 3, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);

  const rows: [string, string][] = [
    ['Razón social', party.legalName || '—'],
    ['Nombre comercial', party.tradeName || '—'],
    ['NIF/CIF', party.taxId || '—'],
    ['Email', party.email || '—'],
    ['Teléfono', party.phone || '—'],
    [
      'Domicilio',
      [party.address, party.city, party.province].filter(Boolean).join(', ') || '—',
    ],
  ];
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text(`${label}:`, margin + 3, y);
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(value, contentW - 42);
    doc.text(lines, margin + 38, y);
    y += Math.max(4.5, lines.length * 4);
  }
  y += 6;

  // Clauses
  for (const clause of input.clauses) {
    y = ensureSpace(doc, y, 18, pageH, margin);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(clause.title, margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    const bodyLines = doc.splitTextToSize(clause.body, contentW);
    for (let i = 0; i < bodyLines.length; i += 1) {
      y = ensureSpace(doc, y, 5, pageH, margin);
      doc.text(bodyLines[i], margin, y);
      y += 4.2;
    }
    y += 4;
  }

  // Signature
  y = ensureSpace(doc, y, 50, pageH, margin);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Firma del Cliente', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Firmante: ${signerName || '—'}`, margin, y);
  y += 5;
  if (signedAt) {
    doc.text(`Firmado el: ${formatAgreementDateEs(signedAt)}`, margin, y);
    y += 6;
  } else {
    doc.setTextColor(148, 163, 184);
    doc.text('(Borrador sin firmar)', margin, y);
    y += 6;
  }

  if (input.signatureDataUrl && input.signatureDataUrl.startsWith('data:image')) {
    try {
      y = ensureSpace(doc, y, 36, pageH, margin);
      doc.addImage(input.signatureDataUrl, 'PNG', margin, y, 70, 28);
      y += 32;
    } catch {
      doc.setTextColor(100, 116, 139);
      doc.text('(No se pudo incrustar la imagen de firma)', margin, y);
      y += 6;
    }
  }

  y = ensureSpace(doc, y, 16, pageH, margin);
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  const footer = doc.splitTextToSize(
    `Documento generado por Vertial · Versión ${version}. Conservar como evidencia del consentimiento.`,
    contentW,
  );
  doc.text(footer, margin, pageH - 12);

  const stamp = (signedAt || new Date().toISOString()).slice(0, 10);
  const fileName = `contrato-vertial-${safeFilePart(party.taxId || party.tradeName)}-${stamp}.pdf`;
  doc.save(fileName);
}

export function downloadSignedServiceAgreementPdf(signed: SignedServiceAgreement): void {
  downloadVertialServiceAgreementPdf({
    party: signed.party,
    clauses: signed.clauses,
    version: signed.version,
    signedAt: signed.signedAt,
    signatureDataUrl: signed.signatureDataUrl,
    signerName: signed.signerName,
  });
}
