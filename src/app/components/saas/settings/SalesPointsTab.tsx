import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { useModalClose } from '../../../hooks/useModalClose';
import {
  listWorkCenters,
  createWorkCenter,
  updateWorkCenter,
  deleteWorkCenter,
  WORK_CENTER_TYPE_LABELS,
  WORK_CENTER_TYPE_SHORT,
  OWNERSHIP_LABELS,
  type WorkCenter,
  type WorkCenterType,
  type OwnershipType,
  type ContractInfo,
} from '../../../lib/workCentersApi';
import { AddButtonDropdown } from '../AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../GenericImportModal';
import {
  Search,
  X,
  Trash2,
  Edit3,
  MapPin,
  ToggleLeft,
  ToggleRight,
  Phone,
  Mail,
  Store,
  Building2,
  Warehouse,
  Home,
  Tag,
  FileText,
  Euro,
  Users,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';

const CENTER_TYPE_ICONS: Record<WorkCenterType, React.ReactNode> = {
  oficina: <Building2 className="w-4 h-4" />,
  punto_de_venta: <Store className="w-4 h-4" />,
  almacen: <Warehouse className="w-4 h-4" />,
  custom: <Tag className="w-4 h-4" />,
};

const CENTER_TYPE_COLORS: Record<WorkCenterType, string> = {
  oficina: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
  punto_de_venta: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400',
  almacen: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
  custom: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
};

// ── Modal crear/editar centro de trabajo ──────────────────────────────────────

interface WorkCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<WorkCenter>) => Promise<void>;
  editItem?: WorkCenter | null;
}

