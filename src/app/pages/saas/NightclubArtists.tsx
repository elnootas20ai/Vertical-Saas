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
  Music,
  DollarSign,
  CalendarDays,
  Star,
  Instagram,
  Globe,
  Phone,
} from 'lucide-react';

type MusicGenre = 'house' | 'techno' | 'reggaeton' | 'hiphop' | 'edm' | 'comercial';

interface Artist extends VerticalEntity {
  nombre: string;
  genero: MusicGenre;
  cache: number;
  contacto: string;
  proximaActuacion: string;
  valoracionPublico: number;
  instagram: string;
  web: string;
}

const GENRE_LABELS: Record<MusicGenre, string> = {
  house: 'House', techno: 'Techno', reggaeton: 'Reggaeton', hiphop: 'Hip-Hop', edm: 'EDM', comercial: 'Comercial',
};

const GENRE_COLORS: Record<MusicGenre, string> = {
  house: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300',
  techno: 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200',
  reggaeton: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
  hiphop: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
  edm: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  comercial: 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300',
};

const EMPTY: Omit<Artist, keyof VerticalEntity> = { nombre: '', genero: 'house', cache: 0, contacto: '', proximaActuacion: '', valoracionPublico: 0, instagram: '', web: '' };

export function NightclubArtists() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Artist>('nightclub', 'artists'), []);
  const userId = user?.user_id || user?.id || '';

  const [data, setData] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterGenre, setFilterGenre] = useState<MusicGenre | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  useModalClose(modalOpen, () => setModalOpen(false));
  const [editing, setEditing] = useState<Artist | null>(null);
  const [form, setForm] = useState<Omit<Artist, keyof VerticalEntity>>(EMPTY);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'genre', label: 'Género' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'fee', label: 'Caché' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'genre', label: 'Género', example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'fee', label: 'Caché', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} artista(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} artista(s) importado(s)`);
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

  const filtered = data.filter(a => {
    const s = search.toLowerCase();
    const matchSearch = a.nombre.toLowerCase().includes(s) || a.instagram.toLowerCase().includes(s);
    const matchGenre = !filterGenre || a.genero === filterGenre;
    return matchSearch && matchGenre;
  });

  const totalArtists = data.length;
  const monthGigs = data.filter(a => a.proximaActuacion.startsWith('2026-04')).length;
  const monthSpend = data.filter(a => a.proximaActuacion.startsWith('2026-04')).reduce((s, a) => s + a.cache, 0);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (a: Artist) => { setEditing(a); setForm({ nombre: a.nombre, genero: a.genero, cache: a.cache, contacto: a.contacto, proximaActuacion: a.proximaActuacion, valoracionPublico: a.valoracionPublico, instagram: a.instagram, web: a.web }); setModalOpen(true); };

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

  const renderStars = (v: number) => (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.round(v) ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-gray-600'}`} />)}
      <span className="ml-1 text-xs text-gray-500">{v.toFixed(1)}</span>
    </div>
  );

  const stats = [
    { label: 'Artistas en Cartera', value: totalArtists, icon: <Music className="w-5 h-5 text-purple-500" />, bg: 'bg-purple-50 dark:bg-purple-900/30' },
    { label: 'Actuaciones Mes', value: monthGigs, icon: <CalendarDays className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Gasto Artistas Mes', value: `${monthSpend.toLocaleString('es-ES')} €`, icon: <DollarSign className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
  ];

  return (
    <Layout title="DJs / Artistas">
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-white/70 dark:bg-gray-950/70">
            <div className="flex flex-col items-center gap-3 text-gray-700 dark:text-gray-200">
              <span className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-white" aria-hidden />
              <span className="text-sm font-medium">Cargando artistas…</span>
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar artista…" className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <div className="relative">
              <select value={filterGenre} onChange={e => setFilterGenre(e.target.value as MusicGenre | '')} className="appearance-none pl-8 pr-8 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 outline-none">
                <option value="">Todos</option>
                {Object.entries(GENRE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
            <AddButtonDropdown
                label="Nuevo Artista"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de artista"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">Nombre Artístico</th>
                <th className="px-4 py-3 font-medium">Género</th>
                <th className="px-4 py-3 font-medium text-right">Caché</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Próxima Actuación</th>
                <th className="px-4 py-3 font-medium">Valoración</th>
                <th className="px-4 py-3 font-medium">Redes</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white flex items-center gap-2"><Music className="w-4 h-4 text-purple-400" />{a.nombre}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${GENRE_COLORS[a.genero]}`}>{GENRE_LABELS[a.genero]}</span></td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{a.cache.toLocaleString('es-ES')} €</td>
                  <td className="px-4 py-3"><span className="flex items-center gap-1 text-gray-600 dark:text-gray-300 text-xs"><Phone className="w-3 h-3" />{a.contacto}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.proximaActuacion || <span className="text-gray-400">Sin programar</span>}</td>
                  <td className="px-4 py-3">{renderStars(a.valoracionPublico)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {a.instagram && <span className="flex items-center gap-1 text-xs text-pink-600 dark:text-pink-400"><Instagram className="w-3.5 h-3.5" />{a.instagram}</span>}
                      {a.web && <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400"><Globe className="w-3.5 h-3.5" /></span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => remove(a._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {!filtered.length && !loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No se encontraron artistas</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{editing ? 'Editar Artista' : 'Nuevo Artista'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre Artístico</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Género Musical</label>
                  <select value={form.genero} onChange={e => setForm({ ...form, genero: e.target.value as MusicGenre })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500">
                    {Object.entries(GENRE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Caché €</label><input type="number" value={form.cache} onChange={e => setForm({ ...form, cache: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono contacto</label><input value={form.contacto} onChange={e => setForm({ ...form, contacto: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Próxima Actuación</label><input type="date" value={form.proximaActuacion} onChange={e => setForm({ ...form, proximaActuacion: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valoración Público (0-5)</label><input type="number" step="0.1" min="0" max="5" value={form.valoracionPublico} onChange={e => setForm({ ...form, valoracionPublico: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Instagram</label><input value={form.instagram} onChange={e => setForm({ ...form, instagram: e.target.value })} placeholder="@usuario" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Web</label><input value={form.web} onChange={e => setForm({ ...form, web: e.target.value })} placeholder="ejemplo.com" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
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
        module="nightclub_artists"
        moduleLabel="Artistas"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Artistas"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
