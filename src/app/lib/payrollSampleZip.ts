import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import type { AuthUser } from './authApi';

function defaultPayrollPeriod(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function memberDisplayName(member: AuthUser): string {
  return member.fullName?.trim() || `${member.firstName || ''} ${member.lastName || ''}`.trim();
}

export function payrollSampleFileNameForMember(member: AuthUser, period: string): string {
  const slug = memberDisplayName(member)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const [year, month] = period.split('-');
  return `nomina_${slug || 'trabajador'}_${year}_${month}.pdf`;
}

function buildSamplePayslipPdf(workerName: string, period: string): ArrayBuffer {
  const doc = new jsPDF();
  const [year, month] = period.split('-');
  doc.setFontSize(18);
  doc.text('Nomina de prueba', 20, 30);
  doc.setFontSize(12);
  doc.text(`Trabajador: ${workerName}`, 20, 50);
  doc.text(`Periodo: ${month}/${year}`, 20, 62);
  doc.text('Documento generado por Vertial para pruebas internas.', 20, 80);
  return doc.output('arraybuffer');
}

export async function downloadPayrollSampleZip(
  members: AuthUser[],
  period?: string,
): Promise<{ fileCount: number; fileNames: string[] }> {
  const effectivePeriod = period?.trim() || defaultPayrollPeriod();
  const active = members.filter((m) => m.status !== 'inactive' && memberDisplayName(m));
  if (active.length === 0) {
    throw new Error('No hay trabajadores activos en el equipo para generar el ZIP de prueba.');
  }

  const zip = new JSZip();
  const fileNames: string[] = [];

  for (const member of active) {
    const workerName = memberDisplayName(member);
    const fileName = payrollSampleFileNameForMember(member, effectivePeriod);
    zip.file(fileName, buildSamplePayslipPdf(workerName, effectivePeriod));
    fileNames.push(fileName);
  }

  zip.file(
    'LEEME.txt',
    [
      'ZIP de prueba — nominas Vertial',
      '',
      `Mes: ${effectivePeriod}`,
      `PDFs incluidos: ${active.length}`,
      '',
      'Cada PDF lleva el nombre del trabajador de tu equipo.',
      'Sube este ZIP en Equipo → Nominas → Subir ZIP nominas.',
      '',
      'Archivos:',
      ...fileNames.map((f) => `- ${f}`),
    ].join('\n'),
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nominas_prueba_${effectivePeriod.replace('-', '_')}.zip`;
  link.click();
  URL.revokeObjectURL(url);

  return { fileCount: fileNames.length, fileNames };
}
