import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { NuevoClienteModal } from '../NuevoClienteModal';
import { useModalClose } from '../../../hooks/useModalClose';
import { resolveBusinessScopeId } from '../../../lib/deliverySetup';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import { formatMoneyEs, formatQtyEs } from '../../../lib/formatNumberEs';
import { createVerticalApi, type VerticalEntity } from '../../../lib/verticalApiFactory';
import {
  computeQuoteTotal,
  emptyQuoteLine,
  parseQuoteAmount,
  parseQuoteLines,
  patchQuoteLine,
  quoteLineFromService,
  quoteLinesAreEqual,
  saveEventQuoteLines,
  updateEventRecord,
} from '../../../lib/eventsFlow';
import {
  EVENT_TYPE_LABELS,
  type EventRecord,
  type EventServiceRecord,
  type EventType,
  type QuoteLine,
} from '../../../lib/eventsTypes';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../../lib/vertialUiTokens';

const inputClass =
  'w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

interface Venue extends VerticalEntity {
  nombre: string;
  direccion: string;
  capacidad: number;
}

type EditForm = {
  nombre: string;
  tipo: EventType;
  fecha: string;
  invitados: number;
  cliente: string;
  clientId: string;
  clientEmail: string;
  clientTelefono: string;
  venueId: string;
  lugar: string;
  deposito: number;
  notas: string;
};

function formatInputAmount(value: number): string {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace('.', ',');
}

function formFromEvent(event: EventRecord): EditForm {
  return {
    nombre: String(event.nombre || ''),
    tipo: (event.tipo || 'otro') as EventType,
    fecha: String(event.fecha || '').slice(0, 10),
    invitados: Number(event.invitados) || 0,
    cliente: String(event.cliente || ''),
    clientId: String(event.clientId || ''),
    clientEmail: String(event.clientEmail || ''),
    clientTelefono: String(event.clientTelefono || ''),
    venueId: String(event.venueId || ''),
    lugar: String(event.lugar || ''),
    deposito: Number(event.deposito) || 0,
    notas: String(event.notas || ''),
  };
}

function formsEqual(a: EditForm, b: EditForm): boolean {
  return (
    a.nombre.trim() === b.nombre.trim()
    && a.tipo === b.tipo
    && a.fecha === b.fecha
    && a.invitados === b.invitados
    && a.cliente.trim() === b.cliente.trim()
    && a.clientId === b.clientId
    && a.clientEmail.trim() === b.clientEmail.trim()
    && a.clientTelefono.trim() === b.clientTelefono.trim()
    && a.venueId === b.venueId
    && a.lugar.trim() === b.lugar.trim()
    && a.deposito === b.deposito
    && a.notas.trim() === b.notas.trim()
  );
}

function LineCard({
  line,
  onPatch,
  onRemove,
}: {
  line: QuoteLine;
  onPatch: (patch: Partial<QuoteLine>) => void;
  onRemove: () => void;
}) {
  const [qtyText, setQtyText] = useState<string | null>(null);
  const [priceText, setPriceText] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 space-y-3 dark:border-gray-800 dark:bg-gray-900/50">
      <div className="flex items-start gap-2">
        <label className="min-w-0 flex-1 space-y-1">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Concepto</span>
          <input
            className={inputClass}
            placeholder="Nombre de la partida"
            value={line.concepto}
            onChange={(e) => onPatch({ concepto: e.target.value })}
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="mt-6 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#E11D48] hover:bg-red-50 dark:hover:bg-red-950/40"
          aria-label="Quitar partida"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Uds</span>
          <input
            className={inputClass}
            inputMode="decimal"
            value={qtyText ?? formatInputAmount(Number(line.cantidad) || 0)}
            onChange={(e) => {
              setQtyText(e.target.value);
              onPatch({ cantidad: parseQuoteAmount(e.target.value) });
            }}
            onBlur={() => setQtyText(null)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Precio</span>
          <input
            className={inputClass}
            inputMode="decimal"
            value={priceText ?? formatInputAmount(Number(line.precioUnitario) || 0)}
            onChange={(e) => {
              setPriceText(e.target.value);
              onPatch({ precioUnitario: parseQuoteAmount(e.target.value) });
            }}
            onBlur={() => setPriceText(null)}
          />
        </label>
        <div className="space-y-1">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Total</span>
          <p className="flex min-h-11 items-center text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
            {formatMoneyEs(line.total)}
          </p>
        </div>
      </div>
    </div>
  );
}

/** @deprecated Prefer EventsEditModal name; kept as alias export for existing imports. */
export function EventsQuoteEditModal(props: {
  open: boolean;
  onClose: () => void;
  userId: string;
  event: EventRecord;
  services: EventServiceRecord[];
  onSaved: (event: EventRecord) => void;
}) {
  return <EventsEditModal {...props} />;
}

