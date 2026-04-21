import { useState, useRef, useCallback } from 'react';
import { X, Upload, FileSpreadsheet, AlertTriangle, Check, Download, LoaderCircle } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';
import { useScrapyard } from '../../context/ScrapyardContext';
import type { ScrapyardVehicle } from '../../lib/scrapyardTypes';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedRow {
  matricula: string;
  bastidor: string;
  marca: string;
  modelo: string;
  anio: number;
  km: number;
  combustible: string;
  propietarioNombre: string;
  fechaEntrada: string;
  costeCompra: number;
  tipoProcedencia: string;
  tipoAdquisicion: string;
  ubicacion: string;
  observaciones: string;
  valid: boolean;
  errors: string[];
}

type Step = 'upload' | 'preview' | 'importing' | 'done';

const TEMPLATE_HEADERS = [
  'matricula', 'bastidor', 'marca', 'modelo', 'anio', 'km',
  'combustible', 'propietario', 'fecha_entrada', 'coste',
  'procedencia', 'adquisicion', 'ubicacion', 'observaciones',
];

function parseCSV(text: string): string[][] {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if ((char === ',' || char === ';') && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += char;
    }
    result.push(current.trim());
    return result;
  });
}

function mapRow(headers: string[], row: string[], existingMatriculas: Set<string>, existingBastidores: Set<string>): ParsedRow {
  const get = (key: string) => {
    const idx = headers.findIndex(h => h.toLowerCase().replace(/[_\s]/g, '') === key.toLowerCase().replace(/[_\s]/g, ''));
    return idx >= 0 ? (row[idx] || '').trim() : '';
  };

  const matricula = get('matricula').toUpperCase();
  const bastidor = get('bastidor').toUpperCase();
  const marca = get('marca');
  const modelo = get('modelo');
  const anioStr = get('anio') || get('año');
  const anio = parseInt(anioStr) || 0;
  const km = parseInt(get('km') || get('kilometros') || '0') || 0;
  const combustible = get('combustible') || 'diesel';
  const propietarioNombre = get('propietario') || get('propietarionombre') || '';
  const fechaEntrada = get('fechaentrada') || get('fecha_entrada') || new Date().toISOString().slice(0, 10);
  const costeCompra = parseFloat(get('coste') || get('costecompra') || get('precio') || '0') || 0;
  const tipoProcedencia = get('procedencia') || get('tipoprocedencia') || 'particular';
  const tipoAdquisicion = get('adquisicion') || get('tipoadquisicion') || 'compra';
  const ubicacion = get('ubicacion') || '';
  const observaciones = get('observaciones') || '';

  const errors: string[] = [];
  if (!matricula) errors.push('Sin matricula');
  if (!bastidor) errors.push('Sin bastidor');
  if (!marca) errors.push('Sin marca');
  if (!modelo) errors.push('Sin modelo');
  if (anio < 1960 || anio > new Date().getFullYear() + 1) errors.push('Anio invalido');
  if (existingMatriculas.has(matricula.replace(/[\s-]/g, ''))) errors.push('Matricula duplicada');
  if (existingBastidores.has(bastidor.replace(/[\s-]/g, ''))) errors.push('Bastidor duplicado');

  return {
    matricula, bastidor, marca, modelo, anio, km, combustible,
    propietarioNombre, fechaEntrada, costeCompra, tipoProcedencia, tipoAdquisicion,
    ubicacion, observaciones, valid: errors.length === 0, errors,
  };
}

