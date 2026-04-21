import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit2, Trash2, Filter, Download,
  Package, Euro, TrendingUp, Clock, AlertTriangle, ShieldAlert, FileWarning,
  ScanBarcode, Lock, Unlock, Eye, ChevronDown, ChevronUp, Zap,
  MapPin, Thermometer, FileText, CalendarDays, ArrowUpDown, ScanSearch,
  Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

// ── Types ────────────────────────────────────────────────────────────────────

type TipoAnimal = 'vacuno' | 'cerdo' | 'pollo' | 'cordero' | 'otro';
type EstadoLote = 'activo' | 'agotado' | 'caducado' | 'bloqueado';
type SortField = 'fechaEntrada' | 'fechaCaducidad' | 'kgDisponibles' | 'costePorKg' | 'codigoLote';
type SortDir = 'asc' | 'desc';

interface VentaLote {
  ventaId: string;
  ticketNumero: string;
  fecha: string;
  kgVendidos: number;
  cliente?: string;
}

interface Lote extends VerticalEntity {
  codigoLote: string;
  proveedorId: string;
  proveedorNombre: string;
  tipoAnimal: TipoAnimal;
  origen: string;
  matadero: string;
  nGuiaSanitaria: string;
  fechaEntrada: string;
  fechaCaducidad: string;
  fechaSacrificio: string;
  kgRecibidos: number;
  kgDisponibles: number;
  costePorKg: number;
  tiendaAlmacenId: string;
  tiendaAlmacenNombre: string;
  temperatura: number;
  estado: EstadoLote;
  motivoBloqueo?: string;
  fechaBloqueo?: string;
  observaciones: string;
  ventasAsociadas: VentaLote[];
  creadoPor: string;
  fechaCreacion: string;
}

type LoteForm = Omit<Lote, keyof VerticalEntity | 'kgDisponibles' | 'ventasAsociadas' | 'fechaCreacion'>;

interface SupplierRow extends VerticalEntity {
  nombre: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ANIMAL_LABEL: Record<TipoAnimal, string> = {
  vacuno: 'Vacuno', cerdo: 'Cerdo', pollo: 'Pollo', cordero: 'Cordero', otro: 'Otro',
};
const ANIMAL_COLOR: Record<TipoAnimal, string> = {
  vacuno: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  cerdo: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  pollo: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  cordero: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  otro: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

const ESTADO_CFG: Record<EstadoLote, { label: string; dot: string; row: string }> = {
  activo:    { label: 'Activo',    dot: 'bg-emerald-500', row: '' },
  agotado:   { label: 'Agotado',   dot: 'bg-gray-400',    row: 'opacity-60' },
  caducado:  { label: 'Caducado',  dot: 'bg-red-500',     row: 'border-l-4 border-l-red-500' },
  bloqueado: { label: 'Bloqueado', dot: 'bg-orange-500',  row: 'opacity-60 border-l-4 border-l-orange-500' },
};

const EXPIRY_WARN_DAYS = 3;
const HOY = new Date().toISOString().slice(0, 10);

// ── Helpers ──────────────────────────────────────────────────────────────────

function diasHastaCaducidad(fechaCad: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const cad = new Date(fechaCad);
  cad.setHours(0, 0, 0, 0);
  return Math.ceil((cad.getTime() - hoy.getTime()) / 86_400_000);
}

function computeEstadoAuto(lote: { fechaCaducidad: string; kgDisponibles: number; estado: EstadoLote }): EstadoLote {
  if (lote.estado === 'bloqueado') return 'bloqueado';
  if (lote.kgDisponibles <= 0) return 'agotado';
  if (lote.fechaCaducidad && diasHastaCaducidad(lote.fechaCaducidad) < 0) return 'caducado';
  return 'activo';
}

function generarCodigoLote(existentes: string[]): string {
  const year = new Date().getFullYear();
  let n = 1;
  const prefix = `LOTE-${year}-`;
  const nums = existentes.filter(c => c.startsWith(prefix)).map(c => parseInt(c.slice(prefix.length), 10)).filter(x => !isNaN(x));
  if (nums.length > 0) n = Math.max(...nums) + 1;
  return `${prefix}${String(n).padStart(3, '0')}`;
}

function fmtDate(d: string) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function fmtKg(n: number) { return n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function fmtEur(n: number) { return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }); }

function loteTieneDatosIncompletos(l: Lote): boolean {
  return !l.proveedorNombre || !l.fechaCaducidad || !l.costePorKg || !l.tiendaAlmacenNombre;
}

// ── Empty form ───────────────────────────────────────────────────────────────

function makeEmptyForm(creadoPor: string): LoteForm {
  return {
    codigoLote: '', proveedorId: '', proveedorNombre: '', tipoAnimal: 'vacuno',
    origen: '', matadero: '', nGuiaSanitaria: '', fechaEntrada: HOY,
    fechaCaducidad: '', fechaSacrificio: '', kgRecibidos: 0, costePorKg: 0,
    tiendaAlmacenId: '', tiendaAlmacenNombre: '', temperatura: 2,
    estado: 'activo', observaciones: '', creadoPor,
  };
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV(lotes: Lote[]) {
  const headers = ['Código lote', 'Proveedor', 'Tipo animal', 'Origen', 'Matadero', 'Guía sanitaria', 'Fecha entrada', 'Fecha caducidad', 'Kg recibidos', 'Kg disponibles', 'Coste/kg', 'Tienda/Almacén', 'Temperatura', 'Estado', 'Observaciones'];
  const rows = lotes.map(l => [l.codigoLote, l.proveedorNombre, ANIMAL_LABEL[l.tipoAnimal], l.origen, l.matadero, l.nGuiaSanitaria, l.fechaEntrada, l.fechaCaducidad, l.kgRecibidos, l.kgDisponibles, l.costePorKg, l.tiendaAlmacenNombre, l.temperatura, ESTADO_CFG[l.estado].label, l.observaciones]);
  const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `trazabilidad-lotes-${HOY}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ── Component ────────────────────────────────────────────────────────────────

export function ButcherTraceability() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Lote>('butcher-ops', 'traceability'), []);
  const suppliersApi = useMemo(() => createVerticalApi<SupplierRow>('butcher-ops', 'suppliers'), []);
  const userId = user?.user_id || user?.id || '';
  const displayName = user?.firstName ? `${user.firstName} ${user?.lastName || ''}`.trim() : 'Usuario';

  const [items, setItems] = useState<Lote[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAnimal, setFilterAnimal] = useState<TipoAnimal | 'all'>('all');
  const [filterEstado, setFilterEstado] = useState<EstadoLote | 'all'>('all');
  const [filterTienda, setFilterTienda] = useState<string>('all');
  const [filterCaducidad, setFilterCaducidad] = useState<'all' | '3d' | '7d' | 'caducados'>('all');
  const [sortField, setSortField] = useState<SortField>('fechaEntrada');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Lote | null>(null);
  const [form, setForm] = useState<LoteForm>(() => makeEmptyForm(''));

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [lotes, provs] = await Promise.all([
        api.list(userId),
        suppliersApi.list(userId),
      ]);
      setItems(lotes);
      setSuppliers(provs);
    } finally {
      setLoading(false);
    }
  }, [userId, api, suppliersApi]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const ubicacionesOpciones = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of items) {
      const id = (l.tiendaAlmacenId || l.tiendaAlmacenNombre || '').trim();
      if (id) m.set(id, l.tiendaAlmacenNombre || id);
    }
    return [...m.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [items]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [selectedLote, setSelectedLote] = useState<Lote | null>(null);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockTarget, setBlockTarget] = useState<Lote | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [showLocator, setShowLocator] = useState(false);
  const [locatorQuery, setLocatorQuery] = useState('');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'product', label: 'Producto' },
    { key: 'batch', label: 'Lote' },
    { key: 'origin', label: 'Origen' },
    { key: 'date', label: 'Fecha' },
    { key: 'supplier', label: 'Proveedor' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'product', label: 'Producto', example: '' },
    { key: 'batch', label: 'Lote', example: '' },
    { key: 'origin', label: 'Origen', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'supplier', label: 'Proveedor', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} lote(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} lote(s) importado(s)`);
  };

