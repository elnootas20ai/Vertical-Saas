import type {
  DeliveryCatalogImportIssue,
  DeliveryCatalogImportValidation,
} from './deliveryCatalogExcelTemplate';
import type { ImportBrandLike } from './deliveryCatalogImportLogic';
import {
  extractMissingBrandNameFromWarningMessage,
  formatMissingBrandImportNotice,
  MISSING_BRAND_IMPORT_CODE,
} from './deliveryCatalogImportLogic';

export type CatalogImportReportLine = {
  row?: number;
  field?: string;
  message: string;
  /** p. ej. missing_brand — aviso de marca/línea no encontrada. */
  code?: string;
  /** Valor asociado (p. ej. nombre de la marca faltante). */
  value?: string;
};

export type CatalogImportReport = {
  at: number;
  summary: string;
  errors: CatalogImportReportLine[];
  warnings: CatalogImportReportLine[];
  created?: number;
  updated?: number;
  failed?: number;
};

export type CatalogImportRunResult = {
  count: number;
  report: CatalogImportReport | null;
};

/** Progreso en vivo durante importaciones largas (catálogo delivery, etc.). */
export type CatalogImportProgressUpdate = {
  phase: string;
  detail?: string;
  current?: number;
  total?: number;
  /** 0–100; si falta, se calcula con current/total o barra indeterminada. */
  percent?: number;
};

export type CatalogImportProgressReporter = (update: CatalogImportProgressUpdate) => void;

export type { ImportAbortError } from './importAbort';
export { throwIfAborted, isImportAbortError } from './importAbort';

function mapIssue(issue: DeliveryCatalogImportIssue): CatalogImportReportLine {
  return {
    row: issue.row,
    field: issue.field,
    message: issue.message,
    code: issue.code,
    value: issue.value,
  };
}

function isMissingBrandWarning(line: CatalogImportReportLine): boolean {
  if (line.code === MISSING_BRAND_IMPORT_CODE) return true;
  if (line.field !== 'linea') return false;
  const msg = String(line.message || '');
  return (
    msg.includes('Ajustes → Marca') &&
    (msg.includes('pusiste') || msg.includes('Falta la marca') || msg.includes('no existe'))
  );
}

/**
 * Agrupa avisos de marca/línea faltante en 1 bloque claro por marca
 * (evita 26 párrafos casi iguales en el informe).
 */
export function consolidateCatalogImportWarnings(
  warnings: CatalogImportReportLine[],
  brands: ImportBrandLike[] = [],
): CatalogImportReportLine[] {
  const missingByBrand = new Map<string, { rows: number[]; count: number }>();
  const other: CatalogImportReportLine[] = [];

  for (const line of warnings) {
    if (!isMissingBrandWarning(line)) {
      other.push(line);
      continue;
    }
    const brandName =
      String(line.value || '').trim() || extractMissingBrandNameFromWarningMessage(line.message) || 'desconocida';
    const entry = missingByBrand.get(brandName) || { rows: [], count: 0 };
    entry.count += 1;
    if (line.row != null) entry.rows.push(line.row);
    missingByBrand.set(brandName, entry);
  }

  const summarized: CatalogImportReportLine[] = [...missingByBrand.entries()].map(([name, info]) => ({
    field: 'linea',
    code: MISSING_BRAND_IMPORT_CODE,
    value: name,
    message: formatMissingBrandImportNotice(name, info.count, brands),
  }));

  return [...summarized, ...other];
}

export function catalogImportReportFromValidation(
  validation: DeliveryCatalogImportValidation,
  brands: ImportBrandLike[] = [],
): CatalogImportReport {
  const errors = validation.issues.filter((i) => i.severity === 'error').map(mapIssue);
  const warnings = consolidateCatalogImportWarnings(
    validation.issues.filter((i) => i.severity === 'warning').map(mapIssue),
    brands,
  );
  const missingBrandCount = warnings.filter((w) => w.code === MISSING_BRAND_IMPORT_CODE).length;
  return {
    at: Date.now(),
    summary: validation.ok
      ? warnings.length > 0
        ? missingBrandCount > 0 && missingBrandCount === warnings.length
          ? `Importación con aviso: falta marca en Ajustes → Marca`
          : `Importación con ${warnings.length} aviso(s)`
        : 'Importación correcta'
      : `Importación bloqueada — ${errors.length} error(es) en el Excel`,
    errors,
    warnings,
  };
}

export function catalogImportReportFromBulkErrors(
  errorDetails: Array<{ index?: number; name?: string; error?: string }> | undefined,
  created = 0,
  updated = 0,
): CatalogImportReport | null {
  if (!errorDetails?.length) return null;
  return {
    at: Date.now(),
    summary: `${errorDetails.length} producto(s) no se importaron`,
    errors: errorDetails.map((e) => ({
      row: typeof e.index === 'number' ? e.index + 2 : undefined,
      field: 'import',
      message: `${e.name || 'Producto'}: ${e.error || 'Error desconocido'}`,
    })),
    warnings: [],
    created,
    updated,
    failed: errorDetails.length,
  };
}

export function catalogImportReportSimple(
  summary: string,
  errors: CatalogImportReportLine[] = [],
  warnings: CatalogImportReportLine[] = [],
): CatalogImportReport {
  return { at: Date.now(), summary, errors, warnings };
}
