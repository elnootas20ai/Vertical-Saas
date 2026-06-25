import type {
  DeliveryCatalogImportIssue,
  DeliveryCatalogImportValidation,
} from './deliveryCatalogExcelTemplate';

export type CatalogImportReportLine = {
  row?: number;
  field?: string;
  message: string;
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

function mapIssue(issue: DeliveryCatalogImportIssue): CatalogImportReportLine {
  return {
    row: issue.row,
    field: issue.field,
    message: issue.message,
  };
}

export function catalogImportReportFromValidation(
  validation: DeliveryCatalogImportValidation,
): CatalogImportReport {
  const errors = validation.issues.filter((i) => i.severity === 'error').map(mapIssue);
  const warnings = validation.issues.filter((i) => i.severity === 'warning').map(mapIssue);
  return {
    at: Date.now(),
    summary: validation.ok
      ? warnings.length > 0
        ? `Importación con ${warnings.length} aviso(s)`
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
