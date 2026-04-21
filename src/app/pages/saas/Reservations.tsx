import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useNotificationOpen } from '../../hooks/useNotificationOpen';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useColumnPreferences, type ColumnDef } from '../../hooks/useColumnPreferences';
import { ColumnCustomizer } from '../../components/saas/ColumnCustomizer';
import { useModalClose } from '../../hooks/useModalClose';
import {
  listReservations,
  cancelReservation as cancelReservationApi,
  convertReservationToSale,
  deleteReservation,
} from '../../lib/reservationApi';
import {
  RESERVATION_STATUS_LABELS,
  RESERVATION_STATUS_CONFIG,
  daysUntilExpiration,
  daysSinceReservation,
  type ReservationRecord,
  type ReservationStatus,
} from '../../lib/reservationTypes';
import {
  Plus, Search, X, Calendar, AlertTriangle,
  ChevronDown, ArrowUp, ArrowDown, Check,
  BookmarkCheck, DollarSign, Clock, TrendingUp,
  Ban, ArrowRightLeft, Trash2, Edit3,
  FileWarning, AlertCircle, ShieldAlert, Timer,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type ResColId = 'vehiculo' | 'cliente' | 'senal' | 'forma_pago' | 'comercial' | 'fecha' | 'vencimiento' | 'estado';

const RES_COLUMNS: ColumnDef<ResColId>[] = [
  { id: 'vehiculo',    label: 'Vehículo',    required: true },
  { id: 'cliente',     label: 'Cliente',     required: true },
  { id: 'senal',       label: 'Señal' },
  { id: 'forma_pago',  label: 'Forma de pago' },
  { id: 'comercial',   label: 'Comercial' },
  { id: 'fecha',       label: 'Fecha reserva' },
  { id: 'vencimiento', label: 'Vencimiento' },
  { id: 'estado',      label: 'Estado' },
];

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

function StatusBadge({ status }: { status: ReservationStatus }) {
  const cfg = RESERVATION_STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap px-2.5 py-0.5 text-xs ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {RESERVATION_STATUS_LABELS[status]}
    </span>
  );
}

function DepositBadge({ paid }: { paid: boolean }) {
  return paid
    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full"><Check className="w-3 h-3" />Cobrada</span>
    : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" />Pendiente</span>;
}

