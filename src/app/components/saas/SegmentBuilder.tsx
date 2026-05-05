import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, Save, FolderOpen, X, Filter, ChevronDown, Loader2 } from 'lucide-react';
import {
  listSegmentsRequest,
  createSegmentRequest,
  deleteSegmentRequest,
  type CrmSegment,
} from '../../lib/crmApi';

// ─── Types ───────────────────────────────────────────────────────────────────

export type FilterField =
  | 'status' | 'responsible' | 'source' | 'city' | 'tag'
  | 'lastContact' | 'createdAt' | 'budget' | 'vehicleInterest'
  | 'vehiclesPurchasedCount' | 'clvSegment' | 'utm_source' | 'hasEmail' | 'hasDni';

export type FilterOperator =
  | 'equals' | 'not_equals' | 'contains' | 'not_contains'
  | 'gt' | 'lt' | 'days_ago_gt' | 'days_ago_lt' | 'is_empty' | 'is_not_empty';

export interface FilterCondition {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  value: string;
}

export interface SavedSegment {
  id: string;
  name: string;
  entityType: 'leads' | 'clients' | 'both';
  conditions: FilterCondition[];
  createdAt: string;
}

const STORAGE_KEY = 'vertial-crm-segments';

// ─── Field Definitions ───────────────────────────────────────────────────────

const LEAD_FIELDS: Array<{ id: FilterField; label: string; type: 'select' | 'text' | 'number' | 'date_days' | 'boolean' }> = [
  { id: 'status',          label: 'Estado del lead',      type: 'select' },
  { id: 'responsible',     label: 'Responsable',          type: 'text' },
  { id: 'source',          label: 'Origen/fuente',        type: 'text' },
  { id: 'vehicleInterest', label: 'Vehículo de interés',  type: 'text' },
  { id: 'budget',          label: 'Presupuesto',          type: 'text' },
  { id: 'tag',             label: 'Etiqueta',             type: 'text' },
  { id: 'lastContact',     label: 'Último contacto',      type: 'date_days' },
  { id: 'createdAt',       label: 'Fecha de creación',    type: 'date_days' },
  { id: 'utm_source',      label: 'UTM Source',           type: 'text' },
  { id: 'hasEmail',        label: 'Tiene email',          type: 'boolean' },
];

const CLIENT_FIELDS: Array<{ id: FilterField; label: string; type: 'select' | 'text' | 'number' | 'date_days' | 'boolean' }> = [
  { id: 'status',                  label: 'Estado',                   type: 'select' },
  { id: 'responsible',             label: 'Responsable',              type: 'text' },
  { id: 'city',                    label: 'Ciudad',                   type: 'text' },
  { id: 'tag',                     label: 'Etiqueta',                 type: 'text' },
  { id: 'vehiclesPurchasedCount',  label: 'Vehículos comprados',      type: 'number' },
  { id: 'clvSegment',              label: 'Segmento CLV',             type: 'select' },
  { id: 'lastContact',             label: 'Último contacto',          type: 'date_days' },
  { id: 'createdAt',               label: 'Fecha de creación',        type: 'date_days' },
  { id: 'hasDni',                  label: 'Tiene DNI/NIE',            type: 'boolean' },
];

const OPERATOR_OPTIONS: Record<string, Array<{ id: FilterOperator; label: string }>> = {
  text: [
    { id: 'contains',     label: 'contiene' },
    { id: 'not_contains', label: 'no contiene' },
    { id: 'equals',       label: 'es igual a' },
    { id: 'not_equals',   label: 'no es igual a' },
    { id: 'is_empty',     label: 'está vacío' },
    { id: 'is_not_empty', label: 'no está vacío' },
  ],
  select: [
    { id: 'equals',     label: 'es' },
    { id: 'not_equals', label: 'no es' },
  ],
  number: [
    { id: 'equals', label: 'igual a' },
    { id: 'gt',     label: 'mayor que' },
    { id: 'lt',     label: 'menor que' },
  ],
  date_days: [
    { id: 'days_ago_gt', label: 'hace más de N días' },
    { id: 'days_ago_lt', label: 'hace menos de N días' },
  ],
  boolean: [
    { id: 'equals',     label: 'sí' },
    { id: 'not_equals', label: 'no' },
  ],
};

