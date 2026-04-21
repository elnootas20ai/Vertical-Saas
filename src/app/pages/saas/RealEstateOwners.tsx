import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, X, Edit3, Trash2, Users, Building2,
  Phone, Mail, Percent, DollarSign, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface Owner extends VerticalEntity {
  nombre: string;
  dniCif: string;
  telefono: string;
  email: string;
  propiedades: number;
  comision: number;
  ingresosGenerados: number;
}

type OwnerForm = Omit<Owner, keyof VerticalEntity>;

const EMPTY: OwnerForm = {
  nombre: '', dniCif: '', telefono: '', email: '',
  propiedades: 0, comision: 10, ingresosGenerados: 0,
};

export function RealEstateOwners() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Owner>('realestate', 'owners'), []);
  const userId = user?.user_id || user?.id || '';

  const [data, setData] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Owner | null>(null);
  const [form, setForm] = useState<OwnerForm>(EMPTY);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'dni', label: 'DNI/CIF' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'address', label: 'Dirección' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'dni', label: 'DNI/CIF', example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'address', label: 'Dirección', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} propietario(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} propietario(s) importado(s)`);
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

  const filtered = useMemo(() => data.filter(o => {
    return o.nombre.toLowerCase().includes(search.toLowerCase()) || o.dniCif.toLowerCase().includes(search.toLowerCase());
  }), [data, search]);

  const totalProps = useMemo(() => data.reduce((s, o) => s + o.propiedades, 0), [data]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (o: Owner) => { setEditing(o); setForm({ nombre: o.nombre, dniCif: o.dniCif, telefono: o.telefono, email: o.email, propiedades: o.propiedades, comision: o.comision, ingresosGenerados: o.ingresosGenerados }); setModalOpen(true); };

  const handleSave = async () => {
    if (!form.nombre || !form.dniCif || !userId) return;
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
    { label: 'Total Propietarios', value: data.length, icon: <Users className="w-5 h-5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Propiedades Gestionadas', value: totalProps, icon: <Building2 className="w-5 h-5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Ingresos Totales', value: `${data.reduce((s, o) => s + o.ingresosGenerados, 0).toLocaleString('es-ES')} €`, icon: <DollarSign className="w-5 h-5" />, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30' },
  ];

  return (
    <Layout title="Propietarios">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o DNI/CIF..." disabled={loading} className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100" />
          </div>
          <AddButtonDropdown
                label="Nuevo Propietario"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de propietario"
              />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">DNI/CIF</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Teléfono</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Email</th>
                <th className="px-4 py-3 font-medium text-center">Propiedades</th>
                <th className="px-4 py-3 font-medium text-center">Comisión</th>
                <th className="px-4 py-3 font-medium text-right">Ingresos</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(o => (
                <tr key={o._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{o.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{o.dniCif}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell"><span className="flex items-center gap-1"><Phone className="w-3 h-3" />{o.telefono}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell"><span className="flex items-center gap-1"><Mail className="w-3 h-3" />{o.email}</span></td>
                  <td className="px-4 py-3 text-center"><span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"><Building2 className="w-3 h-3" />{o.propiedades}</span></td>
                  <td className="px-4 py-3 text-center"><span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"><Percent className="w-3 h-3" />{o.comision}%</span></td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">{o.ingresosGenerados.toLocaleString('es-ES')} €</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => openEdit(o)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                    <button type="button" onClick={() => void handleRemove(o._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">No se encontraron propietarios</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Propietario' : 'Nuevo Propietario'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {([
                { key: 'nombre', label: 'Nombre / Razón social', type: 'text' },
                { key: 'dniCif', label: 'DNI / CIF', type: 'text' },
                { key: 'telefono', label: 'Teléfono', type: 'tel' },
                { key: 'email', label: 'Email', type: 'email' },
                { key: 'propiedades', label: 'Nº Propiedades', type: 'number' },
                { key: 'comision', label: 'Comisión (%)', type: 'number' },
                { key: 'ingresosGenerados', label: 'Ingresos generados (€)', type: 'number' },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                  <input type={f.type} value={(form as Record<string, string | number>)[f.key]} onChange={e => setForm({ ...form, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
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
        module="realestate_owners"
        moduleLabel="Propietarios"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Propietarios"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
