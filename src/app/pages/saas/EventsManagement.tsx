import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit3, Trash2, CalendarDays, MapPin,
  Users, DollarSign, CheckCircle, AlertCircle, Clock, Ban,
  PartyPopper, TrendingUp, Calendar, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type EventType = 'boda' | 'corporativo' | 'cumpleaños' | 'conferencia' | 'feria' | 'gala';
type EventStatus = 'planificacion' | 'confirmado' | 'en_curso' | 'finalizado' | 'cancelado';

interface Event extends VerticalEntity {
  nombre: string;
  tipo: EventType;
  fecha: string;
  lugar: string;
  cliente: string;
  invitados: number;
  presupuesto: number;
  estado: EventStatus;
}

type EventForm = Omit<Event, keyof VerticalEntity>;

const TYPE_LABELS: Record<EventType, { label: string; bg: string; text: string }> = {
  boda:         { label: 'Boda',         bg: 'bg-pink-100 dark:bg-pink-900/40',    text: 'text-pink-700 dark:text-pink-300' },
  corporativo:  { label: 'Corporativo',  bg: 'bg-blue-100 dark:bg-blue-900/40',    text: 'text-blue-700 dark:text-blue-300' },
  'cumpleaños': { label: 'Cumpleaños',   bg: 'bg-amber-100 dark:bg-amber-900/40',  text: 'text-amber-700 dark:text-amber-300' },
  conferencia:  { label: 'Conferencia',  bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300' },
  feria:        { label: 'Feria',        bg: 'bg-teal-100 dark:bg-teal-900/40',    text: 'text-teal-700 dark:text-teal-300' },
  gala:         { label: 'Gala',         bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
};

const STATUS_CONFIG: Record<EventStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  planificacion: { label: 'Planificación', bg: 'bg-slate-100 dark:bg-slate-800',       text: 'text-slate-700 dark:text-slate-300', icon: <Clock className="w-3.5 h-3.5" /> },
  confirmado:    { label: 'Confirmado',    bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  en_curso:      { label: 'En curso',      bg: 'bg-blue-50 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-300', icon: <AlertCircle className="w-3.5 h-3.5" /> },
  finalizado:    { label: 'Finalizado',    bg: 'bg-gray-100 dark:bg-gray-700/50',      text: 'text-gray-600 dark:text-gray-400', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  cancelado:     { label: 'Cancelado',     bg: 'bg-red-50 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-300', icon: <Ban className="w-3.5 h-3.5" /> },
};

const EMPTY_FORM: EventForm = { nombre: '', tipo: 'boda', fecha: '', lugar: '', cliente: '', invitados: 0, presupuesto: 0, estado: 'planificacion' };

export function EventsManagement() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Event>('events', 'events'), []);
  const userId = user?.user_id || user?.id || '';

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<EventStatus | ''>('');
  const [filterType, setFilterType] = useState<EventType | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
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
      setEvents(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'date', label: 'Fecha' },
    { key: 'venue', label: 'Local' },
    { key: 'capacity', label: 'Aforo' },
    { key: 'type', label: 'Tipo' },
    { key: 'budget', label: 'Presupuesto' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'venue', label: 'Local', example: '' },
    { key: 'capacity', label: 'Aforo', example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'budget', label: 'Presupuesto', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} evento(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} evento(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => events.filter(e => {
    const ms = e.nombre.toLowerCase().includes(search.toLowerCase()) || e.cliente.toLowerCase().includes(search.toLowerCase()) || e.lugar.toLowerCase().includes(search.toLowerCase());
    const mst = !filterStatus || e.estado === filterStatus;
    const mt = !filterType || e.tipo === filterType;
    return ms && mst && mt;
  }), [events, search, filterStatus, filterType]);

  const stats = useMemo(() => {
    const activos = events.filter(e => ['planificacion', 'confirmado', 'en_curso'].includes(e.estado)).length;
    const futureEvents = events.filter(e => e.estado !== 'finalizado' && e.estado !== 'cancelado').sort((a, b) => a.fecha.localeCompare(b.fecha));
    const proximo = futureEvents[0]?.fecha || '—';
    const ingresosmes = events.filter(e => e.fecha.startsWith('2026-04')).reduce((s, e) => s + e.presupuesto, 0);
    const eventosAnio = events.length;
    return { activos, proximo, ingresosmes, eventosAnio };
  }, [events]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (e: Event) => {
    setEditing(e);
    setForm({
      nombre: e.nombre,
      tipo: e.tipo,
      fecha: e.fecha,
      lugar: e.lugar,
      cliente: e.cliente,
      invitados: e.invitados,
      presupuesto: e.presupuesto,
      estado: e.estado,
    });
    setShowModal(true);
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error from fetch */
    }
  };

  const handleSave = async () => {
    if (!form.nombre || !form.fecha || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* error from fetch */
    }
  };

  const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 });

  const statsCards = [
    { label: 'Eventos activos', value: stats.activos, icon: <PartyPopper className="w-5 h-5 text-violet-500" />, bg: 'bg-violet-50 dark:bg-violet-900/30' },
    { label: 'Próximo evento', value: stats.proximo, icon: <Calendar className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Ingresos mes', value: fmt(stats.ingresosmes), icon: <TrendingUp className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Eventos año', value: stats.eventosAnio, icon: <CalendarDays className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Gestión de Eventos">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsCards.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-4`}>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{s.icon}</div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar evento, cliente, lugar..." disabled={loading} className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <select value={filterType} onChange={e => setFilterType(e.target.value as any)} disabled={loading} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Todos los tipos</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} disabled={loading} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <AddButtonDropdown
                label="Nuevo Evento"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de evento"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Evento</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Lugar</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Invitados</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Presupuesto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Acciones</th>
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
              ) : filtered.map(e => {
                const st = STATUS_CONFIG[e.estado];
                const tp = TYPE_LABELS[e.tipo];
                return (
                  <tr key={e._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{e.nombre}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tp.bg} ${tp.text}`}>{tp.label}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{e.fecha}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell"><span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{e.lugar}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{e.cliente}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell"><span className="flex items-center gap-1"><Users className="w-3 h-3" />{e.invitados}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{fmt(e.presupuesto)}</span></td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>{st.icon}{st.label}</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => void handleDelete(e._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron eventos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Evento' : 'Nuevo Evento'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del evento</label>
                <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as EventType }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lugar</label>
                  <input value={form.lugar} onChange={e => setForm(p => ({ ...p, lugar: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
                  <input value={form.cliente} onChange={e => setForm(p => ({ ...p, cliente: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invitados previstos</label>
                  <input type="number" value={form.invitados} onChange={e => setForm(p => ({ ...p, invitados: +e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Presupuesto (€)</label>
                  <input type="number" value={form.presupuesto} onChange={e => setForm(p => ({ ...p, presupuesto: +e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value as EventStatus }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="events_management"
        moduleLabel="Eventos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Eventos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
