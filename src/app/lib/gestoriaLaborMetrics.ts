/**
 * Métricas del hub Gestoría: equipo laboral + modelos/impuestos.
 * Usa docs de payroll y ficha personal del trabajador (sin portal externo).
 */

import type { PayrollDocument, PayrollDocumentType } from './payrollApi';
import { countPayslipsThisMonth } from './teamDashboardMetrics';

export const IDENTITY_DOC_TYPES: PayrollDocumentType[] = [
  'dni_nie',
  'pasaporte',
  'permiso_trabajo',
  'carnet_conducir',
];

export const WORKER_SELF_UPLOAD_TYPES: PayrollDocumentType[] = [
  'dni_nie',
  'pasaporte',
  'permiso_trabajo',
  'carnet_conducir',
  'certificado_penales',
  'titulo',
  'otro',
];

export const LABOR_DOC_TYPES: PayrollDocumentType[] = [
  'nomina',
  'contrato',
  'certificado',
  'baja',
  'reconocimiento_medico',
  'prl',
  'seguro',
];

export type GestoriaWorkerRef = {
  user_id: string;
  fullName: string;
  email?: string;
  personalData?: {
    dni?: string;
    birthDate?: string;
    phone?: string;
    address?: string;
    city?: string;
    socialSecurityNumber?: string;
  } | null;
  employment?: {
    bankAccount?: string;
    contractType?: string;
  } | null;
  workerIdentityCompleted?: boolean;
};

export type GestoriaWorkerRow = {
  user_id: string;
  fullName: string;
  email: string;
  hasDniNumber: boolean;
  hasIdentityScan: boolean;
  hasContract: boolean;
  hasPayslipThisMonth: boolean;
  hasIban: boolean;
  hasNss: boolean;
  identityComplete: boolean;
  docsCount: number;
  missingLabels: string[];
};

export type GestoriaHubSnapshot = {
  totalWorkers: number;
  identityCompleteCount: number;
  missingIdentityScanCount: number;
  missingDniNumberCount: number;
  payslipsThisMonth: number;
  contractsCount: number;
  laborDocsTotal: number;
  expiringOrExpiredCount: number;
  taxModelsCount: number;
  workersReadyPercent: number;
  workers: GestoriaWorkerRow[];
};

function monthPeriod(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export function buildGestoriaHubSnapshot(params: {
  workers: GestoriaWorkerRef[];
  payrollDocs: PayrollDocument[];
  taxModelsCount?: number;
  expiringOrExpiredCount?: number;
  today?: Date;
}): GestoriaHubSnapshot {
  const today = params.today || new Date();
  const period = monthPeriod(today);
  const memberIds = new Set(params.workers.map((w) => w.user_id));
  const docsByWorker = new Map<string, PayrollDocument[]>();
  for (const doc of params.payrollDocs) {
    if (!memberIds.has(doc.worker_id)) continue;
    const list = docsByWorker.get(doc.worker_id) || [];
    list.push(doc);
    docsByWorker.set(doc.worker_id, list);
  }

  const workers: GestoriaWorkerRow[] = params.workers.map((w) => {
    const docs = docsByWorker.get(w.user_id) || [];
    const hasDniNumber = Boolean(String(w.personalData?.dni || '').trim());
    const hasIdentityScan = docs.some((d) => IDENTITY_DOC_TYPES.includes(d.documentType));
    const hasContract = docs.some((d) => d.documentType === 'contrato');
    const hasPayslipThisMonth = docs.some(
      (d) =>
        d.documentType === 'nomina'
        && (d.period === period || (!d.period && String(d.createdAt || '').startsWith(period))),
    );
    const hasIban = Boolean(String(w.employment?.bankAccount || '').trim());
    const hasNss = Boolean(String(w.personalData?.socialSecurityNumber || '').trim());
    const identityComplete = Boolean(
      w.workerIdentityCompleted
      || (hasDniNumber
        && String(w.personalData?.birthDate || '').trim()
        && String(w.personalData?.address || '').trim()
        && String(w.personalData?.city || '').trim()),
    );

    const missingLabels: string[] = [];
    if (!hasDniNumber) missingLabels.push('DNI/NIE (dato)');
    if (!hasIdentityScan) missingLabels.push('Escaneo DNI/NIE');
    if (!hasNss) missingLabels.push('Nº Seguridad Social');
    if (!hasIban) missingLabels.push('IBAN');
    if (!hasContract) missingLabels.push('Contrato');
    if (!hasPayslipThisMonth) missingLabels.push('Nómina del mes');

    return {
      user_id: w.user_id,
      fullName: w.fullName || w.email || w.user_id,
      email: w.email || '',
      hasDniNumber,
      hasIdentityScan,
      hasContract,
      hasPayslipThisMonth,
      hasIban,
      hasNss,
      identityComplete,
      docsCount: docs.length,
      missingLabels,
    };
  });

  const identityCompleteCount = workers.filter((w) => w.identityComplete).length;
  const payslipsThisMonth = countPayslipsThisMonth(
    params.payrollDocs.map((d) => ({
      worker_id: d.worker_id,
      documentType: d.documentType,
      period: d.period,
      createdAt: d.createdAt,
    })),
    memberIds,
    period,
  );

  return {
    totalWorkers: workers.length,
    identityCompleteCount,
    missingIdentityScanCount: workers.filter((w) => !w.hasIdentityScan).length,
    missingDniNumberCount: workers.filter((w) => !w.hasDniNumber).length,
    payslipsThisMonth,
    contractsCount: params.payrollDocs.filter((d) => d.documentType === 'contrato').length,
    laborDocsTotal: params.payrollDocs.length,
    expiringOrExpiredCount: params.expiringOrExpiredCount || 0,
    taxModelsCount: params.taxModelsCount || 0,
    workersReadyPercent:
      workers.length === 0
        ? 0
        : Math.round((identityCompleteCount / workers.length) * 100),
    workers,
  };
}

export function isTaxModelDocument(doc: {
  docType?: string;
  name?: string;
  templateId?: string;
}): boolean {
  const type = String(doc.docType || '').toLowerCase();
  if (type === 'financial' || type === 'impuestos' || type === 'tax') return true;
  const name = String(doc.name || '').toLowerCase();
  if (/\bmodelo\s*(1\d{2}|200|303|111|115|130|190|347|349|390)\b/.test(name)) return true;
  if (name.includes('impuesto') || name.includes('iva') || name.includes('irpf')) return true;
  const template = String(doc.templateId || '').toLowerCase();
  return template.includes('modelo') || template.includes('factura') || template.startsWith('tax');
}
