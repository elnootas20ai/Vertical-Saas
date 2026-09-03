import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Armchair,
  Bell,
  Loader2,
  Phone,
  Plus,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import {
  changeTableStatusRequest,
  emitSalaStaffAlertRequest,
  getFloorConfigRequest,
  listDiningTablesRequest,
  type DiningTable,
} from '../../lib/salaApi';
import { SALA_ROOM_TYPE_LABELS, type SalaRoom } from '../../lib/salaStudioTypes';
import { ensureOpenDiningOrder } from '../../lib/restaurantDiningTpv';
import { tableStatusOnOpen } from '../../lib/restaurantTableStatus';
import { writeSalaTpvOpenTable } from '../../lib/salaTpvLaunch';
import {
  formatDiningTablePickerLabel,
  sortDiningTablesForPicker,
} from '../../lib/restaurantTableSelectUi';
import {
  countWaiting,
  createWaitlistEntry,
  listWaitlistForBusiness,
  removeWaitlistEntry,
  sortWaitlistQueue,
  updateWaitlistStatus,
} from '../../lib/restaurantWaitlistApi';
import {
  RestaurantTabletBottomNav,
  shouldShowRestaurantTabletNav,
} from './RestaurantTabletBottomNav';
import {
  EMPTY_WAITLIST_FORM,
  WAITLIST_STATUS_CFG,
  formatWaitMinutes,
  isActiveWaitlistStatus,
  partySizeNumber,
  type RestaurantWaitlistEntry,
  type WaitlistFormData,
} from '../../lib/restaurantWaitlistTypes';

const FALLBACK_ZONE_OPTIONS = Object.values(SALA_ROOM_TYPE_LABELS);

function normalizeBusinessId(value: string | null | undefined): string {
  return String(value || '').replace(/^business:/, '').trim();
}

