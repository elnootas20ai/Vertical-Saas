import { useMemo, useState } from 'react';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../../lib/vertialUiTokens';
import { formatMoneyEs, formatNumberEs } from '../../../lib/formatNumberEs';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';

export type InformeExportFormat = 'csv' | 'xlsx' | 'pdf';

/** Barra de progreso Vertial (degradado logo) — solo mientras se genera el informe. */
export function VertialInformeProgress({
  progress,
  label,
}: {
  progress: number;
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-stone-700 dark:text-stone-200">{label}</p>
        <span className="text-xs font-semibold tabular-nums text-stone-500">{pct}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #22C55E 0%, #14B8A6 50%, #2563EB 100%)',
          }}
        />
      </div>
      <p className="text-[11px] text-stone-400">Sin recargas en segundo plano — solo al abrir este informe.</p>
    </div>
  );
}

const MONEY_KEYS = new Set([
  'Entradas', 'Salidas', 'Neto', 'Saldo', 'Apertura', 'Cierre',
  'Ingresos', 'Gastos', 'Resultado', 'Total', 'Base', 'IVA', 'Importe',
  'Pagado', 'Pendiente', 'EBITDA', 'COGS', 'Opex', 'Esperado', 'Contado', 'Diferencia',
]);

function formatCell(key: string, value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (MONEY_KEYS.has(key) || /pct|margen|desv/i.test(key)) {
      if (/pct|margen|desv/i.test(key)) {
        return `${formatNumberEs(value, { minFraction: 1, maxFraction: 1 })} %`;
      }
      return formatMoneyEs(value);
    }
    return formatNumberEs(value, { minFraction: 0, maxFraction: 2 });
  }
  return String(value);
}

