import { useState, useRef, useMemo } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { X, Upload, Download, FileText, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { autoMapImportFields, type ImportHeaderAliases } from '../../lib/importHeaderMapping';
import type { CatalogImportProgressReporter, CatalogImportReport } from '../../lib/catalogImportReport';
import { CatalogImportReportPanel } from './CatalogImportReportPanel';

export type CatalogImportHandlerResult = number | { count: number; report?: CatalogImportReport | null };

export interface ImportFieldDef {
  key: string;
  label: string;
  required?: boolean;
  example?: string;
}

interface GenericImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  moduleLabel: string;
  importLabel?: string;
  templateFileName?: string;
  fields: ImportFieldDef[];
  onImport: (
    entries: Record<string, string>[],
    onProgress?: CatalogImportProgressReporter,
  ) => Promise<CatalogImportHandlerResult | void> | CatalogImportHandlerResult | void;
  extraFileUpload?: {
    label: string;
    helpText?: string;
    accept?: string;
    loading?: boolean;
    countLabel?: string;
    sampleZipLabel?: string;
    onDownloadSampleZip?: () => void | Promise<void>;
    onFileSelected: (file: File | null) => void | Promise<void>;
  };
  /** Plantilla Excel propia (p. ej. catálogo delivery + TPV). Si no se pasa, se genera desde fields. */
  onDownloadTemplate?: () => void;
  /** Sinónimos de cabecera para auto-mapeo (p. ej. nombre/name, categoría/category). */
  headerAliases?: ImportHeaderAliases;
  /** Si todos los campos obligatorios se auto-mapean, ir directo a vista previa (plantilla oficial). */
  skipMappingWhenComplete?: boolean;
  /** Hoja Excel a leer (p. ej. catalogo, stock). Por defecto catalogo. */
  importSheetName?: string;
}

type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'results';

