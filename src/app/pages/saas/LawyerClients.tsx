import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { NuevoClienteModal } from '../../components/saas/NuevoClienteModal';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit3, Users, UserPlus, Filter,
  Phone, Mail, Building2, User, TrendingUp, CreditCard, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type ClientType = 'persona_fisica' | 'persona_juridica';

interface Client extends VerticalEntity {
  nombre: string;
  dni: string;
  tipo: ClientType;
  telefono: string;
  email: string;
  casosActivos: number;
  fechaAlta: string;
  saldoPendiente: number;
}

type ClientForm = Omit<Client, keyof VerticalEntity>;

const TYPE_LABELS: Record<ClientType, string> = {
  persona_fisica: 'Persona física',
  persona_juridica: 'Persona jurídica',
};

const emptyForm = (): ClientForm => ({
  nombre: '', dni: '', tipo: 'persona_fisica', telefono: '', email: '',
  casosActivos: 0, fechaAlta: '', saldoPendiente: 0,
});

export function LawyerClients() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Client>('lawyer', 'clients'), []);
  const userId = user?.user_id || user?.id || '';

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<ClientType | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm());
  const [showNuevoClienteModal, setShowNuevoClienteModal] = useState(false);
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
      setClients(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      dni: entryStr(e, 'dni', 'document', 'id') || '',
      tipo: entryStr(e, 'tipo', 'type') || 'persona_fisica',
      telefono: entryStr(e, 'telefono', 'phone', 'tel') || '',
      email: entryStr(e, 'email') || '',
      casosActivos: entryNum(e, 'casosActivos'),
      fechaAlta: entryStr(e, 'fechaAlta', 'startDate', 'date') || '',
      saldoPendiente: entryNum(e, 'saldoPendiente'),
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} cliente creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(modalOpen, () => setModalOpen(false));

  const filtered = useMemo(() => clients.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = c.nombre.toLowerCase().includes(q) || c.dni.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
    const matchType = !filterType || c.tipo === filterType;
    return matchSearch && matchType;
  }), [clients, search, filterType]);

  const stats = useMemo(() => ({
    total: clients.length,
    activos: clients.filter(c => c.casosActivos > 0).length,
    nuevosMes: clients.filter(c => c.fechaAlta >= '2026-03-01').length,
    saldoTotal: clients.reduce((s, c) => s + c.saldoPendiente, 0),
  }), [clients]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true); };
  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({
      nombre: c.nombre, dni: c.dni, tipo: c.tipo, telefono: c.telefono, email: c.email,
      casosActivos: c.casosActivos, fechaAlta: c.fechaAlta, saldoPendiente: c.saldoPendiente,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || !userId) return;
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

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error shown by fetch layer */
    }
  };
  const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <Layout title="Clientes">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total clientes', value: stats.total, icon: Users, color: 'text-blue-600' },
          { label: 'Con casos activos', value: stats.activos, icon: TrendingUp, color: 'text-green-600' },
          { label: 'Nuevos este mes', value: stats.nuevosMes, icon: UserPlus, color: 'text-purple-600' },
          { label: 'Saldo pendiente', value: fmt(stats.saldoTotal), icon: CreditCard, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <span className="text-sm text-gray-500 dark:text-gray-400">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" placeholder="Buscar por nombre, DNI/CIF, email..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400" />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={filterType} onChange={e => setFilterType(e.target.value as ClientType | '')} disabled={loading} className="pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
              <option value="">Todos los tipos</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <AddButtonDropdown
                label="Nuevo cliente"
                onQuickAdd={() => setShowNuevoClienteModal(true)}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de cliente"
              />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
              {['Nombre', 'DNI/CIF', 'Tipo', 'Teléfono', 'Email', 'Casos activos', 'Fecha alta', 'Saldo pendiente', ''].map(h => (
                <th key={h} className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
              ))}
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
            ) : filtered.map(c => (
              <tr key={c._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  {c.tipo === 'persona_juridica' ? <Building2 className="w-4 h-4 text-gray-400 shrink-0" /> : <User className="w-4 h-4 text-gray-400 shrink-0" />}
                  {c.nombre}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono text-xs">{c.dni}</td>
                <td className="px-4 py-3"><span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${c.tipo === 'persona_juridica' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'}`}>{TYPE_LABELS[c.tipo]}</span></td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap"><span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{c.telefono}</span></td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{c.email}</span></td>
                <td className="px-4 py-3 text-center"><span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${c.casosActivos > 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>{c.casosActivos}</span></td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{c.fechaAlta}</td>
                <td className="px-4 py-3 font-semibold whitespace-nowrap"><span className={c.saldoPendiente > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}>{fmt(c.saldoPendiente)}</span></td>
                <td className="px-4 py-3 flex gap-1">
                  <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                  <button onClick={() => void handleDelete(c._id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><X className="w-4 h-4 text-red-400" /></button>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No se encontraron clientes</td></tr>}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Users className="w-5 h-5" />{editing ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label className={labelClass}>Nombre completo / Razón social</label><input className={inputClass} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required /></div>
              <div><label className={labelClass}>DNI / CIF</label><input className={inputClass} value={form.dni} onChange={e => setForm({ ...form, dni: e.target.value })} required /></div>
              <div>
                <label className={labelClass}>Tipo</label>
                <select className={inputClass} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as ClientType })}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Teléfono</label><input className={inputClass} value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} /></div>
              <div><label className={labelClass}>Email</label><input type="email" className={inputClass} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className={labelClass}>Fecha alta</label><input type="date" className={inputClass} value={form.fechaAlta} onChange={e => setForm({ ...form, fechaAlta: e.target.value })} /></div>
              <div><label className={labelClass}>Saldo pendiente (€)</label><input type="number" className={inputClass} value={form.saldoPendiente} onChange={e => setForm({ ...form, saldoPendiente: Number(e.target.value) })} /></div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancelar</button>
              <button type="submit" className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-xl font-semibold transition-colors">Guardar</button>
            </div>
          </form>
        </div>
      )}

      <NuevoClienteModal
        open={showNuevoClienteModal}
        onClose={() => setShowNuevoClienteModal(false)}
        onClientCreated={() => {
          setShowNuevoClienteModal(false);
          void loadData();
        }}
        contexto="vertical"
      />
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="lawyer_clients"
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
