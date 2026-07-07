import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit2, Trash2, Filter,
  CalendarDays, CheckCircle2, XCircle, Banknote,
  Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type BookingStatus = 'pendiente' | 'confirmada' | 'en_proceso' | 'completada' | 'cancelada';

interface Booking extends VerticalEntity {
  numero: string;
  cliente: string;
  matricula: string;
  tipoServicio: string;
  fechaHora: string;
  estado: BookingStatus;
  empleado: string;
  importe: number;
}

type BookingForm = Omit<Booking, keyof VerticalEntity>;

const STATUS_CFG: Record<BookingStatus, { label: string; dot: string }> = {
  pendiente: { label: 'Pendiente', dot: 'bg-gray-400' },
  confirmada: { label: 'Confirmada', dot: 'bg-blue-500' },
  en_proceso: { label: 'En proceso', dot: 'bg-amber-500' },
  completada: { label: 'Completada', dot: 'bg-emerald-500' },
  cancelada: { label: 'Cancelada', dot: 'bg-red-500' },
};

const EMPTY_FORM_BASE: Omit<BookingForm, 'fechaHora' | 'numero'> = {
  cliente: '', matricula: '', tipoServicio: 'Lavado Exterior Estándar',
  estado: 'pendiente', empleado: '', importe: 0,
};

function isSameDay(iso: string, day: string) {
  return iso.slice(0, 10) === day;
}

export function CarWashBookings() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Booking>('carwash', 'bookings'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<BookingStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [form, setForm] = useState<BookingForm>(() => {
    const day = new Date().toISOString().slice(0, 10);
    return { ...EMPTY_FORM_BASE, numero: '', fechaHora: `${day}T09:00` };
  });
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
    { key: 'vehicle', label: 'Vehículo' },
    { key: 'service', label: 'Servicio' },
    { key: 'date', label: 'Fecha' },
    { key: 'time', label: 'Hora' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'client', label: 'Cliente', example: '' },
    { key: 'vehicle', label: 'Vehículo', example: '' },
    { key: 'service', label: 'Servicio', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'time', label: 'Hora', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const cliente = entryStr(e, 'cliente', 'client');
    if (!cliente) return null;
    return {
      cliente,
      estado: entryStr(e, 'estado', 'status') || 'pendiente', empleado: '', importe: 0,
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} reserva creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => items.filter(b => {
    const q = search.toLowerCase();
    if (search && !b.numero.toLowerCase().includes(q) && !b.cliente.toLowerCase().includes(q) && !b.matricula.toLowerCase().includes(q) && !b.empleado.toLowerCase().includes(q)) return false;
    if (filterEstado !== 'all' && b.estado !== filterEstado) return false;
    return true;
  }), [items, search, filterEstado]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const hoy = items.filter(b => isSameDay(b.fechaHora, today));
    const reservasHoy = hoy.length;
    const completadasHoy = hoy.filter(b => b.estado === 'completada').length;
    const canceladas = items.filter(b => b.estado === 'cancelada').length;
    const ingresosHoy = hoy.filter(b => b.estado === 'completada').reduce((s, b) => s + b.importe, 0);
    return { reservasHoy, completadasHoy, canceladas, ingresosHoy };
  }, [items]);

  const openCreate = () => {
    const day = new Date().toISOString().slice(0, 10);
    setEditing(null);
    setForm({ ...EMPTY_FORM_BASE, numero: `R-${Date.now().toString().slice(-5)}`, fechaHora: `${day}T09:00` });
    setShowModal(true);
  };
  const openEdit = (b: Booking) => {
    setEditing(b);
    setForm({
      numero: b.numero, cliente: b.cliente, matricula: b.matricula, tipoServicio: b.tipoServicio,
      fechaHora: b.fechaHora.length > 16 ? b.fechaHora.slice(0, 16) : b.fechaHora, estado: b.estado, empleado: b.empleado, importe: b.importe,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.cliente.trim() || !form.matricula.trim() || !userId) return;
    const fechaHora = form.fechaHora.length === 16 ? `${form.fechaHora}:00` : form.fechaHora;
    const payload = { ...form, fechaHora };
    try {
      if (editing) {
        await api.update(userId, editing._id, payload);
      } else {
        await api.create(userId, payload);
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

  const formatFecha = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  };

  const STAT_CARDS = [
    { label: 'Reservas hoy', value: stats.reservasHoy, icon: CalendarDays, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Completadas hoy', value: stats.completadasHoy, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Canceladas (total)', value: stats.canceladas, icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
    { label: 'Ingresos estimados hoy', value: `${stats.ingresosHoy.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`, icon: Banknote, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Reservas">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div className="min-w-0 flex-1">
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
            <input
              className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm"
              placeholder="Buscar por nº, cliente, matrícula o empleado..."
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
                value={filterEstado}
                onChange={e => setFilterEstado(e.target.value as BookingStatus | 'all')}
                disabled={loading}
              >
                <option value="all">Todos los estados</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nueva reserva"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de reserva"
              />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Nº reserva</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Cliente</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Matrícula</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Servicio</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Fecha y hora</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Empleado</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Importe</th>
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
              ) : filtered.map(b => (
                <tr key={b._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-mono font-medium text-gray-900 dark:text-white">{b.numero}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{b.cliente}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono">{b.matricula}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{b.tipoServicio}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatFecha(b.fechaHora)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span className={`w-2 h-2 rounded-full ${STATUS_CFG[b.estado].dot}`} />
                      {STATUS_CFG[b.estado].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{b.empleado || <span className="text-gray-400 italic">Sin asignar</span>}</td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{b.importe.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(b)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => handleDelete(b._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay reservas con los filtros seleccionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar reserva' : 'Nueva reserva'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nº reserva</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Importe (€)</label>
                  <input type="number" step="0.01" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.importe} onChange={e => setForm(f => ({ ...f, importe: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Cliente *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Matrícula *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.matricula} onChange={e => setForm(f => ({ ...f, matricula: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo de servicio</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.tipoServicio} onChange={e => setForm(f => ({ ...f, tipoServicio: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha y hora</label>
                  <input type="datetime-local" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.fechaHora.length > 16 ? form.fechaHora.slice(0, 16) : form.fechaHora} onChange={e => setForm(f => ({ ...f, fechaHora: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Estado</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as BookingStatus }))}>
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Empleado</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.empleado} onChange={e => setForm(f => ({ ...f, empleado: e.target.value }))} />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Crear reserva'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="carwash_bookings"
        moduleLabel="Reservas"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Reservas"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