export function GenericImportModal({
  isOpen,
  onClose,
  moduleLabel,
  importLabel,
  templateFileName,
  fields,
  onImport,
  extraFileUpload,
  onDownloadTemplate,
  headerAliases,
  skipMappingWhenComplete,
  importSheetName = 'catalogo',
}: GenericImportModalProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    phase: string;
    detail?: string;
    current?: number;
    total?: number;
    percent?: number;
  } | null>(null);
  const [importReport, setImportReport] = useState<CatalogImportReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const extraFileRef = useRef<HTMLInputElement>(null);

  const normalizedImportLabel = (importLabel || moduleLabel).trim();

  const handleClose = () => {
    if (importing) return;
    setStep('upload');
    setRawHeaders([]);
    setRawData([]);
    setMapping({});
    setImporting(false);
    setImportProgress(null);
    setImportReport(null);
    onClose();
  };

  const downloadTemplate = () => {
    if (onDownloadTemplate) {
      onDownloadTemplate();
      return;
    }
    const headers = fields.map(f => f.label + (f.required ? ' *' : ''));
    const example = fields.map(f => f.example || '');
    if (example.every((value) => !String(value || '').trim()) && example.length > 0) {
      example[0] = 'ejemplo';
    }
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');

    const fallbackName = `plantilla_${normalizedImportLabel.toLowerCase().replace(/\s+/g, '_')}.xlsx`;
    const requestedName = templateFileName || fallbackName;
    const downloadName = requestedName.replace(/\.(csv|tsv|txt)$/i, '.xlsx');
    XLSX.writeFile(wb, downloadName);
    toast.success('Plantilla Excel descargada');
  };

  const applyParsedTable = (headers: string[], rows: string[][]) => {
    const trimmedHeaders = headers.map((h) => String(h ?? '').trim());
    const trimmedRows = rows
      .map((row) => row.map((cell) => String(cell ?? '').trim()))
      .filter((row) => row.some((cell) => cell.length > 0));

    if (trimmedHeaders.every((h) => !h) || trimmedRows.length === 0) {
      toast.error('El archivo no tiene datos suficientes');
      return;
    }

    const nextMapping = autoMapImportFields(fields, trimmedHeaders, headerAliases);
    const missingRequired = fields.filter((f) => f.required && !nextMapping[f.key]);

    setRawHeaders(trimmedHeaders);
    setRawData(trimmedRows);
    setMapping(nextMapping);

    if (skipMappingWhenComplete && missingRequired.length === 0) {
      setStep('preview');
      toast.success('Plantilla detectada — columnas listas para importar');
    } else {
      setStep('mapping');
    }
  };

  const processFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'zip' && extraFileUpload) {
      void extraFileUpload.onFileSelected(file);
      toast.success('ZIP de imágenes cargado');
      return;
    }
    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      Papa.parse(file, {
        skipEmptyLines: true,
        complete: (result: Papa.ParseResult<string[]>) => {
          if (result.data.length < 2) {
            toast.error('El archivo no tiene datos suficientes');
            return;
          }
          applyParsedTable(result.data[0], result.data.slice(1));
        },
        error: () => toast.error('Error al leer el CSV'),
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: 'array' });
          const sheetKey = String(importSheetName || 'catalogo').toLowerCase();
          const sheetName =
            wb.SheetNames.find((n) => n.toLowerCase() === sheetKey) || wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (data.length < 2) {
            toast.error('El archivo no tiene datos suficientes');
            return;
          }
          applyParsedTable(data[0].map(String), data.slice(1).map((row) => row.map(String)));
        } catch {
          toast.error('Error al leer el archivo Excel');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast.error('Formato no soportado. Usa Excel (.xlsx/.xls) o CSV');
    }
  };

  const processFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    // If user drops/selects multiple files, process ZIP first (optional) and then data file.
    const zipFile = list.find((f) => f.name.toLowerCase().endsWith('.zip'));
    const dataFile = list.find((f) => /\.(xlsx|xls|csv|tsv|txt)$/i.test(f.name));

    if (zipFile) processFile(zipFile);
    if (dataFile) processFile(dataFile);

    if (!zipFile && !dataFile) {
      processFile(list[0]);
    }
  };


  const mappedEntries = useMemo(() => {
    const reverseMap: Record<string, string> = {};
    for (const [fieldKey, headerName] of Object.entries(mapping)) {
      if (headerName) reverseMap[fieldKey] = headerName;
    }
    return rawData.map(row => {
      const entry: Record<string, string> = {};
      for (const [fieldKey, headerName] of Object.entries(reverseMap)) {
        const colIdx = rawHeaders.indexOf(headerName);
        if (colIdx >= 0) entry[fieldKey] = row[colIdx] || '';
      }
      return entry;
    }).filter(e => Object.values(e).some(v => v.trim()));
  }, [rawData, rawHeaders, mapping]);

  const missingRequired = fields.filter(f => f.required && !mapping[f.key]);

  const handleImport = async () => {
    if (missingRequired.length > 0) {
      toast.error(`Campos obligatorios sin mapear: ${missingRequired.map(f => f.label).join(', ')}`);
      return;
    }
    setImporting(true);
    setImportReport(null);
    setImportProgress({
      phase: 'Iniciando importación…',
      detail: `${mappedEntries.length} fila(s) en el archivo`,
      percent: 2,
    });
    setStep('importing');
    try {
      const raw = await onImport(mappedEntries, (update) => setImportProgress(update));
      const count =
        typeof raw === 'number' ? raw : typeof raw === 'object' && raw != null ? raw.count : mappedEntries.length;
      const report =
        typeof raw === 'object' && raw != null && 'report' in raw ? raw.report ?? null : null;

      if (report && (report.errors.length > 0 || count <= 0)) {
        setImportReport(report);
        setStep('results');
        setImporting(false);
        setImportProgress(null);
        return;
      }

      if (count <= 0) {
        setStep('preview');
        setImporting(false);
        setImportProgress(null);
        toast.error('No se importó ninguna fila. Revisa el Excel.');
        return;
      }

      if (report && report.warnings.length > 0) {
        setImportReport(report);
        setStep('results');
        setImporting(false);
        setImportProgress(null);
        return;
      }

      toast.success(`${count} entrada(s) importadas correctamente`);
      handleClose();
    } catch {
      toast.error('Error durante la importación');
      setStep('preview');
      setImporting(false);
      setImportProgress(null);
    }
  };

  const importProgressPercent = useMemo(() => {
    if (!importProgress) return 0;
    if (typeof importProgress.percent === 'number') {
      return Math.max(0, Math.min(100, Math.round(importProgress.percent)));
    }
    if (importProgress.total && importProgress.current != null && importProgress.total > 0) {
      return Math.max(0, Math.min(100, Math.round((importProgress.current / importProgress.total) * 100)));
    }
    return null;
  }, [importProgress]);

  useModalClose(isOpen && !importing, handleClose);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm ${importing ? 'z-[120]' : 'z-50'}`}
      onClick={importing ? undefined : handleClose}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <Upload className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Importar {normalizedImportLabel}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {step === 'upload' && (extraFileUpload ? 'Sube un archivo Excel (recomendado) o CSV y, opcionalmente, un ZIP de imágenes' : 'Sube un archivo Excel (recomendado) o CSV')}
                {step === 'mapping' && 'Mapea las columnas del archivo'}
                {step === 'preview' && `${mappedEntries.length} entradas listas para importar`}
                {step === 'importing' && (importProgress?.phase || 'Importando datos…')}
                {step === 'results' && 'Resultado de la importación'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={importing}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {step === 'upload' && (
            <div className="space-y-5">
              {/* Download template */}
              <button
                onClick={downloadTemplate}
                className="w-full flex items-center gap-4 p-5 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-2xl hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition-colors">
                  <Download className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-blue-900 dark:text-blue-200">Descargar plantilla</p>
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-0.5">
                    Descarga la plantilla Excel con los campos de {normalizedImportLabel}
                  </p>
                </div>
              </button>

              {/* Upload area */}
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); processFiles(e.dataTransfer.files); }}
                className="w-full flex flex-col items-center gap-3 p-10 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-all cursor-pointer"
              >
                <FileText className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                <div className="text-center">
                  <p className="font-semibold text-gray-700 dark:text-gray-300">
                    Arrastra tu archivo aquí o haz clic para seleccionar
                  </p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                    {extraFileUpload
                      ? 'Formatos: Excel (.xlsx, .xls), CSV y ZIP de imágenes (.zip)'
                      : 'Formatos: Excel (.xlsx, .xls) y CSV'}
                  </p>
                </div>
                {extraFileUpload && (
                  <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 text-center">
                    También puedes arrastrar aquí el ZIP de imágenes
                  </p>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={extraFileUpload ? '.csv,.tsv,.txt,.xlsx,.xls,.zip,application/zip' : '.csv,.tsv,.txt,.xlsx,.xls'}
                  className="hidden"
                  onChange={e => { if (e.target.files?.length) processFiles(e.target.files); }}
                />
              </div>

              {extraFileUpload && (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/40">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-800 dark:text-gray-200">{extraFileUpload.label}</p>
                      {extraFileUpload.helpText && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{extraFileUpload.helpText}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => extraFileRef.current?.click()}
                      disabled={Boolean(extraFileUpload.loading)}
                      className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-50"
                    >
                      {extraFileUpload.loading ? 'Procesando...' : 'Seleccionar ZIP'}
                    </button>
                    {extraFileUpload.onDownloadSampleZip && (
                      <button
                        type="button"
                        onClick={() => void extraFileUpload.onDownloadSampleZip?.()}
                        className="px-3 py-2 rounded-lg border border-indigo-300 dark:border-indigo-700 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                      >
                        {extraFileUpload.sampleZipLabel || 'Descargar ZIP de ejemplo'}
                      </button>
                    )}
                    <input
                      ref={extraFileRef}
                      type="file"
                      accept={extraFileUpload.accept || '.zip,application/zip'}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        void extraFileUpload.onFileSelected(f);
                        e.currentTarget.value = '';
                      }}
                    />
                  </div>
                  {extraFileUpload.countLabel && (
                    <p className="text-xs text-indigo-600 dark:text-indigo-300 mt-2">{extraFileUpload.countLabel}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'mapping' && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl">
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                  Asigna cada campo del sistema a una columna de tu archivo. Se han auto-mapeado las coincidencias.
                </p>
              </div>
              <div className="space-y-2">
                {fields.map(field => (
                  <div key={field.key} className="flex items-center gap-3">
                    <div className="w-44 flex-shrink-0">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-0.5">*</span>}
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <select
                      value={mapping[field.key] || ''}
                      onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                      className={`flex-1 px-3 py-2 border-2 rounded-xl text-sm outline-none transition-colors ${
                        mapping[field.key]
                          ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/10'
                          : field.required
                          ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
                      } text-gray-900 dark:text-gray-100`}
                    >
                      <option value="">— Sin asignar —</option>
                      {rawHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {rawData.length} filas detectadas · {rawHeaders.length} columnas
                {rawHeaders.length > 0 && (
                  <span className="block mt-1 text-gray-500 dark:text-gray-400">
                    Columnas del archivo: {rawHeaders.join(' · ')}
                  </span>
                )}
              </p>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                    {mappedEntries.length} entradas listas para importar
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                    Revisa los datos antes de confirmar la importación.
                  </p>
                </div>
              </div>

              <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-400">#</th>
                        {fields.filter(f => mapping[f.key]).map(f => (
                          <th key={f.key} className="px-3 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {mappedEntries.slice(0, 20).map((entry, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-3 py-2 text-gray-400 dark:text-gray-500">{idx + 1}</td>
                          {fields.filter(f => mapping[f.key]).map(f => (
                            <td key={f.key} className="px-3 py-2 text-gray-900 dark:text-gray-100 max-w-[200px] truncate">
                              {entry[f.key] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {mappedEntries.length > 20 && (
                  <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 text-center border-t border-gray-100 dark:border-gray-800">
                    Mostrando 20 de {mappedEntries.length} entradas
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-10 space-y-6 max-w-lg mx-auto w-full">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
              <div className="w-full space-y-3">
                <div className="h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  {importProgressPercent == null ? (
                    <div className="h-full w-2/5 rounded-full bg-blue-500 animate-pulse" />
                  ) : (
                    <div
                      className="h-full rounded-full bg-blue-600 transition-[width] duration-300 ease-out"
                      style={{ width: `${importProgressPercent}%` }}
                    />
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  <span>{importProgressPercent == null ? 'Procesando…' : `${importProgressPercent}%`}</span>
                  {importProgress?.current != null && importProgress.total ? (
                    <span>
                      {importProgress.current} / {importProgress.total}
                    </span>
                  ) : (
                    <span>{mappedEntries.length} fila(s)</span>
                  )}
                </div>
              </div>
              <div className="text-center space-y-2">
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {importProgress?.phase || 'Importando catálogo…'}
                </p>
                {importProgress?.detail ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{importProgress.detail}</p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Puede tardar 1–2 minutos con muchos productos. No cierres esta ventana.
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 'results' && importReport && (
            <div className="space-y-4">
              <CatalogImportReportPanel report={importReport} compact />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                También verás este informe en la página de Catálogo hasta que lo cierres.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'importing' ? (
          <div className="border-t border-gray-200 dark:border-gray-700 p-4 flex-shrink-0 bg-amber-50/80 dark:bg-amber-950/30">
            <p className="text-center text-sm font-medium text-amber-800 dark:text-amber-200">
              Importación en curso — no cierres ni recargues la página
            </p>
          </div>
        ) : (
          <div className="border-t border-gray-200 dark:border-gray-700 p-6 flex gap-3 flex-shrink-0 bg-gray-50 dark:bg-gray-900">
            {step === 'results' && (
              <>
                <button
                  onClick={() => setStep('preview')}
                  className="flex items-center gap-1.5 px-5 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Corregir e importar de nuevo
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleClose}
                  className="px-6 py-2.5 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl font-semibold transition-colors"
                >
                  Cerrar
                </button>
              </>
            )}
            {step === 'upload' && (
              <button onClick={handleClose} className="px-5 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
            )}
            {step === 'mapping' && (
              <>
                <button onClick={() => setStep('upload')} className="flex items-center gap-1.5 px-5 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Volver
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => setStep('preview')}
                  disabled={missingRequired.length > 0}
                  className="flex items-center gap-1.5 px-6 py-2.5 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Vista previa <ArrowRight className="w-4 h-4" />
                </button>
              </>
            )}
            {step === 'preview' && (
              <>
                <button onClick={() => setStep('mapping')} className="flex items-center gap-1.5 px-5 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Volver
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleImport}
                  disabled={importing || mappedEntries.length === 0}
                  className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  Importar {mappedEntries.length} entradas
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
