import { useState } from 'react';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../../lib/vertialUiTokens';
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

export function VertialInformeReadyCard({
  title,
  summary,
  rowCount,
  onDownload,
  onBack,
}: {
  title: string;
  summary: string;
  rowCount: number;
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
      <div className="flex flex-wrap gap-3">
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
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-900">
      <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">{title}</h2>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Este informe aún no tiene fuente de datos conectada. Misma pantalla y descarga cuando lo definamos.
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
  options?: { summary?: string; businessName?: string },
) {
  if (!rows.length) return;
  try {
    const { generateVertialInformePdf } = await import('./vertialInformePdf');
    generateVertialInformePdf({
      title,
      rows,
      filename,
      summary: options?.summary,
      businessName: options?.businessName,
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
  options?: { summary?: string; businessName?: string },
) {
  if (format === 'xlsx') return downloadXlsx(rows, filename);
  if (format === 'pdf') return downloadPdf(title, rows, filename, options);
  return downloadCsv(rows, filename);
}