function ExpirationCell({ r }: { r: ReservationRecord }) {
  const days = daysUntilExpiration(r);
  const dateStr = r.expirationDate
    ? new Date(r.expirationDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  let color = 'text-gray-600 dark:text-gray-400';
  if (days <= 0) color = 'text-red-600 dark:text-red-400 font-semibold';
  else if (days <= 3) color = 'text-amber-600 dark:text-amber-400 font-semibold';

  return (
    <div className="flex flex-col">
      <span className={`text-sm ${color}`}>{dateStr}</span>
      {r.status === 'active' && days <= 3 && days > 0 && (
        <span className="text-[10px] text-amber-500">Vence en {days}d</span>
      )}
      {r.status === 'active' && days <= 0 && (
        <span className="text-[10px] text-red-500 font-semibold">Vencida</span>
      )}
    </div>
  );
}

// ─── Alert types ──────────────────────────────────────────────────────────────

interface ReservationAlert {
  id: string;
  type: 'expired' | 'no_payment' | 'no_contract' | 'too_long';
  icon: React.ReactNode;
  color: string;
  title: string;
  description: string;
  reservationId: string;
}

function buildAlerts(reservations: ReservationRecord[]): ReservationAlert[] {
  const alerts: ReservationAlert[] = [];
  for (const r of reservations) {
    if (r.status === 'active' && daysUntilExpiration(r) <= 0) {
      alerts.push({
        id: `exp-${r._id}`, type: 'expired',
        icon: <AlertTriangle className="w-4 h-4" />, color: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
        title: 'Reserva vencida', description: `${r.vehicleName} — ${r.clientName}`, reservationId: r._id,
      });
    }
    if (r.status === 'active' && !r.depositPaid && r.depositAmount > 0) {
      alerts.push({
        id: `pay-${r._id}`, type: 'no_payment',
        icon: <DollarSign className="w-4 h-4" />, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
        title: 'Señal sin cobrar', description: `${r.depositAmount.toLocaleString('es-ES')}€ — ${r.vehicleName}`, reservationId: r._id,
      });
    }
    if (r.status === 'active' && !r.contractGenerated && daysSinceReservation(r) > 3) {
      alerts.push({
        id: `ctr-${r._id}`, type: 'no_contract',
        icon: <FileWarning className="w-4 h-4" />, color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800',
        title: 'Sin contrato', description: `${r.vehicleName} — reservada hace ${daysSinceReservation(r)}d`, reservationId: r._id,
      });
    }
    if (r.status === 'active' && daysSinceReservation(r) > 15) {
      alerts.push({
        id: `long-${r._id}`, type: 'too_long',
        icon: <Timer className="w-4 h-4" />, color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800',
        title: 'Reservada demasiado tiempo', description: `${r.vehicleName} — ${daysSinceReservation(r)} días`, reservationId: r._id,
      });
    }
  }
  return alerts;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Reservations() {
  const { currentBusiness } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | ''>('');
  const [filterCommercial, setFilterCommercial] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'fecha', dir: 'desc' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReservationRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ReservationRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showAlerts, setShowAlerts] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'client', label: 'Cliente' },
    { key: 'date', label: 'Fecha' },
    { key: 'time', label: 'Hora' },
    { key: 'guests', label: 'Comensales' },
    { key: 'table', label: 'Mesa' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'client', label: 'Cliente', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'time', label: 'Hora', example: '' },
    { key: 'guests', label: 'Comensales', example: '' },
    { key: 'table', label: 'Mesa', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} reserva(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} reserva(s) importado(s)`);
  };

  const { visible: visibleCols, toggle: toggleCol, isVisible: isColVisible } = useColumnPreferences('reservations-cols', RES_COLUMNS);

  useModalClose(!!cancelTarget, () => setCancelTarget(null));

  useNotificationOpen(
    useCallback((entityId: string) => {
      const r = reservations.find((x) => x._id === entityId);
      if (r) { setEditing(r); setModalOpen(true); }
    }, [reservations]),
    !loading,
  );

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listReservations();
      setReservations(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar reservas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let list = [...reservations];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.clientName.toLowerCase().includes(q) ||
        r.vehicleName.toLowerCase().includes(q) ||
        r.vehiclePlate.toLowerCase().includes(q) ||
        r.commercial.toLowerCase().includes(q)
      );
    }
    if (filterStatus) list = list.filter(r => r.status === filterStatus);
    if (filterCommercial) list = list.filter(r => r.commercial === filterCommercial);

    if (sort) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        switch (sort.key) {
          case 'vehiculo': return dir * a.vehicleName.localeCompare(b.vehicleName);
          case 'cliente': return dir * a.clientName.localeCompare(b.clientName);
          case 'senal': return dir * (a.depositAmount - b.depositAmount);
          case 'comercial': return dir * a.commercial.localeCompare(b.commercial);
          case 'fecha': return dir * a.reservationDate.localeCompare(b.reservationDate);
          case 'vencimiento': return dir * a.expirationDate.localeCompare(b.expirationDate);
          case 'estado': return dir * a.status.localeCompare(b.status);
          default: return 0;
        }
      });
    }
    return list;
  }, [reservations, search, filterStatus, filterCommercial, sort]);

  const commercials = useMemo(() =>
    [...new Set(reservations.map(r => r.commercial))].filter(Boolean).sort(),
    [reservations]
  );

  const stats = useMemo(() => {
    const active = reservations.filter(r => r.status === 'active');
    const depositCollected = reservations.filter(r => r.depositPaid).reduce((s, r) => s + r.depositAmount, 0);
    const expired = reservations.filter(r => r.status === 'expired' || (r.status === 'active' && daysUntilExpiration(r) <= 0));
    const converted = reservations.filter(r => r.status === 'converted');
    const conversionRate = reservations.length > 0 ? Math.round((converted.length / reservations.length) * 100) : 0;
    return { activeCount: active.length, depositCollected, expiredCount: expired.length, conversionRate };
  }, [reservations]);

  const alerts = useMemo(() => buildAlerts(reservations), [reservations]);

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelReservationApi(user?.userId || '', cancelTarget._id, cancelReason);
      toast.success('Reserva cancelada');
      setCancelTarget(null);
      setCancelReason('');
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al cancelar');
    }
  };

  const handleConvert = async (r: ReservationRecord) => {
    try {
      const result = await convertReservationToSale(user?.userId || '', r._id);
      toast.success('Reserva convertida en venta');
      fetchData();
      if (result.sale && typeof result.sale === 'object' && '_id' in result.sale) {
        navigate(`/saas/sales/${(result.sale as { _id: string })._id}`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al convertir');
    }
  };

  const handleDelete = async (r: ReservationRecord) => {
    if (!confirm(`¿Eliminar la reserva de ${r.vehicleName} para ${r.clientName}?`)) return;
    try {
      await deleteReservation(user?.userId || '', r._id);
      toast.success('Reserva eliminada');
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (r: ReservationRecord) => { setEditing(r); setModalOpen(true); };

  const handleSort = (key: string) => {
    setSort(prev => {
      if (prev?.key === key) {
        if (prev.dir === 'asc') return { key, dir: 'desc' };
        return null;
      }
      return { key, dir: 'asc' };
    });
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sort?.key !== col) return <ChevronDown className="w-3 h-3 text-gray-300 dark:text-gray-600" />;
    return sort.dir === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-500" /> : <ArrowDown className="w-3 h-3 text-amber-500" />;
  };

  return (
    <Layout title="Reservas y Señales">
      <div className="space-y-6">

        {/* ── KPIs ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Reservas activas', value: stats.activeCount, icon: <BookmarkCheck className="w-5 h-5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
            { label: 'Señales cobradas', value: `${stats.depositCollected.toLocaleString('es-ES')} €`, icon: <DollarSign className="w-5 h-5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
            { label: 'Reservas vencidas', value: stats.expiredCount, icon: <AlertTriangle className="w-5 h-5" />, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
            { label: 'Tasa conversión', value: `${stats.conversionRate}%`, icon: <TrendingUp className="w-5 h-5" />, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-4`}>
              <div className={s.color}>{s.icon}</div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Alerts banner ────────────────────────────────────────── */}
        {alerts.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button onClick={() => setShowAlerts(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {alerts.length} alerta{alerts.length !== 1 ? 's' : ''} activa{alerts.length !== 1 ? 's' : ''}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showAlerts ? 'rotate-180' : ''}`} />
            </button>
            {showAlerts && (
              <div className="px-4 pb-4 grid gap-2">
                {alerts.map(a => (
                  <div key={a.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${a.color}`}>
                    {a.icon}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">{a.title}</p>
                      <p className="text-xs opacity-80 truncate">{a.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Toolbar ──────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por cliente, vehículo o matrícula..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as ReservationStatus | '')}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
              <option value="">Todos los estados</option>
              {(Object.keys(RESERVATION_STATUS_LABELS) as ReservationStatus[]).map(s => (
                <option key={s} value={s}>{RESERVATION_STATUS_LABELS[s]}</option>
              ))}
            </select>

            {commercials.length > 1 && (
              <select value={filterCommercial} onChange={e => setFilterCommercial(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
                <option value="">Todos los comerciales</option>
                {commercials.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

            <ColumnCustomizer columns={RES_COLUMNS} visible={visibleCols} onToggle={toggleCol} />

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

        {/* ── Table ────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
              <BookmarkCheck className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                {reservations.length === 0 ? 'No hay reservas registradas' : 'No se encontraron resultados'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {reservations.length === 0 ? 'Crea tu primera reserva para empezar' : 'Prueba con otros filtros'}
              </p>
              {reservations.length === 0 && (
                <button onClick={openCreate}
                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
                  <Plus className="w-4 h-4" /> Nueva reserva
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                      {isColVisible('vehiculo') && (
                        <th className="text-left px-4 py-3 cursor-pointer" onClick={() => handleSort('vehiculo')}>
                          <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Vehículo <SortIcon col="vehiculo" /></div>
                        </th>
                      )}
                      {isColVisible('cliente') && (
                        <th className="text-left px-4 py-3 cursor-pointer" onClick={() => handleSort('cliente')}>
                          <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Cliente <SortIcon col="cliente" /></div>
                        </th>
                      )}
                      {isColVisible('senal') && (
                        <th className="text-left px-4 py-3 cursor-pointer" onClick={() => handleSort('senal')}>
                          <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Señal <SortIcon col="senal" /></div>
                        </th>
                      )}
                      {isColVisible('forma_pago') && (
                        <th className="text-left px-4 py-3">
                          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Forma de pago</span>
                        </th>
                      )}
                      {isColVisible('comercial') && (
                        <th className="text-left px-4 py-3 cursor-pointer" onClick={() => handleSort('comercial')}>
                          <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Comercial <SortIcon col="comercial" /></div>
                        </th>
                      )}
                      {isColVisible('fecha') && (
                        <th className="text-left px-4 py-3 cursor-pointer" onClick={() => handleSort('fecha')}>
                          <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Fecha <SortIcon col="fecha" /></div>
                        </th>
                      )}
                      {isColVisible('vencimiento') && (
                        <th className="text-left px-4 py-3 cursor-pointer" onClick={() => handleSort('vencimiento')}>
                          <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Vencimiento <SortIcon col="vencimiento" /></div>
                        </th>
                      )}
                      {isColVisible('estado') && (
                        <th className="text-left px-4 py-3 cursor-pointer" onClick={() => handleSort('estado')}>
                          <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Estado <SortIcon col="estado" /></div>
                        </th>
                      )}
                      <th className="text-right px-4 py-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => (
                      <tr key={r._id}
                        className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                        onClick={() => openEdit(r)}>
                        {isColVisible('vehiculo') && (
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[200px]">{r.vehicleName}</p>
                            <span className="font-mono text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded">{r.vehiclePlate}</span>
                          </td>
                        )}
                        {isColVisible('cliente') && (
                          <td className="px-4 py-3">
                            <p className="text-gray-900 dark:text-gray-100 truncate max-w-[180px]">{r.clientName}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">{r.clientPhone}</p>
                          </td>
                        )}
                        {isColVisible('senal') && (
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900 dark:text-gray-100">{r.depositAmount.toLocaleString('es-ES')} €</p>
                            <DepositBadge paid={r.depositPaid} />
                          </td>
                        )}
                        {isColVisible('forma_pago') && (
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.paymentMethod || '—'}</td>
                        )}
                        {isColVisible('comercial') && (
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.commercial}</td>
                        )}
                        {isColVisible('fecha') && (
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {r.reservationDate ? new Date(r.reservationDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                        )}
                        {isColVisible('vencimiento') && (
                          <td className="px-4 py-3"><ExpirationCell r={r} /></td>
                        )}
                        {isColVisible('estado') && (
                          <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                            <button onClick={() => openEdit(r)} title="Editar"
                              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                              <Edit3 className="w-4 h-4" />
                            </button>
                            {r.status === 'active' && (
                              <>
                                <button onClick={() => handleConvert(r)} title="Convertir en venta"
                                  className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-500 hover:text-blue-700 transition-colors">
                                  <ArrowRightLeft className="w-4 h-4" />
                                </button>
                                <button onClick={() => { setCancelTarget(r); setCancelReason(''); }} title="Cancelar reserva"
                                  className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-500 hover:text-amber-700 transition-colors">
                                  <Ban className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button onClick={() => handleDelete(r)} title="Eliminar"
                              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-400 hover:text-red-600 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map(r => (
                  <div key={r._id} onClick={() => openEdit(r)}
                    className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 active:scale-[0.99] cursor-pointer transition-all">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">{r.vehicleName}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{r.clientName}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{r.depositAmount.toLocaleString('es-ES')} €</p>
                        <DepositBadge paid={r.depositPaid} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={r.status} />
                        <span className="text-xs text-gray-400 dark:text-gray-500">{r.commercial}</span>
                      </div>
                      <ExpirationCell r={r} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Cancel modal ─────────────────────────────────────────── */}
        {cancelTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-md p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Cancelar reserva</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {cancelTarget.vehicleName} — {cancelTarget.clientName}
              </p>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Motivo (opcional)</label>
              <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                rows={3} placeholder="¿Por qué se cancela la reserva?"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none mb-4" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setCancelTarget(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                  Cerrar
                </button>
                <button onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
                  Cancelar reserva
                </button>
              </div>
            </div>
          </div>
        )}

        {modalOpen && (
          <React.Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" /></div>}>
            <ReservationModalLazy
              open={modalOpen}
              editing={editing}
              onClose={() => { setModalOpen(false); setEditing(null); }}
              onSaved={() => { setModalOpen(false); setEditing(null); fetchData(); }}
            />
          </React.Suspense>
        )}
      </div>
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="reservations"
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

const ReservationModalLazy = React.lazy(() =>
  import('../../components/design-system/SAAS__ReservationModal').then(m => ({ default: m.SAAS__ReservationModal }))
);

export default Reservations;