export function EventsEditModal({
  open,
  onClose,
  userId,
  event,
  services,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  event: EventRecord;
  services: EventServiceRecord[];
  onSaved: (event: EventRecord) => void;
}) {
  const { clients } = useApp();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = resolveBusinessScopeId(currentBusiness);
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness) || userId;
  const venuesApi = useMemo(() => createVerticalApi<Venue>('events', 'venues'), []);

  const [form, setForm] = useState<EditForm>(() => formFromEvent(event));
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [saving, setSaving] = useState(false);
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);
  const [depositoText, setDepositoText] = useState<string | null>(null);
  const wasOpenRef = useRef(false);
  const savedForm = useMemo(() => formFromEvent(event), [event]);
  const savedLines = useMemo(() => parseQuoteLines(event.lineasPresupuesto), [event.lineasPresupuesto]);

  useModalClose(open, onClose);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setForm(formFromEvent(event));
      const parsed = parseQuoteLines(event.lineasPresupuesto);
      setLines(parsed.length > 0 ? parsed : [emptyQuoteLine()]);
      setDepositoText(null);
      window.dispatchEvent(new Event('vertial:close-company-dropdown'));
    }
    wasOpenRef.current = open;
  }, [open, event]);

  useEffect(() => {
    if (!open || !userId) return;
    void venuesApi.list(userId).then(setVenues).catch(() => setVenues([]));
  }, [open, userId, venuesApi]);

  const total = useMemo(() => computeQuoteTotal(lines), [lines]);
  const dirtyMeta = !formsEqual(form, savedForm);
  const dirtyLines = !quoteLinesAreEqual(
    lines.filter((line) => String(line.concepto || '').trim()),
    savedLines,
  );
  const dirty = dirtyMeta || dirtyLines;

  const patchForm = useCallback((patch: Partial<EditForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const patchLine = useCallback((id: string, patch: Partial<QuoteLine>) => {
    setLines((prev) => prev.map((line) => (line.id === id ? patchQuoteLine(line, patch) : line)));
  }, []);

  const onSelectClient = (id: string) => {
    const hit = clients.find((c) => c.id === id);
    if (!hit) {
      patchForm({ clientId: id });
      return;
    }
    patchForm({
      clientId: id,
      cliente: hit.name || '',
      clientEmail: hit.email || '',
      clientTelefono: hit.phone || '',
    });
  };

  const onSelectVenue = (id: string) => {
    if (!id) {
      patchForm({ venueId: '' });
      return;
    }
    const hit = venues.find((v) => v._id === id);
    patchForm({
      venueId: id,
      lugar: hit
        ? `${hit.nombre}${hit.direccion ? ` — ${hit.direccion}` : ''}`
        : form.lugar,
    });
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      toast.error('Indica el nombre del evento');
      return;
    }
    if (!form.cliente.trim()) {
      toast.error('Indica el cliente');
      return;
    }
    if (!form.fecha) {
      toast.error('Indica la fecha');
      return;
    }
    if (!form.lugar.trim() && !form.venueId) {
      toast.error('Indica la ubicación o elige un espacio');
      return;
    }

    setSaving(true);
    try {
      let updated: EventRecord = event;

      if (dirtyMeta) {
        updated = await updateEventRecord(userId, updated, {
          nombre: form.nombre.trim(),
          tipo: form.tipo,
          fecha: form.fecha,
          invitados: Number(form.invitados) || 0,
          cliente: form.cliente.trim(),
          clientId: form.clientId || '',
          clientEmail: form.clientEmail.trim(),
          clientTelefono: form.clientTelefono.trim(),
          venueId: form.venueId || '',
          lugar: form.lugar.trim(),
          deposito: Number(form.deposito) || 0,
          notas: form.notas.trim(),
        });
      }

      if (dirtyLines) {
        updated = await saveEventQuoteLines(userId, updated, lines);
      }

      onSaved(updated);
      toast.success('Contratación actualizada');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className={`fixed inset-0 flex items-center justify-center bg-black/50 p-4 ${
          showNuevoCliente ? 'z-40' : 'z-[60]'
        }`}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !showNuevoCliente) onClose();
        }}
      >
        <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl dark:bg-gray-900">
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Editar contratación</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                Cliente, ubicación, fechas, notas y presupuesto.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {/* Cliente */}
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">Cliente</h3>
              <div className="flex flex-wrap gap-2">
                <label className="min-w-0 flex-1 space-y-1">
                  <span className="text-xs font-semibold text-gray-500">Cliente CRM</span>
                  <select
                    className={inputClass}
                    value={form.clientId}
                    onChange={(e) => onSelectClient(e.target.value)}
                  >
                    <option value="">Sin vincular / manual</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setShowNuevoCliente(true)}
                  className={`${VERTIAL_BTN_SECONDARY} self-end min-h-11`}
                >
                  <UserPlus className="w-4 h-4" /> Nuevo
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-xs font-semibold text-gray-500">Nombre *</span>
                  <input
                    className={inputClass}
                    value={form.cliente}
                    onChange={(e) => patchForm({ cliente: e.target.value })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500">Email</span>
                  <input
                    className={inputClass}
                    type="email"
                    value={form.clientEmail}
                    onChange={(e) => patchForm({ clientEmail: e.target.value })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500">Teléfono</span>
                  <input
                    className={inputClass}
                    value={form.clientTelefono}
                    onChange={(e) => patchForm({ clientTelefono: e.target.value })}
                  />
                </label>
              </div>
            </section>

            {/* Evento / ubicación */}
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">Evento y ubicación</h3>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-gray-500">Nombre del evento *</span>
                <input
                  className={inputClass}
                  value={form.nombre}
                  onChange={(e) => patchForm({ nombre: e.target.value })}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500">Tipo</span>
                  <select
                    className={inputClass}
                    value={form.tipo}
                    onChange={(e) => patchForm({ tipo: e.target.value as EventType })}
                  >
                    {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((t) => (
                      <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500">Fecha *</span>
                  <input
                    className={inputClass}
                    type="date"
                    value={form.fecha}
                    onChange={(e) => patchForm({ fecha: e.target.value })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500">Nº de personas</span>
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    value={form.invitados || ''}
                    onChange={(e) => patchForm({ invitados: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500">Señal acordada (€)</span>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={depositoText ?? formatInputAmount(form.deposito)}
                    onChange={(e) => {
                      setDepositoText(e.target.value);
                      patchForm({ deposito: parseQuoteAmount(e.target.value) });
                    }}
                    onBlur={() => setDepositoText(null)}
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-gray-500">Espacio (catálogo)</span>
                <select
                  className={inputClass}
                  value={form.venueId}
                  onChange={(e) => onSelectVenue(e.target.value)}
                >
                  <option value="">Sin espacio / manual</option>
                  {venues.map((v) => (
                    <option key={v._id} value={v._id}>
                      {v.nombre}{v.direccion ? ` — ${v.direccion}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-gray-500">Dirección / lugar *</span>
                <input
                  className={inputClass}
                  value={form.lugar}
                  onChange={(e) => patchForm({ lugar: e.target.value, venueId: form.venueId })}
                  placeholder="Dirección completa del evento"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-gray-500">Notas</span>
                <textarea
                  className={`${inputClass} min-h-[80px] resize-y`}
                  value={form.notas}
                  onChange={(e) => patchForm({ notas: e.target.value })}
                />
              </label>
            </section>

            {/* Presupuesto */}
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">Presupuesto</h3>
              {services.length > 0 && (
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Añadir del catálogo</span>
                  <select
                    className={inputClass}
                    value=""
                    onChange={(e) => {
                      const service = services.find((s) => s._id === e.target.value);
                      if (!service) return;
                      setLines((prev) => [...prev, quoteLineFromService(service, Number(form.invitados) || 0)]);
                    }}
                  >
                    <option value="">Elegir servicio…</option>
                    {services.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.nombre} — {formatMoneyEs(Number(s.precio) || 0)}
                      </option>
                    ))}
                  </select>
                  {Number(form.invitados) > 0 && (
                    <span className="block text-[11px] text-gray-500">
                      Los servicios «por persona» usan {formatQtyEs(form.invitados)} personas.
                    </span>
                  )}
                </label>
              )}

              {lines.map((line) => (
                <LineCard
                  key={line.id}
                  line={line}
                  onPatch={(patch) => patchLine(line.id, patch)}
                  onRemove={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
                />
              ))}

              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, emptyQuoteLine()])}
                className={`${VERTIAL_BTN_SECONDARY} w-full`}
              >
                <Plus className="w-4 h-4" /> Añadir partida
              </button>
            </section>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
            <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">{formatMoneyEs(total)}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onClose} className={VERTIAL_BTN_SECONDARY}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving || !dirty}
                onClick={() => void handleSave()}
                className={VERTIAL_BTN_PRIMARY}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>

      <NuevoClienteModal
        open={showNuevoCliente}
        onClose={() => setShowNuevoCliente(false)}
        contexto="vertical"
        businessId={businessId}
        dataUserId={dataUserId}
        onClientCreated={(created) => {
          patchForm({
            clientId: created.id,
            cliente: created.name || '',
            clientEmail: created.email || '',
            clientTelefono: created.phone || '',
          });
          setShowNuevoCliente(false);
          toast.success(`Cliente "${created.name}" vinculado`);
        }}
      />
    </>
  );
}
