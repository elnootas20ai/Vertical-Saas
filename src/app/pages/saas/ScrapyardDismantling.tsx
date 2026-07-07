import { useReducer, useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useScrapyard } from '../../context/ScrapyardContext';
import { useModalClose } from '../../hooks/useModalClose';
import type {
  DismantlingSession,
  DismantlingChecklistItem,
  ScrapyardPart,
  PartCategory,
  PartCompatibility,
} from '../../lib/scrapyardApi';
import {
  PART_CATEGORIES,
  PART_STATUS_MAP,
  getDismantlingSession,
  startDismantling,
  extractPartFromVehicle,
  markPartNotApplicable,
  addCustomPartToDismantling,
  pauseDismantlingSession,
  resumeDismantlingSession,
  completeDismantlingSession,
} from '../../lib/scrapyardApi';
import type { ScrapyardVehicle } from '../../lib/scrapyardTypes';
import { SCRAPYARD_ESTADOS } from '../../lib/scrapyardTypes';
import {
  ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronRight,
  Circle, Clock, Cog, GripVertical, History, ImagePlus, Loader2,
  Pause, Play, Plus, Save, Trash2, Truck, Weight, Wrench, X,
  XCircle, Shield, Car, Package,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';

// ─── Category icon map ───────────────────────────────────────────────────────

const CATEGORY_ICONS: Partial<Record<PartCategory, typeof Cog>> = {
  motor: Cog,
  caja_cambios: Cog,
  puertas: GripVertical,
  faros: Circle,
  paragolpes: Shield,
  llantas: Circle,
  interior: Package,
  retrovisores: Circle,
  frenos: Circle,
  suspension: Circle,
  electricidad: Circle,
  carroceria: Car,
  escape: Circle,
  direccion: Circle,
  climatizacion: Circle,
  otra: Wrench,
};

function getCategoryIcon(cat: PartCategory) {
  return CATEGORY_ICONS[cat] || Wrench;
}

function getCategoryLabel(cat: PartCategory): string {
  return PART_CATEGORIES.find(c => c.value === cat)?.label || cat;
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

interface FormState {
  nombre: string;
  categoria: PartCategory;
  estado: ScrapyardPart['estado'];
  precioVenta: number;
  precioMinimo: number;
  ubicacion: string;
  zona: string;
  estanteria: string;
  fotos: string[];
  observaciones: string;
  peso: number | null;
  garantiaMeses: number;
  compatibilidades: PartCompatibility[];
}

interface State {
  session: DismantlingSession | null;
  selectedIndex: number | null;
  form: FormState;
  saving: boolean;
  showHistory: boolean;
  showCompleteModal: boolean;
  loading: boolean;
  error: string | null;
  collapsedCategories: Set<string>;
  contextMenu: { index: number; x: number; y: number } | null;
  showCustomModal: boolean;
  customName: string;
  customCategory: PartCategory;
  mobileFormOpen: boolean;
}

type Action =
  | { type: 'SET_SESSION'; session: DismantlingSession | null }
  | { type: 'SELECT_ITEM'; index: number; item: DismantlingChecklistItem; vehicle: ScrapyardVehicle }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'UPDATE_FORM'; patch: Partial<FormState> }
  | { type: 'SET_SAVING'; saving: boolean }
  | { type: 'TOGGLE_HISTORY' }
  | { type: 'SHOW_COMPLETE_MODAL'; show: boolean }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'TOGGLE_CATEGORY'; category: string }
  | { type: 'SET_CONTEXT_MENU'; menu: State['contextMenu'] }
  | { type: 'SHOW_CUSTOM_MODAL'; show: boolean }
  | { type: 'SET_CUSTOM_NAME'; name: string }
  | { type: 'SET_CUSTOM_CATEGORY'; category: PartCategory }
  | { type: 'SET_MOBILE_FORM'; open: boolean };

