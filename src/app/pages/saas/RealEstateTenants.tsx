import { useState, useMemo, useCallback, useEffect } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, X, Edit3, Trash2, Users, AlertCircle,
  Phone, Mail, CalendarDays, CheckCircle2, Clock, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type EstadoPagos = 'al_dia' | 'pendiente' | 'impagado';

interface Tenant extends VerticalEntity {
  nombre: string;
  dni: string;
  telefono: string;
  email: string;
  propiedad: string;
  contrato: string;
  rentaMensual: number;
  estadoPagos: EstadoPagos;
  fechaFinContrato: string;
}

type TenantForm = Omit<Tenant, keyof VerticalEntity>;

const PAGO_CFG: Record<EstadoPagos, { bg: string; text: string; label: string }> = {
  al_dia:    { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', label: 'Al día' },
  pendiente: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', label: 'Pendiente' },
  impagado:  { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300', label: 'Impagado' },
};

const ESTADOS_PAGO: EstadoPagos[] = ['al_dia', 'pendiente', 'impagado'];

const EMPTY: TenantForm = {
  nombre: '', dni: '', telefono: '', email: '', propiedad: '',
  contrato: '', rentaMensual: 0, estadoPagos: 'al_dia', fechaFinContrato: '',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addMonthsFromTodayISO(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function RealEstateTenants() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Tenant>('realestate', 'tenants'), []);
  const userId = user?.user_id || user?.id || '';

  const [data, setData] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPago, setFilterPago] = useState<EstadoPagos | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [form, setForm] = useState<TenantForm>(EMPTY);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'dni', label: 'DNI' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'property', label: 'Inmueble' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'dni', label: 'DNI', example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'property', label: 'Inmueble', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} inquilino(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} inquilino(s) importado(s)`);
  };

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

  const filtered = useMemo(() => data.filter(t => {
    const ms = t.nombre.toLowerCase().includes(search.toLowerCase()) || t.dni.toLowerCase().includes(search.toLowerCase());
    const mp = !filterPago || t.estadoPagos === filterPago;
    return ms && mp;
  }), [data, search, filterPago]);

  const activos = data.length;
  const cobrosPendientes = useMemo(() => data.filter(t => t.estadoPagos !== 'al_dia').reduce((s, t) => s + t.rentaMensual, 0), [data]);
  const limSup = addMonthsFromTodayISO(3);
  const limInf = todayISO();
  const proxVencimientos = useMemo(
    () => data.filter(t => t.fechaFinContrato && t.fechaFinContrato <= limSup && t.fechaFinContrato >= limInf).length,
    [data, limSup, limInf],
  );
  useModalClose(modalOpen, () => setModalOpen(false));

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (t: Tenant) => { setEditing(t); setForm({ nombre: t.nombre, dni: t.dni, telefono: t.telefono, email: t.email, propiedad: t.propiedad, contrato: t.contrato, rentaMensual: t.rentaMensual, estadoPagos: t.estadoPagos, fechaFinContrato: t.fechaFinContrato }); setModalOpen(true); };

  const handleSave = async () => {
    if (!form.nombre || !form.dni || !userId) return;
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
    { label: 'Inquilinos Activos', value: activos, icon: <Users className="w-5 h-5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Cobros Pendientes', value: `${cobrosPendientes.toLocaleString('es-ES')} €`, icon: <AlertCircle className="w-5 h-5" />, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
    { label: 'Próx. Vencimientos', value: proxVencimientos, icon: <CalendarDays className="w-5 h-5" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Inquilinos">
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o DNI..." disabled={loading} className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100" />
          </div>
          <div className="flex gap-2">
            <select value={filterPago} onChange={e => setFilterPago(e.target.value as EstadoPagos | '')} disabled={loading} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
              <option value="">Estado pagos</option>
              {ESTADOS_PAGO.map(ep => <option key={ep} value={ep}>{PAGO_CFG[ep].label}</option>)}
            </select>
            <AddButtonDropdown
                label="Nuevo Inquilino"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de inquilino"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">DNI</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Teléfono</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Email</th>
                <th className="px-4 py-3 font-medium hidden xl:table-cell">Propiedad</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Contrato</th>
                <th className="px-4 py-3 font-medium text-right">Renta</th>
                <th className="px-4 py-3 font-medium">Pagos</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Fin contrato</th>
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
              ) : filtered.map(t => (
                <tr key={t._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{t.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{t.dni}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell"><span className="flex items-center gap-1"><Phone className="w-3 h-3" />{t.telefono}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell"><span className="flex items-center gap-1"><Mail className="w-3 h-3" />{t.email}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden xl:table-cell">{t.propiedad}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell">{t.contrato}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">{t.rentaMensual.toLocaleString('es-ES')} €</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${PAGO_CFG[t.estadoPagos].bg} ${PAGO_CFG[t.estadoPagos].text}`}>
                      {t.estadoPagos === 'al_dia' ? <CheckCircle2 className="w-3 h-3" /> : t.estadoPagos === 'pendiente' ? <Clock className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      {PAGO_CFG[t.estadoPagos].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{t.fechaFinContrato}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                    <button type="button" onClick={() => void handleRemove(t._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">No se encontraron inquilinos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Inquilino' : 'Nuevo Inquilino'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {([
                { key: 'nombre', label: 'Nombre completo', type: 'text' },
                { key: 'dni', label: 'DNI', type: 'text' },
                { key: 'telefono', label: 'Teléfono', type: 'tel' },
                { key: 'email', label: 'Email', type: 'email' },
                { key: 'propiedad', label: 'Propiedad', type: 'text' },
                { key: 'contrato', label: 'Contrato', type: 'text' },
                { key: 'rentaMensual', label: 'Renta mensual (€)', type: 'number' },
                { key: 'fechaFinContrato', label: 'Fecha fin contrato', type: 'date' },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                  <input type={f.type} value={(form as Record<string, string | number>)[f.key]} onChange={e => setForm({ ...form, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado pagos</label>
                <select value={form.estadoPagos} onChange={e => setForm({ ...form, estadoPagos: e.target.value as EstadoPagos })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                  {ESTADOS_PAGO.map(ep => <option key={ep} value={ep}>{PAGO_CFG[ep].label}</option>)}
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
        module="realestate_tenants"
        moduleLabel="Inquilinos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Inquilinos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
