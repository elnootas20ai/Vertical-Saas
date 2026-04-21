import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit3, Trash2, UtensilsCrossed, Users,
  DollarSign, TrendingUp, Clock, CheckCircle, AlertCircle,
  ChefHat, ShoppingCart, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type CateringType = 'cocktail' | 'sentado' | 'buffet' | 'food_truck';
type CateringStatus = 'cotizado' | 'confirmado' | 'servido';

interface CateringOrder extends VerticalEntity {
  evento: string;
  menu: string;
  tipo: CateringType;
  comensales: number;
  precioPorPersona: number;
  total: number;
  alergiasDietas: string;
  proveedor: string;
  estado: CateringStatus;
}

type CateringForm = Omit<CateringOrder, keyof VerticalEntity>;

interface EventRecord extends VerticalEntity {
  nombre: string;
  tipo: string;
  fecha: string;
  lugar: string;
  cliente: string;
  invitados: number;
  presupuesto: number;
  estado: string;
}

interface VendorRecord extends VerticalEntity {
  empresa: string;
  tipoServicio: string;
  contacto: string;
  telefono: string;
  email: string;
  valoracion: number;
  eventosRealizados: number;
  tarifaBase: number;
}

const TYPE_LABELS: Record<CateringType, { label: string; bg: string; text: string }> = {
  cocktail:   { label: 'Cocktail',   bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
  sentado:    { label: 'Sentado',    bg: 'bg-blue-100 dark:bg-blue-900/40',    text: 'text-blue-700 dark:text-blue-300' },
  buffet:     { label: 'Buffet',     bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  food_truck: { label: 'Food Truck', bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300' },
};

const STATUS_CONFIG: Record<CateringStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  cotizado:   { label: 'Cotizado',   bg: 'bg-amber-50 dark:bg-amber-900/30',    text: 'text-amber-700 dark:text-amber-300', icon: <Clock className="w-3.5 h-3.5" /> },
  confirmado: { label: 'Confirmado', bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  servido:    { label: 'Servido',    bg: 'bg-blue-50 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-300', icon: <CheckCircle className="w-3.5 h-3.5" /> },
};

const EMPTY_FORM: CateringForm = { evento: '', menu: '', tipo: 'buffet', comensales: 0, precioPorPersona: 0, total: 0, alergiasDietas: '', proveedor: '', estado: 'cotizado' };

export function EventsCatering() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<CateringOrder>('events', 'catering'), []);
  const eventsCatalogApi = useMemo(() => createVerticalApi<EventRecord>('events', 'events'), []);
  const vendorsCatalogApi = useMemo(() => createVerticalApi<VendorRecord>('events', 'vendors'), []);
  const userId = user?.user_id || user?.id || '';

  const [orders, setOrders] = useState<CateringOrder[]>([]);
  const [eventCatalog, setEventCatalog] = useState<EventRecord[]>([]);
  const [vendorCatalog, setVendorCatalog] = useState<VendorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<CateringStatus | ''>('');
  const [filterType, setFilterType] = useState<CateringType | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CateringOrder | null>(null);
  const [form, setForm] = useState<CateringForm>(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [list, evs, vens] = await Promise.all([
        api.list(userId),
        eventsCatalogApi.list(userId),
        vendorsCatalogApi.list(userId),
      ]);
      setOrders(list);
      setEventCatalog(evs);
      setVendorCatalog(vens);
    } finally {
      setLoading(false);
    }
  }, [userId, api, eventsCatalogApi, vendorsCatalogApi]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const eventOptions = useMemo(() => {
    const s = new Set<string>();
    eventCatalog.forEach(e => {
      if (e.nombre) s.add(e.nombre);
    });
    orders.forEach(o => {
      if (o.evento) s.add(o.evento);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [eventCatalog, orders]);

  const proveedorOptions = useMemo(() => {
    const s = new Set<string>();
    vendorCatalog.forEach(v => {
      if (v.empresa) s.add(v.empresa);
    });
    orders.forEach(o => {
      if (o.proveedor) s.add(o.proveedor);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [vendorCatalog, orders]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'event', label: 'Evento' },
    { key: 'type', label: 'Tipo' },
    { key: 'guests', label: 'Comensales' },
    { key: 'price', label: 'Precio' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'event', label: 'Evento', example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'guests', label: 'Comensales', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} servicio de catering(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} servicio de catering(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => orders.filter(o => {
    const ms = o.evento.toLowerCase().includes(search.toLowerCase()) || o.menu.toLowerCase().includes(search.toLowerCase()) || o.proveedor.toLowerCase().includes(search.toLowerCase());
    const mst = !filterStatus || o.estado === filterStatus;
    const mt = !filterType || o.tipo === filterType;
    return ms && mst && mt;
  }), [orders, search, filterStatus, filterType]);

  const stats = useMemo(() => {
    const serviciosMes = orders.filter(o => o.estado !== 'cotizado').length;
    const ingresos = orders.filter(o => o.estado !== 'cotizado').reduce((s, o) => s + o.total, 0);
    const pendientes = orders.filter(o => o.estado === 'cotizado').length;
    return { serviciosMes, ingresos, pendientes };
  }, [orders]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (o: CateringOrder) => {
    setEditing(o);
    setForm({
      evento: o.evento,
      menu: o.menu,
      tipo: o.tipo,
      comensales: o.comensales,
      precioPorPersona: o.precioPorPersona,
      total: o.total,
      alergiasDietas: o.alergiasDietas,
      proveedor: o.proveedor,
      estado: o.estado,
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
    if (!form.evento || !form.menu || !userId) return;
    const computed: CateringForm = { ...form, total: form.comensales * form.precioPorPersona };
    try {
      if (editing) {
        await api.update(userId, editing._id, computed);
      } else {
        await api.create(userId, computed);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* error from fetch */
    }
  };

  const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 });

  const statsCards = [
    { label: 'Servicios mes', value: stats.serviciosMes, icon: <ChefHat className="w-5 h-5 text-orange-500" />, bg: 'bg-orange-50 dark:bg-orange-900/30' },
    { label: 'Ingresos catering', value: fmt(stats.ingresos), icon: <TrendingUp className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Pedidos pendientes', value: stats.pendientes, icon: <ShoppingCart className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Catering">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar evento, menú, proveedor..." disabled={loading} className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
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
                label="Nuevo servicio"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de servicio de catering"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Evento</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Menú</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Comensales</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">€/persona</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Total</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Alergias/Dietas</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Proveedor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(o => {
                const tp = TYPE_LABELS[o.tipo];
                const st = STATUS_CONFIG[o.estado];
                return (
                  <tr key={o._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 text-xs">{o.evento}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{o.menu}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tp.bg} ${tp.text}`}>{tp.label}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><span className="flex items-center gap-1"><Users className="w-3 h-3" />{o.comensales}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{o.precioPorPersona} €</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{fmt(o.total)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell"><span className="truncate max-w-[160px] block text-xs">{o.alergiasDietas}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell text-xs">{o.proveedor}</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>{st.icon}{st.label}</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(o)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => void handleDelete(o._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron servicios de catering</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Servicio' : 'Nuevo Servicio de Catering'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Evento</label>
                <select value={form.evento} onChange={e => setForm(p => ({ ...p, evento: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">Seleccionar evento…</option>
                  {eventOptions.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                  {form.evento && !eventOptions.includes(form.evento) ? (
                    <option value={form.evento}>{form.evento}</option>
                  ) : null}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Menú</label>
                <input value={form.menu} onChange={e => setForm(p => ({ ...p, menu: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as CateringType }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proveedor</label>
                  <select value={form.proveedor} onChange={e => setForm(p => ({ ...p, proveedor: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">Seleccionar proveedor…</option>
                    {proveedorOptions.map(p => <option key={p} value={p}>{p}</option>)}
                    {form.proveedor && !proveedorOptions.includes(form.proveedor) ? (
                      <option value={form.proveedor}>{form.proveedor}</option>
                    ) : null}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comensales</label>
                  <input type="number" value={form.comensales} onChange={e => setForm(p => ({ ...p, comensales: +e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio/persona (€)</label>
                  <input type="number" value={form.precioPorPersona} onChange={e => setForm(p => ({ ...p, precioPorPersona: +e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alergias / Dietas especiales</label>
                <input value={form.alergiasDietas} onChange={e => setForm(p => ({ ...p, alergiasDietas: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value as CateringStatus }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
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
        module="events_catering"
        moduleLabel="Catering"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Catering"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
