import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { VertialNumericInput } from '../../components/saas/VertialNumericInput';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { resolveEventsUserId } from '../../lib/eventsFlow';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit3, Trash2, MapPin, Users, Star,
  DollarSign, CheckCircle, Building2, CalendarCheck, TreePine, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { bulkCreateVerticalEntries, entryNum, entryStr } from '../../lib/bulkVerticalImport';

type VenueType = 'salon' | 'jardin' | 'playa' | 'finca' | 'hotel' | 'restaurante' | 'auditorio';

interface Venue extends VerticalEntity {
  nombre: string;
  tipo: VenueType;
  direccion: string;
  capacidad: number;
  precio: number;
  servicios: string;
  disponibilidad: boolean;
  valoracion: number;
}

type VenueForm = Omit<Venue, keyof VerticalEntity>;

const VENUE_TYPE_CONFIG: Record<VenueType, { label: string; bg: string; text: string }> = {
  salon:       { label: 'Salón',       bg: 'bg-blue-100 dark:bg-blue-900/40',    text: 'text-blue-700 dark:text-blue-300' },
  jardin:      { label: 'Jardín',      bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  playa:       { label: 'Playa',       bg: 'bg-cyan-100 dark:bg-cyan-900/40',    text: 'text-cyan-700 dark:text-cyan-300' },
  finca:       { label: 'Finca',       bg: 'bg-amber-100 dark:bg-amber-900/40',  text: 'text-amber-700 dark:text-amber-300' },
  hotel:       { label: 'Hotel',       bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
  restaurante: { label: 'Restaurante', bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300' },
  auditorio:   { label: 'Auditorio',   bg: 'bg-slate-200 dark:bg-slate-700',     text: 'text-slate-700 dark:text-slate-300' },
};

const EMPTY_FORM: VenueForm = { nombre: '', tipo: 'salon', direccion: '', capacidad: 0, precio: 0, servicios: '', disponibilidad: true, valoracion: 5 };

export function EventsVenues({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const [searchParams] = useSearchParams();
  const linkedEventName = searchParams.get('eventName') || '';
  const linkedEventId = searchParams.get('eventId') || '';
  const api = useMemo(() => createVerticalApi<Venue>('events', 'venues'), []);
  const userId = useMemo(() => resolveEventsUserId(user, currentBusiness), [user, currentBusiness]);

  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<VenueType | ''>('');
  const [filterDisp, setFilterDisp] = useState<'' | 'si' | 'no'>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Venue | null>(null);
  const [form, setForm] = useState<VenueForm>(EMPTY_FORM);
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
      setVenues(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'address', label: 'Dirección' },
    { key: 'capacity', label: 'Aforo' },
    { key: 'price', label: 'Precio' },
    { key: 'type', label: 'Tipo' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'address', label: 'Dirección', example: '' },
    { key: 'capacity', label: 'Aforo', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
      const nombre = entryStr(e, 'name', 'nombre');
      const direccion = entryStr(e, 'address', 'direccion');
      if (!nombre || !direccion) return null;
      return {
        nombre,
        direccion,
        capacidad: entryNum(e, 'capacity', 'capacidad'),
        precio: entryNum(e, 'price', 'precio'),
        tipo: (entryStr(e, 'type', 'tipo') || 'salon') as VenueType,
        servicios: entryStr(e, 'notes', 'servicios'),
        disponibilidad: true,
        valoracion: 5,
      };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} local(es) creado(s)`);
    } else {
      toast.error('No se pudo crear ningún local');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => venues.filter(v => {
    const ms = v.nombre.toLowerCase().includes(search.toLowerCase()) || v.direccion.toLowerCase().includes(search.toLowerCase());
    const mt = !filterType || v.tipo === filterType;
    const md = !filterDisp || (filterDisp === 'si' ? v.disponibilidad : !v.disponibilidad);
    return ms && mt && md;
  }), [venues, search, filterType, filterDisp]);

  const stats = useMemo(() => {
    const activos = venues.filter(v => v.disponibilidad).length;
    const proxDisp = venues.filter(v => v.disponibilidad).length;
    const precioMedio = venues.length ? Math.round(venues.reduce((s, v) => s + v.precio, 0) / venues.length) : 0;
    return { activos, proxDisp, precioMedio };
  }, [venues]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (v: Venue) => {
    setEditing(v);
    setForm({
      nombre: v.nombre,
      tipo: v.tipo,
      direccion: v.direccion,
      capacidad: v.capacidad,
      precio: v.precio,
      servicios: v.servicios,
      disponibilidad: v.disponibilidad,
      valoracion: v.valoracion,
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
    if (!form.nombre || !form.direccion || !userId) return;
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

  const renderStars = (rating: number) => (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i < Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-gray-600'}`} />
      ))}
      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{rating}</span>
    </span>
  );

  const statsCards = [
    { label: 'Venues disponibles', value: stats.activos, icon: <Building2 className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Total espacios', value: venues.length, icon: <TreePine className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Precio medio', value: fmt(stats.precioMedio), icon: <DollarSign className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  const inner = (
    <>
      <div className="space-y-6">
        {!embedded && linkedEventName && (
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar espacio o dirección..." disabled={loading} className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <select value={filterType} onChange={e => setFilterType(e.target.value as any)} disabled={loading} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Todos los tipos</option>
              {Object.entries(VENUE_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterDisp} onChange={e => setFilterDisp(e.target.value as any)} disabled={loading} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Disponibilidad</option>
              <option value="si">Disponible</option>
              <option value="no">No disponible</option>
            </select>
            <AddButtonDropdown
                label="Nuevo Local"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de local"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Dirección</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Capacidad</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Precio</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Servicios</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Disp.</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Valoración</th>
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
                const tp = VENUE_TYPE_CONFIG[v.tipo];
                return (
                  <tr key={v._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{v.nombre}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tp.bg} ${tp.text}`}>{tp.label}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell"><span className="flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate max-w-[200px]">{v.direccion}</span></span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><span className="flex items-center gap-1"><Users className="w-3 h-3" />{v.capacidad}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fmt(v.precio)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell"><span className="truncate max-w-[180px] block">{v.servicios}</span></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${v.disponibilidad ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                        <CheckCircle className="w-3.5 h-3.5" />{v.disponibilidad ? 'Sí' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">{renderStars(v.valoracion)}</td>
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
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron espacios</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Espacio' : 'Nuevo Espacio'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label>
                <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as VenueType }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {Object.entries(VENUE_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Capacidad</label>
                  <VertialNumericInput mode="int" min={0} value={form.capacidad} onChange={(capacidad) => setForm(p => ({ ...p, capacidad }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dirección</label>
                <input value={form.direccion} onChange={e => setForm(p => ({ ...p, direccion: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio (€)</label>
                  <VertialNumericInput mode="decimal" min={0} value={form.precio} onChange={(precio) => setForm(p => ({ ...p, precio }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valoración</label>
                  <VertialNumericInput mode="decimal" min={0} max={5} value={form.valoracion} onChange={(valoracion) => setForm(p => ({ ...p, valoracion }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Servicios incluidos</label>
                <input value={form.servicios} onChange={e => setForm(p => ({ ...p, servicios: e.target.value }))} placeholder="Separados por coma" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="disponibilidad" checked={form.disponibilidad} onChange={e => setForm(p => ({ ...p, disponibilidad: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <label htmlFor="disponibilidad" className="text-sm font-medium text-gray-700 dark:text-gray-300">Disponible</label>
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
        module="events_venues"
        moduleLabel="Locales"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Locales"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </>
  );
  if (embedded) return inner;
  return <Layout title="Espacios / Venues">{inner}</Layout>;
}
