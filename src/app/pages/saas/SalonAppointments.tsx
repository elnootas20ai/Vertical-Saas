import { useState, useMemo, useCallback, useEffect } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  CalendarDays, Plus, Search, Edit3, Trash2, X, Clock,
  CheckCircle, AlertCircle, Ban, UserCheck, DollarSign,
  Play, EyeOff, Filter, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type AppointmentStatus = 'confirmada' | 'pendiente' | 'en_curso' | 'completada' | 'no_show' | 'cancelada';

interface Appointment extends VerticalEntity {
  cliente: string;
  servicio: string;
  estilista: string;
  fecha: string;
  hora: string;
  duracion: number;
  estado: AppointmentStatus;
  importe: number;
}

type AppointmentForm = Omit<Appointment, keyof VerticalEntity>;

const STATUS_CFG: Record<AppointmentStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  confirmada: { label: 'Confirmada', bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  pendiente: { label: 'Pendiente', bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', icon: <AlertCircle className="w-3.5 h-3.5" /> },
  en_curso: { label: 'En curso', bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', icon: <Play className="w-3.5 h-3.5" /> },
  completada: { label: 'Completada', bg: 'bg-indigo-50 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  no_show: { label: 'No show', bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', icon: <EyeOff className="w-3.5 h-3.5" /> },
  cancelada: { label: 'Cancelada', bg: 'bg-gray-100 dark:bg-gray-700/50', text: 'text-gray-600 dark:text-gray-400', icon: <Ban className="w-3.5 h-3.5" /> },
};

const ESTILISTAS = ['Laura Méndez', 'Carlos Ruiz', 'Sofía Torres', 'Miguel Ángel Pardo'];
const SERVICIOS = ['Corte señora', 'Corte caballero', 'Tinte raíz', 'Mechas balayage', 'Peinado evento', 'Tratamiento keratina', 'Barba', 'Manicura'];
const TIME_SLOTS = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00'];

const emptyForm = (): AppointmentForm => ({
  cliente: '', servicio: SERVICIOS[0], estilista: ESTILISTAS[0],
  fecha: '', hora: TIME_SLOTS[0], duracion: 30, estado: 'pendiente', importe: 0,
});

export function SalonAppointments() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Appointment>('salon', 'appointments'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<AppointmentStatus | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [form, setForm] = useState<AppointmentForm>(emptyForm());
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'client', label: 'Cliente' },
    { key: 'service', label: 'Servicio' },
    { key: 'stylist', label: 'Estilista' },
    { key: 'date', label: 'Fecha' },
    { key: 'time', label: 'Hora' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'client', label: 'Cliente', example: '' },
    { key: 'service', label: 'Servicio', example: '' },
    { key: 'stylist', label: 'Estilista', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'time', label: 'Hora', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const cliente = entryStr(e, 'cliente', 'client');
    if (!cliente) return null;
    return {
      cliente,
      servicio: entryStr(e, 'servicio'),
      estilista: entryStr(e, 'estilista'),
      fecha: entryStr(e, 'fecha', 'date') || '',
      hora: entryStr(e, 'hora', 'time'),
      duracion: entryNum(e, 'duracion'),
      estado: entryStr(e, 'estado', 'status') || 'pendiente',
      importe: entryNum(e, 'importe'),
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} cita creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  const filtered = items.filter(a => {
    const s = search.toLowerCase();
    const matchSearch = a.cliente.toLowerCase().includes(s) || a.servicio.toLowerCase().includes(s) || a.estilista.toLowerCase().includes(s);
    const matchStatus = !filterStatus || a.estado === filterStatus;
    return matchSearch && matchStatus;
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayAppts = items.filter(a => a.fecha === today);
  const citasHoy = todayAppts.length;
  const completadas = todayAppts.filter(a => a.estado === 'completada').length;
  const ingresosHoy = todayAppts.filter(a => a.estado === 'completada').reduce((s, a) => s + a.importe, 0);
  const proxima = todayAppts.filter(a => a.estado === 'confirmada' || a.estado === 'pendiente').sort((a, b) => a.hora.localeCompare(b.hora))[0];
  useModalClose(showModal, () => setShowModal(false));

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (a: Appointment) => {
    setEditing(a);
    setForm({
      cliente: a.cliente, servicio: a.servicio, estilista: a.estilista, fecha: a.fecha, hora: a.hora,
      duracion: a.duracion, estado: a.estado, importe: a.importe,
    });
    setShowModal(true);
  };
  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* fetch layer */
    }
  };
  const handleSave = async () => {
    if (!form.cliente || !form.fecha || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* fetch layer */
    }
  };

  const stats = [
    { label: 'Citas hoy', value: citasHoy, icon: <CalendarDays className="w-5 h-5 text-violet-500" />, bg: 'bg-violet-50 dark:bg-violet-900/20' },
    { label: 'Completadas', value: completadas, icon: <CheckCircle className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: 'Ingresos hoy', value: `${ingresosHoy} €`, icon: <DollarSign className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Próxima cita', value: proxima ? `${proxima.hora} - ${proxima.cliente}` : '—', icon: <Clock className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/20' },
  ];

  return (
    <Layout title="Citas / Agenda">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-3`}>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{s.icon}</div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white truncate max-w-[180px]">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente, servicio, estilista…" disabled={loading} className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} disabled={loading} className="pl-8 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                <option value="">Todos los estados</option>
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

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Servicio</th><th className="px-4 py-3">Estilista</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Hora</th><th className="px-4 py-3">Duración</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Importe</th><th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-500">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(a => {
                const st = STATUS_CFG[a.estado];
                return (
                  <tr key={a._id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{a.cliente}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.servicio}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.estilista}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.fecha}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.hora}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.duracion} min</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>{st.icon}{st.label}</span></td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{a.importe} €</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                        <button type="button" onClick={() => void handleDelete(a._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 className="w-4 h-4 text-red-500" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && !filtered.length && (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400">No se encontraron citas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar cita' : 'Nueva cita'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Cliente</label>
                <input value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Servicio</label>
                <select value={form.servicio} onChange={e => setForm({ ...form, servicio: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                  {SERVICIOS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Estilista</label>
                <select value={form.estilista} onChange={e => setForm({ ...form, estilista: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                  {ESTILISTAS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Fecha</label>
                <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Hora</label>
                <select value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                  {TIME_SLOTS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Duración (min)</label>
                <input type="number" value={form.duracion} onChange={e => setForm({ ...form, duracion: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Importe (€)</label>
                <input type="number" value={form.importe} onChange={e => setForm({ ...form, importe: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Estado</label>
                <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as AppointmentStatus })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                  {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex justify-end gap-2 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors">
                {editing ? 'Guardar cambios' : 'Crear cita'}
              </button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="salon_appointments"
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
