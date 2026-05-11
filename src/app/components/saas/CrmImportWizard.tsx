import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useModalClose } from '../../hooks/useModalClose';
import { toast } from 'sonner';
import {
  X, Upload, FileText, CheckCircle, AlertCircle, ArrowRight,
  ArrowLeft, Download, LoaderCircle, Users, User,
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useApp } from '../../context/AppContext';
import type { Lead, Client } from '../../context/AppContext';
import { bulkCreateLeadsRequest, bulkCreateClientsRequest } from '../../lib/crmApi';
import { useAuth } from '../../context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportMode = 'leads' | 'clients';

type LeadField =
  | 'name' | 'phone' | 'email' | 'source' | 'status'
  | 'vehicleInterest' | 'budget' | 'notes' | 'responsible' | 'tags' | 'ignore';

type ClientField =
  | 'name' | 'phone' | 'email' | 'dni' | 'address' | 'city'
  | 'postalCode' | 'notes' | 'responsible' | 'tags' | 'ignore';

type ImportField = LeadField | ClientField;
type MappedData = Partial<Record<string, string>>;

interface ImportError { row: number; field: string; message: string; value: unknown; }

interface CrmImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: ImportMode;
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
  { value: 'email',       label: 'Email *',        required: true },
  { value: 'dni',         label: 'DNI / CIF' },
  { value: 'address',     label: 'Dirección' },
  { value: 'city',        label: 'Ciudad' },
  { value: 'postalCode',  label: 'Código postal' },
  { value: 'notes',       label: 'Notas' },
  { value: 'responsible', label: 'Responsable' },
  { value: 'tags',        label: 'Etiquetas' },
  { value: 'ignore',      label: '(Ignorar columna)' },
];