function emptyForm(): FormState {
  return {
    nombre: '',
    categoria: 'otra',
    estado: 'disponible',
    precioVenta: 0,
    precioMinimo: 0,
    ubicacion: '',
    zona: '',
    estanteria: '',
    fotos: [],
    observaciones: '',
    peso: null,
    garantiaMeses: 3,
    compatibilidades: [],
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_SESSION':
      return { ...state, session: action.session, loading: false, error: null };
    case 'SELECT_ITEM': {
      const item = action.item;
      const vehicle = action.vehicle;
      return {
        ...state,
        selectedIndex: action.index,
        mobileFormOpen: true,
        form: {
          nombre: item.nombre,
          categoria: item.categoria,
          estado: 'disponible',
          precioVenta: 0,
          precioMinimo: 0,
          ubicacion: '',
          zona: '',
          estanteria: '',
          fotos: [],
          observaciones: '',
          peso: null,
          garantiaMeses: 3,
          compatibilidades: [{
            marca: vehicle.marca,
            modelo: vehicle.modelo,
            anioDesde: vehicle.anio,
            anioHasta: vehicle.anio,
            referenciasOEM: [],
          }],
        },
      };
    }
    case 'CLEAR_SELECTION':
      return { ...state, selectedIndex: null, form: emptyForm(), mobileFormOpen: false };
    case 'UPDATE_FORM':
      return { ...state, form: { ...state.form, ...action.patch } };
    case 'SET_SAVING':
      return { ...state, saving: action.saving };
    case 'TOGGLE_HISTORY':
      return { ...state, showHistory: !state.showHistory };
    case 'SHOW_COMPLETE_MODAL':
      return { ...state, showCompleteModal: action.show };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false };
    case 'TOGGLE_CATEGORY': {
      const next = new Set(state.collapsedCategories);
      next.has(action.category) ? next.delete(action.category) : next.add(action.category);
      return { ...state, collapsedCategories: next };
    }
    case 'SET_CONTEXT_MENU':
      return { ...state, contextMenu: action.menu };
    case 'SHOW_CUSTOM_MODAL':
      return { ...state, showCustomModal: action.show, customName: '', customCategory: 'otra' };
    case 'SET_CUSTOM_NAME':
      return { ...state, customName: action.name };
    case 'SET_CUSTOM_CATEGORY':
      return { ...state, customCategory: action.category };
    case 'SET_MOBILE_FORM':
      return { ...state, mobileFormOpen: action.open };
    default:
      return state;
  }
}

const initialState: State = {
  session: null,
  selectedIndex: null,
  form: emptyForm(),
  saving: false,
  showHistory: false,
  showCompleteModal: false,
  loading: true,
  error: null,
  collapsedCategories: new Set(),
  contextMenu: null,
  showCustomModal: false,
  customName: '',
  customCategory: 'otra',
  mobileFormOpen: false,
};

// ─── Vehicle selector (no vehicleId) ─────────────────────────────────────────

