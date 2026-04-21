import { useMemo, useRef, useState } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle, ArrowRight, ArrowLeft, Download, LoaderCircle } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useApp, type Vehicle } from '../../context/AppContext';
import { useModalClose } from '../../hooks/useModalClose';

interface ImportError {
  row: number;
  field: string;
  message: string;
  value: unknown;
}

type VehicleImportField =
  | 'registrationPlate'
  | 'brand'
  | 'model'
  | 'version'
  | 'year'
  | 'color'
  | 'fuelType'
  | 'mileage'
  | 'vin'
  | 'transmission'
  | 'doors'
  | 'power'
  | 'bodyType'
  | 'purchasePrice'
  | 'salePrice'
  | 'purchaseDate'
  | 'origin'
  | 'supplierName'
  | 'status'
  | 'location'
  | 'notes'
  | 'ignore';

type MappedData = Partial<Record<Exclude<VehicleImportField, 'ignore'>, string>>;

interface VehicleImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  locations?: string[];
}

const REQUIRED_FIELDS: VehicleImportField[] = [
  'registrationPlate',
  'brand',
  'model',
  'year',
  'purchasePrice',
];

const SYSTEM_FIELDS: { value: VehicleImportField; label: string; required?: boolean }[] = [
  { value: 'registrationPlate', label: 'Matrícula *', required: true },
  { value: 'brand', label: 'Marca *', required: true },
  { value: 'model', label: 'Modelo *', required: true },
  { value: 'version', label: 'Versión' },
  { value: 'year', label: 'Año *', required: true },
  { value: 'color', label: 'Color' },
  { value: 'fuelType', label: 'Combustible' },
  { value: 'mileage', label: 'Kilómetros' },
  { value: 'vin', label: 'Bastidor (VIN)' },
  { value: 'transmission', label: 'Cambio' },
  { value: 'doors', label: 'Puertas' },
  { value: 'power', label: 'Potencia (CV)' },
  { value: 'bodyType', label: 'Carrocería' },
  { value: 'purchasePrice', label: 'Precio de compra *', required: true },
  { value: 'salePrice', label: 'Precio de venta' },
  { value: 'purchaseDate', label: 'Fecha de compra' },
  { value: 'origin', label: 'Origen' },
  { value: 'supplierName', label: 'Proveedor / vendedor' },
  { value: 'status', label: 'Estado inicial' },
  { value: 'location', label: 'Ubicación inicial' },
  { value: 'notes', label: 'Notas' },
  { value: 'ignore', label: '(Ignorar columna)' },
];

function normalizeHeader(header: string) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function autoDetectField(header: string): VehicleImportField | '' {
  const normalized = normalizeHeader(header);

  if (normalized.includes('matricula') || normalized.includes('plate')) return 'registrationPlate';
  if (normalized.includes('marca') || normalized.includes('brand')) return 'brand';
  if (normalized.includes('modelo') || normalized.includes('model')) return 'model';
  if (normalized.includes('version')) return 'version';
  if (normalized === 'ano' || normalized.includes('year')) return 'year';
  if (normalized.includes('color')) return 'color';
  if (normalized.includes('combustible') || normalized.includes('fuel')) return 'fuelType';
  if (normalized.includes('kilomet') || normalized.includes('mileage') || normalized === 'km') return 'mileage';
  if (normalized.includes('vin') || normalized.includes('bastidor')) return 'vin';
  if (normalized.includes('cambio') || normalized.includes('transmission')) return 'transmission';
  if (normalized.includes('puertas') || normalized.includes('doors')) return 'doors';
  if (normalized.includes('potencia') || normalized.includes('power')) return 'power';
  if (normalized.includes('carroceria') || normalized.includes('body')) return 'bodyType';
  if (normalized.includes('precio compra') || normalized.includes('compra') || normalized.includes('purchase')) return 'purchasePrice';
  if (normalized.includes('precio venta') || normalized.includes('venta') || normalized.includes('sale')) return 'salePrice';
  if (normalized.includes('fecha compra') || normalized.includes('purchase date')) return 'purchaseDate';
  if (normalized.includes('origen')) return 'origin';
  if (normalized.includes('proveedor') || normalized.includes('supplier') || normalized.includes('vendedor')) return 'supplierName';
  if (normalized.includes('estado') || normalized.includes('status')) return 'status';
  if (normalized.includes('ubicacion') || normalized.includes('location')) return 'location';
  if (normalized.includes('nota') || normalized.includes('notes')) return 'notes';

  return '';
}

