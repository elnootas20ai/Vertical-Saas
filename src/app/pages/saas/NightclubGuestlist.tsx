import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { toast } from 'sonner';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import {
  Search,
  X,
  Edit3,
  Trash2,
  Filter,
  ChevronDown,
  ClipboardList,
  UserCheck,
  UserX,
  LogIn,
  Clock,
} from 'lucide-react';

type GuestType = 'lista' | 'invitacion' | 'vip' | 'backstage';
type GuestStatus = 'en_lista' | 'dentro' | 'no_show';

interface Guest extends VerticalEntity {
  nombre: string;
  promotor: string;
  evento: string;
  tipo: GuestType;
  horaLlegada: string;
  estado: GuestStatus;
}

const TYPE_LABELS: Record<GuestType, string> = {
  lista: 'Lista', invitacion: 'Invitación', vip: 'VIP', backstage: 'Backstage',
};

const TYPE_COLORS: Record<GuestType, string> = {
  lista: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  invitacion: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  vip: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  backstage: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
};

const STATUS_CFG: Record<GuestStatus, { label: string; bg: string; text: string }> = {
  en_lista: { label: 'En Lista', bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  dentro:   { label: 'Dentro',   bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  no_show:  { label: 'No Show',  bg: 'bg-gray-200 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300' },
};

const EMPTY: Omit<Guest, keyof VerticalEntity> = { nombre: '', promotor: '', evento: '', tipo: 'lista', horaLlegada: '', estado: 'en_lista' };

export function NightclubGuestlist() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Guest>('nightclub', 'guestlist'), []);
  const userId = user?.user_id || user?.id || '';

  const [data, setData] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<GuestStatus | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Guest | null>(null);
  const [form, setForm] = useState<Omit<Guest, keyof VerticalEntity>>(EMPTY);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'event', label: 'Evento' },
    { key: 'guests', label: 'Acompañantes' },
    { key: 'vip', label: 'VIP' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'event', label: 'Evento', example: '' },
    { key: 'guests', label: 'Acompañantes', example: '' },
    { key: 'vip', label: 'VIP', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} invitado(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} invitado(s) importado(s)`);
  };

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

  const filtered = data.filter(g => {
    const s = search.toLowerCase();
    const matchSearch = g.nombre.toLowerCase().includes(s) || g.promotor.toLowerCase().includes(s);
    const matchStatus = !filterStatus || g.estado === filterStatus;
    return matchSearch && matchStatus;
  });

  const enLista = data.filter(g => g.estado === 'en_lista').length;
  const dentro = data.filter(g => g.estado === 'dentro').length;
  const noShowCount = data.filter(g => g.estado === 'no_show').length;
  const noShowRatio = data.length ? ((noShowCount / data.length) * 100).toFixed(1) : '0';

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (g: Guest) => { setEditing(g); setForm({ nombre: g.nombre, promotor: g.promotor, evento: g.evento, tipo: g.tipo, horaLlegada: g.horaLlegada, estado: g.estado }); setModalOpen(true); };

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

  const checkIn = async (docId: string) => {
    if (!userId) return;
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    try {
      await api.update(userId, docId, { estado: 'dentro' as GuestStatus, horaLlegada: time });
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const stats = [
    { label: 'En Lista Esta Noche', value: enLista, icon: <ClipboardList className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Dentro', value: dentro, icon: <UserCheck className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'No Show Ratio', value: `${noShowRatio}%`, icon: <UserX className="w-5 h-5 text-red-500" />, bg: 'bg-red-50 dark:bg-red-900/30' },
  ];

  return (
    <Layout title="Listas de Entrada">
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-white/70 dark:bg-gray-950/70">
            <div className="flex flex-col items-center gap-3 text-gray-700 dark:text-gray-200">
              <span className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-white" aria-hidden />
              <span className="text-sm font-medium">Cargando lista de invitados…</span>
            </div>
          </div>
        )}
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-3`}>
              {s.icon}
              <div><p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p><p className="text-lg font-bold text-gray-900 dark:text-white">{s.value}</p></div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nombre o promotor…" className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <div className="relative">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as GuestStatus | '')} className="appearance-none pl-8 pr-8 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 outline-none">
                <option value="">Todos</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
            <AddButtonDropdown
                label="Nuevo invitado"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de invitado"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Promotor</th>
                <th className="px-4 py-3 font-medium">Evento</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Hora Llegada</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(g => (
                <tr key={g._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{g.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{g.promotor}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{g.evento}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[g.tipo]}`}>{TYPE_LABELS[g.tipo]}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{g.horaLlegada ? <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{g.horaLlegada}</span> : <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CFG[g.estado].bg} ${STATUS_CFG[g.estado].text}`}>{STATUS_CFG[g.estado].label}</span></td>
                  <td className="px-4 py-3 text-right flex items-center justify-end gap-1">
                    {g.estado === 'en_lista' && (
                      <button onClick={() => checkIn(g._id)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 text-xs font-medium transition-colors">
                        <LogIn className="w-3.5 h-3.5" /> Check-in
                      </button>
                    )}
                    <button onClick={() => openEdit(g)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => remove(g._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {!filtered.length && !loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No se encontraron invitados</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{editing ? 'Editar Invitado' : 'Añadir a Lista'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Promotor</label><input value={form.promotor} onChange={e => setForm({ ...form, promotor: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Evento</label><input value={form.evento} onChange={e => setForm({ ...form, evento: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as GuestType })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500">
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as GuestStatus })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500">
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hora Llegada</label><input type="time" value={form.horaLlegada} onChange={e => setForm({ ...form, horaLlegada: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
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
        module="nightclub_guestlist"
        moduleLabel="Lista invitados"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Lista invitados"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
