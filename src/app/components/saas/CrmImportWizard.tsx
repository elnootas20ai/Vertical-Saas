import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useModalClose } from '../../hooks/useModalClose';
import { toast } from 'sonner';
import {
  X, Upload, FileText, CheckCircle, AlertCircle, ArrowRight,
  ArrowLeft, LoaderCircle, Users, User, Download, FileSpreadsheet,
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useApp } from '../../context/AppContext';
import type { Lead, Client } from '../../context/AppContext';
import { bulkCreateLeadsRequest, bulkCreateClientsInChunks, fetchAllClientsForExport, previewClientAcquisitionPeakDayRequest, markClientsAcquisitionRequest } from '../../lib/crmApi';
import { useAuth } from '../../context/AuthContext';
import {
  autoDetectImportField,
  CLIENT_REQUIRED_FIELDS,
  LEAD_REQUIRED_FIELDS,
  normalizeParsedTable,
  REQUIRED_FIELD_LABELS,
  type ClientField,
  type ImportField,
  type ImportMode,
  type LeadField,
} from '../../lib/crmImportParse';
import {
  downloadClientImportTemplate,
  downloadClientImportTemplateCsv,
  downloadClientsExport,
  downloadLeadImportTemplate,
  downloadLeadImportTemplateCsv,
  mapClientToExportRow,
  type ClientExportRow,
} from '../../lib/crmImportTemplates';
import { isImportAbortError } from '../../lib/importAbort';
import {
  suggestClientImportAcquisitionKind,
  type ClientAcquisitionKind,
} from '../../lib/clientAcquisition';

interface ImportError { row: number; field: string; message: string; value: unknown; }

type MappedData = Partial<Record<string, string>>;

interface CrmImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: ImportMode;
  /** false = sin columna Responsable (p. ej. delivery) */
  includeResponsible?: boolean;
  /** iceCreamShop / lawyer → plantilla Excel clientes del vertical */
  templateVertical?: string | null;
  /** Si se indica, exporta todos los clientes del servidor bajo demanda. */
  exportUserId?: string;
  /** Scope de exportación por empresa (delivery multi-empresa). */
  exportBusinessId?: string;
  /** businessId al crear clientes importados. */
  importBusinessId?: string;
  clientExportRows?: ClientExportRow[];
  /** Tras importar con éxito (p. ej. refrescar listado paginado del CRM). */
  onImportComplete?: () => void;
}

// ─── Field definitions ────────────────────────────────────────────────────────

const LEAD_FIELDS: { value: LeadField; label: string; required?: boolean }[] = [
  { value: 'name',            label: 'Nombre *',           required: true },
  { value: 'phone',           label: 'Teléfono *',         required: true },
  { value: 'email',           label: 'Email' },
  { value: 'source',          label: 'Fuente' },
  { value: 'status',          label: 'Estado' },
  { value: 'vehicleInterest', label: 'Vehículo de interés' },
  { value: 'budget',          label: 'Presupuesto' },
  { value: 'notes',           label: 'Notas' },
  { value: 'responsible',     label: 'Responsable' },
  { value: 'tags',            label: 'Etiquetas' },
  { value: 'ignore',          label: '(Ignorar columna)' },
];

