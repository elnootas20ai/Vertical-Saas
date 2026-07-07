import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '../../../../components/saas/Layout';
import { useAuth } from '../../../../context/AuthContext';
import { useApp } from '../../../../context/AppContext';
import { createVerticalApi, type VerticalEntity } from '../../../../lib/verticalApiFactory';
import { computeQuoteTotal, createEventDraft, loadEventServices, quoteLineFromService } from '../../../../lib/eventsFlow';
import { EVENT_TYPE_LABELS, type EventType, type EventServiceRecord, type QuoteLine } from '../../../../lib/eventsTypes';
import { useEventsActivationNav } from '../../../../hooks/useEventsActivationNav';
import { buildActivationTargetUrl } from '../../../../lib/activationGuide';
import {
  ArrowLeft, ArrowRight, Check, Plus, Trash2, Loader2, User, CalendarDays, MapPin, Receipt, Lock,
} from 'lucide-react';

interface Venue extends VerticalEntity {
  nombre: string;
  direccion: string;
  capacidad: number;
}

const WIZARD_STEPS = [
  { id: 'cliente', label: 'Cliente', icon: User },
  { id: 'evento', label: 'Evento', icon: CalendarDays },
  { id: 'ubicacion', label: 'Ubicación', icon: MapPin },
  { id: 'presupuesto', label: 'Presupuesto', icon: Receipt },
  { id: 'confirmar', label: 'Confirmar', icon: Check },
] as const;

type StepId = (typeof WIZARD_STEPS)[number]['id'];

const inputClass =
  'w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

function emptyLine(): QuoteLine {
  return {
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    concepto: '',
    cantidad: 1,
    precioUnitario: 0,
    total: 0,
  };
}

