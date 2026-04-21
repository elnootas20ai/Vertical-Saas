import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useModalClose } from '../../hooks/useModalClose';
import {
  listCleaningServicesRequest,
  createCleaningServiceRequest,
  updateCleaningServiceRequest,
  deleteCleaningServiceRequest,
  type CleaningService,
  type CleaningServiceStatus,
  type CleaningTask,
} from '../../lib/cleaningApi';
import { useNavigate } from 'react-router-dom';
import {
  SprayCan, Plus, Calendar, Clock, MapPin, User, Search,
  CheckCircle, AlertCircle, Loader2, X, Trash2, Edit3,
  Phone, Mail, FileText, DollarSign, PlayCircle, Ban, Receipt,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

const STATUS_CONFIG: Record<CleaningServiceStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  pending:     { label: 'Pendiente',   bg: 'bg-amber-50',   text: 'text-amber-700',   icon: <AlertCircle className="w-3.5 h-3.5" /> },
  assigned:    { label: 'Asignado',    bg: 'bg-indigo-50',  text: 'text-indigo-700',  icon: <User className="w-3.5 h-3.5" /> },
  in_progress: { label: 'En progreso', bg: 'bg-blue-50',    text: 'text-blue-700',    icon: <Loader2 className="w-3.5 h-3.5" /> },
  completed:   { label: 'Finalizado',  bg: 'bg-emerald-50', text: 'text-emerald-700', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  cancelled:   { label: 'Cancelado',   bg: 'bg-gray-100',   text: 'text-gray-500',    icon: <Ban className="w-3.5 h-3.5" /> },
};

const CLEANING_TYPES = [
  { value: 'general', label: 'Limpieza general' },
  { value: 'office', label: 'Oficinas' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'post_construction', label: 'Post-obra' },
  { value: 'windows', label: 'Cristales' },
  { value: 'disinfection', label: 'Desinfección' },
  { value: 'deep', label: 'Limpieza profunda' },
];

const CLIENT_TYPES = [
  { value: 'house', label: 'Vivienda' },
  { value: 'office', label: 'Oficina' },
  { value: 'commercial', label: 'Comercio' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'community', label: 'Comunidad' },
];

const DEFAULT_TASKS: Record<string, string[]> = {
  general: ['Barrer / aspirar suelos', 'Fregar suelos', 'Limpiar polvo', 'Limpiar baños', 'Limpiar cocina', 'Vaciar papeleras'],
  office: ['Aspirar moqueta', 'Limpiar escritorios', 'Limpiar baños', 'Vaciar papeleras', 'Limpiar cristales interiores', 'Desinfectar pomos y superficies'],
  industrial: ['Barrer nave', 'Fregar suelos industriales', 'Limpieza de maquinaria exterior', 'Desengrasado', 'Vaciar residuos', 'Desinfección general'],
  post_construction: ['Retirar escombros', 'Limpiar polvo de obra', 'Fregar suelos', 'Limpiar cristales', 'Limpiar baños', 'Repaso general'],
  windows: ['Cristales exteriores', 'Cristales interiores', 'Marcos y persianas', 'Repaso de manchas'],
  disinfection: ['Desinfección superficies', 'Desinfección baños', 'Desinfección cocina', 'Nebulización', 'Desinfección textiles'],
  deep: ['Limpieza profunda baños', 'Limpieza profunda cocina', 'Limpieza interior armarios', 'Limpieza detrás de muebles', 'Limpieza de electrodomésticos', 'Desinfección general'],
};

interface ServiceForm {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  address: string;
  clientType: string;
  date: string;
  time: string;
  duration: string;
  cleaningType: string;
  assignedToName: string;
  price: string;
  notes: string;
  tasks: CleaningTask[];
  priority: 'normal' | 'urgent';
  zone: string;
  recurrenceType: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
  recurrenceDays: number[];
  recurrenceEndDate: string;
}

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Una vez' },
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
];

const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const emptyForm = (): ServiceForm => ({
  clientName: '', clientPhone: '', clientEmail: '', address: '',
  clientType: 'house', date: '', time: '', duration: '2',
  cleaningType: 'general', assignedToName: '', price: '', notes: '',
  tasks: (DEFAULT_TASKS['general'] || []).map((label, i) => ({ id: `t${i}`, label, done: false })),
  priority: 'normal', zone: '', recurrenceType: 'none', recurrenceDays: [], recurrenceEndDate: '',
});

const BILLING_STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  unbilled: { label: 'Sin facturar', bg: 'bg-amber-50', text: 'text-amber-600' },
  billed:   { label: 'Facturado',    bg: 'bg-blue-50',  text: 'text-blue-600' },
  paid:     { label: 'Cobrado',      bg: 'bg-emerald-50', text: 'text-emerald-600' },
};

