import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, Edit3, Trash2, X, Save, Building2,
  Phone, Mail, Star, Euro, Award,
  Package, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type CondicionesPago = 'contado' | '30_dias' | '60_dias';

interface Supplier extends VerticalEntity {
  empresa: string;
  cif: string;
  contacto: string;
  telefono: string;
  email: string;
  marcas: string[];
  plazoEntrega: string;
  condicionesPago: CondicionesPago;
  descuento: number;
  valoracion: number;
}

type SupplierForm = Omit<Supplier, keyof VerticalEntity>;

const CONDICIONES_LABEL: Record<CondicionesPago, string> = {
  contado: 'Contado', '30_dias': '30 días', '60_dias': '60 días',
};

const TODAS_MARCAS = ['Bosch', 'Valeo', 'Sachs', 'Mann', 'SKF', 'TRW', 'Continental', 'Febi', 'LuK', 'NGK', 'Brembo', 'Monroe'];

const emptyForm = (): SupplierForm => ({
  empresa: '', cif: '', contacto: '', telefono: '', email: '',
  marcas: [], plazoEntrega: '24-48h', condicionesPago: '30_dias', descuento: 0, valoracion: 3,
});

export function SparePartsSuppliers() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Supplier>('spareparts', 'suppliers'), []);
  const userId = user?.user_id || user?.id || '';

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMarca, setFilterMarca] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'cif', label: 'CIF' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'address', label: 'Dirección' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'cif', label: 'CIF', example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'address', label: 'Dirección', example: '' },
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
      empresa: entryStr(e, 'empresa') || '',
      cif: entryStr(e, 'cif') || '',
      contacto: entryStr(e, 'contacto') || '',
      telefono: entryStr(e, 'telefono', 'phone', 'tel') || '',
      email: entryStr(e, 'email') || '',
      marcas: [],
      plazoEntrega: entryStr(e, 'plazoEntrega') || '24-48h',
      condicionesPago: entryStr(e, 'condicionesPago') || '30_dias',
      descuento: entryNum(e, 'descuento'),
      valoracion: entryNum(e, 'valoracion'),
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} proveedor creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setSuppliers(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = suppliers.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.empresa.toLowerCase().includes(q) || s.contacto.toLowerCase().includes(q) || s.cif.toLowerCase().includes(q);
    const matchMarca = !filterMarca || s.marcas.includes(filterMarca);
    return matchSearch && matchMarca;
  });

  const activos = suppliers.length;
  const pedidosPendientes = 12;
  const mayorVolumen =
    suppliers.length > 0
      ? suppliers.reduce((best, s) => (s.descuento > best.descuento ? s : best), suppliers[0])
      : undefined;

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      empresa: s.empresa,
      cif: s.cif,
      contacto: s.contacto,
      telefono: s.telefono,
      email: s.email,
      marcas: [...s.marcas],
      plazoEntrega: s.plazoEntrega,
      condicionesPago: s.condicionesPago,
      descuento: s.descuento,
      valoracion: s.valoracion,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!userId || !form.empresa || !form.cif) return;
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

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error from fetch */
    }
  };

  const toggleMarca = (marca: string) => {
    setForm(prev => ({
      ...prev,
      marcas: prev.marcas.includes(marca) ? prev.marcas.filter(m => m !== marca) : [...prev.marcas, marca],
    }));
  };

  const renderStars = (rating: number) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-gray-600'}`} />
      ))}
    </div>
  );

  const stats = [
    { label: 'Proveedores Activos', value: activos, icon: <Building2 className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Pedidos Pendientes', value: pedidosPendientes, icon: <Package className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Mayor Volumen', value: mayorVolumen?.empresa?.split(' ')[0] || '—', icon: <Award className="w-5 h-5 text-green-500" />, bg: 'bg-green-50 dark:bg-green-900/30' },
    { label: 'Dto. Medio', value: `${suppliers.length ? (suppliers.reduce((s, x) => s + x.descuento, 0) / suppliers.length).toFixed(1) : '0.0'}%`, icon: <Euro className="w-5 h-5 text-purple-500" />, bg: 'bg-purple-50 dark:bg-purple-900/30' },
  ];

  return (
    <Layout title="Proveedores de Recambios">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-3`}>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{s.icon}</div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empresa, CIF, contacto..." disabled={loading} className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm w-64 focus:ring-2 focus:ring-blue-500 dark:text-gray-100" />
            </div>
            <select value={filterMarca} onChange={e => setFilterMarca(e.target.value)} disabled={loading} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
              <option value="">Todas las marcas</option>
              {TODAS_MARCAS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <AddButtonDropdown
                label="Nuevo proveedor"
                onQuickAdd={openCreate}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de proveedor"
              />
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Empresa</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">CIF</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Contacto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Teléfono</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Marcas</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Plazo</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Pago</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Dto.</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Valoración</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Acciones</th>
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
              ) : filtered.map(s => (
                <tr key={s._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{s.empresa}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{s.cif}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{s.contacto}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{s.telefono}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.marcas.slice(0, 3).map(m => <span key={m} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{m}</span>)}
                      {s.marcas.length > 3 && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">+{s.marcas.length - 3}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-600 dark:text-gray-400">{s.plazoEntrega}</td>
                  <td className="px-4 py-3 text-center text-xs text-gray-600 dark:text-gray-400">{CONDICIONES_LABEL[s.condicionesPago]}</td>
                  <td className="px-4 py-3 text-center font-semibold text-green-600 dark:text-green-400">{s.descuento}%</td>
                  <td className="px-4 py-3">{renderStars(s.valoracion)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => void handleDelete(s._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">No se encontraron proveedores</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h3>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Empresa *</label>
                    <input value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">CIF *</label>
                    <input value={form.cif} onChange={e => setForm({ ...form, cif: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Contacto</label>
                  <input value={form.contacto} onChange={e => setForm({ ...form, contacto: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Teléfono</label>
                    <input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
                    <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Marcas que distribuye</label>
                  <div className="flex flex-wrap gap-2">
                    {TODAS_MARCAS.map(m => (
                      <button key={m} onClick={() => toggleMarca(m)} className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${form.marcas.includes(m) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>{m}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Plazo Entrega</label>
                    <input value={form.plazoEntrega} onChange={e => setForm({ ...form, plazoEntrega: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Condiciones Pago</label>
                    <select value={form.condicionesPago} onChange={e => setForm({ ...form, condicionesPago: e.target.value as CondicionesPago })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                      {Object.entries(CONDICIONES_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Descuento %</label>
                    <input type="number" value={form.descuento} onChange={e => setForm({ ...form, descuento: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Valoración</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <button key={i} onClick={() => setForm({ ...form, valoracion: i })}>
                        <Star className={`w-6 h-6 cursor-pointer transition-colors ${i <= form.valoracion ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-gray-600'}`} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-2 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
                <button type="button" onClick={() => void handleSave()} className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"><Save className="w-4 h-4" /> Guardar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="spareparts_suppliers"
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
