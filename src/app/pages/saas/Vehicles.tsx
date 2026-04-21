import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useApp } from '../../context/AppContext';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../../components/saas/Pagination';
import { useViewMode } from '../../hooks/useViewMode';
import { useColumnPreferences, type ColumnDef } from '../../hooks/useColumnPreferences';
import { ColumnCustomizer } from '../../components/saas/ColumnCustomizer';
import { useSavedFilters } from '../../hooks/useSavedFilters';
import { SavedFiltersPanel } from '../../components/saas/SavedFiltersPanel';
import { SAAS__VehicleQuickAddModal } from '../../components/design-system/SAAS__VehicleQuickAddModal';
import { SAAS__VehicleReceptionWizard } from '../../components/design-system/SAAS__VehicleReceptionWizard';
import { SAAS__VehicleFiltersDrawer } from '../../components/design-system/SAAS__VehicleFiltersDrawer';
import { VehicleImportWizard } from '../../components/saas/VehicleImportWizard';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { toast } from 'sonner';
import { VehiclesLocationsTab } from '../../components/saas/VehiclesLocationsTab';
import { VEHICLE_STATUS_TOKEN, type VehicleStatus, daysColor } from '../../components/saas/DesignTokens';
import { EmptyState } from '../../components/saas/EmptyState';
import {
  Plus, Search, MapPin, ChevronDown, LayoutGrid, List, X,
  Car, ArrowUp, ArrowDown, Check, Euro, Gauge, Calendar,
  GitCompare, ChevronRight, Fuel, Zap, DoorOpen, ToggleLeft, Star,
  Camera, MessageSquare, User, Package, TrendingUp, BarChart3, AlertTriangle,
} from 'lucide-react';
import { VEHICLE_IN_STOCK_STATUSES } from '../../components/saas/DesignTokens';
import { parseLocaleNumber } from '../../lib/numberFormat';
import { useWorkCenters } from '../../hooks/useWorkCenters';

// ─── Column definitions ───────────────────────────────────────────────────────

type VehicleColId = 'matricula' | 'vehiculo' | 'anyo' | 'precioCompra' | 'gastos' | 'precio' | 'margen' | 'estado' | 'comercial' | 'fotos' | 'observaciones' | 'ubicacion' | 'centro' | 'diasStock';

const VEHICLE_COLUMNS: ColumnDef<VehicleColId>[] = [
  { id: 'matricula',    label: 'Matrícula', required: true },
  { id: 'vehiculo',     label: 'Vehículo',  required: true },
  { id: 'anyo',         label: 'Año / km' },
  { id: 'precioCompra', label: 'Precio compra' },
  { id: 'gastos',       label: 'Gastos' },
  { id: 'precio',       label: 'Precio venta' },
  { id: 'margen',       label: 'Margen' },
  { id: 'estado',       label: 'Estado' },
  { id: 'comercial',    label: 'Comercial' },
  { id: 'fotos',        label: 'Fotos' },
  { id: 'observaciones',label: 'Notas' },
  { id: 'ubicacion',    label: 'Ubicación' },
  { id: 'centro',       label: 'Centro' },
  { id: 'diasStock',    label: 'Días en stock' },
];

// ─── Skeleton Loaders ─────────────────────────────────────────────────────────

function VehicleCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          <div className="h-5 w-16 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
          <div className="h-4 w-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse ml-auto" />
        </div>
        <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-3 w-1/2 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        <div className="flex items-center gap-3">
          <div className="h-3 w-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-3 w-16 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-3 w-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function VehicleTableRowSkeleton() {
  return (
    <tr className="border-b border-gray-50 dark:border-gray-800">
      {[40, 48, 32, 24, 28, 36, 20].map((w, i) => (
        <td key={i} className="px-5 py-4">
          <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" style={{ width: `${w * 2}px` }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface VehColFilters {
  matricula: string[];
  vehiculo:  string[];
  precio:    string[];
  estado:    string[];
  ubicacion: string[];
}

interface VehicleFilterSnapshot {
  statusFilter: string;
  locationFilter: string;
  brandFilter: string;
  daysInStockFilter: string;
  colFilters: VehColFilters;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

const EMPTY_VEH_FILTERS: VehColFilters = {
  matricula: [], vehiculo: [], precio: [], estado: [], ubicacion: [],
};

// ─── ColFilter (tabla) ────────────────────────────────────────────────────────

function ColFilter({ label, options, selected, onChange, renderOption, sortKey, currentSort, onSort }: {
  label: string; options: string[]; selected: string[];
  onChange: (vals: string[]) => void;
  renderOption?: (val: string) => React.ReactNode;
  sortKey?: string;
  currentSort?: SortState;
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
}) {
  const [open, setOpen] = useState(false);
  const [innerSearch, setInnerSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const isActive = selected.length > 0;
  const isSorted = !!(sortKey && currentSort?.key === sortKey);
  const sortDir = isSorted ? currentSort!.dir : null;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setInnerSearch(''); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const toggle = (val: string) => onChange(selected.includes(val) ? selected.filter(s => s !== val) : [...selected, val]);
  const visible = innerSearch.trim() ? options.filter(o => o.toLowerCase().includes(innerSearch.toLowerCase())) : options;
  const handleSort = (dir: 'asc' | 'desc') => {
    if (sortKey && onSort) {
      if (isSorted && sortDir === dir) onSort('', dir);
      else onSort(sortKey, dir);
    }
  };
  const hasSort = !!(sortKey && onSort);
  const hasOptions = options.length > 0;

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 transition-colors group ${isActive || isSorted ? 'text-amber-700' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'}`}
      >
        <span className="text-xs font-semibold uppercase tracking-wider whitespace-nowrap">{label}</span>
        {isActive && (
          <span className="bg-amber-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0">
            {selected.length}
          </span>
        )}
        {isSorted && !isActive && (
          sortDir === 'asc'
            ? <ArrowUp className="w-3 h-3 text-amber-500 flex-shrink-0" />
            : <ArrowDown className="w-3 h-3 text-amber-500 flex-shrink-0" />
        )}
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${isActive || isSorted ? 'text-amber-600' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600'}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 w-56 overflow-hidden">
          {hasSort && (
            <div className="px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-gray-800">
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Ordenar</p>
              <div className="flex gap-1.5">
                <button onClick={() => handleSort('asc')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${isSorted && sortDir === 'asc' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  <ArrowUp className="w-3 h-3" /> Asc
                </button>
                <button onClick={() => handleSort('desc')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${isSorted && sortDir === 'desc' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  <ArrowDown className="w-3 h-3" /> Desc
                </button>
              </div>
            </div>
          )}
          {hasOptions && (
            <>
              <div className="px-2.5 pt-2 pb-1">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Filtrar</p>
                  {isActive && (
                    <button onClick={() => onChange([])} className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-red-500 flex items-center gap-0.5 transition-colors">
                      <X className="w-2.5 h-2.5" /> Limpiar
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Search className="w-3 h-3 text-gray-400 dark:text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input value={innerSearch} onChange={e => setInnerSearch(e.target.value)} placeholder="Buscar..."
                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg focus:border-blue-400 focus:outline-none"
                    onClick={e => e.stopPropagation()} />
                </div>
              </div>
              <div className="px-1.5 pb-1 max-h-44 overflow-y-auto">
                {visible.map(opt => {
                  const checked = selected.includes(opt);
                  return (
                    <button key={opt} onClick={() => toggle(opt)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${checked ? 'bg-gray-50 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      <span className={`w-4 h-4 rounded-md flex-shrink-0 flex items-center justify-center border-2 transition-colors ${checked ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
                        {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </span>
                      <span className="text-sm text-gray-800 dark:text-gray-200 truncate flex-1">{renderOption ? renderOption(opt) : opt}</span>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-gray-100 dark:border-gray-800 px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-gray-400 dark:text-gray-500">{selected.length > 0 ? `${selected.length} sel.` : 'Ninguno'}</span>
                <button onClick={() => { setOpen(false); setInnerSearch(''); }} className="text-xs font-semibold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2.5 py-1 rounded-lg transition-colors">Aplicar</button>
              </div>
            </>
          )}
          {!hasOptions && hasSort && (
            <div className="px-3 py-2 flex justify-end">
              <button onClick={() => setOpen(false)} className="text-xs font-semibold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2.5 py-1 rounded-lg transition-colors">Cerrar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tabs del módulo ──────────────────────────────────────────────────────────

const MODULE_TAB_KEYS = [
  { id: 'stock',       i18nKey: 'vehicles.tabs.stock' },
  { id: 'ubicaciones', i18nKey: 'vehicles.tabs.locations' },
] as const;

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const t = VEHICLE_STATUS_TOKEN[status as VehicleStatus];
  if (!t) return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{status}</span>;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${t.badgeBg} ${t.badgeText}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.dot}`} />
      {t.label}
    </span>
  );
}

// ─── VehicleCard — tarjeta lista (estilo Clientes) ────────────────────────────

// ─── V-02: Vehicle Comparator Modal ──────────────────────────────────────────

const FUEL_LABELS_CMP: Record<string, string> = { gasolina: 'Gasolina', diesel: 'Diésel', hibrido: 'Híbrido', electrico: 'Eléctrico', glp: 'GLP', otro: 'Otro' };
const TRANS_LABELS_CMP: Record<string, string> = { manual: 'Manual', automatico: 'Automático', semiauto: 'Semiaut.' };
const BODY_LABELS_CMP: Record<string, string> = { sedan: 'Sedán', suv: 'SUV', familiar: 'Familiar', coupe: 'Coupé', cabrio: 'Cabrio', furgon: 'Furgón', pickup: 'Pick-up', otro: 'Otro' };

function VehicleComparatorModal({ vehicles, onClose, onNavigate }: {
  vehicles: any[];
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const rows: Array<{ label: string; icon: React.ReactNode; get: (v: any) => string; highlight?: boolean }> = [
    { label: 'Precio venta', icon: <Euro className="w-3.5 h-3.5" />, get: v => v.salePrice ? `${v.salePrice.toLocaleString('es-ES')} €` : '—', highlight: true },
    { label: 'Precio compra', icon: <Euro className="w-3.5 h-3.5" />, get: v => v.purchasePrice ? `${v.purchasePrice.toLocaleString('es-ES')} €` : '—' },
    { label: 'Año', icon: <Calendar className="w-3.5 h-3.5" />, get: v => v.year ? String(v.year) : '—' },
    { label: 'Kilómetros', icon: <Gauge className="w-3.5 h-3.5" />, get: v => v.mileage ? `${v.mileage.toLocaleString('es-ES')} km` : '—' },
    { label: 'Combustible', icon: <Fuel className="w-3.5 h-3.5" />, get: v => v.fuelType ? FUEL_LABELS_CMP[v.fuelType] ?? v.fuelType : '—' },
    { label: 'Cambio', icon: <ToggleLeft className="w-3.5 h-3.5" />, get: v => v.transmission ? TRANS_LABELS_CMP[v.transmission] ?? v.transmission : '—' },
    { label: 'Potencia', icon: <Zap className="w-3.5 h-3.5" />, get: v => v.power ? `${v.power} CV` : '—' },
    { label: 'Puertas', icon: <DoorOpen className="w-3.5 h-3.5" />, get: v => v.doors ? String(v.doors) : '—' },
    { label: 'Carrocería', icon: <Car className="w-3.5 h-3.5" />, get: v => v.bodyType ? BODY_LABELS_CMP[v.bodyType] ?? v.bodyType : '—' },
    { label: 'Color', icon: <Star className="w-3.5 h-3.5" />, get: v => v.color || '—' },
    { label: 'Ubicación', icon: <MapPin className="w-3.5 h-3.5" />, get: v => v.location || '—' },
    { label: 'Días en stock', icon: <Calendar className="w-3.5 h-3.5" />, get: v => v.daysInStock != null ? `${v.daysInStock} días` : '—' },
    { label: 'Estado', icon: <Check className="w-3.5 h-3.5" />, get: v => {
      const labels: Record<string, string> = { entrada: 'Entrada', preparacion: 'En preparación', listo: 'Listo para vender', reservado: 'Reservado', vendido: 'Vendido' };
      return labels[v.status] ?? v.status;
    }},
  ];

  // Determine "best" value for numeric rows
  const getBestIdx = (row: typeof rows[0]) => {
    const vals = vehicles.map(v => {
      const raw = row.get(v);
      const num = parseLocaleNumber(raw);
      return isNaN(num) ? null : num;
    });
    const allNull = vals.every(v => v === null);
    if (allNull) return -1;
    if (row.label === 'Precio venta' || row.label === 'Precio compra') return vals.indexOf(Math.min(...vals.filter(v => v !== null) as number[]));
    if (row.label === 'Kilómetros') return vals.indexOf(Math.min(...vals.filter(v => v !== null) as number[]));
    if (row.label === 'Potencia' || row.label === 'Año') return vals.indexOf(Math.max(...vals.filter(v => v !== null) as number[]));
    return -1;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 my-auto overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between flex-shrink-0 bg-gray-50 dark:bg-gray-800">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-blue-600" />
            Comparador de vehículos
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-full">{vehicles.length} seleccionados</span>
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px]">
            {/* Vehicle headers */}
            <thead>
              <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                <th className="w-36 px-4 py-3 text-left text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide bg-gray-50 dark:bg-gray-800 sticky left-0 z-10 border-r border-gray-100 dark:border-gray-800">Característica</th>
                {vehicles.map((v, i) => (
                  <th key={v.id} className={`px-4 py-3 text-left min-w-[160px] ${i < vehicles.length - 1 ? 'border-r border-gray-100 dark:border-gray-800' : ''}`}>
                    <div className="space-y-1">
                      {v.images?.[0] && (
                        <div className="w-full h-20 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700">
                          <img src={v.images[0]} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="font-bold text-gray-900 dark:text-gray-100 text-sm leading-tight">{v.brand} {v.model}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{v.year}{v.version ? ` · ${v.version}` : ''}</div>
                      <span className="inline-block font-mono bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">{v.registrationPlate}</span>
                      <div className="pt-1">
                        <button
                          onClick={() => { onNavigate(v.id); onClose(); }}
                          className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          Ver ficha <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                const bestIdx = getBestIdx(row);
                const vals = vehicles.map(v => row.get(v));
                const allSame = new Set(vals).size === 1;
                return (
                  <tr key={row.label} className={`border-b border-gray-50 ${row.highlight ? 'bg-green-50' : ri % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                    <td className="px-4 py-3 sticky left-0 z-10 bg-inherit border-r border-gray-100 dark:border-gray-800">
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 font-medium">
                        <span className="text-gray-400 dark:text-gray-500">{row.icon}</span>
                        {row.label}
                      </div>
                    </td>
                    {vehicles.map((v, vi) => {
                      const val = row.get(v);
                      const isBest = bestIdx === vi;
                      return (
                        <td key={v.id} className={`px-4 py-3 ${vi < vehicles.length - 1 ? 'border-r border-gray-100 dark:border-gray-800' : ''}`}>
                          <span className={`text-sm font-semibold ${
                            isBest && !allSame
                              ? row.highlight ? 'text-green-700' : 'text-blue-700'
                              : 'text-gray-900 dark:text-gray-100'
                          }`}>
                            {val}
                            {isBest && !allSame && <span className="ml-1 text-[9px] font-bold text-green-500 uppercase">✓</span>}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-4 bg-gray-50 dark:bg-gray-800">
          <button onClick={onClose} className="w-full sm:w-auto px-5 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
            Cerrar comparador
          </button>
        </div>
      </div>
    </div>
  );
}

function VehicleCard({
  vehicle, navigate,
  compareMode = false,
  isSelectedForCompare = false,
  onToggleCompare,
}: {
  vehicle: any;
  navigate: (p: string) => void;
  compareMode?: boolean;
  isSelectedForCompare?: boolean;
  onToggleCompare?: (id: string) => void;
}) {
  const t = VEHICLE_STATUS_TOKEN[vehicle.status as VehicleStatus] ?? VEHICLE_STATUS_TOKEN.entrada;
  const photoCount = (vehicle.images || []).length;
  const marginColor = vehicle.margin != null ? (vehicle.margin > 0 ? 'text-emerald-600' : vehicle.margin < 0 ? 'text-red-600' : 'text-gray-400') : '';
  return (
    <div
      onClick={() => compareMode ? onToggleCompare?.(vehicle.id) : navigate(`/saas/vehicles/${vehicle.id}`)}
      className={`bg-white dark:bg-gray-900 rounded-2xl border overflow-hidden transition-all cursor-pointer ${
        compareMode
          ? isSelectedForCompare
            ? 'border-2 border-blue-500 ring-2 ring-blue-100 shadow-md'
            : 'border-2 border-gray-200 dark:border-gray-700 hover:border-blue-300 opacity-80 hover:opacity-100'
          : `border border-gray-200 dark:border-gray-700 border-l-4 ${t.accentBorder} hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 active:scale-[0.99]`
      }`}
    >
      <div className="p-4">
        {/* Fila 1: matrícula + estado + días */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {compareMode && (
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSelectedForCompare ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
              {isSelectedForCompare && <Check className="w-3 h-3 text-white" />}
            </div>
          )}
          <span className="font-mono bg-blue-600 text-white px-2 py-0.5 rounded-lg text-xs font-bold flex-shrink-0">
            {vehicle.registrationPlate}
          </span>
          <StatusBadge status={vehicle.status} />
          {photoCount === 0 && <Camera className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
          <span className={`ml-auto text-[10px] font-bold flex-shrink-0 ${daysColor(vehicle.daysInStock)}`}>
            {vehicle.daysInStock}d stock
          </span>
        </div>

        {/* Fila 2: marca + modelo */}
        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight mb-0.5">{vehicle.brand} {vehicle.model}</p>
        {vehicle.version && <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 truncate">{vehicle.version}</p>}

        {/* Fila 3: specs */}
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-2">
          {vehicle.year && <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400 dark:text-gray-500" />{vehicle.year}</span>}
          {vehicle.mileage && <span className="flex items-center gap-1"><Gauge className="w-3 h-3 text-gray-400 dark:text-gray-500" />{vehicle.mileage.toLocaleString('es-ES')} km</span>}
          {vehicle.fuelType && <span className="capitalize">{vehicle.fuelType}</span>}
        </div>

        {/* Fila 3b: comercial asignado */}
        {vehicle.assignedToName && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-2">
            <User className="w-3 h-3 text-gray-400" />{vehicle.assignedToName}
          </div>
        )}

        {/* Fila 4: precios + margen */}
        <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-sm font-bold text-emerald-600">
              <Euro className="w-3.5 h-3.5" />
              {vehicle.salePrice ? vehicle.salePrice.toLocaleString('es-ES') : '—'}
            </span>
            {vehicle.margin != null && (
              <span className={`text-xs font-bold ${marginColor}`}>
                {vehicle.margin > 0 ? '+' : ''}{vehicle.margin.toLocaleString('es-ES')}€
                {vehicle.marginPercent != null && <span className="ml-0.5 opacity-75">({vehicle.marginPercent}%)</span>}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
            <span>Compra: {vehicle.purchasePrice ? `${vehicle.purchasePrice.toLocaleString('es-ES')}€` : '—'}</span>
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              <span className="truncate max-w-[80px]">{vehicle.location || '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── VehicleTableRow — fila de tabla (estática, para compatibilidad) ──────────

function VehicleTableRow({ vehicle, navigate }: { vehicle: any; navigate: (p: string) => void }) {
  const t = VEHICLE_STATUS_TOKEN[vehicle.status as VehicleStatus] ?? VEHICLE_STATUS_TOKEN.entrada;
  return (
    <tr onClick={() => navigate(`/saas/vehicles/${vehicle.id}`)} className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors group">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2">
          <div className={`w-1 h-8 rounded-full flex-shrink-0 ${t.dot}`} />
          <span className="font-mono bg-blue-600 text-white px-2 py-0.5 rounded-lg text-xs font-bold">{vehicle.registrationPlate}</span>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{vehicle.brand} {vehicle.model}</p>
        {vehicle.version && <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[180px]">{vehicle.version}</p>}
      </td>
      <td className="px-5 py-3.5">
        <p className="text-sm text-gray-600 dark:text-gray-400">{vehicle.year}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{vehicle.mileage?.toLocaleString('es-ES')} km</p>
      </td>
      <td className="px-5 py-3.5">
        <span className="text-sm font-bold text-emerald-600">{vehicle.salePrice?.toLocaleString('es-ES')}€</span>
      </td>
      <td className="px-5 py-3.5"><StatusBadge status={vehicle.status} /></td>
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
          <MapPin className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />{vehicle.location || '—'}
        </div>
      </td>
      <td className="px-5 py-3.5">
        <span className={`text-sm font-bold ${daysColor(vehicle.daysInStock)}`}>{vehicle.daysInStock}d</span>
      </td>
    </tr>
  );
}

// ─── VehicleTableRowDynamic — respeta columnas visibles ──────────────────────

function MarginCell({ margin, marginPercent }: { margin: number | null | undefined; marginPercent: number | null | undefined }) {
  if (margin == null) return <span className="text-xs text-gray-300 dark:text-gray-600">—</span>;
  const color = margin > 0 ? 'text-emerald-600' : margin < 0 ? 'text-red-600' : 'text-gray-500';
  return (
    <div className="flex flex-col">
      <span className={`text-sm font-bold ${color}`}>{margin.toLocaleString('es-ES')}€</span>
      {marginPercent != null && <span className={`text-[10px] font-semibold ${color}`}>{marginPercent > 0 ? '+' : ''}{marginPercent}%</span>}
    </div>
  );
}

function PhotosIndicator({ count }: { count: number }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${count === 0 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
      <Camera className={`w-3.5 h-3.5 ${count === 0 ? 'text-red-400' : 'text-gray-400'}`} />
      {count}
    </span>
  );
}

function VehicleTableRowDynamic({ vehicle, navigate, visibleCols }: { vehicle: any; navigate: (p: string) => void; visibleCols: VehicleColId[] }) {
  const t = VEHICLE_STATUS_TOKEN[vehicle.status as VehicleStatus] ?? VEHICLE_STATUS_TOKEN.entrada;
  const photoCount = (vehicle.images || []).length;
  return (
    <tr onClick={() => navigate(`/saas/vehicles/${vehicle.id}`)} className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors group">
      {visibleCols.includes('matricula') && (
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className={`w-1 h-8 rounded-full flex-shrink-0 ${t.dot}`} />
            <span className="font-mono bg-blue-600 text-white px-2 py-0.5 rounded-lg text-xs font-bold">{vehicle.registrationPlate}</span>
          </div>
        </td>
      )}
      {visibleCols.includes('vehiculo') && (
        <td className="px-5 py-3.5">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{vehicle.brand} {vehicle.model}</p>
          {vehicle.version && <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[180px]">{vehicle.version}</p>}
        </td>
      )}
      {visibleCols.includes('anyo') && (
        <td className="px-5 py-3.5">
          <p className="text-sm text-gray-600 dark:text-gray-400">{vehicle.year}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{vehicle.mileage?.toLocaleString('es-ES')} km</p>
        </td>
      )}
      {visibleCols.includes('precioCompra') && (
        <td className="px-5 py-3.5">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{vehicle.purchasePrice ? `${vehicle.purchasePrice.toLocaleString('es-ES')}€` : '—'}</span>
        </td>
      )}
      {visibleCols.includes('gastos') && (
        <td className="px-5 py-3.5">
          <span className={`text-sm font-semibold ${(vehicle.totalCosts || 0) > 0 ? 'text-orange-600' : 'text-gray-300 dark:text-gray-600'}`}>
            {(vehicle.totalCosts || 0) > 0 ? `${vehicle.totalCosts.toLocaleString('es-ES')}€` : '—'}
          </span>
        </td>
      )}
      {visibleCols.includes('precio') && (
        <td className="px-5 py-3.5">
          <span className="text-sm font-bold text-emerald-600">{vehicle.salePrice ? `${vehicle.salePrice.toLocaleString('es-ES')}€` : '—'}</span>
        </td>
      )}
      {visibleCols.includes('margen') && (
        <td className="px-5 py-3.5"><MarginCell margin={vehicle.margin} marginPercent={vehicle.marginPercent} /></td>
      )}
      {visibleCols.includes('estado') && (
        <td className="px-5 py-3.5"><StatusBadge status={vehicle.status} /></td>
      )}
      {visibleCols.includes('comercial') && (
        <td className="px-5 py-3.5">
          {vehicle.assignedToName ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
              <User className="w-3.5 h-3.5 text-gray-400" />{vehicle.assignedToName}
            </span>
          ) : (
            <span className="text-xs text-gray-300 dark:text-gray-600">Sin asignar</span>
          )}
        </td>
      )}
      {visibleCols.includes('fotos') && (
        <td className="px-5 py-3.5"><PhotosIndicator count={photoCount} /></td>
      )}
      {visibleCols.includes('observaciones') && (
        <td className="px-5 py-3.5">
          {vehicle.notes ? (
            <span className="inline-flex items-center gap-1 text-xs text-blue-600" title={vehicle.notes}>
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="truncate max-w-[80px]">{vehicle.notes}</span>
            </span>
          ) : (
            <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
          )}
        </td>
      )}
      {visibleCols.includes('ubicacion') && (
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
            <MapPin className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />{vehicle.location || '—'}
          </div>
        </td>
      )}
      {visibleCols.includes('centro') && (
        <td className="px-5 py-3.5">
          {vehicle.workCenterName ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800">
              <MapPin className="w-3 h-3" />{vehicle.workCenterName}
            </span>
          ) : (
            <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
          )}
        </td>
      )}
      {visibleCols.includes('diasStock') && (
        <td className="px-5 py-3.5">
          <span className={`text-sm font-bold ${daysColor(vehicle.daysInStock)}`}>{vehicle.daysInStock}d</span>
        </td>
      )}
    </tr>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function Vehicles() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'stock';
  const { vehicles, isLoadingVehicles, addVehicle } = useApp();
  const { activeWorkCenters, hasWorkCenters } = useWorkCenters();
  const [viewMode, setViewMode] = useViewMode('vehicles', 'cards');

  const VEHICLE_AI_FIELDS: AIFieldDef[] = [
    { key: 'registrationPlate', label: 'Matrícula' },
    { key: 'brand', label: 'Marca' },
    { key: 'model', label: 'Modelo' },
    { key: 'version', label: 'Versión' },
    { key: 'year', label: 'Año', type: 'number' },
    { key: 'color', label: 'Color' },
    { key: 'fuelType', label: 'Combustible' },
    { key: 'mileage', label: 'Kilómetros', type: 'number' },
    { key: 'purchasePrice', label: 'Precio compra', type: 'number' },
    { key: 'salePrice', label: 'Precio venta', type: 'number' },
    { key: 'location', label: 'Ubicación' },
    { key: 'status', label: 'Estado' },
  ];

  const VEHICLE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'registrationPlate', label: 'Matrícula', required: true, example: '1234ABC' },
    { key: 'brand', label: 'Marca', required: true, example: 'Volkswagen' },
    { key: 'model', label: 'Modelo', required: true, example: 'Golf' },
    { key: 'version', label: 'Versión', example: '1.6 TDI' },
    { key: 'year', label: 'Año', required: true, example: '2022' },
    { key: 'color', label: 'Color', example: 'Blanco' },
    { key: 'fuelType', label: 'Combustible', example: 'diesel' },
    { key: 'mileage', label: 'Kilómetros', example: '45000' },
    { key: 'purchasePrice', label: 'Precio compra', required: true, example: '15000' },
    { key: 'salePrice', label: 'Precio venta', example: '18500' },
    { key: 'location', label: 'Ubicación', example: 'Nave principal' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    let created = 0;
    for (const entry of entries) {
      try {
        await addVehicle(entry as any);
        created++;
      } catch { /* skip failed */ }
    }
    toast.success(`${created} vehículo(s) creado(s) con IA`);
  };

  const handleGenericImport = async (entries: Record<string, string>[]) => {
    let created = 0;
    for (const entry of entries) {
      try {
        await addVehicle({
          registrationPlate: entry.registrationPlate || '',
          brand: entry.brand || '',
          model: entry.model || '',
          version: entry.version || '',
          year: Number(entry.year) || new Date().getFullYear(),
          color: entry.color || '',
          fuelType: entry.fuelType || '',
          mileage: Number(entry.mileage) || 0,
          purchasePrice: Number(entry.purchasePrice) || 0,
          salePrice: Number(entry.salePrice) || 0,
          location: entry.location || '',
          status: 'entrada',
        } as any);
        created++;
      } catch { /* skip failed */ }
    }
    toast.success(`${created} vehículo(s) importado(s)`);
  };
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);

  useEffect(() => {
    if (searchParams.get('quickAdd') !== '1') return;
    setShowQuickAddModal(true);
    const next = new URLSearchParams(searchParams);
    next.delete('quickAdd');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [showReceptionWizard, setShowReceptionWizard] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showGenericImport, setShowGenericImport] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [daysInStockFilter, setDaysInStockFilter] = useState('all');
  const [workCenterFilter, setWorkCenterFilter] = useState('all');
  const [colFilters, setColFilters] = useState<VehColFilters>(EMPTY_VEH_FILTERS);
  const [sortState, setSortState] = useState<SortState>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const { visibleColumns: visibleVehicleCols, visibleIds: visibleVehicleColIds, columnOrder: vehicleColOrder, toggleColumn: toggleVehicleCol, reorderColumns: reorderVehicleCols, resetToDefault: resetVehicleCols } = useColumnPreferences('vehicles', VEHICLE_COLUMNS);
  const { presets: filterPresets, savePreset, deletePreset } = useSavedFilters<VehicleFilterSnapshot>('vehicles');

  // V-02: Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [showComparator, setShowComparator] = useState(false);

  useModalClose(showComparator, () => setShowComparator(false));

  const toggleCompare = useCallback((id: string) => {
    setSelectedForCompare(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, id];
    });
  }, []);

  const exitCompareMode = useCallback(() => {
    setCompareMode(false);
    setSelectedForCompare([]);
    setShowComparator(false);
  }, []);

  const setCol = useCallback((col: keyof VehColFilters) => (vals: string[]) =>
    setColFilters(prev => ({ ...prev, [col]: vals })), []);

  const handleSort = useCallback((key: string, dir: 'asc' | 'desc') => {
    setSortState(key ? { key, dir } : null);
  }, []);

  const getVehicleWithDays = (vehicle: any) => {
    const days = Math.floor((Date.now() - new Date(vehicle.purchaseDate ?? vehicle.createdAt).getTime()) / 86400000);
    return { ...vehicle, daysInStock: Math.max(0, days) };
  };

  const allWithDays = useMemo(() => vehicles.map(getVehicleWithDays), [vehicles]);

  // Contar por estado para los chips
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: vehicles.length };
    vehicles.forEach((v: any) => { counts[v.status] = (counts[v.status] ?? 0) + 1; });
    return counts;
  }, [vehicles]);

  const filteredVehicles = useMemo(() => {
    const statusLabel = (v: any) => VEHICLE_STATUS_TOKEN[v.status as VehicleStatus]?.label ?? v.status;

    let rows = allWithDays.filter((v: any) => {
      const q = searchValue.toLowerCase();
      const matchesSearch = !q
        || v.registrationPlate.toLowerCase().includes(q)
        || v.brand.toLowerCase().includes(q)
        || v.model.toLowerCase().includes(q)
        || (v.version ?? '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
      const matchesLocation = locationFilter === 'all' || v.location === locationFilter;
      const matchesBrand = brandFilter === 'all' || v.brand === brandFilter;
      let matchesDays = true;
      if (daysInStockFilter === '0-30') matchesDays = v.daysInStock <= 30;
      else if (daysInStockFilter === '31-60') matchesDays = v.daysInStock > 30 && v.daysInStock <= 60;
      else if (daysInStockFilter === '61-90') matchesDays = v.daysInStock > 60 && v.daysInStock <= 90;
      else if (daysInStockFilter === '90+') matchesDays = v.daysInStock > 90;
      if (colFilters.matricula.length && !colFilters.matricula.includes(v.registrationPlate)) return false;
      if (colFilters.vehiculo.length  && !colFilters.vehiculo.includes(`${v.brand} ${v.model}`)) return false;
      if (colFilters.precio.length    && !colFilters.precio.includes(`${v.salePrice?.toLocaleString('es-ES')}€`)) return false;
      if (colFilters.estado.length    && !colFilters.estado.includes(statusLabel(v))) return false;
      if (colFilters.ubicacion.length && !colFilters.ubicacion.includes(v.location || '—')) return false;
      const matchesWorkCenter = workCenterFilter === 'all' || v.workCenterId === workCenterFilter;
      return matchesSearch && matchesStatus && matchesLocation && matchesBrand && matchesDays && matchesWorkCenter;
    });

    if (sortState?.key) {
      const { key, dir } = sortState;
      const mul = dir === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        let va: string | number = '';
        let vb: string | number = '';
        if (key === 'registrationPlate') { va = a.registrationPlate; vb = b.registrationPlate; }
        else if (key === 'vehiculo')      { va = `${a.brand} ${a.model}`; vb = `${b.brand} ${b.model}`; }
        else if (key === 'year')          { va = a.year ?? 0; vb = b.year ?? 0; }
        else if (key === 'purchasePrice') { va = a.purchasePrice ?? 0; vb = b.purchasePrice ?? 0; }
        else if (key === 'totalCosts')    { va = a.totalCosts ?? 0; vb = b.totalCosts ?? 0; }
        else if (key === 'salePrice')     { va = a.salePrice ?? 0; vb = b.salePrice ?? 0; }
        else if (key === 'margin')        { va = a.margin ?? -Infinity; vb = b.margin ?? -Infinity; }
        else if (key === 'status')        { va = statusLabel(a); vb = statusLabel(b); }
        else if (key === 'assignedToName'){ va = a.assignedToName || ''; vb = b.assignedToName || ''; }
        else if (key === 'location')      { va = a.location || ''; vb = b.location || ''; }
        else if (key === 'daysInStock')   { va = a.daysInStock ?? 0; vb = b.daysInStock ?? 0; }
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
        return String(va).localeCompare(String(vb), 'es') * mul;
      });
    }
    return rows;
  }, [allWithDays, searchValue, statusFilter, locationFilter, brandFilter, daysInStockFilter, workCenterFilter, colFilters, sortState]);

  const brands = useMemo(() => [...new Set(vehicles.map((v: any) => v.brand))].sort() as string[], [vehicles]);
  const locations = useMemo(() => [...new Set(vehicles.map((v: any) => v.location))].sort() as string[], [vehicles]);
  const activeFiltersCount = [locationFilter, brandFilter, daysInStockFilter].filter(f => f !== 'all').length;

  const { paginated: paginatedVehicles, pagination } = usePagination(filteredVehicles, 20);

  const MODULE_TABS = MODULE_TAB_KEYS.map(tab => ({ ...tab, label: t(tab.i18nKey) }));

  const DAYS_LABELS: Record<string, string> = {
    '0-30': t('vehicles.days.0-30'),
    '31-60': t('vehicles.days.31-60'),
    '61-90': t('vehicles.days.61-90'),
    '90+': t('vehicles.days.90+'),
  };

  const opts = useMemo(() => ({
    matricula: [...new Set(allWithDays.map((v: any) => v.registrationPlate as string))].sort(),
    vehiculo:  [...new Set(allWithDays.map((v: any) => `${v.brand} ${v.model}`))].sort(),
    precio:    [...new Set(allWithDays.map((v: any) => `${v.salePrice?.toLocaleString('es-ES')}€`))].sort(),
    estado:    [...new Set(allWithDays.map((v: any) => VEHICLE_STATUS_TOKEN[v.status as VehicleStatus]?.label ?? v.status as string))].sort(),
    ubicacion: [...new Set(allWithDays.map((v: any) => (v.location || '—') as string))].sort(),
  }), [allWithDays]);

  // Chips de estado con etiqueta + conteo
  const STATUS_CHIPS = [
    { value: 'all',         label: 'Todos' },
    { value: 'entrada',     label: 'Entrada' },
    { value: 'preparacion', label: 'Preparación' },
    { value: 'listo',       label: 'Listo' },
    { value: 'reservado',   label: 'Reservado' },
    { value: 'vendido',     label: 'Vendido' },
  ];

  const clearAllFilters = () => {
    setStatusFilter('all');
    setLocationFilter('all');
    setBrandFilter('all');
    setDaysInStockFilter('all');
    setWorkCenterFilter('all');
    setSearchValue('');
    setColFilters(EMPTY_VEH_FILTERS);
    setActivePresetId(null);
  };

  const currentFiltersEmpty = statusFilter === 'all' && locationFilter === 'all' && brandFilter === 'all' && daysInStockFilter === 'all' && !searchValue && !colFilters.matricula.length && !colFilters.vehiculo.length;

  const handleSavePreset = (name: string) => {
    const snapshot: VehicleFilterSnapshot = { statusFilter, locationFilter, brandFilter, daysInStockFilter, colFilters };
    const preset = savePreset(name, snapshot);
    setActivePresetId(preset.id);
  };

  const handleApplyPreset = (preset: { id: string; filters: VehicleFilterSnapshot | null }) => {
    if (!preset.id || !preset.filters) { setActivePresetId(null); return; }
    const f = preset.filters;
    setStatusFilter(f.statusFilter);
    setLocationFilter(f.locationFilter);
    setBrandFilter(f.brandFilter);
    setDaysInStockFilter(f.daysInStockFilter);
    setColFilters(f.colFilters);
    setActivePresetId(preset.id);
  };

  const hasAnyFilter = statusFilter !== 'all' || activeFiltersCount > 0 || searchValue || colFilters.matricula.length > 0 || colFilters.vehiculo.length > 0;

  return (
    <Layout title={t('vehicles.title')} subtitle={t('vehicles.subtitle')}>
      <div className="space-y-4">

        {/* ── Tabs del módulo ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-1">
            {MODULE_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setSearchParams({ tab: t.id })}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === t.id
                    ? 'border-amber-500 text-amber-700'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {t.label}
                {t.id === 'stock' && (
                  <span className="ml-1.5 text-xs font-bold text-gray-400 dark:text-gray-500">{vehicles.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab: Stock ───────────────────────────────────────────────── */}
        {activeTab === 'stock' && (
          <>
            {/* ── Barra de búsqueda + controles ───────────────────────── */}
            <div className="space-y-2">
              {/* Search en fila completa */}
              <div className="w-full relative">
                <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder={t('vehicles.searchPlaceholder')}
                  value={searchValue}
                  onChange={e => setSearchValue(e.target.value)}
                  className="w-full pl-9 pr-8 py-2.5 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm transition-all"
                />
                {searchValue && (
                  <button onClick={() => setSearchValue('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 hover:text-gray-600" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
              {/* Vista rápida / Vista avanzada — solo desktop */}
              <div className="hidden sm:inline-flex items-center bg-gray-100 dark:bg-gray-700 rounded-xl p-1 flex-shrink-0">
                {([['cards', LayoutGrid, t('vehicles.views.quick')], ['table', List, t('vehicles.views.advanced')]] as const).map(([mode, Icon, lbl]) => (
                  <button key={mode} onClick={() => setViewMode(mode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${viewMode === mode ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                    <Icon className="w-3.5 h-3.5" />{lbl}
                  </button>
                ))}
              </div>

              {/* Centro de trabajo */}
              {hasWorkCenters && (
                <div className="relative flex-shrink-0">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
                  <select
                    value={workCenterFilter}
                    onChange={(e) => setWorkCenterFilter(e.target.value)}
                    className="pl-8 pr-7 py-2.5 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:border-blue-500 transition-all"
                  >
                    <option value="all">Todos los centros</option>
                    {activeWorkCenters.map((wc) => (
                      <option key={wc.id} value={wc.id}>{wc.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 dark:text-gray-500 pointer-events-none" />
                </div>
              )}

              {/* Filtros avanzados */}
              <button
                onClick={() => setShowFilters(true)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 border-2 rounded-xl text-sm font-medium transition-colors ${activeFiltersCount > 0 ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400'}`}
              >
                <span className="text-xs">⚙️</span>
                <span className="hidden sm:inline">Filtros</span>
                {activeFiltersCount > 0 && <span className="text-xs font-bold">{activeFiltersCount}</span>}
              </button>

              {/* Vistas guardadas (filtros) */}
              <SavedFiltersPanel<VehicleFilterSnapshot>
                presets={filterPresets}
                activePresetId={activePresetId}
                onApply={handleApplyPreset}
                onSave={handleSavePreset}
                onDelete={(id) => { deletePreset(id); if (activePresetId === id) setActivePresetId(null); }}
                currentFiltersEmpty={currentFiltersEmpty}
              />

              {/* Columnas — solo en vista tabla */}
              {viewMode === 'table' && (
                <ColumnCustomizer
                  columns={VEHICLE_COLUMNS}
                  visibleIds={visibleVehicleColIds}
                  columnOrder={vehicleColOrder}
                  onToggle={toggleVehicleCol}
                  onReorder={reorderVehicleCols}
                  onReset={resetVehicleCols}
                />
              )}

              {/* V-02: Comparar toggle */}
              <button
                onClick={() => { setCompareMode(v => !v); setSelectedForCompare([]); }}
                title="Comparar vehículos"
                className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 border-2 rounded-xl text-sm font-medium transition-colors ${compareMode ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400'}`}
              >
                <GitCompare className="w-4 h-4" />
                <span className="hidden sm:inline">Comparar</span>
              </button>

              {/* Añadir */}
              <AddButtonDropdown
                label={t('vehicles.add')}
                onQuickAdd={() => setShowQuickAddModal(true)}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowGenericImport(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de alta de vehículo"
              />
              </div>
            </div>

            {/* ── KPI cards ────────────────────────────────────────────── */}
            {(() => {
              const inStock = allWithDays.filter((v: any) => ['entrada', 'preparacion', 'listo'].includes(v.status));
              const listos = allWithDays.filter((v: any) => v.status === 'listo');
              const reservados = allWithDays.filter((v: any) => v.status === 'reservado');
              const now = new Date();
              const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
              const vendidosMes = allWithDays.filter((v: any) => v.status === 'vendido' && v.soldAt && new Date(v.soldAt) >= firstOfMonth);
              const inversionTotal = inStock.reduce((s: number, v: any) => s + (v.purchasePrice || 0) + (v.totalCosts || 0), 0);
              const margenPotencial = [...listos, ...reservados].reduce((s: number, v: any) => s + (v.margin ?? 0), 0);

              const kpis = [
                { label: 'En stock', value: inStock.length, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                { label: 'Listos', value: listos.length, icon: Check, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
                { label: 'Reservados', value: reservados.length, icon: AlertTriangle, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-900/20' },
                { label: 'Vendidos (mes)', value: vendidosMes.length, icon: TrendingUp, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800' },
                { label: 'Inversión', value: `${(inversionTotal / 1000).toFixed(0)}k€`, icon: Euro, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
                { label: 'Margen potencial', value: `${(margenPotencial / 1000).toFixed(1)}k€`, icon: BarChart3, color: margenPotencial >= 0 ? 'text-emerald-600' : 'text-red-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
              ];

              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {kpis.map((kpi) => (
                    <div key={kpi.label} className={`${kpi.bg} rounded-xl p-3 flex items-center gap-3`}>
                      <kpi.icon className={`w-5 h-5 ${kpi.color} flex-shrink-0`} />
                      <div className="min-w-0">
                        <p className={`text-lg font-bold ${kpi.color} leading-tight`}>{kpi.value}</p>
                        <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">{kpi.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* ── Chips de estado: etiqueta + conteo ────────────────────── */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
              {STATUS_CHIPS.map(chip => {
                const count = statusCounts[chip.value] ?? 0;
                const isActive = statusFilter === chip.value;
                return (
                  <button
                    key={chip.value}
                    onClick={() => setStatusFilter(chip.value)}
                    title={chip.label}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border-2 transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-gray-900 border-gray-900 text-white'
                        : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <span>{chip.label}</span>
                    <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}

              {/* Chips de filtros avanzados — ubicación, marca, días en stock */}
              {locationFilter !== 'all' && (
                <button
                  onClick={() => setLocationFilter('all')}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border-2 bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100 transition-all whitespace-nowrap"
                >
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  {locationFilter}
                  <X className="w-3 h-3 flex-shrink-0 opacity-60" />
                </button>
              )}
              {brandFilter !== 'all' && (
                <button
                  onClick={() => setBrandFilter('all')}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border-2 bg-violet-50 border-violet-300 text-violet-700 hover:bg-violet-100 transition-all whitespace-nowrap"
                >
                  <Car className="w-3 h-3 flex-shrink-0" />
                  {brandFilter}
                  <X className="w-3 h-3 flex-shrink-0 opacity-60" />
                </button>
              )}
              {daysInStockFilter !== 'all' && (
                <button
                  onClick={() => setDaysInStockFilter('all')}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border-2 bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 transition-all whitespace-nowrap"
                >
                  <Calendar className="w-3 h-3 flex-shrink-0" />
                  {DAYS_LABELS[daysInStockFilter] ?? daysInStockFilter}
                  <X className="w-3 h-3 flex-shrink-0 opacity-60" />
                </button>
              )}

              {/* Separador + limpiar si hay filtros */}
              {hasAnyFilter && (
                <>
                  <div className="flex-shrink-0 w-px h-4 bg-gray-200 mx-1" />
                  <button onClick={clearAllFilters} className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold text-red-500 hover:bg-red-50 border-2 border-transparent hover:border-red-100 transition-all">
                    <X className="w-3 h-3" /> Limpiar
                  </button>
                </>
              )}
            </div>

            {/* Controles móviles */}
            <div className="flex items-center justify-end">
              {/* Vista rápida/avanzada toggle mobile */}
              <div className="sm:hidden inline-flex items-center bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
                {([['cards', LayoutGrid], ['table', List]] as const).map(([mode, Icon]) => (
                  <button key={mode} onClick={() => setViewMode(mode)} title={mode === 'cards' ? t('vehicles.views.quick') : t('vehicles.views.advanced')}
                    className={`p-1.5 rounded-lg transition-colors ${viewMode === mode ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>

            {/* ── Vista: Cards — Skeleton ─────────────────────────── */}
            {viewMode === 'cards' && isLoadingVehicles && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => <VehicleCardSkeleton key={i} />)}
              </div>
            )}

            {/* V-02: Compare mode banner */}
            {compareMode && (
              <div className="flex items-center gap-3 p-3.5 bg-blue-50 border-2 border-blue-200 rounded-2xl">
                <GitCompare className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-900">Modo comparación activo</p>
                  <p className="text-xs text-blue-600">
                    {selectedForCompare.length === 0 ? 'Selecciona 2 o 3 vehículos para comparar' : `${selectedForCompare.length} vehículo${selectedForCompare.length > 1 ? 's' : ''} seleccionado${selectedForCompare.length > 1 ? 's' : ''} · máx. 3`}
                  </p>
                </div>
                {selectedForCompare.length >= 2 && (
                  <button
                    onClick={() => setShowComparator(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    <GitCompare className="w-4 h-4" />Comparar
                  </button>
                )}
                <button onClick={exitCompareMode} className="p-1.5 hover:bg-blue-100 rounded-lg transition-colors flex-shrink-0">
                  <X className="w-4 h-4 text-blue-600" />
                </button>
              </div>
            )}

            {/* ── Vista: Cards ───────────────────────────────────────── */}
            {viewMode === 'cards' && !isLoadingVehicles && filteredVehicles.length > 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {paginatedVehicles.map((v: any) => (
                    <VehicleCard
                      key={v.id}
                      vehicle={v}
                      navigate={navigate}
                      compareMode={compareMode}
                      isSelectedForCompare={selectedForCompare.includes(v.id)}
                      onToggleCompare={toggleCompare}
                    />
                  ))}
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700">
                  <Pagination pagination={pagination} />
                </div>
              </div>
            )}

            {/* ── Vista: Tabla ───────────────────────────────────────── */}
            {viewMode === 'table' && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                {!isLoadingVehicles && filteredVehicles.length === 0 ? (
                  <EmptyState
                    className="min-h-[min(70vh,560px)] py-20"
                    type={hasAnyFilter ? 'search' : 'vehicles'}
                    title={hasAnyFilter ? t('vehicles.empty.noResults') : t('vehicles.empty.noVehicles')}
                    description={hasAnyFilter ? t('vehicles.empty.noResultsDesc') : t('vehicles.empty.noVehiclesDesc')}
                    ctaLabel={hasAnyFilter ? undefined : t('vehicles.addVehicle')}
                    onCta={hasAnyFilter ? undefined : () => setShowQuickAddModal(true)}
                    secondaryCtaLabel={hasAnyFilter ? t('vehicles.empty.clearFilters') : undefined}
                    onSecondaryCta={hasAnyFilter ? clearAllFilters : undefined}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[500px]">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                          {visibleVehicleCols.includes('matricula') && (
                            <th className="px-5 py-3 text-left">
                              <ColFilter label={t('vehicles.table.plate')} options={opts.matricula} selected={colFilters.matricula} onChange={setCol('matricula')} sortKey="registrationPlate" currentSort={sortState} onSort={handleSort} />
                            </th>
                          )}
                          {visibleVehicleCols.includes('vehiculo') && (
                            <th className="px-5 py-3 text-left">
                              <ColFilter label={t('vehicles.table.vehicle')} options={opts.vehiculo} selected={colFilters.vehiculo} onChange={setCol('vehiculo')} sortKey="vehiculo" currentSort={sortState} onSort={handleSort} />
                            </th>
                          )}
                          {visibleVehicleCols.includes('anyo') && (
                            <th className="px-5 py-3 text-left">
                              <ColFilter label={t('vehicles.table.yearKm')} options={[]} selected={[]} onChange={() => {}} sortKey="year" currentSort={sortState} onSort={handleSort} />
                            </th>
                          )}
                          {visibleVehicleCols.includes('precioCompra') && (
                            <th className="px-5 py-3 text-left">
                              <ColFilter label="Precio compra" options={[]} selected={[]} onChange={() => {}} sortKey="purchasePrice" currentSort={sortState} onSort={handleSort} />
                            </th>
                          )}
                          {visibleVehicleCols.includes('gastos') && (
                            <th className="px-5 py-3 text-left">
                              <ColFilter label="Gastos" options={[]} selected={[]} onChange={() => {}} sortKey="totalCosts" currentSort={sortState} onSort={handleSort} />
                            </th>
                          )}
                          {visibleVehicleCols.includes('precio') && (
                            <th className="px-5 py-3 text-left">
                              <ColFilter label={t('vehicles.table.salePrice')} options={opts.precio} selected={colFilters.precio} onChange={setCol('precio')} sortKey="salePrice" currentSort={sortState} onSort={handleSort} />
                            </th>
                          )}
                          {visibleVehicleCols.includes('margen') && (
                            <th className="px-5 py-3 text-left">
                              <ColFilter label="Margen" options={[]} selected={[]} onChange={() => {}} sortKey="margin" currentSort={sortState} onSort={handleSort} />
                            </th>
                          )}
                          {visibleVehicleCols.includes('estado') && (
                            <th className="px-5 py-3 text-left">
                              <ColFilter label={t('vehicles.table.status')} options={opts.estado} selected={colFilters.estado} onChange={setCol('estado')} sortKey="status" currentSort={sortState} onSort={handleSort}
                                renderOption={(opt) => {
                                  const entry = Object.values(VEHICLE_STATUS_TOKEN).find(t => t.label === opt);
                                  return (
                                    <span className="flex items-center gap-2">
                                      {entry && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${entry.dot}`} />}
                                      <span>{opt}</span>
                                    </span>
                                  );
                                }}
                              />
                            </th>
                          )}
                          {visibleVehicleCols.includes('comercial') && (
                            <th className="px-5 py-3 text-left">
                              <ColFilter label="Comercial" options={[...new Set(allWithDays.map((v: any) => v.assignedToName).filter(Boolean))].sort() as string[]} selected={[]} onChange={() => {}} sortKey="assignedToName" currentSort={sortState} onSort={handleSort} />
                            </th>
                          )}
                          {visibleVehicleCols.includes('fotos') && (
                            <th className="px-5 py-3 text-left">
                              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Fotos</span>
                            </th>
                          )}
                          {visibleVehicleCols.includes('observaciones') && (
                            <th className="px-5 py-3 text-left">
                              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Notas</span>
                            </th>
                          )}
                          {visibleVehicleCols.includes('ubicacion') && (
                            <th className="px-5 py-3 text-left">
                              <ColFilter label={t('vehicles.table.location')} options={opts.ubicacion} selected={colFilters.ubicacion} onChange={setCol('ubicacion')} sortKey="location" currentSort={sortState} onSort={handleSort} />
                            </th>
                          )}
                          {visibleVehicleCols.includes('centro') && hasWorkCenters && (
                            <th className="px-5 py-3 text-left">
                              <ColFilter label="Centro" options={[...new Set(allWithDays.map((v: any) => v.workCenterName).filter(Boolean))].sort() as string[]} selected={[]} onChange={() => {}} sortKey="workCenterName" currentSort={sortState} onSort={handleSort} />
                            </th>
                          )}
                          {visibleVehicleCols.includes('diasStock') && (
                            <th className="px-5 py-3 text-left">
                              <ColFilter label={t('vehicles.table.daysStock')} options={[]} selected={[]} onChange={() => {}} sortKey="daysInStock" currentSort={sortState} onSort={handleSort} />
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {isLoadingVehicles
                          ? Array.from({ length: 5 }).map((_, i) => <VehicleTableRowSkeleton key={i} />)
                          : paginatedVehicles.map((vehicle: any) => (
                              <VehicleTableRowDynamic key={vehicle.id} vehicle={vehicle} navigate={navigate} visibleCols={visibleVehicleCols} />
                            ))
                        }
                      </tbody>
                    </table>
                    {!isLoadingVehicles && filteredVehicles.length > 0 && (
                      <Pagination pagination={pagination} />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Empty state — cards */}
            {viewMode === 'cards' && !isLoadingVehicles && filteredVehicles.length === 0 && (
              <EmptyState
                type={hasAnyFilter ? 'search' : 'vehicles'}
                title={hasAnyFilter ? t('vehicles.empty.noResults') : t('vehicles.empty.catalogEmpty')}
                description={
                  hasAnyFilter
                    ? t('vehicles.empty.noResultsDesc')
                    : t('vehicles.empty.catalogEmptyDesc')
                }
                ctaLabel={hasAnyFilter ? undefined : t('vehicles.empty.addFirst')}
                onCta={hasAnyFilter ? undefined : () => setShowQuickAddModal(true)}
                secondaryCtaLabel={hasAnyFilter ? t('vehicles.empty.clearFilters') : undefined}
                onSecondaryCta={hasAnyFilter ? clearAllFilters : undefined}
              />
            )}
          </>
        )}

        {/* ── Tab: Ubicaciones ─────────────────────────────────────────── */}
        {activeTab === 'ubicaciones' && <VehiclesLocationsTab />}

      </div>

      <SAAS__VehicleQuickAddModal isOpen={showQuickAddModal} onClose={() => setShowQuickAddModal(false)} onSave={() => setShowQuickAddModal(false)} locations={locations} />
      <SAAS__VehicleReceptionWizard isOpen={showReceptionWizard} onClose={() => setShowReceptionWizard(false)} onComplete={() => setShowReceptionWizard(false)} locations={locations} />
      <SAAS__VehicleFiltersDrawer isOpen={showFilters} onClose={() => setShowFilters(false)} statusFilter={statusFilter} onStatusChange={setStatusFilter} locationFilter={locationFilter} onLocationChange={setLocationFilter} brandFilter={brandFilter} onBrandChange={setBrandFilter} daysInStockFilter={daysInStockFilter} onDaysInStockChange={setDaysInStockFilter} brands={brands} locations={locations} />
      <VehicleImportWizard isOpen={showImportWizard} onClose={() => setShowImportWizard(false)} locations={locations} />

      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="vehicles"
        moduleLabel="Vehículos"
        fields={VEHICLE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
        placeholder="Describe los vehículos que quieres dar de alta. Ejemplo:\n\n'Volkswagen Golf 1.6 TDI 2022, matrícula 1234ABC, 45.000km, diésel, blanco, precio compra 15.000€, venta 18.500€, ubicación nave principal.\nSeat León FR 2021, matrícula 5678DEF, gasolina, 30.000km, negro, compra 14.000€.'"
      />

      <GenericImportModal
        isOpen={showGenericImport}
        onClose={() => setShowGenericImport(false)}
        moduleLabel="Vehículos"
        fields={VEHICLE_IMPORT_FIELDS}
        onImport={handleGenericImport}
      />

      {/* V-02: Vehicle Comparator Modal */}
      {showComparator && (
        <VehicleComparatorModal
          vehicles={vehicles.filter((v: any) => selectedForCompare.includes(v.id))}
          onClose={() => setShowComparator(false)}
          onNavigate={(id) => navigate(`/saas/vehicles/${id}`)}
        />
      )}
    </Layout>
  );
}