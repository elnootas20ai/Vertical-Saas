import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import type { CatalogImportReport } from '../../lib/catalogImportReport';

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

export function CatalogImportReportPanel({
  report,
  onDismiss,
  compact = false,
}: CatalogImportReportPanelProps) {
  const hasErrors = report.errors.length > 0;
  const hasWarnings = report.warnings.length > 0;
  const ok = !hasErrors && (report.created ?? 0) + (report.updated ?? 0) > 0;

  return (
    <div
      className={`rounded-xl border-2 overflow-hidden ${
        hasErrors
          ? 'border-red-300 dark:border-red-800 bg-red-50/90 dark:bg-red-950/30'
          : hasWarnings
            ? 'border-amber-300 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/30'
            : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/90 dark:bg-emerald-950/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-black/5 dark:border-white/5">
        <div className="flex items-start gap-2 min-w-0">
          {hasErrors ? (
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
          ) : ok ? (
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
                Este resumen permanece aquí hasta que lo cierres. Corrige el Excel y vuelve a importar.
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
        <div className={`max-h-64 overflow-y-auto px-4 py-3 space-y-3 ${compact ? 'text-xs' : 'text-sm'}`}>
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
          {hasWarnings && (
            <div>
              <p className="font-bold text-amber-900 dark:text-amber-200 mb-1.5">
                Avisos ({report.warnings.length})
              </p>
              <ul className="space-y-1 text-amber-950 dark:text-amber-100">
                {report.warnings.map((line, idx) => (
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
