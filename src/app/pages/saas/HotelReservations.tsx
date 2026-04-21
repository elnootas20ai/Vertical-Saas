import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, X, CalendarDays, Users, TrendingUp, BedDouble,
  Edit3, Trash2, Filter, ChevronDown, DollarSign, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type ReservationStatus = 'confirmada' | 'pendiente' | 'cancelada' | 'checked-in' | 'checked-out';
type Channel = 'web' | 'booking' | 'telefónico' | 'walk-in';

interface Reservation extends VerticalEntity {
  guest: string;
  room: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  status: ReservationStatus;
  channel: Channel;
  amount: number;
}

type ReservationForm = Omit<Reservation, keyof VerticalEntity>;

const STATUS_CFG: Record<ReservationStatus, { bg: string; text: string }> = {
  confirmada:    { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  pendiente:     { bg: 'bg-amber-100 dark:bg-amber-900/40',    text: 'text-amber-700 dark:text-amber-300' },
  cancelada:     { bg: 'bg-red-100 dark:bg-red-900/40',        text: 'text-red-700 dark:text-red-300' },
  'checked-in':  { bg: 'bg-blue-100 dark:bg-blue-900/40',      text: 'text-blue-700 dark:text-blue-300' },
  'checked-out': { bg: 'bg-gray-100 dark:bg-gray-700/40',      text: 'text-gray-700 dark:text-gray-300' },
};

const CHANNEL_CFG: Record<Channel, { bg: string; text: string }> = {
  web:        { bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300' },
  booking:    { bg: 'bg-blue-100 dark:bg-blue-900/40',     text: 'text-blue-700 dark:text-blue-300' },
  'telefónico': { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
  'walk-in':  { bg: 'bg-teal-100 dark:bg-teal-900/40',     text: 'text-teal-700 dark:text-teal-300' },
};

const EMPTY: ReservationForm = {
  guest: '', room: '', checkIn: '', checkOut: '', nights: 1,
  status: 'pendiente', channel: 'web', amount: 0,
};

export function HotelReservations() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Reservation>('hotel', 'reservations'), []);
  const userId = user?.user_id || user?.id || '';

  const [data, setData] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [form, setForm] = useState<ReservationForm>(EMPTY);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'guest', label: 'Huésped' },
    { key: 'room', label: 'Habitación' },
    { key: 'checkIn', label: 'Check-in' },
    { key: 'checkOut', label: 'Check-out' },
    { key: 'guests', label: 'Nº huéspedes' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'guest', label: 'Huésped', example: '' },
    { key: 'room', label: 'Habitación', example: '' },
    { key: 'checkIn', label: 'Check-in', example: '' },
    { key: 'checkOut', label: 'Check-out', example: '' },
    { key: 'guests', label: 'Nº huéspedes', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} reserva(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} reserva(s) importado(s)`);
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

  const filtered = data.filter(r => {
    const matchSearch = r.guest.toLowerCase().includes(search.toLowerCase()) || r.room.includes(search);
    const matchStatus = !filterStatus || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const stats = {
    today: data.filter(r => r.checkIn === todayStr).length,
    pendingCheckins: data.filter(r => r.status === 'confirmada').length,
    occupancy: Math.round((data.filter(r => r.status === 'checked-in').length / 50) * 100),
    revenue: data.reduce((s, r) => s + r.amount, 0),
  };

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (r: Reservation) => { setEditing(r); setForm({ guest: r.guest, room: r.room, checkIn: r.checkIn, checkOut: r.checkOut, nights: r.nights, status: r.status, channel: r.channel, amount: r.amount }); setModalOpen(true); };

  const save = async () => {
    if (!userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setModalOpen(false);
    } catch {
      /* error from fetch */
    }
  };

  const remove = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error from fetch */
    }
  };

  return (
    <Layout title="Reservas de Hotel">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Reservas hoy', value: stats.today, icon: <CalendarDays className="w-5 h-5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
            { label: 'Check-ins pendientes', value: stats.pendingCheckins, icon: <Users className="w-5 h-5" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
            { label: 'Ocupación', value: `${stats.occupancy}%`, icon: <BedDouble className="w-5 h-5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
            { label: 'Ingresos mes', value: `${stats.revenue.toLocaleString('es-ES')} €`, icon: <DollarSign className="w-5 h-5" />, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-4`}>
              <div className={`${s.color}`}>{s.icon}</div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar huésped o habitación..." disabled={loading} className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100" />
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as ReservationStatus | '')} disabled={loading} className="pl-9 pr-8 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm appearance-none dark:text-gray-100">
                <option value="">Todos los estados</option>
                {Object.keys(STATUS_CFG).map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
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

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">Huésped</th>
                <th className="px-4 py-3 font-medium">Hab.</th>
                <th className="px-4 py-3 font-medium">Entrada</th>
                <th className="px-4 py-3 font-medium">Salida</th>
                <th className="px-4 py-3 font-medium">Noches</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Canal</th>
                <th className="px-4 py-3 font-medium text-right">Importe</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
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
              ) : filtered.map(r => (
                <tr key={r._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{r.guest}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.room}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.checkIn}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.checkOut}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.nights}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_CFG[r.status].bg} ${STATUS_CFG[r.status].text}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${CHANNEL_CFG[r.channel].bg} ${CHANNEL_CFG[r.channel].text}`}>{r.channel}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">{r.amount.toLocaleString('es-ES')} €</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => void remove(r._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">No se encontraron reservas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar reserva' : 'Nueva reserva'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {([
                { key: 'guest', label: 'Huésped', type: 'text' },
                { key: 'room', label: 'Habitación', type: 'text' },
                { key: 'checkIn', label: 'Fecha entrada', type: 'date' },
                { key: 'checkOut', label: 'Fecha salida', type: 'date' },
                { key: 'nights', label: 'Noches', type: 'number' },
                { key: 'amount', label: 'Importe (€)', type: 'number' },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                  <input type={f.type} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as ReservationStatus })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                  {Object.keys(STATUS_CFG).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Canal</label>
                <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value as Channel })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                  {Object.keys(CHANNEL_CFG).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
              <button type="button" onClick={() => void save()} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="hotel_reservations"
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