const CLIENT_FIELDS: { value: ClientField; label: string; required?: boolean }[] = [
  { value: 'name',        label: 'Nombre *',       required: true },
  { value: 'phone',       label: 'Teléfono *',     required: true },
  { value: 'email',       label: 'Email' },
  { value: 'dni',         label: 'DNI / CIF' },
  { value: 'address',     label: 'Dirección' },
  { value: 'city',        label: 'Ciudad' },
  { value: 'postalCode',  label: 'Código postal' },
  { value: 'notes',       label: 'Notas' },
  { value: 'responsible', label: 'Responsable' },
  { value: 'tags',        label: 'Etiquetas' },
  { value: 'ignore',      label: '(Ignorar columna)' },
];

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function CrmImportWizard({
  isOpen,
  onClose,
  initialMode,
  includeResponsible = true,
  templateVertical = null,
  exportUserId,
  exportBusinessId,
  importBusinessId,
  clientExportRows = [],
  onImportComplete,
}: CrmImportWizardProps) {
  const { addLead, addClient, refreshClients, refreshLeads, leads: existingLeads, clientsTotalCount } = useApp();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const importAbortRef = useRef<AbortController | null>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<ImportMode>(
    initialMode ?? (templateVertical === 'lawyer' ? 'clients' : 'leads'),
  );
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, ImportField>>({});
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; failed: number } | null>(null);
  const [parsingFile, setParsingFile] = useState(false);
  const [exportingClients, setExportingClients] = useState(false);
  /** Solo clientes: migración vs altas reales (afecta KPIs de “nuevos”). */
  const [acquisitionKind, setAcquisitionKind] = useState<ClientAcquisitionKind | null>(null);
  const [peakPreview, setPeakPreview] = useState<{ peakDay: string; peakCount: number } | null>(null);
  const [peakLoading, setPeakLoading] = useState(false);
  const [peakFixing, setPeakFixing] = useState(false);

  useModalClose(isOpen && !importing, onClose);

  useEffect(() => {
    if (initialMode) setMode(initialMode);
    else if (templateVertical === 'lawyer') setMode('clients');
  }, [initialMode, templateVertical]);

  const activeFields = mode === 'leads' ? LEAD_FIELDS : CLIENT_FIELDS;
  const requiredFields: ImportField[] = mode === 'leads' ? LEAD_REQUIRED_FIELDS : CLIENT_REQUIRED_FIELDS;
  const missingRequiredMapped = useMemo(() => {
    const mappedFields = Object.values(mapping);
    return requiredFields.filter((f) => !mappedFields.includes(f));
  }, [mapping, requiredFields]);

  const templateDownloads = useMemo(() => {
    const includeResp = includeResponsible;
    if (mode === 'clients') {
      const exportCount = exportUserId ? clientsTotalCount : clientExportRows.length;
      return [
        {
          id: 'xlsx-template',
          label: 'Plantilla Excel',
          description: 'Cabeceras listas para rellenar (.xlsx)',
          icon: <FileSpreadsheet className="w-4 h-4 text-emerald-600" />,
          action: () => {
            downloadClientImportTemplate({
              includeResponsible: includeResp,
              vertical: templateVertical,
            });
            toast.success(
              templateVertical === 'iceCreamShop'
                ? 'Plantilla Excel heladería descargada'
                : templateVertical === 'lawyer'
                  ? 'Plantilla Excel abogados descargada'
                  : 'Plantilla Excel descargada',
            );
          },
        },
        {
          id: 'csv-template',
          label: 'Plantilla CSV',
          description: 'Mismo formato en CSV (punto y coma)',
          icon: <FileText className="w-4 h-4 text-blue-600" />,
          action: () => {
            downloadClientImportTemplateCsv({
              includeResponsible: includeResp,
              vertical: templateVertical,
            });
            toast.success(
              templateVertical === 'iceCreamShop'
                ? 'Plantilla CSV heladería descargada'
                : templateVertical === 'lawyer'
                  ? 'Plantilla CSV abogados descargada'
                  : 'Plantilla CSV descargada',
            );
          },
        },
        ...(exportCount > 0 || exportUserId
          ? [{
              id: 'export-current',
              label: 'Mis clientes actuales',
              description: exportCount > 0
                ? `Exportar ${exportCount} cliente${exportCount === 1 ? '' : 's'} a Excel`
                : 'Exportar clientes actuales a Excel',
              icon: <Users className="w-4 h-4 text-violet-600" />,
              action: async () => {
                const uid = exportUserId || user?.user_id;
                if (exportUserId && uid) {
                  if (exportingClients) return;
                  setExportingClients(true);
                  const toastId = toast.loading('Preparando exportación…');
                  try {
                    const all = await fetchAllClientsForExport(uid, undefined, exportBusinessId, {
                      liveStats: includeResponsible === false,
                    });
                    downloadClientsExport(
                      all.map((c) => mapClientToExportRow(c)),
                      {
                        includeResponsible: includeResp,
                        includeDeliveryStats: includeResponsible === false,
                      },
                    );
                    toast.success(`Exportados ${all.length} clientes`, { id: toastId });
                  } catch {
                    toast.error('No se pudo exportar los clientes', { id: toastId });
                  } finally {
                    setExportingClients(false);
                  }
                  return;
                }
                downloadClientsExport(clientExportRows, { includeResponsible: includeResp });
                toast.success(`Exportados ${clientExportRows.length} clientes`);
              },
            }]
          : []),
      ];
    }
    return [
      {
        id: 'xlsx-template',
        label: 'Plantilla Excel',
        description: 'Cabeceras listas para rellenar (.xlsx)',
        icon: <FileSpreadsheet className="w-4 h-4 text-emerald-600" />,
        action: () => {
          downloadLeadImportTemplate();
          toast.success('Plantilla Excel descargada');
        },
      },
      {
        id: 'csv-template',
        label: 'Plantilla CSV',
        description: 'Mismo formato en CSV (punto y coma)',
        icon: <FileText className="w-4 h-4 text-blue-600" />,
        action: () => {
          downloadLeadImportTemplateCsv();
          toast.success('Plantilla CSV descargada');
        },
      },
    ];
  }, [mode, includeResponsible, templateVertical, clientExportRows, exportUserId, clientsTotalCount, exportingClients, user?.user_id, exportBusinessId]);

  const applyParsedTable = (headers: string[], body: string[][]) => {
    const normalized = normalizeParsedTable([headers, ...body]);
    if (!normalized) {
      toast.error('No se detectaron filas de datos. Revisa que el CSV tenga cabecera y al menos una fila.');
      return false;
    }
    setHeaders(normalized.headers);
    setRows(normalized.rows);
    const auto: Record<number, ImportField> = {};
    normalized.headers.forEach((h, i) => { auto[i] = autoDetectImportField(h, mode); });
    setMapping(auto);
    setStep(2);
    return true;
  };

  const mappedRows = useMemo((): MappedData[] => {
    return rows.map((row) => {
      const obj: MappedData = {};
      headers.forEach((_, colIdx) => {
        const field = mapping[colIdx];
        if (!field || field === 'ignore') return;
        obj[field] = String(row[colIdx] ?? '').trim();
      });
      return obj;
    });
  }, [rows, headers, mapping]);

  if (!isOpen) return null;

  // ─── Paso 1: upload ────────────────────────────────────────────────────────

  const handleFile = (file: File) => {
    setFileName(file.name);
    setParsingFile(true);
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isCsvLike = ext === 'csv' || ext === 'tsv' || ext === 'txt' || file.type.includes('csv') || file.type.includes('text');

    if (isCsvLike) {
      Papa.parse(file, {
        skipEmptyLines: true,
        delimiter: '',
        delimitersToGuess: [';', ',', '\t', '|'],
        encoding: 'UTF-8',
        complete: (result) => {
          setParsingFile(false);
          const data = result.data as string[][];
          if (!data.length) {
            toast.error('El archivo está vacío o no se pudo leer');
            return;
          }
          const hdrs = data[0].map(String);
          const body = data.slice(1);
          applyParsedTable(hdrs, body);
        },
        error: () => {
          setParsingFile(false);
          toast.error('No se pudo leer el CSV. Prueba guardarlo como UTF-8 o descarga la plantilla.');
        },
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setParsingFile(false);
      try {
        const raw = e.target?.result;
        if (!raw) {
          toast.error('No se pudo leer el archivo');
          return;
        }
        const wb = XLSX.read(raw, { type: 'array' });
        const sheetName = wb.SheetNames?.[0];
        const ws = sheetName ? wb.Sheets[sheetName] : null;
        if (!ws) {
          toast.error('No se encontró ninguna hoja en el Excel');
          return;
        }
        const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false }) as unknown[][];
        if (!data.length) {
          toast.error('El Excel está vacío');
          return;
        }
        const hdrs = (data[0] as unknown[]).map((x) => String(x ?? '').trim());
        const body = (data.slice(1) as unknown[][])
          .map((row) => row.map((x) => String(x ?? '').trim()));

        applyParsedTable(hdrs, body);
      } catch (err) {
        console.error('CRM import Excel parse error', err);
        toast.error('Error leyendo el Excel. Prueba a guardarlo como XLSX o CSV');
      }
    };
    reader.onerror = () => {
      setParsingFile(false);
      toast.error('No se pudo leer el archivo');
    };
    reader.readAsArrayBuffer(file);
  };

  const validateRows = (): ImportError[] => {
    const errs: ImportError[] = [];
    mappedRows.forEach((row, idx) => {
      for (const field of requiredFields) {
        if (!row[field]?.trim()) {
          errs.push({
            row: idx + 2,
            field,
            message: `Campo obligatorio vacío: ${REQUIRED_FIELD_LABELS[field] || field}`,
            value: '',
          });
        }
      }
    });
    return errs;
  };

  const handleValidate = () => {
    if (missingRequiredMapped.length > 0) {
      const labels = missingRequiredMapped.map((f) => REQUIRED_FIELD_LABELS[f] || f).join(', ');
      toast.error(`Asigna estas columnas obligatorias: ${labels}`);
      return;
    }
    const validCount = mappedRows.filter((r) => r.name?.trim() && r.phone?.trim()).length;
    if (validCount === 0) {
      toast.error('No hay filas con Nombre y Teléfono. Revisa el mapeo o el contenido del CSV.');
      return;
    }
    const errs = validateRows();
    setErrors(errs);
    if (mode === 'clients') {
      setAcquisitionKind(suggestClientImportAcquisitionKind(validCount));
    } else {
      setAcquisitionKind(null);
    }
    setStep(3);
  };

  // ─── Paso 3: importar ─────────────────────────────────────────────────────

  const handleImport = async () => {
    setImporting(true);
    const abortController = new AbortController();
    importAbortRef.current = abortController;
    let created = 0;
    let failed = 0;

    try {
      if (mode === 'leads') {
        const leadsToCreate: Lead[] = mappedRows
          .filter((row) => row.name && row.phone)
          .map((row) => ({
            id: `lead-${uuidv4()}`,
            type: 'lead' as const,
            user_id: user?.user_id || '',
            name: row.name || '',
            phone: row.phone || '',
            email: row.email || '',
            source: row.source || 'CSV',
            status: (row.status as Lead['status']) || 'new',
            vehicleInterest: row.vehicleInterest || '',
            budget: row.budget || '',
            notes: row.notes || '',
            responsible: row.responsible || 'Sin asignar',
            tags: row.tags ? row.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
            createdAt: new Date(),
            updatedAt: new Date(),
          }));

        if (user?.user_id) {
          const result = await bulkCreateLeadsRequest(user.user_id, leadsToCreate);
          created = result.length;
          failed = leadsToCreate.length - created;
          // Refrescar el store global para que la lista de leads incluya los nuevos sin recargar.
          await refreshLeads();
        } else {
          for (const l of leadsToCreate) {
            await addLead(l);
            created++;
          }
        }
      } else {
        if (!acquisitionKind) {
          toast.error('Indica si son clientes existentes o nuevos antes de importar');
          setImporting(false);
          importAbortRef.current = null;
          return;
        }
        const importAcquisitionKind = acquisitionKind;
        const clientsToCreate: Client[] = mappedRows
          // Backend solo exige nombre y teléfono; email es deseable pero no obligatorio para no bloquear filas válidas.
          .filter((row) => row.name && row.phone)
          .map((row) => ({
            id: `client-${uuidv4()}`,
            type: 'client' as const,
            user_id: user?.user_id || '',
            name: row.name || '',
            phone: row.phone || '',
            email: row.email || '',
            dni: row.dni || '',
            address: row.address || '',
            city: row.city || '',
            postalCode: row.postalCode || '',
            status: 'active' as const,
            responsible: row.responsible || 'Sin asignar',
            notes: row.notes || '',
            tags: row.tags ? row.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
            consents: { dataProcessing: false, commercial: false, thirdParty: false },
            gdpr: { deletionRequested: false, consentHistory: [] },
            vehiclesPurchased: [],
            vehiclesSold: [],
            documentsCount: 0,
            interactions: [],
            documentsList: [],
            stats: {
              totalOrders: 0,
              lastOrderDate: null,
              orderFrequencyDays: 0,
              favoriteAddressId: null,
              totalSpent: 0,
              createdFrom: 'import',
              acquisitionKind: importAcquisitionKind,
              excludeFromNewMetrics: importAcquisitionKind === 'migration',
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          }));

        if (user?.user_id) {
          setImportProgress({ done: 0, total: clientsToCreate.length });
          const dataOwnerId = String(exportUserId || user.user_id).trim();
          const result = await bulkCreateClientsInChunks(
            dataOwnerId,
            clientsToCreate,
            (done, total) => setImportProgress({ done, total }),
            importBusinessId
              ? { businessId: importBusinessId, signal: abortController.signal }
              : { signal: abortController.signal },
          );
          created = result.createdCount;
          failed = clientsToCreate.length - created;
          setImportProgress(null);
          await refreshClients();
          if (created > 0) onImportComplete?.();
        } else {
          for (const c of clientsToCreate) {
            await addClient(c);
            created++;
          }
          if (created > 0) onImportComplete?.();
        }
      }
    } catch (err) {
      if (isImportAbortError(err) || abortController.signal.aborted) {
        toast.message('Importación cancelada');
        setStep(2);
      } else {
        console.error('Import error:', err);
        failed++;
        setImportResult({ created, failed });
      }
    } finally {
      setImporting(false);
      setImportProgress(null);
      importAbortRef.current = null;
    }

    if (!abortController.signal.aborted) {
      setImportResult({ created, failed });
    }
  };

  const handleCancelImport = () => {
    if (!importing) return;
    importAbortRef.current?.abort();
  };

  const handleReset = () => {
    setStep(1);
    setMode(initialMode ?? 'leads');
    setHeaders([]);
    setRows([]);
    setMapping({});
    setErrors([]);
    setFileName('');
    setImportProgress(null);
    setImportResult(null);
    setAcquisitionKind(null);
    setPeakPreview(null);
  };

  const handleDetectPreviousExcelImport = async () => {
    if (!user?.user_id) return;
    setPeakLoading(true);
    try {
      const dataOwnerId = String(exportUserId || user.user_id).trim();
      const preview = await previewClientAcquisitionPeakDayRequest(dataOwnerId, {
        businessId: importBusinessId || exportBusinessId,
      });
      if (!preview.peakDay || preview.peakCount < 500) {
        setPeakPreview(null);
        toast.message('No hay una carga masiva sin marcar (≥500 en un día)');
        return;
      }
      setPeakPreview({ peakDay: preview.peakDay, peakCount: preview.peakCount });
    } catch (err) {
      console.error(err);
      toast.error('No se pudo analizar la base de clientes');
    } finally {
      setPeakLoading(false);
    }
  };

  const handleMarkPreviousExcelAsMigration = async () => {
    if (!user?.user_id || !peakPreview?.peakDay) return;
    setPeakFixing(true);
    try {
      const dataOwnerId = String(exportUserId || user.user_id).trim();
      const result = await markClientsAcquisitionRequest(dataOwnerId, {
        businessId: importBusinessId || exportBusinessId,
        acquisitionKind: 'migration',
        createdDay: peakPreview.peakDay,
        onlyUnmarked: true,
      });
      toast.success(`${result.updated} clientes marcados como base existente (ya no cuentan como nuevos)`);
      setPeakPreview(null);
      await refreshClients();
      onImportComplete?.();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo corregir la importación anterior');
    } finally {
      setPeakFixing(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <Upload className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Importar {mode === 'leads' ? 'leads' : 'clientes'}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Importación masiva desde CSV o Excel</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Steps */}
            <div className="hidden sm:flex items-center gap-1.5">
              {[1, 2, 3].map((s) => (
                <div key={s} className={`flex items-center gap-1 ${s < 3 ? 'after:content-[""] after:w-6 after:h-px after:bg-gray-200 after:mx-1' : ''}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= s ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'}`}>
                    {step > s ? <CheckCircle className="w-3.5 h-3.5" /> : s}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── PASO 1: Tipo + Upload ──────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Tipo de importación — solo si no se fija el modo desde fuera */}
              {!initialMode && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">¿Qué quieres importar?</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: 'leads' as ImportMode, label: 'Leads / Consultas', desc: 'Prospectos aún no convertidos', icon: <User className="w-5 h-5" /> },
                      { value: 'clients' as ImportMode, label: 'Clientes', desc: 'Clientes ya existentes', icon: <Users className="w-5 h-5" /> },
                    ]
                      .filter((opt) => !(templateVertical === 'lawyer' && opt.value === 'leads'))
                      .map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setMode(opt.value)}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${mode === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${mode === opt.value ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                          {opt.icon}
                        </div>
                        <div>
                          <p className={`font-semibold text-sm ${mode === opt.value ? 'text-blue-700' : 'text-gray-900 dark:text-gray-100'}`}>{opt.label}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{opt.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Plantillas descargables */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Descarga una plantilla
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Elige Excel o CSV, rellénala con tus datos e impórtala abajo.
                </p>
                <div className={`grid gap-2 ${templateDownloads.length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                  {templateDownloads.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={opt.action}
                      className="flex items-start gap-3 p-3.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 text-left transition-all"
                    >
                      <div className="mt-0.5 shrink-0">{opt.icon}</div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                          <Download className="w-3.5 h-3.5 text-gray-400" />
                          {opt.label}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{opt.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors group ${
                  parsingFile ? 'border-blue-300 bg-blue-50/50' : 'border-gray-300 hover:border-blue-400'
                }`}
                onClick={() => !parsingFile && fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) handleFile(f);
                }}
              >
                <Upload className="w-10 h-10 text-gray-300 group-hover:text-blue-400 mx-auto mb-3 transition-colors" />
                {parsingFile ? (
                  <>
                    <LoaderCircle className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
                    <p className="text-gray-700 dark:text-gray-300 font-medium">Leyendo archivo...</p>
                  </>
                ) : (
                  <>
                    <p className="text-gray-700 dark:text-gray-300 font-medium">Arrastra tu archivo aquí</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">o haz clic para seleccionar</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Formatos: CSV (coma o punto y coma), TSV, XLSX, XLS</p>
                    {fileName ? <p className="text-xs text-blue-600 mt-2 font-medium">{fileName}</p> : null}
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

              {mode === 'clients' && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      ¿El dashboard cuenta miles de “clientes nuevos” por un Excel anterior?
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Esto no cambia altas normales: solo marca como base existente el día de una carga masiva sin origen.
                      Las altas reales del día a día siguen sumando.
                    </p>
                  </div>
                  {!peakPreview ? (
                    <button
                      type="button"
                      onClick={handleDetectPreviousExcelImport}
                      disabled={peakLoading || !user?.user_id}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                      {peakLoading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : null}
                      Detectar importación anterior
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-amber-900 dark:text-amber-200">
                        El <span className="font-semibold">{peakPreview.peakDay}</span> se crearon{' '}
                        <span className="font-semibold">{peakPreview.peakCount}</span> clientes sin marcar.
                        ¿Era la base del Excel (migración)?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleMarkPreviousExcelAsMigration}
                          disabled={peakFixing}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          {peakFixing ? <LoaderCircle className="w-4 h-4 animate-spin" /> : null}
                          Sí, marcar como existentes
                        </button>
                        <button
                          type="button"
                          onClick={() => setPeakPreview(null)}
                          disabled={peakFixing}
                          className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── PASO 2: Mapeo de columnas ─────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Mapear columnas</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{rows.length} filas detectadas en «{fileName}»</p>
                </div>
              </div>
              {missingRequiredMapped.length > 0 && (
                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs font-semibold">
                  Para continuar, asigna estas columnas obligatorias:{' '}
                  {missingRequiredMapped.map((f) => REQUIRED_FIELD_LABELS[f] || f).join(', ')}.
                  <span className="font-medium block mt-1">
                    Si tu CSV viene de Excel en español, usa cabeceras como «Nombre» y «Teléfono» (o mapéalas manualmente en el desplegable).
                  </span>
                </div>
              )}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 w-1/3">Columna del archivo</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 w-1/3">Campo del sistema</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Vista previa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((header, colIdx) => (
                      <tr key={colIdx} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-gray-800 dark:text-gray-200">{header}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={mapping[colIdx] || 'ignore'}
                            onChange={(e) => setMapping((prev) => ({ ...prev, [colIdx]: e.target.value as ImportField }))}
                            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {activeFields.map((f) => (
                              <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px] block">
                            {rows.slice(0, 3).map((r) => r[colIdx]).filter(Boolean).join(' · ') || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── PASO 3: Revisión + resultado ──────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              {importing && importProgress ? (
                <div className="text-center py-12 space-y-5">
                  <LoaderCircle className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Importando clientes...</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {importProgress.done} / {importProgress.total}
                  </p>
                  <div className="max-w-sm mx-auto h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${Math.round((importProgress.done / Math.max(importProgress.total, 1)) * 100)}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelImport}
                    className="px-5 py-2.5 rounded-lg border-2 border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300 text-sm font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                  >
                    Cancelar importación
                  </button>
                </div>
              ) : importResult ? (
                <div className="text-center py-10">
                  <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 ${importResult.failed === 0 ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                    {importResult.failed === 0
                      ? <CheckCircle className="w-8 h-8 text-emerald-600" />
                      : <AlertCircle className="w-8 h-8 text-amber-600" />
                    }
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Importación completada</h3>
                  <div className="flex items-center justify-center gap-6 mt-4">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-emerald-600">{importResult.created}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Creados</p>
                    </div>
                    {importResult.failed > 0 && (
                      <div className="text-center">
                        <p className="text-3xl font-bold text-red-600">{importResult.failed}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Errores</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-3 mt-6">
                    <button onClick={handleReset} className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      Importar más
                    </button>
                    <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
                      Cerrar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
                    <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-blue-800">Resumen de importación</p>
                      <p className="text-sm text-blue-700 mt-0.5">
                        {mappedRows.filter((r) => r.name && r.phone).length} registros válidos (nombre + teléfono) de {rows.length} filas
                        {mode === 'clients' ? ' · el email es opcional' : ''}
                      </p>
                    </div>
                  </div>

                  {mode === 'clients' && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-amber-900">
                          ¿Estos clientes ya existían en el negocio o son nuevos?
                        </p>
                        <p className="text-xs text-amber-800 mt-1">
                          Si importas una base histórica (p. ej. miles desde Excel), márcalos como existentes:
                          cuentan en la cartera total, pero no como “clientes nuevos” del día/mes.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setAcquisitionKind('migration')}
                          className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                            acquisitionKind === 'migration'
                              ? 'border-amber-500 bg-white shadow-sm'
                              : 'border-amber-200 bg-white/60 hover:bg-white'
                          }`}
                        >
                          <p className="text-sm font-semibold text-gray-900">Ya existían (migración)</p>
                          <p className="text-xs text-gray-600 mt-0.5">Base previa / Excel histórico · no inflan altas del mes</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAcquisitionKind('organic')}
                          className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                            acquisitionKind === 'organic'
                              ? 'border-emerald-500 bg-white shadow-sm'
                              : 'border-amber-200 bg-white/60 hover:bg-white'
                          }`}
                        >
                          <p className="text-sm font-semibold text-gray-900">Son nuevos (altas reales)</p>
                          <p className="text-xs text-gray-600 mt-0.5">Clientes captados ahora · sí cuentan en “nuevos”</p>
                        </button>
                      </div>
                    </div>
                  )}

                  {errors.length > 0 && (
                    <div className="border border-red-200 rounded-xl overflow-hidden">
                      <div className="bg-red-50 px-4 py-3 border-b border-red-200 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600" />
                        <span className="text-sm font-semibold text-red-700">{errors.length} errores detectados (estas filas serán ignoradas)</span>
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-red-100">
                        {errors.slice(0, 20).map((err, i) => (
                          <div key={i} className="px-4 py-2 text-xs">
                            <span className="font-medium text-red-700">Fila {err.row}:</span>
                            <span className="text-red-600 ml-1">{err.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preview table */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
                      <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Vista previa (primeras 5 filas)</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[700px]">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800">
                            {Object.keys(mappedRows[0] || {}).map((k) => (
                              <th key={k} className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-400 capitalize">{k}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {mappedRows.slice(0, 5).map((row, i) => (
                            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 dark:hover:bg-gray-800">
                              {Object.values(row).map((v, j) => (
                                <td key={j} className="px-3 py-2 text-gray-700 dark:text-gray-300 truncate max-w-[120px]">{v || '—'}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!importResult && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 bg-gray-50 dark:bg-gray-800">
            <div>
              {step > 1 && (
                <button
                  onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Anterior
                </button>
              )}
            </div>
            <div>
              {step === 1 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">Sube un archivo para continuar</p>
              )}
              {step === 2 && (
                <button
                  onClick={handleValidate}
                  disabled={headers.length === 0 || rows.length === 0 || missingRequiredMapped.length > 0}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Revisar datos
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              {step === 3 && !importing && !importResult && (
                <button
                  onClick={handleImport}
                  disabled={importing || (mode === 'clients' && !acquisitionKind)}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {importing ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Importar {mappedRows.filter((r) => r.name && r.phone).length} registros
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