export function EventsContractWizardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { clients } = useApp();
  const eventsNav = useEventsActivationNav();
  const userId = user?.user_id || user?.id || '';
  const venuesApi = useMemo(() => createVerticalApi<Venue>('events', 'venues'), []);

  const [step, setStep] = useState<StepId>('cliente');
  const [saving, setSaving] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [services, setServices] = useState<EventServiceRecord[]>([]);

  const [clientId, setClientId] = useState('');
  const [cliente, setCliente] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientTelefono, setClientTelefono] = useState('');
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<EventType>('boda');
  const [fecha, setFecha] = useState('');
  const [invitados, setInvitados] = useState(50);
  const [venueId, setVenueId] = useState('');
  const [lugar, setLugar] = useState('');
  const [lineas, setLineas] = useState<QuoteLine[]>([emptyLine()]);
  const [deposito, setDeposito] = useState(0);
  const [notas, setNotas] = useState('');

  useEffect(() => {
    if (!userId) return;
    void Promise.all([
      venuesApi.list(userId).then(setVenues).catch(() => setVenues([])),
      loadEventServices(userId).then(setServices).catch(() => setServices([])),
    ]);
  }, [userId, venuesApi]);

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === step);
  const total = useMemo(() => computeQuoteTotal(lineas), [lineas]);

  const patchLine = useCallback((id: string, patch: Partial<QuoteLine>) => {
    setLineas((prev) => prev.map((line) => {
      if (line.id !== id) return line;
      const next = { ...line, ...patch };
      next.total = (Number(next.cantidad) || 0) * (Number(next.precioUnitario) || 0);
      return next;
    }));
  }, []);

  const validateStep = (): boolean => {
    if (step === 'cliente' && !cliente.trim()) {
      toast.error('Indica el nombre del cliente');
      return false;
    }
    if (step === 'evento') {
      if (!nombre.trim()) { toast.error('Indica el nombre del evento'); return false; }
      if (!fecha) { toast.error('Indica la fecha'); return false; }
    }
    if (step === 'ubicacion' && !lugar.trim() && !venueId) {
      toast.error('Elige un espacio o escribe la ubicación');
      return false;
    }
    if (step === 'presupuesto' && lineas.every((l) => !l.concepto.trim())) {
      toast.error('Añade al menos una línea al presupuesto');
      return false;
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep()) return;
    const next = WIZARD_STEPS[stepIndex + 1];
    if (next) setStep(next.id);
  };

  const goBack = () => {
    const prev = WIZARD_STEPS[stepIndex - 1];
    if (prev) setStep(prev.id);
  };

  const onSelectClient = (id: string) => {
    setClientId(id);
    const hit = clients.find((c) => c.id === id);
    if (!hit) return;
    setCliente(hit.name || '');
    setClientEmail(hit.email || '');
    setClientTelefono(hit.phone || '');
  };

  const onSelectVenue = (id: string) => {
    setVenueId(id);
    const hit = venues.find((v) => v._id === id);
    if (hit) setLugar(hit.nombre + (hit.direccion ? ` — ${hit.direccion}` : ''));
  };

  const addServiceToQuote = (serviceId: string) => {
    const hit = services.find((s) => s._id === serviceId);
    if (!hit) return;
    const line = quoteLineFromService(hit, invitados);
    setLineas((prev) => {
      const manual = prev.filter((l) => l.concepto.trim());
      return manual.length ? [...manual, line] : [line];
    });
  };

  const handleSubmit = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const event = await createEventDraft(userId, {
        nombre,
        tipo,
        fecha,
        lugar: lugar.trim(),
        cliente: cliente.trim(),
        clientId,
        clientEmail,
        clientTelefono,
        venueId,
        invitados,
        lineas: lineas.filter((l) => l.concepto.trim()),
        deposito,
        notas,
      });
      toast.success('Contratación creada en presupuesto');
      navigate(`/saas/vertical/eventos/${event._id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear la contratación');
    } finally {
      setSaving(false);
    }
  };

  if (eventsNav.loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  if (!eventsNav.hasPricedService || !eventsNav.hasClient) {
    const missingService = !eventsNav.hasPricedService;
    return (
      <Layout>
        <div className="max-w-lg mx-auto py-16 px-4 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 mb-4">
            <Lock className="w-7 h-7 text-amber-700 dark:text-amber-300" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Completa el alta antes de contratar
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            {missingService
              ? 'Necesitas al menos un servicio con precio en tu catálogo.'
              : 'Registra un cliente antes de abrir el asistente de contratación.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {missingService ? (
              <Link
                to={buildActivationTargetUrl('/saas/events-services', 'events_catalog_price')}
                className="inline-flex items-center justify-center rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700"
              >
                Ir a Servicios
              </Link>
            ) : (
              <Link
                to={buildActivationTargetUrl('/saas/clients', 'events_first_client')}
                className="inline-flex items-center justify-center rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700"
              >
                Ir a Clientes
              </Link>
            )}
            <button
              type="button"
              onClick={() => navigate('/saas/vertical/eventos')}
              className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Volver al centro
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto pb-10">
        <button type="button" onClick={() => navigate('/saas/vertical/eventos')} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mb-4">
          <ArrowLeft className="w-4 h-4" /> Volver al centro
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Nueva contratación</h1>

        <div className="flex flex-wrap gap-2 mb-6">
          {WIZARD_STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < stepIndex;
            const active = s.id === step;
            return (
              <div key={s.id} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${active ? 'bg-cyan-600 text-white' : done ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
                <Icon className="w-3.5 h-3.5" /> {s.label}
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5 space-y-4">
          {step === 'cliente' && (
            <>
              {clients.length > 0 && (
                <select className={inputClass} value={clientId} onChange={(e) => onSelectClient(e.target.value)}>
                  <option value="">— Cliente manual —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <input className={inputClass} placeholder="Nombre cliente *" value={cliente} onChange={(e) => setCliente(e.target.value)} />
              <div className="grid sm:grid-cols-2 gap-3">
                <input className={inputClass} placeholder="Email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
                <input className={inputClass} placeholder="Teléfono" value={clientTelefono} onChange={(e) => setClientTelefono(e.target.value)} />
              </div>
            </>
          )}
          {step === 'evento' && (
            <>
              <input className={inputClass} placeholder="Nombre evento *" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              <div className="grid sm:grid-cols-2 gap-3">
                <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value as EventType)}>
                  {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input type="date" className={inputClass} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <input type="number" className={inputClass} value={invitados} onChange={(e) => setInvitados(Number(e.target.value) || 0)} placeholder="Invitados" />
            </>
          )}
          {step === 'ubicacion' && (
            <>
              {venues.length > 0 && (
                <select className={inputClass} value={venueId} onChange={(e) => onSelectVenue(e.target.value)}>
                  <option value="">— Manual —</option>
                  {venues.map((v) => <option key={v._id} value={v._id}>{v.nombre}</option>)}
                </select>
              )}
              <input className={inputClass} placeholder="Lugar / dirección *" value={lugar} onChange={(e) => setLugar(e.target.value)} />
            </>
          )}
          {step === 'presupuesto' && (
            <>
              {services.length > 0 && (
                <div className="rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50/50 dark:bg-cyan-950/20 p-3 space-y-2">
                  <p className="text-xs font-semibold text-cyan-800 dark:text-cyan-200">Añadir del catálogo de servicios</p>
                  <div className="flex flex-wrap gap-2">
                    {services.map((s) => (
                      <button
                        key={s._id}
                        type="button"
                        onClick={() => addServiceToQuote(s._id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-gray-900 border border-cyan-200 dark:border-cyan-800 text-xs font-medium hover:border-cyan-400"
                      >
                        {s.nombre}
                        <span className="text-gray-500">{(Number(s.precio) || 0).toLocaleString('es-ES')} €</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Los servicios «por persona» usan {invitados} invitados como cantidad.
                    <Link to="/saas/events-services" className="ml-1 text-cyan-600 font-semibold hover:underline">Gestionar catálogo</Link>
                  </p>
                </div>
              )}
              {services.length === 0 && (
                <p className="text-xs text-gray-500">
                  No hay servicios en catálogo.{' '}
                  <Link to="/saas/events-services" className="text-cyan-600 font-semibold hover:underline">Crear servicios y tarifas</Link>
                </p>
              )}
              {lineas.map((line) => (
                <div key={line.id} className="grid grid-cols-12 gap-2">
                  <input className={`${inputClass} col-span-5`} placeholder="Concepto" value={line.concepto} onChange={(e) => patchLine(line.id, { concepto: e.target.value })} />
                  <input type="number" className={`${inputClass} col-span-2`} value={line.cantidad} onChange={(e) => patchLine(line.id, { cantidad: Number(e.target.value) })} />
                  <input type="number" className={`${inputClass} col-span-2`} value={line.precioUnitario} onChange={(e) => patchLine(line.id, { precioUnitario: Number(e.target.value) })} />
                  <span className="col-span-2 text-sm font-semibold self-center">{line.total} €</span>
                  <button type="button" onClick={() => setLineas((p) => p.filter((l) => l.id !== line.id))} className="col-span-1 text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setLineas((p) => [...p, emptyLine()])} className="text-sm text-cyan-600 font-semibold inline-flex items-center gap-1"><Plus className="w-4 h-4" /> Línea</button>
              <input type="number" className={inputClass} placeholder="Señal €" value={deposito} onChange={(e) => setDeposito(Number(e.target.value) || 0)} />
              <textarea className={inputClass} placeholder="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
              <p className="font-bold text-lg">Total: {total.toLocaleString('es-ES')} €</p>
            </>
          )}
          {step === 'confirmar' && (
            <div className="text-sm space-y-2">
              <p><strong>Cliente:</strong> {cliente}</p>
              <p><strong>Evento:</strong> {nombre}</p>
              <p><strong>Fecha:</strong> {fecha}</p>
              <p><strong>Lugar:</strong> {lugar}</p>
              <p><strong>Total:</strong> {total.toLocaleString('es-ES')} €</p>
            </div>
          )}
        </div>

        <div className="flex justify-between mt-6">
          <button type="button" onClick={goBack} disabled={stepIndex === 0} className="px-4 py-2 rounded-xl border text-sm font-semibold disabled:opacity-40">Atrás</button>
          {step === 'confirmar' ? (
            <button type="button" onClick={() => void handleSubmit()} disabled={saving} className="px-5 py-2.5 rounded-xl bg-cyan-600 text-white text-sm font-semibold inline-flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Crear
            </button>
          ) : (
            <button type="button" onClick={goNext} className="px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold inline-flex items-center gap-2">Siguiente <ArrowRight className="w-4 h-4" /></button>
          )}
        </div>
      </div>
    </Layout>
  );
}
