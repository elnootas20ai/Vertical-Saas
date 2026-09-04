/**
 * Popup del Centro de eventos: elige un evento fijo y planifica
 * productos (qty), día y quién trabaja.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Monitor, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useModalClose } from '../../../hooks/useModalClose';
import { filterWorkCentersForBusinessScope } from '../../../lib/deliverySetup';
import { hasEventsFixedOpsDraft } from '../../../lib/eventsFixedDayPlan';
import {
  listSalesPoints,
  type EventsPdvKind,
  type WorkCenter,
} from '../../../lib/workCentersApi';
import { EventsFixedPdvLoadModal } from './EventsFixedPdvLoadModal';
import { EventsFixedPdvsOpsPanel } from './EventsFixedPdvsOpsPanel';
import { VERTIAL_SURFACE } from '../../../lib/vertialUiTokens';

type FixedRow = {
  wc: WorkCenter;
  kind: EventsPdvKind;
  loadCount: number;
};

type Props = {
  open: boolean;
  userId: string;
  businessId?: string;
  business: {
    business_id?: string;
    id?: string;
    name?: string;
    owner_user_id?: string;
    members?: { user_id: string; fullName?: string; email?: string; role?: string }[];
  } | null;
  accountBusinessCount?: number;
  tpvPath: string;
  /** Si viene, preselecciona ese evento fijo al abrir. */
  initialWorkCenterId?: string | null;
  onClose: () => void;
};

