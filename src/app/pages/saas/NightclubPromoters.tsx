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
  ChevronDown,
  Users,
  DollarSign,
  Megaphone,
  Phone,
  Mail,
  Star,
} from 'lucide-react';

interface Promoter extends VerticalEntity {
  nombre: string;
  telefono: string;
  email: string;
  invitacionesUsadas: number;
  clientesTraidos: number;
  comisionPct: number;
  ingresosGenerados: number;
  valoracion: number;
  activo: boolean;
}

const EMPTY: Omit<Promoter, keyof VerticalEntity> = { nombre: '', telefono: '', email: '', invitacionesUsadas: 0, clientesTraidos: 0, comisionPct: 8, ingresosGenerados: 0, valoracion: 0, activo: true };

export function NightclubPromoters() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Promoter>('nightclub', 'promoters'), []);
  const userId = user?.user_id || user?.id || '';

  const [data, setData] = useState<Promoter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'' | 'true' | 'false'>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Promoter | null>(null);
  const [form, setForm] = useState<Omit<Promoter, keyof VerticalEntity>>(EMPTY);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'commission', label: 'Comisión' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'commission', label: 'Comisión', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const nombre = entryStr(e, 'nombre', 'name');
    if (!nombre) return null;
    return {
      nombre,
      telefono: entryStr(e, 'telefono', 'phone', 'tel') || '',
      email: entryStr(e, 'email') || '',
      invitacionesUsadas: entryNum(e, 'invitacionesUsadas'),
      clientesTraidos: entryNum(e, 'clientesTraidos'),
      comisionPct: entryNum(e, 'comisionPct'),
      ingresosGenerados: entryNum(e, 'ingresosGenerados'),
      valoracion: entryNum(e, 'valoracion'),
      activo: true,
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} promotor creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
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

  const filtered = data.filter(p => {
    const s = search.toLowerCase();
    const matchSearch = p.nombre.toLowerCase().includes(s) || p.email.toLowerCase().includes(s);
    const matchActive = filterActive === '' || (filterActive === 'true' ? p.activo : !p.activo);
    return matchSearch && matchActive;
  });

  const activeCount = data.filter(p => p.activo).length;
  const totalInvites = data.reduce((s, p) => s + p.invitacionesUsadas, 0);
  const totalRevenue = data.reduce((s, p) => s + p.ingresosGenerados, 0);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (p: Promoter) => { setEditing(p); setForm({ nombre: p.nombre, telefono: p.telefono, email: p.email, invitacionesUsadas: p.invitacionesUsadas, clientesTraidos: p.clientesTraidos, comisionPct: p.comisionPct, ingresosGenerados: p.ingresosGenerados, valoracion: p.valoracion, activo: p.activo }); setModalOpen(true); };

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
    { label: 'Promotores Activos', value: activeCount, icon: <Megaphone className="w-5 h-5 text-purple-500" />, bg: 'bg-purple-50 dark:bg-purple-900/30' },
    { label: 'Invitaciones Totales', value: totalInvites.toLocaleString('es-ES'), icon: <Users className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Ingresos Generados', value: `${totalRevenue.toLocaleString('es-ES')} €`, icon: <DollarSign className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
  ];

  return (
    <Layout title="RRPP / Promotores">
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-white/70 dark:bg-gray-950/70">
            <div className="flex flex-col items-center gap-3 text-gray-700 dark:text-gray-200">
              <span className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-white" aria-hidden />
              <span className="text-sm font-medium">Cargando promotores…</span>
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar promotor…" className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <div className="relative">
              <select value={filterActive} onChange={e => setFilterActive(e.target.value as '' | 'true' | 'false')} className="appearance-none pl-8 pr-8 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 outline-none">
                <option value="">Todos</option>
                <option value="true">Activos</option>
                <option value="false">Inactivos</option>
              </select>
              <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
            <AddButtonDropdown
                label="Nuevo Promotor"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de promotor"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium text-right">Invitaciones</th>
                <th className="px-4 py-3 font-medium text-right">Clientes</th>
                <th className="px-4 py-3 font-medium text-right">Comisión</th>
                <th className="px-4 py-3 font-medium text-right">Ingresos</th>
                <th className="px-4 py-3 font-medium">Valoración</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{p.nombre}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300 text-xs"><Phone className="w-3 h-3" />{p.telefono}</span>
                      <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-xs"><Mail className="w-3 h-3" />{p.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{p.invitacionesUsadas}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{p.clientesTraidos}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{p.comisionPct}%</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{p.ingresosGenerados.toLocaleString('es-ES')} €</td>
                  <td className="px-4 py-3">{renderStars(p.valoracion)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${p.activo ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => remove(p._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {!filtered.length && !loading && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No se encontraron promotores</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{editing ? 'Editar Promotor' : 'Nuevo Promotor'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono</label><input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comisión %</label><input type="number" value={form.comisionPct} onChange={e => setForm({ ...form, comisionPct: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valoración (0-5)</label><input type="number" step="0.1" min="0" max="5" value={form.valoracion} onChange={e => setForm({ ...form, valoracion: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invitaciones usadas</label><input type="number" value={form.invitacionesUsadas} onChange={e => setForm({ ...form, invitacionesUsadas: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Clientes traídos</label><input type="number" value={form.clientesTraidos} onChange={e => setForm({ ...form, clientesTraidos: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ingresos generados €</label><input type="number" value={form.ingresosGenerados} onChange={e => setForm({ ...form, ingresosGenerados: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="activo" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                <label htmlFor="activo" className="text-sm text-gray-700 dark:text-gray-300">Promotor activo</label>
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
        module="nightclub_promoters"
        moduleLabel="Promotores"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Promotores"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
