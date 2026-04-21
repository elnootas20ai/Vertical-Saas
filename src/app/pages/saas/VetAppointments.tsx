import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import { toast } from 'sonner';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import {
  Search, X, Edit2, Trash2, Filter,
  CalendarDays, CheckCircle2, Clock, XCircle,
  Loader2,
} from 'lucide-react';

type ApptType = 'consulta' | 'vacunación' | 'cirugía' | 'revisión' | 'urgencia';
type ApptStatus = 'programada' | 'en_curso' | 'completada' | 'cancelada';

interface Appointment extends VerticalEntity {
  fecha: string;
  hora: string;
  paciente: string;
  propietario: string;
  veterinario: string;
  tipo: ApptType;
  estado: ApptStatus;
  notas: string;
}

type AppointmentForm = Omit<Appointment, keyof VerticalEntity>;

const TYPE_CFG: Record<ApptType, { label: string }> = {
  consulta: { label: 'Consulta' },
  'vacunación': { label: 'Vacunación' },
  cirugía: { label: 'Cirugía' },
  revisión: { label: 'Revisión' },
  urgencia: { label: 'Urgencia' },
};

const STATUS_CFG: Record<ApptStatus, { label: string; dot: string }> = {
  programada: { label: 'Programada', dot: 'bg-blue-500' },
  en_curso: { label: 'En curso', dot: 'bg-amber-500' },
  completada: { label: 'Completada', dot: 'bg-emerald-500' },
  cancelada: { label: 'Cancelada', dot: 'bg-red-500' },
};

const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY_FORM: AppointmentForm = {
  fecha: TODAY, hora: '09:00', paciente: '', propietario: '', veterinario: '',
  tipo: 'consulta', estado: 'programada', notas: '',
};

export function VetAppointments() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Appointment>('vet', 'appointments'), []);
  const userId = user?.user_id || user?.id || '';

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ApptStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [form, setForm] = useState<AppointmentForm>(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'pet', label: 'Mascota' },
    { key: 'owner', label: 'Propietario' },
    { key: 'date', label: 'Fecha' },
    { key: 'time', label: 'Hora' },
    { key: 'reason', label: 'Motivo' },
    { key: 'vet', label: 'Veterinario' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'pet', label: 'Mascota', example: '' },
    { key: 'owner', label: 'Propietario', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'time', label: 'Hora', example: '' },
    { key: 'reason', label: 'Motivo', example: '' },
    { key: 'vet', label: 'Veterinario', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} cita(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} cita(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setAppointments(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => appointments.filter(a => {
    const q = search.toLowerCase();
    if (search && !a.paciente.toLowerCase().includes(q) && !a.propietario.toLowerCase().includes(q) && !a.veterinario.toLowerCase().includes(q) && !a.notas.toLowerCase().includes(q)) return false;
    if (filterStatus !== 'all' && a.estado !== filterStatus) return false;
    return true;
  }), [appointments, search, filterStatus]);

  const stats = useMemo(() => {
    const hoy = appointments.filter(a => a.fecha === TODAY);
    const citasHoy = hoy.length;
    const completadasHoy = hoy.filter(a => a.estado === 'completada').length;
    const pendientes = appointments.filter(a => a.estado === 'programada' || a.estado === 'en_curso').length;
    const canceladas = appointments.filter(a => a.estado === 'cancelada').length;
    return { citasHoy, completadasHoy, pendientes, canceladas };
  }, [appointments]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (a: Appointment) => {
    setEditing(a);
    setForm({
      fecha: a.fecha, hora: a.hora, paciente: a.paciente, propietario: a.propietario,
      veterinario: a.veterinario, tipo: a.tipo, estado: a.estado, notas: a.notas,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.paciente.trim() || !form.fecha.trim() || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* error shown by fetch layer */
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error shown by fetch layer */
    }
  };

  const STAT_CARDS = [
    { label: 'Citas hoy', value: stats.citasHoy, icon: CalendarDays, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Completadas hoy', value: stats.completadasHoy, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Pendientes', value: stats.pendientes, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Canceladas', value: stats.canceladas, icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
  ];

  return (
    <Layout title="Citas">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por paciente, propietario, veterinario o notas..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value as ApptStatus | 'all')} disabled={loading}>
                <option value="all">Todos los estados</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nueva cita"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de cita"
              />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Fecha</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Hora</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Paciente</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Propietario</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Veterinario</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Notas</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(a => (
                <tr key={a._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{a.fecha}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{a.hora}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{a.paciente}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{a.propietario}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{a.veterinario}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{TYPE_CFG[a.tipo].label}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${STATUS_CFG[a.estado].dot}`} />{STATUS_CFG[a.estado].label}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[200px] truncate" title={a.notas}>{a.notas}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(a)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => handleDelete(a._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay citas con los filtros seleccionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar cita' : 'Nueva cita'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha *</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Hora</label>
                  <input type="time" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Paciente (animal) *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.paciente} onChange={e => setForm(f => ({ ...f, paciente: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Propietario</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.propietario} onChange={e => setForm(f => ({ ...f, propietario: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Veterinario</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.veterinario} onChange={e => setForm(f => ({ ...f, veterinario: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as ApptType }))}>
                    {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Estado</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as ApptStatus }))}>
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Notas</label>
                <textarea rows={3} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 resize-y" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Crear cita'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="vet_appointments"
        moduleLabel="Citas"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Citas"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