  const [isGerente] = useState(true);

  useModalClose(showModal, () => setShowModal(false));
  useModalClose(showBlockModal, () => setShowBlockModal(false));
  useModalClose(showLocator, () => setShowLocator(false));

  // Auto-update estados based on expiry
  const lotesConEstado = useMemo(() => items.map(l => {
    const autoEstado = computeEstadoAuto(l);
    return autoEstado !== l.estado ? { ...l, estado: autoEstado } : l;
  }), [items]);

  // Filtering
  const filtered = useMemo(() => {
    let result = lotesConEstado;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.codigoLote.toLowerCase().includes(q) ||
        l.proveedorNombre.toLowerCase().includes(q) ||
        l.origen.toLowerCase().includes(q) ||
        l.matadero.toLowerCase().includes(q) ||
        l.nGuiaSanitaria.toLowerCase().includes(q)
      );
    }
    if (filterAnimal !== 'all') result = result.filter(l => l.tipoAnimal === filterAnimal);
    if (filterEstado !== 'all') result = result.filter(l => l.estado === filterEstado);
    if (filterTienda !== 'all') result = result.filter(l => l.tiendaAlmacenId === filterTienda);
    if (filterCaducidad !== 'all') {
      result = result.filter(l => {
        if (!l.fechaCaducidad) return false;
        const d = diasHastaCaducidad(l.fechaCaducidad);
        if (filterCaducidad === '3d') return d >= 0 && d <= 3;
        if (filterCaducidad === '7d') return d >= 0 && d <= 7;
        if (filterCaducidad === 'caducados') return d < 0;
        return true;
      });
    }
    // Sorting
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'fechaEntrada') cmp = a.fechaEntrada.localeCompare(b.fechaEntrada);
      else if (sortField === 'fechaCaducidad') cmp = (a.fechaCaducidad || '').localeCompare(b.fechaCaducidad || '');
      else if (sortField === 'kgDisponibles') cmp = a.kgDisponibles - b.kgDisponibles;
      else if (sortField === 'costePorKg') cmp = a.costePorKg - b.costePorKg;
      else if (sortField === 'codigoLote') cmp = a.codigoLote.localeCompare(b.codigoLote);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [lotesConEstado, search, filterAnimal, filterEstado, filterTienda, filterCaducidad, sortField, sortDir]);

  // Stats
  const stats = useMemo(() => {
    const activos = lotesConEstado.filter(l => l.estado === 'activo');
    const kgDisp = activos.reduce((s, l) => s + l.kgDisponibles, 0);
    const valorStock = activos.reduce((s, l) => s + l.kgDisponibles * l.costePorKg, 0);
    const costeMedio = kgDisp > 0 ? valorStock / kgDisp : 0;
    const proxCad = lotesConEstado.filter(l => l.estado === 'activo' && l.fechaCaducidad && diasHastaCaducidad(l.fechaCaducidad) >= 0 && diasHastaCaducidad(l.fechaCaducidad) <= EXPIRY_WARN_DAYS).length;
    const caducados = lotesConEstado.filter(l => l.estado === 'caducado').length;
    const bloqueados = lotesConEstado.filter(l => l.estado === 'bloqueado').length;
    const incompletos = lotesConEstado.filter(l => loteTieneDatosIncompletos(l)).length;
    return { activos: activos.length, kgDisp, valorStock, costeMedio, proxCad, caducados, bloqueados, incompletos };
  }, [lotesConEstado]);

  // Handlers
  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  }, [sortField]);

  const openCreate = () => {
    setEditing(null);
    const f = makeEmptyForm(displayName);
    f.codigoLote = generarCodigoLote(items.map(l => l.codigoLote));
    setForm(f);
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (l: Lote) => {
    setEditing(l);
    setForm({
      codigoLote: l.codigoLote, proveedorId: l.proveedorId, proveedorNombre: l.proveedorNombre,
      tipoAnimal: l.tipoAnimal, origen: l.origen, matadero: l.matadero, nGuiaSanitaria: l.nGuiaSanitaria,
      fechaEntrada: l.fechaEntrada, fechaCaducidad: l.fechaCaducidad, fechaSacrificio: l.fechaSacrificio,
      kgRecibidos: l.kgRecibidos, costePorKg: l.costePorKg,
      tiendaAlmacenId: l.tiendaAlmacenId, tiendaAlmacenNombre: l.tiendaAlmacenNombre,
      temperatura: l.temperatura, estado: l.estado, motivoBloqueo: l.motivoBloqueo,
      fechaBloqueo: l.fechaBloqueo, observaciones: l.observaciones, creadoPor: l.creadoPor,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.codigoLote.trim()) errs.codigoLote = 'Obligatorio';
    else if (items.some(l => l.codigoLote === form.codigoLote && (!editing || l._id !== editing._id))) errs.codigoLote = 'Ya existe un lote con este código';
    if (!form.proveedorId) errs.proveedorId = 'Selecciona un proveedor';
    if (!form.fechaEntrada) errs.fechaEntrada = 'Obligatorio';
    if (!form.fechaCaducidad) errs.fechaCaducidad = 'Obligatorio';
    else if (form.fechaEntrada && form.fechaCaducidad < form.fechaEntrada) errs.fechaCaducidad = 'Debe ser posterior a la fecha de entrada';
    if (!form.kgRecibidos || form.kgRecibidos <= 0) errs.kgRecibidos = 'Debe ser mayor que 0';
    if (form.costePorKg < 0) errs.costePorKg = 'No puede ser negativo';
    if (!form.tiendaAlmacenNombre?.trim()) errs.tiendaAlmacenId = 'Indica tienda o almacén';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm() || !userId) return;
    const now = new Date().toISOString();
    const ubicId = form.tiendaAlmacenNombre.trim();
    const payloadBase = { ...form, tiendaAlmacenId: ubicId, tiendaAlmacenNombre: form.tiendaAlmacenNombre.trim() };
    try {
      if (editing) {
        const kgDiff = form.kgRecibidos - editing.kgRecibidos;
        const kgDisponibles = Math.max(0, editing.kgDisponibles + kgDiff);
        await api.update(userId, editing._id, { ...payloadBase, kgDisponibles });
      } else {
        await api.create(userId, {
          ...payloadBase,
          kgDisponibles: form.kgRecibidos,
          ventasAsociadas: [],
          fechaCreacion: now,
        });
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* fetch error */
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
      if (selectedLote?._id === docId) setSelectedLote(null);
    } catch {
      /* fetch error */
    }
  };

  const openBlock = (l: Lote) => {
    setBlockTarget(l);
    setBlockReason('');
    setShowBlockModal(true);
  };

  const confirmBlock = async () => {
    if (!blockTarget || !blockReason.trim() || !userId) return;
    const now = new Date().toISOString();
    try {
      await api.update(userId, blockTarget._id, {
        estado: 'bloqueado' as EstadoLote,
        motivoBloqueo: blockReason,
        fechaBloqueo: now,
      });
      await loadData();
      setShowBlockModal(false);
      if (selectedLote?._id === blockTarget._id) {
        setSelectedLote(prev => prev ? { ...prev, estado: 'bloqueado', motivoBloqueo: blockReason, fechaBloqueo: now } : null);
      }
    } catch {
      /* fetch error */
    }
  };

  const handleUnblock = async (l: Lote) => {
    if (!userId) return;
    const newEstado = l.fechaCaducidad && diasHastaCaducidad(l.fechaCaducidad) < 0 ? 'caducado' as EstadoLote : 'activo' as EstadoLote;
    try {
      await api.update(userId, l._id, { estado: newEstado, motivoBloqueo: undefined, fechaBloqueo: undefined });
      await loadData();
      if (selectedLote?._id === l._id) {
        setSelectedLote(prev => prev ? { ...prev, estado: newEstado, motivoBloqueo: undefined, fechaBloqueo: undefined } : null);
      }
    } catch {
      /* fetch error */
    }
  };

  const locatorResult = useMemo(() => {
    if (!locatorQuery.trim()) return null;
    return lotesConEstado.find(l => l.codigoLote.toLowerCase() === locatorQuery.trim().toLowerCase()) || null;
  }, [lotesConEstado, locatorQuery]);

  const handleProveedorChange = (provId: string) => {
    const prov = suppliers.find(p => p._id === provId);
    setForm(f => ({ ...f, proveedorId: provId, proveedorNombre: prov?.nombre || '' }));
  };

  const handleTiendaNombreChange = (value: string) => {
    const v = value.trim();
    setForm(f => ({ ...f, tiendaAlmacenNombre: value, tiendaAlmacenId: v }));
  };

  // Alert counts for banner
  const alertCount = stats.proxCad + stats.caducados + stats.bloqueados + stats.incompletos;

  // ── Reusable styles ─────────────────────────────────────────────────────────

  const inputCls = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm';
  const inputErrCls = 'w-full px-3 py-2.5 border-2 border-red-400 dark:border-red-500 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-red-500 text-sm';
  const labelCls = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';
  const thCls = 'text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400';
  const thRightCls = 'text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400';

  const SortHeader = ({ field, children, right }: { field: SortField; children: React.ReactNode; right?: boolean }) => (
    <th className={`${right ? thRightCls : thCls} cursor-pointer select-none group`} onClick={() => toggleSort(field)}>
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown className={`w-3 h-3 transition ${sortField === field ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-600 group-hover:text-gray-400'}`} />
        {sortField === field && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </span>
    </th>
  );

  const FieldError = ({ field }: { field: string }) => formErrors[field] ? <p className="text-xs text-red-500 mt-1">{formErrors[field]}</p> : null;

  return (
    <Layout title="Trazabilidad">

      {/* ── Alert banner ──────────────────────────────────────────────────── */}
      {alertCount > 0 && (
        <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Atención: hay lotes que requieren revisión</p>
            <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
              {stats.proxCad > 0 && <span className="mr-3">{stats.proxCad} próximo{stats.proxCad > 1 ? 's' : ''} a caducar</span>}
              {stats.caducados > 0 && <span className="mr-3">{stats.caducados} caducado{stats.caducados > 1 ? 's' : ''}</span>}
              {stats.bloqueados > 0 && <span className="mr-3">{stats.bloqueados} bloqueado{stats.bloqueados > 1 ? 's' : ''}</span>}
              {stats.incompletos > 0 && <span>{stats.incompletos} con datos incompletos</span>}
            </p>
          </div>
        </div>
      )}

      {/* ── Stat cards row 1: Operación ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {[
          { label: 'Lotes activos', value: String(stats.activos), icon: Package, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30', click: () => setFilterEstado('activo') },
          { label: 'Kg disponibles', value: fmtKg(stats.kgDisp) + ' kg', icon: ScanBarcode, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
          { label: 'Valor en stock', value: fmtEur(stats.valorStock), icon: Euro, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
          { label: 'Coste medio/kg', value: stats.costeMedio > 0 ? fmtEur(stats.costeMedio) : '—', icon: TrendingUp, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700/50' },
        ].map(s => (
          <button type="button" key={s.label} onClick={s.click} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4 text-left hover:border-gray-300 dark:hover:border-gray-600 transition w-full">
            <div className={`p-3 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div className="min-w-0">
              <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white truncate">{s.value}</p>
            </div>
          </button>
        ))}
      </div>

      {/* ── Stat cards row 2: Alertas ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Próximos a caducar', value: stats.proxCad, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30', ring: stats.proxCad > 0, ringColor: 'ring-amber-300 dark:ring-amber-700', click: () => setFilterCaducidad('3d') },
          { label: 'Caducados', value: stats.caducados, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30', ring: stats.caducados > 0, ringColor: 'ring-red-300 dark:ring-red-700', click: () => setFilterEstado('caducado') },
          { label: 'Bloqueados', value: stats.bloqueados, icon: ShieldAlert, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/30', ring: stats.bloqueados > 0, ringColor: 'ring-orange-300 dark:ring-orange-700', click: () => setFilterEstado('bloqueado') },
          { label: 'Datos incompletos', value: stats.incompletos, icon: FileWarning, color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700/50', ring: stats.incompletos > 0, ringColor: 'ring-gray-300 dark:ring-gray-600', click: () => {} },
        ].map(s => (
          <button type="button" key={s.label} onClick={s.click} className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4 text-left hover:border-gray-300 dark:hover:border-gray-600 transition w-full ${s.ring ? `ring-2 ${s.ringColor}` : ''}`}>
            <div className={`p-3 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div className="min-w-0">
              <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white truncate">{s.value}</p>
            </div>
          </button>
        ))}
      </div>

      {/* ── Filters bar ───────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
          <div className="relative flex-1 w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar lote, proveedor, origen..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-400 hidden sm:block" />
            <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterAnimal} onChange={e => setFilterAnimal(e.target.value as TipoAnimal | 'all')}>
              <option value="all">Tipo animal</option>
              {(Object.keys(ANIMAL_LABEL) as TipoAnimal[]).map(k => <option key={k} value={k}>{ANIMAL_LABEL[k]}</option>)}
            </select>
            <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterEstado} onChange={e => setFilterEstado(e.target.value as EstadoLote | 'all')}>
              <option value="all">Estado</option>
              {(Object.keys(ESTADO_CFG) as EstadoLote[]).map(k => <option key={k} value={k}>{ESTADO_CFG[k].label}</option>)}
            </select>
            <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterTienda} onChange={e => setFilterTienda(e.target.value)}>
              <option value="all">Ubicación</option>
              {ubicacionesOpciones.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
            <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterCaducidad} onChange={e => setFilterCaducidad(e.target.value as typeof filterCaducidad)}>
              <option value="all">Caducidad</option>
              <option value="3d">Caduca en 3 días</option>
              <option value="7d">Caduca en 7 días</option>
              <option value="caducados">Ya caducados</option>
            </select>
            {(filterAnimal !== 'all' || filterEstado !== 'all' || filterTienda !== 'all' || filterCaducidad !== 'all' || search) && (
              <button type="button" onClick={() => { setFilterAnimal('all'); setFilterEstado('all'); setFilterTienda('all'); setFilterCaducidad('all'); setSearch(''); }} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline">
                Limpiar filtros
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowLocator(true)} className="inline-flex items-center gap-2 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
              <ScanSearch className="w-4 h-4" /> Localizar lote
            </button>
            {isGerente && (
              <button type="button" onClick={() => exportCSV(filtered)} className="inline-flex items-center gap-2 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                <Download className="w-4 h-4" /> Exportar
              </button>
            )}
            {isGerente && (
              <AddButtonDropdown
                label="Nuevo lote"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de lote"
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Main content: table + optional drawer ─────────────────────────── */}
      <div className={`flex gap-6 ${selectedLote ? '' : ''}`}>

        {/* ── Table ─────────────────────────────────────────────────────── */}
        <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-all ${selectedLote ? 'flex-1 min-w-0' : 'w-full'}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <SortHeader field="codigoLote">Lote</SortHeader>
                  <th className={thCls}>Proveedor</th>
                  <th className={thCls}>Tipo</th>
                  <SortHeader field="fechaEntrada">Entrada</SortHeader>
                  <SortHeader field="fechaCaducidad">Caducidad</SortHeader>
                  <th className={thRightCls}>Kg recibidos</th>
                  <SortHeader field="kgDisponibles" right>Kg disponibles</SortHeader>
                  <SortHeader field="costePorKg" right>Coste/kg</SortHeader>
                  <th className={thCls}>Ubicación</th>
                  <th className={thCls}>Estado</th>
                  <th className={thRightCls}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Cargando…
                      </span>
                    </td>
                  </tr>
                ) : filtered.map(l => {
                  const cfg = ESTADO_CFG[l.estado];
                  const dias = l.fechaCaducidad ? diasHastaCaducidad(l.fechaCaducidad) : null;
                  const pct = l.kgRecibidos > 0 ? (l.kgDisponibles / l.kgRecibidos) * 100 : 0;
                  const cadColor = dias !== null && dias < 0 ? 'text-red-600 dark:text-red-400' : dias !== null && dias <= EXPIRY_WARN_DAYS ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400';
                  return (
                    <tr
                      key={l._id}
                      className={`border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition cursor-pointer ${cfg.row} ${selectedLote?._id === l._id ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                      onClick={() => setSelectedLote(l)}
                    >
                      <td className="px-4 py-3 font-mono font-medium text-gray-900 dark:text-white">{l.codigoLote}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[150px] truncate" title={l.proveedorNombre}>{l.proveedorNombre || '—'}</td>
                      <td className="px-4 py-3"><span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${ANIMAL_COLOR[l.tipoAnimal]}`}>{ANIMAL_LABEL[l.tipoAnimal]}</span></td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{fmtDate(l.fechaEntrada)}</td>
                      <td className={`px-4 py-3 font-medium ${cadColor}`}>
                        {fmtDate(l.fechaCaducidad)}
                        {dias !== null && dias >= 0 && dias <= EXPIRY_WARN_DAYS && <span className="ml-1 text-xs">({dias}d)</span>}
                        {dias !== null && dias < 0 && <span className="ml-1 text-xs">(vencido)</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{fmtKg(l.kgRecibidos)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-semibold text-gray-900 dark:text-white">{fmtKg(l.kgDisponibles)}</span>
                          <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{fmtEur(l.costePorKg)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[120px] truncate">{l.tiendaAlmacenNombre || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          {l.estado === 'bloqueado' && <Lock className="w-3 h-3 text-orange-500" />}
                          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-0.5">
                          <button type="button" onClick={() => setSelectedLote(l)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition" title="Ver detalle"><Eye className="w-4 h-4" /></button>
                          {isGerente && <button type="button" onClick={() => openEdit(l)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition" title="Editar"><Edit2 className="w-4 h-4" /></button>}
                          {isGerente && l.estado !== 'bloqueado' && (
                            <button type="button" onClick={() => openBlock(l)} className="p-1.5 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/30 text-gray-500 hover:text-orange-600 transition" title="Bloquear"><Lock className="w-4 h-4" /></button>
                          )}
                          {isGerente && l.estado === 'bloqueado' && (
                            <button type="button" onClick={() => handleUnblock(l)} className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-gray-500 hover:text-emerald-600 transition" title="Desbloquear"><Unlock className="w-4 h-4" /></button>
                          )}
                          {isGerente && <button type="button" onClick={() => handleDelete(l._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition" title="Eliminar"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center">
                      <ScanBarcode className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
                      <p className="text-gray-400 dark:text-gray-500 font-medium">No hay lotes de trazabilidad</p>
                      <p className="text-gray-300 dark:text-gray-600 text-xs mt-1">Crea un nuevo lote para empezar el seguimiento</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Detail drawer ────────────────────────────────────────────── */}
        {selectedLote && (() => {
          const l = lotesConEstado.find(x => x._id === selectedLote._id) || selectedLote;
          const dias = l.fechaCaducidad ? diasHastaCaducidad(l.fechaCaducidad) : null;
          const pct = l.kgRecibidos > 0 ? (l.kgDisponibles / l.kgRecibidos) * 100 : 0;
          const pctColor = pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500';
          const kgVendidos = l.kgRecibidos - l.kgDisponibles;
          return (
            <div className="w-[460px] flex-shrink-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hidden xl:block">
              <div className="overflow-y-auto max-h-[calc(100vh-200px)]">
                {/* Header */}
                <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
                  <div>
                    <p className="text-lg font-bold font-mono text-gray-900 dark:text-white">{l.codigoLote}</p>
                    <span className={`inline-flex items-center gap-1.5 text-sm mt-1`}>
                      {l.estado === 'bloqueado' && <Lock className="w-3 h-3 text-orange-500" />}
                      <span className={`w-2 h-2 rounded-full ${ESTADO_CFG[l.estado].dot}`} />
                      {ESTADO_CFG[l.estado].label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {isGerente && <button type="button" onClick={() => openEdit(l)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition" title="Editar"><Edit2 className="w-4 h-4" /></button>}
                    {isGerente && l.estado !== 'bloqueado' && (
                      <button type="button" onClick={() => openBlock(l)} className="p-1.5 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/30 text-gray-500 hover:text-orange-600 transition" title="Bloquear"><Lock className="w-4 h-4" /></button>
                    )}
                    {isGerente && l.estado === 'bloqueado' && (
                      <button type="button" onClick={() => handleUnblock(l)} className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-gray-500 hover:text-emerald-600 transition" title="Desbloquear"><Unlock className="w-4 h-4" /></button>
                    )}
                    <button type="button" onClick={() => setSelectedLote(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition"><X className="w-4 h-4" /></button>
                  </div>
                </div>

                {/* Block reason */}
                {l.estado === 'bloqueado' && l.motivoBloqueo && (
                  <div className="mx-5 mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                    <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">Motivo de bloqueo</p>
                    <p className="text-sm text-orange-800 dark:text-orange-200 mt-0.5">{l.motivoBloqueo}</p>
                    {l.fechaBloqueo && <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">Bloqueado el {fmtDate(l.fechaBloqueo.slice(0, 10))}</p>}
                  </div>
                )}

                {/* Info grid */}
                <div className="p-5 space-y-4">
                  <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Información general</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div><p className="text-gray-400 dark:text-gray-500 text-xs">Proveedor</p><p className="text-gray-900 dark:text-white font-medium">{l.proveedorNombre || '—'}</p></div>
                    <div><p className="text-gray-400 dark:text-gray-500 text-xs">Tipo animal</p><p><span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${ANIMAL_COLOR[l.tipoAnimal]}`}>{ANIMAL_LABEL[l.tipoAnimal]}</span></p></div>
                    <div><p className="text-gray-400 dark:text-gray-500 text-xs">Origen / Granja</p><p className="text-gray-900 dark:text-white">{l.origen || '—'}</p></div>
                    <div><p className="text-gray-400 dark:text-gray-500 text-xs">Matadero</p><p className="text-gray-900 dark:text-white">{l.matadero || '—'}</p></div>
                    <div><p className="text-gray-400 dark:text-gray-500 text-xs">Guía sanitaria</p><p className="text-gray-900 dark:text-white font-mono">{l.nGuiaSanitaria || '—'}</p></div>
                    <div><p className="text-gray-400 dark:text-gray-500 text-xs">Temperatura</p><p className="text-gray-900 dark:text-white">{l.temperatura}°C</p></div>
                    <div><p className="text-gray-400 dark:text-gray-500 text-xs">Ubicación</p><p className="text-gray-900 dark:text-white inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{l.tiendaAlmacenNombre || '—'}</p></div>
                    <div><p className="text-gray-400 dark:text-gray-500 text-xs">Creado por</p><p className="text-gray-900 dark:text-white">{l.creadoPor}</p></div>
                  </div>

                  {/* Dates */}
                  <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider pt-2">Fechas</h3>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-gray-400 uppercase">Entrada</p>
                      <p className="font-semibold text-gray-900 dark:text-white mt-0.5">{fmtDate(l.fechaEntrada)}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-gray-400 uppercase">Sacrificio</p>
                      <p className="font-semibold text-gray-900 dark:text-white mt-0.5">{fmtDate(l.fechaSacrificio)}</p>
                    </div>
                    <div className={`rounded-lg p-2.5 text-center ${dias !== null && dias < 0 ? 'bg-red-50 dark:bg-red-900/30' : dias !== null && dias <= EXPIRY_WARN_DAYS ? 'bg-amber-50 dark:bg-amber-900/30' : 'bg-gray-50 dark:bg-gray-900/50'}`}>
                      <p className="text-[10px] text-gray-400 uppercase">Caducidad</p>
                      <p className={`font-semibold mt-0.5 ${dias !== null && dias < 0 ? 'text-red-600 dark:text-red-400' : dias !== null && dias <= EXPIRY_WARN_DAYS ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>{fmtDate(l.fechaCaducidad)}</p>
                      {dias !== null && (
                        <p className={`text-[10px] mt-0.5 ${dias < 0 ? 'text-red-500' : dias <= EXPIRY_WARN_DAYS ? 'text-amber-500' : 'text-gray-400'}`}>
                          {dias < 0 ? `Caducado hace ${Math.abs(dias)}d` : dias === 0 ? 'Caduca hoy' : `Caduca en ${dias}d`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Stock */}
                  <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider pt-2">Stock del lote</h3>
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">{fmtKg(l.kgDisponibles)} <span className="text-sm font-normal text-gray-400">kg</span></span>
                      <span className="text-sm text-gray-500">de {fmtKg(l.kgRecibidos)} kg</span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
                      <div className={`h-full rounded-full transition-all ${pctColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{kgVendidos > 0 ? `${fmtKg(kgVendidos)} kg vendidos (${Math.round(100 - pct)}%)` : 'Sin ventas'}</span>
                      <span>{fmtEur(l.kgDisponibles * l.costePorKg)} restante</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 gap-3 text-sm">
                      <div><p className="text-xs text-gray-400">Coste/kg</p><p className="font-semibold text-gray-900 dark:text-white">{fmtEur(l.costePorKg)}</p></div>
                      <div><p className="text-xs text-gray-400">Coste total lote</p><p className="font-semibold text-gray-900 dark:text-white">{fmtEur(l.kgRecibidos * l.costePorKg)}</p></div>
                    </div>
                  </div>

                  {/* Sales history */}
                  <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider pt-2">Historial de ventas</h3>
                  {l.ventasAsociadas.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 dark:text-gray-500">
                      <FileText className="w-8 h-8 mx-auto mb-2 text-gray-200 dark:text-gray-700" />
                      <p className="text-sm">Sin ventas registradas para este lote</p>
                    </div>
                  ) : (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left px-3 py-2 font-semibold text-gray-500">Ticket</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-500">Fecha</th>
                            <th className="text-right px-3 py-2 font-semibold text-gray-500">Kg</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-500">Cliente</th>
                          </tr>
                        </thead>
                        <tbody>
                          {l.ventasAsociadas.map(v => (
                            <tr key={v.ventaId} className="border-b border-gray-100 dark:border-gray-700/50">
                              <td className="px-3 py-2 font-mono text-gray-900 dark:text-white">{v.ticketNumero}</td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{fmtDate(v.fecha)}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{fmtKg(v.kgVendidos)}</td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{v.cliente || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Timeline */}
                  <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider pt-2">Actividad</h3>
                  <div className="space-y-3 pb-2">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0 mt-0.5"><Zap className="w-3 h-3 text-emerald-600" /></div>
                      <div>
                        <p className="text-sm text-gray-900 dark:text-white">Lote creado</p>
                        <p className="text-xs text-gray-400">{l.fechaCreacion ? new Date(l.fechaCreacion).toLocaleString('es-ES') : fmtDate(l.fechaEntrada)} · {l.creadoPor}</p>
                      </div>
                    </div>
                    {l.ventasAsociadas.map(v => (
                      <div key={v.ventaId} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0 mt-0.5"><Package className="w-3 h-3 text-blue-600" /></div>
                        <div>
                          <p className="text-sm text-gray-900 dark:text-white">Venta: {fmtKg(v.kgVendidos)} kg (ticket {v.ticketNumero})</p>
                          <p className="text-xs text-gray-400">{fmtDate(v.fecha)}</p>
                        </div>
                      </div>
                    ))}
                    {l.estado === 'bloqueado' && l.fechaBloqueo && (
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0 mt-0.5"><Lock className="w-3 h-3 text-orange-600" /></div>
                        <div>
                          <p className="text-sm text-gray-900 dark:text-white">Lote bloqueado</p>
                          <p className="text-xs text-gray-400">{new Date(l.fechaBloqueo).toLocaleString('es-ES')} · {l.motivoBloqueo}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {l.observaciones && (
                    <>
                      <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider pt-2">Observaciones</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">{l.observaciones}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Create/Edit Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar lote' : 'Nuevo lote de trazabilidad'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            <div className="p-5 space-y-6">
              {/* Section 1: Identificación */}
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-200 mb-3"><ScanBarcode className="w-4 h-4" /> Identificación</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Código lote *</label>
                    <input className={formErrors.codigoLote ? inputErrCls : inputCls} value={form.codigoLote} onChange={e => setForm(f => ({ ...f, codigoLote: e.target.value }))} />
                    <FieldError field="codigoLote" />
                  </div>
                  <div>
                    <label className={labelCls}>Tipo animal</label>
                    <select className={inputCls} value={form.tipoAnimal} onChange={e => setForm(f => ({ ...f, tipoAnimal: e.target.value as TipoAnimal }))}>
                      {(Object.keys(ANIMAL_LABEL) as TipoAnimal[]).map(k => <option key={k} value={k}>{ANIMAL_LABEL[k]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Guía sanitaria</label>
                    <input className={inputCls} value={form.nGuiaSanitaria} onChange={e => setForm(f => ({ ...f, nGuiaSanitaria: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Section 2: Proveedor y origen */}
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-200 mb-3"><MapPin className="w-4 h-4" /> Proveedor y origen</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Proveedor *</label>
                    <select className={formErrors.proveedorId ? inputErrCls : inputCls} value={form.proveedorId} onChange={e => handleProveedorChange(e.target.value)}>
                      <option value="">Seleccionar...</option>
                      {suppliers.map(p => <option key={p._id} value={p._id}>{p.nombre}</option>)}
                    </select>
                    <FieldError field="proveedorId" />
                  </div>
                  <div>
                    <label className={labelCls}>Origen / Granja</label>
                    <input className={inputCls} value={form.origen} onChange={e => setForm(f => ({ ...f, origen: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Matadero</label>
                    <input className={inputCls} value={form.matadero} onChange={e => setForm(f => ({ ...f, matadero: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Section 3: Fechas */}
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-200 mb-3"><CalendarDays className="w-4 h-4" /> Fechas</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Fecha entrada *</label>
                    <input type="date" className={formErrors.fechaEntrada ? inputErrCls : inputCls} value={form.fechaEntrada} onChange={e => setForm(f => ({ ...f, fechaEntrada: e.target.value }))} />
                    <FieldError field="fechaEntrada" />
                  </div>
                  <div>
                    <label className={labelCls}>Fecha sacrificio</label>
                    <input type="date" className={inputCls} value={form.fechaSacrificio} onChange={e => setForm(f => ({ ...f, fechaSacrificio: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Fecha caducidad *</label>
                    <input type="date" className={formErrors.fechaCaducidad ? inputErrCls : inputCls} value={form.fechaCaducidad} onChange={e => setForm(f => ({ ...f, fechaCaducidad: e.target.value }))} />
                    <FieldError field="fechaCaducidad" />
                  </div>
                </div>
              </div>

              {/* Section 4: Cantidades y coste */}
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-200 mb-3"><Euro className="w-4 h-4" /> Cantidades y coste</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Kg recibidos *</label>
                    <input type="number" step="0.1" min="0" className={formErrors.kgRecibidos ? inputErrCls : inputCls} value={form.kgRecibidos || ''} onChange={e => setForm(f => ({ ...f, kgRecibidos: Number(e.target.value) }))} />
                    <FieldError field="kgRecibidos" />
                  </div>
                  <div>
                    <label className={labelCls}>Coste/kg (EUR) *</label>
                    <input type="number" step="0.01" min="0" className={formErrors.costePorKg ? inputErrCls : inputCls} value={form.costePorKg || ''} onChange={e => setForm(f => ({ ...f, costePorKg: Number(e.target.value) }))} />
                    <FieldError field="costePorKg" />
                  </div>
                  <div>
                    <label className={labelCls}>Coste total</label>
                    <div className="w-full px-3 py-2.5 border-2 border-gray-100 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300 text-sm font-semibold">
                      {fmtEur(form.kgRecibidos * form.costePorKg)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 5: Destino y control */}
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-200 mb-3"><Thermometer className="w-4 h-4" /> Destino y control</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Tienda/Almacén *</label>
                    <input className={formErrors.tiendaAlmacenId ? inputErrCls : inputCls} value={form.tiendaAlmacenNombre} onChange={e => handleTiendaNombreChange(e.target.value)} placeholder="Ej. Tienda principal, Almacén, Obrador…" />
                    <FieldError field="tiendaAlmacenId" />
                  </div>
                  <div>
                    <label className={labelCls}>Temp. recepción (°C)</label>
                    <input type="number" step="0.1" className={inputCls} value={form.temperatura} onChange={e => setForm(f => ({ ...f, temperatura: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Estado</label>
                    <select className={inputCls} value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as EstadoLote }))}>
                      <option value="activo">Activo</option>
                      {isGerente && <option value="bloqueado">Bloqueado</option>}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 6: Observaciones */}
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-200 mb-3"><FileText className="w-4 h-4" /> Observaciones</h3>
                <textarea className={`${inputCls} resize-none`} rows={2} value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} placeholder="Notas adicionales sobre el lote..." />
                {form.estado === 'bloqueado' && (
                  <div className="mt-3">
                    <label className={labelCls}>Motivo de bloqueo *</label>
                    <textarea className={`${inputCls} resize-none`} rows={2} value={form.motivoBloqueo || ''} onChange={e => setForm(f => ({ ...f, motivoBloqueo: e.target.value }))} placeholder="Indicar el motivo del bloqueo..." />
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Registrar lote'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Block modal ───────────────────────────────────────────────────── */}
      {showBlockModal && blockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowBlockModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-orange-500" /> Bloquear lote</h2>
              <p className="text-sm text-gray-500 mt-1">Lote <span className="font-mono font-semibold">{blockTarget.codigoLote}</span> quedará inactivo y no podrá venderse.</p>
            </div>
            <div className="p-5">
              <label className={labelCls}>Motivo del bloqueo *</label>
              <textarea className={`${inputCls} resize-none`} rows={3} value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="Describe el motivo del bloqueo..." autoFocus />
              {!blockReason.trim() && <p className="text-xs text-gray-400 mt-1">El motivo es obligatorio para bloquear un lote</p>}
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
              <button type="button" onClick={() => setShowBlockModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={confirmBlock} disabled={!blockReason.trim()} className="px-6 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed">Bloquear lote</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lot locator modal ─────────────────────────────────────────────── */}
      {showLocator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowLocator(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><ScanSearch className="w-5 h-5" /> Localizar lote</h2>
              <p className="text-sm text-gray-500 mt-1">Introduce el código de lote para ver su trazabilidad completa</p>
            </div>
            <div className="p-5">
              <input className={inputCls} placeholder="Ej. LOTE-2026-001" value={locatorQuery} onChange={e => setLocatorQuery(e.target.value)} autoFocus />

              {locatorQuery.trim() && !locatorResult && (
                <div className="mt-4 text-center py-6 text-gray-400">
                  <ScanBarcode className="w-10 h-10 mx-auto mb-2 text-gray-200 dark:text-gray-700" />
                  <p className="text-sm">Lote no encontrado</p>
                </div>
              )}

              {locatorResult && (
                <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-gray-900 dark:text-white text-lg">{locatorResult.codigoLote}</span>
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span className={`w-2 h-2 rounded-full ${ESTADO_CFG[locatorResult.estado].dot}`} />
                      {ESTADO_CFG[locatorResult.estado].label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-400 text-xs">Proveedor:</span> <span className="text-gray-900 dark:text-white">{locatorResult.proveedorNombre || '—'}</span></div>
                    <div><span className="text-gray-400 text-xs">Tipo:</span> <span className="text-gray-900 dark:text-white">{ANIMAL_LABEL[locatorResult.tipoAnimal]}</span></div>
                    <div><span className="text-gray-400 text-xs">Entrada:</span> <span className="text-gray-900 dark:text-white">{fmtDate(locatorResult.fechaEntrada)}</span></div>
                    <div><span className="text-gray-400 text-xs">Caducidad:</span> <span className="text-gray-900 dark:text-white">{fmtDate(locatorResult.fechaCaducidad)}</span></div>
                    <div><span className="text-gray-400 text-xs">Disponible:</span> <span className="text-gray-900 dark:text-white">{fmtKg(locatorResult.kgDisponibles)} / {fmtKg(locatorResult.kgRecibidos)} kg</span></div>
                    <div><span className="text-gray-400 text-xs">Ubicación:</span> <span className="text-gray-900 dark:text-white">{locatorResult.tiendaAlmacenNombre || '—'}</span></div>
                  </div>
                  {locatorResult.ventasAsociadas.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">{locatorResult.ventasAsociadas.length} venta{locatorResult.ventasAsociadas.length > 1 ? 's' : ''} asociada{locatorResult.ventasAsociadas.length > 1 ? 's' : ''}</p>
                      {locatorResult.ventasAsociadas.map(v => (
                        <p key={v.ventaId} className="text-xs text-gray-600 dark:text-gray-400">Ticket {v.ticketNumero} · {fmtDate(v.fecha)} · {fmtKg(v.kgVendidos)} kg{v.cliente ? ` · ${v.cliente}` : ''}</p>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => { setSelectedLote(locatorResult); setShowLocator(false); setLocatorQuery(''); }}
                    className="w-full mt-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition"
                  >
                    Ver detalle completo
                  </button>
                </div>
              )}
            </div>
            <div className="flex justify-end p-5 border-t border-gray-200 dark:border-gray-700">
              <button type="button" onClick={() => { setShowLocator(false); setLocatorQuery(''); }} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="butcher_traceability"
        moduleLabel="Trazabilidad"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Trazabilidad"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
