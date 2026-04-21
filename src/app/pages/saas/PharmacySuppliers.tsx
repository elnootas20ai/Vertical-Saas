import { useState, useMemo, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import {
  Search, X, Edit2, Trash2, Filter,
  Truck, FlaskConical, PackageSearch, Clock3, Loader2,
} from 'lucide-react';

type SupplierType = 'laboratorio' | 'distribuidor' | 'mayorista';

interface Supplier extends VerticalEntity {
  nombre: string;
  tipo: SupplierType;
  contacto: string;
  telefono: string;
  email: string;
  ultimoPedido: string;
  pedidosPendientes: number;
}

type SupplierFormFields = Omit<
  Supplier,
  '_id' | '_rev' | 'type' | 'user_id' | 'createdAt' | 'updatedAt'
>;

const TIPO_LABEL: Record<SupplierType, string> = {
  laboratorio: 'Laboratorio',
  distribuidor: 'Distribuidor',
  mayorista: 'Mayorista',
};

const EMPTY_FORM: SupplierFormFields = {
  nombre: '', tipo: 'distribuidor', contacto: '', telefono: '', email: '', ultimoPedido: '', pedidosPendientes: 0,
};

export function PharmacySuppliers() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Supplier>('pharmacy', 'suppliers'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState<SupplierType | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierFormFields>(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'cif', label: 'CIF' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'address', label: 'Dirección' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'cif', label: 'CIF', example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'address', label: 'Dirección', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} proveedor(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} proveedor(s) importado(s)`);
  };

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const list = await api.list(userId);
      setItems(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => items.filter(s => {
    const q = search.toLowerCase();
    if (search && !s.nombre.toLowerCase().includes(q) && !s.contacto.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q)) return false;
    if (filterTipo !== 'all' && s.tipo !== filterTipo) return false;
    return true;
  }), [items, search, filterTipo]);

  const stats = useMemo(() => {
    const laboratorios = items.filter(s => s.tipo === 'laboratorio').length;
    const pedidosPendientes = items.reduce((a, s) => a + s.pedidosPendientes, 0);
    const ultimo = items.reduce<string | null>((best, s) => {
      if (!best || s.ultimoPedido > best) return s.ultimoPedido;
      return best;
    }, null);
    return { total: items.length, laboratorios, pedidosPendientes, ultimoPedido: ultimo ?? '—' };
  }, [items]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ nombre: s.nombre, tipo: s.tipo, contacto: s.contacto, telefono: s.telefono, email: s.email, ultimoPedido: s.ultimoPedido, pedidosPendientes: s.pedidosPendientes });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) return;
    if (!userId) return;
    try {
      const formData = { ...form } as Partial<Supplier>;
      if (editing) {
        await api.update(userId, editing._id, formData);
      } else {
        await api.create(userId, formData);
      }
      await loadData();
      setShowModal(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const STAT_CARDS = [
    { label: 'Total proveedores', value: stats.total, icon: Truck, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Laboratorios', value: stats.laboratorios, icon: FlaskConical, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
    { label: 'Pedidos pendientes', value: stats.pedidosPendientes, icon: PackageSearch, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Último pedido (global)', value: stats.ultimoPedido, icon: Clock3, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
  ];

  return (
    <Layout title="Proveedores y Laboratorios">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map(s => (
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
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por nombre, contacto o email..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterTipo} onChange={e => setFilterTipo(e.target.value as SupplierType | 'all')}>
                <option value="all">Todos los tipos</option>
                {(Object.keys(TIPO_LABEL) as SupplierType[]).map(k => <option key={k} value={k}>{TIPO_LABEL[k]}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nuevo proveedor"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de proveedor"
              />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Contacto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Teléfono</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Último pedido</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Pendientes</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Loader2 className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500 animate-spin" />
                  </td>
                </tr>
              ) : (
                <>
                  {filtered.map(s => (
                    <tr key={s._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.nombre}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{TIPO_LABEL[s.tipo]}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.contacto}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.telefono}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[180px] truncate" title={s.email}>{s.email}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.ultimoPedido}</td>
                      <td className={`px-4 py-3 text-right font-medium ${s.pedidosPendientes > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}>{s.pedidosPendientes}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button type="button" onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                          <button type="button" onClick={() => handleDelete(s._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay proveedores que coincidan con los filtros.</td></tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo</label>
                <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as SupplierType }))}>
                  {(Object.keys(TIPO_LABEL) as SupplierType[]).map(k => <option key={k} value={k}>{TIPO_LABEL[k]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Contacto</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.contacto} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Teléfono</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Pedidos pendientes</label>
                  <input type="number" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.pedidosPendientes} onChange={e => setForm(f => ({ ...f, pedidosPendientes: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                <input type="email" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Último pedido</label>
                <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.ultimoPedido} onChange={e => setForm(f => ({ ...f, ultimoPedido: e.target.value }))} />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Crear proveedor'}</button>
            </div>
          </div>
        </div>
      )}

      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="pharmacy_suppliers"
        moduleLabel="Proveedores"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Proveedores"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