const LEAD_REQUIRED: LeadField[] = ['name', 'phone'];
const CLIENT_REQUIRED: ClientField[] = ['name', 'phone', 'email'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeHeader(h: string) {
  return String(h || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Quitar ruido típico de plantillas: asteriscos, paréntesis, etc.
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const LEAD_ALIASES: Record<string, LeadField> = {
  nombre: 'name', name: 'name',
  telefono: 'phone', phone: 'phone', movil: 'phone', tel: 'phone',
  email: 'email', correo: 'email',
  fuente: 'source', source: 'source', origen: 'source',
  estado: 'status', status: 'status',
  vehiculo: 'vehicleInterest', 'vehiculo de interes': 'vehicleInterest', interes: 'vehicleInterest',
  presupuesto: 'budget', budget: 'budget',
  notas: 'notes', notes: 'notes', observaciones: 'notes',
  responsable: 'responsible', assigned: 'responsible', comercial: 'responsible',
  etiquetas: 'tags', tags: 'tags', labels: 'tags',
};

const CLIENT_ALIASES: Record<string, ClientField> = {
  nombre: 'name', name: 'name',
  telefono: 'phone', phone: 'phone', movil: 'phone', tel: 'phone',
  email: 'email', correo: 'email',
  dni: 'dni', nif: 'dni', cif: 'dni',
  direccion: 'address', address: 'address', calle: 'address',
  ciudad: 'city', city: 'city', poblacion: 'city',
  'codigo postal': 'postalCode', cp: 'postalCode', postalcode: 'postalCode',
  notas: 'notes', notes: 'notes', observaciones: 'notes',
  responsable: 'responsible', comercial: 'responsible',
  etiquetas: 'tags', tags: 'tags', labels: 'tags',
};

function autoDetect(header: string, mode: ImportMode): ImportField {
  const norm = normalizeHeader(header);
  const aliases = mode === 'leads' ? LEAD_ALIASES : CLIENT_ALIASES;
  return aliases[norm] || 'ignore';
}

function generateLeadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([[
    'Nombre', 'Teléfono', 'Email', 'Fuente', 'Estado', 'Vehículo de interés',
    'Presupuesto', 'Notas', 'Responsable', 'Etiquetas',
  ], [
    'Carlos Ruiz', '612345678', 'carlos@email.com', 'Web', 'new',
    'BMW Serie 3 2020', '25000', 'Interesado en financiación', 'Juan García', 'VIP,Financiación',
  ]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  XLSX.writeFile(wb, 'plantilla_leads.xlsx');
}

function generateClientTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([[
    'Nombre', 'Teléfono', 'Email', 'DNI', 'Dirección', 'Ciudad',
    'Código postal', 'Notas', 'Responsable', 'Etiquetas',
  ], [
    'Ana López', '623456789', 'ana@email.com', '12345678A', 'Calle Mayor 10',
    'Madrid', '28013', 'Cliente premium', 'María García', 'Premium,Madrid',
  ]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
  XLSX.writeFile(wb, 'plantilla_clientes.xlsx');
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function CrmImportWizard({ isOpen, onClose, initialMode }: CrmImportWizardProps) {
  useModalClose(isOpen, onClose);
  const { addLead, addClient, refreshClients, refreshLeads, leads: existingLeads, clients: existingClients } = useApp();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<ImportMode>(initialMode ?? 'leads');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, ImportField>>({});
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; failed: number } | null>(null);

  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);

  const activeFields = mode === 'leads' ? LEAD_FIELDS : CLIENT_FIELDS;
  const requiredFields: ImportField[] = mode === 'leads' ? LEAD_REQUIRED : CLIENT_REQUIRED;
  const missingRequiredMapped = useMemo(() => {
    const mappedFields = Object.values(mapping);
    return requiredFields.filter((f) => !mappedFields.includes(f));
  }, [mapping, requiredFields]);

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
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv') {
      Papa.parse(file, {
        skipEmptyLines: true,
        complete: (result) => {
          const data = result.data as string[][];
          if (!data.length) {
            toast.error('El archivo está vacío o no se pudo leer');
            return;
          }
          const hdrs = data[0].map(String);
          const body = data.slice(1);
          if (!hdrs.length || body.length === 0) {
            toast.error('No se detectaron filas de datos en el archivo');
            return;
          }
          setHeaders(hdrs);
          setRows(body);
          const auto: Record<number, ImportField> = {};
          hdrs.forEach((h, i) => { auto[i] = autoDetect(h, mode); });
          setMapping(auto);
          setStep(2);
        },
        error: () => toast.error('No se pudo leer el CSV'),
      });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const raw = e.target?.result;
          if (!raw) {
            toast.error('No se pudo leer el archivo');
            return;
          }
          // Usamos ArrayBuffer (más compatible que readAsBinaryString)
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
          const hdrs = (data[0] as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean);
          const body = (data.slice(1) as unknown[][])
            .map((row) => row.map((x) => String(x ?? '').trim()))
            .filter((row) => row.some((v) => String(v || '').trim() !== ''));

          if (!hdrs.length || body.length === 0) {
            toast.error('No se detectaron filas de datos en el Excel');
            return;
          }
          setHeaders(hdrs);
          setRows(body);
          const auto: Record<number, ImportField> = {};
          hdrs.forEach((h, i) => { auto[i] = autoDetect(h, mode); });
          setMapping(auto);
          setStep(2);
        } catch (err) {
          console.error('CRM import Excel parse error', err);
          toast.error('Error leyendo el Excel. Prueba a guardarlo como XLSX o CSV');
        }
      };
      reader.onerror = () => toast.error('No se pudo leer el archivo');
      reader.readAsArrayBuffer(file);
    }
  };

  const validateRows = (): ImportError[] => {
    const errs: ImportError[] = [];
    mappedRows.forEach((row, idx) => {
      requiredFields.forEach((field) => {
        if (!row[field]?.trim()) {
          errs.push({ row: idx + 2, field, message: `Campo obligatorio vacío: ${field}`, value: '' });
        }
      });
    });
    return errs;
  };

  const handleValidate = () => {
    if (missingRequiredMapped.length > 0) {
      toast.error(`Debes mapear los campos obligatorios: ${missingRequiredMapped.join(', ')}`);
      return;
    }
    const errs = validateRows();
    setErrors(errs);
    setStep(3);
  };

  // ─── Paso 3: importar ─────────────────────────────────────────────────────

  const handleImport = async () => {
    setImporting(true);
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
            createdAt: new Date(),
            updatedAt: new Date(),
          }));

        if (user?.user_id) {
          const result = await bulkCreateClientsRequest(user.user_id, clientsToCreate);
          created = result.length;
          failed = clientsToCreate.length - created;
          // Refrescar el store global para que la lista de clientes incluya los nuevos sin recargar.
          await refreshClients();
        } else {
          for (const c of clientsToCreate) {
            await addClient(c);
            created++;
          }
        }
      }
    } catch (err) {
      console.error('Import error:', err);
      failed++;
    }

    setImporting(false);
    setImportResult({ created, failed });
  };

  const handleReset = () => {
    setStep(1);
    setMode(initialMode ?? 'leads');
    setHeaders([]);
    setRows([]);
    setMapping({});
    setErrors([]);
    setFileName('');
    setImportResult(null);
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
                    ].map((opt) => (
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

              {/* Plantilla */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">¿Necesitas una plantilla?</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Descarga el Excel de ejemplo para {mode === 'leads' ? 'leads' : 'clientes'}</p>
                  </div>
                  <button
                    onClick={mode === 'leads' ? generateLeadTemplate : generateClientTemplate}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Descargar plantilla
                  </button>
                </div>
              </div>

              {/* Drop zone */}
              <div
                className="border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl p-10 text-center cursor-pointer transition-colors group"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) handleFile(f);
                }}
              >
                <Upload className="w-10 h-10 text-gray-300 group-hover:text-blue-400 mx-auto mb-3 transition-colors" />
                <p className="text-gray-700 dark:text-gray-300 font-medium">Arrastra tu archivo aquí</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">o haz clic para seleccionar</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Formatos: CSV, XLSX, XLS</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
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
                  Falta mapear campos obligatorios para continuar: {missingRequiredMapped.join(', ')}.
                  <span className="font-medium"> Asegúrate de haber subido la plantilla correcta (Clientes) y asigna cada columna.</span>
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
              {importResult ? (
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
                        {mappedRows.filter((r) => r.name && r.phone).length} registros válidos de {rows.length} filas totales
                      </p>
                    </div>
                  </div>

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
                  disabled={importing}
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