export function ScrapyardImportWizard({ isOpen, onClose }: Props) {
  useModalClose(isOpen, onClose);
  const { vehicles, addVehicle } = useScrapyard();
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState({ success: 0, errors: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const existingMatriculas = new Set(vehicles.map(v => v.matricula.toUpperCase().replace(/[\s-]/g, '')));
  const existingBastidores = new Set(vehicles.map(v => v.bastidor.toUpperCase().replace(/[\s-]/g, '')));

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const data = parseCSV(text);
      if (data.length < 2) { toast.error('Archivo vacio o sin datos'); return; }
      const headers = data[0];
      const parsed = data.slice(1).map(row => mapRow(headers, row, existingMatriculas, existingBastidores));
      setRows(parsed);
      setStep('preview');
    };
    reader.readAsText(file);
  }, [existingMatriculas, existingBastidores]);

  const handleImport = useCallback(async () => {
    setStep('importing');
    const validRows = rows.filter(r => r.valid);
    let success = 0;
    let errors = 0;

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      try {
        await addVehicle({
          matricula: r.matricula,
          bastidor: r.bastidor,
          marca: r.marca,
          modelo: r.modelo,
          anio: r.anio,
          km: r.km,
          combustible: r.combustible as any,
          propietarioNombre: r.propietarioNombre,
          fechaEntrada: r.fechaEntrada,
          costeCompra: r.costeCompra,
          tipoProcedencia: r.tipoProcedencia as any,
          tipoAdquisicion: r.tipoAdquisicion as any,
          ubicacion: r.ubicacion || undefined,
          observaciones: r.observaciones || undefined,
          estado: 'recibido',
          estadoBaja: 'pendiente',
          documentacionCompleta: false,
          fichaTecnica: false,
          permisoCirculacion: false,
          contratoCompraventa: false,
          certificadoBaja: false,
        });
        success++;
      } catch {
        errors++;
      }
      setProgress(Math.round(((i + 1) / validRows.length) * 100));
    }

    setImportResult({ success, errors });
    setStep('done');
  }, [rows, addVehicle]);

  const downloadTemplate = () => {
    const csv = TEMPLATE_HEADERS.join(';') + '\n' + '1234ABC;WBADT43452G123456;Volkswagen;Golf;2015;120000;diesel;Juan Garcia;2024-01-15;500;particular;compra;Zona A;Vehiculo de ejemplo\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_entrada_vehiculos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const validCount = rows.filter(r => r.valid).length;
  const errorCount = rows.filter(r => !r.valid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Importar vehiculos</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Sube un archivo CSV o Excel con los datos de los vehiculos a importar.
              </p>
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Download className="w-4 h-4" /> Descargar plantilla CSV
              </button>
              <div
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
              >
                <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="font-semibold text-gray-900 dark:text-gray-100">Arrastra un archivo CSV o haz clic</p>
                <p className="text-sm text-gray-500 mt-1">CSV con separador ; o ,</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
              />
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 flex-1 text-center">
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{validCount}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Validos</p>
                </div>
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex-1 text-center">
                  <p className="text-2xl font-bold text-red-700 dark:text-red-300">{errorCount}</p>
                  <p className="text-xs text-red-600 dark:text-red-400">Con errores</p>
                </div>
              </div>

              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left px-3 py-2 text-gray-500">#</th>
                      <th className="text-left px-3 py-2 text-gray-500">Matricula</th>
                      <th className="text-left px-3 py-2 text-gray-500">Marca/Modelo</th>
                      <th className="text-left px-3 py-2 text-gray-500">Anio</th>
                      <th className="text-left px-3 py-2 text-gray-500">Coste</th>
                      <th className="text-left px-3 py-2 text-gray-500">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => (
                      <tr key={i} className={`border-b border-gray-100 dark:border-gray-700/50 ${!r.valid ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 font-mono font-bold">{r.matricula || '-'}</td>
                        <td className="px-3 py-2">{r.marca} {r.modelo}</td>
                        <td className="px-3 py-2">{r.anio}</td>
                        <td className="px-3 py-2">{r.costeCompra} EUR</td>
                        <td className="px-3 py-2">
                          {r.valid ? (
                            <span className="text-emerald-600 text-xs font-medium flex items-center gap-1"><Check className="w-3 h-3" /> OK</span>
                          ) : (
                            <span className="text-red-600 text-xs font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {r.errors.join(', ')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 50 && <p className="px-3 py-2 text-xs text-gray-500">Mostrando 50 de {rows.length} filas</p>}
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="text-center py-12">
              <LoaderCircle className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Importando vehiculos...</p>
              <div className="w-full max-w-xs mx-auto bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-sm text-gray-500">{progress}%</p>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Importacion completada</p>
              <p className="text-sm text-gray-500 mb-4">
                {importResult.success} vehiculos importados correctamente
                {importResult.errors > 0 && `, ${importResult.errors} con errores`}
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3 shrink-0">
          {step === 'preview' && (
            <>
              <button onClick={() => { setStep('upload'); setRows([]); }} className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                Volver
              </button>
              <div className="flex-1" />
              <button
                onClick={handleImport}
                disabled={validCount === 0}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 flex items-center gap-2"
              >
                <Upload className="w-4 h-4" /> Importar {validCount} vehiculos
              </button>
            </>
          )}
          {(step === 'done' || step === 'upload') && (
            <>
              <div className="flex-1" />
              <button onClick={onClose} className="px-5 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium rounded-lg">
                {step === 'done' ? 'Cerrar' : 'Cancelar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
