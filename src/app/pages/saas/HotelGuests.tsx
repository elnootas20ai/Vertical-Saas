import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Users, UserCheck, Star, Edit3, Trash2,
  Filter, ChevronDown, Phone, Mail, Globe, CreditCard, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface Guest extends VerticalEntity {
  name: string;
  document: string;
  nationality: string;
  phone: string;
  email: string;
  previousStays: number;
  preferences: string;
  vip: boolean;
}

type GuestForm = Omit<Guest, keyof VerticalEntity>;

const EMPTY: GuestForm = { name: '', document: '', nationality: '', phone: '', email: '', previousStays: 0, preferences: '', vip: false };

export function HotelGuests() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Guest>('hotel', 'guests'), []);
  const userId = user?.user_id || user?.id || '';

  const [data, setData] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterVip, setFilterVip] = useState<'' | 'vip' | 'regular'>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Guest | null>(null);
  const [form, setForm] = useState<GuestForm>(EMPTY);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'dni', label: 'DNI/Pasaporte' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'nationality', label: 'Nacionalidad' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'dni', label: 'DNI/Pasaporte', example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'nationality', label: 'Nacionalidad', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} huésped(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} huésped(s) importado(s)`);
  };

  useModalClose(modalOpen, () => setModalOpen(false));

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setData(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = data.filter(g => {
    const matchSearch = g.name.toLowerCase().includes(search.toLowerCase()) || g.document.toLowerCase().includes(search.toLowerCase()) || g.email.toLowerCase().includes(search.toLowerCase());
    const matchVip = !filterVip || (filterVip === 'vip' ? g.vip : !g.vip);
    return matchSearch && matchVip;
  });

  const stats = {
    current: data.filter(g => g.previousStays > 0).length,
    checkinsToday: 0,
    vips: data.filter(g => g.vip).length,
  };

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (g: Guest) => {
    setEditing(g);
    setForm({ name: g.name, document: g.document, nationality: g.nationality, phone: g.phone, email: g.email, previousStays: g.previousStays, preferences: g.preferences, vip: g.vip });
    setModalOpen(true);
  };

  const save = async () => {
    if (!userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setModalOpen(false);
    } catch {
      /* error from fetch */
    }
  };

  const remove = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error from fetch */
    }
  };

  return (
    <Layout title="Huéspedes">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Huéspedes actuales', value: stats.current, icon: <Users className="w-5 h-5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
            { label: 'Check-ins hoy', value: stats.checkinsToday, icon: <UserCheck className="w-5 h-5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
            { label: 'Huéspedes VIP', value: stats.vips, icon: <Star className="w-5 h-5" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-4`}>
              <div className={s.color}>{s.icon}</div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nombre, documento o email..." disabled={loading} className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100" />
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select value={filterVip} onChange={e => setFilterVip(e.target.value as '' | 'vip' | 'regular')} disabled={loading} className="pl-9 pr-8 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm appearance-none dark:text-gray-100">
                <option value="">Todos</option>
                <option value="vip">Solo VIP</option>
                <option value="regular">Regular</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <AddButtonDropdown
                label="Nuevo huésped"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de huésped"
              />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">DNI/Pasaporte</th>
                <th className="px-4 py-3 font-medium">Nacionalidad</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Estancias</th>
                <th className="px-4 py-3 font-medium">VIP</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(g => (
                <tr key={g._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{g.name}</div>
                    {g.preferences && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{g.preferences}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5 text-gray-400" /> {g.document}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><span className="inline-flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-gray-400" />{g.nationality}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5 text-gray-600 dark:text-gray-300">
                      <span className="inline-flex items-center gap-1 text-xs"><Phone className="w-3 h-3 text-gray-400" />{g.phone}</span>
                      <span className="inline-flex items-center gap-1 text-xs"><Mail className="w-3 h-3 text-gray-400" />{g.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{g.previousStays}</td>
                  <td className="px-4 py-3">
                    {g.vip ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full"><Star className="w-3 h-3" /> VIP</span> : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(g)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => void remove(g._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">No se encontraron huéspedes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar huésped' : 'Nuevo huésped'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {([
                { key: 'name', label: 'Nombre completo', type: 'text' },
                { key: 'document', label: 'DNI/Pasaporte', type: 'text' },
                { key: 'nationality', label: 'Nacionalidad', type: 'text' },
                { key: 'phone', label: 'Teléfono', type: 'text' },
                { key: 'email', label: 'Email', type: 'email' },
                { key: 'previousStays', label: 'Estancias previas', type: 'number' },
                { key: 'preferences', label: 'Preferencias', type: 'text' },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                  <input type={f.type} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              <div className="flex items-center gap-3">
                <input type="checkbox" id="vip" checked={form.vip} onChange={e => setForm({ ...form, vip: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
                <label htmlFor="vip" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5"><Star className="w-4 h-4 text-amber-500" /> Huésped VIP</label>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
              <button type="button" onClick={() => void save()} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="hotel_guests"
        moduleLabel="Huéspedes"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Huéspedes"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