function parseNumber(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const cleaned = String(value).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseText(value: unknown) {
  const nextValue = String(value ?? '').trim();
  return nextValue || undefined;
}

function normalizeStatus(value?: string): Vehicle['status'] {
  const normalized = normalizeHeader(value || '');
  if (normalized === 'reservado' || normalized === 'reserved') return 'reservado';
  if (normalized === 'vendido' || normalized === 'sold') return 'vendido';
  if (normalized === 'entrada' || normalized === 'entry') return 'entrada';
  if (normalized === 'preparacion' || normalized === 'taller' || normalized === 'workshop' || normalized === 'en taller' || normalized === 'preparation') return 'preparacion';
  if (normalized === 'listo' || normalized === 'available' || normalized === 'en stock' || normalized === 'disponible') return 'listo';
  if (normalized === 'desguace' || normalized === 'scrapped') return 'scrapped' as Vehicle['status'];
  return 'listo';
}

function normalizeFuelType(value?: string): Vehicle['fuelType'] {
  const normalized = normalizeHeader(value || '');
  if (normalized === 'gasolina' || normalized === 'gasoline') return 'gasolina';
  if (normalized === 'diesel' || normalized === 'diesel') return 'diesel';
  if (normalized === 'hibrido' || normalized === 'hybrid') return 'hibrido';
  if (normalized === 'electrico' || normalized === 'electric') return 'electrico';
  if (normalized === 'glp') return 'glp';
  if (normalized) return 'otro';
  return undefined;
}

function normalizeTransmission(value?: string): Vehicle['transmission'] {
  const normalized = normalizeHeader(value || '');
  if (normalized === 'manual') return 'manual';
  if (normalized === 'automatico' || normalized === 'automatic') return 'automatico';
  if (normalized === 'semiauto' || normalized === 'semi automatico') return 'semiauto';
  return undefined;
}

function normalizeOrigin(value?: string): Vehicle['origin'] {
  const normalized = normalizeHeader(value || '');
  if (normalized === 'particular') return 'particular';
  if (normalized === 'proveedor' || normalized === 'empresa') return 'empresa';
  if (normalized === 'subasta') return 'subasta';
  if (normalized === 'permuta') return 'permuta';
  if (normalized) return 'otro';
  return undefined;
}

function normalizeBodyType(value?: string): Vehicle['bodyType'] {
  const normalized = normalizeHeader(value || '');
  const map: Record<string, Vehicle['bodyType']> = {
    sedan: 'sedan',
    suv: 'suv',
    familiar: 'familiar',
    coupe: 'coupe',
    cabrio: 'cabrio',
    furgon: 'furgon',
    pickup: 'pickup',
    otro: 'otro',
  };
  return map[normalized] || (normalized ? 'otro' : undefined);
}

function buildTemplateRows() {
  return [
    {
      Matrícula: '1234-ABC',
      Marca: 'BMW',
      Modelo: 'X3',
      Versión: 'xDrive20d',
      Año: '2022',
      Color: 'Negro',
      Combustible: 'Diesel',
      Kilómetros: '48500',
      Bastidor: 'WBAKJ410X0C123456',
      Cambio: 'Automatico',
      Puertas: '5',
      Potencia: '190',
      Carrocería: 'SUV',
      'Precio compra': '25000',
      'Precio venta': '28900',
      'Fecha compra': '2026-03-01',
      Origen: 'Proveedor',
      Proveedor: 'Automoción García S.L.',
      Estado: 'Listo para vender',
      Ubicación: '',
      Notas: 'Vehículo nacional con historial completo',
    },
  ];
}

export function VehicleImportWizard({ isOpen, onClose, locations: propLocations }: VehicleImportWizardProps) {
  useModalClose(isOpen, onClose);
  const { addVehiclesBulk } = useApp();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [rawData, setRawData] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, VehicleImportField | ''>>({});
  const [mappedData, setMappedData] = useState<MappedData[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [importing, setImporting] = useState(false);
  const [importComplete, setImportComplete] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uniqueErrorRows = useMemo(
    () => [...new Set(errors.map((error) => error.row))],
    [errors],
  );

  const validRows = useMemo(
    () => mappedData.filter((_, index) => !uniqueErrorRows.includes(index + 2)),
    [mappedData, uniqueErrorRows],
  );

  const resetState = () => {
    setStep(1);
    setFile(null);
    setRawData([]);
    setHeaders([]);
    setColumnMapping({});
    setMappedData([]);
    setErrors([]);
    setImporting(false);
    setImportComplete(false);
    setSuccessCount(0);
    setSubmitError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const applyParsedData = (uploadedFile: File, rows: Record<string, unknown>[], nextHeaders: string[]) => {
    const filteredRows = rows.filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));
    const autoMapping = Object.fromEntries(
      nextHeaders.map((header) => [header, autoDetectField(header)]),
    ) as Record<string, VehicleImportField | ''>;

    setFile(uploadedFile);
    setRawData(filteredRows);
    setHeaders(nextHeaders);
    setColumnMapping(autoMapping);
    setMappedData([]);
    setErrors([]);
    setSubmitError('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    const extension = uploadedFile.name.split('.').pop()?.toLowerCase();

    if (extension === 'csv') {
      Papa.parse<Record<string, unknown>>(uploadedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          applyParsedData(uploadedFile, results.data || [], results.meta.fields || []);
        },
      });
      return;
    }

    if (extension === 'xlsx' || extension === 'xls') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
        const nextHeaders = rows.length > 0 ? Object.keys(rows[0]) : [];
        applyParsedData(uploadedFile, rows, nextHeaders);
      };
      reader.readAsArrayBuffer(uploadedFile);
    }
  };

  const handleMappingChange = (fileColumn: string, systemField: VehicleImportField | '') => {
    setColumnMapping((prev) => {
      const next = { ...prev };

      Object.entries(next).forEach(([header, value]) => {
        if (header !== fileColumn && value === systemField && systemField !== 'ignore' && systemField !== '') {
          next[header] = '';
        }
      });

      next[fileColumn] = systemField;
      return next;
    });
  };

  const validateAndMapData = () => {
    const nextMappedData: MappedData[] = [];
    const nextErrors: ImportError[] = [];

    rawData.forEach((row, index) => {
      const rowNumber = index + 2;
      const mappedRow: MappedData = {};

      headers.forEach((header) => {
        const systemField = columnMapping[header];
        if (systemField && systemField !== 'ignore') {
          mappedRow[systemField] = String(row[header] ?? '').trim();
        }
      });

      REQUIRED_FIELDS.forEach((field) => {
        if (!parseText(mappedRow[field])) {
          nextErrors.push({
            row: rowNumber,
            field,
            message: `El campo obligatorio "${SYSTEM_FIELDS.find((item) => item.value === field)?.label || field}" está vacío`,
            value: mappedRow[field],
          });
        }
      });

      const year = parseNumber(mappedRow.year);
      const purchasePrice = parseNumber(mappedRow.purchasePrice);
      const salePrice = parseNumber(mappedRow.salePrice);

      if (mappedRow.year && (!year || year < 1900 || year > new Date().getFullYear() + 1)) {
        nextErrors.push({
          row: rowNumber,
          field: 'year',
          message: `Año inválido: ${mappedRow.year}`,
          value: mappedRow.year,
        });
      }

      if (mappedRow.purchasePrice && (!purchasePrice || purchasePrice <= 0)) {
        nextErrors.push({
          row: rowNumber,
          field: 'purchasePrice',
          message: `Precio de compra inválido: ${mappedRow.purchasePrice}`,
          value: mappedRow.purchasePrice,
        });
      }

      if (mappedRow.salePrice && (!salePrice || salePrice <= 0)) {
        nextErrors.push({
          row: rowNumber,
          field: 'salePrice',
          message: `Precio de venta inválido: ${mappedRow.salePrice}`,
          value: mappedRow.salePrice,
        });
      }

      nextMappedData.push(mappedRow);
    });

    setMappedData(nextMappedData);
    setErrors(nextErrors);
  };

  const handleNextToPreview = () => {
    const mappedRequiredFields = REQUIRED_FIELDS.every((field) => Object.values(columnMapping).includes(field));
    if (!mappedRequiredFields) {
      setSubmitError('Debes mapear todos los campos obligatorios antes de continuar.');
      return;
    }

    setSubmitError('');
    validateAndMapData();
    setStep(3);
  };

  const handleImport = async () => {
    try {
      setImporting(true);
      setSubmitError('');

      const vehiclesToCreate: Omit<Vehicle, 'id' | 'createdAt' | 'daysInStock'>[] = validRows.map((row) => ({
        registrationPlate: parseText(row.registrationPlate) || '',
        brand: parseText(row.brand) || '',
        model: parseText(row.model) || '',
        version: parseText(row.version),
        year: parseNumber(row.year) || new Date().getFullYear(),
        color: parseText(row.color) || '',
        fuelType: normalizeFuelType(parseText(row.fuelType)),
        mileage: parseNumber(row.mileage),
        vin: parseText(row.vin)?.toUpperCase(),
        transmission: normalizeTransmission(parseText(row.transmission)),
        doors: parseNumber(row.doors),
        power: parseNumber(row.power),
        bodyType: normalizeBodyType(parseText(row.bodyType)),
        purchasePrice: parseNumber(row.purchasePrice) || 0,
        salePrice: parseNumber(row.salePrice),
        purchaseDate: parseText(row.purchaseDate),
        origin: normalizeOrigin(parseText(row.origin)),
        supplierName: parseText(row.supplierName),
        status: normalizeStatus(parseText(row.status)),
        location: parseText(row.location),
        notes: parseText(row.notes),
        active: true,
        type: 'car',
      }));

      const createdVehicles = await addVehiclesBulk(vehiclesToCreate);
      setSuccessCount(createdVehicles.length);
      setImportComplete(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Ocurrió un error durante la importación');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.json_to_sheet(buildTemplateRows());
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vehiculos');
    XLSX.writeFile(workbook, 'plantilla_importacion_vehiculos.xlsx');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b-2 border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Importar vehículos</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Paso {step} de 3: {step === 1 ? 'Subir archivo' : step === 2 ? 'Mapear columnas' : 'Revisar y confirmar'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-6 h-6 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <div className={`flex items-center gap-2 ${step >= 1 ? 'text-blue-600' : 'text-gray-400 dark:text-gray-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}>
                {step > 1 ? <CheckCircle className="w-5 h-5" /> : '1'}
              </div>
              <span className="font-medium">Subir</span>
            </div>
            <div className={`flex-1 h-1 mx-4 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-300'}`} />
            <div className={`flex items-center gap-2 ${step >= 2 ? 'text-blue-600' : 'text-gray-400 dark:text-gray-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}>
                {step > 2 ? <CheckCircle className="w-5 h-5" /> : '2'}
              </div>
              <span className="font-medium">Mapear</span>
            </div>
            <div className={`flex-1 h-1 mx-4 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-300'}`} />
            <div className={`flex items-center gap-2 ${step >= 3 ? 'text-blue-600' : 'text-gray-400 dark:text-gray-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}>
                {importComplete ? <CheckCircle className="w-5 h-5" /> : '3'}
              </div>
              <span className="font-medium">Confirmar</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <Upload className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Sube tu archivo CSV o Excel</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Acepta archivos `.csv`, `.xlsx` y `.xls` con cualquier orden de columnas.
                </p>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-500 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="vehicle-import-file"
                />
                <label htmlFor="vehicle-import-file" className="cursor-pointer">
                  <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">Haz clic para seleccionar un archivo</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">o arrástralo aquí</p>
                </label>
              </div>

              {file && (
                <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl flex items-center gap-3">
                  <FileText className="w-6 h-6 text-green-600" />
                  <div className="flex-1">
                    <div className="font-medium text-green-900">{file.name}</div>
                    <div className="text-sm text-green-700">{rawData.length} filas encontradas</div>
                  </div>
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <h4 className="font-bold text-blue-900 mb-2">Plantilla de referencia</h4>
                  <p className="text-sm text-blue-800 mb-3">
                    Descarga el Excel de ejemplo para ver todas las variables disponibles en la importación.
                  </p>
                  <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Descargar plantilla
                  </button>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <h4 className="font-bold text-amber-900 mb-2">Guardado SaaS por usuario</h4>
                  <p className="text-sm text-amber-800">
                    Cada fila confirmada se guardará en CouchDB con `type = "car"`, `active = true` y asociada al `user_id` del usuario autenticado.
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Mapea las columnas</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Asigna cada columna de tu archivo a los campos del sistema. Los campos marcados con * son obligatorios.
                </p>
              </div>

              <div className="grid lg:grid-cols-[2fr_1fr] gap-6">
                <div className="space-y-3">
                  {headers.map((header) => (
                    <div key={header} className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{header}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          Ejemplo: {String(rawData[0]?.[header] ?? 'N/A')}
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      <div className="flex-1">
                        <select
                          value={columnMapping[header] || ''}
                          onChange={(e) => handleMappingChange(header, e.target.value as VehicleImportField | '')}
                          className="w-full px-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none"
                        >
                          <option value="">Seleccionar campo...</option>
                          {SYSTEM_FIELDS.map((field) => (
                            <option key={field.value} value={field.value}>
                              {field.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
                    <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-3">Campos disponibles</h4>
                    <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                      {SYSTEM_FIELDS.filter((field) => field.value !== 'ignore').map((field) => (
                        <div key={field.value} className="flex items-center justify-between gap-3">
                          <span>{field.label}</span>
                          {field.required && (
                            <span className="text-[10px] font-bold uppercase text-red-500">Obligatorio</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {propLocations && propLocations.length > 0 && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <h4 className="font-bold text-amber-900 mb-2">Ubicaciones existentes</h4>
                      <p className="text-sm text-amber-800">
                        {propLocations.join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {submitError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  {submitError}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              {!importComplete ? (
                <>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Revisar datos</h3>
                    <p className="text-gray-600 dark:text-gray-400">Confirma la vista previa antes de guardar en CouchDB.</p>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl text-center">
                      <div className="text-3xl font-bold text-blue-600">{mappedData.length}</div>
                      <div className="text-sm text-blue-900">Total filas</div>
                    </div>
                    <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl text-center">
                      <div className="text-3xl font-bold text-green-600">{validRows.length}</div>
                      <div className="text-sm text-green-900">Listas para guardar</div>
                    </div>
                    <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl text-center">
                      <div className="text-3xl font-bold text-red-600">{uniqueErrorRows.length}</div>
                      <div className="text-sm text-red-900">Filas con errores</div>
                    </div>
                  </div>

                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                    Al confirmar, cada vehículo se guardará como `car`, con `active = true` y vinculado al usuario actual.
                  </div>

                  {errors.length > 0 && (
                    <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl">
                      <h4 className="font-bold text-red-900 mb-3 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        Errores encontrados ({errors.length})
                      </h4>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {errors.map((error, index) => (
                          <div key={`${error.row}-${error.field}-${index}`} className="p-3 bg-white dark:bg-gray-800 border border-red-200 rounded-lg text-sm">
                            <div className="font-medium text-red-900">
                              Fila {error.row}: {error.message}
                            </div>
                            <div className="text-red-700">
                              Campo: <code className="bg-red-100 px-2 py-0.5 rounded">{error.field}</code>
                              {error.value ? <> | Valor: <code className="bg-red-100 px-2 py-0.5 rounded">{String(error.value)}</code></> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto border-2 border-gray-200 dark:border-gray-700 rounded-xl">
                    <table className="w-full text-sm min-w-[900px]">
                      <thead className="bg-gray-100 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-gray-100">Fila</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-gray-100">Matrícula</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-gray-100">Marca</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-gray-100">Modelo</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-gray-100">Año</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-gray-100">Precio compra</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-gray-100">Precio venta</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-gray-100">Ubicación</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mappedData.slice(0, 8).map((row, index) => {
                          const rowNumber = index + 2;
                          const hasError = uniqueErrorRows.includes(rowNumber);
                          return (
                            <tr key={rowNumber} className={hasError ? 'bg-red-50' : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'}>
                              <td className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-2">
                                  {rowNumber}
                                  {hasError && <AlertCircle className="w-4 h-4 text-red-600" />}
                                </div>
                              </td>
                              <td className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">{row.registrationPlate || '—'}</td>
                              <td className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">{row.brand || '—'}</td>
                              <td className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">{row.model || '—'}</td>
                              <td className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">{row.year || '—'}</td>
                              <td className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">{row.purchasePrice || '—'}</td>
                              <td className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">{row.salePrice || '—'}</td>
                              <td className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">{row.location || 'Sin asignar'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {submitError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                      {submitError}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-12 h-12 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">¡Importación completada!</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-8">Se guardaron {successCount} vehículos correctamente en CouchDB.</p>

                  <div className="max-w-md mx-auto space-y-4">
                    <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl">
                      <div className="text-4xl font-bold text-green-600 mb-1">{successCount}</div>
                      <div className="text-sm text-green-900">Vehículos importados</div>
                    </div>
                    {uniqueErrorRows.length > 0 && (
                      <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-xl">
                        <div className="text-2xl font-bold text-amber-600 mb-1">{uniqueErrorRows.length}</div>
                        <div className="text-sm text-amber-900">Filas omitidas por errores</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t-2 border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-800">
          <div>
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 px-4 py-2 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-lg font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver
              </button>
            )}
            {step === 3 && !importComplete && (
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-2 px-4 py-2 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-lg font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step === 1 && (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-lg font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => file && setStep(2)}
                  disabled={!file || rawData.length === 0}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  Siguiente
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <button
                  onClick={resetState}
                  className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-lg font-medium transition-colors"
                >
                  Reiniciar
                </button>
                <button
                  onClick={handleNextToPreview}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Siguiente
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            )}

            {step === 3 && !importComplete && (
              <>
                <button
                  onClick={resetState}
                  className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-lg font-medium transition-colors"
                >
                  Reiniciar
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || validRows.length === 0}
                  className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  {importing ? (
                    <>
                      <LoaderCircle className="w-4 h-4 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Confirmar y guardar
                    </>
                  )}
                </button>
              </>
            )}

            {importComplete && (
              <button
                onClick={() => {
                  resetState();
                  onClose();
                }}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Finalizar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}