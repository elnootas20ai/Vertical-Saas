import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit3, Trash2, Star, Phone, Mail,
  Building2, Users, TrendingUp, Filter, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { bulkCreateVerticalEntries, entryNum, entryStr } from '../../lib/bulkVerticalImport';

type ServiceType = 'catering' | 'decoracion' | 'audio' | 'fotografia' | 'iluminacion' | 'florista' | 'mobiliario';

interface Vendor extends VerticalEntity {
  empresa: string;
  tipoServicio: ServiceType;
  contacto: string;
  telefono: string;
  email: string;
  valoracion: number;
  eventosRealizados: number;
  tarifaBase: number;
}

type VendorForm = Omit<Vendor, keyof VerticalEntity>;

const SERVICE_CONFIG: Record<ServiceType, { label: string; bg: string; text: string }> = {
  catering:    { label: 'Catering',     bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300' },
  decoracion:  { label: 'Decoración',   bg: 'bg-pink-100 dark:bg-pink-900/40',    text: 'text-pink-700 dark:text-pink-300' },
  audio:       { label: 'Audio/Sonido', bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300' },
  fotografia:  { label: 'Fotografía',   bg: 'bg-cyan-100 dark:bg-cyan-900/40',    text: 'text-cyan-700 dark:text-cyan-300' },
  iluminacion: { label: 'Iluminación',  bg: 'bg-amber-100 dark:bg-amber-900/40',  text: 'text-amber-700 dark:text-amber-300' },
  florista:    { label: 'Florista',     bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  mobiliario:  { label: 'Mobiliario',   bg: 'bg-slate-200 dark:bg-slate-700',      text: 'text-slate-700 dark:text-slate-300' },
};

const EMPTY_FORM: VendorForm = { empresa: '', tipoServicio: 'catering', contacto: '', telefono: '', email: '', valoracion: 5, eventosRealizados: 0, tarifaBase: 0 };

export function EventsVendors() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const linkedEventName = searchParams.get('eventName') || '';
  const linkedEventId = searchParams.get('eventId') || '';
  const api = useMemo(() => createVerticalApi<Vendor>('events', 'vendors'), []);
  const userId = user?.user_id || user?.id || '';

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterService, setFilterService] = useState<ServiceType | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState<VendorForm>(EMPTY_FORM);
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
      setVendors(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'category', label: 'Categoría' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'category', label: 'Categoría', example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
      const empresa = entryStr(e, 'name', 'empresa', 'nombre');
      if (!empresa) return null;
      return {
        empresa,
        tipoServicio: (entryStr(e, 'category', 'tipoServicio') || 'catering') as ServiceType,
        contacto: entryStr(e, 'contact', 'contacto') || empresa,
        telefono: entryStr(e, 'phone', 'telefono'),
        email: entryStr(e, 'email'),
        valoracion: 5,
        eventosRealizados: 0,
        tarifaBase: entryNum(e, 'price', 'tarifaBase'),
      };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} externo(s) creado(s)`);
    } else {
      toast.error('No se pudo crear ningún externo');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => vendors.filter(v => {
    const ms = v.empresa.toLowerCase().includes(search.toLowerCase()) || v.contacto.toLowerCase().includes(search.toLowerCase());
    const mf = !filterService || v.tipoServicio === filterService;
    return ms && mf;
  }), [vendors, search, filterService]);

  const stats = useMemo(() => {
    const activos = vendors.length;
    const categorias = new Set(vendors.map(v => v.tipoServicio)).size;
    const valorMedia = vendors.length ? (vendors.reduce((s, v) => s + v.valoracion, 0) / vendors.length).toFixed(1) : '0';
    return { activos, categorias, valorMedia };
  }, [vendors]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (v: Vendor) => {
    setEditing(v);
    setForm({
      empresa: v.empresa,
      tipoServicio: v.tipoServicio,
      contacto: v.contacto,
      telefono: v.telefono,
      email: v.email,
      valoracion: v.valoracion,
      eventosRealizados: v.eventosRealizados,
      tarifaBase: v.tarifaBase,
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
    if (!form.empresa || !form.contacto || !userId) return;
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

  const renderStars = (rating: number) => (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i < Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-gray-600'}`} />
      ))}
      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{rating}</span>
    </span>
  );

  const statsCards = [
    { label: 'Externos activos', value: stats.activos, icon: <Building2 className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Categorías', value: stats.categorias, icon: <Filter className="w-5 h-5 text-violet-500" />, bg: 'bg-violet-50 dark:bg-violet-900/30' },
    { label: 'Valoración media', value: stats.valorMedia, icon: <Star className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Externos">
      <div className="space-y-6">
        {linkedEventName && (
          <div className="rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>Evento: <strong>{linkedEventName}</strong></span>
            {linkedEventId && (
              <Link to={`/saas/vertical/eventos/${linkedEventId}`} className="font-semibold text-cyan-700 dark:text-cyan-300 hover:underline">
                Volver al proyecto
              </Link>
            )}
          </div>
        )}
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empresa o contacto..." disabled={loading} className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <select value={filterService} onChange={e => setFilterService(e.target.value as any)} disabled={loading} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Todos los servicios</option>
              {Object.entries(SERVICE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <AddButtonDropdown
                label="Nuevo externo"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de externo"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Servicio</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Contacto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Teléfono</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Valoración</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Eventos</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Tarifa base</th>
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
              ) : filtered.map(v => {
                const sv = SERVICE_CONFIG[v.tipoServicio];
                return (
                  <tr key={v._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{v.empresa}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sv.bg} ${sv.text}`}>{sv.label}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{v.contacto}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell"><span className="flex items-center gap-1"><Phone className="w-3 h-3" />{v.telefono}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell"><span className="flex items-center gap-1"><Mail className="w-3 h-3" />{v.email}</span></td>
                    <td className="px-4 py-3">{renderStars(v.valoracion)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{v.eventosRealizados}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{v.tarifaBase.toLocaleString('es-ES')} €</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(v)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => void handleDelete(v._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron externos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar externo' : 'Nuevo externo'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Empresa</label>
                <input value={form.empresa} onChange={e => setForm(p => ({ ...p, empresa: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de servicio</label>
                  <select value={form.tipoServicio} onChange={e => setForm(p => ({ ...p, tipoServicio: e.target.value as ServiceType }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {Object.entries(SERVICE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contacto</label>
                  <input value={form.contacto} onChange={e => setForm(p => ({ ...p, contacto: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono</label>
                  <input value={form.telefono} onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valoración</label>
                  <input type="number" step="0.1" min="0" max="5" value={form.valoracion} onChange={e => setForm(p => ({ ...p, valoracion: +e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Eventos</label>
                  <input type="number" value={form.eventosRealizados} onChange={e => setForm(p => ({ ...p, eventosRealizados: +e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tarifa base (€)</label>
                  <input type="number" value={form.tarifaBase} onChange={e => setForm(p => ({ ...p, tarifaBase: +e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
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
        module="events_vendors"
        moduleLabel="Externos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Externos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