function WorkCenterModal({ isOpen, onClose, onSave, editItem }: WorkCenterModalProps) {
  const navigate = useNavigate();
  useModalClose(isOpen, onClose);
  const [form, setForm] = useState({
    name: '',
    centerType: 'punto_de_venta' as WorkCenterType,
    customTypeName: '',
    ownership: 'propiedad' as OwnershipType,
    address: '',
    city: '',
    postalCode: '',
    province: '',
    phone: '',
    email: '',
    expectedStaffCount: '3',
    squareMeters: '',
    notes: '',
    active: true,
    purchasePrice: '',
    purchaseDate: '',
    cadastralReference: '',
    contractStartDate: '',
    contractEndDate: '',
    monthlyPrice: '',
    deposit: '',
    landlord: '',
    landlordPhone: '',
    landlordEmail: '',
    contractNotes: '',
  });
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'general' | 'ubicacion' | 'propiedad'>('general');

  useEffect(() => {
    if (editItem) {
      setForm({
        name: editItem.name,
        centerType: editItem.centerType || 'punto_de_venta',
        customTypeName: editItem.customTypeName || '',
        ownership: editItem.ownership || 'propiedad',
        address: editItem.address || '',
        city: editItem.city || '',
        postalCode: editItem.postalCode || '',
        province: editItem.province || '',
        phone: editItem.phone || '',
        email: editItem.email || '',
        expectedStaffCount: String(editItem.expectedStaffCount ?? 3),
        squareMeters: editItem.squareMeters ? String(editItem.squareMeters) : '',
        notes: editItem.notes || '',
        active: editItem.active,
        purchasePrice: editItem.purchasePrice ? String(editItem.purchasePrice) : '',
        purchaseDate: editItem.purchaseDate || '',
        cadastralReference: editItem.cadastralReference || '',
        contractStartDate: editItem.contract?.startDate || '',
        contractEndDate: editItem.contract?.endDate || '',
        monthlyPrice: editItem.contract?.monthlyPrice ? String(editItem.contract.monthlyPrice) : '',
        deposit: editItem.contract?.deposit ? String(editItem.contract.deposit) : '',
        landlord: editItem.contract?.landlord || '',
        landlordPhone: editItem.contract?.landlordPhone || '',
        landlordEmail: editItem.contract?.landlordEmail || '',
        contractNotes: editItem.contract?.contractNotes || '',
      });
    } else {
      setForm({
        name: '', centerType: 'punto_de_venta', customTypeName: '', ownership: 'propiedad',
        address: '', city: '', postalCode: '', province: '', phone: '', email: '', expectedStaffCount: '3', squareMeters: '',
        notes: '', active: true, purchasePrice: '', purchaseDate: '', cadastralReference: '',
        contractStartDate: '', contractEndDate: '', monthlyPrice: '', deposit: '',
        landlord: '', landlordPhone: '', landlordEmail: '', contractNotes: '',
      });
    }
    setStep('general');
  }, [editItem, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (form.centerType === 'custom' && !form.customTypeName.trim()) {
      toast.error('Especifica el tipo personalizado');
      return;
    }
    const staffCount = Number(form.expectedStaffCount || 0);
    if (!Number.isFinite(staffCount) || staffCount < 1 || staffCount > 999) {
      toast.error('Indica cuántos trabajadores tiene este centro (1-999)');
      return;
    }
    setSaving(true);
    try {
      const contract: ContractInfo | undefined = form.ownership === 'alquiler' ? {
        startDate: form.contractStartDate || undefined,
        endDate: form.contractEndDate || undefined,
        monthlyPrice: form.monthlyPrice ? Number(form.monthlyPrice) : undefined,
        deposit: form.deposit ? Number(form.deposit) : undefined,
        landlord: form.landlord.trim() || undefined,
        landlordPhone: form.landlordPhone.trim() || undefined,
        landlordEmail: form.landlordEmail.trim() || undefined,
        contractNotes: form.contractNotes.trim() || undefined,
      } : undefined;

      await onSave({
        ...editItem,
        name: form.name.trim(),
        centerType: form.centerType,
        customTypeName: form.centerType === 'custom' ? form.customTypeName.trim() : undefined,
        ownership: form.ownership,
        contract,
        purchasePrice: form.ownership === 'propiedad' && form.purchasePrice ? Number(form.purchasePrice) : undefined,
        purchaseDate: form.ownership === 'propiedad' ? form.purchaseDate || undefined : undefined,
        cadastralReference: form.cadastralReference.trim() || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        postalCode: form.postalCode.trim() || undefined,
        province: form.province.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        expectedStaffCount: Math.max(1, Math.floor(staffCount)),
        squareMeters: form.squareMeters ? Number(form.squareMeters) : undefined,
        notes: form.notes.trim() || undefined,
        active: form.active,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';
  const steps = ['general', 'ubicacion', 'propiedad'] as const;
  const stepLabels = { general: 'Datos generales', ubicacion: 'Ubicación', propiedad: form.ownership === 'alquiler' ? 'Contrato alquiler' : 'Datos propiedad' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {editItem ? 'Editar centro de trabajo' : 'Nuevo centro de trabajo'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Configura los datos del centro de trabajo
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
          {steps.map((s) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                step === s
                  ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {stepLabels[s]}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-4">
          {step === 'general' && (
            <>
              <div>
                <label className={labelClass}>Tipo de centro *</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { type: 'oficina' as WorkCenterType, desc: 'Oficinas, despachos' },
                    { type: 'punto_de_venta' as WorkCenterType, desc: 'Tiendas, locales' },
                    { type: 'almacen' as WorkCenterType, desc: 'Naves, depósitos' },
                    { type: 'custom' as WorkCenterType, desc: 'Garajes, trasteros…' },
                  ]).map(({ type: ct, desc }) => (
                    <button
                      key={ct}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, centerType: ct }))}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all text-sm ${
                        form.centerType === ct
                          ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-700'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${CENTER_TYPE_COLORS[ct]}`}>
                        {CENTER_TYPE_ICONS[ct]}
                      </span>
                      <div className="min-w-0">
                        <span className="font-medium text-gray-900 dark:text-gray-100 block">{WORK_CENTER_TYPE_SHORT[ct]}</span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">{desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {form.centerType === 'custom' && (
                <div>
                  <label className={labelClass}>Nombre del tipo personalizado *</label>
                  <input
                    className={inputClass}
                    placeholder="Ej: Garaje, Trastero, Nave industrial, Parking..."
                    value={form.customTypeName}
                    onChange={(e) => setForm(f => ({ ...f, customTypeName: e.target.value }))}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Define el tipo de espacio a tu medida</p>
                </div>
              )}

              <div>
                <label className={labelClass}>Nombre *</label>
                <input
                  className={inputClass}
                  placeholder="Ej: Oficina Central, Tienda Gran Vía..."
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label className={labelClass}>Trabajadores previstos *</label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  className={inputClass}
                  placeholder="Ej: 8"
                  value={form.expectedStaffCount}
                  onChange={(e) => setForm(f => ({ ...f, expectedStaffCount: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelClass}>Régimen</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['propiedad', 'alquiler'] as OwnershipType[]).map((ow) => (
                    <button
                      key={ow}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, ownership: ow }))}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all text-sm ${
                        form.ownership === ow
                          ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-700'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${ow === 'propiedad' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600' : 'bg-orange-100 dark:bg-orange-900/40 text-orange-600'}`}>
                        {ow === 'propiedad' ? <Home className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                      </span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{OWNERSHIP_LABELS[ow]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelClass}>Notas internas</label>
                <textarea
                  rows={2}
                  className={`${inputClass} resize-none`}
                  placeholder="Notas adicionales..."
                  value={form.notes}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                  form.active
                    ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                      {form.active ? 'Activo' : 'Inactivo'}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {form.active ? 'Visible en la aplicación' : 'Oculto en los selectores'}
                    </p>
                  </div>
                  {form.active ? <ToggleRight className="w-7 h-7 text-green-600" /> : <ToggleLeft className="w-7 h-7 text-gray-400" />}
                </div>
              </button>
              <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700">
                  <Users className="w-6 h-6 text-gray-700 dark:text-gray-200" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Invitar equipo del centro</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Configura usuarios desde Equipo para que el centro opere correctamente.</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/saas/team')}
                  className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                >
                  Ir a Equipo
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {step === 'ubicacion' && (
            <>
              <div>
                <label className={labelClass}>Dirección</label>
                <input className={inputClass} placeholder="Calle, número..." value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Ciudad</label>
                  <input className={inputClass} placeholder="Madrid" value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Provincia</label>
                  <input className={inputClass} placeholder="Madrid" value={form.province} onChange={(e) => setForm(f => ({ ...f, province: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>C.P.</label>
                  <input className={inputClass} placeholder="28001" value={form.postalCode} onChange={(e) => setForm(f => ({ ...f, postalCode: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Teléfono</label>
                  <input className={inputClass} placeholder="+34 600 000 000" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input type="email" className={inputClass} placeholder="centro@empresa.com" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Superficie (m²)</label>
                  <input type="number" className={inputClass} placeholder="120" value={form.squareMeters} onChange={(e) => setForm(f => ({ ...f, squareMeters: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Referencia catastral</label>
                  <input className={inputClass} placeholder="Ref. catastral" value={form.cadastralReference} onChange={(e) => setForm(f => ({ ...f, cadastralReference: e.target.value }))} />
                </div>
              </div>
            </>
          )}

          {step === 'propiedad' && form.ownership === 'propiedad' && (
            <>
              <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-800 rounded-xl">
                <Home className="w-5 h-5 text-emerald-600 shrink-0" />
                <p className="text-sm text-emerald-800 dark:text-emerald-300">
                  Datos de la propiedad. Estos campos son opcionales y se almacenan de forma privada.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Precio de compra (€)</label>
                  <input type="number" className={inputClass} placeholder="150000" value={form.purchasePrice} onChange={(e) => setForm(f => ({ ...f, purchasePrice: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Fecha de compra</label>
                  <input type="date" className={inputClass} value={form.purchaseDate} onChange={(e) => setForm(f => ({ ...f, purchaseDate: e.target.value }))} />
                </div>
              </div>
            </>
          )}

          {step === 'propiedad' && form.ownership === 'alquiler' && (
            <>
              <div className="flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-xl">
                <FileText className="w-5 h-5 text-orange-600 shrink-0" />
                <p className="text-sm text-orange-800 dark:text-orange-300">
                  Datos del contrato de alquiler. Toda la información se almacena de forma privada.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Inicio del contrato</label>
                  <input type="date" className={inputClass} value={form.contractStartDate} onChange={(e) => setForm(f => ({ ...f, contractStartDate: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Fin del contrato</label>
                  <input type="date" className={inputClass} value={form.contractEndDate} onChange={(e) => setForm(f => ({ ...f, contractEndDate: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Precio mensual (€)</label>
                  <input type="number" className={inputClass} placeholder="1200" value={form.monthlyPrice} onChange={(e) => setForm(f => ({ ...f, monthlyPrice: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Fianza (€)</label>
                  <input type="number" className={inputClass} placeholder="2400" value={form.deposit} onChange={(e) => setForm(f => ({ ...f, deposit: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Arrendador (nombre)</label>
                <input className={inputClass} placeholder="Nombre del arrendador" value={form.landlord} onChange={(e) => setForm(f => ({ ...f, landlord: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Teléfono arrendador</label>
                  <input className={inputClass} placeholder="+34 600 000 000" value={form.landlordPhone} onChange={(e) => setForm(f => ({ ...f, landlordPhone: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Email arrendador</label>
                  <input type="email" className={inputClass} placeholder="arrendador@email.com" value={form.landlordEmail} onChange={(e) => setForm(f => ({ ...f, landlordEmail: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Notas del contrato</label>
                <textarea rows={2} className={`${inputClass} resize-none`} placeholder="Condiciones especiales, renovación..." value={form.contractNotes} onChange={(e) => setForm(f => ({ ...f, contractNotes: e.target.value }))} />
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving} className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm">
            {saving ? 'Guardando...' : editItem ? 'Guardar cambios' : 'Crear centro de trabajo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AI & Import field definitions ─────────────────────────────────────────────

const WC_AI_FIELDS: AIFieldDef[] = [
  { key: 'name', label: 'Nombre' },
  { key: 'centerType', label: 'Tipo (oficina/punto_de_venta/almacen/custom)' },
  { key: 'ownership', label: 'Régimen (propiedad/alquiler)' },
  { key: 'address', label: 'Dirección' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'email', label: 'Email' },
  { key: 'notes', label: 'Notas' },
];

const WC_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'name', label: 'Nombre', required: true, example: 'Oficina Central' },
  { key: 'centerType', label: 'Tipo', example: 'oficina' },
  { key: 'ownership', label: 'Régimen', example: 'propiedad' },
  { key: 'address', label: 'Dirección', example: 'Calle Mayor 5' },
  { key: 'phone', label: 'Teléfono', example: '600123456' },
  { key: 'email', label: 'Email', example: 'oficina@empresa.com' },
  { key: 'notes', label: 'Notas', example: '' },
];

// ── Tab principal ─────────────────────────────────────────────────────────────

export function SalesPointsTab() {
  const { user } = useAuth();
  const resolvedUserId = user?.id || (user as { user_id?: string } | null)?.user_id || '';
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkCenter | null>(null);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterType, setFilterType] = useState<WorkCenterType | 'all'>('all');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkCenter | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteAcknowledge, setDeleteAcknowledge] = useState(false);

  const loadData = useCallback(async () => {
    if (!resolvedUserId) return;
    try {
      const wcs = await listWorkCenters(resolvedUserId);
      setWorkCenters(wcs);
    } catch {
      toast.error('Error al cargar los centros de trabajo');
    } finally {
      setLoading(false);
    }
  }, [resolvedUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async (data: Partial<WorkCenter>) => {
    if (!resolvedUserId) {
      toast.error('No hay usuario autenticado para guardar este centro.');
      return;
    }
    try {
      if (editingItem) {
        const updated = await updateWorkCenter({ ...editingItem, ...data } as WorkCenter);
        setWorkCenters(prev => prev.map(wc => wc._id === updated._id ? updated : wc).sort((a, b) => a.name.localeCompare(b.name, 'es')));
        toast.success(`"${updated.name}" actualizado`);
      } else {
        const created = await createWorkCenter(resolvedUserId, {
          name: data.name!,
          centerType: data.centerType || 'punto_de_venta',
          customTypeName: data.customTypeName,
          ownership: data.ownership || 'propiedad',
          contract: data.contract,
          purchasePrice: data.purchasePrice,
          purchaseDate: data.purchaseDate,
          cadastralReference: data.cadastralReference,
          active: data.active !== false,
          address: data.address,
          city: data.city,
          postalCode: data.postalCode,
          province: data.province,
          phone: data.phone,
          email: data.email,
          expectedStaffCount: data.expectedStaffCount ?? 3,
          squareMeters: data.squareMeters,
          notes: data.notes,
        });
        setWorkCenters(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'es')));
        toast.success(`"${created.name}" creado`);
      }
      setShowModal(false);
      setEditingItem(null);
    } catch {
      toast.error('Error al guardar');
      throw new Error('save failed');
    }
  };

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    if (!resolvedUserId) return;
    let created = 0;
    for (const entry of entries) {
      try {
        const ct = String(entry.centerType || 'punto_de_venta');
        const ow = String(entry.ownership || 'propiedad');
        const wc = await createWorkCenter(resolvedUserId, {
          name: String(entry.name || ''),
          centerType: (['oficina', 'punto_de_venta', 'almacen', 'custom'].includes(ct) ? ct : 'punto_de_venta') as WorkCenterType,
          ownership: (ow === 'alquiler' ? 'alquiler' : 'propiedad') as OwnershipType,
          active: true,
          address: String(entry.address || ''),
          phone: String(entry.phone || ''),
          email: String(entry.email || ''),
          notes: String(entry.notes || ''),
        });
        setWorkCenters(prev => [...prev, wc].sort((a, b) => a.name.localeCompare(b.name, 'es')));
        created++;
      } catch { /* skip */ }
    }
    if (created > 0) toast.success(`${created} centro(s) de trabajo creado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    if (!resolvedUserId) return;
    let created = 0;
    for (const entry of entries) {
      try {
        const ct = entry.centerType || 'punto_de_venta';
        const ow = entry.ownership || 'propiedad';
        const wc = await createWorkCenter(resolvedUserId, {
          name: entry.name || '',
          centerType: (['oficina', 'punto_de_venta', 'almacen', 'custom'].includes(ct) ? ct : 'punto_de_venta') as WorkCenterType,
          ownership: (ow === 'alquiler' ? 'alquiler' : 'propiedad') as OwnershipType,
          active: true,
          address: entry.address || '',
          phone: entry.phone || '',
          email: entry.email || '',
          notes: entry.notes || '',
        });
        setWorkCenters(prev => [...prev, wc].sort((a, b) => a.name.localeCompare(b.name, 'es')));
        created++;
      } catch { /* skip */ }
    }
    if (created > 0) toast.success(`${created} centro(s) de trabajo importado(s)`);
  };

  const handleToggleActive = async (wc: WorkCenter) => {
    if (!resolvedUserId) return;
    try {
      const updated = await updateWorkCenter({ ...wc, active: !wc.active });
      setWorkCenters(prev => prev.map(s => s._id === updated._id ? updated : s));
      toast.success(`"${wc.name}" marcado como ${!wc.active ? 'activo' : 'inactivo'}`);
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const openDeleteDialog = (wc: WorkCenter) => {
    setDeleteTarget(wc);
    setDeleteConfirmName('');
    setDeleteAcknowledge(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteConfirmName.trim().toLowerCase() !== deleteTarget.name.trim().toLowerCase()) {
      toast.error(`Escribe el nombre exacto (${deleteTarget.name}) para continuar.`);
      return;
    }
    if (!deleteAcknowledge) {
      toast.error('Debes confirmar el borrado definitivo.');
      return;
    }
    try {
      await deleteWorkCenter(deleteTarget._id);
      setWorkCenters(prev => prev.filter(s => s._id !== deleteTarget._id));
      toast.success(`"${deleteTarget.name}" eliminado`);
      setDeleteTarget(null);
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const filtered = useMemo(() => {
    return workCenters.filter(wc => {
      if (filterActive === 'active' && !wc.active) return false;
      if (filterActive === 'inactive' && wc.active) return false;
      if (filterType !== 'all' && wc.centerType !== filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          wc.name.toLowerCase().includes(q) ||
          wc.address?.toLowerCase().includes(q) ||
          wc.city?.toLowerCase().includes(q) ||
          wc.email?.toLowerCase().includes(q) ||
          wc.notes?.toLowerCase().includes(q) ||
          wc.customTypeName?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [workCenters, search, filterActive, filterType]);

  const kpis = useMemo(() => {
    const byType = { oficina: 0, punto_de_venta: 0, almacen: 0, custom: 0 };
    workCenters.forEach(wc => { byType[wc.centerType] = (byType[wc.centerType] || 0) + 1; });
    const owned = workCenters.filter(w => w.ownership === 'propiedad').length;
    const rented = workCenters.filter(w => w.ownership === 'alquiler').length;
    return { total: workCenters.length, active: workCenters.filter(s => s.active).length, inactive: workCenters.filter(s => !s.active).length, byType, owned, rented };
  }, [workCenters]);

  const getTypeLabel = (wc: WorkCenter) => wc.centerType === 'custom' ? (wc.customTypeName || 'Otro') : WORK_CENTER_TYPE_SHORT[wc.centerType];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl">
          <div className="text-indigo-600 mb-2"><Building2 className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-200">{kpis.total}</div>
          <div className="text-xs text-indigo-700 dark:text-indigo-400 mt-0.5">Total centros</div>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
          <div className="text-green-600 mb-2"><ToggleRight className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-green-900 dark:text-green-200">{kpis.active}</div>
          <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">Activos</div>
        </div>
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-800 rounded-xl">
          <div className="text-emerald-600 mb-2"><Home className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-200">{kpis.owned}</div>
          <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">Propiedad</div>
        </div>
        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-xl">
          <div className="text-orange-600 mb-2"><FileText className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-orange-900 dark:text-orange-200">{kpis.rented}</div>
          <div className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">Alquiler</div>
        </div>
      </div>

      {/* Desglose por tipo */}
      {kpis.total > 0 && (
        <div className="flex flex-wrap gap-2">
          {([
            { type: 'oficina' as WorkCenterType, count: kpis.byType.oficina },
            { type: 'punto_de_venta' as WorkCenterType, count: kpis.byType.punto_de_venta },
            { type: 'almacen' as WorkCenterType, count: kpis.byType.almacen },
            { type: 'custom' as WorkCenterType, count: kpis.byType.custom },
          ]).filter(t => t.count > 0).map(({ type: ct, count }) => (
            <div key={ct} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${CENTER_TYPE_COLORS[ct]}`}>
              {CENTER_TYPE_ICONS[ct]}
              <span>{count} {WORK_CENTER_TYPE_SHORT[ct]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filtros y acciones */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              className="pl-9 pr-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-52"
              placeholder="Buscar centro..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'active', 'inactive'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterActive(status)}
                className={`px-3 py-2 text-xs font-semibold rounded-xl border-2 transition-colors ${
                  filterActive === status
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'
                }`}
              >
                {status === 'all' ? 'Todos' : status === 'active' ? 'Activos' : 'Inactivos'}
              </button>
            ))}
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as WorkCenterType | 'all')}
            className="px-3 py-2 text-xs font-semibold rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 outline-none"
          >
            <option value="all">Todos los tipos</option>
            {(Object.keys(WORK_CENTER_TYPE_SHORT) as WorkCenterType[]).map(ct => (
              <option key={ct} value={ct}>{WORK_CENTER_TYPE_SHORT[ct]}</option>
            ))}
          </select>
        </div>
        <AddButtonDropdown
          label="Nuevo centro"
          onQuickAdd={() => { setEditingItem(null); setShowModal(true); }}
          onAIAdd={() => setShowAIModal(true)}
          onImport={() => setShowImportModal(true)}
          quickAddLabel="Alta rápida"
          quickAddDesc="Formulario de centro de trabajo"
        />
      </div>

      {/* Lista de centros */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />
          Cargando centros de trabajo...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <Building2 className="w-12 h-12 text-gray-300 mb-3" />
          <p className="font-semibold">
            {workCenters.length === 0 ? 'No hay centros de trabajo configurados' : 'Sin resultados'}
          </p>
          <p className="text-sm mt-1">
            {workCenters.length === 0
              ? 'Crea el primer centro de trabajo: oficina, punto de venta, almacén...'
              : 'Prueba con otros términos de búsqueda'}
          </p>
          {workCenters.length === 0 && (
            <button
              onClick={() => { setEditingItem(null); setShowModal(true); }}
              className="mt-4 px-4 py-2 bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white rounded-xl text-sm font-medium"
            >
              + Nuevo centro de trabajo
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(wc => (
            <div key={wc._id} className={`bg-white dark:bg-gray-800 border-2 rounded-xl p-5 transition-all hover:shadow-md ${wc.active ? 'border-gray-200 dark:border-gray-700' : 'border-dashed border-gray-200 dark:border-gray-700 opacity-70'}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${CENTER_TYPE_COLORS[wc.centerType]}`}>
                    {CENTER_TYPE_ICONS[wc.centerType]}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">{wc.name}</div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${CENTER_TYPE_COLORS[wc.centerType]}`}>
                        {getTypeLabel(wc)}
                      </span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${wc.ownership === 'propiedad' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                        {OWNERSHIP_LABELS[wc.ownership]}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleActive(wc)}
                  className={`flex-shrink-0 ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    wc.active
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200'
                  }`}
                  title={wc.active ? 'Clic para desactivar' : 'Clic para activar'}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${wc.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                  {wc.active ? 'Activo' : 'Inactivo'}
                </button>
              </div>

              <div className="space-y-1.5">
                {wc.address && (
                  <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="line-clamp-1">{[wc.address, wc.city, wc.province].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {wc.phone && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span>{wc.phone}</span>
                  </div>
                )}
                {wc.email && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{wc.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span>{wc.expectedStaffCount ?? 3} trabajador{(wc.expectedStaffCount ?? 3) !== 1 ? 'es' : ''}</span>
                </div>
                {wc.ownership === 'alquiler' && wc.contract?.monthlyPrice && (
                  <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400">
                    <Euro className="w-3.5 h-3.5 shrink-0" />
                    <span>{wc.contract.monthlyPrice.toLocaleString('es-ES')}€/mes</span>
                    {wc.contract.endDate && <span className="text-gray-400">· Hasta {new Date(wc.contract.endDate).toLocaleDateString('es-ES')}</span>}
                  </div>
                )}
                {wc.ownership === 'alquiler' && wc.contract?.landlord && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="w-3.5 h-3.5 shrink-0 text-center font-bold text-[10px]">👤</span>
                    <span>Arrendador: {wc.contract.landlord}</span>
                  </div>
                )}
                {wc.ownership === 'propiedad' && wc.purchasePrice && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                    <Euro className="w-3.5 h-3.5 shrink-0" />
                    <span>Valor: {wc.purchasePrice.toLocaleString('es-ES')}€</span>
                    {wc.purchaseDate && <span className="text-gray-400">· Compra {new Date(wc.purchaseDate).toLocaleDateString('es-ES')}</span>}
                  </div>
                )}
                {wc.squareMeters && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="w-3.5 h-3.5 shrink-0 text-center font-bold text-[10px]">📐</span>
                    <span>{wc.squareMeters} m²</span>
                  </div>
                )}
              </div>

              {wc.notes && <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 line-clamp-2">{wc.notes}</p>}

              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => { setEditingItem(wc); setShowModal(true); }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Editar
                </button>
                <button
                  onClick={() => openDeleteDialog(wc)}
                  className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
          <span>{filtered.length} de {workCenters.length} centro{workCenters.length !== 1 ? 's' : ''} de trabajo</span>
          {search && <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline">Limpiar búsqueda</button>}
        </div>
      )}

      <WorkCenterModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingItem(null); }}
        onSave={handleSave}
        editItem={editingItem}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-lg rounded-2xl border-2 border-red-200 bg-white p-5 shadow-2xl dark:border-red-900 dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-red-100 p-2 text-red-600 dark:bg-red-900/40 dark:text-red-300">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">Eliminar establecimiento</h4>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Acción irreversible. Se ocultará para toda la operativa.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                Nombre: <span className="font-semibold">{deleteTarget.name}</span>
              </div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Escribe el nombre exacto para confirmar
              </label>
              <input
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-red-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                placeholder={deleteTarget.name}
              />
              <label className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/60 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={deleteAcknowledge} onChange={(e) => setDeleteAcknowledge(e.target.checked)} />
                Confirmo que quiero eliminar este establecimiento y entiendo que la acción no se puede deshacer.
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteConfirmName.trim().toLowerCase() !== deleteTarget.name.trim().toLowerCase() || !deleteAcknowledge}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-white ${
                  deleteConfirmName.trim().toLowerCase() === deleteTarget.name.trim().toLowerCase() && deleteAcknowledge
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-red-300 cursor-not-allowed'
                }`}
              >
                Eliminar definitivamente
              </button>
            </div>
          </div>
        </div>
      )}

      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="workCenters"
        moduleLabel="Centros de trabajo"
        fields={WC_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />

      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Centros de trabajo"
        fields={WC_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </div>
  );
}
