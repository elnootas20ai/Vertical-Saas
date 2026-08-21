/**
 * Mando Día D — táctil: timeline, mercancía, equipo, transporte, TPV.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Check,
  ChevronRight,
  Clock,
  Copy,
  Loader2,
  Monitor,
  Package,
  Plus,
  Trash2,
  Truck,
  Users,
} from 'lucide-react';
import type { EventRecord, EventRouteStockLine } from '../../../lib/eventsTypes';
import type { CatalogItem } from '../../../lib/deliveryApi';
import {
  CARGO_STATUS_LABEL,
  DAY_CREW_ROLES,
  DAY_PHASE_META,
  dayOpsProgress,
  hydrateDayOpsFromEvent,
  nextCargoStatus,
  type DayCargoStatus,
  type DayCrewMember,
  type EventDayOps,
} from '../../../lib/eventsDayOps';
import { saveEventDayOps, saveEventRouteExtraStock } from '../../../lib/eventsFlow';
import { AUTH_PATHS } from '../../../lib/authEntryPaths';
import {
  VERTIAL_BTN_DANGER,
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_FOCUS_RING,
} from '../../../lib/vertialUiTokens';

const inputClass =
  `w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 ${VERTIAL_FOCUS_RING}`;

type Props = {
  event: EventRecord;
  userId: string;
  catalogProducts: CatalogItem[];
  onEventUpdated: (event: EventRecord) => void;
};

function cargoTone(status: DayCargoStatus): string {
  if (status === 'sitio') return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200';
  if (status === 'furgon') return 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200';
  if (status === 'cogido') return 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200';
  return 'border-stone-200 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200';
}

export function EventsDayOpsPanel({ event, userId, catalogProducts, onEventUpdated }: Props) {
  const [ops, setOps] = useState<EventDayOps>(() => hydrateDayOpsFromEvent(event));
  const [saving, setSaving] = useState(false);
  const [pickProductId, setPickProductId] = useState(catalogProducts[0]?._id || '');
  const [pickQty, setPickQty] = useState(1);
  const [freeName, setFreeName] = useState('');

  useEffect(() => {
    setOps(hydrateDayOpsFromEvent(event));
  }, [event._id, event.dayOps, event.lineasPresupuesto, event.routeExtraStock, event.planningChecklist]);

  const progress = useMemo(() => dayOpsProgress(ops), [ops]);
  const tpvCode = String(event.portableTerminalCode || '').trim().toUpperCase();
  const driver = ops.crew.find((c) => c.isDriver) || null;

  const patchOps = (next: EventDayOps) => setOps(next);

  const togglePhase = (phaseId: string) => {
    patchOps({
      ...ops,
      phases: ops.phases.map((p) => {
        if (p.id !== phaseId) return p;
        const done = !p.done;
        return {
          ...p,
          done,
          doneAt: done ? new Date().toISOString() : undefined,
        };
      }),
    });
  };

  const setPhaseTime = (phaseId: string, plannedTime: string) => {
    patchOps({
      ...ops,
      phases: ops.phases.map((p) => (p.id === phaseId ? { ...p, plannedTime } : p)),
    });
  };

  const advanceCargo = (id: string) => {
    patchOps({
      ...ops,
      cargo: ops.cargo.map((c) =>
        c.id === id ? { ...c, status: nextCargoStatus(c.status) } : c,
      ),
    });
  };

  const setCargoQty = (id: string, qty: number) => {
    patchOps({
      ...ops,
      cargo: ops.cargo.map((c) =>
        c.id === id ? { ...c, qty: Math.max(1, Math.floor(qty || 1)) } : c,
      ),
    });
  };

  const removeExtraCargo = (id: string) => {
    patchOps({
      ...ops,
      cargo: ops.cargo.filter((c) => !(c.id === id && c.source === 'extra')),
    });
  };

  const patchCrew = (id: string, patch: Partial<DayCrewMember>) => {
    let crew = ops.crew.map((c) => (c.id === id ? { ...c, ...patch } : c));
    if (patch.isDriver) {
      crew = crew.map((c) => ({ ...c, isDriver: c.id === id }));
    }
    patchOps({ ...ops, crew });
  };

  const addExtraFromCatalog = () => {
    const product = catalogProducts.find((p) => p._id === pickProductId);
    if (!product) {
      toast.error('Elige un producto');
      return;
    }
    const qty = Math.max(1, Math.floor(pickQty || 1));
    const id = `extra-${product._id}`;
    const existing = ops.cargo.find((c) => c.id === id);
    if (existing) {
      patchOps({
        ...ops,
        cargo: ops.cargo.map((c) => (c.id === id ? { ...c, qty: c.qty + qty } : c)),
      });
    } else {
      patchOps({
        ...ops,
        cargo: [
          ...ops.cargo,
          {
            id,
            name: product.name,
            qty,
            catalogItemId: product._id,
            source: 'extra',
            status: 'pendiente',
          },
        ],
      });
    }
    setPickQty(1);
  };

  const addFreeExtra = () => {
    const name = freeName.trim();
    if (!name) {
      toast.error('Escribe qué llevas');
      return;
    }
    const qty = Math.max(1, Math.floor(pickQty || 1));
    patchOps({
      ...ops,
      cargo: [
        ...ops.cargo,
        {
          id: `extra-free-${Date.now()}`,
          name,
          qty,
          source: 'extra',
          status: 'pendiente',
        },
      ],
    });
    setFreeName('');
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const extras: EventRouteStockLine[] = ops.cargo
        .filter((c) => c.source === 'extra')
        .map((c) => ({
          id: c.id.replace(/^extra-/, ''),
          name: c.name,
          qty: c.qty,
          catalogItemId: c.catalogItemId,
          unit: 'ud',
        }));

      let next = await saveEventRouteExtraStock(userId, event, extras);
      const statusById = new Map(ops.cargo.map((c) => [c.id, c.status]));
      const merged: EventDayOps = {
        phases: ops.phases,
        crew: ops.crew,
        transport: ops.transport,
        brief: ops.brief,
        cargo: hydrateDayOpsFromEvent({ ...next, dayOps: undefined }).cargo.map((line) => ({
          ...line,
          status: statusById.get(line.id) || line.status,
        })),
      };
      next = await saveEventDayOps(userId, { ...next, dayOps: undefined }, merged);
      setOps(hydrateDayOpsFromEvent(next));
      onEventUpdated(next);
      toast.success('Día D guardado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const copyTpv = async () => {
    if (!tpvCode) return;
    try {
      await navigator.clipboard.writeText(tpvCode);
      toast.success('Código TPV copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  return (
    <div className="space-y-5 pt-3">
      {/* Progreso */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-950">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Progreso del día</p>
          <span className="text-lg font-bold tabular-nums text-[#2563EB]">{progress.pct}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#2563EB] transition-all duration-300"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-stone-500 flex flex-wrap gap-x-3 gap-y-0.5">
          <span>Fases {progress.phasesDone}/{progress.phasesTotal}</span>
          <span>Carga {progress.cargoDone}/{progress.cargoTotal}</span>
          <span>Equipo {progress.crewDone}/{progress.crewTotal}</span>
        </p>
      </div>

      {/* Timeline */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#2563EB]" />
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Timeline del día</h3>
        </div>
        <ol className="space-y-2">
          {ops.phases.map((phase, idx) => {
            const meta = DAY_PHASE_META.find((m) => m.id === phase.id);
            return (
              <li
                key={phase.id}
                className={[
                  'flex items-center gap-2 rounded-2xl border px-3 py-2.5 min-h-14',
                  phase.done
                    ? 'border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/25'
                    : 'border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-950',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => togglePhase(phase.id)}
                  className={[
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-sm font-bold tabular-nums transition-colors',
                    phase.done
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-stone-200 bg-stone-50 text-stone-500 dark:border-stone-600 dark:bg-stone-900',
                  ].join(' ')}
                  aria-label={phase.done ? 'Marcar pendiente' : 'Marcar hecho'}
                >
                  {phase.done ? <Check className="w-5 h-5" strokeWidth={2.5} /> : idx + 1}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">{meta?.label}</p>
                  <p className="text-[11px] text-stone-500">{meta?.hint}</p>
                </div>
                <input
                  type="time"
                  className="w-[7.5rem] rounded-xl border border-stone-200 bg-white px-2 py-2 text-sm tabular-nums dark:border-stone-600 dark:bg-stone-900"
                  value={phase.plannedTime}
                  onChange={(e) => setPhaseTime(phase.id, e.target.value)}
                  aria-label={`Hora ${meta?.label}`}
                />
              </li>
            );
          })}
        </ol>
      </section>

      {/* Transporte */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-[#2563EB]" />
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Quién lleva</h3>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-3 space-y-3 dark:border-stone-700 dark:bg-stone-950">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-stone-500">Vehículo</span>
              <input
                className={inputClass}
                placeholder="Furgón, furgoneta…"
                value={ops.transport.vehicleLabel}
                onChange={(e) =>
                  patchOps({
                    ...ops,
                    transport: { ...ops.transport, vehicleLabel: e.target.value },
                  })
                }
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-stone-500">Matrícula</span>
              <input
                className={inputClass}
                placeholder="1234 ABC"
                value={ops.transport.plate}
                onChange={(e) =>
                  patchOps({
                    ...ops,
                    transport: { ...ops.transport, plate: e.target.value },
                  })
                }
              />
            </label>
          </div>
          <p className="text-xs text-stone-500">
            Conductor:{' '}
            <span className="font-semibold text-stone-800 dark:text-stone-200">
              {driver?.name || 'Marca a alguien como conductor en el equipo'}
            </span>
          </p>
          <textarea
            className={`${inputClass} min-h-[4rem] resize-y`}
            placeholder="Notas de transporte (llaves, parking, carga especial…)"
            value={ops.transport.notes}
            onChange={(e) =>
              patchOps({
                ...ops,
                transport: { ...ops.transport, notes: e.target.value },
              })
            }
          />
        </div>
      </section>

      {/* Equipo */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#2563EB]" />
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Equipo y horas</h3>
        </div>
        {ops.crew.length === 0 ? (
          <p className="text-xs text-stone-500 rounded-xl border border-dashed border-stone-200 px-3 py-4 dark:border-stone-700">
            Aún no hay trabajadores en planificación. Asígnalos en el evento o en Horarios.
          </p>
        ) : (
          <ul className="space-y-2">
            {ops.crew.map((member) => (
              <li
                key={member.id}
                className={[
                  'rounded-2xl border px-3 py-2.5 space-y-2',
                  member.checkedIn
                    ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/20'
                    : 'border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-950',
                ].join(' ')}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => patchCrew(member.id, { checkedIn: !member.checkedIn })}
                    className={[
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
                      member.checkedIn
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-stone-200 bg-stone-50 text-stone-400 dark:border-stone-600 dark:bg-stone-900',
                    ].join(' ')}
                    aria-label="Check entrada"
                  >
                    <Check className="w-5 h-5" strokeWidth={2.5} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                      {member.name}
                    </p>
                    {member.isDriver && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[#2563EB]">
                        Conductor
                      </span>
                    )}
                  </div>
                  <input
                    type="time"
                    className="w-[7.5rem] rounded-xl border border-stone-200 bg-white px-2 py-2 text-sm tabular-nums dark:border-stone-600 dark:bg-stone-900"
                    value={member.arriveTime}
                    onChange={(e) => patchCrew(member.id, { arriveTime: e.target.value })}
                    aria-label={`Hora de ${member.name}`}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    className="flex-1 min-w-[8rem] rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-xs dark:border-stone-600 dark:bg-stone-900"
                    value={member.role}
                    onChange={(e) => {
                      const role = e.target.value;
                      patchCrew(member.id, {
                        role,
                        ...(role === 'Conductor' ? { isDriver: true } : {}),
                      });
                    }}
                  >
                    {DAY_CREW_ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => patchCrew(member.id, { isDriver: true, role: 'Conductor' })}
                    className={[
                      'rounded-xl border px-3 py-2 text-xs font-semibold min-h-11',
                      member.isDriver
                        ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]'
                        : 'border-stone-200 text-stone-600 dark:border-stone-600',
                    ].join(' ')}
                  >
                    Lleva él/ella
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Mercancía */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-[#2563EB]" />
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Mercancía</h3>
        </div>
        <p className="text-[11px] text-stone-500">
          Toca cada línea para avanzar: Pendiente → Cogido → En furgón → En sitio.
        </p>
        {ops.cargo.length === 0 ? (
          <p className="text-xs text-stone-500 rounded-xl border border-dashed border-stone-200 px-3 py-4 dark:border-stone-700">
            Sin productos en presupuesto ni extras. Añade carga abajo.
          </p>
        ) : (
          <ul className="space-y-2">
            {ops.cargo.map((line) => (
              <li
                key={line.id}
                className={`flex items-center gap-2 rounded-2xl border px-2.5 py-2 min-h-14 ${cargoTone(line.status)}`}
              >
                <button
                  type="button"
                  onClick={() => advanceCargo(line.id)}
                  className="flex-1 min-w-0 text-left flex items-center gap-2 py-1"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">{line.name}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">
                      {line.source === 'extra' ? 'Extra' : 'Pedido'} · {CARGO_STATUS_LABEL[line.status]}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />
                </button>
                <input
                  type="number"
                  min={1}
                  className="w-16 rounded-xl border border-current/20 bg-white/70 px-2 py-2 text-xs tabular-nums dark:bg-black/20"
                  value={line.qty}
                  onChange={(e) => setCargoQty(line.id, Number(e.target.value))}
                />
                {line.source === 'extra' ? (
                  <button
                    type="button"
                    className={`${VERTIAL_BTN_DANGER} !px-2 !py-2`}
                    onClick={() => removeExtraCargo(line.id)}
                    aria-label="Quitar extra"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {catalogProducts.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            <select
              className="flex-1 min-w-[10rem] rounded-xl border border-stone-200 bg-white px-2.5 py-2.5 text-xs dark:border-stone-700 dark:bg-stone-950"
              value={pickProductId || catalogProducts[0]?._id || ''}
              onChange={(e) => setPickProductId(e.target.value)}
            >
              {catalogProducts.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              className="w-16 rounded-xl border border-stone-200 bg-white px-2 py-2.5 text-xs tabular-nums dark:border-stone-700 dark:bg-stone-950"
              value={pickQty}
              onChange={(e) => setPickQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            />
            <button type="button" onClick={addExtraFromCatalog} className={VERTIAL_BTN_SECONDARY}>
              <Plus className="w-3.5 h-3.5" />
              Extra carta
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            className="flex-1 min-w-[10rem] rounded-xl border border-stone-200 bg-white px-2.5 py-2.5 text-xs dark:border-stone-700 dark:bg-stone-950"
            placeholder="Otra cosa a llevar…"
            value={freeName}
            onChange={(e) => setFreeName(e.target.value)}
          />
          <button type="button" onClick={addFreeExtra} className={VERTIAL_BTN_SECONDARY}>
            <Plus className="w-3.5 h-3.5" />
            Libre
          </button>
        </div>
      </section>

      {/* TPV + brief */}
      <section className="space-y-2">
        {tpvCode ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/25 space-y-2">
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-[#2563EB]" />
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Código TPV</p>
            </div>
            <p className="text-3xl font-bold tracking-[0.2em] tabular-nums text-[#2563EB]">{tpvCode}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void copyTpv()} className={VERTIAL_BTN_SECONDARY}>
                <Copy className="w-3.5 h-3.5" />
                Copiar
              </button>
              <button
                type="button"
                className={VERTIAL_BTN_SECONDARY}
                onClick={() =>
                  window.open(
                    `${AUTH_PATHS.tpvTabletLogin}?code=${encodeURIComponent(tpvCode)}`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
              >
                Login tablet
              </button>
            </div>
          </div>
        ) : null}

        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-stone-500">Brief del día</span>
          <textarea
            className={`${inputClass} min-h-[5rem] resize-y`}
            placeholder="Contacto in situ, parking, acceso, horarios especiales…"
            value={ops.brief}
            onChange={(e) => patchOps({ ...ops, brief: e.target.value })}
          />
        </label>
      </section>

      <button
        type="button"
        disabled={saving}
        onClick={() => void saveAll()}
        className={`${VERTIAL_BTN_PRIMARY} w-full min-h-12 text-base`}
      >
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
        Guardar Día D
      </button>
    </div>
  );
}
