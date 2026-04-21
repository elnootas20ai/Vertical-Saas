import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, X, Edit3, Trash2, FileText, DollarSign,
  AlertCircle, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type TipoContrato = 'alquiler' | 'venta';
type EstadoContrato = 'activo' | 'vencido' | 'rescindido' | 'borrador';

interface Contract extends VerticalEntity {
  referencia: string;
  propiedad: string;
  cliente: string;
  tipo: TipoContrato;
  fechaInicio: string;
  fechaFin: string;
  importeMensual: number;
  importeTotal: number;
  estado: EstadoContrato;
}

type ContractForm = Omit<Contract, keyof VerticalEntity>;

const STATUS_CFG: Record<EstadoContrato, { bg: string; text: string }> = {
  activo:     { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  vencido:    { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300' },
  rescindido: { bg: 'bg-gray-100 dark:bg-gray-700/40', text: 'text-gray-700 dark:text-gray-300' },
  borrador:   { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
};

const TIPOS: TipoContrato[] = ['alquiler', 'venta'];
const ESTADOS: EstadoContrato[] = ['activo', 'vencido', 'rescindido', 'borrador'];

const EMPTY: ContractForm = {
  referencia: '', propiedad: '', cliente: '', tipo: 'alquiler',
  fechaInicio: '', fechaFin: '', importeMensual: 0, importeTotal: 0, estado: 'borrador',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addMonthsFromTodayISO(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function RealEstateContracts() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Contract>('realestate', 'contracts'), []);
  const userId = user?.user_id || user?.id || '';

  const [data, setData] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<EstadoContrato | ''>('');
  const [filterTipo, setFilterTipo] = useState<TipoContrato | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [form, setForm] = useState<ContractForm>(EMPTY);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'property', label: 'Inmueble' },
    { key: 'tenant', label: 'Inquilino' },
    { key: 'startDate', label: 'Fecha inicio' },
    { key: 'endDate', label: 'Fecha fin' },
    { key: 'rent', label: 'Renta' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'property', label: 'Inmueble', example: '' },
    { key: 'tenant', label: 'Inquilino', example: '' },
    { key: 'startDate', label: 'Fecha inicio', example: '' },
    { key: 'endDate', label: 'Fecha fin', example: '' },
    { key: 'rent', label: 'Renta', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} contrato(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} contrato(s) importado(s)`);
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

  const filtered = useMemo(() => data.filter(c => {
    const ms = c.referencia.toLowerCase().includes(search.toLowerCase()) || c.cliente.toLowerCase().includes(search.toLowerCase()) || c.propiedad.toLowerCase().includes(search.toLowerCase());
    const me = !filterEstado || c.estado === filterEstado;
    const mt = !filterTipo || c.tipo === filterTipo;
    return ms && me && mt;
  }), [data, search, filterEstado, filterTipo]);

  const activos = useMemo(() => data.filter(c => c.estado === 'activo').length, [data]);
  const ingresosMensuales = useMemo(() => data.filter(c => c.estado === 'activo' && c.tipo === 'alquiler').reduce((s, c) => s + c.importeMensual, 0), [data]);
  const limiteVenc = addMonthsFromTodayISO(3);
  const hoy = todayISO();
  const proxVencimientos = useMemo(
    () => data.filter(c => c.estado === 'activo' && c.fechaFin && c.fechaFin >= hoy && c.fechaFin <= limiteVenc).length,
    [data, hoy, limiteVenc],
  );

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (c: Contract) => { setEditing(c); setForm({ referencia: c.referencia, propiedad: c.propiedad, cliente: c.cliente, tipo: c.tipo, fechaInicio: c.fechaInicio, fechaFin: c.fechaFin, importeMensual: c.importeMensual, importeTotal: c.importeTotal, estado: c.estado }); setModalOpen(true); };

  const handleSave = async () => {
    if (!form.referencia || !form.cliente || !userId) return;
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
    { label: 'Contratos Activos', value: activos, icon: <FileText className="w-5 h-5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Ingresos Mensuales', value: `${ingresosMensuales.toLocaleString('es-ES')} €`, icon: <DollarSign className="w-5 h-5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Próx. Vencimientos', value: proxVencimientos, icon: <AlertCircle className="w-5 h-5" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Contratos">
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por referencia, propiedad o cliente..." disabled={loading} className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100" />
          </div>
          <div className="flex gap-2">
            <select value={filterTipo} onChange={e => setFilterTipo(e.target.value as TipoContrato | '')} disabled={loading} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
              <option value="">Tipo</option>
              {TIPOS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
            <select value={filterEstado} onChange={e => setFilterEstado(e.target.value as EstadoContrato | '')} disabled={loading} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
              <option value="">Estado</option>
              {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
            </select>
            <AddButtonDropdown
                label="Nuevo contrato"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de contrato"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">Ref.</th>
                <th className="px-4 py-3 font-medium">Propiedad</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Inicio</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Fin</th>
                <th className="px-4 py-3 font-medium text-right hidden lg:table-cell">Mensual</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
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
              ) : filtered.map(c => (
                <tr key={c._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{c.referencia}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.propiedad}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.cliente}</td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${c.tipo === 'alquiler' ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'}`}>{c.tipo}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{c.fechaInicio || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{c.fechaFin || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 hidden lg:table-cell">{c.importeMensual ? `${c.importeMensual.toLocaleString('es-ES')} €` : '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">{c.importeTotal.toLocaleString('es-ES')} €</td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_CFG[c.estado].bg} ${STATUS_CFG[c.estado].text}`}>{c.estado}</span></td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                    <button type="button" onClick={() => void handleRemove(c._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">No se encontraron contratos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Contrato' : 'Nuevo Contrato'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {([
                { key: 'referencia', label: 'Referencia', type: 'text' },
                { key: 'propiedad', label: 'Propiedad', type: 'text' },
                { key: 'cliente', label: 'Cliente', type: 'text' },
                { key: 'fechaInicio', label: 'Fecha inicio', type: 'date' },
                { key: 'fechaFin', label: 'Fecha fin', type: 'date' },
                { key: 'importeMensual', label: 'Importe mensual (€)', type: 'number' },
                { key: 'importeTotal', label: 'Importe total (€)', type: 'number' },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                  <input type={f.type} value={(form as Record<string, string | number>)[f.key]} onChange={e => setForm({ ...form, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as TipoContrato })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                  {TIPOS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as EstadoContrato })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
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
        module="realestate_contracts"
        moduleLabel="Contratos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Contratos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
