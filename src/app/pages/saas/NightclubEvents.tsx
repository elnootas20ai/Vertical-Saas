import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import {
  Search,
  X,
  Edit3,
  Trash2,
  Filter,
  CalendarDays,
  Ticket,
  DollarSign,
  Music,
  ChevronDown,
} from 'lucide-react';

type EventType = 'regular' | 'tematica' | 'concierto' | 'festival' | 'privado';
type EventStatus = 'programado' | 'en_venta' | 'sold_out' | 'finalizado' | 'cancelado';

interface NightEvent extends VerticalEntity {
  nombre: string;
  fecha: string;
  artista: string;
  tipo: EventType;
  aforoPrevisto: number;
  entradasVendidas: number;
  precioEntrada: number;
  estado: EventStatus;
}

const TYPE_LABELS: Record<EventType, string> = {
  regular: 'Sesión Regular', tematica: 'Fiesta Temática', concierto: 'Concierto', festival: 'Festival', privado: 'Privado',
};

const STATUS_CFG: Record<EventStatus, { label: string; bg: string; text: string }> = {
  programado:  { label: 'Programado', bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  en_venta:    { label: 'En Venta',   bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  sold_out:    { label: 'Sold Out',   bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
  finalizado:  { label: 'Finalizado', bg: 'bg-gray-200 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300' },
  cancelado:   { label: 'Cancelado',  bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300' },
};

const EMPTY: Omit<NightEvent, keyof VerticalEntity> = {
  nombre: '', fecha: '', artista: '', tipo: 'regular', aforoPrevisto: 0, entradasVendidas: 0, precioEntrada: 0, estado: 'programado',
};

export function NightclubEvents() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<NightEvent>('nightclub', 'events'), []);
  const userId = user?.user_id || user?.id || '';

  const [data, setData] = useState<NightEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<EventStatus | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<NightEvent | null>(null);
  const [form, setForm] = useState<Omit<NightEvent, keyof VerticalEntity>>(EMPTY);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'date', label: 'Fecha' },
    { key: 'artist', label: 'Artista' },
    { key: 'capacity', label: 'Aforo' },
    { key: 'price', label: 'Precio entrada' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'artist', label: 'Artista', example: '' },
    { key: 'capacity', label: 'Aforo', example: '' },
    { key: 'price', label: 'Precio entrada', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
      const nombre = entryStr(e, 'name', 'nombre');
      if (!nombre) return null;
      return {
        nombre,
        fecha: entryStr(e, 'date', 'fecha') || new Date().toISOString().slice(0, 10),
        artista: entryStr(e, 'artist', 'artista'),
        tipo: 'regular' as EventType,
        aforoPrevisto: entryNum(e, 'capacity', 'aforo'),
        entradasVendidas: 0,
        precioEntrada: entryNum(e, 'price', 'precio'),
        estado: 'programado' as EventStatus,
      };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} evento(s) creado(s)`);
    } else {
      toast.error('No se pudo crear ningún evento');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const items = await api.list(userId);
      setData(items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useModalClose(modalOpen, () => setModalOpen(false));

  const filtered = data.filter(e => {
    const s = search.toLowerCase();
    const matchSearch = e.nombre.toLowerCase().includes(s) || e.artista.toLowerCase().includes(s);
    const matchStatus = !filterStatus || e.estado === filterStatus;
    return matchSearch && matchStatus;
  });

  const upcoming = data.filter(e => e.fecha >= new Date().toISOString().slice(0, 10) && e.estado !== 'cancelado').sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  const totalTickets = data.filter(e => e.estado !== 'cancelado').reduce((s, e) => s + e.entradasVendidas, 0);
  const monthRevenue = data.filter(e => e.fecha.startsWith('2026-04') && e.estado !== 'cancelado').reduce((s, e) => s + e.entradasVendidas * e.precioEntrada, 0);
  const monthEvents = data.filter(e => e.fecha.startsWith('2026-04')).length;

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (e: NightEvent) => {
    setEditing(e);
    setForm({ nombre: e.nombre, fecha: e.fecha, artista: e.artista, tipo: e.tipo, aforoPrevisto: e.aforoPrevisto, entradasVendidas: e.entradasVendidas, precioEntrada: e.precioEntrada, estado: e.estado });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.nombre || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setModalOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const remove = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const stats = [
    { label: 'Próximo Evento', value: upcoming?.nombre ?? '—', icon: <CalendarDays className="w-5 h-5 text-purple-500" />, bg: 'bg-purple-50 dark:bg-purple-900/30' },
    { label: 'Entradas Vendidas', value: totalTickets.toLocaleString('es-ES'), icon: <Ticket className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Ingresos Mes', value: `${monthRevenue.toLocaleString('es-ES')} €`, icon: <DollarSign className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Eventos Mes', value: monthEvents, icon: <Music className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Eventos / Noches Temáticas">
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-white/70 dark:bg-gray-950/70">
            <div className="flex flex-col items-center gap-3 text-gray-700 dark:text-gray-200">
              <span className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-white" aria-hidden />
              <span className="text-sm font-medium">Cargando eventos…</span>
            </div>
          </div>
        )}
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-3`}>
              {s.icon}
              <div><p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p><p className="text-lg font-bold text-gray-900 dark:text-white">{s.value}</p></div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar evento o artista…" className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <div className="relative">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as EventStatus | '')} className="appearance-none pl-8 pr-8 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 outline-none">
                <option value="">Todos</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
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

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">Evento</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">DJ / Artista</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium text-right">Aforo</th>
                <th className="px-4 py-3 font-medium text-right">Vendidas</th>
                <th className="px-4 py-3 font-medium text-right">Precio</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{e.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{e.fecha}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{e.artista}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{TYPE_LABELS[e.tipo]}</span></td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{e.aforoPrevisto}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{e.entradasVendidas}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{e.precioEntrada} €</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CFG[e.estado].bg} ${STATUS_CFG[e.estado].text}`}>{STATUS_CFG[e.estado].label}</span></td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => remove(e._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {!filtered.length && !loading && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No se encontraron eventos</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{editing ? 'Editar Evento' : 'Nuevo Evento'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del evento</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha</label><input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">DJ / Artista</label><input value={form.artista} onChange={e => setForm({ ...form, artista: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as EventType })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500">
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as EventStatus })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500">
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Aforo</label><input type="number" value={form.aforoPrevisto} onChange={e => setForm({ ...form, aforoPrevisto: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vendidas</label><input type="number" value={form.entradasVendidas} onChange={e => setForm({ ...form, entradasVendidas: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio €</label><input type="number" value={form.precioEntrada} onChange={e => setForm({ ...form, precioEntrada: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
              <button onClick={save} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="nightclub_events"
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
