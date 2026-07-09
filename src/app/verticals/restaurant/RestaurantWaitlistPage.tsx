import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import { useClientPhoneSearch } from '../../hooks/useClientPhoneSearch';
import { resolveClientSearchBusinessId } from '../../lib/clientSearchScope';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import {
  changeTableStatusRequest,
  createDiningOrderRequest,
  type DiningTable,
} from '../../lib/salaApi';
import { findOpenDiningOrderForTable } from '../../lib/restaurantDiningTpv';
import { writeSalaTpvOpenTable } from '../../lib/salaTpvLaunch';
import { RestaurantChangeTableModal } from '../../components/saas/restaurant/RestaurantChangeTableModal';
import type { Client } from '../../context/AppContext';
import {
  Search,
  Plus,
  X,
  Edit2,
  Trash2,
  Users,
  Clock,
  Phone,
  Loader2,
  UserCheck,
  Bell,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

type WaitlistStatus = 'esperando' | 'avisado' | 'sentado' | 'cancelado';

interface WaitlistEntry extends VerticalEntity {
  guestName: string;
  partySize: string;
  phone: string;
  estimatedWait: string;
  status: WaitlistStatus;
  notes: string;
  zone: string;
  clientId: string;
}

type WaitlistForm = Omit<WaitlistEntry, keyof VerticalEntity>;

const STATUS_CFG: Record<WaitlistStatus, { label: string; dot: string }> = {
  esperando: { label: 'En espera', dot: 'bg-amber-500' },
  avisado: { label: 'Avisado', dot: 'bg-blue-500' },
  sentado: { label: 'Sentado', dot: 'bg-emerald-500' },
  cancelado: { label: 'Cancelado', dot: 'bg-gray-400' },
};

const EMPTY_FORM: WaitlistForm = {
  guestName: '',
  partySize: '2',
  phone: '',
  estimatedWait: '15',
  status: 'esperando',
  notes: '',
  zone: '',
  clientId: '',
};

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

function formatClientPhone(client: Client): string {
  const prefix = client.phonePrefix || '+34';
  const phone = client.phone || '';
  return phone ? `${prefix} ${phone}`.trim() : '';
}

export function RestaurantWaitlistPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const api = useMemo(() => createVerticalApi<WaitlistEntry>('restaurant', 'waitlist'), []);
  const userId = user?.user_id || user?.id || '';
  // Los datos de sala (mesas/cuentas) viven bajo el usuario de datos del negocio.
  const salaUserId = resolveBusinessDataUserId(user, currentBusiness);
  const businessScopeId = resolveBusinessScopeId(currentBusiness);
  const clientSearchBusinessId = resolveClientSearchBusinessId(currentBusiness, businessScopeId);

  const [items, setItems] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<WaitlistStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<WaitlistEntry | null>(null);
  const [form, setForm] = useState<WaitlistForm>(EMPTY_FORM);
  const [clientLookup, setClientLookup] = useState('');
  const [clientEditing, setClientEditing] = useState(true);
  const [seating, setSeating] = useState<WaitlistEntry | null>(null);
  const [seatingBusy, setSeatingBusy] = useState(false);

  const {
    results: clientResults,
    isSearching: isClientSearching,
    searchError: clientSearchError,
    selectedClient,
    selectClient,
    clearSelection,
    clearResults,
  } = useClientPhoneSearch({
    userId,
    phone: clientLookup,
    businessId: clientSearchBusinessId,
    enabled: showModal,
    matchByName: true,
    minQueryLength: 2,
  });

  useModalClose(showModal, () => {
    setShowModal(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setClientLookup('');
    setClientEditing(true);
    clearSelection();
    clearResults();
  });

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeQueue = useMemo(
    () => items
      .filter((item) => item.status === 'esperando' || item.status === 'avisado')
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    [items],
  );

  const queuePosition = useMemo(() => {
    const map = new Map<string, number>();
    activeQueue.forEach((item, index) => map.set(item._id, index + 1));
    return map;
  }, [activeQueue]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => (filterStatus === 'all' ? true : item.status === filterStatus))
      .filter((item) => {
        if (!q) return true;
        return (
          item.guestName.toLowerCase().includes(q)
          || item.phone.toLowerCase().includes(q)
          || item.zone.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [items, search, filterStatus]);

  const waitingCount = activeQueue.length;
  const todayCount = items.filter((item) => isToday(item.createdAt)).length;

  const applyClient = (client: Client) => {
    selectClient(client);
    setForm((prev) => ({
      ...prev,
      clientId: client.id,
      guestName: client.name || client.fullName || prev.guestName,
      phone: formatClientPhone(client) || prev.phone,
    }));
    setClientLookup('');
    setClientEditing(false);
  };

  const clearLinkedClient = () => {
    clearSelection();
    setForm((prev) => ({ ...prev, clientId: '' }));
    setClientLookup('');
    setClientEditing(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setClientLookup('');
    setClientEditing(true);
    clearSelection();
    clearResults();
    setShowModal(true);
  };

  const openEdit = (item: WaitlistEntry) => {
    setEditing(item);
    setForm({
      guestName: item.guestName || '',
      partySize: item.partySize || '2',
      phone: item.phone || '',
      estimatedWait: item.estimatedWait || '15',
      status: item.status || 'esperando',
      notes: item.notes || '',
      zone: item.zone || '',
      clientId: item.clientId || '',
    });
    setClientLookup('');
    setClientEditing(!item.clientId);
    clearSelection();
    clearResults();
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!userId || !form.guestName.trim()) {
      toast.error('Indica el nombre del cliente');
      return;
    }
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
        toast.success('Entrada actualizada');
      } else {
        await api.create(userId, form);
        toast.success('Cliente añadido a la lista');
      }
      setShowModal(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      setClientLookup('');
      clearSelection();
      await loadData();
    } catch {
      toast.error('No se pudo guardar la entrada');
    }
  };

  const handleStatusChange = async (item: WaitlistEntry, status: WaitlistStatus) => {
    if (!userId) return;
    try {
      await api.update(userId, item._id, { status });
      toast.success(`Estado: ${STATUS_CFG[status].label}`);
      await loadData();
    } catch {
      toast.error('No se pudo actualizar el estado');
    }
  };

  /** Sentar: crea la cuenta de mesa, ocupa la mesa y abre el TPV en ella. */
  const handleSeatAtTable = async (item: WaitlistEntry, table: DiningTable) => {
    if (!userId || !salaUserId || seatingBusy) return;
    setSeatingBusy(true);
    try {
      const open = await findOpenDiningOrderForTable(salaUserId, table._id);
      if (open) throw new Error(`Mesa ${table.number} ya tiene cuenta abierta`);

      const guests = parseInt(item.partySize, 10) || 2;
      const order = await createDiningOrderRequest(salaUserId, {
        businessId: businessScopeId,
        tableId: table._id,
        tableNumber: table.number,
        tableName: table.name,
        zone: table.zone,
        guests,
        createdBy: userId,
        createdByName: user?.fullName || 'Sala',
        clientId: item.clientId || '',
        clientName: item.guestName,
        notes: item.notes || '',
        comandas: [],
        status: 'open',
      });
      await changeTableStatusRequest(salaUserId, table._id, 'occupied', {
        currentGuests: guests,
        occupiedBy: item.guestName,
      });
      await api.update(userId, item._id, { status: 'sentado' });

      setSeating(null);
      toast.success(`${item.guestName} · Mesa ${table.number} · Abriendo TPV`);
      writeSalaTpvOpenTable({ tableId: table._id, orderId: order._id });
      navigate('/saas/caja/tpv');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo sentar al cliente');
      await loadData();
    } finally {
      setSeatingBusy(false);
    }
  };

  const handleDelete = async (item: WaitlistEntry) => {
    if (!userId) return;
    if (!window.confirm(`¿Quitar a ${item.guestName} de la lista?`)) return;
    try {
      await api.remove(userId, item._id);
      toast.success('Entrada eliminada');
      await loadData();
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  return (
    <Layout title="Lista de espera">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Lista de espera</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Gestiona clientes sin mesa: turno, avisos y tiempos estimados. Vincula con el CRM.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Añadir a la lista
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">En cola</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{waitingCount}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total hoy</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{todayCount}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Sentados</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {items.filter((item) => item.status === 'sentado').length}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, teléfono o zona…"
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as WaitlistStatus | 'all')}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="all">Todos los estados</option>
            {(Object.keys(STATUS_CFG) as WaitlistStatus[]).map((status) => (
              <option key={status} value={status}>{STATUS_CFG[status].label}</option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-12 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando lista…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-400">
              No hay nadie en la lista de espera.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((item) => {
                const statusCfg = STATUS_CFG[item.status] || STATUS_CFG.esperando;
                const position = queuePosition.get(item._id);
                return (
                  <div key={item._id} className="flex flex-wrap items-center gap-4 px-4 py-4">
                    {position ? (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-lg font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        #{position}
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{item.guestName}</p>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                        {item.clientId ? (
                          <Link
                            to={`/saas/clients/${encodeURIComponent(item.clientId)}`}
                            className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300"
                          >
                            CRM
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{item.partySize || '—'} pers.</span>
                        {item.phone ? (
                          <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{item.phone}</span>
                        ) : null}
                        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />~{item.estimatedWait || '—'} min</span>
                        {item.zone ? <span>Zona: {item.zone}</span> : null}
                      </div>
                      {item.notes ? (
                        <p className="mt-1 text-xs text-gray-400">{item.notes}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {item.status === 'esperando' ? (
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(item, 'avisado')}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/30"
                          title="Avisar al cliente"
                        >
                          <Bell className="h-3.5 w-3.5" />
                          Avisar
                        </button>
                      ) : null}
                      {(item.status === 'esperando' || item.status === 'avisado') ? (
                        <button
                          type="button"
                          onClick={() => setSeating(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                          title="Elegir mesa, abrir cuenta y TPV"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Sentar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                        aria-label="Editar"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(item)}
                        className="rounded-lg border border-gray-200 p-2 text-red-500 hover:bg-red-50 dark:border-gray-700 dark:hover:bg-red-950/30"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {seating && salaUserId ? (
        <RestaurantChangeTableModal
          userId={salaUserId}
          currentTableId=""
          title={`Sentar a ${seating.guestName}`}
          onSelect={(table) => void handleSeatAtTable(seating, table)}
          onClose={() => setSeating(null)}
        />
      ) : null}

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {editing ? 'Editar entrada' : 'Nueva entrada'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Buscar en CRM (teléfono o nombre)
                </label>
                {selectedClient || form.clientId ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-violet-200 bg-violet-50 p-3 dark:border-violet-800 dark:bg-violet-950/30">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {selectedClient?.name || form.guestName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Cliente vinculado al CRM
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearLinkedClient}
                      className="shrink-0 rounded-lg p-1.5 text-violet-700 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-900/40"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        value={clientLookup}
                        onChange={(e) => {
                          setClientLookup(e.target.value);
                          setClientEditing(true);
                          setForm((prev) => ({ ...prev, clientId: '' }));
                          clearSelection();
                        }}
                        placeholder="Ej. 612… o María García"
                        className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-10 text-sm dark:border-gray-700 dark:bg-gray-800"
                        autoComplete="off"
                      />
                      {isClientSearching ? (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
                      ) : null}
                    </div>
                    {clientSearchError ? (
                      <p className="mt-1 text-xs text-red-500">{clientSearchError}</p>
                    ) : null}
                    {clientEditing && clientResults.length > 0 ? (
                      <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                        {clientResults.map((client) => (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => applyClient(client)}
                            className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {client.name || client.fullName || 'Cliente'}
                              </p>
                              <p className="text-xs text-gray-500">{formatClientPhone(client) || client.email || '—'}</p>
                            </div>
                            <span className="shrink-0 text-xs font-bold text-violet-600">Vincular</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <input
                value={form.guestName}
                onChange={(e) => {
                  setClientEditing(true);
                  clearSelection();
                  setForm((prev) => ({ ...prev, guestName: e.target.value, clientId: '' }));
                }}
                placeholder="Nombre del cliente *"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={form.partySize}
                  onChange={(e) => setForm((prev) => ({ ...prev, partySize: e.target.value }))}
                  placeholder="Comensales"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
                />
                <input
                  value={form.estimatedWait}
                  onChange={(e) => setForm((prev) => ({ ...prev, estimatedWait: e.target.value }))}
                  placeholder="Espera (min)"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
                />
              </div>
              <input
                value={form.phone}
                onChange={(e) => {
                  setClientEditing(true);
                  clearSelection();
                  setForm((prev) => ({ ...prev, phone: e.target.value, clientId: '' }));
                }}
                placeholder="Teléfono"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
              <input
                value={form.zone}
                onChange={(e) => setForm((prev) => ({ ...prev, zone: e.target.value }))}
                placeholder="Zona preferida (terraza, interior…)"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
              <select
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as WaitlistStatus }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
              >
                {(Object.keys(STATUS_CFG) as WaitlistStatus[]).map((status) => (
                  <option key={status} value={status}>{STATUS_CFG[status].label}</option>
                ))}
              </select>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Notas (alergias, silla infantil…)"
                rows={3}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium dark:border-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
