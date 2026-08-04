import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import {
  useApp,
  type Vehicle,
  type Warranty,
  type AssociatedCost,
  type CostCategory,
  type PriceHistoryEntry,
  type VehicleWorkshopRepair,
  type VehicleChecklistItem,
} from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import {
  addWarrantyRequest,
  updateWarrantyRequest,
  deleteWarrantyRequest,
  addWarrantyClaimRequest,
  addAssociatedCostRequest,
  deleteAssociatedCostRequest,
  updateVehicleRequest,
} from '../../lib/vehicleApi';
import { SAAS__MoveVehicleModal } from '../../components/design-system/SAAS__MoveVehicleModal';
import { SAAS__ScrapVehicleModal } from '../../components/design-system/SAAS__ScrapVehicleModal';
import { SAAS__PriceCalculatorModal } from '../../components/design-system/SAAS__PriceCalculatorModal';
import { ConfirmDestroyModal } from '../../components/saas/ConfirmDestroyModal';
import { CameraButton } from '../../components/saas/CameraButton';
import { jsPDF } from 'jspdf';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  ArrowLeft, MapPin, FileText, TrendingUp, Trash2, Euro, Calendar,
  Gauge, Info, Clock, Move, Fingerprint, Fuel, Palette, User, Tag,
  Pencil, PlusCircle, Upload, ChevronRight, Zap, DoorOpen,
  Car, ToggleLeft, CheckCircle2, Camera, ChevronDown, ChevronUp,
  X, ZoomIn, Wrench, StickyNote, PackagePlus, ShoppingCart,
  Plus, Check, Edit3, Save, Calculator, QrCode, FileDown,
  AlertTriangle, Globe, Copy, Printer, ExternalLink, RefreshCw,
  GripVertical, ImagePlus, Bell, Star, Share2, TrendingDown, Settings2, FolderOpen,
} from 'lucide-react';
import { VehicleDocDossier } from '../../components/saas/VehicleDocDossier';
import { SAAS__OcrScanModal } from '../../components/design-system/SAAS__OcrScanModal';
import { PeriodBadge } from '../../components/ui/PeriodBadge';
import { parseLocaleNumber } from '../../lib/numberFormat';
import { VEHICLE_STATUS_TOKEN, type VehicleStatus } from '../../components/saas/DesignTokens';
import {
  DOCUMENTS_DB_NAME,
  createDocumentViaApi,
  updateDocumentViaApi,
  type OcrData,
} from '../../lib/documentsApi';
import { buildOcrDocumentFields } from '../../lib/ocrDocumentSave';
import { authFetch, getAuthHeaders } from '../../lib/authApi';
import { getApiBase } from '../../lib/apiBase';
import { toast } from 'sonner';

// ─── Image compression utility ────────────────────────────────────────────────

async function compressImage(file: File, maxWidth = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(maxWidth / img.width, 1);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no canvas ctx')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
      URL.revokeObjectURL(url);
    };
    img.onerror = reject;
    img.src = url;
  });
}

const ALLOWED_VEHICLE_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const ALLOWED_VEHICLE_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;
const VEHICLE_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
const ALLOWED_VEHICLE_IMAGE_DATA_URL_PREFIXES = [
  'data:image/jpeg;',
  'data:image/jpg;',
  'data:image/png;',
  'data:image/webp;',
] as const;

function isAllowedVehicleImageFile(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (ALLOWED_VEHICLE_IMAGE_MIME_TYPES.includes(type as (typeof ALLOWED_VEHICLE_IMAGE_MIME_TYPES)[number])) {
    return true;
  }
  const lowerName = (file.name || '').toLowerCase();
  return ALLOWED_VEHICLE_IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

function isAllowedVehicleImageDataUrl(dataUrl: string): boolean {
  const normalized = String(dataUrl || '').trim().toLowerCase();
  return ALLOWED_VEHICLE_IMAGE_DATA_URL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ChecklistItem = VehicleChecklistItem;
type Repair = VehicleWorkshopRepair;

const DEFAULT_CHECKLIST: ChecklistItem[] = [];

const DEFAULT_REPAIRS: Repair[] = [];

function isLegacyDefaultChecklist(items: ChecklistItem[]): boolean {
  if (items.length !== 4) return false;
  const ids = items.map((item) => item.id).sort();
  return ids.join(',') === 'c1,c2,c3,c4';
}

function normalizeRepairStatus(value: unknown): Repair['status'] {
  if (value === 0 || value === '0' || value === 'pending') return 'pending';
  if (value === 1 || value === '1' || value === 'in_progress') return 'in_progress';
  if (value === 2 || value === '2' || value === 'done') return 'done';
  return 'pending';
}

function normalizeRepairItem(value: unknown): Repair | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  return {
    id: String(item.id || `r${Date.now()}`),
    concept: String(item.concept || '').trim(),
    date: String(item.date || new Date().toISOString().slice(0, 10)),
    amount: Number.isFinite(Number(item.amount)) ? Number(item.amount) : 0,
    status: normalizeRepairStatus(item.status),
    workshop: String(item.workshop || '').trim(),
    notes: String(item.notes || '').trim(),
  };
}

function normalizeChecklistItem(value: unknown): ChecklistItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  return {
    id: String(item.id || `c${Date.now()}`),
    task: String(item.task || '').trim(),
    done: Boolean(item.done),
    category: String(item.category || 'otro').trim() || 'otro',
  };
}

