import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../../context/AuthContext';
import {
  ArrowLeft,
  HardHat,
  ClipboardList,
  Package,
  Clock,
  Plus,
  Search,
  X,
  FileText,
  AlertCircle,
  CheckCircle2,
  Send,
  Hammer,
} from 'lucide-react';

type WorkReportStatus = 'borrador' | 'enviado' | 'aprobado';
type MaterialUrgency = 'normal' | 'urgente';
type MaterialRequestStatus = 'solicitado' | 'aprobado' | 'entregado';

interface WorkReport {
  id: string;
  date: string;
  taskDescription: string;
  hours: number;
  materialsUsed: string;
  notes: string;
  status: WorkReportStatus;
}

interface MaterialRequest {
  id: string;
  itemName: string;
  quantity: number;
  urgency: MaterialUrgency;
  status: MaterialRequestStatus;
  createdAt: string;
}

const WORK_STATUS_CFG: Record<WorkReportStatus, { label: string; color: string; bg: string }> = {
  borrador: { label: 'Borrador', color: 'text-gray-700', bg: 'bg-gray-50 border-gray-300 dark:bg-gray-800 dark:border-gray-600' },
  enviado: { label: 'Enviado', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-300 dark:bg-blue-950/40 dark:border-blue-700' },
  aprobado: { label: 'Aprobado', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-700' },
};

const MATERIAL_STATUS_CFG: Record<MaterialRequestStatus, { label: string; color: string; bg: string }> = {
  solicitado: { label: 'Solicitado', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:border-amber-700' },
  aprobado: { label: 'Aprobado', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-300 dark:bg-blue-950/40 dark:border-blue-700' },
  entregado: { label: 'Entregado', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-700' },
};

const URGENCY_CFG: Record<MaterialUrgency, { label: string; color: string }> = {
  normal: { label: 'Normal', color: 'text-gray-600 dark:text-gray-400' },
  urgente: { label: 'Urgente', color: 'text-red-600 dark:text-red-400' },
};

type MainTab = 'partes' | 'materiales';
type SubView = 'list' | 'nuevo_parte' | 'nueva_solicitud';

function isTodayISO(dateStr: string) {
  const d = new Date(dateStr);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

export function WorkerTpvConstruction() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const workerName = user?.firstName ? `${user.firstName} ${user?.lastName || ''}`.trim() : 'Operario';

  const [tab, setTab] = useState<MainTab>('partes');
  const [subView, setSubView] = useState<SubView>('list');
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [materials, setMaterials] = useState<MaterialRequest[]>([]);
  const [search, setSearch] = useState('');
  const [filterReportStatus, setFilterReportStatus] = useState<WorkReportStatus | 'all'>('all');
  const [filterMaterialStatus, setFilterMaterialStatus] = useState<MaterialRequestStatus | 'all'>('all');
  const [filterUrgency, setFilterUrgency] = useState<MaterialUrgency | 'all'>('all');

  const [reportForm, setReportForm] = useState({
    taskDescription: '',
    hours: 0,
    materialsUsed: '',
    notes: '',
  });
  const [materialForm, setMaterialForm] = useState({
    itemName: '',
    quantity: 1,
    urgency: 'normal' as MaterialUrgency,
  });

  const stats = useMemo(() => {
    const horasHoy = reports
      .filter(r => isTodayISO(r.date))
      .reduce((s, r) => s + (Number(r.hours) || 0), 0);
    const partesPendientes = reports.filter(r => r.status === 'borrador' || r.status === 'enviado').length;
    const solicitudesMaterial = materials.filter(m => m.status === 'solicitado' || m.status === 'aprobado').length;
    return { horasHoy, partesPendientes, solicitudesMaterial };
  }, [reports, materials]);

  const filteredReports = useMemo(() => {
    const q = search.toLowerCase();
    return reports.filter(r => {
      if (search && !r.taskDescription.toLowerCase().includes(q) && !r.materialsUsed.toLowerCase().includes(q) && !r.notes.toLowerCase().includes(q) && !r.id.toLowerCase().includes(q)) return false;
      if (filterReportStatus !== 'all' && r.status !== filterReportStatus) return false;
      return true;
    });
  }, [reports, search, filterReportStatus]);

  const filteredMaterials = useMemo(() => {
    const q = search.toLowerCase();
    return materials.filter(m => {
      if (search && !m.itemName.toLowerCase().includes(q) && !m.id.toLowerCase().includes(q)) return false;
      if (filterMaterialStatus !== 'all' && m.status !== filterMaterialStatus) return false;
      if (filterUrgency !== 'all' && m.urgency !== filterUrgency) return false;
      return true;
    });
  }, [materials, search, filterMaterialStatus, filterUrgency]);

  const addReport = () => {
    if (!reportForm.taskDescription.trim() || reportForm.hours <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    setReports(prev => [
      ...prev,
      {
        id: uuidv4(),
        date: today,
        taskDescription: reportForm.taskDescription.trim(),
        hours: reportForm.hours,
        materialsUsed: reportForm.materialsUsed.trim(),
        notes: reportForm.notes.trim(),
        status: 'borrador',
      },
    ]);
    setReportForm({ taskDescription: '', hours: 0, materialsUsed: '', notes: '' });
    setSubView('list');
  };

  const addMaterialRequest = () => {
    if (!materialForm.itemName.trim() || materialForm.quantity < 1) return;
    setMaterials(prev => [
      ...prev,
      {
        id: uuidv4(),
        itemName: materialForm.itemName.trim(),
        quantity: materialForm.quantity,
        urgency: materialForm.urgency,
        status: 'solicitado',
        createdAt: new Date().toISOString(),
      },
    ]);
    setMaterialForm({ itemName: '', quantity: 1, urgency: 'normal' });
    setSubView('list');
  };

  const advanceReportStatus = (id: string) => {
    const flow: WorkReportStatus[] = ['borrador', 'enviado', 'aprobado'];
    setReports(prev =>
      prev.map(r => {
        if (r.id !== id) return r;
        const i = flow.indexOf(r.status);
        if (i < flow.length - 1) return { ...r, status: flow[i + 1] };
        return r;
      }),
    );
  };

  const advanceMaterialStatus = (id: string) => {
    const flow: MaterialRequestStatus[] = ['solicitado', 'aprobado', 'entregado'];
    setMaterials(prev =>
      prev.map(m => {
        if (m.id !== id) return m;
        const i = flow.indexOf(m.status);
        if (i < flow.length - 1) return { ...m, status: flow[i + 1] };
        return m;
      }),
    );
  };

  if (subView === 'nuevo_parte') {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSubView('list')} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nuevo parte de trabajo</h1>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Tarea / descripción *</label>
            <textarea
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm min-h-[88px]"
              value={reportForm.taskDescription}
              onChange={e => setReportForm(f => ({ ...f, taskDescription: e.target.value }))}
              placeholder="Ej. Encofrado muro bloque 3, armado de pilares..."
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Horas *</label>
            <input
              type="number"
              min={0.25}
              step={0.25}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm"
              value={reportForm.hours || ''}
              onChange={e => setReportForm(f => ({ ...f, hours: parseFloat(e.target.value) || 0 }))}
              placeholder="8"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Materiales empleados</label>
            <textarea
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm min-h-[72px]"
              value={reportForm.materialsUsed}
              onChange={e => setReportForm(f => ({ ...f, materialsUsed: e.target.value }))}
              placeholder="Cemento, varillas Ø12, tablones..."
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Notas</label>
            <textarea
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm min-h-[72px]"
              value={reportForm.notes}
              onChange={e => setReportForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Incidencias, condiciones meteorológicas, coordinación..."
            />
          </div>
        </div>
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex gap-2">
          <button type="button" onClick={() => setSubView('list')} className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancelar
          </button>
          <button type="button" onClick={addReport} className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 shadow-md">
            Guardar borrador
          </button>
        </div>
      </div>
    );
  }

  if (subView === 'nueva_solicitud') {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSubView('list')} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Solicitar material</h1>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Artículo *</label>
            <input
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm"
              value={materialForm.itemName}
              onChange={e => setMaterialForm(f => ({ ...f, itemName: e.target.value }))}
              placeholder="Ej. Mortero cola C2, tacos químicos M12..."
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Cantidad *</label>
            <input
              type="number"
              min={1}
              step={1}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm"
              value={materialForm.quantity || ''}
              onChange={e => setMaterialForm(f => ({ ...f, quantity: parseInt(e.target.value, 10) || 0 }))}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Urgencia</label>
            <div className="flex gap-2">
              {(['normal', 'urgente'] as const).map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setMaterialForm(f => ({ ...f, urgency: u }))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                    materialForm.urgency === u
                      ? u === 'urgente'
                        ? 'border-red-500 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
                        : 'border-gray-900 dark:border-gray-300 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  {URGENCY_CFG[u].label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex gap-2">
          <button type="button" onClick={() => setSubView('list')} className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancelar
          </button>
          <button type="button" onClick={addMaterialRequest} className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 shadow-md">
            Enviar solicitud
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/saas/worker/tasks')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 shrink-0" />
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/40 rounded-xl flex items-center justify-center shrink-0">
              <HardHat className="w-5 h-5 text-amber-800 dark:text-amber-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">Mi Puesto - Obra</h1>
              <p className="text-xs text-gray-500 truncate">{workerName}</p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/saas/worker/construction-report')}
          className="w-full mb-3 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-md transition-colors"
        >
          <ClipboardList className="w-4 h-4" /> Registrar parte de hoy
        </button>

        <div className="flex gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => {
              setTab('partes');
              setSearch('');
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === 'partes' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <ClipboardList className="w-4 h-4" /> Partes de trabajo
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('materiales');
              setSearch('');
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === 'materiales' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Package className="w-4 h-4" /> Materiales
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: 'Horas hoy', value: stats.horasHoy.toFixed(1), icon: <Clock className="w-3.5 h-3.5" />, color: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-800' },
            { label: 'Partes pend.', value: stats.partesPendientes, icon: <FileText className="w-3.5 h-3.5" />, color: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800' },
            { label: 'Solicitudes', value: stats.solicitudesMaterial, icon: <Package className="w-3.5 h-3.5" />, color: 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-200 dark:border-violet-800' },
          ].map(s => (
            <div key={s.label} className={`rounded-2xl border-2 p-2.5 text-center ${s.color}`}>
              <div className="flex items-center justify-center gap-1 mb-0.5 opacity-80">{s.icon}</div>
              <p className="text-xl font-bold leading-tight">{s.value}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {tab === 'partes' && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {([{ id: 'all', label: 'Todos' }, { id: 'borrador', label: 'Borrador' }, { id: 'enviado', label: 'Enviado' }, { id: 'aprobado', label: 'Aprobado' }] as const).map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterReportStatus(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filterReportStatus === f.id ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'materiales' && (
          <div className="space-y-2 mb-2">
            <div className="flex flex-wrap gap-1.5">
              {([{ id: 'all', label: 'Todos' }, { id: 'solicitado', label: 'Solicitado' }, { id: 'aprobado', label: 'Aprobado' }, { id: 'entregado', label: 'Entregado' }] as const).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterMaterialStatus(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    filterMaterialStatus === f.id ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([{ id: 'all', label: 'Todas urgencias' }, { id: 'normal', label: 'Normal' }, { id: 'urgente', label: 'Urgente' }] as const).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterUrgency(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    filterUrgency === f.id ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'partes' ? 'Buscar tarea, materiales, notas, UUID...' : 'Buscar artículo, UUID...'}
            className="w-full pl-9 pr-8 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === 'partes' ? (
          filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <ClipboardList className="w-10 h-10 mb-2" />
              <p className="text-sm font-medium text-center">No hay partes en esta vista</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReports.map(r => {
                const cfg = WORK_STATUS_CFG[r.status];
                const canAdvance = r.status !== 'aprobado';
                return (
                  <div key={r.id} className={`rounded-2xl border-2 p-4 transition-all hover:shadow-lg ${cfg.bg}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-gray-500 dark:text-gray-400 break-all">{r.id}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(r.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                          <span className="mx-1">·</span>
                          <span className="font-semibold text-gray-700 dark:text-gray-300">{r.hours} h</span>
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">{r.taskDescription}</p>
                    {r.materialsUsed && (
                      <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 mb-2">
                        <Hammer className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{r.materialsUsed}</span>
                      </div>
                    )}
                    {r.notes && <p className="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200/80 dark:border-gray-600/40 pt-2 mt-2">{r.notes}</p>}
                    {canAdvance && (
                      <div className="mt-3 pt-2 border-t border-gray-200/80 dark:border-gray-600/40">
                        <button
                          type="button"
                          onClick={() => advanceReportStatus(r.id)}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90"
                        >
                          {r.status === 'borrador' && (
                            <>
                              <Send className="w-3.5 h-3.5" /> Enviar parte
                            </>
                          )}
                          {r.status === 'enviado' && (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Simular aprobación
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : filteredMaterials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Package className="w-10 h-10 mb-2" />
            <p className="text-sm font-medium text-center">No hay solicitudes en esta vista</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMaterials.map(m => {
              const st = MATERIAL_STATUS_CFG[m.status];
              const urg = URGENCY_CFG[m.urgency];
              const canAdvance = m.status !== 'entregado';
              return (
                <div key={m.id} className={`rounded-2xl border-2 p-4 transition-all hover:shadow-lg ${st.bg}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <span className="text-xs font-mono text-gray-500 dark:text-gray-400 break-all block">{m.id}</span>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(m.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${st.bg} ${st.color}`}>{st.label}</span>
                      {m.urgency === 'urgente' && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
                          <AlertCircle className="w-3 h-3" /> URGENTE
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{m.itemName}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Cantidad: <span className="font-semibold text-gray-900 dark:text-gray-100">{m.quantity}</span>
                    <span className={` ml-2 text-xs font-semibold ${urg.color}`}>({urg.label})</span>
                  </p>
                  {canAdvance && (
                    <button
                      type="button"
                      onClick={() => advanceMaterialStatus(m.id)}
                      className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90"
                    >
                      {m.status === 'solicitado' && 'Marcar aprobado (simulado)'}
                      {m.status === 'aprobado' && 'Marcar entregado'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
        <button
          type="button"
          onClick={() => setSubView(tab === 'partes' ? 'nuevo_parte' : 'nueva_solicitud')}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl text-sm font-semibold hover:opacity-90 shadow-md transition border-2 border-transparent"
        >
          <Plus className="w-4 h-4" />
          {tab === 'partes' ? 'Nuevo parte de trabajo' : 'Solicitar material'}
        </button>
      </div>
    </div>
  );
}
