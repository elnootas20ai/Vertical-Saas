import { useState, useMemo, useEffect, useCallback } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Plus, X, Edit2, Trash2, Filter,
  Car, Droplets, Users, Sparkles,
  Loader2,
} from 'lucide-react';

interface VehicleRecord extends VerticalEntity {
  matricula: string;
  marcaModelo: string;
  color: string;
  cliente: string;
  totalLavados: number;
  lavadosEsteMes: number;
  ultimoLavado: string;
  puntosFidelidad: number;
  nuevoEsteMes: boolean;
  recurrente: boolean;
}

type VehicleRecordForm = Omit<VehicleRecord, keyof VerticalEntity>;

const EMPTY_FORM: VehicleRecordForm = {
  matricula: '', marcaModelo: '', color: '', cliente: '', totalLavados: 0, lavadosEsteMes: 0,
  ultimoLavado: '', puntosFidelidad: 0, nuevoEsteMes: false, recurrente: false,
};

export function CarWashVehicles() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<VehicleRecord>('carwash', 'vehicles'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<VehicleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRecurrente, setFilterRecurrente] = useState<'all' | 'si' | 'no'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<VehicleRecord | null>(null);
  const [form, setForm] = useState<VehicleRecordForm>(EMPTY_FORM);

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

  const filtered = useMemo(() => items.filter(v => {
    const q = search.toLowerCase();
    if (search && !v.matricula.toLowerCase().includes(q) && !v.marcaModelo.toLowerCase().includes(q) && !v.cliente.toLowerCase().includes(q) && !v.color.toLowerCase().includes(q)) return false;
    if (filterRecurrente === 'si' && !v.recurrente) return false;
    if (filterRecurrente === 'no' && v.recurrente) return false;
    return true;
  }), [items, search, filterRecurrente]);

  const stats = useMemo(() => {
    const lavadosMes = items.reduce((s, v) => s + v.lavadosEsteMes, 0);
    const recurrentes = items.filter(v => v.recurrente).length;
    const nuevos = items.filter(v => v.nuevoEsteMes).length;
    return { total: items.length, lavadosMes, recurrentes, nuevos };
  }, [items]);
  useModalClose(showModal, () => setShowModal(false));

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (v: VehicleRecord) => {
    setEditing(v);
    setForm({
      matricula: v.matricula, marcaModelo: v.marcaModelo, color: v.color, cliente: v.cliente,
      totalLavados: v.totalLavados, lavadosEsteMes: v.lavadosEsteMes, ultimoLavado: v.ultimoLavado,
      puntosFidelidad: v.puntosFidelidad, nuevoEsteMes: v.nuevoEsteMes, recurrente: v.recurrente,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.matricula.trim() || !form.cliente.trim() || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
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

  const STAT_CARDS = [
    { label: 'Total vehículos', value: stats.total, icon: Car, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Lavados este mes', value: stats.lavadosMes, icon: Droplets, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-900/30' },
    { label: 'Clientes recurrentes', value: stats.recurrentes, icon: Users, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Vehículos nuevos (mes)', value: stats.nuevos, icon: Sparkles, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
  ];

  return (
    <Layout title="Vehículos">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm"
              placeholder="Buscar por matrícula, modelo, cliente o color..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none"
                value={filterRecurrente}
                onChange={e => setFilterRecurrente(e.target.value as 'all' | 'si' | 'no')}
                disabled={loading}
              >
                <option value="all">Cliente: todos</option>
                <option value="si">Solo recurrentes</option>
                <option value="no">No recurrentes</option>
              </select>
            </div>
            <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">
              <Plus className="w-4 h-4" /> Registrar vehículo
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Matrícula</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Marca / Modelo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Color</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Cliente</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Total lavados</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Último lavado</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Puntos fidelidad</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Perfil</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
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
              ) : filtered.map(v => (
                <tr key={v._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-mono font-medium text-gray-900 dark:text-white">{v.matricula}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{v.marcaModelo}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{v.color}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{v.cliente}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{v.totalLavados}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{v.ultimoLavado}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{v.puntosFidelidad}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    <span className="flex flex-wrap gap-1">
                      {v.recurrente && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300">Recurrente</span>}
                      {v.nuevoEsteMes && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-300">Nuevo</span>}
                      {!v.recurrente && !v.nuevoEsteMes && <span className="text-gray-400">—</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(v)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => handleDelete(v._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay vehículos que coincidan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar vehículo' : 'Registrar vehículo'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Matrícula *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.matricula} onChange={e => setForm(f => ({ ...f, matricula: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Color</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Marca / Modelo</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.marcaModelo} onChange={e => setForm(f => ({ ...f, marcaModelo: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Cliente *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Total lavados</label>
                  <input type="number" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.totalLavados} onChange={e => setForm(f => ({ ...f, totalLavados: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Lavados este mes</label>
                  <input type="number" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.lavadosEsteMes} onChange={e => setForm(f => ({ ...f, lavadosEsteMes: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Último lavado</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.ultimoLavado} onChange={e => setForm(f => ({ ...f, ultimoLavado: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Puntos fidelidad</label>
                  <input type="number" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.puntosFidelidad} onChange={e => setForm(f => ({ ...f, puntosFidelidad: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded border-gray-300 dark:border-gray-600" checked={form.recurrente} onChange={e => setForm(f => ({ ...f, recurrente: e.target.checked }))} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Cliente recurrente</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded border-gray-300 dark:border-gray-600" checked={form.nuevoEsteMes} onChange={e => setForm(f => ({ ...f, nuevoEsteMes: e.target.checked }))} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Nuevo este mes</span>
                </label>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Añadir vehículo'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
