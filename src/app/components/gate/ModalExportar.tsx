import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { ACCESO__Modal } from '../design-system/ACCESO__Modal';
import { ACCESO__Button } from '../design-system/ACCESO__Button';

type ExportFormat = 'csv' | 'excel';

interface ModalExportarProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBgColor: string;
  columns: { key: string; label: string }[];
  data: Record<string, unknown>[];
  filenamePrefix: string;
}

function exportToCsv(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => {
      const v = row[h];
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','),
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportToExcel(data: Record<string, unknown>[], filename: string) {
  const { utils, writeFile } = await import('xlsx');
  const ws = utils.json_to_sheet(data);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Datos');
  writeFile(wb, `${filename}.xlsx`);
}

export function ModalExportar({
  isOpen,
  onClose,
  title,
  description,
  icon,
  iconBgColor,
  columns,
  data,
  filenamePrefix,
}: ModalExportarProps) {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [exporting, setExporting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleExport = async () => {
    if (!data.length) {
      setError('No hay datos para exportar.');
      return;
    }

    setExporting(true);
    setError('');
    setSuccess(false);

    try {
      const mapped = data.map(row => {
        const obj: Record<string, unknown> = {};
        columns.forEach(col => {
          obj[col.label] = row[col.key] ?? '';
        });
        return obj;
      });

      const filename = `${filenamePrefix}_${new Date().toISOString().split('T')[0]}`;

      if (format === 'csv') {
        exportToCsv(mapped, filename);
      } else {
        await exportToExcel(mapped, filename);
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch {
      setError('Error al exportar los datos. Inténtalo de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  const handleClose = () => {
    setSuccess(false);
    setError('');
    setFormat('csv');
    onClose();
  };

  return (
    <ACCESO__Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 ${iconBgColor} rounded-xl flex items-center justify-center shrink-0`}>
            {icon}
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {data.length} {data.length === 1 ? 'registro' : 'registros'} disponibles
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Campos incluidos
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {columns.map(col => (
              <div
                key={col.key}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600"
              >
                <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">{col.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Formato de exportación
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setFormat('csv')}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                format === 'csv'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <FileText className={`w-5 h-5 ${format === 'csv' ? 'text-blue-600' : 'text-gray-400'}`} />
              <div className="text-left">
                <p className={`text-sm font-semibold ${format === 'csv' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>CSV</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">Compatible con todo</p>
              </div>
            </button>
            <button
              onClick={() => setFormat('excel')}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                format === 'excel'
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <FileSpreadsheet className={`w-5 h-5 ${format === 'excel' ? 'text-emerald-600' : 'text-gray-400'}`} />
              <div className="text-left">
                <p className={`text-sm font-semibold ${format === 'excel' ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-700 dark:text-gray-300'}`}>Excel</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">Formato .xlsx</p>
              </div>
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-4 py-3">
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
            <p className="text-sm text-green-700 dark:text-green-300">Exportación completada correctamente.</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <ACCESO__Button
            type="button"
            onClick={handleClose}
            variant="outline"
            fullWidth
          >
            Cancelar
          </ACCESO__Button>
          <ACCESO__Button
            type="button"
            onClick={() => void handleExport()}
            variant="primary"
            fullWidth
            disabled={exporting || !data.length}
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exportando...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Exportar {format === 'csv' ? 'CSV' : 'Excel'}
              </>
            )}
          </ACCESO__Button>
        </div>
      </div>
    </ACCESO__Modal>
  );
}