function VehicleSelector({ vehicles, loading, onSelect }: {
  vehicles: ScrapyardVehicle[];
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const eligible = useMemo(
    () => vehicles.filter(v => ['recibido', 'en_despiece'].includes(v.estado)),
    [vehicles],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (eligible.length === 0) {
    return (
      <div className="text-center py-32">
        <Truck className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <p className="text-lg font-semibold text-gray-600 dark:text-gray-300">No hay vehículos disponibles para despiece</p>
        <p className="text-sm text-gray-400 mt-1">Los vehículos con estado "Recibido" o "En despiece" aparecerán aquí</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white">Seleccionar vehículo para despiece</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {eligible.map(v => {
          const statusInfo = SCRAPYARD_ESTADOS.find(s => s.value === v.estado);
          const isDismantling = v.estado === 'en_despiece';
          return (
            <div key={v.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">{v.marca} {v.modelo}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{v.matricula}</p>
                </div>
                {statusInfo && (
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 mb-4">
                <p>Año: {v.anio} &middot; {v.km?.toLocaleString('es-ES')} km</p>
                <p>Entrada: {v.fechaEntrada}</p>
              </div>
              <button
                onClick={() => onSelect(v.id)}
                className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors ${
                  isDismantling
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isDismantling ? 'Continuar despiece' : 'Iniciar despiece'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Progress bar ────────────────────────────────────────────────────────────

function ProgressBar({ items }: { items: DismantlingChecklistItem[] }) {
  const applicable = items.filter(i => !i.noAplica);
  const extracted = applicable.filter(i => i.extraida).length;
  const total = applicable.length;
  const percent = total > 0 ? Math.round((extracted / total) * 100) : 0;

  const barColor = percent >= 100
    ? 'bg-emerald-500'
    : percent >= 60
      ? 'bg-blue-500'
      : 'bg-blue-400';

  return (
    <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
        <span className="font-medium">{extracted}/{total} piezas — {percent}%</span>
        {percent >= 100 && <span className="text-emerald-500 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Completo</span>}
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

// ─── Checklist panel ─────────────────────────────────────────────────────────

function ChecklistPanel({
  items, selectedIndex, collapsed, onSelect, onToggleCategory, onContextMenu, onAddCustom,
}: {
  items: DismantlingChecklistItem[];
  selectedIndex: number | null;
  collapsed: Set<string>;
  onSelect: (index: number) => void;
  onToggleCategory: (cat: string) => void;
  onContextMenu: (index: number, e: React.MouseEvent) => void;
  onAddCustom: () => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<PartCategory, { indices: number[]; items: DismantlingChecklistItem[] }>();
    items.forEach((item, idx) => {
      if (!map.has(item.categoria)) map.set(item.categoria, { indices: [], items: [] });
      const g = map.get(item.categoria)!;
      g.indices.push(idx);
      g.items.push(item);
    });
    return map;
  }, [items]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {Array.from(grouped.entries()).map(([cat, group]) => {
          const isCollapsed = collapsed.has(cat);
          const extracted = group.items.filter(i => i.extraida).length;
          const applicable = group.items.filter(i => !i.noAplica).length;
          const Icon = getCategoryIcon(cat);

          return (
            <div key={cat}>
              <button
                onClick={() => onToggleCategory(cat)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
              >
                {isCollapsed
                  ? <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                }
                <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate flex-1">
                  {getCategoryLabel(cat)}
                </span>
                <span className="text-xs text-gray-400 shrink-0">{extracted}/{applicable}</span>
              </button>

              {!isCollapsed && group.items.map((item, i) => {
                const globalIdx = group.indices[i];
                const isSelected = selectedIndex === globalIdx;

                return (
                  <button
                    key={globalIdx}
                    onClick={() => { if (!item.extraida && !item.noAplica) onSelect(globalIdx); }}
                    onContextMenu={e => onContextMenu(globalIdx, e)}
                    className={`w-full flex items-center gap-2 pl-9 pr-3 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : item.extraida || item.noAplica
                          ? 'text-gray-400 dark:text-gray-500'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30'
                    }`}
                  >
                    {item.extraida ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : item.noAplica ? (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                    )}
                    <span className={`truncate ${item.extraida ? 'line-through' : ''}`}>{item.nombre}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 p-3">
        <AddButtonDropdown
                label="Nuevo desguace"
                onQuickAdd={onAddCustom}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de desguace"
              />
      </div>
    </div>
  );
}

// ─── Compatibility editor ────────────────────────────────────────────────────

function CompatibilityEditor({ value, onChange }: {
  value: PartCompatibility[];
  onChange: (v: PartCompatibility[]) => void;
}) {
  const addRow = () => onChange([...value, { marca: '', modelo: '', anioDesde: null, anioHasta: null, referenciasOEM: [] }]);
  const removeRow = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<PartCompatibility>) => {
    onChange(value.map((row, idx) => idx === i ? { ...row, ...patch } : row));
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Compatibilidades</label>
      {value.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_80px_80px_auto] gap-2 items-center">
          <input
            value={row.marca}
            onChange={e => updateRow(i, { marca: e.target.value })}
            placeholder="Marca"
            className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs dark:text-gray-100"
          />
          <input
            value={row.modelo}
            onChange={e => updateRow(i, { modelo: e.target.value })}
            placeholder="Modelo"
            className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs dark:text-gray-100"
          />
          <input
            type="number"
            value={row.anioDesde ?? ''}
            onChange={e => updateRow(i, { anioDesde: e.target.value ? Number(e.target.value) : null })}
            placeholder="Desde"
            className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs dark:text-gray-100"
          />
          <input
            type="number"
            value={row.anioHasta ?? ''}
            onChange={e => updateRow(i, { anioHasta: e.target.value ? Number(e.target.value) : null })}
            placeholder="Hasta"
            className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs dark:text-gray-100"
          />
          <button onClick={() => removeRow(i)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button onClick={addRow} className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
        <Plus className="w-3 h-3" /> Añadir
      </button>
    </div>
  );
}

// ─── Catalog form (right panel) ──────────────────────────────────────────────

function CatalogForm({
  form, selectedIndex, session, saving, onUpdate, onSave, onClose,
}: {
  form: FormState;
  selectedIndex: number | null;
  session: DismantlingSession;
  saving: boolean;
  onUpdate: (patch: Partial<FormState>) => void;
  onSave: () => void;
  onClose?: () => void;
}) {
  if (selectedIndex === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Wrench className="w-16 h-16 text-gray-200 dark:text-gray-700 mb-4" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">Selecciona una pieza del checklist</p>
        <p className="text-xs text-gray-400 mt-1">Haz clic en una pieza pendiente para rellenar sus datos</p>
      </div>
    );
  }

  const item = session.piezasPrevistas[selectedIndex];
  if (!item || item.extraida || item.noAplica) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <CheckCircle2 className="w-16 h-16 text-emerald-200 dark:text-emerald-800 mb-4" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">Esta pieza ya fue procesada</p>
      </div>
    );
  }

  const codigoPrefix = PART_CATEGORIES.find(c => c.value === form.categoria)?.prefix || 'OTR';
  const codigoInterno = `${codigoPrefix}-${session._id.slice(-4).toUpperCase()}-${String(selectedIndex + 1).padStart(4, '0')}`;

  return (
    <div className="flex flex-col h-full">
      {onClose && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 lg:hidden">
          <button onClick={onClose} className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
            <ArrowLeft className="w-4 h-4" /> Volver al checklist
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Nombre</label>
          <input
            value={form.nombre}
            onChange={e => onUpdate({ nombre: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Categoría</label>
            <input
              value={getCategoryLabel(form.categoria)}
              disabled
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Código</label>
            <input
              value={codigoInterno}
              disabled
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Estado</label>
          <select
            value={form.estado}
            onChange={e => onUpdate({ estado: e.target.value as ScrapyardPart['estado'] })}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
          >
            {Object.entries(PART_STATUS_MAP).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Precio venta (€)</label>
            <input
              type="number"
              value={form.precioVenta || ''}
              onChange={e => onUpdate({ precioVenta: Number(e.target.value) })}
              placeholder="0"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Precio mínimo (€)</label>
            <input
              type="number"
              value={form.precioMinimo || ''}
              onChange={e => onUpdate({ precioMinimo: Number(e.target.value) })}
              placeholder="0"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Ubicación</label>
          <input
            value={form.ubicacion}
            onChange={e => onUpdate({ ubicacion: e.target.value })}
            placeholder="Nave 2, Pasillo B..."
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Zona</label>
            <input
              value={form.zona}
              onChange={e => onUpdate({ zona: e.target.value })}
              placeholder="A1"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Estantería</label>
            <input
              value={form.estanteria}
              onChange={e => onUpdate({ estanteria: e.target.value })}
              placeholder="E-03"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Fotos</label>
          <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center hover:border-blue-400 dark:hover:border-blue-600 transition-colors cursor-pointer">
            <ImagePlus className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Arrastra fotos aquí o haz clic para seleccionar</p>
            <input type="file" accept="image/*" multiple className="hidden" />
          </div>
        </div>

        <CompatibilityEditor
          value={form.compatibilidades}
          onChange={v => onUpdate({ compatibilidades: v })}
        />

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Observaciones</label>
          <textarea
            value={form.observaciones}
            onChange={e => onUpdate({ observaciones: e.target.value })}
            rows={3}
            placeholder="Estado de la pieza, daños, notas..."
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              <Weight className="w-3.5 h-3.5" /> Peso (kg)
            </label>
            <input
              type="number"
              value={form.peso ?? ''}
              onChange={e => onUpdate({ peso: e.target.value ? Number(e.target.value) : null })}
              placeholder="0"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
            />
          </div>
          <div>
            <label className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              <Shield className="w-3.5 h-3.5" /> Garantía (meses)
            </label>
            <input
              type="number"
              value={form.garantiaMeses}
              onChange={e => onUpdate({ garantiaMeses: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
        <button
          onClick={onSave}
          disabled={saving || !form.nombre}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Extraer y guardar
        </button>
      </div>
    </div>
  );
}

// ─── History panel ───────────────────────────────────────────────────────────

function HistoryPanel({ session, onClose }: { session: DismantlingSession; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalClose(true, onClose);

  const entries = [...session.historial].reverse();

  const actionLabels: Record<string, { label: string; color: string }> = {
    start: { label: 'Inicio', color: 'text-blue-500' },
    extract: { label: 'Extracción', color: 'text-emerald-500' },
    not_applicable: { label: 'No aplica', color: 'text-orange-500' },
    add_custom: { label: 'Pieza custom', color: 'text-purple-500' },
    pause: { label: 'Pausa', color: 'text-amber-500' },
    resume: { label: 'Reanudación', color: 'text-blue-400' },
    complete: { label: 'Completado', color: 'text-emerald-600' },
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={ref}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-gray-800 h-full shadow-2xl flex flex-col animate-slide-in-right"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <History className="w-5 h-5" /> Historial
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {entries.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin historial</p>
          ) : (
            <div className="space-y-3">
              {entries.map((entry, i) => {
                const info = actionLabels[entry.action] || { label: entry.action, color: 'text-gray-500' };
                return (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-2 h-2 rounded-full mt-2 ${info.color.replace('text-', 'bg-')}`} />
                      {i < entries.length - 1 && <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 mt-1" />}
                    </div>
                    <div className="pb-3">
                      <p className="text-sm text-gray-700 dark:text-gray-200">
                        <span className={`font-semibold ${info.color}`}>{info.label}</span>
                        {' '}&mdash; {entry.detail}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(entry.timestamp).toLocaleString('es-ES')} &middot; {entry.userName}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Complete modal ──────────────────────────────────────────────────────────

function CompleteModal({ session, onConfirm, onCancel, loading }: {
  session: DismantlingSession;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  useModalClose(true, onCancel);

  const items = session.piezasPrevistas;
  const extracted = items.filter(i => i.extraida).length;
  const notApplicable = items.filter(i => i.noAplica).length;
  const pending = items.filter(i => !i.extraida && !i.noAplica).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Completar despiece</h3>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            ¿Estás seguro de que deseas marcar este despiece como completado?
          </p>
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Piezas extraídas</span>
              <span className="font-semibold text-emerald-600">{extracted}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">No aplica</span>
              <span className="font-semibold text-orange-500">{notApplicable}</span>
            </div>
            {pending > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Pendientes</span>
                <span className="font-semibold text-red-500">{pending}</span>
              </div>
            )}
          </div>
          {pending > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Hay {pending} pieza(s) pendiente(s). Deben ser extraídas o marcadas como "No aplica" antes de completar.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={pending > 0 || loading}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Completar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ScrapyardDismantling() {
  const navigate = useNavigate();
  const { vehicleId } = useParams<{ vehicleId?: string }>();
  const { user } = useAuth();
  const { vehicles, loading: vehiclesLoading, getVehicle, updateVehicle } = useScrapyard();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [completing, setCompleting] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'vehicle', label: 'Vehículo' },
    { key: 'date', label: 'Fecha' },
    { key: 'worker', label: 'Operario' },
    { key: 'status', label: 'Estado' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'vehicle', label: 'Vehículo', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'worker', label: 'Operario', example: '' },
    { key: 'status', label: 'Estado', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, {
      create: (uid, data) => createScrapyardTask(uid, data),
    }, entries, (entry) => ({
      title: entryStr(entry, 'name', 'title', 'titulo'),
      description: entryStr(entry, 'description', 'descripcion'),
      status: 'pending',
      taskType: 'dismantling',
    }));
    if (created > 0) {
      toast.success(`${created} desguace(s) creado(s)`);
      void loadSession();
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  const userId = (user as any)?.user_id || (user as any)?.id || '';
  const userName = (user as any)?.name || (user as any)?.email || 'Sistema';
  const vehicle = vehicleId ? getVehicle(vehicleId) : undefined;

  const loadSession = useCallback(async () => {
    if (!vehicleId || !userId) return;
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      const session = await getDismantlingSession(userId, vehicleId);
      dispatch({ type: 'SET_SESSION', session });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : 'Error al cargar sesión' });
    }
  }, [vehicleId, userId]);

  useEffect(() => { loadSession(); }, [loadSession]);

  const handleStartDismantling = useCallback(async () => {
    if (!vehicleId || !userId) return;
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      const session = await startDismantling(userId, vehicleId);
      dispatch({ type: 'SET_SESSION', session });
      await updateVehicle(vehicleId, { estado: 'en_despiece' });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : 'Error al iniciar despiece' });
    }
  }, [vehicleId, userId, updateVehicle]);

  const handleResume = useCallback(async () => {
    if (!vehicleId || !userId) return;
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      const session = await resumeDismantlingSession(userId, vehicleId);
      dispatch({ type: 'SET_SESSION', session });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : 'Error al reanudar' });
    }
  }, [vehicleId, userId]);

  const handleSelectItem = useCallback((index: number) => {
    if (!state.session || !vehicle) return;
    const item = state.session.piezasPrevistas[index];
    if (item.extraida || item.noAplica) return;
    dispatch({ type: 'SELECT_ITEM', index, item, vehicle });
  }, [state.session, vehicle]);

  const handleExtract = useCallback(async () => {
    if (!vehicleId || !userId || state.selectedIndex === null || !state.session) return;
    dispatch({ type: 'SET_SAVING', saving: true });

    const codigoPrefix = PART_CATEGORIES.find(c => c.value === state.form.categoria)?.prefix || 'OTR';
    const codigoInterno = `${codigoPrefix}-${state.session._id.slice(-4).toUpperCase()}-${String(state.selectedIndex + 1).padStart(4, '0')}`;

    try {
      await extractPartFromVehicle(userId, vehicleId, {
        checklistIndex: state.selectedIndex,
        partData: {
          nombre: state.form.nombre,
          categoria: state.form.categoria,
          estado: state.form.estado,
          precioVenta: state.form.precioVenta,
          precioMinimo: state.form.precioMinimo,
          ubicacion: state.form.ubicacion,
          zona: state.form.zona,
          estanteria: state.form.estanteria,
          fotos: state.form.fotos,
          observaciones: state.form.observaciones,
          peso: state.form.peso,
          garantiaMeses: state.form.garantiaMeses,
          compatibilidades: state.form.compatibilidades,
          codigoInterno,
          vehiculoOrigenId: vehicleId,
          vehiculoOrigenLabel: vehicle ? `${vehicle.marca} ${vehicle.modelo}` : '',
          vehiculoOrigenMatricula: vehicle?.matricula || '',
        },
      });

      const refreshed = await getDismantlingSession(userId, vehicleId);
      dispatch({ type: 'SET_SESSION', session: refreshed });

      const nextIndex = refreshed?.piezasPrevistas.findIndex(
        (p, i) => i > state.selectedIndex! && !p.extraida && !p.noAplica,
      ) ?? -1;

      if (nextIndex >= 0 && refreshed && vehicle) {
        dispatch({ type: 'SELECT_ITEM', index: nextIndex, item: refreshed.piezasPrevistas[nextIndex], vehicle });
      } else {
        dispatch({ type: 'CLEAR_SELECTION' });
      }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : 'Error al extraer pieza' });
    } finally {
      dispatch({ type: 'SET_SAVING', saving: false });
    }
  }, [vehicleId, userId, state.selectedIndex, state.session, state.form, vehicle]);

  const handleMarkNotApplicable = useCallback(async (index: number) => {
    if (!vehicleId || !userId) return;
    dispatch({ type: 'SET_CONTEXT_MENU', menu: null });
    try {
      const session = await markPartNotApplicable(userId, vehicleId, {
        checklistIndex: index,
        motivo: 'No aplica para este vehículo',
      });
      dispatch({ type: 'SET_SESSION', session });
      if (state.selectedIndex === index) {
        dispatch({ type: 'CLEAR_SELECTION' });
      }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : 'Error al marcar como no aplica' });
    }
  }, [vehicleId, userId, state.selectedIndex]);

  const handlePause = useCallback(async () => {
    if (!vehicleId || !userId) return;
    try {
      await pauseDismantlingSession(userId, vehicleId);
      navigate('/saas/vertical/desguaces/despiece');
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : 'Error al pausar' });
    }
  }, [vehicleId, userId, navigate]);

  const handleComplete = useCallback(async () => {
    if (!vehicleId || !userId) return;
    setCompleting(true);
    try {
      await completeDismantlingSession(userId, vehicleId);
      await updateVehicle(vehicleId, { estado: 'despiezado' });
      navigate('/saas/vertical/desguaces/despiece');
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : 'Error al completar' });
    } finally {
      setCompleting(false);
    }
  }, [vehicleId, userId, navigate, updateVehicle]);

  const handleAddCustom = useCallback(async () => {
    if (!vehicleId || !userId || !state.customName.trim()) return;
    dispatch({ type: 'SHOW_CUSTOM_MODAL', show: false });
    try {
      await addCustomPartToDismantling(userId, vehicleId, {
        nombre: state.customName.trim(),
        categoria: state.customCategory,
        vehiculoOrigenId: vehicleId,
        vehiculoOrigenLabel: vehicle ? `${vehicle.marca} ${vehicle.modelo}` : '',
        vehiculoOrigenMatricula: vehicle?.matricula || '',
      });
      const refreshed = await getDismantlingSession(userId, vehicleId);
      dispatch({ type: 'SET_SESSION', session: refreshed });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : 'Error al añadir pieza' });
    }
  }, [vehicleId, userId, state.customName, state.customCategory, vehicle]);

  const handleContextMenu = useCallback((index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const item = state.session?.piezasPrevistas[index];
    if (!item || item.extraida || item.noAplica) return;
    dispatch({ type: 'SET_CONTEXT_MENU', menu: { index, x: e.clientX, y: e.clientY } });
  }, [state.session]);

  useEffect(() => {
    if (!state.contextMenu) return;
    const close = () => dispatch({ type: 'SET_CONTEXT_MENU', menu: null });
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [state.contextMenu]);

  // ─── No vehicleId → vehicle selector ─────────────────────────────────────

  if (!vehicleId) {
    return (
      <Layout title="Despiece">
        <VehicleSelector
          vehicles={vehicles}
          loading={vehiclesLoading}
          onSelect={id => navigate(`/saas/vertical/desguaces/despiece/${id}`)}
        />
      </Layout>
    );
  }

  // ─── Loading state ───────────────────────────────────────────────────────

  if (state.loading) {
    return (
      <Layout title="Despiece">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </Layout>
    );
  }

  // ─── Error state ─────────────────────────────────────────────────────────

  if (state.error) {
    return (
      <Layout title="Despiece">
        <div className="text-center py-20">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-red-600 dark:text-red-400 font-medium">{state.error}</p>
          <button onClick={loadSession} className="mt-4 text-sm text-blue-600 hover:underline">Reintentar</button>
        </div>
      </Layout>
    );
  }

  // ─── No session yet → start button ───────────────────────────────────────

  if (!state.session) {
    return (
      <Layout title="Despiece">
        <div className="text-center py-20">
          <Wrench className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">
            {vehicle ? `${vehicle.marca} ${vehicle.modelo} — ${vehicle.matricula}` : 'Vehículo'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Este vehículo aún no tiene una sesión de despiece activa
          </p>
          <button
            onClick={handleStartDismantling}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <Play className="w-4 h-4" /> Iniciar despiece
          </button>
        </div>
      </Layout>
    );
  }

  // ─── Paused session → resume button ──────────────────────────────────────

  if (state.session.status === 'paused') {
    return (
      <Layout title="Despiece">
        <div className="text-center py-20">
          <Pause className="w-16 h-16 text-amber-400 mx-auto mb-4" />
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">Despiece en pausa</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {vehicle ? `${vehicle.marca} ${vehicle.modelo} — ${vehicle.matricula}` : state.session.vehicleLabel}
          </p>
          <button
            onClick={handleResume}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <Play className="w-4 h-4" /> Reanudar despiece
          </button>
        </div>
      </Layout>
    );
  }

  // ─── Main dismantling view ───────────────────────────────────────────────

  const session = state.session;
  const vehicleLabel = vehicle
    ? `${vehicle.marca} ${vehicle.modelo} (${vehicle.matricula})`
    : session.vehicleLabel;

  return (
    <Layout title="Despiece">
      <div className="flex flex-col h-[calc(100vh-64px)]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
          <button
            onClick={() => navigate('/saas/vertical/desguaces/despiece')}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">
              Despiece — {vehicleLabel}
            </h1>
          </div>
          {session.status === 'completed' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" /> Completado
            </span>
          )}
        </div>

        {/* Progress */}
        <ProgressBar items={session.piezasPrevistas} />

        {/* Main content: 2-panel layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel - Checklist (desktop + tablet collapsed) */}
          <div className={`border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0 overflow-hidden flex flex-col
            w-full md:w-[60px] lg:w-[340px]
            ${state.mobileFormOpen ? 'hidden md:flex' : 'flex'}
          `}>
            <div className="hidden lg:flex flex-col h-full">
              <ChecklistPanel
                items={session.piezasPrevistas}
                selectedIndex={state.selectedIndex}
                collapsed={state.collapsedCategories}
                onSelect={handleSelectItem}
                onToggleCategory={cat => dispatch({ type: 'TOGGLE_CATEGORY', category: cat })}
                onContextMenu={handleContextMenu}
                onAddCustom={() => dispatch({ type: 'SHOW_CUSTOM_MODAL', show: true })}
              />
            </div>

            {/* Tablet collapsed strip */}
            <div className="hidden md:flex lg:hidden flex-col items-center py-2 gap-1 overflow-y-auto h-full">
              {Array.from(new Set(session.piezasPrevistas.map(p => p.categoria))).map(cat => {
                const Icon = getCategoryIcon(cat);
                const items = session.piezasPrevistas.filter(p => p.categoria === cat);
                const done = items.filter(i => i.extraida || i.noAplica).length;
                const allDone = done === items.length;
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      const idx = session.piezasPrevistas.findIndex(p => p.categoria === cat && !p.extraida && !p.noAplica);
                      if (idx >= 0) handleSelectItem(idx);
                    }}
                    title={getCategoryLabel(cat)}
                    className={`p-2 rounded-lg transition-colors ${allDone ? 'text-emerald-500' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >
                    <Icon className="w-5 h-5" />
                  </button>
                );
              })}
              <button
                onClick={() => dispatch({ type: 'SHOW_CUSTOM_MODAL', show: true })}
                className="p-2 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 mt-auto"
                title="Añadir pieza"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile full checklist */}
            <div className="flex md:hidden flex-col h-full">
              <ChecklistPanel
                items={session.piezasPrevistas}
                selectedIndex={state.selectedIndex}
                collapsed={state.collapsedCategories}
                onSelect={handleSelectItem}
                onToggleCategory={cat => dispatch({ type: 'TOGGLE_CATEGORY', category: cat })}
                onContextMenu={handleContextMenu}
                onAddCustom={() => dispatch({ type: 'SHOW_CUSTOM_MODAL', show: true })}
              />
            </div>
          </div>

          {/* Right panel - Catalog form */}
          <div className={`flex-1 bg-gray-50 dark:bg-gray-900/50 overflow-hidden
            ${state.mobileFormOpen ? 'flex flex-col' : 'hidden md:flex md:flex-col'}
          `}>
            <CatalogForm
              form={state.form}
              selectedIndex={state.selectedIndex}
              session={session}
              saving={state.saving}
              onUpdate={patch => dispatch({ type: 'UPDATE_FORM', patch })}
              onSave={handleExtract}
              onClose={state.mobileFormOpen ? () => dispatch({ type: 'SET_MOBILE_FORM', open: false }) : undefined}
            />
          </div>
        </div>

        {/* Footer */}
        {session.status !== 'completed' && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
            <button
              onClick={handlePause}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            >
              <Pause className="w-4 h-4" /> Pausar despiece
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => dispatch({ type: 'TOGGLE_HISTORY' })}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <History className="w-4 h-4" /> Historial
              </button>
              <button
                onClick={() => dispatch({ type: 'SHOW_COMPLETE_MODAL', show: true })}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <Check className="w-4 h-4" /> Completar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Context menu */}
      {state.contextMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
          style={{ top: state.contextMenu.y, left: state.contextMenu.x }}
        >
          <button
            onClick={() => handleMarkNotApplicable(state.contextMenu!.index)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <XCircle className="w-4 h-4" /> Marcar como "No aplica"
          </button>
        </div>
      )}

      {/* History slide-out */}
      {state.showHistory && (
        <HistoryPanel
          session={session}
          onClose={() => dispatch({ type: 'TOGGLE_HISTORY' })}
        />
      )}

      {/* Complete modal */}
      {state.showCompleteModal && (
        <CompleteModal
          session={session}
          onConfirm={handleComplete}
          onCancel={() => dispatch({ type: 'SHOW_COMPLETE_MODAL', show: false })}
          loading={completing}
        />
      )}

      {/* Custom part modal */}
      {state.showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => dispatch({ type: 'SHOW_CUSTOM_MODAL', show: false })}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Añadir pieza personalizada</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Nombre de la pieza</label>
                <input
                  value={state.customName}
                  onChange={e => dispatch({ type: 'SET_CUSTOM_NAME', name: e.target.value })}
                  placeholder="Ej: Compresor aire acondicionado"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Categoría</label>
                <select
                  value={state.customCategory}
                  onChange={e => dispatch({ type: 'SET_CUSTOM_CATEGORY', category: e.target.value as PartCategory })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                >
                  {PART_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => dispatch({ type: 'SHOW_CUSTOM_MODAL', show: false })}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddCustom}
                disabled={!state.customName.trim()}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Añadir
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.2s ease-out;
        }
      `}</style>
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="scrapyard_dismantling"
        moduleLabel="Despiece"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Despiece"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
