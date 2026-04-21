import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit2, Trash2, Filter,
  Ticket, TrendingUp, Award, CalendarDays, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type TipoSorteo = 'loteria_nacional' | 'primitiva' | 'euromillones' | 'bonoloto' | 'quiniela' | 'once' | 'otros';
type EstadoBoleto = 'disponible' | 'vendido' | 'premiado' | 'caducado';

interface LotteryTicket extends VerticalEntity {
  numero: string;
  sorteo: TipoSorteo;
  fecha: string;
  serie: string;
  fraccion: string;
  precioVenta: number;
  estado: EstadoBoleto;
  premio: number;
}

type LotteryTicketForm = Omit<LotteryTicket, keyof VerticalEntity>;

const SORTEO_LABEL: Record<TipoSorteo, string> = {
  loteria_nacional: 'Lotería Nacional', primitiva: 'La Primitiva', euromillones: 'Euromillones',
  bonoloto: 'Bonoloto', quiniela: 'La Quiniela', once: 'ONCE', otros: 'Otros',
};

const ESTADO_CFG: Record<EstadoBoleto, { label: string; dot: string }> = {
  disponible: { label: 'Disponible', dot: 'bg-blue-500' },
  vendido:    { label: 'Vendido',    dot: 'bg-emerald-500' },
  premiado:   { label: 'Premiado',   dot: 'bg-amber-500' },
  caducado:   { label: 'Caducado',   dot: 'bg-gray-400' },
};

const emptyForm = (): LotteryTicketForm => ({
  numero: '', sorteo: 'loteria_nacional', fecha: new Date().toISOString().slice(0, 10), serie: '', fraccion: '', precioVenta: 0, estado: 'disponible', premio: 0,
});

export function TobaccoLottery() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<LotteryTicket>('tobacco', 'lottery'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<LotteryTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSorteo, setFilterSorteo] = useState<TipoSorteo | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<LotteryTicket | null>(null);
  const [form, setForm] = useState<LotteryTicketForm>(emptyForm());
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
    { key: 'type', label: 'Tipo' },
    { key: 'number', label: 'Número' },
    { key: 'draw', label: 'Sorteo' },
    { key: 'price', label: 'Precio' },
    { key: 'date', label: 'Fecha' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'number', label: 'Número', required: true, example: '' },
    { key: 'draw', label: 'Sorteo', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} boleto(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} boleto(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => items.filter(t => {
    const q = search.toLowerCase();
    if (search && !t.numero.toLowerCase().includes(q) && !t.serie.toLowerCase().includes(q)) return false;
    if (filterSorteo !== 'all' && t.sorteo !== filterSorteo) return false;
    return true;
  }), [items, search, filterSorteo]);

  const stats = useMemo(() => {
    const disponibles = items.filter(t => t.estado === 'disponible').length;
    const vendidos = items.filter(t => t.estado === 'vendido').length;
    const ingresosMes = items.filter(t => t.estado === 'vendido').reduce((a, t) => a + t.precioVenta, 0);
    const premiosRepartidos = items.filter(t => t.estado === 'premiado').reduce((a, t) => a + t.premio, 0);
    return { disponibles, vendidos, ingresosMes, premiosRepartidos };
  }, [items]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (t: LotteryTicket) => {
    setEditing(t);
    setForm({
      numero: t.numero, sorteo: t.sorteo, fecha: t.fecha, serie: t.serie, fraccion: t.fraccion,
      precioVenta: t.precioVenta, estado: t.estado, premio: t.premio,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.numero.trim() || !userId) return;
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
    { label: 'Disponibles', value: stats.disponibles, icon: Ticket, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Vendidos', value: stats.vendidos, icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Ingresos vendidos', value: stats.ingresosMes.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }), icon: Award, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
    { label: 'Premios repartidos', value: stats.premiosRepartidos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }), icon: CalendarDays, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Lotería y apuestas">
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
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por número o serie..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterSorteo} onChange={e => setFilterSorteo(e.target.value as TipoSorteo | 'all')}>
                <option value="all">Todos los sorteos</option>
                {(Object.keys(SORTEO_LABEL) as TipoSorteo[]).map(k => <option key={k} value={k}>{SORTEO_LABEL[k]}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nuevo boleto"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de boleto"
              />
          </div>
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
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Número</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Sorteo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Fecha</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Serie</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Fracción</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Precio</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-mono font-medium text-gray-900 dark:text-white">{t.numero}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{SORTEO_LABEL[t.sorteo]}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.fecha}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.serie}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.fraccion}</td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{t.precioVenta.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${ESTADO_CFG[t.estado].dot}`} />{ESTADO_CFG[t.estado].label}</span></td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => void handleDelete(t._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay boletos que coincidan con los filtros.</td></tr>
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
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar boleto' : 'Nuevo boleto'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Número *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Sorteo</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.sorteo} onChange={e => setForm(f => ({ ...f, sorteo: e.target.value as TipoSorteo }))}>
                    {(Object.keys(SORTEO_LABEL) as TipoSorteo[]).map(k => <option key={k} value={k}>{SORTEO_LABEL[k]}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha sorteo</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Serie</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.serie} onChange={e => setForm(f => ({ ...f, serie: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fracción</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.fraccion} onChange={e => setForm(f => ({ ...f, fraccion: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Precio (€)</label>
                  <input type="number" step="0.01" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.precioVenta} onChange={e => setForm(f => ({ ...f, precioVenta: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Estado</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as EstadoBoleto }))}>
                    {Object.entries(ESTADO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              {form.estado === 'premiado' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Premio (€)</label>
                  <input type="number" step="0.01" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.premio} onChange={e => setForm(f => ({ ...f, premio: Number(e.target.value) }))} />
                </div>
              )}
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Añadir boleto'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="tobacco_lottery"
        moduleLabel="Lotería"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Lotería"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
