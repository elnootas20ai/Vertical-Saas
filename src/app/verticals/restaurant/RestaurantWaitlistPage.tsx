import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
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
import {
  countWaiting,
  createWaitlistEntry,
  listWaitlistForBusiness,
  removeWaitlistEntry,
  sortWaitlistQueue,
  updateWaitlistStatus,
} from '../../lib/restaurantWaitlistApi';
import {
  EMPTY_WAITLIST_FORM,
  WAITLIST_STATUS_CFG,
  formatWaitMinutes,
  isActiveWaitlistStatus,
  partySizeNumber,
  type RestaurantWaitlistEntry,
  type WaitlistFormData,
} from '../../lib/restaurantWaitlistTypes';

export function RestaurantWaitlistPage() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const dataUserId = useMemo(
    () => resolveBusinessDataUserId(user, currentBusiness),
    [user, currentBusiness],
  );
  const businessId = currentBusiness?.business_id || '';

  const [entries, setEntries] = useState<RestaurantWaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<WaitlistFormData>(EMPTY_WAITLIST_FORM);
  const [now, setNow] = useState(() => Date.now());
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    if (!dataUserId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const items = await listWaitlistForBusiness(dataUserId, businessId);
      setEntries(items);
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
      void load();
    }, 45_000);
    return () => window.clearInterval(refresh);
  }, [load]);

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

  const setStatus = async (entry: RestaurantWaitlistEntry, status: 'notified' | 'seated' | 'cancelled') => {
    if (!dataUserId) return;
    try {
      const updated = await updateWaitlistStatus(dataUserId, entry._id, status);
      setEntries((prev) => prev.map((x) => (x._id === entry._id ? { ...x, ...updated } : x)));
      const msg =
        status === 'notified'
          ? `${entry.guestName} avisado`
          : status === 'seated'
            ? `${entry.guestName} sentado`
            : `${entry.guestName} cancelado`;
      toast.success(msg);
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
    <Layout title="Lista de espera" subtitle="Cola en vivo del local">
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        {/* Contador */}
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

        {/* Alta rápida */}
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
              <input
                value={form.zone}
                onChange={(e) => setForm((p) => ({ ...p, zone: e.target.value }))}
                placeholder="Terraza, barra…"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-50"
              />
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

        {/* Cola */}
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
                          onClick={() => void setStatus(entry, 'seated')}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Sentar
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

        {/* Historial reciente */}
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
    </Layout>
  );
}