export function EventsFixedPdvsHubModal({
  open,
  userId,
  businessId,
  business,
  accountBusinessCount,
  initialWorkCenterId,
  onClose,
}: Props) {
  useModalClose(open, onClose);
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FixedRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadEdit, setLoadEdit] = useState<{ workCenterId: string; name: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const sps = await listSalesPoints(userId);
      const scopedWcs = filterWorkCentersForBusinessScope(sps, businessId, {
        accountBusinessCount,
        includeTemporaryEventPdvs: true,
      }).filter(
        (sp) =>
          sp.active !== false
          && sp.centerType === 'punto_de_venta'
          && sp.eventsPdvKind !== 'temporary',
      );

      setRows(
        scopedWcs
          .map((wc) => {
            const loadCount = Array.isArray(wc.eventsTpvLoad) ? wc.eventsTpvLoad.length : 0;
            return {
              wc,
              kind: 'fixed' as const,
              loadCount,
            };
          })
          .sort((a, b) => a.wc.name.localeCompare(b.wc.name, 'es')),
      );
    } catch {
      toast.error('No se pudieron cargar los eventos fijos');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [accountBusinessCount, businessId, userId]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      return;
    }
    const preferred = String(initialWorkCenterId || '').trim();
    if (preferred) setSelectedId(preferred);
  }, [open, initialWorkCenterId]);

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedId(null);
      return;
    }
    const draftRow = rows.find((r) => hasEventsFixedOpsDraft(r.wc));
    setSelectedId((prev) => {
      if (draftRow) return draftRow.wc._id;
      if (prev && rows.some((r) => r.wc._id === prev || r.wc.id === prev)) {
        const hit = rows.find((r) => r.wc._id === prev || r.wc.id === prev);
        return hit?.wc._id || prev;
      }
      return rows[0].wc._id;
    });
  }, [rows]);

  if (!open) return null;

  const selected = rows.find((r) => r.wc._id === selectedId) || null;
  const draftLock = rows.find((r) => hasEventsFixedOpsDraft(r.wc)) || null;
  const lockedToId = draftLock?.wc._id || null;
  const lockedName = String(draftLock?.wc.name || 'otro evento').trim() || 'otro evento';

  const trySelect = (id: string) => {
    if (lockedToId && id !== lockedToId) {
      toast.error(`Estás planificando «${lockedName}». Termina esa secuencia (Guardar al final) antes de abrir otro.`);
      return;
    }
    setSelectedId(id);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="events-fixed-hub-title"
          className={`${VERTIAL_SURFACE} w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-xl`}
        >
          <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-stone-100 dark:border-stone-800 shrink-0">
            <div className="min-w-0">
              <h2 id="events-fixed-hub-title" className="text-base font-bold text-stone-900 dark:text-stone-100">
                Eventos fijos
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Cada evento por pasos: día, horario, productos, ruta y equipo. Uno a la vez.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 shrink-0"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {rows.length > 0 ? (
            <div className="shrink-0 px-4 pt-3 pb-2 border-b border-stone-100 dark:border-stone-800 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                Eventos · uno a la vez
              </p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Evento fijo">
                {rows.map((row) => {
                  const active = selectedId === row.wc._id;
                  const isDraft = hasEventsFixedOpsDraft(row.wc);
                  const blocked = Boolean(lockedToId && row.wc._id !== lockedToId);
                  return (
                    <button
                      key={row.wc._id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-disabled={blocked}
                      disabled={blocked}
                      onClick={() => trySelect(row.wc._id)}
                      className={`min-h-11 max-w-full px-3 py-2 rounded-xl border-2 text-left transition-colors ${
                        blocked
                          ? 'border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/40 opacity-50 cursor-not-allowed'
                          : active
                            ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 dark:bg-blue-950/40'
                            : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 hover:border-blue-300'
                      }`}
                    >
                      <span
                        className={`block text-sm font-bold truncate ${
                          active
                            ? 'text-[var(--v-blue,#2563eb)]'
                            : 'text-stone-800 dark:text-stone-100'
                        }`}
                      >
                        {row.wc.name || 'Sin nombre'}
                      </span>
                      <span className="block text-[10px] text-stone-500 mt-0.5 truncate">
                        {(() => {
                          if (isDraft) return 'Borrador · secuencia a medias';
                          if (blocked) return `Bloqueado · acaba «${lockedName}»`;
                          const planCount = Array.isArray(row.wc.eventsFixedDayPlans)
                            ? row.wc.eventsFixedDayPlans.length
                            : 0;
                          const parts: string[] = [];
                          if (row.loadCount > 0) {
                            parts.push(`${row.loadCount} producto${row.loadCount === 1 ? '' : 's'}`);
                          } else {
                            parts.push('Sin productos');
                          }
                          if (planCount > 0) {
                            parts.push(`${planCount} día${planCount === 1 ? '' : 's'}`);
                          }
                          return parts.join(' · ');
                        })()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
            {loading && rows.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-stone-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando…
              </div>
            ) : !selected ? (
              <div className="rounded-xl border border-dashed border-stone-200 dark:border-stone-700 px-4 py-10 text-center">
                <Monitor className="mx-auto h-8 w-8 text-stone-300 dark:text-stone-600" />
                <p className="mt-2 text-sm font-semibold text-stone-700 dark:text-stone-200">
                  Aún no hay eventos fijos
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  Créalos en la vista TPV de eventos.
                </p>
              </div>
            ) : (
              <EventsFixedPdvsOpsPanel
                key={selected.wc._id}
                workCenter={selected.wc}
                dataUserId={userId}
                businessId={businessId}
                businessMembers={business?.members || []}
                ownerUserId={business?.owner_user_id}
                selfUser={user}
                onEditProducts={() =>
                  setLoadEdit({
                    workCenterId: selected.wc._id,
                    name: selected.wc.name || 'PDV',
                  })
                }
                onSaved={() => void refresh()}
              />
            )}
          </div>
        </div>
      </div>

      {loadEdit ? (
        <EventsFixedPdvLoadModal
          open={Boolean(loadEdit)}
          userId={userId}
          workCenterId={loadEdit.workCenterId}
          pdvName={loadEdit.name}
          businessId={businessId}
          onClose={() => setLoadEdit(null)}
          onSaved={() => {
            void refresh();
          }}
        />
      ) : null}
    </>
  );
}
