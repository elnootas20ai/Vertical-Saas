import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useModalClose } from '../../hooks/useModalClose';
import {
  listCleaningWorkersRequest,
  createCleaningWorkerRequest,
  updateCleaningWorkerRequest,
  deleteCleaningWorkerRequest,
  getCleaningProductivityRequest,
  type CleaningWorker,
  type CleaningWorkerStatus,
  type ContractType,
  type WorkerDocument as WorkerDoc,
  type DayAvailability,
  type AssignedMaterial,
  type ProductivityResponse,
  type WorkerProductivity,
  type ClientLaborCost,
} from '../../lib/cleaningWorkersApi';
import {
  listCleaningServicesRequest,
  type CleaningService,
} from '../../lib/cleaningApi';
import {
  Users, Plus, Search, UserCog, Phone, Mail, MapPin,
  Clock, Briefcase, Car, AlertTriangle, ChevronRight,
  X, Trash2, Edit3, LayoutGrid, List, Filter,
  FileText, Shield, ChevronDown, Calendar, Star,
  Package, Check, Save, Eye, Ban, Pause,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CleaningWorkerStatus, { label: string; bg: string; text: string; dot: string }> = {
  active:   { label: 'Activo',      bg: 'bg-emerald-50 dark:bg-emerald-950/30',  text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  inactive: { label: 'Inactivo',    bg: 'bg-gray-100 dark:bg-gray-800',          text: 'text-gray-500 dark:text-gray-400',       dot: 'bg-gray-400' },
  on_leave: { label: 'De baja',     bg: 'bg-amber-50 dark:bg-amber-950/30',      text: 'text-amber-700 dark:text-amber-400',     dot: 'bg-amber-500' },
  trial:    { label: 'En pruebas',  bg: 'bg-blue-50 dark:bg-blue-950/30',        text: 'text-blue-700 dark:text-blue-400',       dot: 'bg-blue-500' },
};

const CONTRACT_LABELS: Record<ContractType, string> = {
  full_time: 'Jornada completa', part_time: 'Media jornada', temporary: 'Temporal',
  freelance: 'Autónomo', internship: 'Prácticas',
};

const DOC_TYPE_LABELS: Record<string, string> = {
  dni: 'DNI / NIE', contract: 'Contrato', prl: 'PRL', driving_license: 'Carnet conducir',
  social_security: 'Seg. Social', medical: 'Médico', certification: 'Certificación', other: 'Otro',
};

const VEHICLE_LABELS: Record<string, string> = {
  coche: 'Coche', moto: 'Moto', bicicleta: 'Bicicleta', transporte_publico: 'Transporte público', a_pie: 'A pie',
};

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Lun' }, { key: 'tuesday', label: 'Mar' },
  { key: 'wednesday', label: 'Mié' }, { key: 'thursday', label: 'Jue' },
  { key: 'friday', label: 'Vie' }, { key: 'saturday', label: 'Sáb' },
  { key: 'sunday', label: 'Dom' },
] as const;

const SPECIALIZATIONS = [
  'Limpieza general', 'Limpieza profunda', 'Cristales', 'Desinfección',
  'Mantenimiento', 'Industrial', 'Post-obra', 'Oficinas',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDayKey(): string {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
}

function isAvailableNow(w: CleaningWorker): boolean {
  const day = w.availability?.[getDayKey() as keyof typeof w.availability] as DayAvailability | undefined;
  if (!day?.available) return false;
  if (!day.startTime || !day.endTime) return true;
  const now = new Date().toTimeString().slice(0, 5);
  return now >= day.startTime && now <= day.endTime;
}

function getExpiredDocs(w: CleaningWorker): WorkerDoc[] {
  const today = new Date().toISOString().slice(0, 10);
  return (w.documents || []).filter(d => d.expiresAt && d.expiresAt < today);
}

function getExpiringDocs(w: CleaningWorker): WorkerDoc[] {
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  return (w.documents || []).filter(d => d.expiresAt && d.expiresAt >= today && d.expiresAt <= future);
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

const todayStr = () => new Date().toISOString().slice(0, 10);

// ─── Main Component ───────────────────────────────────────────────────────────

export function CleaningWorkers() {
  const { user } = useAuth();
  const [workers, setWorkers] = useState<CleaningWorker[]>([]);
  const [services, setServices] = useState<CleaningService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CleaningWorkerStatus | 'all'>('all');
  const [contractFilter, setContractFilter] = useState<ContractType | 'all'>('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() =>
    (typeof localStorage !== 'undefined' && localStorage.getItem('cw-view')) as 'cards' | 'table' || 'cards'
  );
  const [showForm, setShowForm] = useState(false);
  const [editWorker, setEditWorker] = useState<CleaningWorker | null>(null);
  const [detailWorker, setDetailWorker] = useState<CleaningWorker | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'docs' | 'services' | 'materials'>('info');
  const [saving, setSaving] = useState(false);
  const [mainTab, setMainTab] = useState<'team' | 'assignment' | 'productivity'>('team');

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const [w, s] = await Promise.all([
        listCleaningWorkersRequest(user.id),
        listCleaningServicesRequest(user.id),
      ]);
      setWorkers(w);
      setServices(s);
    } catch (e: any) {
      toast.error(e.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('cw-view', viewMode);
  }, [viewMode]);

  // ─── Computed ───────────────────────────────────────────────────────────────

  const todayServices = useMemo(() => {
    const today = todayStr();
    return services.filter(s => s.date === today && !s.deletedAt);
  }, [services]);

  const workerServiceCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of todayServices) {
      const key = s.workerId || s.assignedTo;
      if (key) map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [todayServices]);

  const allZones = useMemo(() => {
    const set = new Set<string>();
    for (const w of workers) (w.zones || []).forEach(z => z && set.add(z));
    return Array.from(set).sort();
  }, [workers]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return workers.filter(w => {
      if (statusFilter !== 'all' && w.status !== statusFilter) return false;
      if (contractFilter !== 'all' && w.contractType !== contractFilter) return false;
      if (zoneFilter !== 'all' && !(w.zones || []).includes(zoneFilter)) return false;
      if (q) {
        const haystack = [w.name, w.phone, w.email, ...(w.zones || []), ...(w.specializations || [])].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [workers, search, statusFilter, contractFilter, zoneFilter]);

  const kpis = useMemo(() => {
    const active = workers.filter(w => w.status === 'active').length;
    const inService = new Set(todayServices.filter(s => s.status === 'in_progress').map(s => s.workerId || s.assignedTo).filter(Boolean)).size;
    const activeIds = new Set(workers.filter(w => w.status === 'active').map(w => w._id));
    const assignedIds = new Set(todayServices.map(s => s.workerId || s.assignedTo).filter(Boolean));
    const noAssignment = workers.filter(w => w.status === 'active' && !assignedIds.has(w._id)).length;
    let hoursToday = 0;
    for (const s of todayServices) {
      if (s.checkInAt && s.checkOutAt) {
        hoursToday += (new Date(s.checkOutAt).getTime() - new Date(s.checkInAt).getTime()) / 3600000;
      } else if (s.checkInAt && s.status === 'in_progress') {
        hoursToday += (Date.now() - new Date(s.checkInAt).getTime()) / 3600000;
      }
    }
    return { active, inService, noAssignment, hoursToday: Math.round(hoursToday * 10) / 10 };
  }, [workers, todayServices]);

  // ─── CRUD Handlers ─────────────────────────────────────────────────────────

  async function handleSave(data: Partial<CleaningWorker>) {
    if (!user?.id) return;
    setSaving(true);
    try {
      if (editWorker?._id) {
        const updated = await updateCleaningWorkerRequest(user.id, { ...editWorker, ...data } as CleaningWorker);
        setWorkers(prev => prev.map(w => w._id === updated._id ? updated : w));
        if (detailWorker?._id === updated._id) setDetailWorker(updated);
        toast.success('Trabajador actualizado');
      } else {
        const created = await createCleaningWorkerRequest(user.id, data);
        setWorkers(prev => [...prev, created]);
        toast.success('Trabajador creado');
      }
      setShowForm(false);
      setEditWorker(null);
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(w: CleaningWorker) {
    if (!user?.id || !confirm(`¿Eliminar a ${w.name}?`)) return;
    try {
      await deleteCleaningWorkerRequest(user.id, w._id);
      setWorkers(prev => prev.filter(x => x._id !== w._id));
      if (detailWorker?._id === w._id) setDetailWorker(null);
      toast.success('Trabajador eliminado');
    } catch (e: any) {
      toast.error(e.message || 'Error al eliminar');
    }
  }

  async function handleToggleStatus(w: CleaningWorker) {
    if (!user?.id) return;
    const newStatus: CleaningWorkerStatus = w.status === 'active' ? 'inactive' : 'active';
    try {
      const updated = await updateCleaningWorkerRequest(user.id, { ...w, status: newStatus } as CleaningWorker);
      setWorkers(prev => prev.map(x => x._id === updated._id ? updated : x));
      if (detailWorker?._id === updated._id) setDetailWorker(updated);
      toast.success(newStatus === 'active' ? 'Trabajador activado' : 'Trabajador desactivado');
    } catch (e: any) {
      toast.error(e.message || 'Error al cambiar estado');
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout title="Trabajadores" subtitle="Personal y productividad">
      <div className="flex flex-col gap-5">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Activos', value: kpis.active, icon: <Users className="w-5 h-5" />, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
            { label: 'En servicio hoy', value: kpis.inService, icon: <Briefcase className="w-5 h-5" />, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
            { label: 'Sin asignación', value: kpis.noAssignment, icon: <AlertTriangle className="w-5 h-5" />, color: kpis.noAssignment > 0 ? 'text-amber-600' : 'text-gray-400', bg: kpis.noAssignment > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-gray-50 dark:bg-gray-800' },
            { label: 'Horas hoy', value: `${kpis.hoursToday}h`, icon: <Clock className="w-5 h-5" />, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/30' },
          ].map(k => (
            <div key={k.label} className={`${k.bg} rounded-2xl p-4 flex items-center gap-3`}>
              <div className={`${k.color} shrink-0`}>{k.icon}</div>
              <div>
                <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{k.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Main Tabs */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
          {[
            { id: 'team' as const, label: 'Equipo', count: workers.length },
            { id: 'assignment' as const, label: 'Asignación diaria', count: todayServices.length },
            { id: 'productivity' as const, label: 'Productividad', count: null },
          ].map(t => (
            <button key={t.id} onClick={() => setMainTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${mainTab === t.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
            >
              {t.label} {t.count != null && <span className="ml-1 text-xs opacity-60">({t.count})</span>}
            </button>
          ))}
        </div>

        {mainTab === 'team' && (
          <>
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, teléfono, zona..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent" />
              </div>
              <div className="flex gap-2 flex-wrap">
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                  className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                  <option value="all">Todos los estados</option>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={contractFilter} onChange={e => setContractFilter(e.target.value as any)}
                  className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                  <option value="all">Todo contrato</option>
                  {Object.entries(CONTRACT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {allZones.length > 0 && (
                  <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                    <option value="all">Todas las zonas</option>
                    {allZones.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                )}
                <div className="flex border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <button onClick={() => setViewMode('cards')} className={`px-3 py-2 ${viewMode === 'cards' ? 'bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700' : 'text-gray-400 hover:text-gray-600'}`}>
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button onClick={() => setViewMode('table')} className={`px-3 py-2 ${viewMode === 'table' ? 'bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700' : 'text-gray-400 hover:text-gray-600'}`}>
                    <List className="w-4 h-4" />
                  </button>
                </div>
                <AddButtonDropdown
                label="Nuevo"
                onQuickAdd={() => { setEditWorker(null); setShowForm(true); }}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de trabajador"
              />
              </div>
            </div>

            {/* Content */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <UserCog className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  {workers.length === 0 ? 'No hay trabajadores. Crea el primero.' : 'No se encontraron trabajadores con esos filtros.'}
                </p>
              </div>
            ) : viewMode === 'cards' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map(w => <WorkerCard key={w._id} worker={w} servicesCount={workerServiceCount[w._id] || 0}
                  onOpen={() => { setDetailWorker(w); setDetailTab('info'); }}
                  onEdit={() => { setEditWorker(w); setShowForm(true); }}
                  onToggle={() => handleToggleStatus(w)}
                  onDelete={() => handleDelete(w)} />)}
              </div>
            ) : (
              <WorkerTable workers={filtered} serviceCount={workerServiceCount}
                onOpen={w => { setDetailWorker(w); setDetailTab('info'); }}
                onEdit={w => { setEditWorker(w); setShowForm(true); }}
                onToggle={handleToggleStatus} onDelete={handleDelete} />
            )}
          </>
        )}

        {mainTab === 'assignment' && (
          <AssignmentView workers={workers.filter(w => w.status === 'active')} services={todayServices} />
        )}

        {mainTab === 'productivity' && user?.id && (
          <ProductivityPanel userId={user.id} onOpenWorker={(w) => { setDetailWorker(w); setDetailTab('info'); }} workers={workers} />
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <WorkerFormModal
          worker={editWorker}
          saving={saving}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditWorker(null); }}
        />
      )}

      {/* Detail Drawer */}
      {detailWorker && (
        <WorkerDrawer
          worker={detailWorker}
          services={services}
          tab={detailTab}
          onTabChange={setDetailTab}
          onClose={() => setDetailWorker(null)}
          onEdit={() => { setEditWorker(detailWorker); setShowForm(true); }}
          onToggle={() => handleToggleStatus(detailWorker)}
          onDelete={() => handleDelete(detailWorker)}
          onUpdate={async (updated) => {
            if (!user?.id) return;
            try {
              const result = await updateCleaningWorkerRequest(user.id, updated);
              setWorkers(prev => prev.map(w => w._id === result._id ? result : w));
              setDetailWorker(result);
            } catch (e: any) { toast.error(e.message); }
          }}
        />
      )}
    </Layout>
  );
}

// ─── Worker Card ──────────────────────────────────────────────────────────────

function WorkerCard({ worker: w, servicesCount, onOpen, onEdit, onToggle, onDelete }: {
  worker: CleaningWorker; servicesCount: number;
  onOpen: () => void; onEdit: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const st = STATUS_CONFIG[w.status];
  const expired = getExpiredDocs(w);
  const loadColor = servicesCount === 0 ? 'text-gray-400' : servicesCount <= 3 ? 'text-emerald-600' : 'text-amber-600';

  return (
    <div onClick={onOpen} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 hover:shadow-lg hover:border-cyan-200 dark:hover:border-cyan-800 transition-all cursor-pointer group">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center text-white font-semibold text-sm shrink-0">
          {w.avatar ? <img src={w.avatar} className="w-full h-full rounded-full object-cover" /> : getInitials(w.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">{w.name}</h3>
            {expired.length > 0 && (
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shrink-0" title={`${expired.length} doc. caducados`} />
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{w.phone || 'Sin teléfono'}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
          <Briefcase className="w-3.5 h-3.5 shrink-0" />
          <span className={loadColor}>{servicesCount} servicio{servicesCount !== 1 ? 's' : ''} hoy</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <span>{CONTRACT_LABELS[w.contractType] || w.contractType}</span>
        </div>
        {(w.zones || []).length > 0 && (
          <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 col-span-2">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{w.zones.join(', ')}</span>
          </div>
        )}
        {w.hasOwnVehicle && w.vehicleType && (
          <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <Car className="w-3.5 h-3.5 shrink-0" />
            <span>{VEHICLE_LABELS[w.vehicleType] || w.vehicleType} ({w.vehicleOwnership === 'own' ? 'propio' : 'empresa'})</span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex gap-1">
          <button onClick={e => { e.stopPropagation(); onEdit(); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600" title="Editar">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={e => { e.stopPropagation(); onToggle(); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600"
            title={w.status === 'active' ? 'Desactivar' : 'Activar'}>
            {w.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-600" title="Eliminar">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300" />
      </div>
    </div>
  );
}

// ─── Worker Table ─────────────────────────────────────────────────────────────

function WorkerTable({ workers, serviceCount, onOpen, onEdit, onToggle, onDelete }: {
  workers: CleaningWorker[]; serviceCount: Record<string, number>;
  onOpen: (w: CleaningWorker) => void; onEdit: (w: CleaningWorker) => void;
  onToggle: (w: CleaningWorker) => void; onDelete: (w: CleaningWorker) => void;
}) {
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = useMemo(() => {
    return [...workers].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name, 'es');
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status);
      else if (sortKey === 'services') cmp = (serviceCount[a._id] || 0) - (serviceCount[b._id] || 0);
      else if (sortKey === 'cost') cmp = a.hourlyCost - b.hourlyCost;
      else if (sortKey === 'hours') cmp = a.weeklyHours - b.weeklyHours;
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [workers, sortKey, sortDir, serviceCount]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const th = (label: string, key: string) => (
    <th onClick={() => toggleSort(key)} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none">
      <span className="flex items-center gap-1">{label} {sortKey === key && <ChevronDown className={`w-3 h-3 transition-transform ${sortDir === 'desc' ? 'rotate-180' : ''}`} />}</span>
    </th>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-gray-100 dark:border-gray-700">
          <tr>
            {th('Nombre', 'name')}
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Teléfono</th>
            {th('Estado', 'status')}
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contrato</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Zona</th>
            {th('€/h', 'cost')}
            {th('Servicios hoy', 'services')}
            {th('H/semana', 'hours')}
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-750">
          {sorted.map(w => {
            const st = STATUS_CONFIG[w.status];
            const expired = getExpiredDocs(w);
            const cnt = serviceCount[w._id] || 0;
            return (
              <tr key={w._id} onClick={() => onOpen(w)} className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                      {getInitials(w.name)}
                    </div>
                    <span className="font-medium text-sm text-gray-900 dark:text-white">{w.name}</span>
                    {expired.length > 0 && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{w.phone || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{CONTRACT_LABELS[w.contractType]}</td>
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{(w.zones || []).join(', ') || '—'}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">{w.hourlyCost ? `${w.hourlyCost}€` : '—'}</td>
                <td className="px-4 py-3 text-sm font-medium">
                  <span className={cnt === 0 ? 'text-gray-400' : cnt <= 3 ? 'text-emerald-600' : 'text-amber-600'}>{cnt}</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{w.weeklyHours}h</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={e => { e.stopPropagation(); onEdit(w); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600"><Edit3 className="w-3.5 h-3.5" /></button>
                    <button onClick={e => { e.stopPropagation(); onToggle(w); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600">
                      {w.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={e => { e.stopPropagation(); onDelete(w); }} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Worker Form Modal ────────────────────────────────────────────────────────

function WorkerFormModal({ worker, saving, onSave, onClose }: {
  worker: CleaningWorker | null; saving: boolean;
  onSave: (data: Partial<CleaningWorker>) => void; onClose: () => void;
}) {
  const ref = useModalClose(onClose);
  const [name, setName] = useState(worker?.name || '');
  const [phone, setPhone] = useState(worker?.phone || '');
  const [email, setEmail] = useState(worker?.email || '');
  const [address, setAddress] = useState(worker?.address || '');
  const [contractType, setContractType] = useState<ContractType>(worker?.contractType || 'full_time');
  const [hourlyCost, setHourlyCost] = useState(String(worker?.hourlyCost || ''));
  const [weeklyHours, setWeeklyHours] = useState(String(worker?.weeklyHours || '40'));
  const [startDate, setStartDate] = useState(worker?.startDate || '');
  const [endDate, setEndDate] = useState(worker?.endDate || '');
  const [zones, setZones] = useState((worker?.zones || []).join(', '));
  const [hasOwnVehicle, setHasOwnVehicle] = useState(worker?.hasOwnVehicle || false);
  const [vehicleType, setVehicleType] = useState(worker?.vehicleType || '');
  const [vehicleOwnership, setVehicleOwnership] = useState(worker?.vehicleOwnership || '');
  const [specializations, setSpecializations] = useState<string[]>(worker?.specializations || []);
  const [notes, setNotes] = useState(worker?.notes || '');
  const [status, setStatus] = useState<CleaningWorkerStatus>(worker?.status || 'active');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error('El nombre es obligatorio');
    onSave({
      name: name.trim(), phone: phone.trim(), email: email.trim(), address: address.trim(),
      contractType, hourlyCost: Number(hourlyCost) || 0, weeklyHours: Number(weeklyHours) || 40,
      startDate, endDate, status,
      zones: zones.split(',').map(z => z.trim()).filter(Boolean),
      hasOwnVehicle, vehicleType: hasOwnVehicle ? vehicleType as any : '',
      vehicleOwnership: hasOwnVehicle ? vehicleOwnership as any : '',
      specializations, notes,
    });
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent';
  const labelCls = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <form ref={ref as any} onSubmit={submit}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800 z-10">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{worker ? 'Editar trabajador' : 'Nuevo trabajador'}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Personal */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className={labelCls}>Nombre *</label><input value={name} onChange={e => setName(e.target.value)} className={inputCls} required /></div>
            <div><label className={labelCls}>Teléfono</label><input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} /></div>
            <div className="col-span-2"><label className={labelCls}>Dirección</label><input value={address} onChange={e => setAddress(e.target.value)} className={inputCls} /></div>
          </div>

          {/* Contract */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Contrato</label>
              <select value={contractType} onChange={e => setContractType(e.target.value as ContractType)} className={inputCls}>
                {Object.entries(CONTRACT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>Coste/hora (€)</label><input type="number" step="0.01" value={hourlyCost} onChange={e => setHourlyCost(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Horas/semana</label><input type="number" value={weeklyHours} onChange={e => setWeeklyHours(e.target.value)} className={inputCls} /></div>
            <div>
              <label className={labelCls}>Estado</label>
              <select value={status} onChange={e => setStatus(e.target.value as CleaningWorkerStatus)} className={inputCls}>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>Fecha inicio</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Fecha fin</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} /></div>
          </div>

          {/* Zones */}
          <div>
            <label className={labelCls}>Zonas (separadas por coma)</label>
            <input value={zones} onChange={e => setZones(e.target.value)} placeholder="Centro, Ensanche, Polígono Norte" className={inputCls} />
          </div>

          {/* Vehicle */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={hasOwnVehicle} onChange={e => setHasOwnVehicle(e.target.checked)}
                className="rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Tiene vehículo</span>
            </label>
            {hasOwnVehicle && (
              <>
                <select value={vehicleType} onChange={e => setVehicleType(e.target.value)} className={`${inputCls} w-auto`}>
                  <option value="">Tipo</option>
                  {Object.entries(VEHICLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={vehicleOwnership} onChange={e => setVehicleOwnership(e.target.value)} className={`${inputCls} w-auto`}>
                  <option value="">Propiedad</option>
                  <option value="own">Propio</option>
                  <option value="company">Empresa</option>
                </select>
              </>
            )}
          </div>

          {/* Specializations */}
          <div>
            <label className={labelCls}>Especializaciones</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {SPECIALIZATIONS.map(s => (
                <button key={s} type="button" onClick={() => setSpecializations(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${specializations.includes(s)
                    ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 ring-1 ring-cyan-300 dark:ring-cyan-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={inputCls} />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-gray-900 flex justify-end gap-2 p-5 border-t border-gray-100 dark:border-gray-800">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">Cancelar</button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
            {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Save className="w-4 h-4" />}
            {worker ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Worker Detail Drawer ─────────────────────────────────────────────────────

function WorkerDrawer({ worker: w, services, tab, onTabChange, onClose, onEdit, onToggle, onDelete, onUpdate }: {
  worker: CleaningWorker; services: CleaningService[];
  tab: 'info' | 'docs' | 'services' | 'materials';
  onTabChange: (t: 'info' | 'docs' | 'services' | 'materials') => void;
  onClose: () => void; onEdit: () => void; onToggle: () => void; onDelete: () => void;
  onUpdate: (w: CleaningWorker) => Promise<void>;
}) {
  const st = STATUS_CONFIG[w.status];
  const expired = getExpiredDocs(w);
  const expiring = getExpiringDocs(w);
  const workerServices = useMemo(() =>
    services.filter(s => (s.workerId === w._id || s.assignedTo === w._id) && !s.deletedAt)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
    [services, w._id]
  );

  const tabs = [
    { id: 'info' as const, label: 'Información', icon: <UserCog className="w-4 h-4" /> },
    { id: 'docs' as const, label: 'Documentación', icon: <FileText className="w-4 h-4" />, badge: expired.length > 0 ? expired.length : null },
    { id: 'services' as const, label: 'Servicios', icon: <Briefcase className="w-4 h-4" />, badge: workerServices.length },
    { id: 'materials' as const, label: 'Materiales', icon: <Package className="w-4 h-4" />, badge: (w.assignedMaterials || []).filter(m => !m.returnedAt).length },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm">
      <div onClick={onClose} className="flex-1" />
      <div className="w-full max-w-xl bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto animate-in slide-in-from-right">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 z-10 border-b border-gray-100 dark:border-gray-800 p-5">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center text-white font-bold text-lg shrink-0">
              {w.avatar ? <img src={w.avatar} className="w-full h-full rounded-full object-cover" /> : getInitials(w.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">{w.name}</h2>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                {w.phone && <a href={`tel:${w.phone}`} className="flex items-center gap-1 hover:text-cyan-600"><Phone className="w-3.5 h-3.5" />{w.phone}</a>}
                {w.email && <a href={`mailto:${w.email}`} className="flex items-center gap-1 hover:text-cyan-600"><Mail className="w-3.5 h-3.5" />{w.email}</a>}
              </div>
              {isAvailableNow(w) && (
                <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Disponible ahora
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={onEdit} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600"><Edit3 className="w-4 h-4" /></button>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            {tabs.map(t => (
              <button key={t.id} onClick={() => onTabChange(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all flex-1 justify-center ${tab === t.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'}`}>
                {t.icon} {t.label}
                {t.badge != null && t.badge > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${t.id === 'docs' && expired.length > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-5">
          {tab === 'info' && <DrawerInfoTab worker={w} />}
          {tab === 'docs' && <DrawerDocsTab worker={w} expired={expired} expiring={expiring} onUpdate={onUpdate} />}
          {tab === 'services' && <DrawerServicesTab services={workerServices} />}
          {tab === 'materials' && <DrawerMaterialsTab worker={w} onUpdate={onUpdate} />}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 p-4 flex items-center justify-between">
          <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Eliminar
          </button>
          <button onClick={onToggle}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors ${w.status === 'active'
              ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30' : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'}`}>
            {w.status === 'active' ? <><Ban className="w-3.5 h-3.5" /> Desactivar</> : <><Check className="w-3.5 h-3.5" /> Activar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Drawer Tabs ──────────────────────────────────────────────────────────────

function DrawerInfoTab({ worker: w }: { worker: CleaningWorker }) {
  const section = (title: string, children: React.ReactNode) => (
    <div className="mb-5">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
  const row = (label: string, value: string | React.ReactNode) => (
    <div className="flex items-start justify-between py-1.5">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-white text-right max-w-[60%]">{value || '—'}</span>
    </div>
  );

  return (
    <div>
      {section('Datos personales', <>
        {row('Dirección', w.address)}
      </>)}
      {section('Contrato', <>
        {row('Tipo', CONTRACT_LABELS[w.contractType])}
        {row('Coste/hora', w.hourlyCost ? `${w.hourlyCost} €` : '—')}
        {row('Tarifa/hora', w.hourlyRate ? `${w.hourlyRate} €` : '—')}
        {row('Horas/semana', `${w.weeklyHours}h`)}
        {row('Inicio', w.startDate || '—')}
        {row('Fin', w.endDate || '—')}
      </>)}
      {section('Disponibilidad', (
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS_OF_WEEK.map(d => {
            const day = w.availability?.[d.key as keyof typeof w.availability] as DayAvailability | undefined;
            return (
              <div key={d.key} className={`text-center p-2 rounded-xl text-xs ${day?.available ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700' : 'bg-gray-50 dark:bg-gray-800 text-gray-400'}`}>
                <div className="font-semibold">{d.label}</div>
                {day?.available && day?.startTime && <div className="mt-0.5 text-[10px]">{day.startTime}-{day.endTime}</div>}
              </div>
            );
          })}
        </div>
      ))}
      {section('Zona y transporte', <>
        {row('Zonas', (w.zones || []).join(', '))}
        {row('Zona preferente', w.preferredZone)}
        {row('Vehículo', w.hasOwnVehicle ? `${VEHICLE_LABELS[w.vehicleType || ''] || 'Sí'} (${w.vehicleOwnership === 'own' ? 'propio' : 'empresa'})` : 'No')}
        {row('Matrícula', w.licensePlate)}
      </>)}
      {(w.specializations || []).length > 0 && section('Especializaciones', (
        <div className="flex flex-wrap gap-1.5">
          {w.specializations.map(s => (
            <span key={s} className="px-2.5 py-1 bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-300 rounded-full text-xs font-medium">{s}</span>
          ))}
        </div>
      ))}
      {w.notes && section('Notas', <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">{w.notes}</p>)}
    </div>
  );
}

function DrawerDocsTab({ worker: w, expired, expiring, onUpdate }: {
  worker: CleaningWorker; expired: WorkerDoc[]; expiring: WorkerDoc[];
  onUpdate: (w: CleaningWorker) => Promise<void>;
}) {
  const docs = w.documents || [];
  const today = todayStr();

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 text-xs">
        <span className="text-gray-500">{docs.length} documentos</span>
        {expired.length > 0 && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">{expired.length} caducados</span>}
        {expiring.length > 0 && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">{expiring.length} por caducar</span>}
      </div>
      {docs.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Sin documentos registrados</p>
      ) : (
        <div className="space-y-2">
          {docs.map(d => {
            const isExpired = d.expiresAt && d.expiresAt < today;
            const isExpiring = d.expiresAt && d.expiresAt >= today && d.expiresAt <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
            return (
              <div key={d.id} className={`flex items-center gap-3 p-3 rounded-xl border ${isExpired ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20' : isExpiring ? 'border-amber-200 bg-amber-50/50' : 'border-gray-100 dark:border-gray-700'}`}>
                <FileText className={`w-5 h-5 shrink-0 ${isExpired ? 'text-red-500' : isExpiring ? 'text-amber-500' : 'text-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{d.name}</span>
                    <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] text-gray-500">{DOC_TYPE_LABELS[d.documentType] || d.documentType}</span>
                    {d.verified && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                  </div>
                  {d.expiresAt && (
                    <p className={`text-xs mt-0.5 ${isExpired ? 'text-red-600 font-medium' : isExpiring ? 'text-amber-600' : 'text-gray-400'}`}>
                      {isExpired ? `Caducó el ${d.expiresAt}` : `Caduca el ${d.expiresAt}`}
                    </p>
                  )}
                </div>
                {d.url && <a href={d.url} target="_blank" rel="noopener" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"><Eye className="w-4 h-4" /></a>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DrawerServicesTab({ services }: { services: CleaningService[] }) {
  const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const today = todayStr();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    if (filter === 'today') return services.filter(s => s.date === today);
    if (filter === 'week') return services.filter(s => s.date >= weekAgo);
    if (filter === 'month') return services.filter(s => s.date >= monthAgo);
    return services;
  }, [services, filter, today, weekAgo, monthAgo]);

  const completed = filtered.filter(s => s.status === 'completed').length;
  const totalHours = filtered.reduce((sum, s) => {
    if (s.checkInAt && s.checkOutAt) return sum + (new Date(s.checkOutAt).getTime() - new Date(s.checkInAt).getTime()) / 3600000;
    return sum;
  }, 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {(['all', 'today', 'week', 'month'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
            {f === 'all' ? 'Todos' : f === 'today' ? 'Hoy' : f === 'week' ? 'Semana' : 'Mes'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-2.5 text-center">
          <p className="text-lg font-bold text-gray-900 dark:text-white">{filtered.length}</p>
          <p className="text-[10px] text-gray-500">Total</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-2.5 text-center">
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{completed}</p>
          <p className="text-[10px] text-gray-500">Completados</p>
        </div>
        <div className="bg-violet-50 dark:bg-violet-950/30 rounded-xl p-2.5 text-center">
          <p className="text-lg font-bold text-violet-700 dark:text-violet-400">{Math.round(totalHours * 10) / 10}h</p>
          <p className="text-[10px] text-gray-500">Horas</p>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Sin servicios en este período</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <div key={s._id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{s.clientName}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    s.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                    s.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                    s.status === 'cancelled' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'
                  }`}>{s.status}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{s.date} {s.time && `· ${s.time}`} {s.address && `· ${s.address}`}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DrawerMaterialsTab({ worker: w, onUpdate }: { worker: CleaningWorker; onUpdate: (w: CleaningWorker) => Promise<void> }) {
  const materials = (w.assignedMaterials || []);
  const active = materials.filter(m => !m.returnedAt);
  const returned = materials.filter(m => m.returnedAt);

  async function handleReturn(matId: string) {
    const updated = {
      ...w,
      assignedMaterials: materials.map(m => m.id === matId ? { ...m, returnedAt: new Date().toISOString() } : m),
    };
    await onUpdate(updated as CleaningWorker);
  }

  const condBadge: Record<string, string> = {
    good: 'bg-emerald-100 text-emerald-700', fair: 'bg-amber-100 text-amber-700',
    poor: 'bg-orange-100 text-orange-700', needs_replacement: 'bg-red-100 text-red-700',
  };
  const condLabel: Record<string, string> = { good: 'Bueno', fair: 'Regular', poor: 'Malo', needs_replacement: 'Reemplazar' };

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">{active.length} en uso · {returned.length} devueltos</p>
      {active.length === 0 && returned.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Sin materiales asignados</p>
      ) : (
        <div className="space-y-2">
          {active.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
              <Package className="w-5 h-5 text-cyan-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{m.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${condBadge[m.condition] || 'bg-gray-100 text-gray-500'}`}>
                    {condLabel[m.condition] || m.condition}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">×{m.quantity} · Desde {m.assignedAt?.slice(0, 10)}</p>
              </div>
              <button onClick={() => handleReturn(m.id)}
                className="px-2.5 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                Devolver
              </button>
            </div>
          ))}
          {returned.length > 0 && (
            <>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-4 mb-2">Devueltos</p>
              {returned.map(m => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700 opacity-50">
                  <Package className="w-5 h-5 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-500">{m.name} ×{m.quantity}</span>
                    <p className="text-xs text-gray-400">Devuelto {m.returnedAt?.slice(0, 10)}</p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Assignment View ──────────────────────────────────────────────────────────

function AssignmentView({ workers, services }: { workers: CleaningWorker[]; services: CleaningService[] }) {
  const unassigned = services.filter(s => !s.workerId && !s.assignedTo);
  const hours = Array.from({ length: 13 }, (_, i) => i + 7);

  return (
    <div>
      {unassigned.length > 0 && (
        <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">
            <AlertTriangle className="w-4 h-4 inline-block mr-1" /> {unassigned.length} servicio{unassigned.length !== 1 ? 's' : ''} sin asignar
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {unassigned.map(s => (
              <div key={s._id} className="flex items-center gap-2 p-2.5 bg-white dark:bg-gray-800 rounded-xl text-sm">
                <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="font-medium text-gray-900 dark:text-white">{s.time || '—'}</span>
                <span className="text-gray-500 truncate">{s.clientName} · {s.address}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-48">Trabajador</th>
              {hours.map(h => (
                <th key={h} className="px-1 py-3 text-center text-[10px] font-medium text-gray-400 w-12">{String(h).padStart(2, '0')}:00</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-750">
            {workers.map(w => {
              const workerSvcs = services.filter(s => s.workerId === w._id || s.assignedTo === w._id);
              return (
                <tr key={w._id} className="group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center text-white text-[10px] font-semibold shrink-0">
                        {getInitials(w.name)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{w.name}</p>
                        <p className="text-[10px] text-gray-400">{workerSvcs.length} svc · {(w.zones || []).join(', ') || '—'}</p>
                      </div>
                    </div>
                  </td>
                  {hours.map(h => {
                    const hourStr = String(h).padStart(2, '0');
                    const svc = workerSvcs.find(s => s.time && s.time.startsWith(hourStr));
                    return (
                      <td key={h} className="px-0.5 py-1">
                        {svc ? (
                          <div title={`${svc.time} - ${svc.clientName}\n${svc.address}`}
                            className={`h-8 rounded-lg text-[9px] font-medium flex items-center justify-center px-1 truncate ${
                              svc.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' :
                              svc.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' :
                              svc.status === 'cancelled' ? 'bg-gray-100 text-gray-400' :
                              'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400'
                            }`}>
                            {svc.clientName?.slice(0, 8)}
                          </div>
                        ) : (
                          <div className="h-8 rounded-lg bg-gray-50 dark:bg-gray-750 group-hover:bg-gray-100 dark:group-hover:bg-gray-700 transition-colors" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Productivity Panel ───────────────────────────────────────────────────────

function ProductivityPanel({ userId, workers: allWorkers, onOpenWorker }: {
  userId: string; workers: CleaningWorker[];
  onOpenWorker: (w: CleaningWorker) => void;
}) {
  const [data, setData] = useState<ProductivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'role', label: 'Puesto' },
    { key: 'zone', label: 'Zona' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'role', label: 'Puesto', example: '' },
    { key: 'zone', label: 'Zona', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!user?.id) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(user?.id, {
      create: (uid, data) => createCleaningWorkerRequest(uid, data),
    }, entries, (entry) => ({
      name: entryStr(entry, 'name', 'nombre'),
      phone: entryStr(entry, 'phone', 'telefono'),
      email: entryStr(entry, 'email'),
      role: entryStr(entry, 'role', 'rol') || 'worker',
    }));
    if (created > 0) {
      toast.success(`${created} trabajador(es) creado(s)`);
      void load();
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (period === 'today') return { from: now.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
    if (period === 'week') return { from: new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
    if (period === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo };
    return { from: new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
  }, [period, customFrom, customTo]);

  useEffect(() => {
    if (!dateRange.from || !dateRange.to) return;
    setLoading(true);
    getCleaningProductivityRequest(userId, dateRange.from, dateRange.to)
      .then(setData)
      .catch(() => toast.error('Error al cargar productividad'))
      .finally(() => setLoading(false));
  }, [userId, dateRange.from, dateRange.to]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" /></div>;
  if (!data) return <p className="text-sm text-gray-400 text-center py-12">Sin datos de productividad</p>;

  const t = data.totals;
  const profit = t.totalRevenue - t.totalLaborCost;
  const needsAttention = (data.workers || []).filter(w =>
    w.lateArrivals > 2 || w.absences > 0 || (w.avgQualityRating > 0 && w.avgQualityRating < 3)
  );

  const inputCls = 'px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm';

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['today', 'week', 'month', 'custom'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${period === p
              ? 'bg-cyan-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}>
            {p === 'today' ? 'Hoy' : p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : 'Personalizado'}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={inputCls} />
            <span className="text-gray-400">→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={inputCls} />
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: 'Horas servicio', value: `${t.totalServiceHours}h`, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Servicios', value: t.totalServicesCompleted, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Ingresos', value: `${t.totalRevenue.toLocaleString('es')}€`, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30' },
          { label: 'Coste laboral', value: `${t.totalLaborCost.toLocaleString('es')}€`, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30' },
          { label: 'Rentabilidad', value: `${profit >= 0 ? '+' : ''}${profit.toLocaleString('es')}€`, color: profit >= 0 ? 'text-emerald-600' : 'text-red-600', bg: profit >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-red-50 dark:bg-red-950/30' },
          { label: 'Svc/hora', value: t.avgServicesPerHour, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/30' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-2xl p-4`}>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Worker ranking */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-x-auto">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Ranking de trabajadores</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-750">
            <tr>
              {['#', 'Trabajador', 'Servicios', 'Horas', 'Svc/h', '€/h', 'Retrasos', 'Ausencias', 'Calidad', 'Rentabilidad'].map(h => (
                <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase ${h === '#' || h === 'Trabajador' ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-750">
            {(data.workers || []).map((m, i) => {
              const w = allWorkers.find(x => x._id === m.workerId);
              return (
                <tr key={m.workerId} onClick={() => w && onOpenWorker(w)} className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer">
                  <td className="px-4 py-3 text-gray-400 font-medium">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center text-white text-[10px] font-semibold shrink-0">
                        {getInitials(m.workerName)}
                      </div>
                      <span className="font-medium text-gray-900 dark:text-white">{m.workerName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{m.completedServices}</td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{m.serviceHours}h</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{m.servicesPerHour}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{m.revenuePerHour}€</td>
                  <td className="px-4 py-3 text-right">
                    <span className={m.lateArrivals > 2 ? 'px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold' : 'text-gray-500'}>{m.lateArrivals}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={m.absences > 0 ? 'px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold' : 'text-gray-500'}>{m.absences}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.avgQualityRating > 0 ? (
                      <span className="flex items-center justify-end gap-1">
                        <Star className={`w-3.5 h-3.5 ${m.avgQualityRating >= 4 ? 'text-amber-400 fill-amber-400' : m.avgQualityRating >= 3 ? 'text-amber-400' : 'text-red-400'}`} />
                        <span>{m.avgQualityRating}</span>
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${m.profitability >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {m.profitability >= 0 ? '+' : ''}{m.profitability}€
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cost by client */}
      {(data.costByClient || []).length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Coste laboral por cliente</h3>
          <div className="space-y-3">
            {data.costByClient.slice(0, 10).map((c, i) => {
              const maxCost = data.costByClient[0]?.laborCost || 1;
              const pct = Math.round((c.laborCost / maxCost) * 100);
              return (
                <div key={c.clientName}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-gray-900 dark:text-white">{c.clientName}</span>
                    <span className="text-gray-500 text-xs">{c.laborCost}€ · {c.totalHours}h · {c.servicesCount} svc</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${i < 3 ? 'bg-red-400' : 'bg-cyan-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Needs attention */}
      {needsAttention.length > 0 ? (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-3">
            <AlertTriangle className="w-4 h-4 inline-block mr-1.5" /> Necesita atención
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {needsAttention.map(m => {
              const w = allWorkers.find(x => x._id === m.workerId);
              const issues: string[] = [];
              if (m.lateArrivals > 2) issues.push(`${m.lateArrivals} retrasos`);
              if (m.absences > 0) issues.push(`${m.absences} ausencias`);
              if (m.avgQualityRating > 0 && m.avgQualityRating < 3) issues.push(`Calidad ${m.avgQualityRating}/5`);
              return (
                <div key={m.workerId} onClick={() => w && onOpenWorker(w)}
                  className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl cursor-pointer hover:shadow-md transition-shadow">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                    {getInitials(m.workerName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{m.workerName}</p>
                    <p className="text-xs text-amber-600">{issues.join(' · ')}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-6 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-800">
          <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Todo el equipo rinde bien en este período</p>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="cleaning_workers"
        moduleLabel="Trabajadores"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Trabajadores"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </div>
  );
}