function InformeRowsPreview({ rows }: { rows: Record<string, unknown>[] }) {
  const sections = useMemo(() => {
    if (!rows.length) return [] as { title: string; rows: Record<string, unknown>[] }[];
    const hasSeccion = rows.some((r) => r.Seccion != null && String(r.Seccion).trim() !== '');
    if (!hasSeccion) {
      return [{ title: 'Detalle', rows }];
    }
    const map = new Map<string, Record<string, unknown>[]>();
    for (const r of rows) {
      const title = String(r.Seccion || 'Sin sección').trim() || 'Sin sección';
      const list = map.get(title) || [];
      list.push(r);
      map.set(title, list);
    }
    return [...map.entries()].map(([title, sectionRows]) => ({ title, rows: sectionRows }));
  }, [rows]);

  const displayKeys = useMemo(() => {
    if (!rows.length) return [] as string[];
    const keys = Object.keys(rows[0]);
    return keys.filter((k) => k !== 'Orden' && k !== 'Seccion');
  }, [rows]);

  if (!rows.length) {
    return (
      <p className="text-sm text-stone-500">Sin filas en este informe.</p>
    );
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.title} className="space-y-2">
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 border-b border-stone-200 dark:border-stone-700 pb-1.5">
            {section.title}
          </h3>
          <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-stone-50 dark:bg-stone-800/80">
                <tr>
                  {displayKeys.map((k) => (
                    <th
                      key={k}
                      className="px-3 py-2 font-semibold text-stone-500 dark:text-stone-400 whitespace-nowrap"
                    >
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {section.rows.map((row, idx) => (
                  <tr key={`${section.title}-${idx}`} className="bg-white dark:bg-stone-900">
                    {displayKeys.map((k) => (
                      <td
                        key={k}
                        className={`px-3 py-2 text-stone-800 dark:text-stone-200 ${
                          MONEY_KEYS.has(k) ? 'tabular-nums text-right font-medium' : ''
                        }`}
                      >
                        {formatCell(k, row[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export function VertialInformeReadyCard({
  title,
  summary,
  rowCount,
  rows,
  onDownload,
  onBack,
}: {
  title: string;
  summary: string;
  rowCount: number;
  rows?: Record<string, unknown>[];
  onDownload: (format: InformeExportFormat) => void | Promise<void>;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState<InformeExportFormat | null>(null);

  const run = async (format: InformeExportFormat) => {
    if (busy) return;
    setBusy(format);
    try {
      await onDownload(format);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-900">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
          Informe listo
        </p>
        <h2 className="mt-1 text-lg font-bold text-stone-900 dark:text-stone-100">{title}</h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{summary}</p>
        <p className="mt-1 text-xs text-stone-500">
          {rowCount.toLocaleString('es-ES')} filas · CSV / Excel / PDF
        </p>
      </div>

      {rows && rows.length > 0 ? (
        <div className="max-h-[min(70vh,820px)] overflow-y-auto overscroll-contain pr-1 -mr-1">
          <InformeRowsPreview rows={rows} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 sticky bottom-0 pt-2 bg-white dark:bg-stone-900">
        <button
          type="button"
          className={VERTIAL_BTN_PRIMARY}
          onClick={() => void run('csv')}
          disabled={Boolean(busy) || rowCount <= 0}
        >
          <Download className="h-4 w-4" />
          {busy === 'csv' ? 'Generando…' : 'CSV'}
        </button>
        <button
          type="button"
          className={VERTIAL_BTN_PRIMARY}
          onClick={() => void run('xlsx')}
          disabled={Boolean(busy) || rowCount <= 0}
        >
          <FileSpreadsheet className="h-4 w-4" />
          {busy === 'xlsx' ? 'Generando…' : 'Excel'}
        </button>
        <button
          type="button"
          className={VERTIAL_BTN_PRIMARY}
          onClick={() => void run('pdf')}
          disabled={Boolean(busy) || rowCount <= 0}
        >
          <FileText className="h-4 w-4" />
          {busy === 'pdf' ? 'Generando…' : 'PDF'}
        </button>
        <button type="button" className={VERTIAL_BTN_SECONDARY} onClick={onBack} disabled={Boolean(busy)}>
          Volver al catálogo
        </button>
      </div>
    </div>
  );
}

export function VertialInformeUnavailableCard({
  title,
  onBack,
  reason,
}: {
  title: string;
  onBack: () => void;
  reason?: string;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-900">
      <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">{title}</h2>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        {reason
          || 'Este informe aún no tiene fuente de datos conectada. Misma pantalla y descarga cuando lo definamos.'}
      </p>
      <button type="button" className={VERTIAL_BTN_SECONDARY} onClick={onBack}>
        Volver al catálogo
      </button>
    </div>
  );
}

export function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const bom = '\uFEFF';
  const csv = bom + [keys.join(';'), ...rows.map((r) => keys.map((k) => String(r[k] ?? '')).join(';'))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadXlsx(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  try {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Informe');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  } catch {
    downloadCsv(rows, filename);
  }
}

export async function downloadPdf(
  title: string,
  rows: Record<string, unknown>[],
  filename: string,
  options?: {
    summary?: string;
    businessName?: string;
    dashboard?: import('./loaders/informeTypes').InformeDashboard;
    periodLabel?: string;
  },
) {
  if (!rows.length && !options?.dashboard) return;
  try {
    const { generateVertialInformePdf } = await import('./vertialInformePdf');
    generateVertialInformePdf({
      title,
      rows: rows.length ? rows : (options?.dashboard ? [{ _: 1 }] : []),
      filename,
      summary: options?.summary,
      businessName: options?.businessName,
      dashboard: options?.dashboard,
      periodLabel: options?.periodLabel,
    });
  } catch {
    downloadCsv(rows, filename);
  }
}

export async function downloadInforme(
  format: InformeExportFormat,
  title: string,
  rows: Record<string, unknown>[],
  filename: string,
  options?: {
    summary?: string;
    businessName?: string;
    dashboard?: import('./loaders/informeTypes').InformeDashboard;
    periodLabel?: string;
  },
) {
  if (format === 'xlsx') return downloadXlsx(rows, filename);
  if (format === 'pdf') return downloadPdf(title, rows, filename, options);
  return downloadCsv(rows, filename);
}