const STATUS_OPTIONS_LEAD = ['new', 'contacted', 'appointment', 'reserved', 'negotiation', 'won', 'lost'];
const STATUS_OPTIONS_CLIENT = ['active', 'inactive', 'vip', 'blocked'];
const CLV_OPTIONS = ['vip', 'high', 'medium', 'low'];

function getSelectOptions(field: FilterField, entityType: 'leads' | 'clients' | 'both'): string[] {
  if (field === 'status') return entityType === 'clients' ? STATUS_OPTIONS_CLIENT : STATUS_OPTIONS_LEAD;
  if (field === 'clvSegment') return CLV_OPTIONS;
  return [];
}

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Saved Segments Storage ──────────────────────────────────────────────────

export function loadSavedSegments(): SavedSegment[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveSegments(segments: SavedSegment[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(segments));
}

// ─── Apply Filters to Records ────────────────────────────────────────────────

function applyCondition(record: any, condition: FilterCondition): boolean {
  const { field, operator, value } = condition;

  const getVal = (): string | number => {
    if (field === 'vehiclesPurchasedCount') return (record.vehiclesPurchased || []).length;
    if (field === 'tag') return (record.tags || []).join(' ');
    if (field === 'hasEmail') return record.email ? 'true' : 'false';
    if (field === 'hasDni') return record.dni ? 'true' : 'false';
    if (field === 'lastContact') {
      const lc = record.lastContact;
      if (!lc) return 99999;
      const ms = typeof lc === 'object' && 'getTime' in lc ? lc.getTime() : new Date(lc).getTime();
      return Math.floor((Date.now() - ms) / 86400000);
    }
    if (field === 'createdAt') {
      const ca = record.createdAt;
      if (!ca) return 99999;
      const ms = ca instanceof Date ? ca.getTime() : new Date(ca).getTime();
      return Math.floor((Date.now() - ms) / 86400000);
    }
    return String(record[field] || '');
  };

  const recordVal = getVal();
  const numVal = Number(value);

  switch (operator) {
    case 'equals':       return String(recordVal).toLowerCase() === value.toLowerCase();
    case 'not_equals':   return String(recordVal).toLowerCase() !== value.toLowerCase();
    case 'contains':     return String(recordVal).toLowerCase().includes(value.toLowerCase());
    case 'not_contains': return !String(recordVal).toLowerCase().includes(value.toLowerCase());
    case 'gt':           return Number(recordVal) > numVal;
    case 'lt':           return Number(recordVal) < numVal;
    case 'days_ago_gt':  return Number(recordVal) > numVal;
    case 'days_ago_lt':  return Number(recordVal) < numVal;
    case 'is_empty':     return !String(recordVal).trim();
    case 'is_not_empty': return Boolean(String(recordVal).trim());
    default:             return true;
  }
}

export function applySegmentFilters<T extends Record<string, any>>(records: T[], conditions: FilterCondition[]): T[] {
  if (!conditions.length) return records;
  return records.filter(record => conditions.every(cond => applyCondition(record, cond)));
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  entityType: 'leads' | 'clients' | 'both';
  conditions: FilterCondition[];
  onChange: (conditions: FilterCondition[]) => void;
  resultCount?: number;
  onClose?: () => void;
  /** userId del auth context para persistir segmentos en servidor */
  userId?: string;
}

export function SegmentBuilder({ entityType, conditions, onChange, resultCount, onClose, userId }: Props) {
  // C-04: Segmentos desde backend cuando hay userId; fallback a localStorage
  const [savedSegments, setSavedSegments] = useState<SavedSegment[]>(loadSavedSegments);
  const [saveName, setSaveName] = useState('');
  const [showSaved, setShowSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSegments, setLoadingSegments] = useState(false);

  // Cargar segmentos del backend si tenemos userId
  useEffect(() => {
    if (!userId) return;
    setLoadingSegments(true);
    listSegmentsRequest(userId)
      .then((serverSegments) => {
        // Mapear CrmSegment → SavedSegment
        const mapped: SavedSegment[] = serverSegments.map((s: CrmSegment) => ({
          id: s.id,
          name: s.name,
          entityType: s.entityType,
          conditions: s.conditions as FilterCondition[],
          createdAt: s.createdAt,
        }));
        setSavedSegments(mapped);
      })
      .catch(() => {
        // Fallback a localStorage si falla el backend
        setSavedSegments(loadSavedSegments());
      })
      .finally(() => setLoadingSegments(false));
  }, [userId]);

  const fields = entityType === 'clients' ? CLIENT_FIELDS : LEAD_FIELDS;

  const addCondition = () => {
    const first = fields[0];
    const operators = OPERATOR_OPTIONS[first.type] || OPERATOR_OPTIONS.text;
    onChange([...conditions, { id: uuid(), field: first.id, operator: operators[0].id, value: '' }]);
  };

  const updateCondition = useCallback((id: string, patch: Partial<FilterCondition>) => {
    onChange(conditions.map(c => c.id === id ? { ...c, ...patch } : c));
  }, [conditions, onChange]);

  const removeCondition = (id: string) => {
    onChange(conditions.filter(c => c.id !== id));
  };

  const saveSegment = async () => {
    if (!saveName.trim() || !conditions.length) return;
    setSaving(true);
    try {
      if (userId) {
        const created = await createSegmentRequest(userId, {
          name: saveName.trim(),
          entityType,
          conditions: conditions as CrmSegment['conditions'],
        });
        if (created) {
          const newSeg: SavedSegment = {
            id: created.id,
            name: created.name,
            entityType: created.entityType,
            conditions: created.conditions as FilterCondition[],
            createdAt: created.createdAt,
          };
          setSavedSegments((prev) => [newSeg, ...prev]);
        }
      } else {
        const next: SavedSegment = {
          id: uuid(),
          name: saveName.trim(),
          entityType,
          conditions,
          createdAt: new Date().toISOString(),
        };
        const updated = [next, ...savedSegments];
        setSavedSegments(updated);
        saveSegments(updated);
      }
      setSaveName('');
    } finally {
      setSaving(false);
    }
  };

  const loadSegment = (seg: SavedSegment) => {
    onChange(seg.conditions);
    setShowSaved(false);
  };

  const deleteSegment = async (id: string) => {
    if (userId) {
      await deleteSegmentRequest(userId, id).catch(() => null);
    }
    const updated = savedSegments.filter(s => s.id !== id);
    setSavedSegments(updated);
    if (!userId) saveSegments(updated);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-lg dark:shadow-gray-900/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Segmentación avanzada</span>
          {resultCount !== undefined && (
            <span className="text-xs bg-gray-200 text-gray-600 dark:text-gray-400 font-semibold px-2 py-0.5 rounded-full">
              {resultCount} resultados
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSaved(!showSaved)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1.5 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {loadingSegments ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
            Guardados ({savedSegments.filter(s => s.entityType === entityType || s.entityType === 'both').length})
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Saved Segments Panel */}
      {showSaved && (
        <div className="border-b border-gray-100 dark:border-gray-800 bg-indigo-50 p-3">
          <p className="text-xs font-semibold text-indigo-700 mb-2">Segmentos guardados</p>
          {savedSegments.filter(s => s.entityType === entityType || s.entityType === 'both').length === 0 ? (
            <p className="text-xs text-indigo-400">Sin segmentos guardados aún</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {savedSegments.filter(s => s.entityType === entityType || s.entityType === 'both').map(seg => (
                <div key={seg.id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl px-3 py-2 border border-indigo-100">
                  <button onClick={() => loadSegment(seg)} className="flex-1 text-left">
                    <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{seg.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{seg.conditions.length} filtros</p>
                  </button>
                  <button onClick={() => void deleteSegment(seg.id)} className="p-1 hover:bg-red-50 rounded-lg transition-colors ml-2">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Conditions */}
      <div className="p-4 space-y-3">
        {conditions.length === 0 && (
          <div className="text-center py-4">
            <p className="text-sm text-gray-400 dark:text-gray-500">Sin filtros activos. Añade condiciones para segmentar.</p>
          </div>
        )}

        {conditions.map((cond) => {
          const fieldDef = fields.find(f => f.id === cond.field) || fields[0];
          const operators = OPERATOR_OPTIONS[fieldDef.type] || OPERATOR_OPTIONS.text;
          const noValue = cond.operator === 'is_empty' || cond.operator === 'is_not_empty'
            || fieldDef.type === 'boolean';
          const selectOpts = getSelectOptions(cond.field, entityType);

          return (
            <div key={cond.id} className="flex items-center gap-2 flex-wrap">
              {/* Field selector */}
              <div className="relative">
                <select
                  value={cond.field}
                  onChange={e => {
                    const newField = fields.find(f => f.id === e.target.value) || fields[0];
                    const newOps = OPERATOR_OPTIONS[newField.type] || OPERATOR_OPTIONS.text;
                    updateCondition(cond.id, { field: e.target.value as FilterField, operator: newOps[0].id, value: '' });
                  }}
                  className="appearance-none pl-3 pr-7 py-2 text-xs font-semibold bg-gray-100 dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl text-gray-900 dark:text-gray-100 focus:border-indigo-400 focus:bg-white dark:focus:bg-gray-800 focus:outline-none transition-all cursor-pointer"
                >
                  {fields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 dark:text-gray-500 pointer-events-none" />
              </div>

              {/* Operator selector */}
              <div className="relative">
                <select
                  value={cond.operator}
                  onChange={e => updateCondition(cond.id, { operator: e.target.value as FilterOperator })}
                  className="appearance-none pl-3 pr-7 py-2 text-xs bg-gray-100 dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 focus:border-indigo-400 focus:bg-white dark:focus:bg-gray-800 focus:outline-none transition-all cursor-pointer"
                >
                  {operators.map(op => <option key={op.id} value={op.id}>{op.label}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 dark:text-gray-500 pointer-events-none" />
              </div>

              {/* Value input */}
              {!noValue && (
                fieldDef.type === 'select' && selectOpts.length > 0 ? (
                  <div className="relative">
                    <select
                      value={cond.value}
                      onChange={e => updateCondition(cond.id, { value: e.target.value })}
                      className="appearance-none pl-3 pr-7 py-2 text-xs bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-300 rounded-xl text-gray-900 dark:text-gray-100 focus:border-indigo-400 focus:outline-none transition-all cursor-pointer"
                    >
                      <option value="">— Seleccionar —</option>
                      {selectOpts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 dark:text-gray-500 pointer-events-none" />
                  </div>
                ) : (
                  <input
                    type={fieldDef.type === 'number' || fieldDef.type === 'date_days' ? 'number' : 'text'}
                    value={cond.value}
                    onChange={e => updateCondition(cond.id, { value: e.target.value })}
                    placeholder={fieldDef.type === 'date_days' ? 'Nº días' : 'Valor...'}
                    className="w-32 px-3 py-2 text-xs bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-300 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-300 focus:border-indigo-400 focus:outline-none transition-all"
                  />
                )
              )}

              <button
                onClick={() => removeCondition(cond.id)}
                className="p-1.5 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
          );
        })}

        <button
          onClick={addCondition}
          className="flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 py-2 px-3 hover:bg-indigo-50 rounded-xl transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Añadir condición
        </button>
      </div>

      {/* Save footer */}
      {conditions.length > 0 && (
        <div className="px-4 pb-4 flex items-center gap-2">
          <input
            type="text"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="Nombre del segmento..."
            className="flex-1 px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-800 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-300 focus:border-indigo-400 focus:bg-white dark:focus:bg-gray-800 focus:outline-none transition-all"
          />
          <button
            onClick={() => void saveSegment()}
            disabled={!saveName.trim() || saving}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          {conditions.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-500 dark:text-gray-400 text-xs font-semibold rounded-xl transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
