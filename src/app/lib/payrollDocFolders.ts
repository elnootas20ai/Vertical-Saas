import type { PayrollDocumentType } from './payrollApi';
import { IDENTITY_DOC_TYPES } from './gestoriaLaborMetrics';

/** Carpetas organizadas en Nóminas → Documentación / ficha trabajador. */
export type PayrollDocFolderId =
  | 'nomina'
  | 'contrato'
  | 'certificado'
  | 'justificante'
  | 'baja'
  | 'identity'
  | 'otro';

export type PayrollDocFolderDef = {
  id: PayrollDocFolderId;
  label: string;
  hint: string;
  /** Tipo por defecto al subir desde esta carpeta. */
  uploadType: PayrollDocumentType;
  match: (documentType: PayrollDocumentType) => boolean;
  /** Quién suele subir: empresa o trabajador. */
  uploader: 'manager' | 'worker' | 'both';
};

export const PAYROLL_DOC_FOLDERS: PayrollDocFolderDef[] = [
  {
    id: 'nomina',
    label: 'Nóminas',
    hint: 'PDF de nómina del mes',
    uploadType: 'nomina',
    match: (t) => t === 'nomina',
    uploader: 'manager',
  },
  {
    id: 'contrato',
    label: 'Contrato',
    hint: 'Contrato laboral y anexos',
    uploadType: 'contrato',
    match: (t) => t === 'contrato',
    uploader: 'manager',
  },
  {
    id: 'certificado',
    label: 'Certificados / permisos',
    hint: 'Permisos, certificados y anexos',
    uploadType: 'certificado',
    match: (t) =>
      t === 'certificado'
      || t === 'titulo'
      || t === 'certificado_penales'
      || t === 'prl'
      || t === 'seguro'
      || t === 'reconocimiento_medico',
    uploader: 'manager',
  },
  {
    id: 'justificante',
    label: 'Justificantes',
    hint: 'Justificante de ausencia, cita, etc.',
    uploadType: 'justificante',
    match: (t) => t === 'justificante',
    uploader: 'both',
  },
  {
    id: 'baja',
    label: 'Baja / IT',
    hint: 'Parte de baja o alta médica',
    uploadType: 'baja',
    match: (t) => t === 'baja',
    uploader: 'both',
  },
  {
    id: 'identity',
    label: 'Identidad',
    hint: 'DNI, NIE, pasaporte…',
    uploadType: 'dni_nie',
    match: (t) => IDENTITY_DOC_TYPES.includes(t),
    uploader: 'worker',
  },
  {
    id: 'otro',
    label: 'Otros',
    hint: 'Documentos que no encajan arriba',
    uploadType: 'otro',
    match: (t) =>
      t === 'otro'
      || (
        t !== 'nomina'
        && t !== 'contrato'
        && t !== 'certificado'
        && t !== 'justificante'
        && t !== 'baja'
        && t !== 'titulo'
        && t !== 'certificado_penales'
        && t !== 'prl'
        && t !== 'seguro'
        && t !== 'reconocimiento_medico'
        && !IDENTITY_DOC_TYPES.includes(t)
      ),
    uploader: 'both',
  },
];

/** Tipos que el trabajador puede subir desde Documentos. */
export const WORKER_UPLOAD_FOLDER_TYPES: PayrollDocumentType[] = [
  'dni_nie',
  'pasaporte',
  'permiso_trabajo',
  'carnet_conducir',
  'baja',
  'justificante',
  'certificado_penales',
  'titulo',
  'otro',
];
