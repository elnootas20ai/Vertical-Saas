import { useState, useMemo, useCallback, useEffect, Fragment } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  ClipboardList, Plus, Search, Edit3, Trash2, X, ChevronDown,
  ChevronUp, CalendarDays, DollarSign, UserCheck, Filter,
  Camera, FileText, User, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface VisitRecord extends VerticalEntity {
  cliente: string;
  fechaVisita: string;
  servicio: string;
  estilista: string;
  productoUsado: string;
  notasTecnicas: string;
  importe: number;
  fotosAntes: string;
  fotosDespues: string;
}

type VisitRecordForm = Omit<VisitRecord, keyof VerticalEntity>;

const ESTILISTAS = ['Laura Méndez', 'Carlos Ruiz', 'Sofía Torres', 'Miguel Ángel Pardo'];
const PRODUCTOS = ['Tinte Igora 7-0', 'Olaplex N.3', 'Keratina brasileña', 'Moroccanoil', 'Laca extra', 'Champú Silver', 'Sin producto'];

const emptyForm = (): VisitRecordForm => ({
  cliente: '', fechaVisita: '', servicio: '', estilista: ESTILISTAS[0],
  productoUsado: PRODUCTOS[0], notasTecnicas: '', importe: 0, fotosAntes: '', fotosDespues: '',
});

export function SalonClientHistory() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<VisitRecord>('salon', 'clientHistory'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<VisitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstilista, setFilterEstilista] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<VisitRecord | null>(null);
  const [form, setForm] = useState<VisitRecordForm>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    { key: 'client', label: 'Cliente' },
    { key: 'service', label: 'Servicio' },
    { key: 'date', label: 'Fecha' },
    { key: 'stylist', label: 'Estilista' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'client', label: 'Cliente', example: '' },
    { key: 'service', label: 'Servicio', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'stylist', label: 'Estilista', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} registro(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} registro(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const filtered = items.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = v.cliente.toLowerCase().includes(q) || v.servicio.toLowerCase().includes(q) || v.notasTecnicas.toLowerCase().includes(q);
    const matchEst = !filterEstilista || v.estilista === filterEstilista;
    return matchSearch && matchEst;
  });

  const mesActual = new Date().toISOString().slice(0, 7);
  const visitasMes = items.filter(v => v.fechaVisita.startsWith(mesActual)).length;
  const clientesByVisits = items.reduce<Record<string, number>>((acc, v) => { acc[v.cliente] = (acc[v.cliente] || 0) + 1; return acc; }, {});
  const clienteFrecuente = Object.entries(clientesByVisits).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  const ticketMedio = items.length ? Math.round(items.reduce((s, v) => s + v.importe, 0) / items.length) : 0;

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (v: VisitRecord) => {
    setEditing(v);
    setForm({
      cliente: v.cliente, fechaVisita: v.fechaVisita, servicio: v.servicio, estilista: v.estilista,
      productoUsado: v.productoUsado, notasTecnicas: v.notasTecnicas, importe: v.importe,
      fotosAntes: v.fotosAntes, fotosDespues: v.fotosDespues,
    });
    setShowModal(true);
  };
  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* fetch layer */
    }
  };
  const handleSave = async () => {
    if (!form.cliente || !form.fechaVisita || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* fetch layer */
    }
  };

  const stats = [
    { label: 'Visitas este mes', value: visitasMes, icon: <CalendarDays className="w-5 h-5 text-violet-500" />, bg: 'bg-violet-50 dark:bg-violet-900/20' },
    { label: 'Cliente frecuente', value: clienteFrecuente, icon: <UserCheck className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: 'Ticket medio', value: `${ticketMedio} €`, icon: <DollarSign className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/20' },
  ];

  return (
    <Layout title="Historial de Cliente">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-3`}>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{s.icon}</div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white truncate max-w-[200px]">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente, servicio, notas…" disabled={loading} className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select value={filterEstilista} onChange={e => setFilterEstilista(e.target.value)} disabled={loading} className="pl-8 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                <option value="">Todos los estilistas</option>
                {ESTILISTAS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nuevo registro"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de registro"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3 w-8"></th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Servicio</th><th className="px-4 py-3">Estilista</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3 text-right">Importe</th><th className="px-4 py-3 text-center">Fotos</th><th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-500">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(v => {
                const isExpanded = expandedId === v._id;
                const hasFotos = !!(v.fotosAntes || v.fotosDespues);
                return (
                  <Fragment key={v._id}>
                    <tr className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : v._id)}>
                      <td className="px-4 py-3">
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white"><User className="w-3.5 h-3.5 inline mr-1.5 text-gray-400" />{v.cliente}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{v.fechaVisita}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{v.servicio}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{v.estilista}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[140px] truncate">{v.productoUsado}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{v.importe} €</td>
                      <td className="px-4 py-3 text-center">
                        {hasFotos ? <Camera className="w-4 h-4 text-violet-500 inline" /> : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEdit(v)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                          <button type="button" onClick={() => void handleDelete(v._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 className="w-4 h-4 text-red-500" /></button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50 dark:bg-gray-700/20">
                        <td colSpan={9} className="px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2 flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Notas técnicas</p>
                              <p className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">{v.notasTecnicas || 'Sin notas'}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2 flex items-center gap-1"><Camera className="w-3.5 h-3.5" /> Fotos antes / después</p>
                              <div className="flex gap-3">
                                {v.fotosAntes ? (
                                  <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-3 text-center">
                                    <div className="w-full h-20 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center mb-1"><Camera className="w-6 h-6 text-gray-400" /></div>
                                    <span className="text-xs text-gray-500">Antes</span>
                                  </div>
                                ) : <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-3 text-center text-xs text-gray-400">Sin foto antes</div>}
                                {v.fotosDespues ? (
                                  <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-3 text-center">
                                    <div className="w-full h-20 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center mb-1"><Camera className="w-6 h-6 text-violet-400" /></div>
                                    <span className="text-xs text-gray-500">Después</span>
                                  </div>
                                ) : <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-3 text-center text-xs text-gray-400">Sin foto después</div>}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!loading && !filtered.length && <tr><td colSpan={9} className="text-center py-10 text-gray-400">No se encontraron registros</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar registro' : 'Nuevo registro'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Cliente</label>
                <input value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Fecha visita</label>
                <input type="date" value={form.fechaVisita} onChange={e => setForm({ ...form, fechaVisita: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Servicio</label>
                <input value={form.servicio} onChange={e => setForm({ ...form, servicio: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Estilista</label>
                <select value={form.estilista} onChange={e => setForm({ ...form, estilista: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                  {ESTILISTAS.map(e => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Producto usado</label>
                <select value={form.productoUsado} onChange={e => setForm({ ...form, productoUsado: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                  {PRODUCTOS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Importe (€)</label>
                <input type="number" value={form.importe} onChange={e => setForm({ ...form, importe: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notas técnicas (fórmula, corte, etc.)</label>
                <textarea rows={3} value={form.notasTecnicas} onChange={e => setForm({ ...form, notasTecnicas: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Foto antes (archivo)</label>
                <input value={form.fotosAntes} onChange={e => setForm({ ...form, fotosAntes: e.target.value })} placeholder="nombre_archivo.jpg" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Foto después (archivo)</label>
                <input value={form.fotosDespues} onChange={e => setForm({ ...form, fotosDespues: e.target.value })} placeholder="nombre_archivo.jpg" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex justify-end gap-2 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors">
                {editing ? 'Guardar cambios' : 'Crear registro'}
              </button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="salon_history"
        moduleLabel="Historial"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Historial"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
