import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit2, Trash2,
  ShieldCheck, FileText, AlertTriangle, CalendarDays, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type TipoDocumento = 'licencia' | 'inspeccion' | 'certificado' | 'seguro' | 'contrato' | 'otro';
type EstadoDoc = 'vigente' | 'proximo_vencimiento' | 'vencido';

interface RegulatoryDoc extends VerticalEntity {
  titulo: string;
  tipo: TipoDocumento;
  expedidoPor: string;
  fechaEmision: string;
  fechaVencimiento: string;
  referencia: string;
  notas: string;
}

type RegulatoryDocForm = Omit<RegulatoryDoc, keyof VerticalEntity>;

const TIPO_LABEL: Record<TipoDocumento, string> = {
  licencia: 'Licencia', inspeccion: 'Inspección', certificado: 'Certificado',
  seguro: 'Seguro', contrato: 'Contrato', otro: 'Otro',
};

const ESTADO_CFG: Record<EstadoDoc, { label: string; dot: string }> = {
  vigente:              { label: 'Vigente',              dot: 'bg-emerald-500' },
  proximo_vencimiento:  { label: 'Próx. vencimiento',   dot: 'bg-amber-500' },
  vencido:              { label: 'Vencido',              dot: 'bg-red-500' },
};

function getEstado(fechaVencimiento: string): EstadoDoc {
  if (!fechaVencimiento) return 'vigente';
  const hoy = new Date();
  const venc = new Date(fechaVencimiento);
  if (venc < hoy) return 'vencido';
  const diff = (venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
  if (diff <= 30) return 'proximo_vencimiento';
  return 'vigente';
}

const emptyForm = (): RegulatoryDocForm => ({
  titulo: '', tipo: 'licencia', expedidoPor: '', fechaEmision: new Date().toISOString().slice(0, 10),
  fechaVencimiento: '', referencia: '', notas: '',
});

export function TobaccoRegulatory() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<RegulatoryDoc>('tobacco', 'regulatory'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<RegulatoryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RegulatoryDoc | null>(null);
  const [form, setForm] = useState<RegulatoryDocForm>(emptyForm());
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
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'type', label: 'Tipo' },
    { key: 'date', label: 'Fecha' },
    { key: 'expiry', label: 'Vencimiento' },
    { key: 'status', label: 'Estado' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'expiry', label: 'Vencimiento', example: '' },
    { key: 'status', label: 'Estado', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const titulo = entryStr(e, 'titulo', 'title', 'name', 'nombre');
    if (!titulo) return null;
    return {
      titulo,
      tipo: entryStr(e, 'tipo', 'type') || 'licencia',
      expedidoPor: entryStr(e, 'expedidoPor') || '',
      fechaEmision: entryStr(e, 'fechaEmision') || new Date().toISOString().slice(0, 10),
      fechaVencimiento: entryStr(e, 'fechaVencimiento') || '',
      referencia: entryStr(e, 'referencia', 'reference', 'sku') || '',
      notas: entryStr(e, 'notas', 'notes', 'description') || '',
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} documento creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => items.filter(d => {
    const q = search.toLowerCase();
    return !search || d.titulo.toLowerCase().includes(q) || d.referencia.toLowerCase().includes(q) || d.expedidoPor.toLowerCase().includes(q);
  }), [items, search]);

  const stats = useMemo(() => {
    const total = items.length;
    const vigentes = items.filter(d => getEstado(d.fechaVencimiento) === 'vigente').length;
    const proximos = items.filter(d => getEstado(d.fechaVencimiento) === 'proximo_vencimiento').length;
    const vencidos = items.filter(d => getEstado(d.fechaVencimiento) === 'vencido').length;
    return { total, vigentes, proximos, vencidos };
  }, [items]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (d: RegulatoryDoc) => {
    setEditing(d);
    setForm({
      titulo: d.titulo, tipo: d.tipo, expedidoPor: d.expedidoPor, fechaEmision: d.fechaEmision,
      fechaVencimiento: d.fechaVencimiento, referencia: d.referencia, notas: d.notas,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.titulo.trim() || !userId) return;
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

  const handleDelete = async (_id: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, _id);
      await loadData();
    } catch {
      /* error from fetch */
    }
  };

  const STAT_CARDS = [
    { label: 'Total documentos', value: stats.total, icon: FileText, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Vigentes', value: stats.vigentes, icon: ShieldCheck, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Próx. vencimiento', value: stats.proximos, icon: CalendarDays, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Vencidos', value: stats.vencidos, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
  ];

  return (
    <Layout title="Normativa y licencias">
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
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por título, referencia o emisor..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <AddButtonDropdown
                label="Nuevo documento"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de documento"
              />
        </div>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex justify-center items-center gap-2 py-24 text-gray-500 dark:text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          Cargando…
        </div>
      ) : (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Título</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Emisor</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Emisión</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Vencimiento</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const est = getEstado(d.fechaVencimiento);
                return (
                  <tr key={d._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{d.titulo}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{TIPO_LABEL[d.tipo]}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{d.expedidoPor}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{d.fechaEmision}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{d.fechaVencimiento || '—'}</td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${ESTADO_CFG[est].dot}`} />{ESTADO_CFG[est].label}</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button type="button" onClick={() => openEdit(d)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                        <button type="button" onClick={() => void handleDelete(d._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay documentos regulatorios registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar documento' : 'Nuevo documento'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Título *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoDocumento }))}>
                    {(Object.keys(TIPO_LABEL) as TipoDocumento[]).map(k => <option key={k} value={k}>{TIPO_LABEL[k]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Referencia</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Expedido por</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.expedidoPor} onChange={e => setForm(f => ({ ...f, expedidoPor: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha emisión</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.fechaEmision} onChange={e => setForm(f => ({ ...f, fechaEmision: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha vencimiento</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.fechaVencimiento} onChange={e => setForm(f => ({ ...f, fechaVencimiento: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Notas</label>
                <textarea className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 min-h-[80px]" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Añadir documento'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="tobacco_regulatory"
        moduleLabel="Regulación"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Regulación"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