export function RestaurantWaitlistPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const dataUserId = useMemo(
    () => resolveBusinessDataUserId(user, currentBusiness),
    [user, currentBusiness],
  );
  const businessId = resolveBusinessScopeId(currentBusiness) || currentBusiness?.business_id || '';
  const showTabletNav = shouldShowRestaurantTabletNav({ pathname: location.pathname });
  const actorName =
    String((user as { fullName?: string } | null)?.fullName || user?.name || user?.email || 'Sala').trim();

  const [entries, setEntries] = useState<RestaurantWaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<WaitlistFormData>(EMPTY_WAITLIST_FORM);
  const [now, setNow] = useState(() => Date.now());
  const [showDone, setShowDone] = useState(false);
  const [seatEntry, setSeatEntry] = useState<RestaurantWaitlistEntry | null>(null);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [rooms, setRooms] = useState<SalaRoom[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [seatingTableId, setSeatingTableId] = useState('');

  const load = useCallback(async () => {
    if (!dataUserId) {
      setEntries([]);
      setRooms([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [items, floorConfig] = await Promise.all([
        listWaitlistForBusiness(dataUserId, businessId),
        getFloorConfigRequest(dataUserId, businessId ? { businessId } : undefined).catch(() => null),
      ]);
      setEntries(items);
      const floorRooms = Array.isArray(floorConfig?.rooms)
        ? (floorConfig.rooms as SalaRoom[])
        : [];
      setRooms(floorRooms);
    } catch {
      setEntries([]);
      toast.error('No se pudo cargar la lista de espera');
    } finally {
      setLoading(false);
    }
  }, [dataUserId, businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const refresh = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void load();
    }, 45_000);
    return () => window.clearInterval(refresh);
  }, [load]);

  const zoneOptions = useMemo(() => {
    const fromRooms = rooms.map((r) => String(r.name || '').trim()).filter(Boolean);
    const fromTables = tables
      .map((t) => String(t.zone || '').trim())
      .filter(Boolean);
    const merged = [...new Set([...fromRooms, ...fromTables])];
    return merged.length > 0 ? merged : FALLBACK_ZONE_OPTIONS;
  }, [rooms, tables]);

  const activeQueue = useMemo(
    () => sortWaitlistQueue(entries.filter((e) => isActiveWaitlistStatus(e.status))),
    [entries],
  );
  const doneList = useMemo(
    () =>
      sortWaitlistQueue(entries.filter((e) => !isActiveWaitlistStatus(e.status))).reverse(),
    [entries],
  );
  const counts = useMemo(() => countWaiting(entries), [entries]);

  const openSeatPicker = async (entry: RestaurantWaitlistEntry) => {
    if (!dataUserId) return;
    setSeatEntry(entry);
    setTablesLoading(true);
    try {
      const listed = await listDiningTablesRequest(dataUserId);
      const scoped = (listed || []).filter((t) => {
        if (t.active === false || t.status === 'hidden') return false;
        const bid = normalizeBusinessId(t.businessId);
        return !bid || bid === normalizeBusinessId(businessId);
      });
      setTables(scoped);
    } catch {
      setTables([]);
      toast.error('No se pudieron cargar las mesas');
    } finally {
      setTablesLoading(false);
    }
  };

  const seatCandidates = useMemo(() => {
    if (!seatEntry) return [];
    const party = partySizeNumber(seatEntry.partySize);
    return sortDiningTablesForPicker(
      tables.filter((t) => {
        if (t.status !== 'available' && t.status !== 'unavailable') return false;
        const capacity = Number(t.capacity) || 0;
        return capacity <= 0 || capacity >= party;
      }),
    );
  }, [seatEntry, tables]);

  const confirmSeatAtTable = async (table: DiningTable) => {
    if (!dataUserId || !businessId || !seatEntry) return;
    const tableId = String(table._id || table.id || '').trim();
    if (!tableId) return;
    setSeatingTableId(tableId);
    setSaving(true);
    try {
      const guests = partySizeNumber(seatEntry.partySize);
      const order = await ensureOpenDiningOrder({
        userId: dataUserId,
        businessId,
        tableId,
        tableNumber: table.number,
        tableName: table.name || `Mesa ${table.number}`,
        guests,
        createdBy: dataUserId,
        createdByName: actorName,
        zone: table.zone || seatEntry.zone || '',
      });
      await changeTableStatusRequest(dataUserId, tableId, tableStatusOnOpen(table.status), {
        currentGuests: guests,
        occupiedBy: seatEntry.guestName,
      });
      const updated = await updateWaitlistStatus(dataUserId, seatEntry._id, 'seated');
      setEntries((prev) => prev.map((x) => (x._id === seatEntry._id ? { ...x, ...updated } : x)));
      writeSalaTpvOpenTable({ tableId, orderId: order._id });
      setSeatEntry(null);
      toast.success(`${seatEntry.guestName} sentado · Abriendo TPV`);
      navigate(`/saas/caja/tpv?mesa=${encodeURIComponent(tableId)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo sentar');
    } finally {
      setSeatingTableId('');
      setSaving(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dataUserId) return;
    const name = form.guestName.trim();
    if (!name) {
      toast.error('Indica el nombre');
      return;
    }
    setSaving(true);
    try {
      const created = await createWaitlistEntry(dataUserId, businessId, form);
      setEntries((prev) => [created, ...prev]);
      setForm(EMPTY_WAITLIST_FORM);
      toast.success(`${created.guestName} añadido a la espera`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo añadir');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (entry: RestaurantWaitlistEntry, status: 'notified' | 'cancelled') => {
    if (!dataUserId) return;
    try {
      const updated = await updateWaitlistStatus(dataUserId, entry._id, status);
      setEntries((prev) => prev.map((x) => (x._id === entry._id ? { ...x, ...updated } : x)));
      toast.success(status === 'notified' ? `${entry.guestName} avisado` : `${entry.guestName} cancelado`);
      if (status === 'notified') {
        void emitSalaStaffAlertRequest(dataUserId, {
          title: 'Lista de espera',
          message: `${entry.guestName}${partySizeNumber(entry.partySize) ? ` · ${partySizeNumber(entry.partySize)}p` : ''} avisado`,
          category: 'sala_waitlist_notified',
          route: '/saas/lista-espera',
          entityId: entry._id,
          entityType: 'waitlist',
          businessId,
          dedupKey: `sala_waitlist_notified-${entry._id}`,
        }).catch(() => {
          /* alerta best-effort */
        });
      }
    } catch {
      toast.error('No se pudo actualizar');
    }
  };

  const onRemove = async (entry: RestaurantWaitlistEntry) => {
    if (!dataUserId) return;
    try {
      await removeWaitlistEntry(dataUserId, entry._id);
      setEntries((prev) => prev.filter((x) => x._id !== entry._id));
      toast.success('Eliminado de la lista');
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  return (
    <Layout title="Lista de espera" subtitle="Cola en vivo · sentar abre el TPV de la mesa">
      <div className={`mx-auto max-w-3xl space-y-5 p-4 sm:p-6 ${showTabletNav ? 'pb-20' : ''}`}>
        <div className="rounded-2xl border border-stone-200 bg-stone-900 px-5 py-5 text-stone-50 dark:border-stone-700 dark:bg-stone-950">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Esperando ahora</p>
          <div className="mt-2 flex flex-wrap items-end gap-6">
            <div>
              <p className="text-4xl font-semibold tabular-nums sm:text-5xl">{counts.parties}</p>
              <p className="mt-1 text-sm text-stone-400">
                {counts.parties === 1 ? 'grupo' : 'grupos'}
              </p>
            </div>
            <div className="pb-1">
              <p className="text-2xl font-semibold tabular-nums text-amber-300">{counts.guests}</p>
              <p className="mt-0.5 text-sm text-stone-400">
                {counts.guests === 1 ? 'persona' : 'personas'}
              </p>
            </div>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-50">Añadir a la espera</h2>
            <span className="text-xs text-stone-500">Nombre obligatorio</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">Nombre</span>
              <input
                value={form.guestName}
                onChange={(e) => setForm((p) => ({ ...p, guestName: e.target.value }))}
                placeholder="Ej. María López"
                autoComplete="name"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">Personas</span>
              <input
                type="number"
                min={1}
                max={40}
                value={form.partySize}
                onChange={(e) => setForm((p) => ({ ...p, partySize: e.target.value }))}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">Teléfono</span>
              <input
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="Opcional"
                inputMode="tel"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">Espera est. (min)</span>
              <input
                type="number"
                min={0}
                max={240}
                value={form.estimatedWait}
                onChange={(e) => setForm((p) => ({ ...p, estimatedWait: e.target.value }))}
                placeholder="Opcional"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">Zona preferida</span>
              <select
                value={form.zone}
                onChange={(e) => setForm((p) => ({ ...p, zone: e.target.value }))}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-50"
              >
                <option value="">Sin preferencia</option>
                {zoneOptions.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">Notas</span>
              <input
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Silla bebé, alergias…"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-50"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving || !dataUserId}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 sm:w-auto"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Añadir a la cola
          </button>
        </form>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-50">Cola</h2>
            {loading && (
              <span className="inline-flex items-center gap-1 text-xs text-stone-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Actualizando
              </span>
            )}
          </div>

          {!loading && activeQueue.length === 0 && (
            <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-10 text-center dark:border-stone-600">
              <Users className="mx-auto h-8 w-8 text-stone-400" />
              <p className="mt-2 text-sm font-medium text-stone-700 dark:text-stone-300">Nadie esperando</p>
              <p className="mt-1 text-xs text-stone-500">Añade el primer nombre arriba.</p>
            </div>
          )}

          <ul className="space-y-2">
            {activeQueue.map((entry, index) => {
              const cfg = WAITLIST_STATUS_CFG[entry.status] || WAITLIST_STATUS_CFG.waiting;
              const guests = partySizeNumber(entry.partySize);
              return (
                <li
                  key={entry._id}
                  className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-sm font-semibold tabular-nums text-stone-800 dark:bg-stone-800 dark:text-stone-100">
                      #{index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-base font-semibold text-stone-900 dark:text-stone-50">
                          {entry.guestName}
                        </p>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {guests} {guests === 1 ? 'pers.' : 'pers.'}
                        </span>
                        <span>Lleva {formatWaitMinutes(entry.createdAt, now)}</span>
                        {entry.estimatedWait ? <span>Est. {entry.estimatedWait} min</span> : null}
                        {entry.zone ? <span>{entry.zone}</span> : null}
                        {entry.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {entry.phone}
                          </span>
                        ) : null}
                      </div>
                      {entry.notes ? (
                        <p className="mt-1.5 text-xs text-stone-600 dark:text-stone-400">{entry.notes}</p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {entry.status === 'waiting' && (
                          <button
                            type="button"
                            onClick={() => void setStatus(entry, 'notified')}
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
                          >
                            <Bell className="h-3.5 w-3.5" />
                            Avisar
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void openSeatPicker(entry)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Sentar en mesa
                        </button>
                        <button
                          type="button"
                          onClick={() => void setStatus(entry, 'cancelled')}
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
                        >
                          <X className="h-3.5 w-3.5" />
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => void onRemove(entry)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {doneList.length > 0 && (
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
            >
              {showDone ? 'Ocultar' : 'Ver'} recientes ({doneList.length})
            </button>
            {showDone && (
              <ul className="space-y-1.5">
                {doneList.slice(0, 12).map((entry) => {
                  const cfg = WAITLIST_STATUS_CFG[entry.status] || WAITLIST_STATUS_CFG.cancelled;
                  return (
                    <li
                      key={entry._id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-stone-100 px-3 py-2 text-sm dark:border-stone-800"
                    >
                      <span className="truncate text-stone-700 dark:text-stone-300">{entry.guestName}</span>
                      <span className={`shrink-0 text-xs ${cfg.text}`}>{cfg.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>

      {seatEntry
        && createPortal(
          <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-3 sm:items-center">
            <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900 sm:p-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-stone-900 dark:text-stone-50">
                    Sentar · {seatEntry.guestName}
                  </h3>
                  <p className="text-xs text-stone-500">
                    {partySizeNumber(seatEntry.partySize)} pers. · elige mesa libre y abre TPV
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSeatEntry(null)}
                  className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {tablesLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-stone-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Cargando mesas…</span>
                </div>
              ) : seatCandidates.length === 0 ? (
                <p className="py-6 text-center text-sm text-stone-500">
                  No hay mesas libres compatibles ahora.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {seatCandidates.map((t) => {
                    const tid = String(t._id || t.id || '');
                    const busy = seatingTableId === tid;
                    return (
                      <button
                        key={tid}
                        type="button"
                        disabled={saving || busy}
                        onClick={() => void confirmSeatAtTable(t)}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-stone-200 px-3 py-2.5 text-left text-sm hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:hover:bg-stone-800"
                      >
                        <span className="inline-flex items-center gap-2 font-semibold text-stone-900 dark:text-stone-50">
                          <Armchair className="h-4 w-4 text-emerald-600" />
                          {formatDiningTablePickerLabel(t)}
                        </span>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin text-stone-400" /> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
      {showTabletNav ? (
        <div className="fixed inset-x-0 bottom-0 z-40">
          <RestaurantTabletBottomNav active="espera" />
        </div>
      ) : null}
    </Layout>
  );
}
