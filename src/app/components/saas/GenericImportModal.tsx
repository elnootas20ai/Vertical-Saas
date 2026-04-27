import { useState, useRef, useMemo } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { X, Upload, Download, FileText, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

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
  onImport: (entries: Record<string, string>[]) => Promise<number | void> | number | void;
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
}

type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing';

export function GenericImportModal({
  isOpen,
  onClose,
  moduleLabel,
  importLabel,
  templateFileName,
  fields,
  onImport,
  extraFileUpload,
}: GenericImportModalProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const extraFileRef = useRef<HTMLInputElement>(null);

  const normalizedImportLabel = (importLabel || moduleLabel).trim();

  const handleClose = () => {
    setStep('upload');
    setRawHeaders([]);
    setRawData([]);
    setMapping({});
    setImporting(false);
    onClose();
  };

  const downloadTemplate = () => {
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
          setRawHeaders(result.data[0]);
          setRawData(result.data.slice(1));
          autoMap(result.data[0]);
          setStep('mapping');
        },
        error: () => toast.error('Error al leer el CSV'),
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (data.length < 2) {
            toast.error('El archivo no tiene datos suficientes');
            return;
          }
          setRawHeaders(data[0].map(String));
          setRawData(data.slice(1).map(row => row.map(String)));
          autoMap(data[0].map(String));
          setStep('mapping');
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

  const autoMap = (headers: string[]) => {
    const m: Record<string, string> = {};
    for (const field of fields) {
      const norm = field.label.toLowerCase().replace(/\s*\*\s*/g, '').trim();
      const keyNorm = field.key.toLowerCase();
      const match = headers.findIndex(
        h => h.toLowerCase().replace(/\s*\*\s*/g, '').trim() === norm
          || h.toLowerCase() === keyNorm
      );
      if (match >= 0) m[field.key] = headers[match];
    }
    setMapping(m);
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
    setStep('importing');
    try {
      const result = await onImport(mappedEntries);
      const count = typeof result === 'number' ? result : mappedEntries.length;
      if (count <= 0) {
        setStep('preview');
        setImporting(false);
        return;
      }
      toast.success(`${count} entrada(s) importadas correctamente`);
      handleClose();
    } catch {
      toast.error('Error durante la importación');
      setStep('preview');
      setImporting(false);
    }
  };

  useModalClose(isOpen, handleClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={handleClose}>
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
                {step === 'importing' && 'Importando datos...'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
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
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
              <div className="text-center">
                <p className="font-semibold text-gray-900 dark:text-gray-100">Importando datos...</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {mappedEntries.length} entradas en proceso
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'importing' && (
          <div className="border-t border-gray-200 dark:border-gray-700 p-6 flex gap-3 flex-shrink-0 bg-gray-50 dark:bg-gray-900">
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
