import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { CatalogImportReport, CatalogImportReportLine } from '../../lib/catalogImportReport';
import { MISSING_BRAND_IMPORT_CODE } from '../../lib/deliveryCatalogImportLogic';

type CatalogImportReportPanelProps = {
  report: CatalogImportReport;
  onDismiss?: () => void;
  compact?: boolean;
};

function formatLine(line: { row?: number; field?: string; message: string }): string {
  const parts: string[] = [];
  if (line.row != null) parts.push(`Fila ${line.row}`);
  if (line.field) parts.push(line.field);
  parts.push(line.message);
  return parts.join(' · ');
}

function isMissingBrandWarning(line: CatalogImportReportLine): boolean {
  return line.code === MISSING_BRAND_IMPORT_CODE;
}

export function CatalogImportReportPanel({
  report,
  onDismiss,
  compact = false,
}: CatalogImportReportPanelProps) {
  const importedCount = (report.created ?? 0) + (report.updated ?? 0);
  const hasErrors = report.errors.length > 0;
  const hasWarnings = report.warnings.length > 0;
  const importSucceeded = importedCount > 0 && !hasErrors;
  const missingBrandWarnings = report.warnings.filter(isMissingBrandWarning);
  const otherWarnings = report.warnings.filter((w) => !isMissingBrandWarning(w));

  const borderClass = hasErrors
    ? 'border-red-300 dark:border-red-800 bg-red-50/90 dark:bg-red-950/30'
    : importSucceeded
      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/90 dark:bg-emerald-950/30'
      : hasWarnings
        ? 'border-amber-300 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/30'
        : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/90 dark:bg-emerald-950/30';

  return (
    <div className={`rounded-xl border-2 overflow-hidden ${borderClass}`}>
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-black/5 dark:border-white/5">
        <div className="flex items-start gap-2 min-w-0">
          {hasErrors ? (
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
          ) : importSucceeded || !hasWarnings ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className="font-bold text-sm text-gray-900 dark:text-gray-100">{report.summary}</p>
            {(report.created != null || report.updated != null || report.failed != null) && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                {[
                  report.created ? `${report.created} nuevo(s)` : '',
                  report.updated ? `${report.updated} actualizado(s)` : '',
                  report.failed ? `${report.failed} fallido(s)` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            {!compact && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {importSucceeded && hasWarnings
                  ? 'Los productos ya están en el catálogo. Los avisos de abajo no bloquean la importación.'
                  : hasErrors
                    ? 'Este resumen permanece aquí hasta que lo cierres. Corrige el Excel y vuelve a importar.'
                    : 'Este resumen permanece aquí hasta que lo cierres.'}
              </p>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Cerrar informe"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {(hasErrors || hasWarnings) && (
        <div className={`max-h-72 overflow-y-auto px-4 py-3 space-y-3 ${compact ? 'text-xs' : 'text-sm'}`}>
          {hasErrors && (
            <div>
              <p className="font-bold text-red-800 dark:text-red-200 mb-1.5">
                Errores ({report.errors.length})
              </p>
              <ul className="space-y-1 text-red-900 dark:text-red-100">
                {report.errors.map((line, idx) => (
                  <li key={`e-${idx}`} className="leading-snug">
                    {formatLine(line)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {missingBrandWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-300/80 dark:border-amber-700/80 bg-amber-100/80 dark:bg-amber-900/40 px-3 py-2.5 space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-300 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-bold text-amber-950 dark:text-amber-100">
                    {missingBrandWarnings.length === 1
                      ? 'Falta una marca (aviso)'
                      : `Faltan ${missingBrandWarnings.length} marcas (aviso)`}
                  </p>
                  <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90 mt-0.5 leading-snug">
                    No es un fallo de importación: los productos se guardaron. Crea la marca en Ajustes → Marca
                    o corrige la columna «línea» del Excel.
                  </p>
                </div>
              </div>
              <ul className="space-y-1.5 text-amber-950 dark:text-amber-50 pl-6">
                {missingBrandWarnings.map((line, idx) => (
                  <li key={`mb-${idx}`} className="leading-snug list-disc">
                    {line.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {otherWarnings.length > 0 && (
            <div>
              <p className="font-bold text-amber-900 dark:text-amber-200 mb-1.5">
                Otros avisos ({otherWarnings.length})
              </p>
              <ul className="space-y-1 text-amber-950 dark:text-amber-100">
                {otherWarnings.map((line, idx) => (
                  <li key={`w-${idx}`} className="leading-snug">
                    {formatLine(line)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