// ─── Checklist Panel ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  taller:    { label: 'Taller',         color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  limpieza:  { label: 'Limpieza',       color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500'   },
  marketing: { label: 'Foto/Marketing', color: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500'  },
  admin:     { label: 'Admin',          color: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',    dot: 'bg-gray-400'   },
  otro:      { label: 'Otro',           color: 'bg-teal-100 text-teal-700',    dot: 'bg-teal-500'   },
};

function ChecklistPanel({
  items, onToggle, onDelete, onAdd, onRename,
}: {
  items: ChecklistItem[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (task: string, category: string) => void;
  onRename: (id: string, task: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [newCat, setNewCat] = useState('otro');
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const done  = items.filter(i => i.done).length;
  const total = items.length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  const handleAdd = () => {
    if (!newTask.trim()) return;
    onAdd(newTask.trim(), newCat);
    setNewTask(''); setNewCat('otro'); setShowAdd(false);
  };
  const startEdit = (item: ChecklistItem) => {
    setEditId(item.id); setEditText(item.task);
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  const confirmEdit = () => {
    if (editId && editText.trim()) onRename(editId, editText.trim());
    setEditId(null);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-purple-600" /> Checklist de preparación
          </p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pct === 100 ? 'bg-green-100 text-green-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
            {done}/{total} {pct === 100 ? '✓ Completo' : 'completados'}
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-gray-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-1">
          <span>{pct}% completado</span>
          {pct === 100 && <span className="text-green-600 font-semibold">✓ Listo para publicar</span>}
        </div>
      </div>
      <div className="divide-y divide-gray-50">
        {items.map(item => {
          const cat = CATEGORY_CONFIG[item.category] ?? CATEGORY_CONFIG.otro;
          const isEditing = editId === item.id;
          return (
            <div key={item.id} className={`flex items-center gap-3 px-4 py-3 group transition-colors ${item.done ? 'bg-green-50/40' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              <button
                onClick={() => onToggle(item.id)}
                className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-all active:scale-95 ${
                  item.done ? 'bg-green-500 border-green-500 hover:bg-green-600' : 'border-gray-300 hover:border-green-400 hover:bg-green-50'
                }`}
              >
                {item.done && <Check className="w-3.5 h-3.5 text-white" />}
              </button>
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <input
                    ref={inputRef}
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onBlur={confirmEdit}
                    onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditId(null); }}
                    className="w-full text-sm border-b-2 border-blue-500 bg-transparent focus:outline-none text-gray-900 dark:text-gray-100 py-0.5"
                  />
                ) : (
                  <span
                    className={`text-sm transition-all select-none ${item.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}
                    onDoubleClick={() => startEdit(item)}
                    title="Doble clic para renombrar"
                  >
                    {item.task}
                  </span>
                )}
              </div>
              <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full hidden sm:flex items-center gap-1 ${cat.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cat.dot}`} />
                {cat.label}
              </span>
              <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${item.done ? 'bg-green-100 text-green-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'}`}>
                {item.done ? 'Hecho' : 'Pendiente'}
              </span>
              <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => startEdit(item)} className="w-6 h-6 flex items-center justify-center hover:bg-blue-100 rounded-lg transition-colors" title="Renombrar">
                  <Edit3 className="w-3 h-3 text-blue-500" />
                </button>
                <button onClick={() => onDelete(item.id)} className="w-6 h-6 flex items-center justify-center hover:bg-red-100 rounded-lg transition-colors" title="Eliminar">
                  <Trash2 className="w-3 h-3 text-red-400" />
                </button>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="px-4 py-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400 dark:text-gray-500">No hay tareas — añade la primera</p>
          </div>
        )}
      </div>
      {showAdd ? (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 space-y-2">
          <input
            autoFocus
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setShowAdd(false); setNewTask(''); } }}
            placeholder="Nombre de la tarea…"
            className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <select value={newCat} onChange={e => setNewCat(e.target.value)}
              className="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-xs focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-800">
              {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
            <button onClick={() => { setShowAdd(false); setNewTask(''); }}
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 transition-colors">
              Cancelar
            </button>
            <button onClick={handleAdd} disabled={!newTask.trim()}
              className="px-3 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-40">
              Añadir
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
          <button onClick={() => setShowAdd(true)}
            className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold text-gray-400 dark:text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-all">
            <Plus className="w-3.5 h-3.5" /> Añadir tarea
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Repair Status Config ──────────────────────────────────────────────────────

const REPAIR_STATUS: Record<string, { label: string; badge: string; dot: string; border: string }> = {
  done:        { label: 'Completado', badge: 'bg-green-100 text-green-700',  dot: 'bg-green-500',  border: 'border-gray-200 dark:border-gray-700'  },
  in_progress: { label: 'En curso',   badge: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500',   border: 'border-blue-200'  },
  pending:     { label: 'Pendiente (0)',  badge: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500',  border: 'border-amber-200' },
};

// ─── Add Repair Modal ──────────────────────────────────────────────────────────

function AddRepairModal({ isOpen, onClose, onSave, initialRepair }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (r: Repair) => void;
  initialRepair?: Repair | null;
}) {
  const [form, setForm] = useState({ concept: '', amount: '', workshop: '', date: '', notes: '', status: 'pending' as Repair['status'] });
  useEffect(() => {
    if (!isOpen) return;
    if (initialRepair) {
      setForm({
        concept: initialRepair.concept,
        amount: String(initialRepair.amount ?? ''),
        workshop: initialRepair.workshop,
        date: initialRepair.date,
        notes: initialRepair.notes,
        status: normalizeRepairStatus(initialRepair.status),
      });
      return;
    }
    setForm({ concept: '', amount: '', workshop: '', date: '', notes: '', status: 'pending' });
  }, [isOpen, initialRepair]);

  if (!isOpen) return null;
  const fv = (f: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }));
  const handleSave = () => {
    if (!form.concept.trim() || !form.amount) return;
    onSave({
      id: initialRepair?.id || `r${Date.now()}`,
      concept: form.concept,
      amount: (() => {
        const parsedAmount = parseLocaleNumber(form.amount);
        return Number.isFinite(parsedAmount) ? parsedAmount : 0;
      })(),
      workshop: form.workshop,
      date: form.date || new Date().toISOString().split('T')[0],
      notes: form.notes,
      status: normalizeRepairStatus(form.status),
    });
    setForm({ concept: '', amount: '', workshop: '', date: '', notes: '', status: 'pending' });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">{initialRepair ? 'Editar reparacion / gasto' : 'Nueva reparacion / gasto'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Concepto *</label>
            <input value={form.concept} onChange={fv('concept')} placeholder="Ej: Revisión mecánica, ITV…"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Importe (€) *</label>
              <input type="number" value={form.amount} onChange={fv('amount')} placeholder="0"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Fecha</label>
              <input type="date" value={form.date} onChange={fv('date')}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Taller / Proveedor</label>
            <input value={form.workshop} onChange={fv('workshop')} placeholder="Nombre del taller"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Estado inicial</label>
            <div className="grid grid-cols-3 gap-2">
              {(['pending', 'in_progress', 'done'] as Repair['status'][]).map(s => (
                <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))}
                  className={`py-2 rounded-xl text-xs font-semibold border-2 transition-all ${form.status === s ? REPAIR_STATUS[s].badge + ' border-current' : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                  {REPAIR_STATUS[s].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Notas</label>
            <textarea value={form.notes} onChange={fv('notes')} rows={2} placeholder="Detalles del trabajo realizado…"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none resize-none" />
          </div>
        </div>
        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-5 py-4 flex gap-3 rounded-b-2xl">
          <button onClick={onClose} className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={!form.concept || !form.amount}
            className="flex-1 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40">Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Inline Status Selector ───────────────────────────────────────────────────

type VehicleStatusOption = VehicleStatus | 'scrapped';

const STATUS_OPTIONS_INLINE: ReadonlyArray<{
  value: VehicleStatusOption;
  label: string;
  dot: string;
  badge: string;
}> = [
  {
    value: 'entrada',
    label: VEHICLE_STATUS_TOKEN.entrada.label,
    dot: VEHICLE_STATUS_TOKEN.entrada.dot,
    badge: `${VEHICLE_STATUS_TOKEN.entrada.badgeBg} ${VEHICLE_STATUS_TOKEN.entrada.badgeText} border-blue-200 dark:border-blue-800`,
  },
  {
    value: 'preparacion',
    label: VEHICLE_STATUS_TOKEN.preparacion.label,
    dot: VEHICLE_STATUS_TOKEN.preparacion.dot,
    badge: `${VEHICLE_STATUS_TOKEN.preparacion.badgeBg} ${VEHICLE_STATUS_TOKEN.preparacion.badgeText} border-amber-200 dark:border-amber-800`,
  },
  {
    value: 'listo',
    label: VEHICLE_STATUS_TOKEN.listo.label,
    dot: VEHICLE_STATUS_TOKEN.listo.dot,
    badge: `${VEHICLE_STATUS_TOKEN.listo.badgeBg} ${VEHICLE_STATUS_TOKEN.listo.badgeText} border-emerald-200 dark:border-emerald-800`,
  },
  {
    value: 'reservado',
    label: VEHICLE_STATUS_TOKEN.reservado.label,
    dot: VEHICLE_STATUS_TOKEN.reservado.dot,
    badge: `${VEHICLE_STATUS_TOKEN.reservado.badgeBg} ${VEHICLE_STATUS_TOKEN.reservado.badgeText} border-violet-200 dark:border-violet-800`,
  },
  {
    value: 'vendido',
    label: VEHICLE_STATUS_TOKEN.vendido.label,
    dot: VEHICLE_STATUS_TOKEN.vendido.dot,
    badge: `${VEHICLE_STATUS_TOKEN.vendido.badgeBg} ${VEHICLE_STATUS_TOKEN.vendido.badgeText} border-slate-200 dark:border-slate-700`,
  },
  {
    value: 'scrapped',
    label: 'Desguace',
    dot: 'bg-gray-400',
    badge: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
  },
];

// ─── Photo Gallery ────────────────────────────────────────────────────────────

interface PhotoItem { id: string; url: string; }

function PhotoGallery({ images, onUpdate }: {
  images: string[];
  onUpdate: (imgs: string[]) => void;
}) {
  const [activeIdx, setActiveIdx]       = useState(0);
  const [lightbox, setLightboxIdx]      = useState<number | null>(null);
  const [uploading, setUploading]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [dragOverDrop, setDragOverDrop] = useState(false);
  const [dragIdx, setDragIdx]           = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx]   = useState<number | null>(null);
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addInputRef  = useRef<HTMLInputElement>(null);

  const photos: PhotoItem[] = images.map((url, i) => ({ id: `ph-${i}-${url.slice(-8)}`, url }));
  const safeIdx = Math.min(activeIdx, Math.max(0, photos.length - 1));
  const lightboxPhoto = lightbox !== null ? photos[lightbox] : null;

  const persist = useCallback(async (nextImages: string[]) => {
    setSaving(true);
    try {
      await onUpdate(nextImages);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [onUpdate]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const candidates = Array.from(files);
    const arr = candidates.filter(isAllowedVehicleImageFile);
    if (candidates.length > 0 && arr.length === 0) {
      window.alert('Formato no permitido. Solo se aceptan JPG, PNG o WEBP.');
    }
    if (!arr.length) return;
    setUploading(true);
    try {
      const compressed = await Promise.all(arr.map(f => compressImage(f)));
      const next = [...images, ...compressed];
      setActiveIdx(next.length - 1);
      await persist(next);
    } finally {
      setUploading(false);
    }
  }, [images, persist]);

  const handleCameraPhoto = useCallback(async (photo: { dataUrl: string; format: string }) => {
    if (!isAllowedVehicleImageDataUrl(photo.dataUrl)) {
      window.alert('Formato no permitido. Solo se aceptan JPG, PNG o WEBP.');
      return;
    }
    setUploading(true);
    try {
      const next = [...images, photo.dataUrl];
      setActiveIdx(next.length - 1);
      await persist(next);
    } finally {
      setUploading(false);
    }
  }, [images, persist]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverDrop(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removePhoto = async (idx: number) => {
    const next = images.filter((_, i) => i !== idx);
    setActiveIdx(Math.min(idx, Math.max(0, next.length - 1)));
    setDeleteConfirmIdx(null);
    await persist(next);
  };

  // Drag-reorder thumbnails
  const handleThumbDragStart = (idx: number) => setDragIdx(idx);
  const handleThumbDragOver  = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleThumbDrop      = async (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
    const next = [...images];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    setActiveIdx(idx);
    setDragIdx(null);
    setDragOverIdx(null);
    await persist(next);
  };

  // V-01: Set as main photo (move to position 0)
  const setAsMainPhoto = async (idx: number) => {
    if (idx === 0) return;
    const next = [...images];
    const [main] = next.splice(idx, 1);
    next.unshift(main);
    setActiveIdx(0);
    await persist(next);
  };

  // Lightbox keyboard nav
  React.useEffect(() => {
    if (lightbox === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setLightboxIdx(i => i !== null ? (i + 1) % photos.length : null);
      if (e.key === 'ArrowLeft')  setLightboxIdx(i => i !== null ? (i - 1 + photos.length) % photos.length : null);
      if (e.key === 'Escape')     setLightboxIdx(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox, photos.length]);

  // ── Empty state ───────────────────────────────────────────────────────────
  if (photos.length === 0) {
    return (
      <div
        onDragOver={e => { e.preventDefault(); setDragOverDrop(true); }}
        onDragLeave={() => setDragOverDrop(false)}
        onDrop={handleDrop}
        className={`bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed transition-all p-10 flex flex-col items-center justify-center gap-4 ${
          dragOverDrop ? 'border-amber-400 bg-amber-50' : 'border-gray-200 dark:border-gray-700'
        }`}
      >
        <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
          <ImagePlus className="w-8 h-8 text-gray-400 dark:text-gray-500" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-gray-700 dark:text-gray-300">Sin fotos todavía</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Arrastra fotos aquí o usa los botones · JPG, PNG, WEBP</p>
        </div>
        {uploading && (
          <div className="flex items-center gap-2 text-amber-600 text-sm font-medium">
            <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            Comprimiendo y guardando…
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <CameraButton onPhoto={handleCameraPhoto} label="Usar cámara" variant="primary" size="md" source="camera" />
          <button
            onClick={() => addInputRef.current?.click()}
            className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-400 px-4 py-2 rounded-xl transition-all"
          >
            <ImagePlus className="w-4 h-4" />
            Subir archivos
          </button>
        </div>
        <input ref={addInputRef} type="file" accept={VEHICLE_IMAGE_ACCEPT} multiple className="hidden"
          onChange={e => e.target.files && handleFiles(e.target.files)} />
      </div>
    );
  }

  // ── Gallery ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Fotos del vehículo</span>
          <span className="text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-full">{photos.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Save indicator */}
          {saving && (
            <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
              <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              Guardando…
            </span>
          )}
          {saved && !saving && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <Check className="w-3 h-3" /> Guardado
            </span>
          )}
          {uploading && (
            <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
              <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              Subiendo…
            </span>
          )}
          <CameraButton onPhoto={handleCameraPhoto} label="Cámara" variant="secondary" size="sm" source="camera" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Añadir
          </button>
          <input ref={fileInputRef} type="file" accept={VEHICLE_IMAGE_ACCEPT} multiple className="hidden"
            onChange={e => e.target.files && handleFiles(e.target.files)} />
        </div>
      </div>

      {/* ── Main viewer ── */}
      <div className="relative aspect-[16/9] bg-gray-100 dark:bg-gray-700 overflow-hidden">
        <img
          src={photos[safeIdx].url}
          alt={`Foto ${safeIdx + 1}`}
          className="w-full h-full object-cover"
        />

        {/* Counter pill */}
        <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full font-semibold">
          {safeIdx + 1} / {photos.length}
        </div>

        {/* Zoom */}
        <button
          onClick={() => setLightboxIdx(safeIdx)}
          className="absolute top-3 left-3 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-xl flex items-center justify-center transition-colors"
          title="Ampliar"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        {/* Delete — always visible */}
        {deleteConfirmIdx === safeIdx ? (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white dark:bg-gray-800 rounded-2xl shadow-xl px-3 py-2">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">¿Eliminar foto?</span>
            <button
              onClick={() => removePhoto(safeIdx)}
              className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors"
            >
              Eliminar
            </button>
            <button
              onClick={() => setDeleteConfirmIdx(null)}
              className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setDeleteConfirmIdx(safeIdx)}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-lg"
          >
            <Trash2 className="w-3.5 h-3.5" /> Eliminar
          </button>
        )}

        {/* Nav arrows */}
        {photos.length > 1 && (
          <>
            <button
              onClick={() => setActiveIdx((safeIdx - 1 + photos.length) % photos.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/40 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-all"
            >
              <ChevronDown className="w-5 h-5 rotate-90" />
            </button>
            <button
              onClick={() => setActiveIdx((safeIdx + 1) % photos.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/40 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-all"
            >
              <ChevronDown className="w-5 h-5 -rotate-90" />
            </button>
          </>
        )}
      </div>

      {/* ── Thumbnails — drag to reorder ── */}
      <div
        className="p-3 border-t border-gray-100 dark:border-gray-800"
        onDragOver={e => { e.preventDefault(); setDragOverDrop(true); }}
        onDragLeave={() => setDragOverDrop(false)}
        onDrop={handleDrop}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium flex items-center gap-1">
            <GripVertical className="w-3 h-3" />
            Arrastra para reordenar · Toca para seleccionar
          </p>
          {dragOverDrop && (
            <span className="text-[10px] text-amber-600 font-semibold animate-pulse">Suelta para añadir</span>
          )}
        </div>
        <div
          className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full"
        >
          {photos.map((photo, idx) => (
            <div
              key={photo.id}
              draggable
              onDragStart={() => handleThumbDragStart(idx)}
              onDragOver={e => handleThumbDragOver(e, idx)}
              onDrop={e => handleThumbDrop(e, idx)}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
              className={`relative flex-shrink-0 rounded-xl overflow-hidden border-2 cursor-grab active:cursor-grabbing transition-all select-none group/thumb ${
                idx === 0
                  ? 'border-amber-400'
                  : idx === safeIdx
                  ? 'border-amber-500 ring-2 ring-amber-200'
                  : dragOverIdx === idx
                  ? 'border-blue-400 scale-105'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'
              } ${dragIdx === idx ? 'opacity-30 scale-95' : ''}`}
              style={{ width: idx === safeIdx ? '5rem' : '4.5rem', height: idx === safeIdx ? '3.5rem' : '3rem' }}
            >
              <img
                src={photo.url}
                alt={`Foto ${idx + 1}`}
                className="w-full h-full object-cover pointer-events-none"
                onClick={() => setActiveIdx(idx)}
              />
              {/* V-01: Foto principal badge */}
              {idx === 0 ? (
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-amber-400 text-white rounded-md flex items-center justify-center shadow-sm" title="Foto principal">
                  <Star className="w-2.5 h-2.5 fill-white" />
                </div>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); setAsMainPhoto(idx); }}
                  className="absolute top-0.5 left-0.5 w-4 h-4 bg-black/50 hover:bg-amber-500 text-white rounded-md items-center justify-center transition-colors shadow-sm hidden group-hover/thumb:flex"
                  title="Marcar como foto principal"
                >
                  <Star className="w-2.5 h-2.5" />
                </button>
              )}
              {/* Individual delete on thumbnail */}
              <button
                onClick={e => { e.stopPropagation(); setActiveIdx(idx); setDeleteConfirmIdx(idx); }}
                className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-600 hover:bg-red-700 text-white rounded-md flex items-center justify-center transition-colors shadow-sm"
                title="Eliminar"
              >
                <X className="w-2.5 h-2.5" />
              </button>
              {/* Position number */}
              <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-black/50 text-white text-[8px] font-bold rounded flex items-center justify-center">
                {idx + 1}
              </div>
            </div>
          ))}

          {/* Add more button */}
          <button
            onClick={() => addInputRef.current?.click()}
            className={`flex-shrink-0 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-all ${
              dragOverDrop
                ? 'border-amber-400 bg-amber-50 text-amber-600'
                : 'border-gray-200 dark:border-gray-700 hover:border-amber-400 hover:bg-amber-50 text-gray-400 dark:text-gray-500 hover:text-amber-600'
            }`}
            style={{ width: '4.5rem', height: '3rem' }}
            title="Añadir fotos"
          >
            <Plus className="w-4 h-4" />
            <span className="text-[9px] font-semibold">Añadir</span>
          </button>
          <input ref={addInputRef} type="file" accept={VEHICLE_IMAGE_ACCEPT} multiple className="hidden"
            onChange={e => e.target.files && handleFiles(e.target.files)} />
        </div>
      </div>

      {/* ── Lightbox ── */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxIdx(null)}
        >
          {/* Close */}
          <button
            className="absolute top-4 right-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2.5 transition-colors z-10"
            onClick={() => setLightboxIdx(null)}
          >
            <X className="w-6 h-6" />
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/10 text-white text-sm font-semibold px-3 py-1 rounded-full">
            {(lightbox ?? 0) + 1} / {photos.length}
          </div>

          {/* Arrows */}
          {photos.length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors"
                onClick={e => { e.stopPropagation(); setLightboxIdx(i => i !== null ? (i - 1 + photos.length) % photos.length : null); }}
              >
                <ChevronDown className="w-6 h-6 rotate-90" />
              </button>
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors"
                onClick={e => { e.stopPropagation(); setLightboxIdx(i => i !== null ? (i + 1) % photos.length : null); }}
              >
                <ChevronDown className="w-6 h-6 -rotate-90" />
              </button>
            </>
          )}

          {/* Image */}
          <img
            src={lightboxPhoto.url}
            alt=""
            className="max-w-[92vw] max-h-[88vh] object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />

          {/* Delete from lightbox */}
          <button
            onClick={e => { e.stopPropagation(); removePhoto(lightbox ?? 0); setLightboxIdx(null); }}
            className="absolute bottom-6 right-6 flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg"
          >
            <Trash2 className="w-4 h-4" /> Eliminar foto
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Workflow Bar ─────────────────────────────────────────────────────────────

const WORKFLOW_STEPS = [
  { id: 'compra',      label: 'Compra',      icon: ShoppingCart },
  { id: 'recepcion',   label: 'Recepción',   icon: CheckCircle2 },
  { id: 'preparacion', label: 'Preparación', icon: Zap },
  { id: 'publicado',   label: 'Publicado',   icon: TrendingUp },
  { id: 'reservado',   label: 'Reservado',   icon: Tag },
  { id: 'vendido',     label: 'Vendido',     icon: Euro },
];

function getWorkflowStep(status: string): number {
  switch (status) {
    case 'entrada':     return 1;
    case 'preparacion': return 2;
    case 'listo':       return 3;
    case 'reservado':   return 4;
    case 'vendido':     return 5;
    case 'scrapped':    return -1;
    default:            return 3;
  }
}

function WorkflowBar({ status }: { status: string }) {
  const [expanded, setExpanded] = useState(false);
  const currentStep = getWorkflowStep(status);

  if (currentStep === -1) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
            <Trash2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </div>
          <div>
            <span className="font-semibold text-gray-700 dark:text-gray-300">Vehículo dado de baja</span>
            <p className="text-xs text-gray-500 dark:text-gray-400">Retirado del ciclo operativo</p>
          </div>
        </div>
      </div>
    );
  }

  const progress = (currentStep / (WORKFLOW_STEPS.length - 1)) * 100;
  const currentStepData = WORKFLOW_STEPS[currentStep];
  const nextStepData = WORKFLOW_STEPS[currentStep + 1];
  const CurrentIcon = currentStepData?.icon;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 ring-4 ring-amber-100 dark:ring-amber-900/40">
          {CurrentIcon && <CurrentIcon className="w-4 h-4 text-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Ciclo del vehículo</span>
            <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
              Fase {currentStep + 1} / {WORKFLOW_STEPS.length}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{currentStepData?.label}</span>
            {nextStepData && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                <span className="text-sm text-gray-500 dark:text-gray-400">{nextStepData.label}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 w-20 hidden sm:block">
          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500 text-right mt-0.5">{Math.round(progress)}%</div>
        </div>
        <div className="flex-shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 pb-4 pt-3">
          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-4">
            <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="space-y-2">
            {WORKFLOW_STEPS.map((step, idx) => {
              const isDone    = idx < currentStep;
              const isCurrent = idx === currentStep;
              const Icon = step.icon;
              return (
                <div key={step.id} className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${isCurrent ? 'bg-amber-50 border border-amber-200' : isDone ? 'bg-green-50' : 'bg-gray-50 dark:bg-gray-800'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isDone ? 'bg-green-500 text-white' : isCurrent ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-400 dark:text-gray-500'}`}>
                    {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  </div>
                  <span className={`text-sm font-medium ${isCurrent ? 'text-amber-800' : isDone ? 'text-green-700' : 'text-gray-400 dark:text-gray-500'}`}>{step.label}</span>
                  {isCurrent && <span className="ml-auto text-[10px] font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Actual</span>}
                  {isDone && <span className="ml-auto text-[10px] font-semibold text-green-600">✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Quick Actions (icon-only) ────────────────────────────────────────────────

interface QuickAction { icon: React.ElementType; label: string; color: string; onClick: () => void; }

function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
            onClick={action.onClick}
            title={action.label}
            className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all hover:shadow-sm active:scale-95 ${action.color}`}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Tabs ────────────────────────────────────────────────────────────────

type MainTab = 'ficha' | 'fotos' | 'taller' | 'finanzas' | 'docs' | 'mas' | 'publicar';

type MainTabDef = { id: MainTab; i18nKey: string; icon: React.ElementType };
const MAIN_TAB_DEFS: MainTabDef[] = [
  { id: 'ficha',    i18nKey: 'vehicles.detail.tabs.ficha',    icon: Info       },
  { id: 'fotos',    i18nKey: 'vehicles.detail.tabs.fotos',    icon: Camera     },
  { id: 'taller',   i18nKey: 'vehicles.detail.tabs.taller',   icon: Wrench     },
  { id: 'finanzas', i18nKey: 'vehicles.detail.tabs.finanzas', icon: Euro       },
  { id: 'docs',     i18nKey: 'vehicles.detail.tabs.docs',     icon: FolderOpen },
  { id: 'publicar', i18nKey: 'vehicles.detail.tabs.publicar', icon: Globe      },
  { id: 'mas',      i18nKey: 'vehicles.detail.tabs.mas',      icon: StickyNote },
];

// ─── Change Status Modal ──────────────────────────────────────────────────────

const STATUS_OPTIONS: ReadonlyArray<{ value: VehicleStatusOption; label: string; color: string }> = [
  { value: 'entrada', label: VEHICLE_STATUS_TOKEN.entrada.label, color: `${VEHICLE_STATUS_TOKEN.entrada.badgeBg} ${VEHICLE_STATUS_TOKEN.entrada.badgeText} border-blue-300` },
  { value: 'preparacion', label: VEHICLE_STATUS_TOKEN.preparacion.label, color: `${VEHICLE_STATUS_TOKEN.preparacion.badgeBg} ${VEHICLE_STATUS_TOKEN.preparacion.badgeText} border-amber-300` },
  { value: 'listo', label: VEHICLE_STATUS_TOKEN.listo.label, color: `${VEHICLE_STATUS_TOKEN.listo.badgeBg} ${VEHICLE_STATUS_TOKEN.listo.badgeText} border-emerald-300` },
  { value: 'reservado', label: VEHICLE_STATUS_TOKEN.reservado.label, color: `${VEHICLE_STATUS_TOKEN.reservado.badgeBg} ${VEHICLE_STATUS_TOKEN.reservado.badgeText} border-violet-300` },
  { value: 'vendido', label: VEHICLE_STATUS_TOKEN.vendido.label, color: `${VEHICLE_STATUS_TOKEN.vendido.badgeBg} ${VEHICLE_STATUS_TOKEN.vendido.badgeText} border-slate-300` },
  { value: 'scrapped', label: 'Desguace', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300' },
];

function ChangeStatusModal({ isOpen, onClose, currentStatus, onConfirm }: { isOpen: boolean; onClose: () => void; currentStatus: string; onConfirm: (s: string) => void }) {
  const [selected, setSelected] = useState(currentStatus);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Cambiar estado</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">✕</button>
        </div>
        <div className="p-6 space-y-2">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSelected(opt.value)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium ${
                selected === opt.value ? opt.color + ' border-current' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
              }`}
            >
              <span>{opt.label}</span>
              {selected === opt.value && <CheckCircle2 className="w-4 h-4" />}
            </button>
          ))}
        </div>
        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3 rounded-b-2xl">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">Cancelar</button>
          <button
            onClick={() => { onConfirm(selected); onClose(); }}
            disabled={selected === currentStatus}
            className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── QR Code Modal (VEH-06) ───────────────────────────────────────────────────

function QRModal({ isOpen, onClose, vehicleId, vehicleName }: {
  isOpen: boolean; onClose: () => void; vehicleId: string; vehicleName: string;
}) {
  const vehicleUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/saas/vehicles/${vehicleId}`
    : `/saas/vehicles/${vehicleId}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(vehicleUrl)}&size=280x280&margin=10&color=111111&bgcolor=FFFFFF`;
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    navigator.clipboard.writeText(vehicleUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const printQR = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html><html><head><title>QR - ${vehicleName}</title>
      <style>
        body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #fff; }
        .card { border: 2px solid #e5e7eb; border-radius: 16px; padding: 32px 40px; text-align: center; max-width: 360px; }
        h2 { margin: 16px 0 4px; font-size: 20px; color: #111; }
        p  { margin: 0 0 20px; color: #6b7280; font-size: 14px; }
        img { width: 240px; height: 240px; }
        small { display: block; margin-top: 16px; color: #9ca3af; font-size: 11px; word-break: break-all; }
      </style></head><body>
      <div class="card">
        <img src="${qrSrc}" alt="QR" />
        <h2>${vehicleName}</h2>
        <p>Escanea para ver la ficha del vehículo</p>
        <small>${vehicleUrl}</small>
      </div>
      <script>window.onload = () => { window.print(); }<\/script>
      </body></html>
    `);
    win.document.close();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            <h2 className="font-bold text-gray-900 dark:text-gray-100">Código QR del vehículo</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="p-3 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm">
            <img src={qrSrc} alt="QR Code" className="w-48 h-48" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{vehicleName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Escanea para ver la ficha del vehículo</p>
          </div>
          <div className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <span className="flex-1 text-xs text-gray-500 dark:text-gray-400 truncate">{vehicleUrl}</span>
            <button onClick={copyUrl} className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">Imprime el QR y ponlo en el parabrisas o expositor</p>
        </div>
        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-5 py-4 flex gap-3 rounded-b-2xl">
          <button onClick={onClose} className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">Cerrar</button>
          <button onClick={printQR}
            className="flex-1 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
            <Printer className="w-4 h-4" />Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Expense Modal ────────────────────────────────────────────────────────

function AddExpenseModal({ isOpen, onClose, vehicleName }: { isOpen: boolean; onClose: () => void; vehicleName: string }) {
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(f.type)) setFile(f);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };
  const handleReset = () => { setConcept(''); setAmount(''); setFile(null); };

  if (!isOpen) return null;

  const fileIcon = file?.type === 'application/pdf' ? '📄' : '🖼️';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Añadir gasto</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{vehicleName}</p>

          {/* Concepto */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Concepto *</label>
            <input
              value={concept}
              onChange={e => setConcept(e.target.value)}
              placeholder="Ej: Taller, limpieza, ITV..."
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
            />
          </div>

          {/* Importe */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Importe (€) *</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
            />
          </div>

          {/* Ticket / Factura — opcional */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ticket / Factura</label>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">Opcional</span>
            </div>

            {file ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border-2 border-blue-200 rounded-xl">
                <span className="text-xl flex-shrink-0">{fileIcon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-blue-900 truncate">{file.name}</p>
                  <p className="text-xs text-blue-600">{(file.size / 1024).toFixed(0)} KB · adjuntado</p>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="flex-shrink-0 p-1 hover:bg-blue-100 rounded-lg transition-colors text-blue-400 hover:text-blue-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 px-4 py-5 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                  dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center shadow-sm">
                  <Upload className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Arrastra o pulsa para subir</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">JPG, PNG, PDF · máx. 10 MB</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3 rounded-b-2xl">
          <button
            onClick={() => { handleReset(); onClose(); }}
            className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => { handleReset(); onClose(); }}
            disabled={!concept || !amount}
            className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            Añadir gasto
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Vehicle Modal ───────────────────────────────────────────────────────

type EditTab = 'identificacion' | 'tecnica' | 'precios' | 'origen';

const EDIT_TABS: { id: EditTab; label: string }[] = [
  { id: 'identificacion', label: 'Identificación' },
  { id: 'tecnica',        label: 'Técnica'        },
  { id: 'precios',        label: 'Precios'         },
  { id: 'origen',         label: 'Origen'          },
];

function EditVehicleModal({ vehicle, onClose, onSave }: {
  vehicle: Vehicle;
  onClose: () => void;
  onSave: (updates: Partial<Vehicle>) => Promise<void> | void;
}) {
  const [tab, setTab] = useState<EditTab>('identificacion');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState({
    registrationPlate: vehicle.registrationPlate ?? '',
    brand:             vehicle.brand             ?? '',
    model:             vehicle.model             ?? '',
    version:           vehicle.version           ?? '',
    year:              String(vehicle.year        ?? ''),
    color:             vehicle.color             ?? '',
    vin:               vehicle.vin               ?? '',
    fuelType:          vehicle.fuelType          ?? '',
    transmission:      vehicle.transmission      ?? '',
    mileage:           String(vehicle.mileage    ?? ''),
    power:             String(vehicle.power      ?? ''),
    doors:             String(vehicle.doors      ?? ''),
    bodyType:          vehicle.bodyType          ?? '',
    purchasePrice:     String(vehicle.purchasePrice ?? ''),
    salePrice:         String(vehicle.salePrice  ?? ''),
    purchaseDate:      vehicle.purchaseDate      ?? '',
    origin:            vehicle.origin            ?? '',
    supplierName:      vehicle.supplierName      ?? '',
    location:          vehicle.location          ?? '',
    notes:             vehicle.notes             ?? '',
  });

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveError('');
      await Promise.resolve(onSave({
      registrationPlate: form.registrationPlate,
      brand:             form.brand,
      model:             form.model,
      version:           form.version || undefined,
      year:              parseInt(form.year) || vehicle.year,
      color:             form.color,
      vin:               form.vin || undefined,
      fuelType:          (form.fuelType as Vehicle['fuelType']) || undefined,
      transmission:      (form.transmission as Vehicle['transmission']) || undefined,
      mileage:           (() => {
        if (!form.mileage) return undefined;
        const parsedMileage = parseLocaleNumber(form.mileage);
        return Number.isFinite(parsedMileage) ? parsedMileage : undefined;
      })(),
      power:             (() => {
        if (!form.power) return undefined;
        const parsedPower = parseLocaleNumber(form.power);
        return Number.isFinite(parsedPower) ? parsedPower : undefined;
      })(),
      doors:             form.doors ? parseInt(form.doors) : undefined,
      bodyType:          (form.bodyType as Vehicle['bodyType']) || undefined,
      purchasePrice:     (() => {
        const parsedPurchasePrice = parseLocaleNumber(form.purchasePrice);
        return Number.isFinite(parsedPurchasePrice) ? parsedPurchasePrice : vehicle.purchasePrice;
      })(),
      salePrice:         (() => {
        if (!form.salePrice) return undefined;
        const parsedSalePrice = parseLocaleNumber(form.salePrice);
        return Number.isFinite(parsedSalePrice) ? parsedSalePrice : undefined;
      })(),
      purchaseDate:      form.purchaseDate || undefined,
      origin:            (form.origin as Vehicle['origin']) || undefined,
      supplierName:      form.supplierName || undefined,
      location:          form.location || undefined,
      notes:             form.notes || undefined,
      }));
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'No se pudo guardar el vehículo');
    } finally {
      setSaving(false);
    }
  };

  const inputCls  = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-colors';
  const labelCls  = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5';
  const selectCls = inputCls + ' bg-white dark:bg-gray-800';

  const renderIdentificacion = () => (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className={labelCls}>Matrícula *</label>
        <input value={form.registrationPlate} onChange={set('registrationPlate')} placeholder="1234-ABC" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Marca *</label>
        <input value={form.brand} onChange={set('brand')} placeholder="BMW, Audi…" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Modelo *</label>
        <input value={form.model} onChange={set('model')} placeholder="Serie 3, A4…" className={inputCls} />
      </div>
      <div className="col-span-2">
        <label className={labelCls}>Versión / Acabado</label>
        <input value={form.version} onChange={set('version')} placeholder="320d xDrive M Sport" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Año</label>
        <input type="number" value={form.year} onChange={set('year')} placeholder="2021" min={1990} max={2030} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Color</label>
        <input value={form.color} onChange={set('color')} placeholder="Blanco Mineral" className={inputCls} />
      </div>
      <div className="col-span-2">
        <label className={labelCls}>Bastidor (VIN)</label>
        <input value={form.vin} onChange={set('vin')} placeholder="WBAKJ410X0C123456" className={inputCls + ' font-mono'} />
      </div>
      <div className="col-span-2">
        <label className={labelCls}>Ubicación</label>
        <input value={form.location} onChange={set('location')} placeholder="Exposición Principal" className={inputCls} />
      </div>
    </div>
  );

  const renderTecnica = () => (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelCls}>Combustible</label>
        <select value={form.fuelType} onChange={set('fuelType')} className={selectCls}>
          <option value="">Seleccionar</option>
          <option value="gasolina">Gasolina</option>
          <option value="diesel">Diésel</option>
          <option value="hibrido">Híbrido</option>
          <option value="electrico">Eléctrico</option>
          <option value="glp">GLP</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Cambio</label>
        <select value={form.transmission} onChange={set('transmission')} className={selectCls}>
          <option value="">Seleccionar</option>
          <option value="manual">Manual</option>
          <option value="automatico">Automático</option>
          <option value="semiauto">Semiautomático</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Kilómetros</label>
        <input type="text" inputMode="decimal" value={form.mileage} onChange={set('mileage')} placeholder="48.500" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Potencia (CV)</label>
        <input type="text" inputMode="decimal" value={form.power} onChange={set('power')} placeholder="190" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Puertas</label>
        <select value={form.doors} onChange={set('doors')} className={selectCls}>
          <option value="">—</option>
          {[2,3,4,5].map(d => <option key={d} value={d}>{d} puertas</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Carrocería</label>
        <select value={form.bodyType} onChange={set('bodyType')} className={selectCls}>
          <option value="">Seleccionar</option>
          <option value="sedan">Sedán</option>
          <option value="suv">SUV</option>
          <option value="familiar">Familiar</option>
          <option value="coupe">Coupé</option>
          <option value="cabrio">Cabrio</option>
          <option value="furgon">Furgón</option>
          <option value="pickup">Pick-up</option>
          <option value="otro">Otro</option>
        </select>
      </div>
    </div>
  );

  const renderPrecios = () => {
    const parsedPurchase = parseLocaleNumber(form.purchasePrice);
    const parsedSale = parseLocaleNumber(form.salePrice);
    const purchase = Number.isFinite(parsedPurchase) ? parsedPurchase : 0;
    const sale     = Number.isFinite(parsedSale) ? parsedSale : 0;
    const margin   = sale - purchase;
    return (
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Precio de compra (€) *</label>
          <input type="text" inputMode="decimal" value={form.purchasePrice} onChange={set('purchasePrice')} placeholder="12.000" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Precio de venta (€)</label>
          <input type="text" inputMode="decimal" value={form.salePrice} onChange={set('salePrice')} placeholder="15.900" className={inputCls} />
        </div>
        {purchase > 0 && sale > 0 && (
          <div className={`p-3.5 rounded-2xl border-2 ${margin >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Margen estimado</p>
            <p className={`font-bold text-xl ${margin >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {margin >= 0 ? '+' : ''}{margin.toLocaleString('es-ES')}€
            </p>
            <p className={`text-xs mt-0.5 ${margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {purchase > 0 ? ((margin / purchase) * 100).toFixed(1) : 0}% sobre compra
            </p>
          </div>
        )}
        <div>
          <label className={labelCls}>Fecha de compra</label>
          <input type="date" value={form.purchaseDate} onChange={set('purchaseDate')} className={inputCls} />
        </div>
      </div>
    );
  };

  const renderOrigen = () => (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>Procedencia</label>
        <select value={form.origin} onChange={set('origin')} className={selectCls}>
          <option value="">Seleccionar</option>
          <option value="particular">Particular</option>
          <option value="empresa">Empresa</option>
          <option value="subasta">Subasta</option>
          <option value="permuta">Permuta</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Vendedor / Proveedor</label>
        <input value={form.supplierName} onChange={set('supplierName')} placeholder="Nombre del vendedor" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Notas internas</label>
        <textarea value={form.notes} onChange={set('notes')} rows={5}
          placeholder="Observaciones sobre el vehículo, estado, historial…"
          className={inputCls + ' resize-none'} />
      </div>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* Bottom sheet (mobile) / Centered modal (desktop) */}
      <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4">
        <div className="bg-white dark:bg-gray-800 w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col max-h-[94dvh] sm:max-h-[90vh]">

          {/* Handle (mobile only) */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                <Pencil className="w-4 h-4 text-gray-700 dark:text-gray-300" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Editar vehículo</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{vehicle.brand} {vehicle.model} · {vehicle.registrationPlate}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0">
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Tabs */}
          <div className="px-5 flex-shrink-0">
            <div className="flex gap-1 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
              {EDIT_TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                    tab === t.id ? 'bg-gray-900 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="h-px bg-gray-100 dark:bg-gray-700" />
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {tab === 'identificacion' && renderIdentificacion()}
            {tab === 'tecnica'        && renderTecnica()}
            {tab === 'precios'        && renderPrecios()}
            {tab === 'origen'         && renderOrigen()}
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-5 pt-3 pb-5 sm:pb-4 flex-shrink-0 border-t border-gray-100 dark:border-gray-800">
            {saveError && (
              <div className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-xs text-red-700">
                {saveError}
              </div>
            )}
            <button onClick={onClose}
              disabled={saving}
              className="flex-1 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-2xl transition-colors text-sm">
              Cancelar
            </button>
            <button onClick={handleSave}
              disabled={saving}
              className="flex-[2] py-3 bg-gray-900 hover:bg-black text-white font-semibold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2">
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>

        </div>
      </div>
    </>
  );
}

// ─── Vehicle PDF generator (VEH-10) ──────────────────────────────────────────

function generateVehiclePdf(vehicle: Vehicle, repairsCosts: number) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const W = 210, marginX = 15;
  const totalCost  = vehicle.purchasePrice + repairsCosts;
  const margin     = vehicle.salePrice ? vehicle.salePrice - totalCost : 0;

  const fuelLabels: Record<string, string> = { gasolina:'Gasolina', diesel:'Diésel', hibrido:'Híbrido', electrico:'Eléctrico', glp:'GLP', otro:'Otro' };
  const transLabels: Record<string, string> = { manual:'Manual', automatico:'Automático', semiauto:'Semiautomático' };
  const bodyLabels: Record<string, string> = { sedan:'Sedán', suv:'SUV', familiar:'Familiar', coupe:'Coupé', cabrio:'Cabrio', furgon:'Furgón', pickup:'Pick-up', otro:'Otro' };

  // ── Header strip ──
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, W, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(`${vehicle.brand} ${vehicle.model}`, marginX, 18);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(vehicle.version ?? '', marginX, 26);
  doc.setFontSize(10);
  doc.text(`Matrícula: ${vehicle.registrationPlate}`, marginX, 34);

  // Sale price badge
  if (vehicle.salePrice) {
    doc.setFillColor(22, 163, 74);
    doc.roundedRect(W - 60, 8, 45, 24, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`${vehicle.salePrice.toLocaleString('es-ES')} €`, W - 37.5, 23, { align: 'center' });
  }

  let y = 50;
  doc.setTextColor(17, 24, 39);

  // ── Photo placeholder ──
  const hasImage = vehicle.images && vehicle.images.length > 0;
  if (hasImage) {
    try {
      const imgData = vehicle.images![0];
      doc.addImage(imgData, 'JPEG', marginX, y, W - marginX * 2, 70);
      y += 75;
    } catch (_) {
      doc.setFillColor(243, 244, 246);
      doc.rect(marginX, y, W - marginX * 2, 55, 'F');
      doc.setTextColor(156, 163, 175);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text('Imagen del vehículo', W / 2, y + 28, { align: 'center' });
      y += 60;
    }
  } else {
    doc.setFillColor(243, 244, 246);
    doc.rect(marginX, y, W - marginX * 2, 45, 'F');
    doc.setTextColor(156, 163, 175);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Sin fotografía disponible', W / 2, y + 22, { align: 'center' });
    y += 50;
  }

  // ── Specs grid ──
  y += 4;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text('Características técnicas', marginX, y);
  y += 6;
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.4);
  doc.line(marginX, y, W - marginX, y);
  y += 5;

  const specs: Array<[string, string]> = [
    ['Año',         String(vehicle.year)],
    ['Combustible', vehicle.fuelType ? fuelLabels[vehicle.fuelType] ?? vehicle.fuelType : '—'],
    ['Cambio',      vehicle.transmission ? transLabels[vehicle.transmission] ?? vehicle.transmission : '—'],
    ['Carrocería',  vehicle.bodyType ? bodyLabels[vehicle.bodyType] ?? vehicle.bodyType : '—'],
    ['Kilómetros',  vehicle.mileage ? `${vehicle.mileage.toLocaleString('es-ES')} km` : '—'],
    ['Potencia',    vehicle.power ? `${vehicle.power} CV` : '—'],
    ['Puertas',     vehicle.doors ? `${vehicle.doors}` : '—'],
    ['Color',       vehicle.color ?? '—'],
    ['Bastidor',    vehicle.vin ?? '—'],
    ['Ubicación',   vehicle.location ?? '—'],
  ];

  const col1X = marginX, col2X = W / 2 + 5;
  let row = 0;
  for (const [label, value] of specs) {
    const x = row % 2 === 0 ? col1X : col2X;
    const rowY = y + Math.floor(row / 2) * 9;
    if (row % 2 === 0 && row > 0) {
      doc.setFillColor(row % 4 === 0 ? 249 : 255, row % 4 === 0 ? 250 : 255, row % 4 === 0 ? 251 : 255);
      doc.rect(marginX, rowY - 4, W - marginX * 2, 9, 'F');
    }
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(label, x, rowY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text(value, x + 28, rowY);
    row++;
  }
  y += Math.ceil(specs.length / 2) * 9 + 6;

  // ── Price summary ──
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text('Resumen económico', marginX, y);
  y += 6;
  doc.line(marginX, y, W - marginX, y);
  y += 6;

  const priceRows: Array<[string, string, string]> = [
    ['Precio de compra', `${vehicle.purchasePrice.toLocaleString('es-ES')} €`, ''],
    ['Costes de preparación', `${repairsCosts.toLocaleString('es-ES')} €`, ''],
    ['Coste total', `${totalCost.toLocaleString('es-ES')} €`, 'bold'],
    ['Precio de venta', vehicle.salePrice ? `${vehicle.salePrice.toLocaleString('es-ES')} €` : '—', 'price'],
    ['Margen estimado', `${margin.toLocaleString('es-ES')} €`, margin >= 0 ? 'positive' : 'negative'],
  ];

  for (const [label, value, style] of priceRows) {
    const isTotal = style === 'bold';
    if (isTotal) { doc.setFillColor(243, 244, 246); doc.rect(marginX, y - 4, W - marginX * 2, 8, 'F'); }
    if (style === 'price') { doc.setFillColor(220, 252, 231); doc.rect(marginX, y - 4, W - marginX * 2, 8, 'F'); }
    doc.setFontSize(9.5);
    doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
    doc.setTextColor(isTotal ? 17 : 75, isTotal ? 24 : 85, isTotal ? 39 : 99);
    doc.text(label, marginX + 2, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(style === 'positive' ? 22 : style === 'negative' ? 220 : 17, style === 'positive' ? 163 : 24, style === 'positive' ? 74 : 39);
    doc.text(value, W - marginX - 2, y, { align: 'right' });
    y += 8;
  }

  // ── Notes ──
  if (vehicle.notes) {
    y += 4;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text('Notas', marginX, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    const lines = doc.splitTextToSize(vehicle.notes, W - marginX * 2);
    doc.text(lines, marginX, y);
    y += lines.length * 5;
  }

  // ── Footer ──
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(156, 163, 175);
  doc.text(`Generado el ${new Date().toLocaleDateString('es-ES')} · ${vehicle.registrationPlate}`, W / 2, 288, { align: 'center' });

  doc.save(`ficha-${vehicle.brand}-${vehicle.model}-${vehicle.registrationPlate}.pdf`);
}

// ─── V-10: Vehicle Label (A5 landscape, HTML print) ─────────────────────────

function generateVehicleLabel(vehicle: Vehicle, publicUrl?: string) {
  const fuelLabels: Record<string, string> = { gasolina: 'Gasolina', diesel: 'Diésel', hibrido: 'Híbrido', electrico: 'Eléctrico', glp: 'GLP', otro: 'Otro' };
  const transLabels: Record<string, string> = { manual: 'Manual', automatico: 'Automático', semiauto: 'Semiaut.' };
  const hasImage = vehicle.images && vehicle.images.length > 0;
  const qrUrl = publicUrl ?? `${window.location.origin}/public/vehicle/${vehicle.id}`;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrUrl)}&size=120x120&margin=2`;

  const specsData = [
    ['Km', vehicle.mileage ? vehicle.mileage.toLocaleString('es-ES') + ' km' : '—'],
    ['Combustible', vehicle.fuelType ? fuelLabels[vehicle.fuelType] ?? vehicle.fuelType : '—'],
    ['Cambio', vehicle.transmission ? transLabels[vehicle.transmission] ?? vehicle.transmission : '—'],
    ['Potencia', vehicle.power ? vehicle.power + ' CV' : '—'],
    ['Puertas', vehicle.doors ? String(vehicle.doors) : '—'],
    ['Color', vehicle.color || '—'],
  ];

  const printWin = window.open('', '_blank');
  if (!printWin) return;
  printWin.document.write(`<!DOCTYPE html><html><head>
  <meta charset="utf-8">
  <title>Etiqueta — ${vehicle.brand} ${vehicle.model} ${vehicle.registrationPlate}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #f3f4f6; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .label { width: 210mm; height: 148mm; background: #fff; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; position: relative; box-shadow: 0 4px 24px rgba(0,0,0,.12); }
    .accent { position: absolute; left: 0; top: 0; width: 9px; height: 100%; background: #111827; z-index: 2; }
    .header { background: #f9fafb; padding: 12px 16px 12px 24px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: flex-start; justify-content: space-between; flex-shrink: 0; }
    .header-left .brand { font-size: 24px; font-weight: 800; color: #111827; line-height: 1.1; }
    .header-left .sub { font-size: 12px; color: #6b7280; margin-top: 3px; }
    .plate { display: inline-flex; align-items: center; gap: 5px; background: #111827; color: #fff; font-weight: 700; font-size: 13px; padding: 4px 12px; border-radius: 5px; margin-top: 7px; letter-spacing: 2px; }
    .plate::before { content: 'E'; display: inline-block; background: #1e40af; color: #fff; font-size: 8px; padding: 1px 3px; border-radius: 2px; font-weight: 900; }
    .price-badge { background: #16a34a; color: #fff; border-radius: 10px; padding: 8px 16px; text-align: center; min-width: 80px; }
    .price-label { font-size: 9px; opacity: 0.75; text-transform: uppercase; letter-spacing: 1px; }
    .price-val { font-size: 22px; font-weight: 800; line-height: 1.1; }
    .body { flex: 1; display: flex; padding: 10px 12px 10px 24px; gap: 12px; overflow: hidden; }
    .photo { width: 88mm; flex-shrink: 0; object-fit: cover; border-radius: 8px; background: #f3f4f6; }
    .right { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .specs { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
    .spec { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 5px 7px; text-align: center; }
    .spec-label { font-size: 7px; color: #9ca3af; text-transform: uppercase; letter-spacing: .5px; }
    .spec-val { font-size: 11px; font-weight: 700; color: #111827; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qr-section { display: flex; align-items: center; gap: 10px; margin-top: auto; padding: 6px 8px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; }
    .qr-section img { width: 52px; height: 52px; flex-shrink: 0; }
    .qr-text { font-size: 9px; color: #6b7280; line-height: 1.4; }
    .qr-text strong { font-size: 10px; color: #111827; display: block; margin-bottom: 2px; }
    .qr-url { font-size: 7px; color: #9ca3af; word-break: break-all; margin-top: 3px; }
    .footer { background: #111827; padding: 5px 24px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
    .footer p { color: #d1d5db; font-size: 8px; letter-spacing: .5px; }
    .footer strong { color: #fff; }
    .cut-line { position: absolute; inset: 3px; border: 1px dashed #e5e7eb; border-radius: 8px; pointer-events: none; z-index: 1; }
    @media print {
      body { background: #fff; padding: 0; display: block; }
      .label { box-shadow: none; border-radius: 0; width: 100%; height: 100%; }
      .cut-line { display: none; }
      @page { size: A5 landscape; margin: 0; }
    }
  </style></head><body>
  <div class="label">
    <div class="cut-line"></div>
    <div class="accent"></div>
    <div class="header">
      <div class="header-left">
        <div class="brand">${vehicle.brand} ${vehicle.model}</div>
        <div class="sub">${vehicle.year}${vehicle.version ? ' · ' + vehicle.version : ''}${vehicle.color ? ' · ' + vehicle.color : ''}</div>
        <span class="plate">${vehicle.registrationPlate}</span>
      </div>
      ${vehicle.salePrice ? `<div class="price-badge"><div class="price-label">PVP</div><div class="price-val">${vehicle.salePrice.toLocaleString('es-ES')} €</div></div>` : ''}
    </div>
    <div class="body">
      ${hasImage && vehicle.images?.[0]
        ? `<img src="${vehicle.images[0]}" class="photo" />`
        : `<div class="photo" style="display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:12px;flex-shrink:0;width:88mm;">Sin foto</div>`
      }
      <div class="right">
        <div class="specs">
          ${specsData.map(([l, v]) => `<div class="spec"><div class="spec-label">${l}</div><div class="spec-val" title="${v}">${v}</div></div>`).join('')}
        </div>
        <div class="qr-section">
          <img src="${qrApiUrl}" alt="QR" />
          <div>
            <div class="qr-text"><strong>Escanea para ver la ficha completa</strong>Toda la información, fotos y características del vehículo disponibles online.</div>
            <div class="qr-url">${qrUrl}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="footer">
      <p><strong>${vehicle.brand} ${vehicle.model}</strong> · Año ${vehicle.year} · ${vehicle.registrationPlate}</p>
      <p>Generado el ${new Date().toLocaleDateString('es-ES')}</p>
    </div>
  </div>
  <script>
    const qrImg = document.querySelector('.qr-section img');
    if (qrImg) {
      qrImg.onload = () => setTimeout(() => window.print(), 400);
      qrImg.onerror = () => setTimeout(() => window.print(), 400);
    } else {
      setTimeout(() => window.print(), 800);
    }
    setTimeout(() => window.print(), 2500);
  <\/script>
  </body></html>`);
  printWin.document.close();
}

// ─── V-11: Warranty Certificate PDF ─────────────────────────────────────────

function generateWarrantyCertificate(vehicle: Vehicle, warranty: { type: string; provider: string; startDate?: string; endDate?: string; coverage: string }) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const W = 210, marginX = 20;

  const fuelLabels: Record<string, string> = { gasolina: 'Gasolina', diesel: 'Diésel', hibrido: 'Híbrido', electrico: 'Eléctrico', glp: 'GLP', otro: 'Otro' };

  // ── Background watermark strip ──
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, W, 297, 'F');

  // ── Header block ──
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, W, 50, 'F');

  // Gold accent line
  doc.setFillColor(245, 158, 11);
  doc.rect(0, 50, W, 3, 'F');

  // Header text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('CERTIFICADO DE GARANTÍA', marginX, 14);

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(`${vehicle.brand} ${vehicle.model}`, marginX, 30);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(209, 213, 219);
  doc.text(`${vehicle.year}${vehicle.version ? ` · ${vehicle.version}` : ''} · Matrícula: ${vehicle.registrationPlate}`, marginX, 42);

  // Certificate number
  const certNum = `GAR-${vehicle.registrationPlate}-${Date.now().toString(36).toUpperCase()}`;
  doc.setTextColor(245, 158, 11);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Nº: ${certNum}`, W - marginX, 14, { align: 'right' });
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString('es-ES'), W - marginX, 22, { align: 'right' });

  let y = 68;

  // ── Warranty type badge ──
  const isOwn = warranty.type === 'own';
  doc.setFillColor(isOwn ? 59 : 37, isOwn ? 130 : 99, isOwn ? 246 : 235);
  doc.roundedRect(marginX, y, W - marginX * 2, 20, 4, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(
    isOwn ? '🛡 GARANTÍA PROPIA DEL CONCESIONARIO' : '🏭 GARANTÍA DE FÁBRICA',
    W / 2, y + 13,
    { align: 'center' }
  );

  y += 30;

  // ── Vehicle details card ──
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(marginX, y, W - marginX * 2, 52, 4, 4, 'F');
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginX, y, W - marginX * 2, 52, 4, 4, 'S');

  doc.setTextColor(107, 114, 128);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL VEHÍCULO', marginX + 8, y + 10);

  const vehDetails: Array<[string, string]> = [
    ['Marca / Modelo', `${vehicle.brand} ${vehicle.model}${vehicle.version ? ` ${vehicle.version}` : ''}`],
    ['Matrícula', vehicle.registrationPlate],
    ['Año', String(vehicle.year)],
    ['VIN / Bastidor', vehicle.vin || 'No especificado'],
    ['Combustible', vehicle.fuelType ? fuelLabels[vehicle.fuelType] ?? vehicle.fuelType : '—'],
    ['Kilómetros', vehicle.mileage ? `${vehicle.mileage.toLocaleString('es-ES')} km` : '—'],
  ];

  const colW = (W - marginX * 2 - 16) / 2;
  vehDetails.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = marginX + 8 + col * (colW + 8);
    const cy = y + 18 + row * 11;
    doc.setTextColor(156, 163, 175);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(label, cx, cy);
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(value, cx, cy + 6);
  });

  y += 62;

  // ── Guarantee details card ──
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(marginX, y, W - marginX * 2, 55, 4, 4, 'F');
  doc.setDrawColor(229, 231, 235);
  doc.roundedRect(marginX, y, W - marginX * 2, 55, 4, 4, 'S');

  doc.setTextColor(107, 114, 128);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('CONDICIONES DE GARANTÍA', marginX + 8, y + 10);

  const guaranteeDetails: Array<[string, string]> = [
    ['Proveedor / Emisor', warranty.provider],
    ['Inicio de garantía', warranty.startDate ? new Date(warranty.startDate).toLocaleDateString('es-ES') : 'Desde entrega'],
    ['Vencimiento', warranty.endDate ? new Date(warranty.endDate).toLocaleDateString('es-ES') : 'Sin fecha límite'],
    ['Tipo de garantía', isOwn ? 'Garantía propia' : 'Garantía de fábrica'],
  ];

  guaranteeDetails.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = marginX + 8 + col * (colW + 8);
    const cy = y + 18 + row * 14;
    doc.setTextColor(156, 163, 175);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(label, cx, cy);
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(value, cx, cy + 7);
  });

  y += 65;

  // ── Coverage section ──
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(marginX, y, W - marginX * 2, 38, 4, 4, 'F');
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(marginX, y, W - marginX * 2, 38, 4, 4, 'S');

  doc.setTextColor(30, 64, 175);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('COBERTURA', marginX + 8, y + 10);

  doc.setTextColor(37, 99, 235);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const covLines = doc.splitTextToSize(warranty.coverage || 'Consultar condiciones específicas con el vendedor.', W - marginX * 2 - 16);
  doc.text(covLines.slice(0, 3), marginX + 8, y + 19);

  y += 48;

  // ── Signature zone ──
  const sigBoxW = (W - marginX * 2 - 10) / 2;
  [
    { label: 'Firma del vendedor / concesionario', x: marginX },
    { label: 'Firma del comprador', x: marginX + sigBoxW + 10 },
  ].forEach(({ label, x }) => {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, sigBoxW, 35, 4, 4, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(x, y, sigBoxW, 35, 4, 4, 'S');
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.3);
    doc.line(x + 8, y + 28, x + sigBoxW - 8, y + 28);
    doc.setTextColor(156, 163, 175);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x + sigBoxW / 2, y + 33, { align: 'center' });
    doc.text('Fecha: ___/___/______', x + sigBoxW / 2, y + 14, { align: 'center' });
  });

  y += 45;

  // ── Legal disclaimer ──
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(marginX, y, W - marginX * 2, 22, 2, 2, 'F');
  doc.setTextColor(156, 163, 175);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  const legalText = 'Este certificado acredita la garantía del vehículo descrito. La garantía cubre los defectos de fabricación y averías no imputables al uso normal del vehículo. Quedan excluidos los daños por accidente, uso indebido o falta de mantenimiento. En caso de reclamación, contacte con el proveedor indicado en este documento.';
  const legalLines = doc.splitTextToSize(legalText, W - marginX * 2 - 12);
  doc.text(legalLines, marginX + 6, y + 7);

  // ── Footer ──
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 285, W, 12, 'F');
  doc.setFillColor(245, 158, 11);
  doc.rect(0, 285, W, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(`CERTIFICADO DE GARANTÍA · ${vehicle.brand} ${vehicle.model} · ${vehicle.registrationPlate}`, W / 2, 292, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(156, 163, 175);
  doc.text(`Ref: ${certNum}`, W / 2, 295, { align: 'center' });

  doc.save(`garantia-${vehicle.registrationPlate}-${certNum}.pdf`);
}

// ─── Portal Publishing Preview (VEH-07) ───────────────────────────────────────

interface PortalTemplate { name: string; color: string; bgColor: string; borderColor: string; icon: string; getTemplate: (v: Vehicle) => string; }

const PORTAL_TEMPLATES: PortalTemplate[] = [
  {
    name: 'Coches.net',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: '🚗',
    getTemplate: (v: Vehicle) => `${v.brand} ${v.model}${v.version ? ` ${v.version}` : ''} – ${v.year}

▸ ${v.mileage?.toLocaleString('es-ES') ?? '—'} km | ${v.fuelType === 'diesel' ? 'Diésel' : v.fuelType === 'gasolina' ? 'Gasolina' : v.fuelType ?? '—'} | ${v.transmission === 'automatico' ? 'Automático' : v.transmission === 'manual' ? 'Manual' : v.transmission ?? '—'}
▸ ${v.power ? `${v.power} CV` : '—'} | ${v.doors ? `${v.doors} puertas` : '—'} | Color: ${v.color}
▸ Matrícula: ${v.registrationPlate}${v.vin ? ` | VIN: ${v.vin}` : ''}

Precio: ${v.salePrice?.toLocaleString('es-ES') ?? 'Consultar'} €${v.location ? `\nUbicación: ${v.location}` : ''}

Vehículo en perfecto estado. Documentación en regla. Financiación disponible. Contacta para más información o cita previa.`,
  },
  {
    name: 'Milanuncios',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: '📋',
    getTemplate: (v: Vehicle) => `VENDO ${v.brand.toUpperCase()} ${v.model.toUpperCase()} ${v.year}

Precio: ${v.salePrice?.toLocaleString('es-ES') ?? 'NEGOCIABLE'} €

- Kilómetros: ${v.mileage?.toLocaleString('es-ES') ?? '—'} km
- Combustible: ${v.fuelType === 'diesel' ? 'Diésel' : v.fuelType === 'gasolina' ? 'Gasolina' : v.fuelType ?? '—'}
- Cambio: ${v.transmission === 'automatico' ? 'Automático' : v.transmission === 'manual' ? 'Manual' : v.transmission ?? '—'}${v.power ? `\n- Potencia: ${v.power} CV` : ''}
- Color: ${v.color}
- Matrícula: ${v.registrationPlate}${v.version ? `\n- Versión: ${v.version}` : ''}

Buen estado de conservación. ITV en vigor. Historial de mantenimiento disponible. Precio negociable al contado. Llama o escribe para ver el coche sin compromiso.`,
  },
  {
    name: 'Wallapop',
    color: 'text-teal-700',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    icon: '💬',
    getTemplate: (v: Vehicle) => `${v.brand} ${v.model} ${v.year}${v.version ? ` - ${v.version}` : ''}

💶 Precio: ${v.salePrice?.toLocaleString('es-ES') ?? 'Negociable'} €
📏 ${v.mileage?.toLocaleString('es-ES') ?? '—'} km
⛽ ${v.fuelType === 'diesel' ? 'Diésel' : v.fuelType === 'gasolina' ? 'Gasolina' : v.fuelType ?? '—'}
⚙️ ${v.transmission === 'automatico' ? 'Automático' : v.transmission === 'manual' ? 'Manual' : v.transmission ?? '—'}${v.power ? `\n💪 ${v.power} CV` : ''}
🎨 ${v.color}

Vehiculo bien cuidado, sin golpes ni rayones significativos. Toda la documentación al día. Posibilidad de ver el coche en ${v.location ?? 'nuestras instalaciones'}.

¡Escríbeme sin compromiso! 😊`,
  },
];

function PortalPublishSection({ vehicle }: { vehicle: Vehicle }) {
  const navigate = useNavigate();
  const [copiedPortal, setCopiedPortal] = useState<string | null>(null);

  const copyText = (portalName: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedPortal(portalName);
      setTimeout(() => setCopiedPortal(null), 2500);
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
          Gestión comercial de publicación
        </p>
        <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
          Canales activos, estado y precio se gestionan en Publicación y venta (core del vertical).
        </p>
        <button
          type="button"
          onClick={() =>
            navigate(`/saas/vertical/compraventa/publicacion-venta?vehicleId=${encodeURIComponent(vehicle.id)}`)
          }
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          <Globe className="h-3.5 w-3.5" />
          Abrir Publicación y venta
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Plantillas para copiar</h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Texto auxiliar para pegar en portales. No sustituye el estado de publicación del vehículo.</p>

        <div className="space-y-3">
          {PORTAL_TEMPLATES.map(portal => {
            const text = portal.getTemplate(vehicle);
            const isCopied = copiedPortal === portal.name;
            return (
              <div key={portal.name} className={`rounded-2xl border-2 overflow-hidden ${portal.borderColor}`}>
                {/* Portal header */}
                <div className={`flex items-center justify-between px-4 py-3 ${portal.bgColor}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{portal.icon}</span>
                    <span className={`font-bold text-sm ${portal.color}`}>{portal.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText(portal.name, text)}
                    className="rounded-lg bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-white"
                  >
                    {isCopied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap bg-white px-4 py-3 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                  {text}
                </pre>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Note User Card (avatar + popup) ─────────────────────────────────────────

const NOTE_USER_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-amber-500',  'bg-rose-500', 'bg-indigo-500',
];

function NoteUserCard({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const color = NOTE_USER_COLORS[name.charCodeAt(0) % NOTE_USER_COLORS.length];

  return (
    <div className="relative">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0 ${color}`}
        onClick={() => setOpen((v) => !v)}
        title={name}
      >
        {name.charAt(0)}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-8 z-20 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-3 min-w-[180px]">
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${color}`}>
                {name.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">{name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Equipo</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VehicleDetail() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { id } = useParams();
  const { vehicles, updateVehicle, deleteVehicle, documents, refreshDocuments } = useApp();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<MainTab>('ficha');
  const [showOcr, setShowOcr] = useState(false);

  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showScrapModal, setShowScrapModal] = useState(false);
  const [showDeleteVehicleModal, setShowDeleteVehicleModal] = useState(false);
  const [isDeletingVehicle, setIsDeletingVehicle] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showAddRepairModal, setShowAddRepairModal] = useState(false);
  const [editingRepair, setEditingRepair] = useState<Repair | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPriceCalculator, setShowPriceCalculator] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  // ── V-02: Price history ──
  const [showPriceHistoryModal, setShowPriceHistoryModal] = useState(false);
  const [showPriceChangeReasonModal, setShowPriceChangeReasonModal] = useState(false);
  const [pendingPriceChange, setPendingPriceChange] = useState<{ newPrice: number } | null>(null);
  const [priceChangeReason, setPriceChangeReason] = useState('');

  // ── V-07: Warranties ──
  const [showAddWarrantyModal, setShowAddWarrantyModal] = useState(false);
  const [showAddClaimModal, setShowAddClaimModal] = useState<string | null>(null);
  const [warrantyLoading, setWarrantyLoading] = useState(false);

  // ── V-08: Associated costs ──
  const [showAddCostModal, setShowAddCostModal] = useState(false);
  const [costLoading, setCostLoading] = useState(false);

  // ── Checklist state ──
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);

  // ── Repairs state ──
  const [repairs, setRepairs] = useState<Repair[]>([]);

  useModalClose(showMoveModal, () => setShowMoveModal(false));
  useModalClose(showScrapModal, () => setShowScrapModal(false));
  useModalClose(showDeleteVehicleModal, () => setShowDeleteVehicleModal(false));
  useModalClose(showStatusModal, () => setShowStatusModal(false));
  useModalClose(showExpenseModal, () => setShowExpenseModal(false));
  useModalClose(showAddRepairModal, () => setShowAddRepairModal(false));
  useModalClose(!!editingRepair, () => setEditingRepair(null));
  useModalClose(showEditModal, () => setShowEditModal(false));
  useModalClose(showPriceCalculator, () => setShowPriceCalculator(false));
  useModalClose(showQRModal, () => setShowQRModal(false));
  useModalClose(showPriceHistoryModal, () => setShowPriceHistoryModal(false));
  useModalClose(showPriceChangeReasonModal, () => setShowPriceChangeReasonModal(false));
  useModalClose(showAddWarrantyModal, () => setShowAddWarrantyModal(false));
  useModalClose(!!showAddClaimModal, () => setShowAddClaimModal(null));
  useModalClose(showAddCostModal, () => setShowAddCostModal(false));

  // ── V-07: Warranty handlers ──
  const handleAddWarranty = useCallback(async (w: Partial<Warranty>) => {
    if (!id || !user?.user_id) return;
    setWarrantyLoading(true);
    try {
      const res = await addWarrantyRequest(user.user_id, id, w);
      if (res.vehicle) updateVehicle(id, res.vehicle);
    } catch (_) { /* noop */ }
    finally { setWarrantyLoading(false); }
  }, [id, user?.user_id, updateVehicle]);

  const handleDeleteWarranty = useCallback(async (warrantyId: string) => {
    if (!id || !user?.user_id) return;
    setWarrantyLoading(true);
    try {
      const res = await deleteWarrantyRequest(user.user_id, id, warrantyId);
      if (res.vehicle) updateVehicle(id, res.vehicle);
    } catch (_) { /* noop */ }
    finally { setWarrantyLoading(false); }
  }, [id, user?.user_id, updateVehicle]);

  const handleAddClaim = useCallback(async (warrantyId: string, description: string) => {
    if (!id || !user?.user_id) return;
    try {
      const res = await addWarrantyClaimRequest(user.user_id, id, warrantyId, { description });
      if (res.vehicle) updateVehicle(id, res.vehicle);
    } catch (_) { /* noop */ }
  }, [id, user?.user_id, updateVehicle]);

  // ── V-08: Associated cost handlers ──
  const handleAddCost = useCallback(async (cost: Partial<AssociatedCost>) => {
    if (!id || !user?.user_id) return;
    setCostLoading(true);
    try {
      const res = await addAssociatedCostRequest(user.user_id, id, cost);
      if (res.vehicle) updateVehicle(id, res.vehicle);
    } catch (_) { /* noop */ }
    finally { setCostLoading(false); }
  }, [id, user?.user_id, updateVehicle]);

  const handleDeleteCost = useCallback(async (costId: string) => {
    if (!id || !user?.user_id) return;
    try {
      const res = await deleteAssociatedCostRequest(user.user_id, id, costId);
      if (res.vehicle) updateVehicle(id, res.vehicle);
    } catch (_) { /* noop */ }
  }, [id, user?.user_id, updateVehicle]);

  const vehicle = vehicles.find(v => v.id === id);

  useEffect(() => {
    if (!vehicle) return;
    const nextRepairs = Array.isArray(vehicle.workshopRepairs)
      ? vehicle.workshopRepairs.map(normalizeRepairItem).filter((item): item is Repair => Boolean(item))
      : [];
    const nextChecklist = Array.isArray(vehicle.workshopChecklist)
      ? vehicle.workshopChecklist.map(normalizeChecklistItem).filter((item): item is ChecklistItem => Boolean(item))
      : [];
    const sanitizedChecklist = isLegacyDefaultChecklist(nextChecklist) ? [] : nextChecklist;
    setRepairs(nextRepairs.length > 0 ? nextRepairs : DEFAULT_REPAIRS);
    setChecklist(sanitizedChecklist.length > 0 ? sanitizedChecklist : DEFAULT_CHECKLIST);
  }, [vehicle?.id, vehicle?.updatedAt, vehicle?.workshopRepairs, vehicle?.workshopChecklist]);

  const persistWorkshopData = useCallback((nextRepairs: Repair[], nextChecklist: ChecklistItem[]) => {
    if (!vehicle) return;
    void updateVehicle(vehicle.id, {
      workshopRepairs: nextRepairs,
      workshopChecklist: nextChecklist,
    });
  }, [vehicle, updateVehicle]);

  const openAddRepairModal = useCallback(() => {
    setEditingRepair(null);
    setShowAddRepairModal(true);
  }, []);

  const toggleChecklist = (checklistId: string) =>
    setChecklist((prev) => {
      const next = prev.map((item) => (item.id === checklistId ? { ...item, done: !item.done } : item));
      persistWorkshopData(repairs, next);
      return next;
    });
  const deleteChecklist = (checklistId: string) =>
    setChecklist((prev) => {
      const next = prev.filter((item) => item.id !== checklistId);
      persistWorkshopData(repairs, next);
      return next;
    });
  const addChecklist = (task: string, category: string) =>
    setChecklist((prev) => {
      const next = [...prev, { id: `c${Date.now()}`, task, done: false, category }];
      persistWorkshopData(repairs, next);
      return next;
    });
  const renameChecklist = (checklistId: string, task: string) =>
    setChecklist((prev) => {
      const next = prev.map((item) => (item.id === checklistId ? { ...item, task } : item));
      persistWorkshopData(repairs, next);
      return next;
    });

  const addRepair = (repair: Repair) =>
    setRepairs((prev) => {
      const exists = prev.some((item) => item.id === repair.id);
      const next = exists
        ? prev.map((item) => (item.id === repair.id ? repair : item))
        : [repair, ...prev];
      persistWorkshopData(next, checklist);
      return next;
    });
  const toggleRepairStatus = (repairId: string) =>
    setRepairs((prev) => {
      const next = prev.map((item) => {
        if (item.id !== repairId) return item;
        const nextStatus: Record<Repair['status'], Repair['status']> = {
          pending: 'in_progress',
          in_progress: 'done',
          done: 'pending',
        };
        return { ...item, status: nextStatus[normalizeRepairStatus(item.status)] };
      });
      persistWorkshopData(next, checklist);
      return next;
    });
  const deleteRepair = (repairId: string) =>
    setRepairs((prev) => {
      const next = prev.filter((item) => item.id !== repairId);
      persistWorkshopData(next, checklist);
      return next;
    });

  if (!vehicle) {
    return (
      <Layout title={t('vehicles.notFound')} subtitle="">
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Vehículo no encontrado</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">El vehículo que buscas no existe o ha sido eliminado.</p>
          <button onClick={() => navigate('/saas/vehicles')} className="px-6 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-medium transition-colors">Volver a vehículos</button>
        </div>
      </Layout>
    );
  }

  // ── Calculations ──
  const purchaseDate = vehicle.purchaseDate ? new Date(vehicle.purchaseDate) : new Date(vehicle.createdAt);
  const today = new Date();
  const daysInStock = Math.floor((today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
  const totalCosts = repairs.reduce((s, r) => s + r.amount, 0);
  const totalCost  = vehicle.purchasePrice + totalCosts;
  const margin     = vehicle.salePrice ? vehicle.salePrice - totalCost : 0;
  const marginPct  = totalCost > 0 ? ((margin / totalCost) * 100).toFixed(1) : '0';
  const marginColor = margin >= 0 ? 'text-green-700' : 'text-red-600';

  // V-08: Real margin (purchasePrice + associated costs + preparation costs)
  const associatedCosts = vehicle.associatedCosts || [];
  const totalAssociatedCosts = associatedCosts.reduce((s, c) => s + c.amount, 0);
  const prepCostTotal = vehicle.preparationCostTotal || 0;
  const realTotalCost = vehicle.purchasePrice + totalCosts + Math.max(totalAssociatedCosts, prepCostTotal);
  const realMargin = vehicle.salePrice ? vehicle.salePrice - realTotalCost : 0;
  const realMarginPct = realTotalCost > 0 ? ((realMargin / realTotalCost) * 100).toFixed(1) : '0';

  const history = useMemo(() => [
    { id: '1', action: 'Vehículo creado', user: 'Juan García', date: vehicle.purchaseDate, details: 'Entrada en stock' },
    { id: '2', action: 'Movido a Zona A-12', user: 'María López', date: '2025-01-16 10:30', details: 'Cambio de ubicación' },
    { id: '3', action: 'Estado cambiado', user: 'Juan García', date: '2025-01-20 14:20', details: 'De "En preparación" a "Listo para vender"' },
    { id: '4', action: 'Precio actualizado', user: 'Carlos Ruiz', date: '2025-01-22 09:15', details: `Precio venta: ${vehicle.salePrice?.toLocaleString('es-ES')}€` },
  ], [vehicle]);

  const getStatusBadge = (status: string) => {
    if (status === 'scrapped') {
      return <span className="px-3 py-1 text-sm font-semibold rounded-full border bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700">Desguace</span>;
    }
    const t = VEHICLE_STATUS_TOKEN[status as VehicleStatus];
    if (t) {
      return <span className={`px-3 py-1 text-sm font-semibold rounded-full border ${t.badgeBg} ${t.badgeText} border-gray-200 dark:border-gray-700`}>{t.label}</span>;
    }
    return <span className="px-3 py-1 text-sm font-semibold rounded-full border bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700">{status}</span>;
  };

  // (quickActions kept for legacy compatibility, now replaced by inline action bar)

  // ── Section renders ──

  // ── NEW: Ficha tab — ficha técnica + ubicación + origen ──
  const renderFicha = () => (
    <div className="space-y-4">
      <WorkflowBar status={vehicle.status} />

      {/* Ubicación */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 text-sm"><MapPin className="w-4 h-4 text-amber-600" />Ubicación actual</h3>
          <button onClick={() => setShowMoveModal(true)} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5">
            <Move className="w-3.5 h-3.5" />Mover
          </button>
        </div>
        <div className="p-3 bg-amber-50 border-2 border-amber-200 rounded-xl flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-600 rounded-lg flex items-center justify-center flex-shrink-0"><MapPin className="w-4 h-4 text-white" /></div>
          <div>
            <div className="font-bold text-amber-900 text-sm">{vehicle.location || 'Sin asignar'}</div>
            <button onClick={() => navigate('/saas/locations')} className="text-xs text-amber-600 hover:text-amber-700 font-medium">Ver en mapa →</button>
          </div>
        </div>
      </div>

      {/* Ficha técnica */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2 text-sm"><Info className="w-4 h-4 text-blue-600" />Ficha técnica</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: <Tag className="w-3.5 h-3.5" />, label: 'Versión', value: vehicle.version || '—', full: true },
            { icon: <Fuel className="w-3.5 h-3.5" />, label: 'Combustible', value: vehicle.fuelType ? { gasolina:'Gasolina', diesel:'Diésel', hibrido:'Híbrido', electrico:'Eléctrico', glp:'GLP', otro:'Otro' }[vehicle.fuelType] : '—' },
            { icon: <ToggleLeft className="w-3.5 h-3.5" />, label: 'Cambio', value: vehicle.transmission ? { manual:'Manual', automatico:'Automático', semiauto:'Semiautomático' }[vehicle.transmission] : '—' },
            { icon: <Palette className="w-3.5 h-3.5" />, label: 'Color', value: vehicle.color || '—' },
            { icon: <Gauge className="w-3.5 h-3.5" />, label: 'Kilómetros', value: vehicle.mileage ? `${vehicle.mileage.toLocaleString('es-ES')} km` : '—' },
            { icon: <Zap className="w-3.5 h-3.5" />, label: 'Potencia', value: vehicle.power ? `${vehicle.power} CV` : '—' },
            { icon: <DoorOpen className="w-3.5 h-3.5" />, label: 'Puertas', value: vehicle.doors ? `${vehicle.doors} puertas` : '—' },
            { icon: <Car className="w-3.5 h-3.5" />, label: 'Carrocería', value: vehicle.bodyType ? { sedan:'Sedán', suv:'SUV', familiar:'Familiar', coupe:'Coupé', cabrio:'Cabrio', furgon:'Furgón', pickup:'Pick-up', otro:'Otro' }[vehicle.bodyType] : '—' },
            { icon: <Fingerprint className="w-3.5 h-3.5" />, label: 'Bastidor (VIN)', value: vehicle.vin || '—', mono: true, full: true },
          ].map(row => (
            <div key={row.label} className={`p-3 bg-gray-50 dark:bg-gray-800 rounded-xl ${row.full ? 'col-span-2' : ''}`}>
              <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 mb-1">{row.icon}<span className="text-[10px] font-medium uppercase tracking-wide">{row.label}</span></div>
              <div className={`font-semibold text-gray-900 dark:text-gray-100 ${row.mono ? 'font-mono text-xs' : 'text-sm'}`}>{row.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Origen */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2 text-sm"><User className="w-4 h-4 text-purple-600" />Origen de compra</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Tipo', value: vehicle.origin ? { particular:'Particular', empresa:'Empresa', subasta:'Subasta', permuta:'Permuta', otro:'Otro' }[vehicle.origin] : '—' },
            { label: 'Fecha compra', value: vehicle.purchaseDate ? new Date(vehicle.purchaseDate).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' }) : '—' },
            { label: 'Vendedor / Proveedor', value: vehicle.supplierName || '—', full: true },
          ].map(row => (
            <div key={row.label} className={`p-3 bg-gray-50 dark:bg-gray-800 rounded-xl ${row.full ? 'col-span-2' : ''}`}>
              <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{row.label}</div>
              <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{row.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── NEW: Finanzas tab ──
  const renderFinanzas = () => (
    <div className="space-y-4">
      {/* KPIs top */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`p-4 rounded-2xl border-2 col-span-2 flex items-center justify-between ${daysInStock > 90 ? 'bg-red-50 border-red-200' : daysInStock > 45 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
          <div>
            <div className={`text-xs font-semibold uppercase tracking-wide mb-0.5 ${daysInStock > 90 ? 'text-red-500' : daysInStock > 45 ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'}`}>Días en stock</div>
            <div className={`font-bold text-4xl ${daysInStock > 90 ? 'text-red-700' : daysInStock > 45 ? 'text-amber-700' : 'text-gray-900 dark:text-gray-100'}`}>{daysInStock}</div>
          </div>
          {daysInStock > 90 && <div className="text-2xl">⚠️</div>}
          {daysInStock > 45 && daysInStock <= 90 && <div className="text-2xl">⏱️</div>}
          {daysInStock <= 45 && <div className="text-2xl">✅</div>}
        </div>
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700">
          <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Precio compra</div>
          <div className="font-bold text-gray-900 dark:text-gray-100 text-xl">{vehicle.purchasePrice.toLocaleString('es-ES')}€</div>
        </div>
        <div className="p-4 bg-blue-50 rounded-2xl border-2 border-blue-200">
          <div className="text-[10px] text-blue-500 uppercase tracking-wide mb-1">Coste total</div>
          <div className="font-bold text-blue-900 text-xl">{totalCost.toLocaleString('es-ES')}€</div>
        </div>
        <div className="p-4 bg-green-50 rounded-2xl border-2 border-green-200 relative">
          <div className="text-[10px] text-green-600 uppercase tracking-wide mb-1">Precio venta</div>
          <div className="font-bold text-green-900 text-xl">{vehicle.salePrice?.toLocaleString('es-ES') ?? '—'}€</div>
          <button
            onClick={() => setShowPriceCalculator(true)}
            className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-green-200 hover:bg-green-300 rounded-lg transition-colors"
            title="Calcular precio automáticamente"
          >
            <Calculator className="w-3.5 h-3.5 text-green-800" />
          </button>
        </div>
        <div className={`p-4 rounded-2xl border-2 ${margin >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <div className={`text-[10px] uppercase tracking-wide mb-1 ${margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>Margen bruto</div>
          <div className={`font-bold text-xl ${marginColor}`}>{margin.toLocaleString('es-ES')}€</div>
          <div className={`text-xs mt-0.5 ${marginColor}`}>{margin >= 0 ? '+' : ''}{marginPct}%</div>
        </div>
      </div>

      {/* CTA calculadora */}
      <button
        onClick={() => setShowPriceCalculator(true)}
        className="w-full flex items-center gap-3 p-3.5 bg-indigo-50 hover:bg-indigo-100 border-2 border-indigo-200 rounded-2xl transition-colors group"
      >
        <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-700 transition-colors">
          <Calculator className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
        </div>
        <div className="flex-1 text-left">
          <div className="text-sm font-bold text-indigo-900">Calcular precio de venta</div>
          <div className="text-xs text-indigo-600">Basado en costes, margen objetivo y mercado</div>
        </div>
        <ChevronRight className="w-4 h-4 text-indigo-400 flex-shrink-0" />
      </button>

      {/* VEH-08: Desglose de costes por categoría */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 text-sm"><Euro className="w-4 h-4 text-blue-600" />Costes de preparación</h3>
          <button onClick={() => setShowExpenseModal(true)} className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 px-3 py-1.5 rounded-lg transition-colors">
            <PlusCircle className="w-3.5 h-3.5" />Añadir gasto
          </button>
        </div>

        {/* Category breakdown */}
        {(() => {
          const catGroups: Record<string, { label: string; color: string; bg: string; total: number; count: number }> = {
            taller:   { label: 'Mecánica / Taller',  color: 'text-purple-700', bg: 'bg-purple-50 border-purple-100', total: 0, count: 0 },
            limpieza: { label: 'Limpieza / Detailing', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-100',    total: 0, count: 0 },
            marketing:{ label: 'Foto / Marketing',   color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-100',  total: 0, count: 0 },
            admin:    { label: 'Admin / Documentación', color: 'text-gray-600 dark:text-gray-400',  bg: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',    total: 0, count: 0 },
            otro:     { label: 'Otros',               color: 'text-teal-700',   bg: 'bg-teal-50 border-teal-100',    total: 0, count: 0 },
          };
          // Map repairs to categories
          repairs.forEach(rep => {
            // Infer category from repair concept keywords
            let cat = 'otro';
            const lower = rep.concept.toLowerCase();
            if (lower.includes('mecáni') || lower.includes('motor') || lower.includes('freno') || lower.includes('aceite') || lower.includes('filtro') || lower.includes('suspensión') || lower.includes('itv')) cat = 'taller';
            else if (lower.includes('chapa') || lower.includes('pintura') || lower.includes('paragolpes') || lower.includes('abolladur')) cat = 'taller';
            else if (lower.includes('limpiez') || lower.includes('detailing') || lower.includes('lavado') || lower.includes('pulido')) cat = 'limpieza';
            else if (lower.includes('foto') || lower.includes('marketing') || lower.includes('publicidad') || lower.includes('anuncio')) cat = 'marketing';
            else if (lower.includes('document') || lower.includes('permiso') || lower.includes('transferencia') || lower.includes('admin')) cat = 'admin';
            if (catGroups[cat]) {
              catGroups[cat].total += rep.amount;
              catGroups[cat].count++;
            }
          });

          const active = Object.entries(catGroups).filter(([, g]) => g.count > 0);
          return (
            <div className="space-y-1.5 mb-3">
              <div className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-800">
                <span className="text-gray-600 dark:text-gray-400 text-sm font-medium">Precio de compra</span>
                <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">{vehicle.purchasePrice.toLocaleString('es-ES')} €</span>
              </div>
              {active.length > 0 && (
                <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                  {active.map(([key, g]) => (
                    <div key={key} className={`flex items-center justify-between px-3 py-2.5 border-b last:border-b-0 ${g.bg}`}>
                      <div>
                        <span className={`text-xs font-semibold ${g.color}`}>{g.label}</span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-2">{g.count} intervención{g.count > 1 ? 'es' : ''}</span>
                      </div>
                      <span className={`font-semibold text-sm ${g.color}`}>{g.total.toLocaleString('es-ES')} €</span>
                    </div>
                  ))}
                </div>
              )}
              {totalCosts > 0 && (
                <div className="flex items-center justify-between p-2.5 bg-purple-50 rounded-lg border border-purple-100">
                  <span className="text-purple-700 text-sm font-medium">Total preparación</span>
                  <span className="font-bold text-purple-700 text-sm">{totalCosts.toLocaleString('es-ES')} €</span>
                </div>
              )}
              <div className="border-t-2 border-gray-200 dark:border-gray-700 pt-1.5">
                <div className="flex items-center justify-between p-2.5 bg-blue-50 rounded-lg border border-blue-100">
                  <span className="font-bold text-blue-900 text-sm">Coste total (compra + preparación)</span>
                  <span className="font-bold text-blue-900">{totalCost.toLocaleString('es-ES')} €</span>
                </div>
              </div>
              {vehicle.salePrice && (
                <div className={`flex items-center justify-between p-2.5 rounded-lg border ${margin >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <span className={`font-bold text-sm ${margin >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                    Margen neto estimado
                  </span>
                  <div className="text-right">
                    <span className={`font-bold ${margin >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {margin >= 0 ? '+' : ''}{margin.toLocaleString('es-ES')} €
                    </span>
                    <span className={`block text-[10px] ${margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {marginPct}% s/coste
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {repairs.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">Sin costes de preparación registrados aún</p>
        )}
      </div>

      {/* Estado */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 text-sm">Estado del vehículo</h3>
        <div className="space-y-2">
          {STATUS_OPTIONS_INLINE.map(opt => (
            <button
              key={opt.value}
              onClick={() => updateVehicle(vehicle.id, { status: opt.value as Vehicle['status'] })}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 transition-all text-sm font-medium ${
                vehicle.status === opt.value
                  ? opt.badge + ' border-current shadow-sm'
                  : 'border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${opt.dot}`} />
              <span className="flex-1 text-left">{opt.label}</span>
              {vehicle.status === opt.value && <Check className="w-4 h-4 flex-shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* V-08: Costes asociados al vehículo ─────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 text-sm">
            <PackagePlus className="w-4 h-4 text-orange-600" />Costes asociados
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-full">{associatedCosts.length}</span>
          </h3>
          <button onClick={() => setShowAddCostModal(true)} className="flex items-center gap-1 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-2.5 py-1.5 rounded-lg transition-colors">
            <Plus className="w-3 h-3" />Añadir
          </button>
        </div>
        {associatedCosts.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {associatedCosts.map(cost => {
              const catLabels: Record<string, string> = { preparacion: 'Preparación', itv: 'ITV', limpieza: 'Limpieza', fotos: 'Fotos', publicidad: 'Publicidad', otro: 'Otro' };
              const catColors: Record<string, string> = { preparacion: 'bg-purple-100 text-purple-700', itv: 'bg-blue-100 text-blue-700', limpieza: 'bg-cyan-100 text-cyan-700', fotos: 'bg-pink-100 text-pink-700', publicidad: 'bg-amber-100 text-amber-700', otro: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' };
              return (
                <div key={cost.id} className="flex items-center gap-3 px-4 py-3 group hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{cost.description || catLabels[cost.category]}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${catColors[cost.category] || catColors.otro}`}>{catLabels[cost.category]}</span>
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{new Date(cost.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                  </div>
                  <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">{cost.amount.toLocaleString('es-ES')}€</span>
                  <button onClick={() => handleDeleteCost(cost.id)} className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 flex items-center justify-center hover:bg-red-100 rounded-lg">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-6 text-center">
            <PackagePlus className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400 dark:text-gray-500">Sin costes registrados</p>
          </div>
        )}
        {totalAssociatedCosts > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-orange-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-orange-700">Total costes asociados</span>
            <span className="font-bold text-orange-700 text-sm">{totalAssociatedCosts.toLocaleString('es-ES')}€</span>
          </div>
        )}
        {prepCostTotal > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">Gastos de preparación</span>
            <span className="font-bold text-indigo-700 dark:text-indigo-400 text-sm">{prepCostTotal.toLocaleString('es-ES')}€</span>
          </div>
        )}
        <button onClick={() => navigate(`/saas/vertical/compraventa/gastos-preparacion?vehicleId=${vehicle.id}`)}
          className="w-full px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-center">
          Ver todos los gastos de preparación →
        </button>
      </div>

      {/* Real margin summary */}
      {totalAssociatedCosts > 0 && vehicle.salePrice && (
        <div className={`p-4 rounded-2xl border-2 ${realMargin >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2 text-gray-500 dark:text-gray-400">Margen real (todos los costes)</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-white/70 rounded-xl"><div className="text-[10px] text-gray-500 dark:text-gray-400">Compra</div><div className="font-bold text-sm">{vehicle.purchasePrice.toLocaleString('es-ES')}€</div></div>
            <div className="p-2 bg-white/70 rounded-xl"><div className="text-[10px] text-gray-500 dark:text-gray-400">Costes</div><div className="font-bold text-sm text-orange-700">{(totalCosts + totalAssociatedCosts).toLocaleString('es-ES')}€</div></div>
            <div className="p-2 bg-white/70 rounded-xl"><div className="text-[10px] text-gray-500 dark:text-gray-400">PVP</div><div className="font-bold text-sm text-green-700">{vehicle.salePrice.toLocaleString('es-ES')}€</div></div>
          </div>
          <div className={`mt-3 flex items-center justify-between px-3 py-2.5 rounded-xl ${realMargin >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
            <span className={`font-bold text-sm ${realMargin >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>Margen neto real</span>
            <div className="text-right">
              <span className={`font-bold text-lg ${realMargin >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{realMargin >= 0 ? '+' : ''}{realMargin.toLocaleString('es-ES')}€</span>
              <span className={`block text-xs ${realMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{realMarginPct}% s/coste</span>
            </div>
          </div>
        </div>
      )}

      {/* V-02: Historial de cambios de precio ────────────────────────────── */}
      {(vehicle.priceHistory?.length ?? 0) > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 text-sm">
              <TrendingUp className="w-4 h-4 text-blue-600" />Historial de precios
              <span className="text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-full">{vehicle.priceHistory!.length} cambios</span>
            </h3>
            <button onClick={() => setShowPriceHistoryModal(true)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Ver todo</button>
          </div>
          <div className="divide-y divide-gray-50">
            {(vehicle.priceHistory || []).slice().reverse().slice(0, 5).map(entry => (
              <div key={entry.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="text-gray-400 dark:text-gray-500 line-through text-xs">{entry.oldPrice != null ? `${entry.oldPrice.toLocaleString('es-ES')}€` : '—'}</span>
                    <ChevronRight className="w-3 h-3 text-gray-300" />
                    <span className="font-bold text-gray-900 dark:text-gray-100">{entry.newPrice != null ? `${entry.newPrice.toLocaleString('es-ES')}€` : '—'}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{new Date(entry.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-2">
                  <User className="w-2.5 h-2.5" />{entry.userName}
                  {entry.reason && <><span>·</span><span className="italic">{entry.reason}</span></>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Crear venta CTA */}
      <div className="p-5 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl">
        <h3 className="font-bold text-green-900 mb-1">Crear operación de venta</h3>
        <p className="text-sm text-green-700 mb-4">Inicia el proceso de venta para este vehículo</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 bg-white/70 rounded-xl">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Precio venta</div>
            <div className="font-bold text-green-600">{vehicle.salePrice?.toLocaleString('es-ES') ?? '—'}€</div>
          </div>
          <div className="p-3 bg-white/70 rounded-xl">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Margen esperado</div>
            <div className={`font-bold ${marginColor}`}>{margin.toLocaleString('es-ES')}€</div>
          </div>
        </div>
        <button onClick={() => navigate(`/saas/vertical/compraventa/ventas?newSale=1&vehicleId=${encodeURIComponent(vehicle.id)}`)} className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2">
          <TrendingUp className="w-4 h-4" />Crear venta
        </button>
      </div>
    </div>
  );

  // ── Enhanced history events for VEH-03 ──
  const allHistoryEvents = useMemo(() => {
    const events: Array<{
      id: string;
      type: 'create' | 'status' | 'price' | 'location' | 'repair' | 'note' | 'photo' | 'document';
      action: string;
      details: string;
      user: string;
      date: string;
      icon: string;
      color: string;
    }> = [];

    // Creation
    events.push({
      id: 'ev-create', type: 'create',
      action: 'Vehículo creado en sistema',
      details: `Entrada en stock · Precio compra: ${vehicle.purchasePrice.toLocaleString('es-ES')}€`,
      user: 'Sistema',
      date: vehicle.purchaseDate ?? new Date(vehicle.createdAt).toLocaleDateString('es-ES'),
      icon: '🚗', color: 'bg-blue-500',
    });

    // Purchase date
    if (vehicle.purchaseDate) {
      events.push({
        id: 'ev-purchase', type: 'status',
        action: 'Fecha de compra registrada',
        details: `Adquirido el ${new Date(vehicle.purchaseDate).toLocaleDateString('es-ES', { day:'2-digit', month:'long', year:'numeric' })}`,
        user: vehicle.supplierName ?? 'Proveedor',
        date: vehicle.purchaseDate,
        icon: '🛒', color: 'bg-purple-500',
      });
    }

    // Status-based events
    if (vehicle.status === 'entrada') {
      events.push({
        id: 'ev-entrada', type: 'status',
        action: 'Entrada en inventario',
        details: `Estado: ${VEHICLE_STATUS_TOKEN.entrada.label}`,
        user: 'Sistema',
        date: vehicle.updatedAt ? new Date(vehicle.updatedAt).toLocaleDateString('es-ES') : '—',
        icon: '📥', color: 'bg-blue-500',
      });
    }
    if (vehicle.status === 'listo') {
      events.push({
        id: 'ev-listo', type: 'status',
        action: 'Listo para venta',
        details: `El vehículo está marcado como ${VEHICLE_STATUS_TOKEN.listo.label.toLowerCase()}`,
        user: 'Comercial',
        date: vehicle.updatedAt ? new Date(vehicle.updatedAt).toLocaleDateString('es-ES') : '—',
        icon: '✅', color: 'bg-emerald-500',
      });
    }
    if (vehicle.status === 'reservado') {
      events.push({
        id: 'ev-res', type: 'status',
        action: 'Vehículo reservado',
        details: 'Reservado por cliente. Pendiente de cierre',
        user: 'Comercial',
        date: vehicle.updatedAt ? new Date(vehicle.updatedAt).toLocaleDateString('es-ES') : '—',
        icon: '🔒', color: 'bg-amber-500',
      });
    }
    if (vehicle.status === 'vendido') {
      events.push({
        id: 'ev-sold', type: 'status',
        action: 'Vehículo vendido',
        details: vehicle.soldAt
          ? `Vendido el ${new Date(vehicle.soldAt).toLocaleDateString('es-ES', { day:'2-digit', month:'long', year:'numeric' })}`
          : 'Operación de venta cerrada',
        user: 'Comercial',
        date: vehicle.soldAt ? new Date(vehicle.soldAt).toLocaleDateString('es-ES') : '—',
        icon: '🎉', color: 'bg-green-600',
      });
    }
    if (vehicle.status === 'preparacion') {
      events.push({
        id: 'ev-prep', type: 'repair',
        action: 'En preparación',
        details: `El vehículo está en fase de ${VEHICLE_STATUS_TOKEN.preparacion.label.toLowerCase()}`,
        user: 'Taller',
        date: vehicle.updatedAt ? new Date(vehicle.updatedAt).toLocaleDateString('es-ES') : '—',
        icon: '🔧', color: 'bg-purple-500',
      });
    }

    // Sale price
    if (vehicle.salePrice) {
      events.push({
        id: 'ev-price', type: 'price',
        action: 'Precio de venta establecido',
        details: `PVP: ${vehicle.salePrice.toLocaleString('es-ES')}€ · Margen estimado: ${(vehicle.salePrice - vehicle.purchasePrice).toLocaleString('es-ES')}€`,
        user: 'Comercial',
        date: vehicle.updatedAt ? new Date(vehicle.updatedAt).toLocaleDateString('es-ES') : '—',
        icon: '💶', color: 'bg-emerald-500',
      });
    }

    // Location
    if (vehicle.location) {
      events.push({
        id: 'ev-loc', type: 'location',
        action: 'Ubicación asignada',
        details: `Zona: ${vehicle.location}`,
        user: 'Logística',
        date: vehicle.updatedAt ? new Date(vehicle.updatedAt).toLocaleDateString('es-ES') : '—',
        icon: '📍', color: 'bg-orange-500',
      });
    }

    // Repairs
    repairs.forEach((rep, idx) => {
      events.push({
        id: `ev-rep-${idx}`, type: 'repair',
        action: `Reparación: ${rep.concept}`,
        details: `${rep.amount.toLocaleString('es-ES')}€ · ${rep.workshop || 'Sin taller'} · ${rep.status === 'done' ? 'Completado' : rep.status === 'in_progress' ? 'En curso' : 'Pendiente'}`,
        user: rep.workshop || 'Taller',
        date: new Date(rep.date).toLocaleDateString('es-ES'),
        icon: '🔩', color: 'bg-gray-500',
      });
    });

    // Photos
    if (vehicle.images && vehicle.images.length > 0) {
      events.push({
        id: 'ev-photos', type: 'photo',
        action: `${vehicle.images.length} foto${vehicle.images.length > 1 ? 's' : ''} añadida${vehicle.images.length > 1 ? 's' : ''}`,
        details: 'Galería fotográfica actualizada',
        user: 'Marketing',
        date: vehicle.updatedAt ? new Date(vehicle.updatedAt).toLocaleDateString('es-ES') : '—',
        icon: '📸', color: 'bg-pink-500',
      });
    }

    return events.sort((a, b) => {
      const da = new Date(a.date).getTime() || 0;
      const db = new Date(b.date).getTime() || 0;
      return db - da;
    });
  }, [vehicle, repairs]);

  // ── NEW: Más tab — docs + historial + notas + desguace ──
  const renderMas = () => (
    <div className="space-y-4">
      {/* Notas */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2 text-sm"><StickyNote className="w-4 h-4 text-amber-600" />Notas internas</h3>
        {vehicle.notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
            <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{vehicle.notes}</p>
          </div>
        )}
        <textarea rows={3} placeholder="Añadir nota interna…"
          className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm resize-none" />
        <div className="flex justify-end mt-2">
          <button className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors">Guardar nota</button>
        </div>
      </div>

      {/* Documentos */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 text-sm"><FileText className="w-4 h-4 text-blue-600" />Documentos</h3>
          <button onClick={() => navigate('/saas/documents')} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Ver todos →</button>
        </div>
        <div className="space-y-2">
          {['Ficha técnica', 'Permiso de circulación', 'Informe ITV', 'Contrato de compra'].map((doc, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0"><FileText className="w-4 h-4 text-blue-600" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">{doc}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">PDF · hace 3 días</div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* VEH-03: Historial completo con timeline ──────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-gray-600 dark:text-gray-400" />Historial completo
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-full">{allHistoryEvents.length} eventos</span>
          </h3>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Orden: más reciente primero</span>
        </div>
        <div className="p-4">
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-100 dark:bg-gray-700 rounded-full" />
            <div className="space-y-3">
              {allHistoryEvents.map((ev, idx) => (
                <div key={ev.id} className="relative pl-11">
                  {/* Icon dot */}
                  <div className={`absolute left-1 top-1 w-6 h-6 rounded-full ${ev.color} flex items-center justify-center text-[11px] shadow-sm`}>
                    {ev.icon}
                  </div>
                  <div className={`p-3 rounded-xl border transition-colors ${idx === 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-800 hover:border-gray-200'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{ev.action}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{ev.details}</p>
                      </div>
                      {idx === 0 && (
                        <span className="flex-shrink-0 text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Último</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                      <span className="flex items-center gap-1">
                        <User className="w-2.5 h-2.5" />{ev.user}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" />{ev.date}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        ev.type === 'create' ? 'bg-blue-100 text-blue-600' :
                        ev.type === 'status' ? 'bg-green-100 text-green-600' :
                        ev.type === 'price'  ? 'bg-emerald-100 text-emerald-600' :
                        ev.type === 'repair' ? 'bg-purple-100 text-purple-600' :
                        ev.type === 'photo'  ? 'bg-pink-100 text-pink-600' :
                        ev.type === 'location' ? 'bg-orange-100 text-orange-600' :
                        'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}>
                        {ev.type === 'create' ? 'Alta' :
                         ev.type === 'status' ? 'Estado' :
                         ev.type === 'price'  ? 'Precio' :
                         ev.type === 'repair' ? 'Taller' :
                         ev.type === 'photo'  ? 'Fotos' :
                         ev.type === 'location' ? 'Ubicación' :
                         ev.type === 'note' ? 'Nota' : 'Documento'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {allHistoryEvents.length === 0 && (
                <div className="text-center py-6">
                  <RefreshCw className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">Sin eventos registrados</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* V-07: Gestión de garantías ──────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 text-sm">
            <ShoppingCart className="w-4 h-4 text-teal-600" />Garantías
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-full">{(vehicle.warranties || []).length}</span>
          </h3>
          <button onClick={() => setShowAddWarrantyModal(true)} className="flex items-center gap-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1.5 rounded-lg transition-colors">
            <Plus className="w-3 h-3" />Añadir garantía
          </button>
        </div>
        {(vehicle.warranties || []).length > 0 ? (
          <div className="divide-y divide-gray-50">
            {(vehicle.warranties || []).map(w => {
              const isExpired = w.endDate && new Date(w.endDate) < new Date();
              const typeLabel = w.type === 'factory' ? 'Fábrica' : 'Propia';
              const typeBadge = w.type === 'factory' ? 'bg-blue-100 text-blue-700' : 'bg-teal-100 text-teal-700';
              return (
                <div key={w.id} className="p-4 group">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{w.provider || 'Garantía'}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${typeBadge}`}>{typeLabel}</span>
                        {isExpired && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Caducada</span>}
                      </div>
                      {w.coverage && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{w.coverage}</p>}
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                        {w.startDate && <span>Inicio: {new Date(w.startDate).toLocaleDateString('es-ES')}</span>}
                        {w.endDate && <span>Fin: {new Date(w.endDate).toLocaleDateString('es-ES')}</span>}
                        {w.claims.length > 0 && <span className="text-amber-600">{w.claims.length} reclamación{w.claims.length > 1 ? 'es' : ''}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      {/* V-11: Certificado de garantía */}
                      <button
                        onClick={() => generateWarrantyCertificate(vehicle, w)}
                        title="Imprimir certificado de garantía"
                        className="w-7 h-7 flex items-center justify-center hover:bg-teal-100 rounded-lg transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 text-teal-600" />
                      </button>
                      <button onClick={() => setShowAddClaimModal(w.id)} className="text-[10px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg transition-colors">+ Reclamación</button>
                      <button onClick={() => handleDeleteWarranty(w.id)} className="w-7 h-7 flex items-center justify-center hover:bg-red-100 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                  {w.claims.length > 0 && (
                    <div className="mt-2 pl-3 border-l-2 border-amber-200 space-y-1">
                      {w.claims.map(cl => (
                        <div key={cl.id} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${cl.resolved ? 'bg-green-500' : 'bg-amber-500'}`} />
                          <span>{cl.description} <span className="text-gray-400 dark:text-gray-500">({new Date(cl.date).toLocaleDateString('es-ES')})</span></span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-6 text-center">
            <ShoppingCart className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400 dark:text-gray-500">Sin garantías registradas</p>
          </div>
        )}
      </div>

      {/* V-09: Enlace a ficha pública */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2 text-sm"><Globe className="w-4 h-4 text-indigo-600" />Microsite público</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">URL pública con fotos, descripción y precio para compartir con clientes.</p>
        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl">
          <span className="flex-1 text-xs text-indigo-700 truncate font-mono">{typeof window !== 'undefined' ? `${window.location.origin}/v/${id}` : `/v/${id}`}</span>
          <button onClick={() => navigator.clipboard?.writeText(`${typeof window !== 'undefined' ? window.location.origin : ''}/v/${id}`)} className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 transition-colors">
            <Copy className="w-3 h-3" />Copiar
          </button>
          <a href={`/v/${id}`} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 transition-colors">
            <ExternalLink className="w-3 h-3" />Abrir
          </a>
        </div>
      </div>

      {/* Desguace — zona de peligro */}
      <div className="p-4 bg-red-50 border-2 border-red-200 rounded-2xl">
        <div className="flex items-start gap-3">
          <Trash2 className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-bold text-red-900 text-sm mb-1">Zona de peligro</h3>
            <p className="text-xs text-red-700 mb-3">El desguace es una acción irreversible. Asegúrate de tener la documentación necesaria.</p>
            <button onClick={() => setShowScrapModal(true)} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors text-sm">
              Iniciar desguace
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── LEGACY render (kept for compatibility, no longer used in main layout) ──
  const renderInfo = () => (
    <div className="space-y-5">
      <WorkflowBar status={vehicle.status} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Location */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><MapPin className="w-4 h-4 text-amber-600" />Ubicación actual</h3>
              <button onClick={() => setShowMoveModal(true)} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5" />Mover
              </button>
            </div>
            <div className="p-3 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center flex-shrink-0"><MapPin className="w-5 h-5 text-white" /></div>
                <div>
                  <div className="font-bold text-amber-900 text-sm">{vehicle.location || 'Sin asignar'}</div>
                  <div className="text-xs text-amber-700">Zona A · Fila 1</div>
                  <button onClick={() => navigate('/saas/locations')} className="text-xs text-amber-600 hover:text-amber-700 font-medium mt-0.5">Ver en mapa →</button>
                </div>
              </div>
            </div>
          </div>

          {/* Ficha técnica */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2"><Info className="w-4 h-4 text-blue-600" />Ficha técnica</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: <Tag className="w-3.5 h-3.5" />, label: 'Versión', value: vehicle.version || '—', full: true },
                { icon: <Fuel className="w-3.5 h-3.5" />, label: 'Combustible', value: vehicle.fuelType ? { gasolina:'Gasolina', diesel:'Diésel', hibrido:'Híbrido', electrico:'Eléctrico', glp:'GLP', otro:'Otro' }[vehicle.fuelType] : '—' },
                { icon: <ToggleLeft className="w-3.5 h-3.5" />, label: 'Cambio', value: vehicle.transmission ? { manual:'Manual', automatico:'Automático', semiauto:'Semiautomático' }[vehicle.transmission] : '—' },
                { icon: <Palette className="w-3.5 h-3.5" />, label: 'Color', value: vehicle.color || '—' },
                { icon: <Gauge className="w-3.5 h-3.5" />, label: 'Kilómetros', value: vehicle.mileage ? `${vehicle.mileage.toLocaleString('es-ES')} km` : '—' },
                { icon: <Zap className="w-3.5 h-3.5" />, label: 'Potencia', value: vehicle.power ? `${vehicle.power} CV` : '—' },
                { icon: <DoorOpen className="w-3.5 h-3.5" />, label: 'Puertas', value: vehicle.doors ? `${vehicle.doors} puertas` : '—' },
                { icon: <Car className="w-3.5 h-3.5" />, label: 'Carrocería', value: vehicle.bodyType ? { sedan:'Sedán', suv:'SUV', familiar:'Familiar', coupe:'Coupé', cabrio:'Cabrio', furgon:'Furgón', pickup:'Pick-up', otro:'Otro' }[vehicle.bodyType] : '—' },
                { icon: <Fingerprint className="w-3.5 h-3.5" />, label: 'Bastidor (VIN)', value: vehicle.vin || '—', mono: true, full: true },
              ].map(row => (
                <div key={row.label} className={`p-3 bg-gray-50 dark:bg-gray-800 rounded-xl ${row.full ? 'col-span-2' : ''}`}>
                  <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 mb-1">{row.icon}<span className="text-[10px] font-medium uppercase tracking-wide">{row.label}</span></div>
                  <div className={`font-semibold text-gray-900 dark:text-gray-100 ${row.mono ? 'font-mono text-xs' : 'text-sm'}`}>{row.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Origen */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2"><User className="w-4 h-4 text-purple-600" />Origen de compra</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Tipo', value: vehicle.origin ? { particular:'Particular', empresa:'Empresa', subasta:'Subasta', permuta:'Permuta', otro:'Otro' }[vehicle.origin] : '—' },
                { label: 'Fecha compra', value: vehicle.purchaseDate ? new Date(vehicle.purchaseDate).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' }) : '—' },
                { label: 'Vendedor / Proveedor', value: vehicle.supplierName || '—', full: true },
              ].map(row => (
                <div key={row.label} className={`p-3 bg-gray-50 dark:bg-gray-800 rounded-xl ${row.full ? 'col-span-2' : ''}`}>
                  <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{row.label}</div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{row.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Costes */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Euro className="w-4 h-4 text-blue-600" />Costes y gastos</h3>
              <button onClick={() => setShowExpenseModal(true)} className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 px-3 py-1.5 rounded-lg transition-colors">
                <PlusCircle className="w-3.5 h-3.5" />Añadir
              </button>
            </div>
            <div className="space-y-1.5">
              {[
                { label: 'Precio de compra', value: `${(vehicle.purchasePrice || 0).toLocaleString('es-ES')}€` },
                {
                  label: 'Reparaciones / taller',
                  value: totalCosts > 0 ? `${totalCosts.toLocaleString('es-ES')}€` : '—',
                },
                {
                  label: 'Gastos de preparación',
                  value: Math.max(totalAssociatedCosts, prepCostTotal) > 0
                    ? `${Math.max(totalAssociatedCosts, prepCostTotal).toLocaleString('es-ES')}€`
                    : '—',
                },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-gray-600 dark:text-gray-400 text-sm">{item.label}</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{item.value}</span>
                </div>
              ))}
              <div className="border-t-2 border-gray-200 dark:border-gray-700 pt-1.5">
                <div className="flex items-center justify-between p-2.5 bg-blue-50 rounded-lg">
                  <span className="font-bold text-blue-900 text-sm">Coste total</span>
                  <span className="font-bold text-blue-900">{realTotalCost.toLocaleString('es-ES')}€</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/saas/vertical/compraventa/gastos-preparacion?vehicleId=${vehicle.id}`)}
                className="mt-2 w-full text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Gestionar gastos de preparación →
              </button>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3">Precio y margen</h3>
            <div className="space-y-2">
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl"><div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Precio de compra</div><div className="font-bold text-gray-900 dark:text-gray-100">{vehicle.purchasePrice.toLocaleString('es-ES')}€</div></div>
              <div className="p-3 bg-blue-50 rounded-xl"><div className="text-[10px] text-blue-500 uppercase tracking-wide mb-0.5">Coste total</div><div className="font-bold text-blue-900">{totalCost.toLocaleString('es-ES')}€</div></div>
              <div className="p-3 bg-green-50 rounded-xl"><div className="text-[10px] text-green-600 uppercase tracking-wide mb-0.5">Precio de venta</div><div className="font-bold text-green-900 text-xl">{vehicle.salePrice?.toLocaleString('es-ES') ?? '—'}€</div></div>
              <div className={`p-3 rounded-xl ${margin >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <div className={`text-[10px] uppercase tracking-wide mb-0.5 ${margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>Margen bruto</div>
                <div className={`font-bold text-xl ${marginColor}`}>{margin.toLocaleString('es-ES')}€</div>
                <div className={`text-xs mt-0.5 ${marginColor}`}>{marginPct}% sobre coste</div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3">Estado</h3>
            <div className="space-y-2">
              {STATUS_OPTIONS_INLINE.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => updateVehicle(vehicle.id, { status: opt.value as Vehicle['status'] })}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 transition-all text-sm font-medium ${
                    vehicle.status === opt.value
                      ? opt.badge + ' border-current shadow-sm'
                      : 'border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${opt.dot}`} />
                  <span className="flex-1 text-left">{opt.label}</span>
                  {vehicle.status === opt.value && <Check className="w-4 h-4 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3">Información</h3>
            <div className="space-y-2">
              <div className="p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 mb-1"><Calendar className="w-3.5 h-3.5" /><span className="text-[10px] font-medium uppercase tracking-wide">Fecha compra</span></div>
                <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{vehicle.purchaseDate ? new Date(vehicle.purchaseDate).toLocaleDateString('es-ES') : new Date(vehicle.createdAt).toLocaleDateString('es-ES')}</div>
              </div>
              <div className={`p-2.5 rounded-lg border ${daysInStock > 90 ? 'bg-red-50 border-red-200' : daysInStock > 45 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                <div className={`flex items-center gap-2 mb-1 ${daysInStock > 90 ? 'text-red-500' : daysInStock > 45 ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'}`}><Clock className="w-3.5 h-3.5" /><span className="text-[10px] font-medium uppercase tracking-wide">Días en stock</span></div>
                <div className={`font-bold text-2xl ${daysInStock > 90 ? 'text-red-700' : daysInStock > 45 ? 'text-amber-700' : 'text-gray-900 dark:text-gray-100'}`}>{daysInStock}</div>
                {daysInStock > 90 && <div className="text-xs text-red-600 mt-0.5">⚠️ Más de 90 días</div>}
              </div>
              <div className="p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 mb-1"><Gauge className="w-3.5 h-3.5" /><span className="text-[10px] font-medium uppercase tracking-wide">Kilómetros</span></div>
                <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{vehicle.mileage?.toLocaleString('es-ES')} km</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderFotos = () => (
    <PhotoGallery
      images={vehicle.images ?? []}
      onUpdate={imgs => updateVehicle(vehicle.id, { images: imgs })}
    />
  );

  const renderReparaciones = () => {
    const totalGastado = repairs.reduce((s, r) => s + r.amount, 0);
    const pendingCount = repairs.filter(r => r.status !== 'done').length;
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">Historial de reparaciones y preparación</div>
          <button type="button" onClick={openAddRepairModal} className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />Nueva reparación
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total gastado',    value: `${totalGastado.toLocaleString('es-ES')}€`, color: 'bg-blue-50 text-blue-900' },
            { label: 'Intervenciones',   value: repairs.length.toString(),                   color: 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100' },
            { label: 'Pendientes',       value: pendingCount.toString(),                     color: pendingCount > 0 ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-900' },
          ].map(s => (
            <div key={s.label} className={`p-3 rounded-xl ${s.color}`}>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{s.label}</div>
              <div className="font-bold text-sm">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Repairs list */}
        <div className="space-y-3">
          {repairs.length === 0 && (
            <div className="bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center">
              <Wrench className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">Sin reparaciones registradas</p>
              <button type="button" onClick={openAddRepairModal} className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors">
                Añadir primera reparación
              </button>
            </div>
          )}
          {repairs.map(rep => {
            const rs = REPAIR_STATUS[rep.status];
            return (
              <div key={rep.id} className={`bg-white dark:bg-gray-800 border-2 rounded-2xl p-4 group ${rs.border}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{rep.concept}</span>
                      {/* Clickable status badge — cycles through states */}
                      <button
                        onClick={() => toggleRepairStatus(rep.id)}
                        title="Click para cambiar estado"
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${rs.badge} hover:opacity-80 transition-opacity cursor-pointer`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${rs.dot}`} />
                        {rs.label}
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {rep.workshop && <span>{rep.workshop} · </span>}
                      {new Date(rep.date).toLocaleDateString('es-ES')}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="font-bold text-gray-900 dark:text-gray-100">{rep.amount.toLocaleString('es-ES')}€</span>
                    <button
                      onClick={() => { setEditingRepair(rep); setShowAddRepairModal(true); }}
                      className="w-7 h-7 flex items-center justify-center hover:bg-blue-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100 ml-1"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5 text-blue-500" />
                    </button>
                    <button
                      onClick={() => deleteRepair(rep.id)}
                      className="w-7 h-7 flex items-center justify-center hover:bg-red-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100 ml-1"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>
                {rep.notes && (
                  <div className="p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-xs text-gray-600 dark:text-gray-400">{rep.notes}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Checklist */}
        <ChecklistPanel
          items={checklist}
          onToggle={toggleChecklist}
          onDelete={deleteChecklist}
          onAdd={addChecklist}
          onRename={renameChecklist}
        />
      </div>
    );
  };

  const renderNotas = () => (
    <div className="space-y-5">
      {/* Nota interna del vehículo */}
      {vehicle.notes ? (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Notas del vehículo</p>
            <button className="text-xs text-amber-600 hover:text-amber-800 font-medium flex items-center gap-1">
              <Pencil className="w-3 h-3" />Editar
            </button>
          </div>
          <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{vehicle.notes}</p>
        </div>
      ) : (
        <div className="bg-gray-50 dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center">
          <StickyNote className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No hay notas internas para este vehículo</p>
          <button className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors">
            Añadir nota
          </button>
        </div>
      )}

      {/* Nueva nota */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-5">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2"><StickyNote className="w-4 h-4 text-amber-600" />Añadir nota</h3>
        <textarea
          rows={4}
          placeholder="Escribe una nota interna sobre este vehículo..."
          className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm resize-none"
        />
        <div className="flex justify-end mt-2">
          <button className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors">
            Guardar nota
          </button>
        </div>
      </div>

      {/* Historial de notas */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-5">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3">Historial de notas</h3>
        <div className="space-y-3">
          {[
            { user: 'Juan García', date: '20 ene 2025', text: 'Vehículo revisado y listo para publicar. Precio negociable.' },
            { user: 'María López', date: '18 ene 2025', text: 'Cliente interesado, pendiente de financiación. Llamar el lunes.' },
            { user: 'Carlos Ruiz', date: '15 ene 2025', text: 'ITV en orden, documentación completa.' },
          ].map((nota, idx) => (
            <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="flex items-center gap-2 mb-1.5">
                <NoteUserCard name={nota.user} />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{nota.user}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">{nota.date}</span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{nota.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Secondary tabs ──
  const renderDocumentos = () => (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">Documentos asociados al vehículo</div>
        <button onClick={() => navigate('/saas/documents')} className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl flex items-center gap-2 font-medium transition-colors text-sm">
          <FileText className="w-4 h-4" />Gestionar documentos
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['Ficha técnica', 'Permiso de circulación', 'Informe ITV', 'Contrato de compra'].map((doc, idx) => (
          <div key={idx} className="p-4 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0"><FileText className="w-6 h-6 text-blue-600" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{doc}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">PDF · 2.4 MB</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Subido hace 3 días</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderHistorial = () => (
    <div className="space-y-5">
      <div className="text-sm text-gray-600 dark:text-gray-400">{history.length} eventos registrados</div>
      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />
        <div className="space-y-5">
          {history.map((entry, idx) => (
            <div key={entry.id} className="relative pl-14">
              <div className={`absolute left-4 top-2 w-4 h-4 rounded-full border-4 border-white dark:border-gray-900 ${idx === 0 ? 'bg-blue-600' : 'bg-gray-400 dark:bg-gray-500'}`} />
              <div className={`p-4 border-2 rounded-xl ${idx === 0 ? 'bg-blue-50 border-blue-200' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{entry.action}</div>
                <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">{entry.details}</div>
                <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                  <span>👤 {entry.user}</span>
                  <span>📅 {entry.date}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderVenta = () => (
    <div className="space-y-5">
      <div className="p-5 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
        <h3 className="font-bold text-green-900 mb-2">Crear operación de venta</h3>
        <p className="text-sm text-green-700 mb-4">Inicia el proceso de venta creando una nueva operación</p>
        <button onClick={() => navigate(`/saas/vertical/compraventa/ventas?newSale=1&vehicleId=${encodeURIComponent(vehicle.id)}`)} className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-colors text-sm">➕ Crear venta</button>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-5">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Resumen para venta</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"><div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Vehículo</div><div className="font-bold text-gray-900 dark:text-gray-100">{vehicle.brand} {vehicle.model}</div><div className="text-xs text-gray-500 dark:text-gray-400">{vehicle.year} · {vehicle.mileage?.toLocaleString('es-ES')} km</div></div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"><div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Precio venta</div><div className="font-bold text-green-600 text-xl">{vehicle.salePrice?.toLocaleString('es-ES')}€</div></div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"><div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Margen esperado</div><div className={`font-bold text-xl ${marginColor}`}>{margin.toLocaleString('es-ES')}€</div></div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"><div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Días en stock</div><div className="font-bold text-amber-600 text-xl">{daysInStock}</div></div>
        </div>
      </div>
    </div>
  );

  const renderPreparacion = () => {
    const done = checklist.filter(i => i.done).length;
    const pct  = checklist.length > 0 ? Math.round((done / checklist.length) * 100) : 0;
    const totalRepairs = repairs.reduce((s, r) => s + r.amount, 0);
    return (
      <div className="space-y-5">
        {/* Hero status */}
        <div className={`p-5 rounded-2xl border-2 ${pct === 100 ? 'bg-green-50 border-green-200' : 'bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200'}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pct === 100 ? 'bg-green-500' : 'bg-purple-600'}`}>
              {pct === 100 ? <CheckCircle2 className="w-5 h-5 text-white" /> : <Zap className="w-5 h-5 text-white" />}
            </div>
            <div>
              <h3 className={`font-bold ${pct === 100 ? 'text-green-900' : 'text-purple-900'}`}>
                {pct === 100 ? '¡Preparación completa!' : 'Preparación en curso'}
              </h3>
              <p className={`text-xs ${pct === 100 ? 'text-green-700' : 'text-purple-700'}`}>
                {pct === 100 ? 'El vehículo está listo para publicar' : `${done} de ${checklist.length} tareas completadas`}
              </p>
            </div>
          </div>
          <div className="h-2 bg-white/60 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? 'bg-green-500' : 'bg-purple-600'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Resumen costes */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total preparación', value: `${totalRepairs.toLocaleString('es-ES')}€`, color: 'bg-blue-50 text-blue-900' },
            { label: 'Reparaciones',      value: repairs.length.toString(),                   color: 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100' },
            { label: 'Tareas hechas',     value: `${done}/${checklist.length}`,               color: pct === 100 ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900' },
          ].map(s => (
            <div key={s.label} className={`p-3 rounded-xl ${s.color}`}>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{s.label}</div>
              <div className="font-bold text-sm">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Interactive Checklist */}
        <ChecklistPanel
          items={checklist}
          onToggle={toggleChecklist}
          onDelete={deleteChecklist}
          onAdd={addChecklist}
          onRename={renameChecklist}
        />

        {/* Reparaciones summary */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
            <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" /> Reparaciones
            </p>
            <button type="button" onClick={openAddRepairModal}
              className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 px-2 py-1 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
              <Plus className="w-3 h-3" /> Añadir
            </button>
          </div>
          {repairs.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-gray-400 dark:text-gray-500">Sin reparaciones registradas</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {repairs.map(rep => {
                const rs = REPAIR_STATUS[rep.status];
                return (
                  <div key={rep.id} className="flex items-center gap-3 px-4 py-3 group hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <button
                      onClick={() => toggleRepairStatus(rep.id)}
                      title="Click para cambiar estado"
                      className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-all ${
                        rep.status === 'done' ? 'bg-green-500 border-green-500' : rep.status === 'in_progress' ? 'bg-blue-500 border-blue-500' : 'border-gray-300 hover:border-amber-400'
                      }`}
                    >
                      {rep.status === 'done' && <Check className="w-3 h-3 text-white" />}
                      {rep.status === 'in_progress' && <div className="w-2 h-2 rounded-full bg-white dark:bg-gray-800" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${rep.status === 'done' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>{rep.concept}</p>
                      {rep.workshop && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{rep.workshop}</p>}
                    </div>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{rep.amount.toLocaleString('es-ES')}€</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${rs.badge}`}>{rs.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDesguace = () => (
    <div className="space-y-5">
      <div className="p-5 bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 rounded-xl">
        <div className="flex items-start gap-3">
          <Trash2 className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-bold text-red-900 mb-2">Desguace de vehículo</h3>
            <p className="text-sm text-red-700 mb-4">Registra el desguace indicando motivo, fecha y costes/ingresos asociados</p>
            <button onClick={() => setShowScrapModal(true)} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors text-sm">Iniciar proceso de desguace</button>
          </div>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-5">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Información importante</h3>
        <div className="space-y-3">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg"><div className="font-semibold text-amber-900 mb-1 text-sm">⚠️ Acción irreversible</div><div className="text-sm text-amber-700">El proceso de desguace cambiará el estado del vehículo y no se podrá revertir</div></div>
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg"><div className="font-semibold text-blue-900 mb-1 text-sm">📋 Documentación</div><div className="text-sm text-blue-700">Asegúrate de tener la documentación de baja y certificado de destrucción</div></div>
        </div>
      </div>
    </div>
  );

  // ─── Layout ───────────────────────────────────────────────────────────────

  return (
    <Layout
      title={`${vehicle.brand} ${vehicle.model}`}
      subtitle={vehicle.version ? `${vehicle.registrationPlate} · ${vehicle.version}` : vehicle.registrationPlate}
    >
      <div className="space-y-3">
        {/* Back */}
        <button onClick={() => navigate('/saas/vehicles')} className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" />
          Volver a vehículos
        </button>

        {/* Reservation banner */}
        {vehicle.status === 'reservado' && (
          <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
            <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Este vehículo está reservado</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">Gestiona la reserva desde el módulo de Reservas para liberar o convertir en venta.</p>
            </div>
            <button onClick={() => navigate('/saas/reservations')}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-900/60 rounded-lg transition-colors">
              Ver reservas
            </button>
          </div>
        )}

        {/* Header card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <div className="px-3 py-1.5 bg-blue-600 text-white font-mono font-bold text-sm rounded-lg">{vehicle.registrationPlate}</div>
            {/* Inline status picker */}
            <div className="relative">
              <button
                onClick={() => setStatusPickerOpen(p => !p)}
                className={`flex items-center gap-1.5 px-3 py-1 text-sm font-semibold rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${
                  STATUS_OPTIONS_INLINE.find(o => o.value === vehicle.status)?.badge ?? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${STATUS_OPTIONS_INLINE.find(o => o.value === vehicle.status)?.dot ?? 'bg-gray-400'}`} />
                {STATUS_OPTIONS_INLINE.find(o => o.value === vehicle.status)?.label ?? vehicle.status}
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>
              {statusPickerOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setStatusPickerOpen(false)} />
                  <div className="absolute top-full left-0 mt-1 z-40 bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden min-w-[160px]">
                    <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                      <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Cambiar estado</p>
                    </div>
                    {STATUS_OPTIONS_INLINE.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { updateVehicle(vehicle.id, { status: opt.value as Vehicle['status'] }); setStatusPickerOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${vehicle.status === opt.value ? 'bg-gray-50 dark:bg-gray-800' : ''}`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${opt.dot}`} />
                        <span className="flex-1 text-left text-gray-700 dark:text-gray-300">{opt.label}</span>
                        {vehicle.status === opt.value && <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="mb-2">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">{vehicle.brand} {vehicle.model}</h1>
            {vehicle.version && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">{vehicle.version}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-gray-500 dark:text-gray-400">
            <span>{vehicle.year}</span><span>·</span>
            <span>{vehicle.mileage?.toLocaleString('es-ES')} km</span>
            {vehicle.color && <><span>·</span><span>{vehicle.color}</span></>}
            {vehicle.fuelType && <><span>·</span><span className="capitalize">{vehicle.fuelType}</span></>}
          </div>
        </div>

        {/* ── Action bar ── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center gap-2">
            {/* Stock status */}
            {vehicle.status !== 'listo' && vehicle.status !== 'vendido' && vehicle.status !== 'scrapped' && (
              <button
                onClick={() => updateVehicle(vehicle.id, { status: 'listo' })}
                className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-all active:scale-95 shadow-sm"
              >
                <PackagePlus className="w-4 h-4" />
                <span className="whitespace-nowrap">Añadir al stock</span>
              </button>
            )}
            {vehicle.status === 'listo' && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-green-100 text-green-700 text-sm font-semibold rounded-xl border-2 border-green-200">
                <CheckCircle2 className="w-4 h-4" />
                <span className="whitespace-nowrap hidden xs:inline">{VEHICLE_STATUS_TOKEN.listo.label}</span>
              </div>
            )}
            <div className="flex-1" />

            {/* V-10: Etiqueta imprimible */}
            <button
              onClick={() => generateVehicleLabel(vehicle)}
              title="Imprimir etiqueta (A5)"
              className="w-9 h-9 flex items-center justify-center border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 text-gray-600 dark:text-gray-400 rounded-xl transition-all hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Tag className="w-4 h-4" />
            </button>
            {/* V-10: Ficha PDF */}
            <button
              onClick={() => generateVehiclePdf(vehicle, repairs.reduce((s, r) => s + r.amount, 0))}
              title="Descargar ficha PDF"
              className="w-9 h-9 flex items-center justify-center border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 text-gray-600 dark:text-gray-400 rounded-xl transition-all hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <FileDown className="w-4 h-4" />
            </button>
            {/* QR */}
            <button
              onClick={() => setShowQRModal(true)}
              title="Código QR"
              className="w-9 h-9 flex items-center justify-center border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 text-gray-600 dark:text-gray-400 rounded-xl transition-all hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <QrCode className="w-4 h-4" />
            </button>
            {/* Edit button */}
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 text-gray-600 dark:text-gray-400 text-sm font-semibold rounded-xl transition-all"
            >
              <Pencil className="w-4 h-4" />
              <span className="hidden sm:inline">Editar</span>
            </button>
            {/* Mover button */}
            <button
              onClick={() => setShowMoveModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-semibold rounded-xl transition-all"
            >
              <Move className="w-4 h-4" />
              <span className="hidden sm:inline">Mover</span>
            </button>
          </div>
        </div>

        {/* ── Unified 5-tab navigation ── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex">
            {MAIN_TAB_DEFS.map((tab, idx) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 px-1 text-xs font-semibold transition-all border-b-2 ${
                    isActive
                      ? 'border-amber-500 text-amber-700 bg-amber-50'
                      : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                  } ${idx > 0 ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}
                >
                  <Icon className="w-4 h-4" />
                  {t(tab.i18nKey)}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Content ── */}
        {activeTab === 'ficha'    && renderFicha()}
        {activeTab === 'fotos'    && renderFotos()}
        {activeTab === 'taller'   && renderReparaciones()}
        {activeTab === 'finanzas' && renderFinanzas()}
        {activeTab === 'docs'     && (
          <div className="space-y-4">
            <VehicleDocDossier
              vehicleId={vehicle.id}
              vehicleName={`${vehicle.brand || ''} ${vehicle.model || ''}`.trim()}
              registrationPlate={vehicle.registrationPlate}
              vehicleImageUrl={vehicle.images?.[0]?.url || vehicle.imageUrl}
              onOcr={() => setShowOcr(true)}
              onUpload={() => navigate(`/saas/documents?tab=vehiculo&vehicleId=${encodeURIComponent(vehicle.id)}`)}
              documents={(documents || [])
                .filter((d) => d.vehicleId === vehicle.id || d.relatedToId === vehicle.id)
                .map((d) => ({
                  id: d.id || d._id || '',
                  name: d.name || 'Documento',
                  docSubCategory: d.docSubCategory || 'otro',
                  status: d.status || 'draft',
                  createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt || ''),
                  registrationPlate: d.registrationPlate || vehicle.registrationPlate,
                  itvExpiryDate: d.itvExpiryDate,
                  ocrConfidence: d.ocrConfidence || 0,
                }))}
            />
          </div>
        )}
        {activeTab === 'publicar' && <PortalPublishSection vehicle={vehicle} />}
        {activeTab === 'mas'      && renderMas()}
      </div>

      {/* Modals */}
      <SAAS__OcrScanModal
        isOpen={showOcr}
        onClose={() => setShowOcr(false)}
        userId={user?.user_id || user?.id}
        targetModule="documentacion"
        defaultOcrMode="vehicle"
        lockOcrMode
        autoOpenCamera={false}
        context={{ vehicleId: vehicle.id }}
        vehicles={[
          {
            id: vehicle.id,
            brand: vehicle.brand,
            model: vehicle.model,
            registrationPlate: vehicle.registrationPlate,
            vin: vehicle.vin,
          },
        ]}
        onDocumentCreated={async (payload) => {
          const userId = user?.user_id || user?.id || '';
          if (!userId) throw new Error('Sesión no válida');
          const fileName = payload.file
            ? String((payload.file as File).name || 'scan').replace(/[^a-zA-Z0-9._-]/g, '-')
            : 'scan';
          const ocrData = (payload.ocrData || null) as OcrData | null;
          const fields = buildOcrDocumentFields({
            name: String(payload.name || ocrData?.documentTypeLabel || fileName),
            ocrData,
            vehicleId: vehicle.id,
            vehicles: [
              {
                id: vehicle.id,
                brand: vehicle.brand,
                model: vehicle.model,
                registrationPlate: vehicle.registrationPlate,
                vin: vehicle.vin,
              },
            ],
            mimeType: (payload.fileMimeType as string) || undefined,
            fileName,
          });

          let record;
          if (payload.documentId) {
            record = await updateDocumentViaApi(userId, String(payload.documentId), {
              ...fields,
              vehicleId: vehicle.id,
              name: fields.name,
            });
          } else {
            record = await createDocumentViaApi(userId, {
              ...fields,
              vehicleId: vehicle.id,
              user_id: userId,
            });
          }

          if (payload.fileBase64 && record._id && record._rev) {
            try {
              const buf = Uint8Array.from(atob(String(payload.fileBase64)), (c) => c.charCodeAt(0));
              await authFetch(
                `${getApiBase()}/api/couch/attachment/${encodeURIComponent(DOCUMENTS_DB_NAME)}/${encodeURIComponent(record._id)}/${encodeURIComponent(fileName)}?rev=${encodeURIComponent(record._rev)}`,
                {
                  method: 'PUT',
                  headers: {
                    'Content-Type': (payload.fileMimeType as string) || 'application/octet-stream',
                    ...getAuthHeaders(),
                  },
                  body: buf,
                },
              );
            } catch (e) {
              console.error('Error uploading OCR attachment:', e);
            }
          }

          await refreshDocuments();
          setShowOcr(false);
          toast.success('Documento guardado en el expediente del vehículo');
        }}
      />
      <SAAS__MoveVehicleModal
        isOpen={showMoveModal}
        onClose={() => setShowMoveModal(false)}
        onConfirm={(newLocation) => { updateVehicle(vehicle.id, { location: newLocation }); setShowMoveModal(false); }}
        currentLocation={vehicle.location || ''}
        vehicleName={`${vehicle.brand} ${vehicle.model}`}
      />
      <SAAS__ScrapVehicleModal
        isOpen={showScrapModal}
        onClose={() => setShowScrapModal(false)}
        onConfirm={(_data) => { updateVehicle(vehicle.id, { status: 'scrapped' as Vehicle['status'] }); setShowScrapModal(false); }}
        vehicleName={`${vehicle.brand} ${vehicle.model}`}
        registrationPlate={vehicle.registrationPlate}
      />
      <ChangeStatusModal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        currentStatus={vehicle.status}
        onConfirm={(newStatus) => updateVehicle(vehicle.id, { status: newStatus as Vehicle['status'] })}
      />
      <AddExpenseModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        vehicleName={`${vehicle.brand} ${vehicle.model}`}
      />
      <AddRepairModal
        isOpen={showAddRepairModal}
        onClose={() => { setShowAddRepairModal(false); setEditingRepair(null); }}
        onSave={addRepair}
        initialRepair={editingRepair}
      />
      {showEditModal && (
        <EditVehicleModal
          vehicle={vehicle}
          onClose={() => setShowEditModal(false)}
          onSave={async (updates) => { await updateVehicle(vehicle.id, updates); }}
        />
      )}
      <SAAS__PriceCalculatorModal
        isOpen={showPriceCalculator}
        vehicle={vehicle}
        workshopCosts={totalCosts}
        onClose={() => setShowPriceCalculator(false)}
        onApplyPrice={(price) => { updateVehicle(vehicle.id, { salePrice: price }); }}
      />
      <QRModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        vehicleId={vehicle.id}
        vehicleName={`${vehicle.brand} ${vehicle.model} ${vehicle.registrationPlate}`}
      />

      {/* V-07: Add Warranty Modal */}
      {showAddWarrantyModal && (
        <AddWarrantyModal
          onClose={() => setShowAddWarrantyModal(false)}
          onSave={(w) => { handleAddWarranty(w); setShowAddWarrantyModal(false); }}
          loading={warrantyLoading}
        />
      )}

      {/* V-07: Add Claim Modal */}
      {showAddClaimModal && (
        <AddClaimModal
          onClose={() => setShowAddClaimModal(null)}
          onSave={(desc) => { handleAddClaim(showAddClaimModal, desc); setShowAddClaimModal(null); }}
        />
      )}

      {/* V-08: Add Cost Modal */}
      {showAddCostModal && (
        <AddAssociatedCostModal
          onClose={() => setShowAddCostModal(false)}
          onSave={(c) => { handleAddCost(c); setShowAddCostModal(false); }}
          loading={costLoading}
        />
      )}

      {/* V-02: Full price history modal */}
      {showPriceHistoryModal && (
        <PriceHistoryModal
          entries={vehicle.priceHistory || []}
          onClose={() => setShowPriceHistoryModal(false)}
        />
      )}

      {/* U-04: Confirm vehicle deletion */}
      <ConfirmDestroyModal
        isOpen={showDeleteVehicleModal}
        onClose={() => setShowDeleteVehicleModal(false)}
        onConfirm={async () => {
          setIsDeletingVehicle(true);
          try {
            await deleteVehicle(vehicle.id);
            navigate('/saas/vehicles');
          } finally {
            setIsDeletingVehicle(false);
            setShowDeleteVehicleModal(false);
          }
        }}
        title="Eliminar vehículo"
        description={`Eliminarás permanentemente este vehículo y todos sus datos asociados (fotos, costes, garantías, historial). Esta acción no se puede deshacer.`}
        itemName={`${vehicle.brand} ${vehicle.model} · ${vehicle.registrationPlate}`}
        destructiveLabel="Eliminar vehículo"
        isDeleting={isDeletingVehicle}
      />
    </Layout>
  );
}

// ─── V-07: Add Warranty Modal ─────────────────────────────────────────────────

function AddWarrantyModal({ onClose, onSave, loading }: {
  onClose: () => void;
  onSave: (w: Partial<Warranty>) => void;
  loading?: boolean;
}) {
  const [form, setForm] = useState({ type: 'own' as 'own' | 'factory', provider: '', startDate: '', endDate: '', coverage: '' });
  const fv = (f: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [f]: e.target.value }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">Nueva garantía</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Tipo</label>
            <select value={form.type} onChange={fv('type')} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-800">
              <option value="own">Garantía propia</option>
              <option value="factory">Garantía de fábrica</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Proveedor / Nombre</label>
            <input value={form.provider} onChange={fv('provider')} placeholder="Ej: Volkswagen, Garantía oficial 2 años..." className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Fecha inicio</label>
              <input type="date" value={form.startDate} onChange={fv('startDate')} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Fecha fin</label>
              <input type="date" value={form.endDate} onChange={fv('endDate')} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Cobertura</label>
            <textarea value={form.coverage} onChange={fv('coverage')} rows={3} placeholder="Describe qué cubre la garantía..." className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none resize-none" />
          </div>
        </div>
        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-5 py-4 flex gap-3 rounded-b-2xl">
          <button onClick={onClose} className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">Cancelar</button>
          <button onClick={() => onSave(form)} disabled={!form.provider.trim() || loading} className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
            {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}Guardar garantía
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── V-07: Add Claim Modal ────────────────────────────────────────────────────

function AddClaimModal({ onClose, onSave }: { onClose: () => void; onSave: (desc: string) => void }) {
  const [desc, setDesc] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xs mx-4" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">Nueva reclamación</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Descripción</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} autoFocus placeholder="Describe el problema o reclamación..." className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none resize-none" />
        </div>
        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-5 py-4 flex gap-3 rounded-b-2xl">
          <button onClick={onClose} className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300">Cancelar</button>
          <button onClick={() => onSave(desc)} disabled={!desc.trim()} className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40">Añadir</button>
        </div>
      </div>
    </div>
  );
}

// ─── V-08: Add Associated Cost Modal ─────────────────────────────────────────

const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  preparacion: 'Preparación',
  itv: 'ITV',
  limpieza: 'Limpieza',
  fotos: 'Fotos / Marketing',
  publicidad: 'Publicidad',
  otro: 'Otro',
};

function AddAssociatedCostModal({ onClose, onSave, loading }: {
  onClose: () => void;
  onSave: (c: Partial<AssociatedCost>) => void;
  loading?: boolean;
}) {
  const [form, setForm] = useState({ category: 'otro' as CostCategory, description: '', amount: '', date: new Date().toISOString().slice(0, 10) });
  const fv = (f: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [f]: e.target.value }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">Añadir coste asociado</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Categoría</label>
            <select value={form.category} onChange={fv('category')} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-800">
              {(Object.entries(COST_CATEGORY_LABELS) as [CostCategory, string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Descripción</label>
            <input value={form.description} onChange={fv('description')} placeholder="Ej: ITV pasada, fotos 360°..." className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Importe (€) *</label>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={fv('amount')} placeholder="0" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Fecha</label>
              <input type="date" value={form.date} onChange={fv('date')} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-5 py-4 flex gap-3 rounded-b-2xl">
          <button onClick={onClose} className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300">Cancelar</button>
          <button
            onClick={() => {
              const parsedAmount = parseLocaleNumber(form.amount);
              onSave({ ...form, amount: Number.isFinite(parsedAmount) ? parsedAmount : 0 });
            }}
            disabled={!form.amount || loading}
            className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}Guardar coste
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── V-08: Stock Alert Panel ─────────────────────────────────────────────────

interface StockAlertRule {
  id: string;
  days: number;
  priceDrop: number; // percentage, 0 = only notification
}

const DEFAULT_RULES: StockAlertRule[] = [
  { id: 'r1', days: 30, priceDrop: 0 },
  { id: 'r2', days: 60, priceDrop: 3 },
  { id: 'r3', days: 90, priceDrop: 5 },
];

const MAX_DAYS_SCALE = 120;

function getAlertSummary(activeRule: StockAlertRule | undefined, daysInStock: number, daysToNext: number | null): string {
  if (activeRule) {
    const action = activeRule.priceDrop > 0
      ? `Considera bajar el precio un ${activeRule.priceDrop}% para acelerar la venta.`
      : 'Recibirás una notificación. Revisa si conviene ajustar el precio.';
    return `Este vehículo lleva ${daysInStock} días en stock (más de ${activeRule.days} días). ${action}`;
  }
  if (daysToNext != null) {
    return `Todo bien por ahora. Si no se vende en ${daysToNext} días más, saltará la próxima alerta.`;
  }
  return 'Configura umbrales arrastrando los marcadores en la barra para saber cuándo actuar.';
}

function StockAlertPanel({ vehicleId, daysInStock, salePrice }: {
  vehicleId: string;
  daysInStock: number;
  salePrice?: number;
}) {
  const storageKey = `stock_alerts_${vehicleId}`;
  const barRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<StockAlertRule[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : DEFAULT_RULES;
    } catch { return DEFAULT_RULES; }
  });
  const [editRule, setEditRule] = useState<StockAlertRule | null>(null);
  const [saved, setSaved] = useState(false);
  const [draggingRuleId, setDraggingRuleId] = useState<string | null>(null);

  const saveRules = (next: StockAlertRule[]) => {
    localStorage.setItem(storageKey, JSON.stringify(next));
    setRules(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const activeRule = [...rules].sort((a, b) => b.days - a.days).find(r => daysInStock >= r.days);
  const nextRule   = [...rules].sort((a, b) => a.days - b.days).find(r => daysInStock < r.days);
  const daysToNext = nextRule ? nextRule.days - daysInStock : null;

  const deleteRule = (id: string) => saveRules(rules.filter(r => r.id !== id));
  const addRule = () => {
    const newRule: StockAlertRule = { id: `r_${Date.now()}`, days: 45, priceDrop: 0 };
    setEditRule(newRule);
  };
  const saveEdit = (r: StockAlertRule) => {
    const exists = rules.find(x => x.id === r.id);
    const next = exists ? rules.map(x => x.id === r.id ? r : x) : [...rules, r];
    saveRules(next.sort((a, b) => a.days - b.days));
    setEditRule(null);
  };

  const pctToDays = (pct: number) => Math.round((pct / 100) * MAX_DAYS_SCALE);
  const daysToPct = (days: number) => (days / MAX_DAYS_SCALE) * 100;

  const handleBarMouseUp = useCallback(() => {
    if (draggingRuleId) {
      setRules(prev => {
        const sorted = [...prev].sort((a, b) => a.days - b.days);
        localStorage.setItem(storageKey, JSON.stringify(sorted));
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
        return sorted;
      });
      setDraggingRuleId(null);
    }
  }, [draggingRuleId, storageKey]);

  useEffect(() => {
    if (!draggingRuleId) return;
    const onUp = () => setDraggingRuleId(null);
    const onMove = (e: MouseEvent) => {
      if (!barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const newDays = pctToDays(pct);
      if (newDays < 1) return;
      setRules(prev => {
        const next = prev.map(r => r.id === draggingRuleId ? { ...r, days: newDays } : r);
        return next.sort((a, b) => a.days - b.days);
      });
    };
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
    };
  }, [draggingRuleId]);

  const alertSummary = getAlertSummary(activeRule, daysInStock, daysToNext);

  return (
    <>
      <div className={`bg-white dark:bg-gray-800 rounded-2xl border-2 overflow-hidden ${activeRule ? (daysInStock >= 90 ? 'border-red-200' : 'border-amber-200') : 'border-gray-200 dark:border-gray-700'}`}>
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${activeRule ? (daysInStock >= 90 ? 'bg-red-100' : 'bg-amber-100') : 'bg-gray-100 dark:bg-gray-700'}`}>
              <Bell className={`w-4 h-4 ${activeRule ? (daysInStock >= 90 ? 'text-red-600' : 'text-amber-600') : 'text-gray-500 dark:text-gray-400'}`} />
            </div>
            <div className="text-left">
              <div className="text-sm font-bold text-gray-900 dark:text-gray-100">Alertas de tiempo en stock</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 max-w-[220px]">
                {alertSummary}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeRule && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${daysInStock >= 90 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                ⚠ Activa
              </span>
            )}
            {saved && <Check className="w-3.5 h-3.5 text-emerald-500" />}
            <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {open && (
          <div className="border-t border-gray-100 dark:border-gray-800 p-4 space-y-3">
            {/* Barra con marcadores arrastrables */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Días en stock · Arrastra los círculos para cambiar los umbrales
              </p>
              <div
                ref={barRef}
                className="relative h-8 select-none"
                onMouseUp={handleBarMouseUp}
                onMouseLeave={handleBarMouseUp}
              >
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-visible">
                  <div
                    className={`absolute left-0 top-0 h-full rounded-full transition-all ${daysInStock >= 90 ? 'bg-red-500' : daysInStock >= 60 ? 'bg-amber-500' : daysInStock >= 30 ? 'bg-yellow-400' : 'bg-emerald-400'}`}
                    style={{ width: `${Math.min(100, daysToPct(daysInStock))}%` }}
                  />
                </div>
                {/* Marcador posición actual */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white shadow-md bg-gray-800 z-10 pointer-events-none"
                  style={{ left: `${Math.min(100, daysToPct(daysInStock))}%` }}
                  title={`${daysInStock} días en stock`}
                />
                {/* Marcadores arrastrables por regla */}
                {rules.slice().sort((a, b) => a.days - b.days).map(r => (
                  <div
                    key={r.id}
                    onMouseDown={(e) => { e.preventDefault(); setDraggingRuleId(r.id); }}
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full border-2 cursor-grab active:cursor-grabbing flex items-center justify-center z-20 transition-transform hover:scale-110 ${
                      draggingRuleId === r.id ? 'scale-110 ring-2 ring-blue-400' : ''
                    } ${daysInStock >= r.days ? 'bg-amber-500 border-white shadow' : 'bg-gray-300 border-gray-400 hover:bg-gray-400'}`}
                    style={{ left: `${daysToPct(r.days)}%` }}
                    title={`Umbral: ${r.days} días. Arrastra para cambiar.`}
                  >
                    <span className="text-[9px] font-bold text-white drop-shadow">{r.days}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
                <span>0</span>
                <span className="font-semibold text-gray-700 dark:text-gray-300">{daysInStock} días (posición actual)</span>
                <span>{MAX_DAYS_SCALE}d</span>
              </div>
            </div>

            {/* Rules list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Reglas configuradas</span>
                <button onClick={addRule} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                  <Plus className="w-3.5 h-3.5" />Añadir regla
                </button>
              </div>
              {rules.sort((a, b) => a.days - b.days).map(rule => {
                const isActive = daysInStock >= rule.days;
                return (
                  <div key={rule.id} className={`flex items-center gap-3 p-3 rounded-xl border ${isActive ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-800'}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-amber-400' : 'bg-gray-200'}`}>
                      <Clock className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">A los {rule.days} días</span>
                        {rule.priceDrop > 0 ? (
                          <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <TrendingDown className="w-2.5 h-2.5" />Bajar {rule.priceDrop}%
                            {salePrice && ` (${Math.round(salePrice * rule.priceDrop / 100).toLocaleString('es-ES')}€)`}
                          </span>
                        ) : (
                          <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <Bell className="w-2.5 h-2.5" />Solo notificación
                          </span>
                        )}
                        {isActive && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">✓ Activa</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditRule(rule)} className="w-6 h-6 flex items-center justify-center hover:bg-gray-200 rounded-md transition-colors">
                        <Pencil className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                      </button>
                      <button onClick={() => deleteRule(rule.id)} className="w-6 h-6 flex items-center justify-center hover:bg-red-100 rounded-md transition-colors">
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Edit rule modal */}
      {editRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEditRule(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xs mx-4" onClick={e => e.stopPropagation()}>
            <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-2"><Settings2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />Configurar regla de alerta</h3>
              <button onClick={() => setEditRule(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Días en stock</label>
                <input
                  type="number" min="1" max="365"
                  value={editRule.days}
                  onChange={e => setEditRule(r => r ? { ...r, days: parseInt(e.target.value) || 1 } : r)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Reducción de precio (%)</label>
                <input
                  type="number" min="0" max="50" step="0.5"
                  value={editRule.priceDrop}
                  onChange={e => {
                    const parsedPriceDrop = parseLocaleNumber(e.target.value);
                    setEditRule(r => r ? { ...r, priceDrop: Number.isFinite(parsedPriceDrop) ? parsedPriceDrop : 0 } : r);
                  }}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="0 = solo notificación"
                />
                {editRule.priceDrop > 0 && salePrice && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Precio sugerido: <span className="font-semibold text-red-600">{Math.round(salePrice * (1 - editRule.priceDrop / 100)).toLocaleString('es-ES')}€</span>
                  </p>
                )}
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-5 py-4 flex gap-3 rounded-b-2xl">
              <button onClick={() => setEditRule(null)} className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300">Cancelar</button>
              <button
                onClick={() => saveEdit(editRule)}
                className="flex-1 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── V-06: Price History Modal con Gráfica ────────────────────────────────────

function PriceHistoryModal({ entries, onClose }: { entries: PriceHistoryEntry[]; onClose: () => void }) {
  const sorted = useMemo(() => [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [entries]);

  const chartData = useMemo(() => {
    const points: { label: string; precio: number; fecha: string }[] = [];
    sorted.forEach((e, i) => {
      const dateStr = new Date(e.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
      if (i === 0 && e.oldPrice != null) {
        points.push({ label: dateStr, precio: e.oldPrice, fecha: e.date });
      }
      if (e.newPrice != null) {
        points.push({ label: dateStr, precio: e.newPrice, fecha: e.date });
      }
    });
    return points;
  }, [sorted]);

  const minPrice = Math.min(...chartData.map(d => d.precio));
  const maxPrice = Math.max(...chartData.map(d => d.precio));
  const trend = chartData.length >= 2 ? chartData[chartData.length - 1].precio - chartData[0].precio : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />Historial de precios
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{entries.length} cambios</span>
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto flex-1">
          {entries.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400 dark:text-gray-500">Sin cambios de precio registrados</p>
            </div>
          ) : (
            <>
              {/* V-06: Chart */}
              {chartData.length >= 2 && (
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 relative">
                  <div className="absolute top-4 right-4 z-10"><PeriodBadge period="hist" variant="glass" className="text-[9px] tracking-[0.2em] opacity-75" /></div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Evolución del precio</span>
                    <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${trend < 0 ? 'bg-red-50 text-red-600' : trend > 0 ? 'bg-green-50 text-green-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                      {trend < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                      {trend > 0 ? '+' : ''}{trend.toLocaleString('es-ES')}€
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                        domain={[Math.floor(minPrice * 0.97), Math.ceil(maxPrice * 1.03)]}
                        width={36}
                      />
                      <Tooltip
                        formatter={(v: number) => [`${v.toLocaleString('es-ES')} €`, 'Precio']}
                        labelStyle={{ fontSize: 11, color: '#374151' }}
                        contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                      />
                      <ReferenceLine y={chartData[0]?.precio} stroke="#e5e7eb" strokeDasharray="4 2" />
                      <Line
                        type="monotone"
                        dataKey="precio"
                        stroke="#2563eb"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#2563eb', strokeWidth: 0 }}
                        activeDot={{ r: 6, fill: '#1d4ed8' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-1 px-1">
                    <span>Min: <span className="font-semibold text-red-500">{minPrice.toLocaleString('es-ES')}€</span></span>
                    <span>Max: <span className="font-semibold text-emerald-600">{maxPrice.toLocaleString('es-ES')}€</span></span>
                  </div>
                </div>
              )}

              {/* Timeline list */}
              <div className="p-4 space-y-2">
                {[...entries].reverse().map((entry, idx) => (
                  <div key={entry.id} className={`p-3.5 rounded-xl border ${idx === 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-800'}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-gray-400 dark:text-gray-500 text-sm line-through">{entry.oldPrice != null ? `${entry.oldPrice.toLocaleString('es-ES')}€` : '—'}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                      <span className={`font-bold ${entry.newPrice != null && entry.oldPrice != null ? (entry.newPrice < entry.oldPrice ? 'text-red-600' : entry.newPrice > entry.oldPrice ? 'text-green-600' : 'text-gray-900 dark:text-gray-100') : 'text-gray-900 dark:text-gray-100'}`}>
                        {entry.newPrice != null ? `${entry.newPrice.toLocaleString('es-ES')}€` : '—'}
                      </span>
                      {entry.newPrice != null && entry.oldPrice != null && entry.newPrice !== entry.oldPrice && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-1 ${entry.newPrice < entry.oldPrice ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                          {entry.newPrice > entry.oldPrice ? '+' : ''}{(entry.newPrice - entry.oldPrice).toLocaleString('es-ES')}€
                        </span>
                      )}
                      {idx === 0 && <span className="ml-auto text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Actual</span>}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 italic mb-1.5">"{entry.reason}"</p>
                    <div className="flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-500">
                      <span className="flex items-center gap-1"><User className="w-2.5 h-2.5" />{entry.userName}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-2.5 h-2.5" />{new Date(entry.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-4 flex-shrink-0">
          <button onClick={onClose} className="w-full py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
