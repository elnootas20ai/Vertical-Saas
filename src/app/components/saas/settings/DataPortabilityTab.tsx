import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  FileJson,
  Info,
  Upload,
  X,
} from 'lucide-react';
import { exportTenantData, importTenantData } from '../../../lib/settingsApi';

interface Props {
  userId: string;
}

const EXPORT_COLLECTIONS = [
  { id: 'vehicles',  label: 'Vehículos',     description: 'Stock, historial, imágenes, documentos' },
  { id: 'clients',   label: 'Clientes',      description: 'Fichas, contactos, consentimientos' },
  { id: 'leads',     label: 'Leads',         description: 'Pipeline de ventas, scoring, seguimientos' },
  { id: 'sales',     label: 'Ventas',        description: 'Operaciones cerradas, contratos, facturas' },
  { id: 'documents', label: 'Documentos',    description: 'Contratos, presupuestos, fichas técnicas' },
  { id: 'finance',   label: 'Finanzas',      description: 'Cobros, pagos, financiaciones' },
  { id: 'workshop',  label: 'Taller',        description: 'Órdenes de trabajo, reparaciones' },
];

interface ImportResult {
  totalImported: number;
  results: Record<string, { imported: number; total: number; error?: string }>;
}

export function DataPortabilityTab({ userId }: Props) {
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    setExportSuccess(false);
    try {
      await exportTenantData(userId);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 4000);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.json')) {
      setImportError('Solo se aceptan archivos .json generados por Vertial.');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setImportError('El archivo no puede superar 100 MB.');
      return;
    }
    setFileName(file.name);
    setPendingFile(file);
    setImportError('');
    setImportResult(null);
  };

  const handleImport = async () => {
    if (!pendingFile) return;
    setImporting(true);
    setImportError('');
    setImportResult(null);
    setConfirmImport(false);
    try {
      const result = await importTenantData(userId, pendingFile);
      setImportResult(result as ImportResult);
      setPendingFile(null);
      setFileName('');
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Error al importar');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Export */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Exportar todos los datos</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Descarga un archivo JSON con todos los datos del concesionario para portabilidad o backup.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-5">
          {EXPORT_COLLECTIONS.map((col) => (
            <div key={col.id} className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
              <FileJson className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{col.label}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">{col.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 mb-4">
          <Info className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700">El archivo exportado incluye todos los documentos de cada colección. Las imágenes se exportan como URLs.</p>
        </div>

        {exportError && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-sm text-red-700">{exportError}</p>
          </div>
        )}
        {exportSuccess && (
          <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3 mb-4">
            <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
            <p className="text-sm text-green-700">Exportación completada. El archivo se ha descargado.</p>
          </div>
        )}

        <button
          onClick={() => void handleExport()}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
        >
          <Download className={`w-4 h-4 ${exporting ? 'animate-bounce' : ''}`} />
          {exporting ? 'Exportando...' : 'Descargar exportación completa'}
        </button>
      </div>

      {/* Import */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
            <Upload className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Importar datos</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Importa un archivo JSON previamente exportado desde Vertial. Los documentos existentes no se sobreescriben.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-xs text-red-700"><strong>Atención:</strong> La importación añade documentos nuevos. No elimina datos existentes. Máximo 5.000 documentos por colección.</p>
        </div>

        <div
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer ${
            dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          {fileName ? (
            <div className="flex items-center justify-center gap-2">
              <FileJson className="w-4 h-4 text-green-600" />
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fileName}</p>
              <button
                onClick={(e) => { e.stopPropagation(); setPendingFile(null); setFileName(''); }}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Arrastra un archivo JSON aquí</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">o haz clic para seleccionarlo</p>
            </>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />

        {importError && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mt-4">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-sm text-red-700">{importError}</p>
          </div>
        )}

        {importResult && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <p className="text-sm font-semibold text-green-800">{importResult.totalImported} documentos importados correctamente</p>
            </div>
            <div className="space-y-1.5">
              {Object.entries(importResult.results).map(([col, r]) => (
                <div key={col} className="flex items-center gap-2 text-xs">
                  <span className="w-24 font-medium text-gray-700 dark:text-gray-300 capitalize">{col}:</span>
                  <span className="text-green-700">{r.imported} importados</span>
                  {r.error && <span className="text-red-600">— {r.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {pendingFile && !confirmImport && (
          <button
            onClick={() => setConfirmImport(true)}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold transition-colors"
          >
            <Upload className="w-4 h-4" />
            Iniciar importación
          </button>
        )}

        {confirmImport && (
          <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-sm font-semibold text-amber-800 mb-3">¿Confirmar importación de "{fileName}"?</p>
            <p className="text-xs text-amber-700 mb-4">Esta acción añadirá los documentos del archivo a tu base de datos. No se pueden deshacer los cambios.</p>
            <div className="flex gap-2">
              <button
                onClick={() => void handleImport()}
                disabled={importing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
              >
                <Upload className={`w-4 h-4 ${importing ? 'animate-bounce' : ''}`} />
                {importing ? 'Importando...' : 'Confirmar importación'}
              </button>
              <button
                onClick={() => setConfirmImport(false)}
                className="px-4 py-2 rounded-xl border border-amber-300 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
