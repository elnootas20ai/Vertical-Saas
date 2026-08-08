import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { RealEstateNav } from '../../components/saas/RealEstateNav';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useRealEstateScope } from '../../lib/realEstateScope';
import { useBusiness } from '../../context/BusinessContext';
import { ensureRealEstateAppraisalFinance } from '../../lib/realEstateFinanceSync';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, X, Edit3, Trash2, TrendingUp,
  Clock, CalendarDays, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type Metodo = 'comparacion' | 'capitalizacion' | 'coste';
type EstadoTasacion = 'solicitada' | 'en_proceso' | 'completada';

interface Appraisal extends VerticalEntity {
  propiedad: string;
  solicitante: string;
  solicitanteNif?: string;
  fecha: string;
  tasador: string;
  valorTasado: number;
  /** Honorarios de la tasación (IVA incl.) → Finanzas al completar. */
  honorarios?: number;
  metodo: Metodo;
  estado: EstadoTasacion;
}

type AppraisalForm = Omit<Appraisal, keyof VerticalEntity>;

const STATUS_CFG: Record<EstadoTasacion, { bg: string; text: string; label: string }> = {
  solicitada: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', label: 'Solicitada' },
  en_proceso: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', label: 'En proceso' },
  completada: { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', label: 'Completada' },
};

const METODO_CFG: Record<Metodo, { bg: string; text: string; label: string }> = {
  comparacion:    { bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300', label: 'Comparación' },
  capitalizacion: { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300', label: 'Capitalización' },
  coste:          { bg: 'bg-teal-100 dark:bg-teal-900/40', text: 'text-teal-700 dark:text-teal-300', label: 'Coste' },
};

const METODOS: Metodo[] = ['comparacion', 'capitalizacion', 'coste'];
const ESTADOS: EstadoTasacion[] = ['solicitada', 'en_proceso', 'completada'];

const EMPTY: AppraisalForm = {
  propiedad: '', solicitante: '', solicitanteNif: '', fecha: '', tasador: '',
  valorTasado: 0, honorarios: 0, metodo: 'comparacion', estado: 'solicitada',
};

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function RealEstateAppraisals() {
  const { userId, businessId, listOptions, ready } = useRealEstateScope();
  const { currentBusiness } = useBusiness();
  const api = useMemo(() => createVerticalApi<Appraisal>('realestate', 'appraisals'), []);
  const financeScope = useMemo(
    () => ({
      businessId: businessId || currentBusiness?.business_id || '',
      businessName: String(currentBusiness?.name || '').trim(),
      salesPointId: listOptions.salesPointId,
    }),
    [businessId, currentBusiness, listOptions.salesPointId],
  );

  const [data, setData] = useState<Appraisal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<EstadoTasacion | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appraisal | null>(null);
  const [form, setForm] = useState<AppraisalForm>(EMPTY);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'property', label: 'Inmueble', example: '' },
    { key: 'value', label: 'Valor', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'appraiser', label: 'Tasador', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId || !ready) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const propiedad = entryStr(e, 'propiedad');
    if (!propiedad) return null;
    return {
      propiedad,
      solicitante: entryStr(e, 'solicitante') || '',
      fecha: entryStr(e, 'fecha', 'date') || '',
      tasador: entryStr(e, 'tasador') || '',
      valorTasado: entryNum(e, 'valorTasado'),
      metodo: entryStr(e, 'metodo') || 'comparacion',
      estado: entryStr(e, 'estado', 'status') || 'solicitada',
    };
    }, listOptions);
    if (created > 0) {
      await loadData();
      toast.success(`${created} tasación creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(modalOpen, () => setModalOpen(false));

  const loadData = useCallback(async () => {
    if (!userId || !ready) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId, listOptions);
      setData(list);
    } finally {
      setLoading(false);
    }
  }, [userId, ready, listOptions, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => data.filter(a => {
    const ms = a.propiedad.toLowerCase().includes(search.toLowerCase()) || a.solicitante.toLowerCase().includes(search.toLowerCase());
    const me = !filterEstado || a.estado === filterEstado;
    return ms && me;
  }), [data, search, filterEstado]);

  const mesActual = currentYearMonth();
  const tasacionesMes = useMemo(() => data.filter(a => a.fecha.startsWith(mesActual)).length, [data, mesActual]);
  const completadas = useMemo(() => data.filter(a => a.estado === 'completada'), [data]);
  const valorMedio = completadas.length > 0 ? Math.round(completadas.reduce((s, a) => s + a.valorTasado, 0) / completadas.length) : 0;
  const pendientes = useMemo(() => data.filter(a => a.estado !== 'completada').length, [data]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY,
      fecha: new Date().toISOString().slice(0, 10),
      estado: 'solicitada',
    });
    setModalOpen(true);
  };
  const openEdit = (a: Appraisal) => {
    setEditing(a);
    setForm({
      propiedad: a.propiedad,
      solicitante: a.solicitante,
      fecha: a.fecha,
      tasador: a.tasador,
      valorTasado: a.valorTasado,
      honorarios: Number(a.honorarios) || 0,
      solicitanteNif: a.solicitanteNif || '',
      metodo: a.metodo,
      estado: a.estado,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!userId || !ready) return;
    const propiedad = String(form.propiedad || '').trim();
    const fecha = String(form.fecha || '').trim();
    if (!propiedad || !fecha) {
      toast.error('Propiedad y fecha son obligatorias');
      return;
    }
    const payload = {
      ...form,
      propiedad,
      fecha,
      solicitanteNif: String(form.solicitanteNif || '').trim() || undefined,
      honorarios: Number(form.honorarios) || 0,
      estado: form.estado || 'solicitada',
      valorTasado: Number(form.valorTasado) || 0,
    };
    try {
      let saved: Appraisal;
      if (editing) {
        saved = await api.update(userId, editing._id, payload, listOptions);
      } else {
        saved = await api.create(userId, payload, listOptions);
      }
      if (payload.estado === 'completada' && Number(payload.honorarios) > 0) {
        const { synced, verifactu } = await ensureRealEstateAppraisalFinance(userId, saved, financeScope);
        if (synced) {
          toast.success(
            verifactu
              ? 'Tasación guardada · cobro en Finanzas · Verifactu emitido'
              : 'Tasación guardada · cobro registrado en Finanzas',
          );
        } else {
          toast.success(editing ? 'Tasación actualizada' : 'Tasación creada');
        }
      } else {
        toast.success(editing ? 'Tasación actualizada' : 'Tasación creada');
      }
      await loadData();
      setModalOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };

  const handleRemove = async (docId: string) => {
    if (!userId || !ready) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error shown by fetch layer */
    }
  };

  const stats = [
    { label: 'Tasaciones Este Mes', value: tasacionesMes, icon: <CalendarDays className="w-5 h-5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Valor Medio', value: `${valorMedio.toLocaleString('es-ES')} €`, icon: <TrendingUp className="w-5 h-5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Pendientes', value: pendientes, icon: <Clock className="w-5 h-5" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Tasaciones">
      <div className="space-y-6">
        <RealEstateNav active="appraisals" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-3 min-h-[4.5rem]`}>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70 dark:bg-black/20 ${s.color}`}>{s.icon}</div>
              <div className="min-w-0">
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{s.label}</p>
                <p className={`text-xl font-bold tabular-nums leading-tight ${s.color}`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por propiedad o solicitante..." disabled={loading} className="w-full h-10 pl-10 pr-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={filterEstado} onChange={e => setFilterEstado(e.target.value as EstadoTasacion | '')} disabled={loading} className="h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
              <option value="">Estado</option>
              {ESTADOS.map(e => <option key={e} value={e}>{STATUS_CFG[e].label}</option>)}
            </select>
            <AddButtonDropdown
                label="Nueva tasación"
                onQuickAdd={openCreate}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de tasación"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">Propiedad</th>
                <th className="px-4 py-3 font-medium">Solicitante</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Tasador</th>
                <th className="px-4 py-3 font-medium text-right">Valor Tasado</th>
                <th className="px-4 py-3 font-medium">Método</th>
                <th className="px-4 py-3 font-medium">Estado</th>
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
              ) : filtered.map(a => (
                <tr key={a._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{a.propiedad}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.solicitante}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.fecha}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{a.tasador || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">{a.valorTasado ? `${a.valorTasado.toLocaleString('es-ES')} €` : '—'}</td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${METODO_CFG[a.metodo].bg} ${METODO_CFG[a.metodo].text}`}>{METODO_CFG[a.metodo].label}</span></td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_CFG[a.estado].bg} ${STATUS_CFG[a.estado].text}`}>{STATUS_CFG[a.estado].label}</span></td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => openEdit(a)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                    <button type="button" onClick={() => void handleRemove(a._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">No se encontraron tasaciones</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Tasación' : 'Nueva Tasación'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {([
                { key: 'propiedad', label: 'Propiedad', type: 'text' },
                { key: 'solicitante', label: 'Solicitante', type: 'text' },
                { key: 'solicitanteNif', label: 'NIF solicitante (Verifactu)', type: 'text' },
                { key: 'fecha', label: 'Fecha', type: 'date' },
                { key: 'tasador', label: 'Tasador', type: 'text' },
                { key: 'valorTasado', label: 'Valor tasado (€)', type: 'number' },
                { key: 'honorarios', label: 'Honorarios tasación (€, IVA incl.)', type: 'number' },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                  <input type={f.type} value={(form as Record<string, string | number>)[f.key]} onChange={e => setForm({ ...form, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Método</label>
                <select value={form.metodo} onChange={e => setForm({ ...form, metodo: e.target.value as Metodo })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                  {METODOS.map(m => <option key={m} value={m}>{METODO_CFG[m].label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as EstadoTasacion })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                  {ESTADOS.map(e => <option key={e} value={e}>{STATUS_CFG[e].label}</option>)}
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
    
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Tasaciones"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
