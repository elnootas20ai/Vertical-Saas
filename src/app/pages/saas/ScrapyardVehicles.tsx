import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { SCRAPYARD_VEHICLE_STATUS_MAP } from '../../lib/scrapyardApi';
import {
  listVehiclesRequest,
  createVehicleRequest,
  updateVehicleRequest,
  deleteVehicleRequest,
} from '../../lib/vehicleApi';
import type { Vehicle } from '../../context/AppContext';
import {
  Car, Plus, Search, Filter, LayoutGrid, List, Package,
  Wrench, CheckCircle, Archive, ChevronRight, X, Fuel, Gauge,
  Calendar, Edit2, Trash2, Play, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';

import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
const SCRAPYARD_STATUSES = ['received', 'dismantling', 'partially_dismantled', 'fully_dismantled', 'compacted'] as const;
type ScrapyardStatus = (typeof SCRAPYARD_STATUSES)[number];

const PROCEDENCIAS = [
  { value: 'particular', label: 'Particular' },
  { value: 'aseguradora', label: 'Aseguradora' },
  { value: 'empresa', label: 'Empresa' },
  { value: 'subasta', label: 'Subasta' },
  { value: 'grua_municipal', label: 'Grúa municipal' },
  { value: 'otro', label: 'Otro' },
];

const FUEL_TYPES = [
  { value: 'gasolina', label: 'Gasolina' },
  { value: 'diesel', label: 'Diésel' },
  { value: 'hibrido', label: 'Híbrido' },
  { value: 'electrico', label: 'Eléctrico' },
  { value: 'glp', label: 'GLP' },
  { value: 'otro', label: 'Otro' },
];

function isScrapyardVehicle(v: Vehicle): boolean {
  return SCRAPYARD_STATUSES.includes(v.status as ScrapyardStatus);
}

function KpiCard({ icon, value, label, bg }: { icon: React.ReactNode; value: string | number; label: string; bg: string }) {
  return (
    <div className={`${bg} rounded-xl p-4 flex items-center gap-4`}>
      <div className="p-2.5 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  const color = clamped < 30 ? 'bg-red-500' : clamped < 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-8 text-right">{clamped}%</span>
    </div>
  );
}

interface FilterState {
  status: string;
  procedencia: string;
  fechaDesde: string;
  fechaHasta: string;
}

const EMPTY_FILTERS: FilterState = { status: '', procedencia: '', fechaDesde: '', fechaHasta: '' };

function FilterDrawer({ isOpen, onClose, filters, onChange }: {
  isOpen: boolean; onClose: () => void; filters: FilterState; onChange: (f: FilterState) => void;
}) {
  if (!isOpen) return null;
  const set = (key: keyof FilterState, val: string) => onChange({ ...filters, [key]: val });
  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 shadow-2xl h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
            {activeCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">{activeCount}</span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Estado</label>
            <select value={filters.status} onChange={e => set('status', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100">
              <option value="">Todos</option>
              {SCRAPYARD_STATUSES.map(s => (
                <option key={s} value={s}>{SCRAPYARD_VEHICLE_STATUS_MAP[s]?.label || s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Procedencia</label>
            <select value={filters.procedencia} onChange={e => set('procedencia', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100">
              <option value="">Todas</option>
              {PROCEDENCIAS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Desde</label>
              <input type="date" value={filters.fechaDesde} onChange={e => set('fechaDesde', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Hasta</label>
              <input type="date" value={filters.fechaHasta} onChange={e => set('fechaHasta', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => onChange(EMPTY_FILTERS)} className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Limpiar</button>
            <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">Aplicar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RowSkeleton() {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-700/50">
      {Array.from({ length: 9 }).map((_, i) => (
        <td key={i} className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" style={{ width: `${50 + Math.random() * 40}%` }} /></td>
      ))}
    </tr>
  );
}

interface VehicleFormData {
  registrationPlate: string;
  brand: string;
  model: string;
  year: number;
  vin: string;
  fuelType: string;
  mileage: number;
  purchasePrice: number;
  origin: string;
  status: string;
  notes: string;
}

const EMPTY_FORM: VehicleFormData = {
  registrationPlate: '', brand: '', model: '', year: new Date().getFullYear(),
  vin: '', fuelType: 'diesel', mileage: 0, purchasePrice: 0,
  origin: 'particular', status: 'received', notes: '',
};

function VehicleModal({ isOpen, onClose, onSave, editVehicle }: {
  isOpen: boolean; onClose: () => void;
  onSave: (data: VehicleFormData) => Promise<void>;
  editVehicle: Vehicle | null;
}) {
  const [form, setForm] = useState<VehicleFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editVehicle) {
        setForm({
          registrationPlate: editVehicle.registrationPlate || '',
          brand: editVehicle.brand || '',
          model: editVehicle.model || '',
          year: editVehicle.year || new Date().getFullYear(),
          vin: editVehicle.vin || '',
          fuelType: editVehicle.fuelType || 'diesel',
          mileage: editVehicle.mileage || 0,
          purchasePrice: editVehicle.purchasePrice || 0,
          origin: editVehicle.origin || 'particular',
          status: editVehicle.status || 'received',
          notes: editVehicle.notes || '',
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [isOpen, editVehicle]);

  if (!isOpen) return null;

  const set = (key: keyof VehicleFormData, val: string | number) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.registrationPlate || !form.brand || !form.model || !form.year) {
      toast.error('Completa los campos obligatorios');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {editVehicle ? 'Editar vehículo' : 'Nuevo vehículo'}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Matrícula *</label>
              <input value={form.registrationPlate} onChange={e => set('registrationPlate', e.target.value.toUpperCase())} className={inputClass} required />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">VIN</label>
              <input value={form.vin} onChange={e => set('vin', e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Marca *</label>
              <input value={form.brand} onChange={e => set('brand', e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Modelo *</label>
              <input value={form.model} onChange={e => set('model', e.target.value)} className={inputClass} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Año *</label>
              <input type="number" value={form.year} onChange={e => set('year', parseInt(e.target.value) || 0)} className={inputClass} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Combustible</label>
              <select value={form.fuelType} onChange={e => set('fuelType', e.target.value)} className={inputClass}>
                {FUEL_TYPES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kilómetros</label>
              <input type="number" value={form.mileage} onChange={e => set('mileage', parseInt(e.target.value) || 0)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio compra</label>
              <input type="number" value={form.purchasePrice} onChange={e => set('purchasePrice', parseFloat(e.target.value) || 0)} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Procedencia</label>
              <select value={form.origin} onChange={e => set('origin', e.target.value)} className={inputClass}>
                {PROCEDENCIAS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inputClass}>
                {SCRAPYARD_STATUSES.map(s => (
                  <option key={s} value={s}>{SCRAPYARD_VEHICLE_STATUS_MAP[s]?.label || s}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observaciones</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} className={inputClass} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Guardando...' : editVehicle ? 'Guardar cambios' : 'Crear vehículo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ScrapyardVehicles() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id || '';

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [page, setPage] = useState(1);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'plate', label: 'Matrícula' },
    { key: 'brand', label: 'Marca' },
    { key: 'model', label: 'Modelo' },
    { key: 'year', label: 'Año' },
    { key: 'date', label: 'Fecha entrada' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'plate', label: 'Matrícula', required: true, example: '' },
    { key: 'brand', label: 'Marca', example: '' },
    { key: 'model', label: 'Modelo', example: '' },
    { key: 'year', label: 'Año', example: '' },
    { key: 'date', label: 'Fecha entrada', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} vehículo(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} vehículo(s) importado(s)`);
  };

  const perPage = 25;

  const loadVehicles = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listVehiclesRequest(userId);
      const all = res.vehicles || [];
      setVehicles(all.filter(isScrapyardVehicle));
    } catch (err: any) {
      setError(err?.message || 'Error al cargar vehículos');
      toast.error('Error al cargar vehículos');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadVehicles(); }, [loadVehicles]);

  const handleSave = useCallback(async (data: VehicleFormData) => {
    if (!userId) return;
    const payload: Partial<Vehicle> = {
      registrationPlate: data.registrationPlate,
      brand: data.brand,
      model: data.model,
      year: data.year,
      vin: data.vin || undefined,
      fuelType: data.fuelType as Vehicle['fuelType'],
      mileage: data.mileage,
      purchasePrice: data.purchasePrice,
      origin: data.origin as Vehicle['origin'],
      status: data.status as Vehicle['status'],
      notes: data.notes || undefined,
    };

    if (editVehicle) {
      await updateVehicleRequest(userId, editVehicle.id, payload);
      toast.success('Vehículo actualizado');
    } else {
      await createVehicleRequest(userId, payload);
      toast.success('Vehículo creado');
    }
    setEditVehicle(null);
    loadVehicles();
  }, [userId, editVehicle, loadVehicles]);

  const handleDelete = useCallback(async (vehicleId: string) => {
    if (!userId) return;
    if (!window.confirm('¿Eliminar este vehículo?')) return;
    try {
      await deleteVehicleRequest(userId, vehicleId);
      toast.success('Vehículo eliminado');
      loadVehicles();
    } catch (err: any) {
      toast.error(err?.message || 'Error al eliminar');
    }
  }, [userId, loadVehicles]);

  const filtered = useMemo(() => {
    let result = [...vehicles];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(v =>
        v.registrationPlate.toLowerCase().includes(q) ||
        v.brand.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        (v.vin || '').toLowerCase().includes(q)
      );
    }
    if (filters.status) result = result.filter(v => v.status === filters.status);
    if (filters.procedencia) result = result.filter(v => v.origin === filters.procedencia);
    if (filters.fechaDesde) result = result.filter(v => (v.purchaseDate || v.createdAt || '') >= filters.fechaDesde);
    if (filters.fechaHasta) result = result.filter(v => (v.purchaseDate || v.createdAt || '') <= filters.fechaHasta);

    result.sort((a, b) => ((b.purchaseDate || b.createdAt || '') as string).localeCompare((a.purchaseDate || a.createdAt || '') as string));
    return result;
  }, [vehicles, search, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const receivedCount = vehicles.filter(v => v.status === 'received').length;
  const dismantlingCount = vehicles.filter(v => v.status === 'dismantling' || v.status === 'partially_dismantled').length;
  const fullyDismantledCount = vehicles.filter(v => v.status === 'fully_dismantled').length;
  const compactedCount = vehicles.filter(v => v.status === 'compacted').length;

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const getStatusStyle = (status: string) => SCRAPYARD_VEHICLE_STATUS_MAP[status]?.color || 'bg-gray-100 text-gray-600';
  const getStatusLabel = (status: string) => SCRAPYARD_VEHICLE_STATUS_MAP[status]?.label || status;
  const getOriginLabel = (origin: string) => PROCEDENCIAS.find(p => p.value === origin)?.label || origin || '—';
  const getEntryDate = (v: Vehicle) => (v.purchaseDate || (v as any).createdAt || '').slice(0, 10);

  return (
    <Layout title="Vehículos de Desguace">
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={<Car className="w-5 h-5 text-blue-500" />} value={receivedCount} label="Vehículos recibidos" bg="bg-blue-50 dark:bg-blue-900/30" />
          <KpiCard icon={<Wrench className="w-5 h-5 text-amber-500" />} value={dismantlingCount} label="En despiece" bg="bg-amber-50 dark:bg-amber-900/30" />
          <KpiCard icon={<CheckCircle className="w-5 h-5 text-emerald-500" />} value={fullyDismantledCount} label="Despiezados" bg="bg-emerald-50 dark:bg-emerald-900/30" />
          <KpiCard icon={<Archive className="w-5 h-5 text-gray-500" />} value={compactedCount} label="Compactados" bg="bg-gray-100 dark:bg-gray-700/30" />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por matrícula, marca, modelo o VIN..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <button
              onClick={() => setShowFilters(true)}
              className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                activeFilterCount > 0
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filtros
              {activeFilterCount > 0 && <span className="px-1.5 py-0.5 text-xs font-bold rounded-full bg-blue-600 text-white">{activeFilterCount}</span>}
            </button>
            <div className="flex border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <button onClick={() => setViewMode('table')} className={`p-2 transition-colors ${viewMode === 'table' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100' : 'text-gray-400 hover:text-gray-600'}`}>
                <List className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('cards')} className={`p-2 transition-colors ${viewMode === 'cards' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100' : 'text-gray-400 hover:text-gray-600'}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            <AddButtonDropdown
                label="Nueva Entrada"
                onQuickAdd={() => { setEditVehicle(null); setShowModal(true); }}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de vehículo"
              />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
            <button onClick={loadVehicles} className="ml-3 underline font-medium">Reintentar</button>
          </div>
        )}

        {loading && vehicles.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  {['Vehículo', 'Matrícula', 'Año', 'Km', 'Precio', 'Procedencia', 'Estado', 'Progreso', 'Entrada'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>{Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)}</tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
            <Car className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {search || activeFilterCount > 0 ? 'Sin resultados' : 'Sin vehículos registrados'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
              {search || activeFilterCount > 0
                ? 'No se encontraron vehículos con los criterios actuales.'
                : 'Registra el primer vehículo de entrada al desguace para empezar.'}
            </p>
            {!search && activeFilterCount === 0 && (
              <button onClick={() => { setEditVehicle(null); setShowModal(true); }} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
                <Plus className="w-4 h-4" /> Registrar primer vehículo
              </button>
            )}
          </div>
        ) : viewMode === 'table' ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Vehículo</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Matrícula</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Año</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Precio</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden xl:table-cell">Procedencia</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Estado</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Progreso</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Entrada</th>
                  <th className="w-24 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(v => (
                  <tr key={v.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{v.brand} {v.model}</div>
                      {v.version && <div className="text-xs text-gray-500 dark:text-gray-400">{v.version}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-gray-900 dark:text-gray-100">{v.registrationPlate}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{v.year}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">{v.purchasePrice?.toLocaleString('es-ES')} €</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hidden xl:table-cell">{getOriginLabel(v.origin || '')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStatusStyle(v.status)}`}>{getStatusLabel(v.status)}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell min-w-[120px]">
                      {(v.status === 'dismantling' || v.status === 'partially_dismantled') ? (
                        <ProgressBar value={(v as any).dismantlingProgress || 0} />
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm hidden md:table-cell">{getEntryDate(v)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {v.status === 'received' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/saas/vertical/desguaces/despiece/${v.id}`); }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            title="Iniciar despiece"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        {v.status === 'dismantling' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/saas/vertical/desguaces/despiece/${v.id}`); }}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                            title="Continuar despiece"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditVehicle(v); setShowModal(true); }}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(v.id); }}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">{filtered.length} vehículos — Página {page} de {totalPages}</span>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${p === page ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>{p}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginated.map(v => (
              <div key={v.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group">
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{v.registrationPlate}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStatusStyle(v.status)}`}>{getStatusLabel(v.status)}</span>
                  </div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{v.brand} {v.model} <span className="text-gray-400 font-normal">{v.year}</span></p>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    {v.mileage != null && <span className="flex items-center gap-1"><Gauge className="w-3 h-3" />{v.mileage.toLocaleString('es-ES')} km</span>}
                    {v.fuelType && <span className="flex items-center gap-1"><Fuel className="w-3 h-3" />{FUEL_TYPES.find(f => f.value === v.fuelType)?.label || v.fuelType}</span>}
                  </div>
                  {(v.status === 'dismantling' || v.status === 'partially_dismantled') && (
                    <ProgressBar value={(v as any).dismantlingProgress || 0} />
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700/50">
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{v.purchasePrice?.toLocaleString('es-ES')} €</span>
                    <span className="text-xs text-gray-400">{getEntryDate(v)}</span>
                  </div>
                  <div className="flex items-center gap-1 pt-1">
                    {v.status === 'received' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/saas/vertical/desguaces/despiece/${v.id}`); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <Play className="w-3 h-3" /> Iniciar despiece
                      </button>
                    )}
                    {v.status === 'dismantling' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/saas/vertical/desguaces/despiece/${v.id}`); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-900/30 rounded-lg hover:bg-amber-100 transition-colors"
                      >
                        <ArrowRight className="w-3 h-3" /> Continuar despiece
                      </button>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); setEditVehicle(v); setShowModal(true); }} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(v.id); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <FilterDrawer isOpen={showFilters} onClose={() => setShowFilters(false)} filters={filters} onChange={f => { setFilters(f); setPage(1); }} />
      <VehicleModal isOpen={showModal} onClose={() => { setShowModal(false); setEditVehicle(null); }} onSave={handleSave} editVehicle={editVehicle} />
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="scrapyard_vehicles"
        moduleLabel="Vehículos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Vehículos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
