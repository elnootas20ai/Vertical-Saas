import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { useModalClose } from '../../hooks/useModalClose';
import { toast } from 'sonner';
import {
  listButcherClientsRequest,
  createButcherClientRequest,
  updateButcherClientRequest,
  deleteButcherClientRequest,
  getButcherClientHistoryRequest,
  type ButcherClient,
  type TimelineEntry,
  type TopProduct,
  type ClientHistoryStats,
} from '../../lib/butcherApi';
import {
  Search, Plus, X, Edit2, Trash2, Phone, Mail,
  Users, Star, ShoppingBag, TrendingUp, Tag, Clock,
  ChevronRight, Package, BarChart3,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

const TAG_OPTIONS = ['habitual', 'restaurante', 'mayorista', 'encargos_frecuentes'];
const TAG_COLORS: Record<string, string> = {
  habitual: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  restaurante: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  mayorista: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  encargos_frecuentes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
};

function relativeTime(dateStr: string | null) {
  if (!dateStr) return 'Sin visitas';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  if (days < 30) return `Hace ${Math.floor(days / 7)} sem`;
  return `Hace ${Math.floor(days / 30)} mes${Math.floor(days / 30) > 1 ? 'es' : ''}`;
}

const EMPTY_FORM = {
  name: '', phone: '', email: '', observations: '', tags: [] as string[],
  cuttingPreferences: '', packagingNotes: '',
  usualProducts: [] as { productName: string; quantity: number; unit: string }[],
};

export function ButcherClients() {
  const { userId } = useApp();
  const [clients, setClients] = useState<ButcherClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ButcherClient | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [drawerClient, setDrawerClient] = useState<ButcherClient | null>(null);
  const [drawerHistory, setDrawerHistory] = useState<{
    timeline: TimelineEntry[]; stats: ClientHistoryStats; topProducts: TopProduct[];
  } | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    { key: 'address', label: 'Dirección' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'address', label: 'Dirección', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} cliente(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} cliente(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const fetchClients = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await listButcherClientsRequest(userId);
      if (res.ok) setClients(res.clients || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const filtered = useMemo(() => {
    let list = clients;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    }
    if (filterTag !== 'all') {
      list = list.filter((c) => c.tags.includes(filterTag));
    }
    return list;
  }, [clients, search, filterTag]);

  const stats = useMemo(() => {
    const total = clients.length;
    const habituales = clients.filter((c) => c.tags.includes('habitual')).length;
    const totalSpentMonth = clients.reduce((s, c) => s + c.totalSpent, 0);
    return { total, habituales, totalSpentMonth };
  }, [clients]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (c: ButcherClient) => {
    setEditing(c);
    setForm({
      name: c.name, phone: c.phone, email: c.email, observations: c.observations,
      tags: [...c.tags],
      cuttingPreferences: c.preferences.cuttingPreferences,
      packagingNotes: c.preferences.packagingNotes,
      usualProducts: c.preferences.usualProducts.map((p) => ({
        productName: p.productName, quantity: p.quantity, unit: p.unit,
      })),
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !userId) return;
    const payload: any = {
      name: form.name, phone: form.phone, email: form.email, observations: form.observations,
      tags: form.tags,
      usualProducts: form.usualProducts,
      preferences: { cuttingPreferences: form.cuttingPreferences, packagingNotes: form.packagingNotes },
    };
    try {
      const res = editing
        ? await updateButcherClientRequest(userId, editing._id, payload)
        : await createButcherClientRequest(userId, payload);
      if (res.ok) {
        toast.success(editing ? 'Cliente actualizado' : 'Cliente creado');
        setShowModal(false);
        fetchClients();
      } else {
        toast.error(res.error || 'Error');
      }
    } catch { toast.error('Error de conexión'); }
  };

  const handleDelete = async (id: string) => {
    if (!userId) return;
    try {
      const res = await deleteButcherClientRequest(userId, id);
      if (res.ok) { toast.success('Cliente eliminado'); fetchClients(); }
    } catch { toast.error('Error de conexión'); }
  };

  const openDrawer = async (c: ButcherClient) => {
    setDrawerClient(c);
    setDrawerHistory(null);
    setDrawerLoading(true);
    try {
      const res = await getButcherClientHistoryRequest(userId!, c._id);
      if (res.ok) setDrawerHistory(res.history);
    } catch { /* ignore */ }
    setDrawerLoading(false);
  };

  const addProductLine = () => setForm((f) => ({
    ...f, usualProducts: [...f.usualProducts, { productName: '', quantity: 1, unit: 'kg' }],
  }));
  const removeProductLine = (idx: number) => setForm((f) => ({
    ...f, usualProducts: f.usualProducts.filter((_, i) => i !== idx),
  }));
  const updateProductLine = (idx: number, field: string, val: any) => setForm((f) => ({
    ...f, usualProducts: f.usualProducts.map((p, i) => i === idx ? { ...p, [field]: val } : p),
  }));

  const toggleTag = (tag: string) => setForm((f) => ({
    ...f, tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
  }));

  const STAT_CARDS = [
    { label: 'Total clientes', value: stats.total, icon: Users, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Habituales', value: stats.habituales, icon: Star, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Gasto total', value: stats.totalSpentMonth.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }), icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
  ];

  return (
    <Layout title="Clientes">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {STAT_CARDS.map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div className="min-w-0">
              <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white truncate">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por nombre o teléfono..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
              <option value="all">Todas las etiquetas</option>
              {TAG_OPTIONS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' ')}</option>)}
            </select>
            <AddButtonDropdown
                label="Nuevo cliente"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de cliente"
              />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 animate-pulse">
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-3" />
              <div className="h-4 bg-gray-100 dark:bg-gray-700/50 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            {search || filterTag !== 'all' ? 'No hay clientes que coincidan con los filtros' : 'Aún no hay clientes. Crea el primero.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div key={c._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow cursor-pointer group" onClick={() => openDrawer(c)}>
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">{c.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    <a href={`tel:${c.phone}`} className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600" onClick={(e) => e.stopPropagation()}>{c.phone || 'Sin teléfono'}</a>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(c); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"><Edit2 className="w-4 h-4" /></button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(c._id); }} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              {c.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {c.tags.map((t) => (
                    <span key={t} className={`text-xs font-medium px-2 py-0.5 rounded-full ${TAG_COLORS[t] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {t.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              )}

              {c.preferences.usualProducts.length > 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 truncate">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Lo habitual:</span>{' '}
                  {c.preferences.usualProducts.slice(0, 3).map((p) => `${p.quantity}${p.unit} ${p.productName}`).join(', ')}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500 pt-3 border-t border-gray-100 dark:border-gray-700/50">
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{relativeTime(c.lastVisit)}</span>
                <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" />{c.totalSpent.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                <span className="flex items-center gap-1"><ShoppingBag className="w-3.5 h-3.5" />{c.totalOrders} ped</span>
                <ChevronRight className="w-4 h-4 ml-auto text-gray-300 group-hover:text-gray-500 transition" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Drawer de detalle ── */}
      {drawerClient && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDrawerClient(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-full max-w-md bg-white dark:bg-gray-800 h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white dark:bg-gray-800 z-10 flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{drawerClient.name}</h2>
              <button type="button" onClick={() => setDrawerClient(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-6">
              <div className="space-y-2">
                {drawerClient.phone && (
                  <a href={`tel:${drawerClient.phone}`} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600">
                    <Phone className="w-4 h-4 text-gray-400" />{drawerClient.phone}
                  </a>
                )}
                {drawerClient.email && (
                  <a href={`mailto:${drawerClient.email}`} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600">
                    <Mail className="w-4 h-4 text-gray-400" />{drawerClient.email}
                  </a>
                )}
                {drawerClient.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {drawerClient.tags.map((t) => (
                      <span key={t} className={`text-xs font-medium px-2 py-0.5 rounded-full ${TAG_COLORS[t] || 'bg-gray-100 text-gray-700'}`}>{t.replace('_', ' ')}</span>
                    ))}
                  </div>
                )}
              </div>

              {drawerClient.observations && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Observaciones</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{drawerClient.observations}</p>
                </div>
              )}

              {drawerClient.preferences.usualProducts.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Lo habitual</h4>
                  <div className="space-y-1.5">
                    {drawerClient.preferences.usualProducts.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Package className="w-3.5 h-3.5 text-gray-400" />
                        <span>{p.quantity}{p.unit} {p.productName}</span>
                      </div>
                    ))}
                  </div>
                  {drawerClient.preferences.preferredDay && (
                    <p className="text-xs text-gray-500 mt-2">Suele venir: {drawerClient.preferences.preferredDay} {drawerClient.preferences.preferredTime || ''}</p>
                  )}
                </div>
              )}

              {(drawerClient.preferences.cuttingPreferences || drawerClient.preferences.packagingNotes) && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Preferencias</h4>
                  {drawerClient.preferences.cuttingPreferences && <p className="text-sm text-gray-600 dark:text-gray-400">Corte: {drawerClient.preferences.cuttingPreferences}</p>}
                  {drawerClient.preferences.packagingNotes && <p className="text-sm text-gray-600 dark:text-gray-400">Envasado: {drawerClient.preferences.packagingNotes}</p>}
                </div>
              )}

              {drawerLoading ? (
                <div className="py-8 text-center"><div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto" /></div>
              ) : drawerHistory && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{drawerHistory.stats.totalSpent.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                      <p className="text-xs text-gray-500">Total gastado</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{drawerHistory.stats.avgTicket.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                      <p className="text-xs text-gray-500">Ticket medio</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{drawerHistory.stats.totalSales}</p>
                      <p className="text-xs text-gray-500">Compras</p>
                    </div>
                  </div>

                  {drawerHistory.topProducts.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5"><BarChart3 className="w-4 h-4" />Top productos</h4>
                      <div className="space-y-2">
                        {drawerHistory.topProducts.slice(0, 5).map((p, i) => {
                          const maxSpent = drawerHistory!.topProducts[0]?.totalSpent || 1;
                          const pct = Math.round((p.totalSpent / maxSpent) * 100);
                          return (
                            <div key={i}>
                              <div className="flex justify-between text-sm mb-0.5">
                                <span className="text-gray-700 dark:text-gray-300 truncate">{p.productName}</span>
                                <span className="text-gray-500 shrink-0 ml-2">{p.totalSpent.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                              </div>
                              <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {drawerHistory.timeline.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Últimas transacciones</h4>
                      <div className="space-y-2">
                        {drawerHistory.timeline.slice(0, 10).map((t, i) => (
                          <div key={i} className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-50 dark:border-gray-700/30 last:border-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${t.type === 'sale' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                            <span className="text-gray-500 w-16 shrink-0">{new Date(t.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
                            <span className="font-mono text-gray-600 dark:text-gray-400 w-20 shrink-0">{t.ref}</span>
                            <span className="text-gray-900 dark:text-white font-medium ml-auto">{t.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setDrawerClient(null); openEdit(drawerClient); }} className="flex-1 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">
                  Editar cliente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal crear/editar ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Teléfono</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                <input type="email" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Observaciones</label>
                <textarea className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 resize-none" rows={2} value={form.observations} onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))} placeholder="Ej: Le gusta fino, alérgico a mostaza..." />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Etiquetas</label>
                <div className="flex flex-wrap gap-2">
                  {TAG_OPTIONS.map((t) => (
                    <button key={t} type="button" onClick={() => toggleTag(t)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${form.tags.includes(t) ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                      {t.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Preferencia de corte</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.cuttingPreferences} onChange={(e) => setForm((f) => ({ ...f, cuttingPreferences: e.target.value }))} placeholder="Filetes finos..." />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Envasado</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.packagingNotes} onChange={(e) => setForm((f) => ({ ...f, packagingNotes: e.target.value }))} placeholder="Al vacío..." />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Lo habitual</label>
                  <button type="button" onClick={addProductLine} className="text-sm text-blue-600 hover:text-blue-700 font-medium">+ Añadir producto</button>
                </div>
                {form.usualProducts.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <input className="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none text-sm" placeholder="Producto" value={p.productName} onChange={(e) => updateProductLine(i, 'productName', e.target.value)} />
                    <input type="number" step="0.1" className="w-20 px-2 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none text-sm text-center" value={p.quantity} onChange={(e) => updateProductLine(i, 'quantity', Number(e.target.value))} />
                    <select className="w-16 px-1 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none text-sm" value={p.unit} onChange={(e) => updateProductLine(i, 'unit', e.target.value)}>
                      <option value="kg">kg</option><option value="ud">ud</option><option value="piezas">pzas</option>
                    </select>
                    <button type="button" onClick={() => removeProductLine(i)} className="p-1.5 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar' : 'Crear cliente'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="butcher_clients"
        moduleLabel="Clientes"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Clientes"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
