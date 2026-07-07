import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useModalClose } from '../../hooks/useModalClose';
import {
  listServiceContractsRequest,
  createServiceContractRequest,
  updateServiceContractRequest,
  deleteServiceContractRequest,
  activateContractRequest,
  pauseContractRequest,
  cancelContractRequest,
  renewContractRequest,
  getContractStatsRequest,
  type ServiceContract,
  type ServiceContractStatus,
  type ServiceFrequency,
  type PricingModel,
  type ServiceClientType,
  type ServiceScheduleSlot,
  type ServiceContractStats,
  FREQUENCY_LABELS,
  CLIENT_TYPE_LABELS,
  CONTRACT_STATUS_LABELS,
  PRICING_MODEL_LABELS,
  DAY_LABELS,
  formatScheduleSummary,
  formatPrice,
} from '../../lib/serviceContractsApi';
import {
  FileStack, Plus, Search, X, Edit3, Trash2, Play, Pause, RotateCcw, Ban,
  MapPin, Clock, Euro, User, Calendar, AlertTriangle, CheckCircle, Loader2,
  ChevronRight, Filter, Download, MoreHorizontal, Building2, Phone, Mail,
  CalendarRange, Package, Users, TrendingUp,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

const STATUS_CONFIG: Record<ServiceContractStatus, { label: string; bg: string; text: string; border: string }> = {
  draft:           { label: 'Borrador',    bg: 'bg-gray-50 dark:bg-gray-800',     text: 'text-gray-600 dark:text-gray-400',     border: 'border-gray-200 dark:border-gray-700' },
  active:          { label: 'Activo',      bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
  paused:          { label: 'Pausado',     bg: 'bg-amber-50 dark:bg-amber-950',   text: 'text-amber-700 dark:text-amber-400',   border: 'border-amber-200 dark:border-amber-800' },
  pending_renewal: { label: 'Por renovar', bg: 'bg-orange-50 dark:bg-orange-950', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800' },
  expired:         { label: 'Vencido',     bg: 'bg-red-50 dark:bg-red-950',       text: 'text-red-700 dark:text-red-400',       border: 'border-red-200 dark:border-red-800' },
  cancelled:       { label: 'Cancelado',   bg: 'bg-gray-100 dark:bg-gray-900',    text: 'text-gray-500 dark:text-gray-500',     border: 'border-gray-300 dark:border-gray-700' },
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

const CLIENT_TYPES: { value: ServiceClientType; label: string }[] = [
  { value: 'office', label: 'Oficina' }, { value: 'community', label: 'Comunidad' },
  { value: 'shop', label: 'Tienda' }, { value: 'warehouse', label: 'Nave' },
  { value: 'gym', label: 'Gimnasio' }, { value: 'home', label: 'Domicilio' },
  { value: 'post_construction', label: 'Final de obra' }, { value: 'restaurant', label: 'Restaurante' },
  { value: 'clinic', label: 'Clínica' }, { value: 'hotel', label: 'Hotel' },
  { value: 'school', label: 'Centro educativo' }, { value: 'other', label: 'Otro' },
];

const FREQUENCIES: { value: ServiceFrequency; label: string }[] = [
  { value: 'daily', label: 'Diario (L-V)' }, { value: 'daily_all', label: 'Diario (L-D)' },
  { value: 'weekly_1', label: '1×/semana' }, { value: 'weekly_2', label: '2×/semana' },
  { value: 'weekly_3', label: '3×/semana' }, { value: 'weekly_4', label: '4×/semana' },
  { value: 'weekly_5', label: '5×/semana' }, { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' }, { value: 'on_demand', label: 'Bajo demanda' },
];

const DAYS: { value: string; label: string }[] = [
  { value: 'mon', label: 'Lunes' }, { value: 'tue', label: 'Martes' },
  { value: 'wed', label: 'Miércoles' }, { value: 'thu', label: 'Jueves' },
  { value: 'fri', label: 'Viernes' }, { value: 'sat', label: 'Sábado' },
  { value: 'sun', label: 'Domingo' },
];

interface ContractForm {
  clientName: string; clientPhone: string; clientEmail: string; clientType: ServiceClientType;
  address: string; city: string; postalCode: string; zone: string;
  cleaningType: string; frequency: ServiceFrequency;
  scheduleDays: ServiceScheduleSlot[]; contractedHoursPerVisit: string;
  pricingModel: PricingModel; monthlyPrice: string; pricePerService: string; pricePerHour: string;
  taxRate: string; taxIncluded: boolean;
  assignedWorkerName: string; backupWorkerName: string;
  materials: string; materialsIncluded: boolean;
  startDate: string; endDate: string; autoRenew: boolean; renewalNoticeDays: string;
  observations: string; clientInstructions: string;
  billingEnabled: boolean; billingDay: string;
}

const emptyForm = (): ContractForm => ({
  clientName: '', clientPhone: '', clientEmail: '', clientType: 'office',
  address: '', city: '', postalCode: '', zone: '',
  cleaningType: 'general', frequency: 'weekly_3',
  scheduleDays: [], contractedHoursPerVisit: '3',
  pricingModel: 'monthly', monthlyPrice: '', pricePerService: '', pricePerHour: '',
  taxRate: '21', taxIncluded: false,
  assignedWorkerName: '', backupWorkerName: '',
  materials: '', materialsIncluded: true,
  startDate: new Date().toISOString().slice(0, 10), endDate: '', autoRenew: false, renewalNoticeDays: '30',
  observations: '', clientInstructions: '',
  billingEnabled: false, billingDay: '1',
});

export function ServiceContractsPage() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<ServiceContract[]>([]);
  const [stats, setStats] = useState<ServiceContractStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ServiceContractStatus>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingContract, setEditingContract] = useState<ServiceContract | null>(null);
  const [form, setForm] = useState<ContractForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'contracts' | 'calendar' | 'services'>('contracts');
    useModalClose(showModal, () => setShowModal(false));

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [contractsData, statsData] = await Promise.all([
        listServiceContractsRequest(user.id),
        getContractStatsRequest(user.id),
      ]);
      setContracts(contractsData);
      setStats(statsData);
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar contratos');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    let list = contracts;
    if (statusFilter !== 'all') list = list.filter(c => c.contractStatus === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.clientName.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        c.contractNumber.toLowerCase().includes(q) ||
        c.assignedWorkerName.toLowerCase().includes(q) ||
        c.zone.toLowerCase().includes(q)
      );
    }
    return list;
  }, [contracts, statusFilter, search]);

  const openCreate = () => {
    setEditingContract(null);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (c: ServiceContract) => {
    setEditingContract(c);
    setForm({
      clientName: c.clientName, clientPhone: c.clientPhone, clientEmail: c.clientEmail,
      clientType: c.clientType, address: c.address, city: c.city, postalCode: c.postalCode,
      zone: c.zone, cleaningType: c.cleaningType, frequency: c.frequency,
      scheduleDays: c.scheduleDays, contractedHoursPerVisit: String(c.contractedHoursPerVisit || ''),
      pricingModel: c.pricingModel, monthlyPrice: String(c.monthlyPrice || ''),
      pricePerService: String(c.pricePerService || ''), pricePerHour: String(c.pricePerHour || ''),
      taxRate: String(c.taxRate), taxIncluded: c.taxIncluded,
      assignedWorkerName: c.assignedWorkerName, backupWorkerName: c.backupWorkerName,
      materials: c.materials.join(', '), materialsIncluded: c.materialsIncluded,
      startDate: c.startDate, endDate: c.endDate, autoRenew: c.autoRenew,
      renewalNoticeDays: String(c.renewalNoticeDays),
      observations: c.observations, clientInstructions: c.clientInstructions,
      billingEnabled: c.billingEnabled, billingDay: String(c.billingDay),
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!user?.id || !form.clientName.trim()) {
      toast.error('El nombre del cliente es obligatorio');
      return;
    }
    setSaving(true);
    try {
      const data: Partial<ServiceContract> = {
        clientName: form.clientName.trim(),
        clientPhone: form.clientPhone.trim(),
        clientEmail: form.clientEmail.trim(),
        clientType: form.clientType,
        address: form.address.trim(),
        city: form.city.trim(),
        postalCode: form.postalCode.trim(),
        zone: form.zone.trim(),
        cleaningType: form.cleaningType,
        frequency: form.frequency,
        scheduleDays: form.scheduleDays,
        contractedHoursPerVisit: Number(form.contractedHoursPerVisit) || 0,
        pricingModel: form.pricingModel,
        monthlyPrice: Number(form.monthlyPrice) || 0,
        pricePerService: Number(form.pricePerService) || 0,
        pricePerHour: Number(form.pricePerHour) || 0,
        taxRate: Number(form.taxRate) || 21,
        taxIncluded: form.taxIncluded,
        assignedWorkerName: form.assignedWorkerName.trim(),
        backupWorkerName: form.backupWorkerName.trim(),
        materials: form.materials.split(',').map(m => m.trim()).filter(Boolean),
        materialsIncluded: form.materialsIncluded,
        startDate: form.startDate,
        endDate: form.endDate,
        autoRenew: form.autoRenew,
        renewalNoticeDays: Number(form.renewalNoticeDays) || 30,
        observations: form.observations.trim(),
        clientInstructions: form.clientInstructions.trim(),
        billingEnabled: form.billingEnabled,
        billingDay: Number(form.billingDay) || 1,
      };
      if (editingContract) {
        await updateServiceContractRequest(user.id, { ...editingContract, ...data } as ServiceContract);
        toast.success('Contrato actualizado');
      } else {
        await createServiceContractRequest(user.id, data);
        toast.success('Contrato creado');
      }
      setShowModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (contract: ServiceContract, action: string) => {
    if (!user?.id) return;
    try {
      switch (action) {
        case 'activate': await activateContractRequest(user.id, contract._id); toast.success('Contrato activado'); break;
        case 'pause': await pauseContractRequest(user.id, contract._id); toast.success('Contrato pausado'); break;
        case 'cancel': await cancelContractRequest(user.id, contract._id); toast.success('Contrato cancelado'); break;
        case 'renew': await renewContractRequest(user.id, contract._id); toast.success('Contrato renovado'); break;
        case 'delete':
          if (!confirm('¿Eliminar este contrato?')) return;
          await deleteServiceContractRequest(user.id, contract._id);
          toast.success('Contrato eliminado');
          break;
      }
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error en la acción');
    }
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: contracts.length };
    for (const c of contracts) counts[c.contractStatus] = (counts[c.contractStatus] || 0) + 1;
    return counts;
  }, [contracts]);

  return (
    <Layout title="Servicios y Contratos" subtitle="Controla qué servicio se presta, dónde, con qué frecuencia y por cuánto dinero">
      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <KpiCard icon={<FileStack className="w-5 h-5 text-emerald-600" />} label="Contratos activos" value={stats.active} />
          <KpiCard icon={<CalendarRange className="w-5 h-5 text-blue-600" />} label="Total contratos" value={stats.total} />
          <KpiCard icon={<Euro className="w-5 h-5 text-violet-600" />} label="Facturación mensual est." value={`${stats.estimatedMonthlyRevenue.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`} />
          <KpiCard icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} label="Por renovar" value={stats.pendingRenewal} alert={stats.pendingRenewal > 0} />
          <KpiCard icon={<Pause className="w-5 h-5 text-gray-500" />} label="Pausados" value={stats.paused} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {[
          { key: 'contracts', label: 'Contratos' },
          { key: 'calendar', label: 'Calendario' },
          { key: 'services', label: 'Servicios' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'contracts' && (
        <div>
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por cliente, dirección, contrato, trabajador..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
            >
              <option value="all">Todos ({statusCounts.all || 0})</option>
              {(Object.keys(STATUS_CONFIG) as ServiceContractStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label} ({statusCounts[s] || 0})</option>
              ))}
            </select>
            <AddButtonDropdown
                label="Nuevo contrato"
                onQuickAdd={openCreate}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de contrato"
              />
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400">
              <FileStack className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-lg font-medium">No hay contratos</p>
              <p className="text-sm mt-1">Crea tu primer contrato de servicio para empezar</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">#</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Cliente</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Ubicación</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Frecuencia</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Horario</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Precio</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Trabajador</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Estado</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filtered.map(c => {
                    const sc = STATUS_CONFIG[c.contractStatus] || STATUS_CONFIG.draft;
                    const clientType = CLIENT_TYPES.find(t => t.value === c.clientType);
                    return (
                      <tr key={c._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.contractNumber}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-white">{c.clientName}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${sc.bg} ${sc.text}`}>
                              {clientType?.label || c.clientType}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate max-w-[200px]">{c.address}</span>
                          </div>
                          {c.zone && <div className="text-xs text-gray-400 mt-0.5">{c.zone}</div>}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-gray-600 dark:text-gray-400">
                          {FREQUENCIES.find(f => f.value === c.frequency)?.label || c.frequency}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-gray-600 dark:text-gray-400 text-xs">
                          {formatScheduleSummary(c.scheduleDays)}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                          {formatPrice(c)}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {c.assignedWorkerName ? (
                            <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                              <User className="w-3.5 h-3.5" />
                              <span className="text-sm">{c.assignedWorkerName}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-red-500 font-medium">Sin asignar</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${sc.bg} ${sc.text} border ${sc.border}`}>
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Editar">
                              <Edit3 className="w-4 h-4 text-gray-500" />
                            </button>
                            {c.contractStatus === 'draft' && (
                              <button onClick={() => handleAction(c, 'activate')} className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors" title="Activar">
                                <Play className="w-4 h-4 text-emerald-600" />
                              </button>
                            )}
                            {c.contractStatus === 'active' && (
                              <button onClick={() => handleAction(c, 'pause')} className="p-1.5 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors" title="Pausar">
                                <Pause className="w-4 h-4 text-amber-600" />
                              </button>
                            )}
                            {(c.contractStatus === 'expired' || c.contractStatus === 'pending_renewal') && (
                              <button onClick={() => handleAction(c, 'renew')} className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Renovar">
                                <RotateCcw className="w-4 h-4 text-blue-600" />
                              </button>
                            )}
                            {c.contractStatus !== 'cancelled' && (
                              <button onClick={() => handleAction(c, 'cancel')} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Cancelar">
                                <Ban className="w-4 h-4 text-red-500" />
                              </button>
                            )}
                            <button onClick={() => handleAction(c, 'delete')} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Eliminar">
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'calendar' && (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <CalendarRange className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Calendario de servicios</p>
          <p className="text-sm mt-1">Próximamente — vista semanal y mensual de servicios generados</p>
        </div>
      )}

      {activeTab === 'services' && (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Servicios individuales</p>
          <p className="text-sm mt-1">Próximamente — lista de servicios generados desde contratos</p>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[5vh] bg-black/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900 z-10">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingContract ? 'Editar contrato' : 'Nuevo contrato de servicio'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-5">
              {/* Cliente */}
              <Section title="Cliente y ubicación">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Nombre del cliente *" value={form.clientName} onChange={v => setForm(f => ({ ...f, clientName: v }))} />
                  <Select label="Tipo de cliente" value={form.clientType} onChange={v => setForm(f => ({ ...f, clientType: v as ServiceClientType }))} options={CLIENT_TYPES} />
                  <Input label="Teléfono" value={form.clientPhone} onChange={v => setForm(f => ({ ...f, clientPhone: v }))} />
                  <Input label="Email" value={form.clientEmail} onChange={v => setForm(f => ({ ...f, clientEmail: v }))} type="email" />
                  <Input label="Dirección" value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} className="sm:col-span-2" />
                  <Input label="Ciudad" value={form.city} onChange={v => setForm(f => ({ ...f, city: v }))} />
                  <Input label="Código postal" value={form.postalCode} onChange={v => setForm(f => ({ ...f, postalCode: v }))} />
                  <Input label="Zona" value={form.zone} onChange={v => setForm(f => ({ ...f, zone: v }))} placeholder="Ej: Centro, Norte..." />
                </div>
              </Section>

              {/* Servicio */}
              <Section title="Servicio y frecuencia">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select label="Tipo de limpieza" value={form.cleaningType} onChange={v => setForm(f => ({ ...f, cleaningType: v }))} options={CLEANING_TYPES} />
                  <Select label="Frecuencia" value={form.frequency} onChange={v => setForm(f => ({ ...f, frequency: v as ServiceFrequency }))} options={FREQUENCIES} />
                  <Input label="Horas por visita" value={form.contractedHoursPerVisit} onChange={v => setForm(f => ({ ...f, contractedHoursPerVisit: v }))} type="number" />
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Días y horarios</label>
                  <div className="space-y-2">
                    {form.scheduleDays.map((slot, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={slot.day}
                          onChange={e => {
                            const updated = [...form.scheduleDays];
                            updated[idx] = { ...slot, day: e.target.value as any };
                            setForm(f => ({ ...f, scheduleDays: updated }));
                          }}
                          className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                        >
                          {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </select>
                        <input
                          type="time" value={slot.startTime}
                          onChange={e => { const u = [...form.scheduleDays]; u[idx] = { ...slot, startTime: e.target.value }; setForm(f => ({ ...f, scheduleDays: u })); }}
                          className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                        />
                        <span className="text-gray-400">—</span>
                        <input
                          type="time" value={slot.endTime}
                          onChange={e => { const u = [...form.scheduleDays]; u[idx] = { ...slot, endTime: e.target.value }; setForm(f => ({ ...f, scheduleDays: u })); }}
                          className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                        />
                        <button onClick={() => setForm(f => ({ ...f, scheduleDays: f.scheduleDays.filter((_, i) => i !== idx) }))} className="p-1 hover:bg-red-50 rounded">
                          <X className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setForm(f => ({ ...f, scheduleDays: [...f.scheduleDays, { day: 'mon', startTime: '09:00', endTime: '12:00' }] }))}
                      className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      + Añadir día
                    </button>
                  </div>
                </div>
              </Section>

              {/* Precio */}
              <Section title="Precio y facturación">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Modelo de precio</label>
                    <div className="flex gap-2">
                      {[
                        { value: 'monthly', label: 'Mensual' },
                        { value: 'per_service', label: 'Por servicio' },
                        { value: 'per_hour', label: 'Por hora' },
                      ].map(pm => (
                        <button
                          key={pm.value}
                          onClick={() => setForm(f => ({ ...f, pricingModel: pm.value as PricingModel }))}
                          className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border transition-colors ${
                            form.pricingModel === pm.value
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          {pm.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.pricingModel === 'monthly' && (
                    <Input label="Precio mensual (€)" value={form.monthlyPrice} onChange={v => setForm(f => ({ ...f, monthlyPrice: v }))} type="number" placeholder="0.00" />
                  )}
                  {form.pricingModel === 'per_service' && (
                    <Input label="Precio por servicio (€)" value={form.pricePerService} onChange={v => setForm(f => ({ ...f, pricePerService: v }))} type="number" placeholder="0.00" />
                  )}
                  {form.pricingModel === 'per_hour' && (
                    <Input label="Precio por hora (€)" value={form.pricePerHour} onChange={v => setForm(f => ({ ...f, pricePerHour: v }))} type="number" placeholder="0.00" />
                  )}
                  <Input label="IVA (%)" value={form.taxRate} onChange={v => setForm(f => ({ ...f, taxRate: v }))} type="number" />
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 sm:col-span-2">
                    <input type="checkbox" checked={form.billingEnabled} onChange={e => setForm(f => ({ ...f, billingEnabled: e.target.checked }))} className="rounded border-gray-300" />
                    Facturación automática
                  </label>
                </div>
              </Section>

              {/* Asignación */}
              <Section title="Asignación y materiales">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Trabajador asignado" value={form.assignedWorkerName} onChange={v => setForm(f => ({ ...f, assignedWorkerName: v }))} placeholder="Nombre del trabajador" />
                  <Input label="Trabajador suplente" value={form.backupWorkerName} onChange={v => setForm(f => ({ ...f, backupWorkerName: v }))} placeholder="(Opcional)" />
                  <Input label="Materiales necesarios" value={form.materials} onChange={v => setForm(f => ({ ...f, materials: v }))} placeholder="Ej: lejía, fregona, trapos..." className="sm:col-span-2" />
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={form.materialsIncluded} onChange={e => setForm(f => ({ ...f, materialsIncluded: e.target.checked }))} className="rounded border-gray-300" />
                    La empresa aporta los materiales
                  </label>
                </div>
              </Section>

              {/* Contrato */}
              <Section title="Duración del contrato">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Fecha de inicio" value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} type="date" />
                  <Input label="Fecha de fin (vacío = indefinido)" value={form.endDate} onChange={v => setForm(f => ({ ...f, endDate: v }))} type="date" />
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={form.autoRenew} onChange={e => setForm(f => ({ ...f, autoRenew: e.target.checked }))} className="rounded border-gray-300" />
                    Renovación automática
                  </label>
                  <Input label="Días aviso antes de vencimiento" value={form.renewalNoticeDays} onChange={v => setForm(f => ({ ...f, renewalNoticeDays: v }))} type="number" />
                </div>
              </Section>

              {/* Notas */}
              <Section title="Observaciones">
                <Textarea label="Observaciones internas" value={form.observations} onChange={v => setForm(f => ({ ...f, observations: v }))} placeholder="Notas internas sobre el contrato..." />
                <Textarea label="Instrucciones del cliente" value={form.clientInstructions} onChange={v => setForm(f => ({ ...f, clientInstructions: v }))} placeholder="Instrucciones específicas para el servicio..." />
              </Section>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-900">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingContract ? 'Guardar cambios' : 'Crear contrato'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, alert }: { icon: React.ReactNode; label: string; value: string | number; alert?: boolean }) {
  return (
    <div className={`p-4 rounded-xl border ${alert ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'}`}>
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-gray-500 dark:text-gray-400">{label}</span></div>
      <div className="text-xl font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder, className = '' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Textarea({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="mt-3">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      <textarea
        value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2}
        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
      />
    </div>
  );
}
