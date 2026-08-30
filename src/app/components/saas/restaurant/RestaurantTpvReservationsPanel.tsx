/**
 * Gestión de reservas del día dentro del TPV (sin salir a la pantalla CEO).
 * Crear / editar / confirmar / cancelar / asignar mesa / sentar.
 * Busca y vincula clientes CRM (igual que Reservas del restaurante).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  Armchair,
  Check,
  Loader2,
  Plus,
  Search,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useModalClose } from '../../../hooks/useModalClose';
import { useClientPhoneSearch } from '../../../hooks/useClientPhoneSearch';
import { useBusiness } from '../../../context/BusinessContext';
import type { Client } from '../../../context/AppContext';
import { resolveClientSearchBusinessId } from '../../../lib/clientSearchScope';
import { normalizeBusinessScopeId, resolveBusinessScopeId } from '../../../lib/deliverySetup';
import { localCalendarDayKey } from '../../../lib/tpvCajaScope';
import { listFloorReservations, reservationMinutesUntil } from '../../../lib/restaurantFloorReservations';
import {
  assignTables,
  cancelReservation,
  confirmReservation,
  createReservation,
  updateReservation,
} from '../../../lib/restaurantReservationsApi';
import {
  ACTIVE_STATUSES,
  EMPTY_FORM,
  STATUS_CFG,
  formatReservationSeatPlace,
  reservationTableIds,
  type ReservationFormData,
  type RestaurantReservation,
} from '../../../lib/restaurantReservationTypes';
import type { DiningTable } from '../../../lib/salaApi';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../../lib/vertialUiTokens';
import { RestaurantReservationTablePicker } from './RestaurantReservationTablePicker';

type Actor = { userId: string; userName: string };

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  businessId: string;
  actor: Actor;
  tables: DiningTable[];
  seatingId?: string | null;
  onSeat: (reservation: RestaurantReservation) => void;
  /** Tras crear/editar/cancelar/asignar: refrescar franja + plano de mesas. */
  onChanged: () => void;
  /** Abrir ya en modo nueva reserva. */
  startCreate?: boolean;
};

function formatClientPhone(client: Client): string {
  const prefix = client.phonePrefix || '+34';
  const phone = client.phone || '';
  return phone ? `${prefix} ${phone}`.trim() : '';
}

function todayReservationsForTpv(all: RestaurantReservation[], today: string): RestaurantReservation[] {
  return all
    .filter((r) => String(r.date || '').slice(0, 10) === today)
    .filter((r) => r.status !== 'finished' && r.status !== 'cancelled' && r.status !== 'no_show')
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
}

function formFromReservation(item: RestaurantReservation): ReservationFormData {
  return {
    guestName: item.guestName,
    phone: item.phone,
    email: item.email,
    clientId: item.clientId || '',
    date: item.date,
    time: item.time,
    partySize: item.partySize,
    preferredZone: item.preferredZone,
    tableId: item.tableId,
    tableName: item.tableName,
    tableNumber: item.tableNumber,
    tableIds: reservationTableIds(item),
    notes: item.notes,
    status: item.status,
  };
}

