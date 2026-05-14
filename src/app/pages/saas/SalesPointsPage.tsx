import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
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
} from '../../lib/workCentersApi';
import {
  formatMoneyAsYouType,
  parseSpanishMoneyInput,
  moneyNumberToDisplay,
} from '../../lib/workCenterMoneyInput';
import {
  Plus,
  Search,
  X,
  Trash2,
  Edit3,
  MapPin,
  BookOpen,
  Boxes,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
  Phone,
  Mail,
  FileText,
  Store,
  Building2,
  Warehouse,
  Home,
  Tag,
  Euro,
  Calendar,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

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
        squareMeters: editItem.squareMeters ? String(editItem.squareMeters) : '',
        notes: editItem.notes || '',
        active: editItem.active,
        purchasePrice: editItem.purchasePrice ? String(editItem.purchasePrice) : '',
        purchaseDate: editItem.purchaseDate || '',
        cadastralReference: editItem.cadastralReference || '',
        contractStartDate: editItem.contract?.startDate || '',
        contractEndDate: editItem.contract?.endDate || '',
        monthlyPrice: moneyNumberToDisplay(editItem.contract?.monthlyPrice, true),
        deposit: moneyNumberToDisplay(editItem.contract?.deposit, false),
        landlord: editItem.contract?.landlord || '',
        landlordPhone: editItem.contract?.landlordPhone || '',
        landlordEmail: editItem.contract?.landlordEmail || '',
        contractNotes: editItem.contract?.contractNotes || '',
      });
    } else {
      setForm({
        name: '', centerType: 'punto_de_venta', customTypeName: '', ownership: 'propiedad',
        address: '', city: '', postalCode: '', province: '', phone: '', email: '', squareMeters: '',
        notes: '', active: true, purchasePrice: '', purchaseDate: '', cadastralReference: '',
        contractStartDate: '', contractEndDate: '', monthlyPrice: '', deposit: '',
        landlord: '', landlordPhone: '', landlordEmail: '', contractNotes: '',
      });
    }
    setStep('general');
  }, [editItem, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (form.centerType === 'custom' && !form.customTypeName.trim()) { toast.error('Especifica el tipo personalizado'); return; }
    setSaving(true);
    try {
      const contract: ContractInfo | undefined = form.ownership === 'alquiler' ? {
        startDate: form.contractStartDate || undefined,
        endDate: form.contractEndDate || undefined,
        monthlyPrice: String(form.monthlyPrice ?? '').trim() ? parseSpanishMoneyInput(form.monthlyPrice) : undefined,
        deposit: String(form.deposit ?? '').trim() ? parseSpanishMoneyInput(form.deposit) : undefined,
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
        squareMeters: form.squareMeters ? Number(form.squareMeters) : undefined,
        notes: form.notes.trim() || undefined,
        active: form.active,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';
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
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Configura los datos del centro</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
          {steps.map(s => (
            <button key={s} onClick={() => setStep(s)} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${step === s ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
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
                  {(Object.keys(WORK_CENTER_TYPE_LABELS) as WorkCenterType[]).map(ct => (
                    <button key={ct} type="button" onClick={() => setForm(f => ({ ...f, centerType: ct }))} className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all text-sm ${form.centerType === ct ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-700' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${CENTER_TYPE_COLORS[ct]}`}>{CENTER_TYPE_ICONS[ct]}</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{WORK_CENTER_TYPE_SHORT[ct]}</span>
                    </button>
                  ))}
                </div>
              </div>
              {form.centerType === 'custom' && (
                <div>
                  <label className={labelClass}>Tipo personalizado *</label>
                  <input className={inputClass} placeholder="Ej: Garaje, Trastero..." value={form.customTypeName} onChange={e => setForm(f => ({ ...f, customTypeName: e.target.value }))} />
                </div>
              )}
              <div>
                <label className={labelClass}>Nombre *</label>
                <input className={inputClass} placeholder="Ej: Oficina Central, Tienda Gran Vía..." value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className={labelClass}>Régimen</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['propiedad', 'alquiler'] as OwnershipType[]).map(ow => (
                    <button key={ow} type="button" onClick={() => setForm(f => ({ ...f, ownership: ow }))} className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all text-sm ${form.ownership === ow ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-700' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
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
                <textarea rows={2} className={`${inputClass} resize-none`} placeholder="Notas adicionales..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <button type="button" onClick={() => setForm(f => ({ ...f, active: !f.active }))} className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${form.active ? 'border-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">{form.active ? 'Activo' : 'Inactivo'}</div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{form.active ? 'Visible en la aplicación' : 'Oculto en los selectores'}</p>
                  </div>
                  {form.active ? <ToggleRight className="w-7 h-7 text-green-600" /> : <ToggleLeft className="w-7 h-7 text-gray-400" />}
                </div>
              </button>
            </>
          )}

          {step === 'ubicacion' && (
            <>
              <div><label className={labelClass}>Dirección</label><input className={inputClass} placeholder="Calle, número..." value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={labelClass}>Ciudad</label><input className={inputClass} placeholder="Madrid" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
                <div><label className={labelClass}>Provincia</label><input className={inputClass} placeholder="Madrid" value={form.province} onChange={e => setForm(f => ({ ...f, province: e.target.value }))} /></div>
                <div><label className={labelClass}>C.P.</label><input className={inputClass} placeholder="28001" value={form.postalCode} onChange={e => setForm(f => ({ ...f, postalCode: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelClass}>Teléfono</label><input className={inputClass} placeholder="+34 600 000 000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div><label className={labelClass}>Email</label><input type="email" className={inputClass} placeholder="centro@empresa.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelClass}>Superficie (m²)</label><input type="number" className={inputClass} placeholder="120" value={form.squareMeters} onChange={e => setForm(f => ({ ...f, squareMeters: e.target.value }))} /></div>
                <div><label className={labelClass}>Ref. catastral</label><input className={inputClass} placeholder="Ref. catastral" value={form.cadastralReference} onChange={e => setForm(f => ({ ...f, cadastralReference: e.target.value }))} /></div>
              </div>
            </>
          )}

          {step === 'propiedad' && form.ownership === 'propiedad' && (
            <>
              <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-800 rounded-xl">
                <Home className="w-5 h-5 text-emerald-600 shrink-0" />
                <p className="text-sm text-emerald-800 dark:text-emerald-300">Datos de la propiedad (opcionales y privados).</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelClass}>Precio de compra (€)</label><input type="number" className={inputClass} placeholder="150000" value={form.purchasePrice} onChange={e => setForm(f => ({ ...f, purchasePrice: e.target.value }))} /></div>
                <div><label className={labelClass}>Fecha de compra</label><input type="date" className={inputClass} value={form.purchaseDate} onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))} /></div>
              </div>
            </>
          )}

          {step === 'propiedad' && form.ownership === 'alquiler' && (
            <>
              <div className="flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-xl">
                <FileText className="w-5 h-5 text-orange-600 shrink-0" />
                <p className="text-sm text-orange-800 dark:text-orange-300">Datos del contrato de alquiler (privados).</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelClass}>Inicio contrato</label><input type="date" className={inputClass} value={form.contractStartDate} onChange={e => setForm(f => ({ ...f, contractStartDate: e.target.value }))} /></div>
                <div><label className={labelClass}>Fin contrato</label><input type="date" className={inputClass} value={form.contractEndDate} onChange={e => setForm(f => ({ ...f, contractEndDate: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Precio mensual (€)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className={inputClass}
                    placeholder="1.200 o 1.200,50"
                    value={form.monthlyPrice}
                    onChange={(e) => setForm((f) => ({ ...f, monthlyPrice: formatMoneyAsYouType(e.target.value, true) }))}
                  />
                </div>
                <div>
                  <label className={labelClass}>Fianza (€)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className={inputClass}
                    placeholder="2.400"
                    value={form.deposit}
                    onChange={(e) => setForm((f) => ({ ...f, deposit: formatMoneyAsYouType(e.target.value, false) }))}
                  />
                </div>
              </div>
              <div><label className={labelClass}>Arrendador</label><input className={inputClass} placeholder="Nombre del arrendador" value={form.landlord} onChange={e => setForm(f => ({ ...f, landlord: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelClass}>Tfno. arrendador</label><input className={inputClass} placeholder="+34 600 000 000" value={form.landlordPhone} onChange={e => setForm(f => ({ ...f, landlordPhone: e.target.value }))} /></div>
                <div><label className={labelClass}>Email arrendador</label><input type="email" className={inputClass} placeholder="arrendador@email.com" value={form.landlordEmail} onChange={e => setForm(f => ({ ...f, landlordEmail: e.target.value }))} /></div>
              </div>
              <div><label className={labelClass}>Notas del contrato</label><textarea rows={2} className={`${inputClass} resize-none`} placeholder="Condiciones, renovación..." value={form.contractNotes} onChange={e => setForm(f => ({ ...f, contractNotes: e.target.value }))} /></div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm">Cancelar</button>
          <button type="button" onClick={handleSubmit} disabled={saving || !form.name.trim()} className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm">
            {saving ? 'Guardando...' : editItem ? 'Guardar cambios' : 'Crear centro de trabajo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export function SalesPointsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkCenter | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<WorkCenterType | 'all'>('all');

  useModalClose(showModal, () => { setShowModal(false); setEditingItem(null); });
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

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

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    if (!user?.id) return;
    let created = 0;
    for (const entry of entries) {
      try {
        const ct = String(entry.centerType || 'punto_de_venta');
        const ow = String(entry.ownership || 'propiedad');
        const wc = await createWorkCenter(user.id, {
          name: String(entry.name || ''),
          centerType: (['oficina', 'punto_de_venta', 'almacen', 'custom'].includes(ct) ? ct : 'punto_de_venta') as WorkCenterType,
          ownership: (ow === 'alquiler' ? 'alquiler' : 'propiedad') as OwnershipType,
          active: true,
          address: String(entry.address || ''),
          phone: String(entry.phone || ''),
          email: String(entry.email || ''),
          notes: String(entry.notes || ''),
        });
        setWorkCenters(prev => [...prev, wc]);
        created++;
      } catch { /* skip */ }
    }
    toast.success(`${created} centro(s) de trabajo creado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    if (!user?.id) return;
    let created = 0;
    for (const entry of entries) {
      try {
        const ct = entry.centerType || 'punto_de_venta';
        const ow = entry.ownership || 'propiedad';
        const wc = await createWorkCenter(user.id, {
          name: entry.name || '',
          centerType: (['oficina', 'punto_de_venta', 'almacen', 'custom'].includes(ct) ? ct : 'punto_de_venta') as WorkCenterType,
          ownership: (ow === 'alquiler' ? 'alquiler' : 'propiedad') as OwnershipType,
          active: true,
          address: entry.address || '',
          phone: entry.phone || '',
          email: entry.email || '',
          notes: entry.notes || '',
        });
        setWorkCenters(prev => [...prev, wc]);
        created++;
      } catch { /* skip */ }
    }
    toast.success(`${created} centro(s) de trabajo importado(s)`);
  };

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const wcs = await listWorkCenters(user.id);
      setWorkCenters(wcs);
    } catch {
      toast.error('Error al cargar los centros de trabajo');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async (data: Partial<WorkCenter>) => {
    if (!user?.id) return;
    try {
      if (editingItem) {
        const updated = await updateWorkCenter({ ...editingItem, ...data } as WorkCenter);
        setWorkCenters(prev => prev.map(wc => wc._id === updated._id ? updated : wc).sort((a, b) => a.name.localeCompare(b.name, 'es')));
        toast.success(`"${updated.name}" actualizado`);
      } else {
        const created = await createWorkCenter(user.id, {
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

  const handleToggleActive = async (wc: WorkCenter) => {
    if (!user?.id) return;
    try {
      const updated = await updateWorkCenter({ ...wc, active: !wc.active });
      setWorkCenters(prev => prev.map(s => s._id === updated._id ? updated : s));
      toast.success(`"${wc.name}" marcado como ${!wc.active ? 'activo' : 'inactivo'}`);
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const handleDelete = async (wc: WorkCenter) => {
    if (!confirm(`¿Eliminar "${wc.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteWorkCenter(wc._id);
      setWorkCenters(prev => prev.filter(s => s._id !== wc._id));
      toast.success(`"${wc.name}" eliminado`);
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
        return wc.name.toLowerCase().includes(q) || wc.address?.toLowerCase().includes(q) || wc.city?.toLowerCase().includes(q) || wc.email?.toLowerCase().includes(q) || wc.notes?.toLowerCase().includes(q) || wc.customTypeName?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [workCenters, search, filterActive, filterType]);

  const kpis = useMemo(() => {
    const byType = { oficina: 0, punto_de_venta: 0, almacen: 0, custom: 0 };
    workCenters.forEach(wc => { byType[wc.centerType] = (byType[wc.centerType] || 0) + 1; });
    return { total: workCenters.length, active: workCenters.filter(s => s.active).length, inactive: workCenters.filter(s => !s.active).length, byType };
  }, [workCenters]);

  const getTypeLabel = (wc: WorkCenter) => wc.centerType === 'custom' ? (wc.customTypeName || 'Otro') : WORK_CENTER_TYPE_SHORT[wc.centerType];

  return (
    <Layout title="Centros de Trabajo" subtitle="Gestión de oficinas, puntos de venta, almacenes y otros centros">
      <div className="space-y-6">
        {/* Quick nav */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/saas/catalog')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> Catálogo <ExternalLink className="w-3 h-3" />
          </button>
          <button onClick={() => navigate('/saas/articles')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
            <Boxes className="w-3.5 h-3.5" /> Artículos <ExternalLink className="w-3 h-3" />
          </button>
          <button onClick={() => navigate('/saas/quotes')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Presupuestos <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl">
            <div className="text-indigo-600 mb-2"><Building2 className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-200">{kpis.total}</div>
            <div className="text-xs text-indigo-700 dark:text-indigo-400 mt-0.5">Total centros</div>
          </div>
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="text-blue-600 mb-2"><Building2 className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-200">{kpis.byType.oficina}</div>
            <div className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">Oficinas</div>
          </div>
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl">
            <div className="text-indigo-600 mb-2"><Store className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-200">{kpis.byType.punto_de_venta}</div>
            <div className="text-xs text-indigo-700 dark:text-indigo-400 mt-0.5">Establecimientos</div>
          </div>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
            <div className="text-amber-600 mb-2"><Warehouse className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-200">{kpis.byType.almacen + kpis.byType.custom}</div>
            <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Almacenes y otros</div>
          </div>
        </div>

        {/* Filtros y acción */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input className="pl-9 pr-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-52" placeholder="Buscar centro..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1.5">
              {(['all', 'active', 'inactive'] as const).map(status => (
                <button key={status} onClick={() => setFilterActive(status)} className={`px-3 py-2 text-xs font-semibold rounded-xl border-2 transition-colors ${filterActive === status ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                  {status === 'all' ? 'Todos' : status === 'active' ? 'Activos' : 'Inactivos'}
                </button>
              ))}
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value as WorkCenterType | 'all')} className="px-3 py-2 text-xs font-semibold rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 outline-none">
              <option value="all">Todos los tipos</option>
              {(Object.keys(WORK_CENTER_TYPE_SHORT) as WorkCenterType[]).map(ct => (
                <option key={ct} value={ct}>{WORK_CENTER_TYPE_SHORT[ct]}</option>
              ))}
            </select>
          </div>
          <AddButtonDropdown
            label="Nuevo centro de trabajo"
            onQuickAdd={() => { setEditingItem(null); setShowModal(true); }}
            onAIAdd={() => setShowAIModal(true)}
            onImport={() => setShowImportModal(true)}
            quickAddLabel="Alta rápida"
            quickAddDesc="Formulario de centro de trabajo"
          />
        </div>

        {/* Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />
            Cargando centros de trabajo...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <Building2 className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-semibold">{workCenters.length === 0 ? 'No hay centros de trabajo configurados' : 'Sin resultados'}</p>
            <p className="text-sm mt-1">{workCenters.length === 0 ? 'Crea el primer centro: oficina, punto de venta, almacén...' : 'Prueba con otros términos'}</p>
            {workCenters.length === 0 && (
              <button onClick={() => { setEditingItem(null); setShowModal(true); }} className="mt-4 px-4 py-2 bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white rounded-xl text-sm font-medium">
                + Nuevo centro de trabajo
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(wc => (
              <div key={wc._id} className={`bg-white dark:bg-gray-800 border-2 rounded-xl p-5 transition-all ${wc.active ? 'border-gray-200 dark:border-gray-700' : 'border-dashed border-gray-200 dark:border-gray-700 opacity-70'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${CENTER_TYPE_COLORS[wc.centerType]}`}>
                      {CENTER_TYPE_ICONS[wc.centerType]}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{wc.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${CENTER_TYPE_COLORS[wc.centerType]}`}>
                          {getTypeLabel(wc)}
                        </span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${wc.ownership === 'propiedad' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                          {OWNERSHIP_LABELS[wc.ownership]}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {wc.address && (
                  <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{[wc.address, wc.city, wc.province].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {wc.phone && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span>{wc.phone}</span>
                  </div>
                )}
                {wc.email && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{wc.email}</span>
                  </div>
                )}
                {wc.ownership === 'alquiler' && wc.contract?.monthlyPrice && (
                  <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400 mb-1.5">
                    <Euro className="w-3.5 h-3.5 shrink-0" />
                    <span>{wc.contract.monthlyPrice.toLocaleString('es-ES')}€/mes</span>
                    {wc.contract.endDate && <span className="text-gray-400">· Hasta {new Date(wc.contract.endDate).toLocaleDateString('es-ES')}</span>}
                  </div>
                )}
                {wc.notes && <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 line-clamp-2">{wc.notes}</p>}

                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <button onClick={() => handleToggleActive(wc)} className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${wc.active ? 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700' : 'border-green-200 text-green-700 hover:bg-green-50'}`}>
                    {wc.active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={() => { setEditingItem(wc); setShowModal(true); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Editar">
                    <Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </button>
                  <button onClick={() => handleDelete(wc)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Eliminar">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {workCenters.length > 0 && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <span className="font-semibold">Centros de trabajo:</span> Gestiona oficinas, puntos de venta, almacenes y otros espacios. Especifica si son de propiedad o alquiler con documentación de contratos, fechas y precios.
            </p>
          </div>
        )}
      </div>

      <WorkCenterModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingItem(null); }}
        onSave={handleSave}
        editItem={editingItem}
      />

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
    </Layout>
  );
}
