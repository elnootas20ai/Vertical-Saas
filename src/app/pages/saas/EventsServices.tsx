import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  EVENT_SERVICE_CATEGORY_LABELS,
  EVENT_SERVICE_UNIT_LABELS,
  type EventServiceCategory,
  type EventServiceUnit,
} from '../../lib/eventsTypes';
import {
  Search, X, Edit3, Trash2, Sparkles, DollarSign, Tag,
  CheckCircle, Loader2, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { bulkCreateVerticalEntries, entryStr } from '../../lib/bulkVerticalImport';
import {
  downloadEventsServicesImportTemplate,
  EVENTS_SERVICES_HEADER_ALIASES,
  EVENTS_SERVICES_IMPORT_FIELDS,
  EVENTS_SERVICES_SHEET_NAME,
  isEventsServicesExampleName,
  mapEventServiceCategory,
  mapEventServiceUnit,
  parseEventServicePrice,
} from '../../lib/eventsServicesExcelTemplate';
import { EventsVenues } from './EventsVenues';
import { EventsVendors } from './EventsVendors';
import { EventsCatering } from './EventsCatering';
import { EventsLogistics } from './EventsLogistics';

interface EventService extends VerticalEntity {
  nombre: string;
  categoria: EventServiceCategory;
  precio: number;
  unidad: EventServiceUnit;
  descripcion: string;
  activo: boolean;
}

type ServiceForm = Omit<EventService, keyof VerticalEntity>;

const CATEGORY_CFG: Record<EventServiceCategory, { label: string; bg: string; text: string }> = {
  catering: { label: EVENT_SERVICE_CATEGORY_LABELS.catering, bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300' },
  decoracion: { label: EVENT_SERVICE_CATEGORY_LABELS.decoracion, bg: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-700 dark:text-pink-300' },
  musica: { label: EVENT_SERVICE_CATEGORY_LABELS.musica, bg: 'bg-violet-100 dark:bg-violet-900/40', text: 'text-violet-700 dark:text-violet-300' },
  fotografia: { label: EVENT_SERVICE_CATEGORY_LABELS.fotografia, bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  video: { label: EVENT_SERVICE_CATEGORY_LABELS.video, bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300' },
  alquiler: { label: EVENT_SERVICE_CATEGORY_LABELS.alquiler, bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300' },
  personal: { label: EVENT_SERVICE_CATEGORY_LABELS.personal, bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  transporte: { label: EVENT_SERVICE_CATEGORY_LABELS.transporte, bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
  coordinacion: { label: EVENT_SERVICE_CATEGORY_LABELS.coordinacion, bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300' },
  otro: { label: EVENT_SERVICE_CATEGORY_LABELS.otro, bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' },
};

const EMPTY_FORM: ServiceForm = {
  nombre: '',
  categoria: 'catering',
  precio: 0,
  unidad: 'fijo',
  descripcion: '',
  activo: true,
};

function mapServiceCategory(raw: string): EventServiceCategory {
  return mapEventServiceCategory(raw);
}

function mapServiceUnit(raw: string): EventServiceUnit {
  return mapEventServiceUnit(raw);
}

const SERVICE_TABS = [
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'espacios', label: 'Espacios' },
  { id: 'externos', label: 'Externos' },
  { id: 'catering', label: 'Catering' },
  { id: 'logistica', label: 'Logística' },
] as const;

export type EventsServicesTabId = (typeof SERVICE_TABS)[number]['id'];

function parseEventsServicesTab(raw: string | null): EventsServicesTabId {
  if (raw === 'espacios' || raw === 'venues') return 'espacios';
  if (raw === 'externos' || raw === 'vendors') return 'externos';
  if (raw === 'catering') return 'catering';
  if (raw === 'logistica' || raw === 'logistics') return 'logistica';
  return 'catalogo';
}

export function RedirectToEventsServicesTab({ tab }: { tab: EventsServicesTabId }) {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set('tab', tab);
  return <Navigate to={`/saas/events-services?${next.toString()}`} replace />;
}

function EventsServicesCatalog() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<EventService>('events', 'services'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<EventService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<EventServiceCategory | ''>('');
  const [filterActive, setFilterActive] = useState<'' | 'si' | 'no'>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<EventService | null>(null);
  const [form, setForm] = useState<ServiceForm>(EMPTY_FORM);
  const [precioText, setPrecioText] = useState('');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setItems(await api.list(userId));
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useModalClose(showModal, () => setShowModal(false));

  useEffect(() => {
    if (!showModal) return;
    window.dispatchEvent(new Event('vertial:close-company-dropdown'));
  }, [showModal]);

  const filtered = useMemo(() => items.filter((s) => {
    const q = search.toLowerCase();
    const ms = !q || s.nombre.toLowerCase().includes(q) || s.descripcion.toLowerCase().includes(q);
    const mc = !filterCat || s.categoria === filterCat;
    const ma = !filterActive || (filterActive === 'si' ? s.activo : !s.activo);
    return ms && mc && ma;
  }), [items, search, filterCat, filterActive]);

  const stats = useMemo(() => {
    const activos = items.filter((s) => s.activo).length;
    const precioMedio = items.length
      ? Math.round(items.reduce((sum, s) => sum + (Number(s.precio) || 0), 0) / items.length)
      : 0;
    return { activos, total: items.length, precioMedio };
  }, [items]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPrecioText('');
    setShowModal(true);
  };
  const openEdit = (s: EventService) => {
    setEditing(s);
    setForm({
      nombre: s.nombre,
      categoria: s.categoria,
      precio: s.precio,
      unidad: s.unidad,
      descripcion: s.descripcion,
      activo: s.activo,
    });
    setPrecioText(s.precio ? String(s.precio).replace('.', ',') : '');
    setShowModal(true);
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
      toast.success('Servicio eliminado');
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  const handleSave = async () => {
    if (!form.nombre.trim() || !userId) {
      toast.error('Indica el nombre del servicio');
      return;
    }
    const precio = Number(String(precioText).replace(',', '.').trim());
    const payload = {
      ...form,
      precio: Number.isFinite(precio) ? precio : 0,
    };
    try {
      if (editing) {
        await api.update(userId, editing._id, payload);
        toast.success('Servicio actualizado');
      } else {
        await api.create(userId, payload);
        toast.success('Servicio creado');
      }
      await loadData();
      setShowModal(false);
    } catch {
      toast.error('No se pudo guardar');
    }
  };

  const toggleActive = async (s: EventService) => {
    if (!userId) return;
    try {
      await api.update(userId, s._id, { ...s, activo: !s.activo });
      await loadData();
    } catch {
      toast.error('No se pudo cambiar el estado');
    }
  };

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
      const nombre = entryStr(e, 'name', 'nombre');
      if (!nombre || isEventsServicesExampleName(nombre)) return null;
      return {
        nombre,
        categoria: mapServiceCategory(entryStr(e, 'category', 'categoria') || 'otro'),
        precio: parseEventServicePrice(entryStr(e, 'price', 'precio')),
        unidad: mapServiceUnit(entryStr(e, 'unit', 'unidad') || 'fijo'),
        descripcion: entryStr(e, 'description', 'descripcion'),
        activo: true,
      };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} servicio(s) creado(s)`);
    } else {
      toast.error('No se pudo crear ningún servicio');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 });

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'category', label: 'Categoría' },
    { key: 'price', label: 'Precio' },
    { key: 'unit', label: 'Unidad' },
    { key: 'description', label: 'Descripción' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = EVENTS_SERVICES_IMPORT_FIELDS;

  return (
    <>
      <div className="space-y-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Catálogo de servicios disponibles y precios. Se usan al armar presupuestos en nuevas contrataciones.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Servicios activos', value: stats.activos, icon: <CheckCircle className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
            { label: 'Total catálogo', value: stats.total, icon: <Sparkles className="w-5 h-5 text-cyan-500" />, bg: 'bg-cyan-50 dark:bg-cyan-900/30' },
            { label: 'Precio medio', value: fmt(stats.precioMedio), icon: <DollarSign className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
          ].map((s) => (
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
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar servicio…"
              disabled={loading}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value as EventServiceCategory | '')}
              disabled={loading}
              className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
            >
              <option value="">Todas las categorías</option>
              {Object.entries(CATEGORY_CFG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value as '' | 'si' | 'no')}
              disabled={loading}
              className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
            >
              <option value="">Todos</option>
              <option value="si">Activos</option>
              <option value="no">Inactivos</option>
            </select>
            <AddButtonDropdown
              label="Nuevo servicio"
              onQuickAdd={openCreate}
              onAIAdd={() => setShowAIModal(true)}
              onImport={() => setShowImportModal(true)}
              quickAddLabel="Alta rápida"
              quickAddDesc="Formulario de servicio"
            />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Servicio</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Categoría</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Precio</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Unidad</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Descripción</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin inline-block" />
                  </td>
                </tr>
              ) : filtered.map((s) => {
                const cat = CATEGORY_CFG[s.categoria] || CATEGORY_CFG.otro;
                return (
                  <tr key={s._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{s.nombre}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cat.bg} ${cat.text}`}>{cat.label}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{fmt(Number(s.precio) || 0)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      <span className="inline-flex items-center gap-1"><Tag className="w-3 h-3" />{EVENT_SERVICE_UNIT_LABELS[s.unidad] || s.unidad}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell truncate max-w-[220px]">{s.descripcion || '—'}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => void toggleActive(s)} className="inline-flex items-center gap-1 text-xs font-medium">
                        {s.activo
                          ? <><ToggleRight className="w-5 h-5 text-emerald-500" /> Activo</>
                          : <><ToggleLeft className="w-5 h-5 text-gray-400" /> Inactivo</>}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><Edit3 className="w-4 h-4" /></button>
                        <button type="button" onClick={() => void handleDelete(s._id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Sin servicios. Crea el catálogo para usarlo en presupuestos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            // Solo el fondo: un click en <select> nativo “cae” en el overlay al soltar y cerraba el modal.
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{editing ? 'Editar servicio' : 'Nuevo servicio'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <input
                value={form.nombre}
                onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                placeholder="Nombre del servicio *"
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-sm"
              />
              <div className="grid sm:grid-cols-2 gap-3">
                <select
                  value={form.categoria}
                  onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value as EventServiceCategory }))}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-sm"
                >
                  {Object.entries(CATEGORY_CFG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <select
                  value={form.unidad}
                  onChange={(e) => setForm((p) => ({ ...p, unidad: e.target.value as EventServiceUnit }))}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-sm"
                >
                  {Object.entries(EVENT_SERVICE_UNIT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="events-service-precio" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Precio
                </label>
                <div className="relative">
                  <input
                    id="events-service-precio"
                    name="precio"
                    type="text"
                    inputMode="decimal"
                    value={precioText}
                    onChange={(e) => {
                      const v = e.target.value;
                      // Solo dígitos y coma/punto (formato ES); vacío permitido para poder escribir.
                      if (v === '' || /^[\d.,]*$/.test(v)) setPrecioText(v);
                    }}
                    onFocus={(e) => e.target.select()}
                    placeholder="0,00"
                    autoComplete="off"
                    className="w-full pl-3 pr-10 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-sm tabular-nums"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500 dark:text-gray-400">
                    €
                  </span>
                </div>
              </div>
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
                placeholder="Descripción (opcional)"
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-sm"
              />
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={form.activo} onChange={(e) => setForm((p) => ({ ...p, activo: e.target.checked }))} />
                Servicio activo (visible en presupuestos)
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-700 rounded-lg">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-4 py-2 text-sm font-semibold bg-cyan-600 text-white rounded-lg">Guardar</button>
            </div>
          </div>
        </div>
      )}

      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="events_services"
        moduleLabel="Servicios"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Servicios"
        templateFileName="plantilla_servicios_eventos.xlsx"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
        onDownloadTemplate={downloadEventsServicesImportTemplate}
        headerAliases={EVENTS_SERVICES_HEADER_ALIASES}
        skipMappingWhenComplete
        importSheetName={EVENTS_SERVICES_SHEET_NAME}
      />
    </>
  );
}

export function EventsServices() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseEventsServicesTab(searchParams.get('tab'));
  const linkedEventName = searchParams.get('eventName') || '';
  const linkedEventId = searchParams.get('eventId') || '';

  const setTab = (next: EventsServicesTabId) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'catalogo') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <Layout title="Servicios">
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

        <div
          className="flex border-b border-stone-200 dark:border-stone-800 overflow-x-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {SERVICE_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                tab === item.id
                  ? 'vsaas-tab-active'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'catalogo' && <EventsServicesCatalog />}
        {tab === 'espacios' && <EventsVenues embedded />}
        {tab === 'externos' && <EventsVendors embedded />}
        {tab === 'catering' && <EventsCatering embedded />}
        {tab === 'logistica' && <EventsLogistics embedded />}
      </div>
    </Layout>
  );
}