export function RestaurantTpvReservationsPanel({
  open,
  onClose,
  userId,
  businessId,
  actor,
  tables,
  seatingId = null,
  onSeat,
  onChanged,
  startCreate = false,
}: Props) {
  const { currentBusiness, businesses } = useBusiness();
  const today = localCalendarDayKey();
  const tomorrow = useMemo(() => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return localCalendarDayKey(d);
  }, [today]);
  const businessScopeId = resolveBusinessScopeId(currentBusiness) || normalizeBusinessScopeId(businessId);
  const clientSearchBusinessId = resolveClientSearchBusinessId(currentBusiness, businessScopeId);
  const reservationScope = useMemo(
    () => ({
      businessId: businessScopeId,
      accountBusinessCount: businesses.length || 1,
    }),
    [businessScopeId, businesses.length],
  );
  const clientScope = useMemo(
    () => ({
      businessId: businessScopeId,
      searchBusinessId: clientSearchBusinessId,
      accountBusinessCount: businesses.length || 1,
    }),
    [businessScopeId, clientSearchBusinessId, businesses.length],
  );

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<RestaurantReservation[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RestaurantReservation | null>(null);
  const [form, setForm] = useState<ReservationFormData>({ ...EMPTY_FORM, date: today });
  const [assignFor, setAssignFor] = useState<RestaurantReservation | null>(null);
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const [clientLookup, setClientLookup] = useState('');
  const [clientEditing, setClientEditing] = useState(true);

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
    enabled: open && formOpen,
    matchByName: true,
    minQueryLength: 2,
  });

  useModalClose(open, onClose);

  const reload = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const all = await listFloorReservations(userId, reservationScope).catch(() => []);
      setItems(todayReservationsForTpv(all, today));
    } finally {
      setLoading(false);
    }
  }, [userId, today, reservationScope]);

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, reload]);

  const resetClientLookup = useCallback(() => {
    setClientLookup('');
    setClientEditing(true);
    clearSelection();
    clearResults();
  }, [clearSelection, clearResults]);

  useEffect(() => {
    if (!open) {
      setFormOpen(false);
      setEditing(null);
      setAssignFor(null);
      setAssignIds([]);
      resetClientLookup();
      return;
    }
    if (startCreate) {
      setEditing(null);
      setForm({ ...EMPTY_FORM, date: today, time: '20:00', partySize: '2' });
      resetClientLookup();
      setFormOpen(true);
    }
  }, [open, startCreate, today, resetClientLookup]);

  const zoneOptions = useMemo(() => {
    const zones = tables
      .map((t) => String(t.zone || '').trim())
      .filter(Boolean);
    return [...new Set(zones)];
  }, [tables]);

  const assignPartySize = useMemo(
    () => parseInt(String(assignFor?.partySize || '2'), 10) || 2,
    [assignFor],
  );

  const assignCovered = useMemo(() => {
    return tables
      .filter((t) => assignIds.includes(t._id))
      .reduce((sum, t) => sum + (Number(t.capacity) || 0), 0);
  }, [tables, assignIds]);

  const applyClient = (client: Client) => {
    selectClient(client);
    setForm((prev) => ({
      ...prev,
      clientId: client.id,
      guestName: client.name || client.fullName || prev.guestName,
      phone: formatClientPhone(client) || prev.phone,
      email: client.email || prev.email,
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
    setForm({ ...EMPTY_FORM, date: today, time: '20:00', partySize: '2' });
    resetClientLookup();
    setFormOpen(true);
  };

  const openEdit = (item: RestaurantReservation) => {
    setEditing(item);
    setForm(formFromReservation(item));
    setClientLookup('');
    setClientEditing(!item.clientId);
    clearSelection();
    clearResults();
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!userId || !form.guestName.trim() || !form.date || !form.time) {
      toast.error('Completa nombre, fecha y hora');
      return;
    }
    const party = parseInt(String(form.partySize || '2'), 10) || 2;
    const selected = form.tableIds || [];
    if (selected.length > 0) {
      const covered = tables
        .filter((t) => selected.includes(t._id))
        .reduce((sum, t) => sum + (Number(t.capacity) || 0), 0);
      if (covered < party) {
        toast.error(`Las mesas elegidas cubren ${covered} pers.; hacen falta ${party}.`);
        return;
      }
    }
    setSaving(true);
    try {
      if (editing) {
        const item = await updateReservation(userId, editing, form, actor, tables, items, clientScope);
        toast.success(item.clientId ? 'Reserva actualizada · Cliente en CRM' : 'Reserva actualizada');
      } else {
        const { tableAssigned, clientLinked, clientCrmError } = await createReservation(
          userId,
          { ...form, date: form.date || today },
          actor,
          tables,
          items,
          clientScope,
        );
        const phoneDigits = form.phone.replace(/\D/g, '');
        if (clientCrmError) {
          toast.warning(`Reserva creada, pero el CRM falló: ${clientCrmError}`);
        } else if (tableAssigned && clientLinked) {
          toast.success('Reserva creada · Mesa asignada · Cliente en CRM');
        } else if (tableAssigned) {
          toast.success('Reserva creada · Mesa asignada');
        } else if (clientLinked) {
          toast.success('Reserva creada · Cliente nuevo en CRM');
        } else if (phoneDigits.length > 0 && phoneDigits.length < 9) {
          toast.success('Reserva creada · Teléfono incompleto para CRM (mín. 9 dígitos)');
        } else if (!phoneDigits.length) {
          toast.success('Reserva creada · Añade teléfono para crear cliente en CRM');
        } else {
          toast.success('Reserva creada');
        }
      }
      setFormOpen(false);
      setEditing(null);
      resetClientLookup();
      await reload();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (
    action: () => Promise<unknown>,
    okMsg: string,
  ) => {
    setSaving(true);
    try {
      await action();
      toast.success(okMsg);
      setAssignFor(null);
      await reload();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo completar');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[180] flex flex-col bg-stone-100 dark:bg-stone-950">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-stone-900 dark:text-stone-50">
            Reservas de hoy
          </h2>
          <p className="text-xs text-stone-500">
            {items.length} activas · se gestionan aquí en el TPV
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={openCreate}
            className={`inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--v-blue,#2563eb)] px-3 text-sm font-semibold text-white`}
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Nueva
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 text-stone-600 dark:border-stone-700 dark:text-stone-300"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
        {loading && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-stone-500">
            <Loader2 className="h-7 w-7 animate-spin" />
            <p className="text-sm">Cargando reservas…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-12 text-center dark:border-stone-700 dark:bg-stone-900">
            <p className="text-sm font-medium text-stone-800 dark:text-stone-100">
              No hay reservas activas hoy
            </p>
            <p className="mt-1 text-xs text-stone-500">
              Crea una desde el TPV sin salir del plano.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Nueva reserva
            </button>
          </div>
        ) : (
          <ul className="mx-auto max-w-2xl space-y-2">
            {items.map((reservation) => {
              const statusCfg = STATUS_CFG[reservation.status] || STATUS_CFG.pending;
              const minutes = reservationMinutesUntil(reservation);
              const canSeat =
                Boolean(reservation.tableId)
                && ACTIVE_STATUSES.includes(reservation.status);
              const seating = seatingId === reservation._id;
              const mesa = formatReservationSeatPlace(reservation);

              return (
                <li
                  key={reservation._id}
                  className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm dark:border-stone-700 dark:bg-stone-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-base font-bold tabular-nums text-stone-900 dark:text-stone-50">
                          {(reservation.time || '').slice(0, 5) || '--:--'}
                        </span>
                        <span className="truncate text-sm font-semibold text-stone-800 dark:text-stone-100">
                          {reservation.guestName || 'Cliente'}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusCfg.bg} ${statusCfg.text}`}
                        >
                          {statusCfg.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-stone-700 dark:text-stone-300">
                        → {mesa}
                        <Users className="mx-1 inline h-3 w-3 -mt-px font-normal text-stone-400" />
                        <span className="font-normal text-stone-500">
                          {reservation.partySize || '2'} pers.
                        </span>
                        {reservation.phone ? (
                          <span className="font-normal text-stone-500"> · {reservation.phone}</span>
                        ) : null}
                        {minutes <= 0 && ACTIVE_STATUSES.includes(reservation.status) ? (
                          <span className="ml-1 font-semibold text-rose-600">· Ahora</span>
                        ) : minutes > 0 && minutes <= 15 ? (
                          <span className="ml-1 text-amber-700">· en {minutes} min</span>
                        ) : null}
                      </p>
                      {reservation.clientId ? (
                        <Link
                          to={`/saas/crm/clientes/${encodeURIComponent(reservation.clientId)}`}
                          className="mt-1 inline-flex text-[11px] font-semibold text-violet-700 dark:text-violet-300"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Ver en CRM
                        </Link>
                      ) : null}
                      {reservation.notes ? (
                        <p className="mt-1 line-clamp-2 text-[11px] text-stone-400">
                          {reservation.notes}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {canSeat ? (
                      <button
                        type="button"
                        disabled={saving || seating}
                        onClick={() => {
                          onSeat(reservation);
                          onClose();
                        }}
                        className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-[var(--v-blue,#2563eb)] px-3 text-xs font-semibold text-white disabled:opacity-50 sm:flex-none"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        {seating ? '…' : `Sentar · ${mesa}`}
                      </button>
                    ) : null}
                    {!reservation.tableId && ACTIVE_STATUSES.includes(reservation.status) ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setAssignFor(reservation);
                          setAssignIds(reservationTableIds(reservation));
                        }}
                        className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-semibold text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
                      >
                        <Armchair className="h-3.5 w-3.5" />
                        Mesa
                      </button>
                    ) : null}
                    {reservation.status === 'pending' ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void runAction(
                            () => confirmReservation(userId, reservation, actor),
                            'Reserva confirmada',
                          )
                        }
                        className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-stone-200 px-3 text-xs font-semibold text-stone-700 dark:border-stone-700 dark:text-stone-200"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Confirmar
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => openEdit(reservation)}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-stone-200 px-3 text-xs font-semibold text-stone-700 dark:border-stone-700 dark:text-stone-200"
                    >
                      Editar
                    </button>
                    {ACTIVE_STATUSES.includes(reservation.status) ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          if (!window.confirm('¿Cancelar esta reserva?')) return;
                          void runAction(
                            () => cancelReservation(userId, reservation, actor),
                            'Reserva cancelada',
                          );
                        }}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:text-rose-300"
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {formOpen
        ? createPortal(
            <div className="fixed inset-0 z-[190] flex items-end justify-center bg-black/50 p-3 sm:items-center">
              <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white p-4 shadow-xl dark:border-stone-700 dark:bg-stone-900 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-stone-900 dark:text-stone-50">
                    {editing ? 'Editar reserva' : 'Nueva reserva'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setFormOpen(false);
                      setEditing(null);
                    }}
                    className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="space-y-2.5">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-stone-500">
                      Cliente CRM
                    </label>
                    {selectedClient || form.clientId ? (
                      <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-violet-200 bg-violet-50 p-3 dark:border-violet-800 dark:bg-violet-950/30">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                            {selectedClient?.name || form.guestName}
                          </p>
                          <p className="text-xs text-stone-500">
                            Vinculado al CRM de clientes
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
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                          <input
                            value={clientLookup}
                            onChange={(e) => {
                              setClientLookup(e.target.value);
                              setClientEditing(true);
                              setForm((prev) => ({ ...prev, clientId: '' }));
                              clearSelection();
                            }}
                            placeholder="Buscar por teléfono o nombre…"
                            className="w-full rounded-xl border border-stone-200 py-2.5 pl-10 pr-10 text-sm dark:border-stone-700 dark:bg-stone-950"
                            autoComplete="off"
                          />
                          {isClientSearching ? (
                            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-stone-400" />
                          ) : null}
                        </div>
                        {clientSearchError ? (
                          <p className="mt-1 text-xs text-red-500">{clientSearchError}</p>
                        ) : null}
                        {clientEditing && clientResults.length > 0 ? (
                          <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-700">
                            {clientResults.map((client) => (
                              <button
                                key={client.id}
                                type="button"
                                onClick={() => applyClient(client)}
                                className="flex w-full items-center justify-between gap-3 border-b border-stone-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                                    {client.name || client.fullName || 'Cliente'}
                                  </p>
                                  <p className="text-xs text-stone-500">
                                    {formatClientPhone(client) || client.email || '—'}
                                  </p>
                                </div>
                                <span className="shrink-0 text-xs font-bold text-violet-600">
                                  Vincular
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <p className="mt-1.5 text-[11px] text-stone-500">
                          Si no existe, se crea al guardar (teléfono mín. 9 dígitos).
                        </p>
                      </>
                    )}
                  </div>
                  <input
                    value={form.guestName}
                    onChange={(e) => {
                      setClientEditing(true);
                      clearSelection();
                      setForm((p) => ({ ...p, guestName: e.target.value, clientId: '' }));
                    }}
                    placeholder="Nombre *"
                    className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-950"
                    autoFocus
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={form.phone}
                      onChange={(e) => {
                        setClientEditing(true);
                        clearSelection();
                        setForm((p) => ({ ...p, phone: e.target.value, clientId: '' }));
                      }}
                      placeholder="Teléfono (CRM)"
                      inputMode="tel"
                      className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-950"
                    />
                    <input
                      value={form.partySize}
                      onChange={(e) => setForm((p) => ({ ...p, partySize: e.target.value }))}
                      placeholder="Personas"
                      type="number"
                      min={1}
                      className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-950"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="mb-1 flex flex-wrap gap-1">
                        {[
                          { label: 'Hoy', value: today },
                          { label: 'Mañana', value: tomorrow },
                        ].map((chip) => (
                          <button
                            key={chip.value}
                            type="button"
                            onClick={() => setForm((p) => ({ ...p, date: chip.value }))}
                            className={`min-h-9 touch-manipulation rounded-lg px-2 text-xs font-semibold ${
                              form.date === chip.value
                                ? 'bg-violet-600 text-white'
                                : 'border border-stone-200 text-stone-700 dark:border-stone-700 dark:text-stone-300'
                            }`}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                      <input
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm((p) => ({ ...p, date: e.target.value.slice(0, 10) }))}
                        className="min-h-11 w-full touch-manipulation rounded-xl border border-stone-200 px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-950"
                      />
                    </div>
                    <input
                      type="time"
                      value={form.time}
                      onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))}
                      className="min-h-11 w-full touch-manipulation self-end rounded-xl border border-stone-200 px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-950"
                    />
                  </div>
                  <div>
                    <select
                      value={form.preferredZone}
                      onChange={(e) => setForm((p) => ({ ...p, preferredZone: e.target.value }))}
                      className="mb-3 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-950"
                    >
                      <option value="">Zona (opcional)</option>
                      {zoneOptions.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                    <RestaurantReservationTablePicker
                      tables={tables}
                      selectedIds={form.tableIds || []}
                      partySize={parseInt(String(form.partySize || '2'), 10) || 2}
                      preferredZone={form.preferredZone}
                      onChange={(next) =>
                        setForm((p) => ({
                          ...p,
                          tableIds: next.tableIds,
                          tableId: next.tableId,
                          tableName: next.tableName,
                          tableNumber: next.tableNumber,
                        }))
                      }
                    />
                  </div>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Notas (alergias, silla…)"
                    rows={2}
                    className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-950"
                  />
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormOpen(false);
                      setEditing(null);
                      resetClientLookup();
                    }}
                    className={`flex-1 ${VERTIAL_BTN_SECONDARY}`}
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSave()}
                    className={`flex-1 ${VERTIAL_BTN_PRIMARY}`}
                  >
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>              </div>
            </div>,
            document.body,
          )
        : null}

      {assignFor
        ? createPortal(
            <div className="fixed inset-0 z-[190] flex items-end justify-center bg-black/50 p-3 sm:items-center">
              <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-semibold">Asignar mesas</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setAssignFor(null);
                      setAssignIds([]);
                    }}
                  >
                    <X className="h-5 w-5 text-stone-400" />
                  </button>
                </div>
                <p className="mb-3 text-xs text-stone-500">
                  {assignFor.guestName} · {assignPartySize} pers.
                </p>
                <RestaurantReservationTablePicker
                  tables={tables}
                  selectedIds={assignIds}
                  partySize={assignPartySize}
                  preferredZone={assignFor.preferredZone}
                  onChange={(next) => setAssignIds(next.tableIds)}
                />
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAssignFor(null);
                      setAssignIds([]);
                    }}
                    className={`flex-1 ${VERTIAL_BTN_SECONDARY}`}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={saving || assignIds.length === 0 || assignCovered < assignPartySize}
                    onClick={() =>
                      void runAction(
                        () =>
                          assignTables(userId, assignFor, assignIds, actor, tables, items),
                        assignIds.length > 1 ? 'Mesas asignadas' : 'Mesa asignada',
                      )
                    }
                    className={`flex-1 ${VERTIAL_BTN_PRIMARY}`}
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>,
    document.body,
  );
}
