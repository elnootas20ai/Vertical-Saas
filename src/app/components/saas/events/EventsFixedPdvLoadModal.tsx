/**
 * Ajustes de carga de un PDV fijo/temporal de eventos:
 * productos o servicios, cantidad y precio → carta del TPV tablet.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { useModalClose } from '../../../hooks/useModalClose';
import {
  normalizeEventsPdvLoad,
  type EventsPdvLoadLine,
} from '../../../lib/eventsPdvLoad';
import {
  eventsTpvProductId,
  eventsTpvProductName,
  eventsTpvProductPrice,
  listActiveEventsTpvProducts,
  type EventsTpvProduct,
} from '../../../lib/eventsTpvProducts';
import {
  getWorkCenterById,
  updateWorkCenter,
  type WorkCenter,
} from '../../../lib/workCentersApi';
import { notifyDeliveryWorkCentersChanged } from '../../../lib/deliverySetup';
import { formatMoneyEs } from '../../../lib/formatNumberEs';
import {
  VERTIAL_BTN_DANGER,
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_FOCUS_RING,
  VERTIAL_SURFACE,
} from '../../../lib/vertialUiTokens';

const EVENTS_PRODUCTS_PATH = '/saas/events-services?tab=productos';
const inputClass =
  `w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 ${VERTIAL_FOCUS_RING}`;

type Props = {
  open: boolean;
  userId: string;
  workCenterId: string;
  pdvName?: string;
  businessId?: string;
  onClose: () => void;
  onSaved?: (wc: WorkCenter) => void;
};

export function EventsFixedPdvLoadModal({
  open,
  userId,
  workCenterId,
  pdvName,
  businessId,
  onClose,
  onSaved,
}: Props) {
  useModalClose(open, onClose);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wc, setWc] = useState<WorkCenter | null>(null);
  const [catalog, setCatalog] = useState<EventsTpvProduct[]>([]);
  const [lines, setLines] = useState<EventsPdvLoadLine[]>([]);
  const [pickId, setPickId] = useState('');

  useEffect(() => {
    if (!open || !userId || !workCenterId) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      getWorkCenterById(workCenterId),
      listActiveEventsTpvProducts(userId),
    ])
      .then(([center, items]) => {
        if (cancelled) return;
        setWc(center);
        setCatalog(items);
        const load = normalizeEventsPdvLoad(center?.eventsTpvLoad);
        setLines(load);
        setPickId(items[0] ? eventsTpvProductId(items[0]) : '');
      })
      .catch(() => {
        if (!cancelled) toast.error('No se pudo cargar la carga del PDV');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId, workCenterId]);

  const available = useMemo(() => {
    const taken = new Set(lines.map((l) => l.catalogItemId));
    return catalog.filter((c) => !taken.has(eventsTpvProductId(c)));
  }, [catalog, lines]);

  if (!open) return null;

  const addLine = () => {
    const id = String(pickId || (available[0] ? eventsTpvProductId(available[0]) : '')).trim();
    if (!id) {
      toast.error('No hay más productos (añádelos en Servicios → Productos)');
      return;
    }
    const item = catalog.find((c) => eventsTpvProductId(c) === id);
    if (!item) return;
    setLines((prev) =>
      normalizeEventsPdvLoad([
        ...prev,
        {
          catalogItemId: id,
          name: eventsTpvProductName(item),
          qty: 1,
          unitPrice: eventsTpvProductPrice(item),
        },
      ]),
    );
    const nextAvail = available.filter((c) => eventsTpvProductId(c) !== id);
    setPickId(nextAvail[0] ? eventsTpvProductId(nextAvail[0]) : '');
  };

  const patchLine = (catalogItemId: string, patch: Partial<EventsPdvLoadLine>) => {
    setLines((prev) =>
      prev.map((l) => (l.catalogItemId === catalogItemId ? { ...l, ...patch } : l)),
    );
  };

  const removeLine = (catalogItemId: string) => {
    setLines((prev) => prev.filter((l) => l.catalogItemId !== catalogItemId));
  };

  const handleSave = async () => {
    if (!wc) return;
    setSaving(true);
    try {
      const cleaned = normalizeEventsPdvLoad(lines);
      const updated = await updateWorkCenter({
        ...wc,
        eventsTpvLoad: cleaned,
      });
      notifyDeliveryWorkCentersChanged(businessId);
      onSaved?.(updated);
      toast.success('Carga del PDV guardada');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const titleName = pdvName || wc?.name || 'PDV';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="events-fixed-pdv-load-title"
        className={`${VERTIAL_SURFACE} w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-xl`}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-100 dark:border-stone-800 shrink-0">
          <div className="min-w-0">
            <h2 id="events-fixed-pdv-load-title" className="text-base font-bold text-stone-900 dark:text-stone-100 truncate">
              Carga · {titleName}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Elige de Servicios → Productos lo que saldrá en el TPV. Cantidad = lo que llevas.
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

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-stone-500 py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando…
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 items-end">
                <label className="flex-1 min-w-[10rem] space-y-1">
                  <span className="text-[11px] font-medium text-stone-500">Añadir de Servicios → Productos</span>
                  <select
                    className={inputClass}
                    value={pickId}
                    onChange={(e) => setPickId(e.target.value)}
                    disabled={available.length === 0}
                  >
                    {available.length === 0 ? (
                      <option value="">Sin más productos</option>
                    ) : (
                      available.map((c) => {
                        const id = eventsTpvProductId(c);
                        return (
                          <option key={id} value={id}>
                            {eventsTpvProductName(c)} · {formatMoneyEs(eventsTpvProductPrice(c))} €
                          </option>
                        );
                      })
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={addLine}
                  disabled={available.length === 0}
                  className={VERTIAL_BTN_SECONDARY}
                >
                  <Plus className="w-4 h-4" />
                  Añadir
                </button>
              </div>

              {lines.length === 0 ? (
                <div className="text-center py-6 space-y-3">
                  <p className="text-sm text-stone-500">
                    Aún no hay carga. Añade productos en Servicios → Productos.
                  </p>
                  <button
                    type="button"
                    className={`${VERTIAL_BTN_PRIMARY} mx-auto`}
                    onClick={() => {
                      onClose();
                      navigate(EVENTS_PRODUCTS_PATH);
                    }}
                  >
                    Ir a Servicios → Productos
                  </button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {lines.map((line) => (
                    <li
                      key={line.catalogItemId}
                      className="rounded-xl border border-stone-200 dark:border-stone-700 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 min-w-0 truncate">
                          {line.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeLine(line.catalogItemId)}
                          className={`${VERTIAL_BTN_DANGER} !px-2 !py-1.5`}
                          title="Quitar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="text-[10px] font-medium text-stone-500">Cantidad</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className={inputClass}
                            value={line.qty}
                            onChange={(e) =>
                              patchLine(line.catalogItemId, {
                                qty: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                              })
                            }
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[10px] font-medium text-stone-500">Precio (€)</span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className={inputClass}
                            value={line.unitPrice}
                            onChange={(e) =>
                              patchLine(line.catalogItemId, {
                                unitPrice: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                          />
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 flex gap-2 px-4 py-3 border-t border-stone-100 dark:border-stone-800">
          <button type="button" onClick={onClose} className={`${VERTIAL_BTN_SECONDARY} flex-1`} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            className={`${VERTIAL_BTN_PRIMARY} flex-1`}
            disabled={saving || loading || !wc}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Guardar carga
          </button>
        </div>
      </div>
    </div>
  );
}
