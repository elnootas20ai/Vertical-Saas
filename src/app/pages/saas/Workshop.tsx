import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { Tabs } from '../../components/saas/Tabs';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { useAuth } from '../../context/AuthContext';
import {
  listWorkOrdersRequest,
  createWorkOrderRequest,
  updateWorkOrderRequest,
  deleteWorkOrderRequest,
  type WorkOrder,
  type WorkOrderStatus,
  type WorkOrderPriority,
  type WorkOrderServiceType,
} from '../../lib/workshopApi';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import {
  Plus,
  Wrench,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Trash2,
  Timer,
  BarChart3,
  Search,
  FileText,
  X,
  Play,
  Square,
  LayoutDashboard,
  Car,
  User,
  History,
  ReceiptText,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import { generateWorkshopInvoicePdf } from '../../lib/workshopPdfGenerator';

// ─── Status/Priority configs ─────────────────────────────────────────────────

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; badgeClass: string }> = {
  pending: { label: 'Pendiente', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200' },
  in_progress: { label: 'En curso', badgeClass: 'bg-blue-100 text-blue-700 border-blue-200' },
  completed: { label: 'Completada', badgeClass: 'bg-green-100 text-green-700 border-green-200' },
  invoiced: { label: 'Facturada', badgeClass: 'bg-purple-100 text-purple-700 border-purple-200' },
  cancelled: { label: 'Cancelada', badgeClass: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700' },
};

const PRIORITY_CONFIG: Record<WorkOrderPriority, { label: string; badgeClass: string; dot: string }> = {
  low: { label: 'Baja', badgeClass: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400', dot: 'bg-gray-400' },
  normal: { label: 'Normal', badgeClass: 'bg-blue-100 text-blue-600', dot: 'bg-blue-500' },
  high: { label: 'Alta', badgeClass: 'bg-orange-100 text-orange-600', dot: 'bg-orange-500' },
  urgent: { label: 'Urgente', badgeClass: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
};

const SERVICE_LABELS: Record<WorkOrderServiceType, string> = {
  revision: 'Revisión',
  reparacion: 'Reparación',
  mantenimiento: 'Mantenimiento',
  puesta_punto: 'Puesta a punto',
  garantia: 'Garantía',
  otro: 'Otro',
};

// ─── Create Modal ─────────────────────────────────────────────────────────────

interface CreateWorkOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: Partial<WorkOrder>) => void;
  mechanics: string[];
}

function CreateWorkOrderModal({ isOpen, onClose, onCreate, mechanics }: CreateWorkOrderModalProps) {
  const [form, setForm] = useState({
    vehicleBrand: '',
    vehicleModel: '',
    vehiclePlate: '',
    vehicleMileage: '',
    clientName: '',
    clientPhone: '',
    serviceType: 'revision' as WorkOrderServiceType,
    priority: 'normal' as WorkOrderPriority,
    description: '',
    responsible: '',
    estimatedCompletion: '',
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehiclePlate.trim() && !form.clientName.trim()) {
      toast.error('Indica al menos la matrícula o el cliente');
      return;
    }
    onCreate({
      ...form,
      vehicleMileage: form.vehicleMileage ? Number(form.vehicleMileage) : undefined,
      status: 'pending',
      laborItems: [],
      materialItems: [],
      timeEntries: [],
      photos: [],
      stageHistory: [{ status: 'pending', date: new Date().toISOString(), user: 'Sistema', notes: 'OT creada' }],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Nueva orden de trabajo</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Crea una nueva OT para el taller</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Marca vehículo</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="BMW, Audi, Ford..."
                value={form.vehicleBrand}
                onChange={e => setForm(f => ({ ...f, vehicleBrand: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Modelo</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Serie 3, A4, Focus..."
                value={form.vehicleModel}
                onChange={e => setForm(f => ({ ...f, vehicleModel: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Matrícula</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono uppercase"
                placeholder="1234-ABC"
                value={form.vehiclePlate}
                onChange={e => setForm(f => ({ ...f, vehiclePlate: e.target.value.toUpperCase() }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Kilómetros</label>
              <input
                type="number"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="125.000"
                value={form.vehicleMileage}
                onChange={e => setForm(f => ({ ...f, vehicleMileage: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Cliente</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Nombre del cliente"
                value={form.clientName}
                onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Teléfono</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="600 000 000"
                value={form.clientPhone}
                onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo de servicio</label>
              <select
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                value={form.serviceType}
                onChange={e => setForm(f => ({ ...f, serviceType: e.target.value as WorkOrderServiceType }))}
              >
                {Object.entries(SERVICE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Prioridad</label>
              <select
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value as WorkOrderPriority }))}
              >
                {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Mecánico responsable</label>
              {mechanics.length > 0 ? (
                <select
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  value={form.responsible}
                  onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))}
                >
                  <option value="">Sin asignar</option>
                  {mechanics.map((mechanic) => (
                    <option key={mechanic} value={mechanic}>
                      {mechanic}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="Nombre del mecánico"
                  value={form.responsible}
                  onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))}
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Descripción del trabajo</label>
            <textarea
              rows={3}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
              placeholder="Describe el trabajo a realizar..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha estimada de entrega</label>
            <input
              type="date"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              value={form.estimatedCompletion}
              onChange={e => setForm(f => ({ ...f, estimatedCompletion: e.target.value }))}
            />
          </div>

          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-colors"
            >
              Crear orden de trabajo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Workshop() {
  const navigate = useNavigate();
  const { user, listUsers } = useAuth();
  const { activeWorkCenters, hasWorkCenters } = useWorkCenters();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [mechanics, setMechanics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('orders');
  const [showCreate, setShowCreate] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<WorkOrderStatus | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<WorkOrderPriority | 'all'>('all');
  const [filterWorkCenter, setFilterWorkCenter] = useState<string>('all');
  const [vehicleHistoryPlate, setVehicleHistoryPlate] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<WorkOrderStatus | null>(null);

  useModalClose(showCreate, () => setShowCreate(false));
  useModalClose(showImportModal, () => setShowImportModal(false));

  const mechanicViewPath = '/mecanico';

  const WO_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'plate', label: 'Matrícula', required: true, example: '1234ABC' },
    { key: 'vehicleModel', label: 'Vehículo', example: 'Seat Ibiza' },
    { key: 'clientName', label: 'Cliente', example: 'Juan García' },
    { key: 'clientPhone', label: 'Teléfono', example: '600123456' },
    { key: 'serviceType', label: 'Tipo servicio', example: 'maintenance' },
    { key: 'description', label: 'Descripción', required: true, example: 'Revisión general y cambio de aceite' },
    { key: 'priority', label: 'Prioridad', example: 'medium' },
    { key: 'mechanic', label: 'Mecánico asignado', example: '' },
  ];

  const loadWorkOrders = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await listWorkOrdersRequest(user.id);
      setWorkOrders(data);
    } catch {
      toast.error('Error al cargar órdenes de trabajo');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const loadMechanics = useCallback(async () => {
    const stripAccents = (value: string) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normalizeRole = (role: string) => stripAccents(role).toLowerCase();
    const isWorkshopRole = (role: string) => {
      const normalized = normalizeRole(role);
      return normalized.includes('taller') || normalized.includes('mecanic') || normalized.includes('tecnic');
    };

    try {
      const users = await listUsers();
      const options = [...new Set(
        users
          .filter((member) => isWorkshopRole(String(member.role || '')))
          .map((member) => String(member.fullName || member.email || '').trim())
          .filter(Boolean),
      )].sort((a, b) => a.localeCompare(b, 'es'));
      setMechanics(options);
    } catch {
      setMechanics([]);
    }
  }, [listUsers]);

  useEffect(() => { loadWorkOrders(); }, [loadWorkOrders]);
  useEffect(() => { loadMechanics(); }, [loadMechanics]);

  const handleCreate = async (data: Partial<WorkOrder>) => {
    if (!user?.id) return;
    try {
      const created = await createWorkOrderRequest(user.id, data as Parameters<typeof createWorkOrderRequest>[1]);
      setWorkOrders(prev => [created, ...prev]);
      setShowCreate(false);
      toast.success(`OT ${created.woNumber} creada`);
      navigate(`/saas/workshop/${created._id}`);
    } catch {
      toast.error('Error al crear la orden de trabajo');
    }
  };

  const handleDelete = async (wo: WorkOrder) => {
    if (!user?.id) return;
    if (!confirm(`¿Eliminar la OT ${wo.woNumber}?`)) return;
    try {
      await deleteWorkOrderRequest(user.id, wo._id);
      setWorkOrders(prev => prev.filter(w => w._id !== wo._id));
      toast.success('Orden de trabajo eliminada');
    } catch {
      toast.error('Error al eliminar la orden de trabajo');
    }
  };

  const handleQuickInvoice = async (wo: WorkOrder) => {
    if (!user?.id) return;
    try {
      generateWorkshopInvoicePdf({ workOrder: wo });
      const updated = await updateWorkOrderRequest(user.id, {
        ...wo,
        status: 'invoiced',
        invoicedAt: new Date().toISOString(),
        stageHistory: [
          ...(wo.stageHistory || []),
          { status: 'invoiced', date: new Date().toISOString(), user: user.fullName || 'Sistema', notes: 'Factura generada desde lista' },
        ],
      });
      setWorkOrders(prev => prev.map(w => w._id === updated._id ? updated : w));
      toast.success(`Factura generada para ${wo.woNumber}`);
    } catch {
      toast.error('Error al generar la factura');
    }
  };

  const handleQuickStatus = async (wo: WorkOrder, status: WorkOrderStatus) => {
    if (!user?.id) return;
    try {
      const updated = await updateWorkOrderRequest(user.id, {
        ...wo,
        status,
        stageHistory: [
          ...(wo.stageHistory || []),
          { status, date: new Date().toISOString(), user: user.fullName || 'Sistema' },
        ],
      });
      setWorkOrders(prev => prev.map(w => w._id === updated._id ? updated : w));
      toast.success(`Estado actualizado a: ${STATUS_CONFIG[status].label}`);
    } catch {
      toast.error('Error al actualizar el estado');
    }
  };

  const handleOpenMechanicTab = () => {
    window.open(mechanicViewPath, '_blank', 'noopener,noreferrer');
  };

  const handleCopyMechanicLink = async () => {
    const shareUrl = `${window.location.origin}${mechanicViewPath}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Enlace de vista mecánico copiado');
    } catch {
      toast.error('No se pudo copiar el enlace');
    }
  };

  const filtered = useMemo(() => {
    return workOrders.filter(wo => {
      if (filterStatus !== 'all' && wo.status !== filterStatus) return false;
      if (filterPriority !== 'all' && wo.priority !== filterPriority) return false;
      if (filterWorkCenter !== 'all' && (wo as any).workCenterId !== filterWorkCenter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          wo.woNumber.toLowerCase().includes(q) ||
          wo.vehiclePlate.toLowerCase().includes(q) ||
          wo.vehicleBrand.toLowerCase().includes(q) ||
          wo.vehicleModel.toLowerCase().includes(q) ||
          wo.clientName.toLowerCase().includes(q) ||
          wo.responsible.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [workOrders, search, filterStatus, filterPriority, filterWorkCenter]);

  // KPIs
  const kpis = useMemo(() => ({
    pending: workOrders.filter(w => w.status === 'pending').length,
    inProgress: workOrders.filter(w => w.status === 'in_progress').length,
    completed: workOrders.filter(w => w.status === 'completed').length,
    urgent: workOrders.filter(w => w.priority === 'urgent' && w.status !== 'completed' && w.status !== 'invoiced' && w.status !== 'cancelled').length,
    totalRevenue: workOrders
      .filter(w => w.status === 'invoiced' || w.status === 'completed')
      .reduce((s, w) => s + w.totalCost, 0),
  }), [workOrders]);

  // Time tracking: active entries (no endTime)
  const activeTimeEntries = useMemo(() => {
    return workOrders.flatMap(wo =>
      wo.timeEntries
        .filter(te => !te.endTime)
        .map(te => ({ ...te, wo }))
    );
  }, [workOrders]);

  // ── Kanban drag & drop ────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, woId: string) => {
    e.dataTransfer.setData('woId', woId);
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: WorkOrderStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const woId = e.dataTransfer.getData('woId');
    const wo = workOrders.find(w => w._id === woId);
    if (!wo || wo.status === targetStatus || !user?.id) return;
    try {
      const updated = await updateWorkOrderRequest(user.id, {
        ...wo,
        status: targetStatus,
        stageHistory: [
          ...(wo.stageHistory || []),
          { status: targetStatus, date: new Date().toISOString(), user: user.fullName || 'Sistema' },
        ],
      });
      setWorkOrders(prev => prev.map(w => w._id === updated._id ? updated : w));
      toast.success(`OT movida a: ${STATUS_CONFIG[targetStatus].label}`);
    } catch {
      toast.error('Error al mover la OT');
    }
  };

  const KANBAN_COLUMNS: { status: WorkOrderStatus; label: string; color: string; headerBg: string; bg: string }[] = [
    { status: 'pending',     label: 'Pendiente',  color: 'text-amber-700',  headerBg: 'bg-amber-50 border-amber-200',  bg: 'bg-amber-50/50' },
    { status: 'in_progress', label: 'En curso',   color: 'text-blue-700',   headerBg: 'bg-blue-50 border-blue-200',    bg: 'bg-blue-50/50' },
    { status: 'completed',   label: 'Completada', color: 'text-green-700',  headerBg: 'bg-green-50 border-green-200',  bg: 'bg-green-50/50' },
    { status: 'invoiced',    label: 'Facturada',  color: 'text-purple-700', headerBg: 'bg-purple-50 border-purple-200', bg: 'bg-purple-50/50' },
  ];

  const renderKanban = () => (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[calc(100vh-280px)]">
      {KANBAN_COLUMNS.map(col => {
        const colOrders = workOrders.filter(w => w.status === col.status);
        const isDragOver = dragOverColumn === col.status;
        return (
          <div
            key={col.status}
            className="flex-shrink-0 w-72 flex flex-col"
            onDragOver={e => { e.preventDefault(); setDragOverColumn(col.status); }}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={e => handleDrop(e, col.status)}
          >
            {/* Column header */}
            <div className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 mb-3 ${col.headerBg}`}>
              <div className="flex items-center gap-2">
                <span className={`font-bold text-sm ${col.color}`}>{col.label}</span>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${STATUS_CONFIG[col.status].badgeClass}`}>
                {colOrders.length}
              </span>
            </div>
            {/* Drop zone */}
            <div className={`flex-1 space-y-3 p-2 rounded-xl border-2 border-dashed transition-all min-h-24 ${
              isDragOver ? `border-current ${col.color} bg-current/5` : 'border-gray-200 dark:border-gray-700'
            } ${col.bg}`}>
              {colOrders.length === 0 && !isDragOver && (
                <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500 text-xs text-center">
                  <Wrench className="w-6 h-6 mb-1 opacity-30" />
                  Arrastra aquí
                </div>
              )}
              {colOrders.sort((a, b) => {
                const prio = { urgent: 0, high: 1, normal: 2, low: 3 };
                return prio[a.priority] - prio[b.priority];
              }).map(wo => (
                <div
                  key={wo._id}
                  draggable
                  onDragStart={e => handleDragStart(e, wo._id)}
                  className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-3 cursor-grab active:cursor-grabbing hover:border-gray-400 hover:shadow-md transition-all select-none"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-mono text-xs font-bold text-gray-900 dark:text-gray-100">{wo.woNumber}</div>
                    <div className="flex items-center gap-1">
                      {wo.priority === 'urgent' && <span className="text-xs text-red-600 font-bold">🚨</span>}
                      {wo.priority === 'high' && <span className="text-xs text-orange-500 font-bold">⚠️</span>}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${PRIORITY_CONFIG[wo.priority].badgeClass}`}>
                        {PRIORITY_CONFIG[wo.priority].label}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Car className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" />
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                      {wo.vehicleBrand} {wo.vehicleModel}
                    </span>
                  </div>
                  <div className="font-mono text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded inline-block mb-1.5">
                    {wo.vehiclePlate}
                  </div>
                  {wo.clientName && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 mb-1.5">
                      <User className="w-3 h-3" /> {wo.clientName}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{wo.responsible || '—'}</span>
                    <div className="flex items-center gap-1">
                      {wo.timeEntries.some(t => !t.endTime) && (
                        <span className="flex items-center gap-1 text-xs text-blue-600 font-semibold">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" /> En curso
                        </span>
                      )}
                      <button
                        onClick={() => navigate(`/saas/workshop/${wo._id}`)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                      </button>
                    </div>
                  </div>
                  {wo.totalCost > 0 && (
                    <div className="text-xs font-bold text-gray-900 dark:text-gray-100 text-right mt-1">
                      {wo.totalCost.toLocaleString('es-ES')}€
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── Historial por vehículo ────────────────────────────────────────────────
  const renderVehicleHistory = () => {
    const plates = [...new Set(workOrders.map(w => w.vehiclePlate).filter(Boolean))].sort();
    const historyOrders = vehicleHistoryPlate
      ? workOrders.filter(w => w.vehiclePlate === vehicleHistoryPlate).sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      : [];

    return (
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Seleccionar vehículo por matrícula
            </label>
            <select
              className="w-full sm:w-72 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none"
              value={vehicleHistoryPlate || ''}
              onChange={e => setVehicleHistoryPlate(e.target.value || null)}
            >
              <option value="">— Selecciona una matrícula —</option>
              {plates.map(p => {
                const wo = workOrders.find(w => w.vehiclePlate === p);
                return (
                  <option key={p} value={p}>
                    {p}{wo ? ` — ${wo.vehicleBrand} ${wo.vehicleModel}` : ''}
                  </option>
                );
              })}
            </select>
          </div>
          {vehicleHistoryPlate && (
            <button
              onClick={() => setVehicleHistoryPlate(null)}
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-1"
            >
              <X className="w-4 h-4" /> Limpiar
            </button>
          )}
        </div>

        {vehicleHistoryPlate && (
          <>
            {historyOrders.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <Car className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="font-semibold">Sin historial para {vehicleHistoryPlate}</p>
              </div>
            ) : (
              <>
                {/* Vehicle summary */}
                {(() => {
                  const firstWo = historyOrders[0];
                  const totalSpent = historyOrders.reduce((s, w) => s + w.totalCost, 0);
                  const totalHours = historyOrders.flatMap(w => w.laborItems).reduce((s, li) => s + li.hours, 0);
                  return (
                    <div className="p-5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center">
                          <Car className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 dark:text-gray-100 text-lg">
                            {firstWo.vehicleBrand} {firstWo.vehicleModel}
                          </div>
                          <div className="font-mono text-sm text-gray-500 dark:text-gray-400">{firstWo.vehiclePlate}</div>
                          {firstWo.clientName && <div className="text-sm text-gray-600 dark:text-gray-400">{firstWo.clientName}</div>}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-3 bg-blue-50 rounded-xl">
                          <div className="text-2xl font-bold text-blue-900">{historyOrders.length}</div>
                          <div className="text-xs text-blue-700">Intervenciones</div>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-xl">
                          <div className="text-2xl font-bold text-green-900">{totalHours.toFixed(1)}h</div>
                          <div className="text-xs text-green-700">Horas taller</div>
                        </div>
                        <div className="text-center p-3 bg-purple-50 rounded-xl">
                          <div className="text-2xl font-bold text-purple-900">{totalSpent.toLocaleString('es-ES')}€</div>
                          <div className="text-xs text-purple-700">Gasto total</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Timeline */}
                <div className="space-y-3">
                  {historyOrders.map((wo, idx) => (
                    <div
                      key={wo._id}
                      className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-gray-400 transition-colors cursor-pointer"
                      onClick={() => navigate(`/saas/workshop/${wo._id}`)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex flex-col items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                              wo.status === 'completed' || wo.status === 'invoiced' ? 'bg-green-600' :
                              wo.status === 'in_progress' ? 'bg-blue-600' : 'bg-amber-500'
                            }`}>
                              {historyOrders.length - idx}
                            </div>
                            {idx < historyOrders.length - 1 && (
                              <div className="w-0.5 h-6 bg-gray-200 mt-1" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{wo.woNumber}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_CONFIG[wo.status].badgeClass}`}>
                                {STATUS_CONFIG[wo.status].label}
                              </span>
                            </div>
                            <div className="text-sm text-gray-700 dark:text-gray-300">{wo.description}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {new Date(wo.createdAt).toLocaleDateString('es-ES', { dateStyle: 'long' })}
                              {wo.vehicleMileage ? ` · ${wo.vehicleMileage.toLocaleString('es-ES')} km` : ''}
                              {wo.responsible ? ` · ${wo.responsible}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {wo.totalCost > 0 && (
                            <div className="font-bold text-gray-900 dark:text-gray-100">{wo.totalCost.toLocaleString('es-ES')}€</div>
                          )}
                          <Eye className="w-4 h-4 text-gray-400 dark:text-gray-500 ml-auto mt-1" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {!vehicleHistoryPlate && (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold">Historial por vehículo</p>
            <p className="text-sm mt-1">Selecciona una matrícula para ver todas las intervenciones</p>
          </div>
        )}
      </div>
    );
  };

  const tabsConfig = [
    { id: 'orders', label: 'Órdenes de trabajo', icon: <Wrench className="w-4 h-4" />, count: workOrders.filter(w => w.status === 'in_progress').length || undefined },
    { id: 'kanban', label: 'Kanban', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'time', label: 'Tiempos', icon: <Clock className="w-4 h-4" />, count: activeTimeEntries.length || undefined },
    { id: 'history', label: 'Historial vehículo', icon: <History className="w-4 h-4" /> },
    { id: 'stats', label: 'Estadísticas', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  const renderOrdersTab = () => (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Pendientes', value: kpis.pending, color: 'amber', icon: <Clock className="w-5 h-5" /> },
          { label: 'En curso', value: kpis.inProgress, color: 'blue', icon: <Play className="w-5 h-5" /> },
          { label: 'Completadas', value: kpis.completed, color: 'green', icon: <CheckCircle2 className="w-5 h-5" /> },
          { label: 'Urgentes', value: kpis.urgent, color: 'red', icon: <AlertTriangle className="w-5 h-5" /> },
          { label: 'Ingresos taller', value: `${kpis.totalRevenue.toLocaleString('es-ES')}€`, color: 'purple', icon: <BarChart3 className="w-5 h-5" /> },
        ].map(kpi => (
          <div key={kpi.label} className={`p-4 bg-${kpi.color}-50 border-2 border-${kpi.color}-200 rounded-xl`}>
            <div className={`text-${kpi.color}-600 mb-2`}>{kpi.icon}</div>
            <div className={`text-2xl font-bold text-${kpi.color}-900`}>{kpi.value}</div>
            <div className={`text-xs text-${kpi.color}-700 mt-0.5`}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Search + Actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
          <input
            className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            placeholder="Buscar OT, matrícula, cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopyMechanicLink}
            className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl flex items-center gap-2 font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Copiar link mecánico
          </button>
          <button
            onClick={handleOpenMechanicTab}
            className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl flex items-center gap-2 font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir vista mecánico
          </button>
          <AddButtonDropdown
            label="Nueva OT"
            onQuickAdd={() => setShowCreate(true)}
            onAIAdd={() => { toast.info('Próximamente: creación de OTs con IA'); }}
            onImport={() => setShowImportModal(true)}
            quickAddLabel="Alta rápida"
            quickAddDesc="Formulario de nueva orden de trabajo"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select
          className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as WorkOrderStatus | 'all')}
        >
          <option value="all">Todos los estados</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none"
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value as WorkOrderPriority | 'all')}
        >
          <option value="all">Todas las prioridades</option>
          {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        {hasWorkCenters && (
          <select
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none"
            value={filterWorkCenter}
            onChange={e => setFilterWorkCenter(e.target.value)}
          >
            <option value="all">Todos los centros</option>
            {activeWorkCenters.map((wc) => (
              <option key={wc.id} value={wc.id}>{wc.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />
          Cargando órdenes de trabajo...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <Wrench className="w-12 h-12 text-gray-300 mb-3" />
          <p className="font-semibold">No hay órdenes de trabajo</p>
          <p className="text-sm mt-1">Crea la primera orden de trabajo del taller</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium"
          >
            + Nueva OT
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">OT</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Vehículo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Servicio</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Prioridad</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Responsable</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Coste</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-y dark:divide-gray-800">
              {filtered.map(wo => (
                <tr
                  key={wo._id}
                  onClick={() => navigate(`/saas/workshop/${wo._id}`)}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{wo.woNumber}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {new Date(wo.createdAt).toLocaleDateString('es-ES')}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                      {wo.vehicleBrand} {wo.vehicleModel}
                    </div>
                    <div className="font-mono text-xs text-gray-500 dark:text-gray-400 mt-0.5">{wo.vehiclePlate}</div>
                    {wo.vehicleMileage ? (
                      <div className="text-xs text-gray-400 dark:text-gray-500">{wo.vehicleMileage.toLocaleString('es-ES')} km</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900 dark:text-gray-100">{wo.clientName || '—'}</div>
                    {wo.clientPhone && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">{wo.clientPhone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg">
                      {SERVICE_LABELS[wo.serviceType]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[wo.priority].dot}`} />
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${PRIORITY_CONFIG[wo.priority].badgeClass}`}>
                        {PRIORITY_CONFIG[wo.priority].label}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${STATUS_CONFIG[wo.status].badgeClass}`}>
                        {STATUS_CONFIG[wo.status].label}
                      </span>
                      {wo.status === 'cancelled' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickStatus(wo, 'in_progress');
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                          title="Reactivar orden"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reactivar
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900 dark:text-gray-100">{wo.responsible}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                      {wo.totalCost > 0 ? `${wo.totalCost.toLocaleString('es-ES')}€` : '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/saas/workshop/${wo._id}`);
                        }}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        title="Ver detalle"
                      >
                        <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      </button>
                      {wo.status === 'pending' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickStatus(wo, 'in_progress');
                          }}
                          className="p-1.5 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Iniciar"
                        >
                          <Play className="w-4 h-4 text-blue-600" />
                        </button>
                      )}
                      {wo.status === 'in_progress' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickStatus(wo, 'completed');
                          }}
                          className="p-1.5 hover:bg-green-100 rounded-lg transition-colors"
                          title="Completar"
                        >
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        </button>
                      )}
                      {wo.status === 'completed' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickInvoice(wo);
                          }}
                          className="p-1.5 hover:bg-purple-100 rounded-lg transition-colors"
                          title="Generar factura"
                        >
                          <ReceiptText className="w-4 h-4 text-purple-600" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(wo);
                        }}
                        className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderTimeTab = () => {
    const allEntries = workOrders.flatMap(wo =>
      wo.timeEntries.map(te => ({ ...te, wo }))
    );

    const totalMinutes = allEntries
      .filter(te => te.duration)
      .reduce((s, te) => s + (te.duration || 0), 0);
    const totalHours = (totalMinutes / 60).toFixed(1);

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
            <div className="text-blue-600 mb-2"><Timer className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-blue-900">{activeTimeEntries.length}</div>
            <div className="text-xs text-blue-700">Temporizadores activos</div>
          </div>
          <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl">
            <div className="text-green-600 mb-2"><Clock className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-green-900">{totalHours}h</div>
            <div className="text-xs text-green-700">Total horas registradas</div>
          </div>
          <div className="p-4 bg-purple-50 border-2 border-purple-200 rounded-xl">
            <div className="text-purple-600 mb-2"><FileText className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-purple-900">{allEntries.length}</div>
            <div className="text-xs text-purple-700">Registros de tiempo</div>
          </div>
        </div>

        {activeTimeEntries.length > 0 && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
            <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              Temporizadores en curso
            </h3>
            <div className="space-y-2">
              {activeTimeEntries.map(te => (
                <div key={te.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl border border-blue-200 dark:border-blue-800">
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{te.mechanicName || 'Sin asignar'}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {te.wo.woNumber} — {te.wo.vehiclePlate} — Iniciado: {new Date(te.startTime).toLocaleTimeString('es-ES')}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/saas/workshop/${te.wo._id}`)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    Ver OT
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Historial de tiempos</h3>
          </div>
          {allEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-500 dark:text-gray-400">
              <Clock className="w-10 h-10 text-gray-300 mb-2" />
              <p className="text-sm">Sin registros de tiempo aún</p>
            </div>
          ) : (
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">OT</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Mecánico</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Inicio</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Fin</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Duración</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-y dark:divide-gray-800">
                {allEntries.map(te => {
                  const dur = te.duration
                    ? `${Math.floor(te.duration / 60)}h ${te.duration % 60}m`
                    : te.endTime
                      ? (() => {
                          const ms = new Date(te.endTime).getTime() - new Date(te.startTime).getTime();
                          const mins = Math.round(ms / 60000);
                          return `${Math.floor(mins / 60)}h ${mins % 60}m`;
                        })()
                      : '⏱ En curso';
                  return (
                    <tr key={te.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigate(`/saas/workshop/${te.wo._id}`)}
                          className="font-mono text-sm font-bold text-blue-600 hover:underline"
                        >
                          {te.wo.woNumber}
                        </button>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{te.wo.vehiclePlate}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{te.mechanicName || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300">
                        {new Date(te.startTime).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300">
                        {te.endTime
                          ? new Date(te.endTime).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
                          : <span className="text-blue-600 font-medium">En curso</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-semibold ${!te.endTime ? 'text-blue-600' : 'text-gray-900 dark:text-gray-100'}`}>
                          {dur}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{te.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  const renderStatsTab = () => {
    const byService = Object.entries(SERVICE_LABELS).map(([key, label]) => ({
      label,
      count: workOrders.filter(w => w.serviceType === key).length,
      revenue: workOrders.filter(w => w.serviceType === key).reduce((s, w) => s + w.totalCost, 0),
    })).filter(s => s.count > 0);

    const totalHoursWorked = workOrders
      .flatMap(w => w.laborItems)
      .reduce((s, li) => s + (li.hours || 0), 0);

    const avgCost = workOrders.length > 0
      ? (workOrders.reduce((s, w) => s + w.totalCost, 0) / workOrders.length)
      : 0;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total OTs</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{workOrders.length}</div>
          </div>
          <div className="p-5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Horas trabajadas</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{totalHoursWorked.toFixed(1)}h</div>
          </div>
          <div className="p-5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Coste medio por OT</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{avgCost.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
          </div>
          <div className="p-5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Facturación total</div>
            <div className="text-3xl font-bold text-purple-700">
              {workOrders.reduce((s, w) => s + w.totalCost, 0).toLocaleString('es-ES')}€
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">OTs por tipo de servicio</h3>
          {byService.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Sin datos</p>
          ) : (
            <div className="space-y-3">
              {byService.sort((a, b) => b.count - a.count).map(s => {
                const pct = workOrders.length > 0 ? Math.round((s.count / workOrders.length) * 100) : 0;
                return (
                  <div key={s.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{s.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{s.count} OTs</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">{s.revenue.toLocaleString('es-ES')}€</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gray-800 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Por estado</h3>
            <div className="space-y-2">
              {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
                const count = workOrders.filter(w => w.status === status).length;
                return (
                  <div key={status} className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${cfg.badgeClass}`}>
                      {cfg.label}
                    </span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Por prioridad</h3>
            <div className="space-y-2">
              {Object.entries(PRIORITY_CONFIG).map(([priority, cfg]) => {
                const count = workOrders.filter(w => w.priority === priority).length;
                return (
                  <div key={priority} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{cfg.label}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout title="Taller" subtitle="Gestión de órdenes de trabajo y reparaciones">
      <div className="space-y-6">
        <Tabs tabs={tabsConfig} activeTab={activeTab} onChange={setActiveTab} />
        {activeTab === 'orders' && renderOrdersTab()}
        {activeTab === 'kanban' && renderKanban()}
        {activeTab === 'time' && renderTimeTab()}
        {activeTab === 'history' && renderVehicleHistory()}
        {activeTab === 'stats' && renderStatsTab()}
      </div>

      <CreateWorkOrderModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
        mechanics={mechanics}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Órdenes de trabajo"
        fields={WO_IMPORT_FIELDS}
        onImport={async (entries) => {
          if (!user?.id) return;
          let created = 0;
          const validServiceTypes: WorkOrderServiceType[] = [
            'revision', 'reparacion', 'mantenimiento', 'puesta_punto', 'garantia', 'otro',
          ];
          const parseServiceType = (raw: string | undefined): WorkOrderServiceType => {
            const k = String(raw || '').toLowerCase().trim();
            if (k === 'maintenance') return 'mantenimiento';
            if (validServiceTypes.includes(k as WorkOrderServiceType)) return k as WorkOrderServiceType;
            return 'mantenimiento';
          };
          const parsePriority = (raw: string | undefined): WorkOrderPriority => {
            const k = String(raw || 'normal').toLowerCase().trim();
            if (k === 'medium') return 'normal';
            if (k === 'low' || k === 'normal' || k === 'high' || k === 'urgent') return k;
            return 'normal';
          };
          for (const entry of entries) {
            try {
              await createWorkOrderRequest(user.id, {
                vehicleBrand: '',
                vehicleModel: entry.vehicleModel || '',
                vehiclePlate: (entry.plate || '').toUpperCase(),
                clientName: entry.clientName || '',
                clientPhone: entry.clientPhone || undefined,
                serviceType: parseServiceType(entry.serviceType),
                description: entry.description || '',
                priority: parsePriority(entry.priority),
                responsible: entry.mechanic?.trim() || 'Sin asignar',
                status: 'pending',
                laborItems: [],
                materialItems: [],
                timeEntries: [],
                photos: [],
                stageHistory: [
                  { status: 'pending', date: new Date().toISOString(), user: 'Sistema', notes: 'OT importada' },
                ],
              } as Parameters<typeof createWorkOrderRequest>[1]);
              created++;
            } catch { /* skip */ }
          }
          const orders = await listWorkOrdersRequest(user.id);
          setWorkOrders(orders);
          toast.success(`${created} orden(es) importada(s)`);
        }}
      />
    </Layout>
  );
}
