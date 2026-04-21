import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, X, Edit3, Trash2, Building2, Home, DollarSign,
  TrendingUp, MapPin, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type TipoInmueble = 'piso' | 'casa' | 'chalet' | 'local' | 'oficina' | 'terreno' | 'nave';
type Operacion = 'venta' | 'alquiler';
type EstadoProp = 'disponible' | 'reservado' | 'vendido' | 'alquilado';

interface Property extends VerticalEntity {
  referencia: string;
  tipo: TipoInmueble;
  direccion: string;
  m2: number;
  habitaciones: number;
  precio: number;
  operacion: Operacion;
  estado: EstadoProp;
}

type PropertyForm = Omit<Property, keyof VerticalEntity>;

const STATUS_CFG: Record<EstadoProp, { bg: string; text: string }> = {
  disponible: { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  reservado:  { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
  vendido:    { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  alquilado:  { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
};

const TIPOS: TipoInmueble[] = ['piso', 'casa', 'chalet', 'local', 'oficina', 'terreno', 'nave'];
const OPERACIONES: Operacion[] = ['venta', 'alquiler'];
const ESTADOS: EstadoProp[] = ['disponible', 'reservado', 'vendido', 'alquilado'];

const EMPTY: PropertyForm = {
  referencia: '', tipo: 'piso', direccion: '', m2: 0, habitaciones: 0,
  precio: 0, operacion: 'venta', estado: 'disponible',
};

export function RealEstateProperties() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Property>('realestate', 'properties'), []);
  const userId = user?.user_id || user?.id || '';

  const [data, setData] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterOp, setFilterOp] = useState<Operacion | ''>('');
  const [filterEstado, setFilterEstado] = useState<EstadoProp | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [form, setForm] = useState<PropertyForm>(EMPTY);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'address', label: 'Dirección' },
    { key: 'type', label: 'Tipo' },
    { key: 'area', label: 'Superficie' },
    { key: 'rooms', label: 'Habitaciones' },
    { key: 'price', label: 'Precio' },
    { key: 'status', label: 'Estado' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'address', label: 'Dirección', example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'area', label: 'Superficie', example: '' },
    { key: 'rooms', label: 'Habitaciones', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'status', label: 'Estado', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} inmueble(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} inmueble(s) importado(s)`);
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

  const filtered = useMemo(() => data.filter(p => {
    const ms = p.referencia.toLowerCase().includes(search.toLowerCase()) || p.direccion.toLowerCase().includes(search.toLowerCase());
    const mo = !filterOp || p.operacion === filterOp;
    const me = !filterEstado || p.estado === filterEstado;
    return ms && mo && me;
  }), [data, search, filterOp, filterEstado]);

  const enVenta = useMemo(() => data.filter(p => p.operacion === 'venta' && p.estado === 'disponible').length, [data]);
  const enAlquiler = useMemo(() => data.filter(p => p.operacion === 'alquiler' && p.estado === 'disponible').length, [data]);
  const valorCartera = useMemo(() => data.filter(p => p.operacion === 'venta').reduce((s, p) => s + p.precio, 0), [data]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (p: Property) => { setEditing(p); setForm({ referencia: p.referencia, tipo: p.tipo, direccion: p.direccion, m2: p.m2, habitaciones: p.habitaciones, precio: p.precio, operacion: p.operacion, estado: p.estado }); setModalOpen(true); };

  const handleSave = async () => {
    if (!form.referencia || !form.direccion || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setModalOpen(false);
    } catch {
      /* error shown by fetch layer */
    }
  };

  const handleRemove = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error shown by fetch layer */
    }
  };

  const stats = [
    { label: 'Total Inmuebles', value: data.length, icon: <Building2 className="w-5 h-5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'En Venta', value: enVenta, icon: <DollarSign className="w-5 h-5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'En Alquiler', value: enAlquiler, icon: <Home className="w-5 h-5" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Valor Cartera', value: `${valorCartera.toLocaleString('es-ES')} €`, icon: <TrendingUp className="w-5 h-5" />, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30' },
  ];

  return (
    <Layout title="Propiedades">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-4`}>
              <div className={s.color}>{s.icon}</div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por referencia o dirección..." disabled={loading} className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100" />
          </div>
          <div className="flex gap-2">
            <select value={filterOp} onChange={e => setFilterOp(e.target.value as Operacion | '')} disabled={loading} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
              <option value="">Operación</option>
              {OPERACIONES.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </select>
            <select value={filterEstado} onChange={e => setFilterEstado(e.target.value as EstadoProp | '')} disabled={loading} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
              <option value="">Estado</option>
              {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
            </select>
            <AddButtonDropdown
                label="Nuevo Inmueble"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de inmueble"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">Ref.</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Dirección</th>
                <th className="px-4 py-3 font-medium">m²</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Hab.</th>
                <th className="px-4 py-3 font-medium text-right">Precio</th>
                <th className="px-4 py-3 font-medium">Operación</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
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
              ) : filtered.map(p => (
                <tr key={p._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{p.referencia}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 capitalize">{p.tipo}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><span className="flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{p.direccion}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{p.m2.toLocaleString('es-ES')}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{p.habitaciones || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">{p.precio.toLocaleString('es-ES')} €{p.operacion === 'alquiler' ? '/mes' : ''}</td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${p.operacion === 'venta' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'}`}>{p.operacion}</span></td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_CFG[p.estado].bg} ${STATUS_CFG[p.estado].text}`}>{p.estado}</span></td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                    <button type="button" onClick={() => void handleRemove(p._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">No se encontraron inmuebles</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Inmueble' : 'Nuevo Inmueble'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {([
                { key: 'referencia', label: 'Referencia', type: 'text' },
                { key: 'direccion', label: 'Dirección', type: 'text' },
                { key: 'm2', label: 'Superficie (m²)', type: 'number' },
                { key: 'habitaciones', label: 'Habitaciones', type: 'number' },
                { key: 'precio', label: 'Precio (€)', type: 'number' },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                  <input type={f.type} value={(form as Record<string, string | number>)[f.key] as string | number} onChange={e => setForm({ ...form, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as TipoInmueble })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                  {TIPOS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Operación</label>
                <select value={form.operacion} onChange={e => setForm({ ...form, operacion: e.target.value as Operacion })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                  {OPERACIONES.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as EstadoProp })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                  {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="realestate_properties"
        moduleLabel="Inmuebles"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Inmuebles"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