export function CleaningServices() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<CleaningService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | CleaningServiceStatus>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<CleaningService | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [detailService, setDetailService] = useState<CleaningService | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'client', label: 'Cliente' },
    { key: 'address', label: 'Dirección' },
    { key: 'frequency', label: 'Frecuencia' },
    { key: 'price', label: 'Precio' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'client', label: 'Cliente', example: '' },
    { key: 'address', label: 'Dirección', example: '' },
    { key: 'frequency', label: 'Frecuencia', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} servicio(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} servicio(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));
  useModalClose(!!detailService, () => setDetailService(null));

  const loadServices = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await listCleaningServicesRequest(user.id);
      setServices(data);
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar servicios');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadServices(); }, [loadServices]);

  const openCreate = () => {
    setEditingService(null);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (svc: CleaningService) => {
    setEditingService(svc);
    setForm({
      clientName: svc.clientName, clientPhone: svc.clientPhone, clientEmail: svc.clientEmail,
      address: svc.address, clientType: svc.clientType, date: svc.date, time: svc.time,
      duration: svc.duration, cleaningType: svc.cleaningType, assignedToName: svc.assignedToName,
      price: String(svc.price || ''), notes: svc.notes,
      tasks: svc.tasks.length > 0 ? svc.tasks : (DEFAULT_TASKS[svc.cleaningType] || []).map((label, i) => ({ id: `t${i}`, label, done: false })),
      priority: svc.priority || 'normal',
      zone: svc.zone || '',
      recurrenceType: svc.recurrence?.type || 'none',
      recurrenceDays: svc.recurrence?.days || [],
      recurrenceEndDate: svc.recurrence?.endDate || '',
    });
    setShowModal(true);
  };

  const handleCleaningTypeChange = (type: string) => {
    setForm(prev => ({
      ...prev,
      cleaningType: type,
      tasks: (DEFAULT_TASKS[type] || []).map((label, i) => ({ id: `t${i}`, label, done: false })),
    }));
  };

  const handleSave = async () => {
    if (!user?.id) return;
    if (!form.clientName.trim()) { toast.error('El nombre del cliente es obligatorio'); return; }
    if (!form.address.trim()) { toast.error('La dirección es obligatoria'); return; }
    if (!form.date) { toast.error('La fecha es obligatoria'); return; }

    setSaving(true);
    try {
      const payload: Partial<CleaningService> = {
        clientName: form.clientName, clientPhone: form.clientPhone, clientEmail: form.clientEmail,
        address: form.address, clientType: form.clientType, date: form.date, time: form.time,
        duration: form.duration, cleaningType: form.cleaningType, assignedToName: form.assignedToName,
        price: Number(form.price) || 0, notes: form.notes, tasks: form.tasks as any,
        status: form.assignedToName.trim() ? 'assigned' : 'pending',
        priority: form.priority,
        zone: form.zone,
        recurrence: { type: form.recurrenceType, days: form.recurrenceDays, endDate: form.recurrenceEndDate },
      };

      if (editingService) {
        const updated = await updateCleaningServiceRequest(user.id, { ...editingService, ...payload } as CleaningService);
        setServices(prev => prev.map(s => s._id === updated._id ? updated : s));
        toast.success('Servicio actualizado');
      } else {
        const created = await createCleaningServiceRequest(user.id, payload);
        setServices(prev => [created, ...prev]);
        toast.success('Servicio creado');
      }
      setShowModal(false);
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (svc: CleaningService) => {
    if (!user?.id) return;
    if (!confirm('¿Eliminar este servicio?')) return;
    try {
      await deleteCleaningServiceRequest(user.id, svc._id);
      setServices(prev => prev.filter(s => s._id !== svc._id));
      setDetailService(null);
      toast.success('Servicio eliminado');
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar');
    }
  };

  const handleStatusChange = async (svc: CleaningService, newStatus: CleaningServiceStatus) => {
    if (!user?.id) return;
    try {
      const updated = await updateCleaningServiceRequest(user.id, { ...svc, status: newStatus } as CleaningService);
      setServices(prev => prev.map(s => s._id === updated._id ? updated : s));
      if (detailService?._id === updated._id) setDetailService(updated);
      toast.success(`Estado → ${STATUS_CONFIG[newStatus].label}`);
    } catch (err: any) {
      toast.error(err.message || 'Error al cambiar estado');
    }
  };

  const tabs: { key: 'all' | CleaningServiceStatus; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'pending', label: 'Pendientes' },
    { key: 'assigned', label: 'Asignados' },
    { key: 'in_progress', label: 'En progreso' },
    { key: 'completed', label: 'Finalizados' },
  ];

  const filtered = services.filter(s => {
    if (activeTab !== 'all' && s.status !== activeTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.clientName.toLowerCase().includes(q) || s.address.toLowerCase().includes(q) || s.assignedToName.toLowerCase().includes(q) || s.serviceNumber.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <Layout title="Servicios de Limpieza" subtitle="Gestión de servicios y agenda">
      <div className="flex flex-col gap-5">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Total servicios', value: services.length, bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-900 dark:text-gray-100' },
            { label: 'Pendientes', value: services.filter(s => s.status === 'pending').length, bg: 'bg-amber-50', text: 'text-amber-700' },
            { label: 'Asignados', value: services.filter(s => s.status === 'assigned').length, bg: 'bg-indigo-50', text: 'text-indigo-700' },
            { label: 'En progreso', value: services.filter(s => s.status === 'in_progress').length, bg: 'bg-blue-50', text: 'text-blue-700' },
            { label: 'Finalizados', value: services.filter(s => s.status === 'completed').length, bg: 'bg-emerald-50', text: 'text-emerald-700' },
          ].map((stat) => (
            <div key={stat.label} className={`${stat.bg} rounded-2xl p-4 border border-gray-200 dark:border-gray-700`}>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{stat.label}</p>
              <p className={`text-2xl font-black mt-1 ${stat.text}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === tab.key
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar servicio..."
                className="pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 w-64"
              />
            </div>
            <AddButtonDropdown
                label="Nuevo servicio"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de servicio"
              />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
            <div className="max-w-sm mx-auto">
              <div className="w-16 h-16 bg-cyan-100 dark:bg-cyan-900/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <SprayCan className="w-8 h-8 text-cyan-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Sin servicios registrados</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Crea tu primer servicio de limpieza para empezar a gestionar tu agenda.
              </p>
              <button onClick={openCreate} className="px-6 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold text-sm flex items-center gap-2 mx-auto transition-colors">
                <Plus className="w-4 h-4" /> Crear primer servicio
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((svc) => {
              const cfg = STATUS_CONFIG[svc.status];
              const type = CLEANING_TYPES.find(t => t.value === svc.cleaningType);
              return (
                <div key={svc._id} onClick={() => setDetailService(svc)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-cyan-300 dark:hover:border-cyan-700 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/30 rounded-xl flex items-center justify-center shrink-0">
                        <SprayCan className="w-5 h-5 text-cyan-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{svc.clientName}</p>
                          <span className="text-xs text-gray-400">{svc.serviceNumber}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1 text-xs text-gray-500"><MapPin className="w-3 h-3" />{svc.address}</span>
                          <span className="flex items-center gap-1 text-xs text-gray-500"><Calendar className="w-3 h-3" />{svc.date}</span>
                          {svc.time && <span className="flex items-center gap-1 text-xs text-gray-500"><Clock className="w-3 h-3" />{svc.time}</span>}
                          {svc.assignedToName && <span className="flex items-center gap-1 text-xs text-gray-500"><User className="w-3 h-3" />{svc.assignedToName}</span>}
                          {type && <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">{type.label}</span>}
                          {svc.price > 0 && <span className="flex items-center gap-1 text-xs text-gray-500"><DollarSign className="w-3 h-3" />{svc.price}€</span>}
                          {svc.status === 'completed' && (() => {
                            const bs = BILLING_STATUS_BADGE[(svc as any).billingStatus || 'unbilled'];
                            return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${bs.bg} ${bs.text}`}>{bs.label}</span>;
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {svc.status === 'completed' && (!(svc as any).billingStatus || (svc as any).billingStatus === 'unbilled') && (
                        <button onClick={(e) => { e.stopPropagation(); navigate('/saas/cleaning-billing'); }} title="Ir a facturación" className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-400 hover:text-emerald-600 transition-colors"><Receipt className="w-4 h-4" /></button>
                      )}
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Create/Edit Modal ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {editingService ? 'Editar servicio' : 'Nuevo servicio de limpieza'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Client info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Cliente *</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="Nombre del cliente" className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Teléfono</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input value={form.clientPhone} onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))} placeholder="Teléfono" className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input value={form.clientEmail} onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))} placeholder="Email" className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Dirección *</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Dirección" className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                  </div>
                </div>
              </div>

              {/* Service details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Tipo cliente</label>
                  <select value={form.clientType} onChange={e => setForm(f => ({ ...f, clientType: e.target.value }))} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    {CLIENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Fecha *</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Hora</label>
                  <input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Duración (h)</label>
                  <input type="number" min="0.5" step="0.5" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Tipo limpieza</label>
                  <select value={form.cleaningType} onChange={e => handleCleaningTypeChange(e.target.value)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    {CLEANING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Empleado asignado</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input value={form.assignedToName} onChange={e => setForm(f => ({ ...f, assignedToName: e.target.value }))} placeholder="Nombre empleado" className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Precio (€)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                  </div>
                </div>
              </div>

              {/* Priority, Zone, Recurrence */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Prioridad</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as 'normal' | 'urgent' }))} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Zona</label>
                  <input value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))} placeholder="Ej: Centro, Norte..." className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Recurrencia</label>
                  <select value={form.recurrenceType} onChange={e => setForm(f => ({ ...f, recurrenceType: e.target.value as any }))} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    {RECURRENCE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>
              {(form.recurrenceType === 'weekly' || form.recurrenceType === 'biweekly') && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Días de la semana</label>
                  <div className="flex gap-1.5">
                    {DAY_LABELS.map((label, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setForm(f => ({
                          ...f,
                          recurrenceDays: f.recurrenceDays.includes(idx)
                            ? f.recurrenceDays.filter(d => d !== idx)
                            : [...f.recurrenceDays, idx].sort(),
                        }))}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                          form.recurrenceDays.includes(idx)
                            ? 'bg-cyan-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {form.recurrenceType !== 'none' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Fin de recurrencia (opcional)</label>
                  <input type="date" value={form.recurrenceEndDate} onChange={e => setForm(f => ({ ...f, recurrenceEndDate: e.target.value }))} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
              )}

              {/* Tasks */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Tareas del checklist</label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {form.tasks.map((task, idx) => (
                    <div key={task.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={task.label}
                        onChange={e => {
                          const updated = [...form.tasks];
                          updated[idx] = { ...task, label: e.target.value };
                          setForm(f => ({ ...f, tasks: updated }));
                        }}
                        className="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                      <button
                        onClick={() => setForm(f => ({ ...f, tasks: f.tasks.filter((_, i) => i !== idx) }))}
                        className="p-1 text-gray-400 hover:text-red-500"
                      ><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setForm(f => ({ ...f, tasks: [...f.tasks, { id: `t${Date.now()}`, label: '', done: false }] }))}
                  className="mt-2 text-xs text-cyan-600 hover:text-cyan-700 font-semibold flex items-center gap-1"
                ><Plus className="w-3 h-3" /> Añadir tarea</button>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Notas</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Observaciones..." className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex items-center justify-end gap-2 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingService ? 'Guardar cambios' : 'Crear servicio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Detail Modal ─── */}
      {detailService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetailService(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{detailService.clientName}</h2>
                <p className="text-xs text-gray-400">{detailService.serviceNumber}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { openEdit(detailService); setDetailService(null); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(detailService)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={() => setDetailService(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {/* Status + actions */}
              <div className="flex items-center gap-2 flex-wrap">
                {(Object.keys(STATUS_CONFIG) as CleaningServiceStatus[]).filter(s => s !== 'cancelled').map(status => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(detailService, status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      detailService.status === status
                        ? `${STATUS_CONFIG[status].bg} ${STATUS_CONFIG[status].text} border-current`
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {STATUS_CONFIG[status].label}
                  </button>
                ))}
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0" />{detailService.address}
                </div>
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                  <Calendar className="w-4 h-4 text-gray-400 shrink-0" />{detailService.date} {detailService.time}
                </div>
                {detailService.clientPhone && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    <Phone className="w-4 h-4 text-gray-400 shrink-0" />{detailService.clientPhone}
                  </div>
                )}
                {detailService.assignedToName && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    <User className="w-4 h-4 text-gray-400 shrink-0" />{detailService.assignedToName}
                  </div>
                )}
                {detailService.price > 0 && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    <DollarSign className="w-4 h-4 text-gray-400 shrink-0" />{detailService.price}€
                  </div>
                )}
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                  <SprayCan className="w-4 h-4 text-gray-400 shrink-0" />{CLEANING_TYPES.find(t => t.value === detailService.cleaningType)?.label || detailService.cleaningType}
                </div>
              </div>

              {/* Tasks checklist */}
              {detailService.tasks.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Checklist</h4>
                  <div className="space-y-1">
                    {detailService.tasks.map((task: any) => (
                      <label key={task.id} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={task.done}
                          onChange={async () => {
                            const updatedTasks = detailService.tasks.map((t: any) =>
                              t.id === task.id ? { ...t, done: !t.done } : t
                            );
                            try {
                              const updated = await updateCleaningServiceRequest(user!.id, { ...detailService, tasks: updatedTasks } as CleaningService);
                              setServices(prev => prev.map(s => s._id === updated._id ? updated : s));
                              setDetailService(updated);
                            } catch {}
                          }}
                          className="rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                        />
                        <span className={`text-sm ${task.done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>{task.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {detailService.tasks.filter((t: any) => t.done).length}/{detailService.tasks.length} completadas
                  </p>
                </div>
              )}

              {/* Notes */}
              {detailService.notes && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Notas</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">{detailService.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="cleaning_services"
        moduleLabel="Servicios"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Servicios"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
