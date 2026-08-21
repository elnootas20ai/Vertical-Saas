import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '../../../../components/saas/Layout';
import { NuevoClienteModal } from '../../../../components/saas/NuevoClienteModal';
import { useAuth } from '../../../../context/AuthContext';
import { useApp } from '../../../../context/AppContext';
import { useBusiness } from '../../../../context/BusinessContext';
import { createVerticalApi, type VerticalEntity } from '../../../../lib/verticalApiFactory';
import { listUsersRequest } from '../../../../lib/authApi';
import { computeQuoteTotal, createEventDraft, loadEventServices, quoteLineFromCatalogItem, quoteLineFromService, resolveEventsUserId } from '../../../../lib/eventsFlow';
import {
  EVENT_TYPE_LABELS,
  type EventPlanningWorker,
  type EventType,
  type EventServiceRecord,
  type QuoteLine,
} from '../../../../lib/eventsTypes';
import { listCatalogItemsRequest, type CatalogItem } from '../../../../lib/deliveryApi';
import { filterCatalogItemsForBusinessScope } from '../../../../lib/catalogBusinessScope';
import {
  buildQuoteRulesText,
  loadEventsQuoteSettings,
  suggestedDepositFromTotal,
} from '../../../../lib/eventsQuoteSettings';
import { useEventsActivationNav } from '../../../../hooks/useEventsActivationNav';
import { buildActivationTargetUrl } from '../../../../lib/activationGuide';
import { resolveBusinessScopeId } from '../../../../lib/deliverySetup';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../../../lib/vertialUiTokens';
import {
  ArrowLeft, ArrowRight, Check, Plus, Trash2, Loader2, User, CalendarDays, Receipt, Lock, UserPlus, Users,
} from 'lucide-react';

interface Venue extends VerticalEntity {
  nombre: string;
  direccion: string;
  capacidad: number;
}

const WIZARD_STEPS = [
  { id: 'cliente', label: 'Cliente', icon: User },
  { id: 'evento', label: 'Evento', icon: CalendarDays },
  { id: 'presupuesto', label: 'Presupuesto', icon: Receipt },
  { id: 'trabajadores', label: 'Trabajadores', icon: Users },
  { id: 'confirmar', label: 'Confirmar', icon: Check },
] as const;

type StepId = (typeof WIZARD_STEPS)[number]['id'];

const inputClass =
  'w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

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
  const { currentBusiness } = useBusiness();
  const eventsNav = useEventsActivationNav();
  const dataUserId = useMemo(
    () => resolveEventsUserId(user, currentBusiness),
    [user, currentBusiness],
  );
  const businessId = resolveBusinessScopeId(currentBusiness);
  const venuesApi = useMemo(() => createVerticalApi<Venue>('events', 'venues'), []);

  const [step, setStep] = useState<StepId>('cliente');
  const [saving, setSaving] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [services, setServices] = useState<EventServiceRecord[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<CatalogItem[]>([]);
  const [productQtyById, setProductQtyById] = useState<Record<string, number>>({});
  const [team, setTeam] = useState<Array<{ id: string; name: string }>>([]);
  const [workers, setWorkers] = useState<EventPlanningWorker[]>([]);
  const [extraName, setExtraName] = useState('');
  const [showNuevoClienteModal, setShowNuevoClienteModal] = useState(false);
  const autoOpenedClientModalRef = useRef(false);

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
  const [depositPercentRule, setDepositPercentRule] = useState(0);
  const quoteDefaultsAppliedRef = useRef(false);

  useEffect(() => {
    if (quoteDefaultsAppliedRef.current) return;
    quoteDefaultsAppliedRef.current = true;
    const settings = loadEventsQuoteSettings(businessId || '');
    const rulesText = buildQuoteRulesText(settings);
    if (rulesText) setNotas(rulesText);
    setDepositPercentRule(settings.depositPercent > 0 ? settings.depositPercent : 0);
  }, [businessId]);

  const total = useMemo(() => computeQuoteTotal(lineas), [lineas]);
  const selectedWorkers = useMemo(() => workers.filter((w) => w.ok), [workers]);

  useEffect(() => {
    if (!(depositPercentRule > 0) || !(total > 0)) return;
    setDeposito(suggestedDepositFromTotal(total, depositPercentRule));
  }, [total, depositPercentRule]);

  useEffect(() => {
    if (!dataUserId) return;
    void Promise.all([
      venuesApi.list(dataUserId).then(setVenues).catch(() => setVenues([])),
      loadEventServices(dataUserId).then(setServices).catch(() => setServices([])),
      listCatalogItemsRequest(dataUserId, { module: 'catalog' })
        .then((items) => {
          const scoped = filterCatalogItemsForBusinessScope(items, businessId || '', new Set(), {
            accountBusinessCount: 1,
            activeBusinessType: 'events',
          });
          setCatalogProducts(
            scoped.filter(
              (i) =>
                i.active !== false
                && i.deletedAt == null
                && i.module !== 'stock'
                && Number(i.unitPrice) > 0
                && String(i.name || '').trim(),
            ),
          );
        })
        .catch(() => setCatalogProducts([])),
    ]);
  }, [dataUserId, venuesApi, businessId]);

  useEffect(() => {
    if (!businessId) return;
    void listUsersRequest(businessId)
      .then((res) => {
        const users = Array.isArray(res.users) ? res.users : [];
        setTeam(
          users
            .map((u) => ({
              id: String(u.user_id || u.id || '').trim(),
              name: String(u.fullName || `${u.firstName || ''} ${u.lastName || ''}`).trim() || u.email,
            }))
            .filter((u) => u.id && u.name),
        );
      })
      .catch(() => setTeam([]));
  }, [businessId]);

  // Sin clientes: al entrar al asistente, abrir alta de cliente (mismo flujo, primer paso).
  useEffect(() => {
    if (eventsNav.loading || !eventsNav.hasPricedService) return;
    if (autoOpenedClientModalRef.current) return;
    if (clients.length > 0 || eventsNav.hasClient) return;
    autoOpenedClientModalRef.current = true;
    setShowNuevoClienteModal(true);
  }, [eventsNav.loading, eventsNav.hasPricedService, eventsNav.hasClient, clients.length]);

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === step);

  const patchLine = useCallback((id: string, patch: Partial<QuoteLine>) => {
    setLineas((prev) => prev.map((line) => {
      if (line.id !== id) return line;
      const next = { ...line, ...patch };
      next.total = (Number(next.cantidad) || 0) * (Number(next.precioUnitario) || 0);
      return next;
    }));
  }, []);

  const toggleWorker = (person: { id: string; name: string }) => {
    setWorkers((prev) => {
      const current = prev.find((w) => w.id === person.id);
      if (current) {
        return prev.map((w) => (w.id === person.id ? { ...w, ok: !w.ok } : w));
      }
      return [...prev, { id: person.id, name: person.name, ok: true }];
    });
  };

  const addExtraWorker = () => {
    const name = extraName.trim();
    if (!name) {
      toast.error('Escribe el nombre del trabajador');
      return;
    }
    const id = `ext-${name.toLowerCase().replace(/\s+/g, '-')}`;
    if (workers.some((w) => w.id === id || w.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Ese trabajador ya está en la lista');
      return;
    }
    if (team.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Esa persona ya está en el equipo: márcala en la lista');
      return;
    }
    setExtraName('');
    setWorkers((prev) => [...prev, { id, name, ok: true }]);
  };

  const removeExtraWorker = (id: string) => {
    setWorkers((prev) => prev.filter((w) => w.id !== id));
  };

  const teamToShow = team.length > 0
    ? team
    : workers.filter((w) => !w.id.startsWith('ext-')).map((w) => ({ id: w.id, name: w.name }));
  const extras = workers.filter((w) => w.id.startsWith('ext-'));

  const validateStep = (): boolean => {
    if (step === 'cliente' && !cliente.trim()) {
      toast.error('Indica el nombre del cliente');
      return false;
    }
    if (step === 'evento') {
      if (!nombre.trim()) { toast.error('Indica el nombre del evento'); return false; }
      if (!fecha) { toast.error('Indica la fecha'); return false; }
      if (!lugar.trim() && !venueId) {
        toast.error('Indica la dirección o elige un espacio');
        return false;
      }
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

  const applyCreatedClient = (created: { id: string; name: string; email?: string; phone?: string }) => {
    setClientId(created.id);
    setCliente(created.name || '');
    setClientEmail(created.email || '');
    setClientTelefono(created.phone || '');
    setShowNuevoClienteModal(false);
    void eventsNav.reload();
    toast.success(`Cliente "${created.name}" listo — continúa la contratación`);
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

  const addProductToQuote = (productId: string) => {
    const hit = catalogProducts.find((p) => p._id === productId);
    if (!hit) return;
    const qty = Math.max(1, Math.floor(Number(productQtyById[productId]) || 1));
    const line = quoteLineFromCatalogItem(hit, qty);
    setLineas((prev) => {
      const existing = prev.find((l) => l.catalogItemId === productId);
      if (existing) {
        return prev.map((l) => {
          if (l.id !== existing.id) return l;
          const cantidad = (Number(l.cantidad) || 0) + qty;
          const precioUnitario = Number(l.precioUnitario) || 0;
          return { ...l, cantidad, total: cantidad * precioUnitario };
        });
      }
      const manual = prev.filter((l) => l.concepto.trim());
      return manual.length ? [...manual, line] : [line];
    });
    toast.success(`${hit.name} × ${qty} añadido`);
  };

  const handleSubmit = async () => {
    if (!dataUserId) return;
    setSaving(true);
    try {
      const event = await createEventDraft(dataUserId, {
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
        workers: selectedWorkers,
        business: currentBusiness,
      });
      const code = String(event.portableTerminalCode || '').trim();
      toast.success(
        code
          ? `Contratación creada · código TPV ${code}`
          : 'Contratación creada en presupuesto',
      );
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

  if (!eventsNav.hasPricedService) {
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
            Necesitas al menos un servicio con precio en tu catálogo.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to={buildActivationTargetUrl('/saas/events-services', 'events_catalog_price')}
              className={VERTIAL_BTN_PRIMARY}
            >
              Ir a Servicios
            </Link>
            <button
              type="button"
              onClick={() => navigate('/saas/vertical/eventos')}
              className={VERTIAL_BTN_SECONDARY}
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
              <div
                key={s.id}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  active
                    ? 'bg-[var(--v-blue,#2563eb)] text-white'
                    : done
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-gray-100 text-gray-500'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {s.label}
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5 space-y-4">
          {step === 'cliente' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {clients.length === 0
                    ? 'Primero crea el cliente; luego sigues con el evento.'
                    : 'Elige un cliente o crea uno nuevo.'}
                </p>
                <button
                  type="button"
                  onClick={() => setShowNuevoClienteModal(true)}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--v-blue,#2563eb)] hover:text-[#1d4ed8]"
                >
                  <UserPlus className="w-4 h-4" />
                  {clients.length === 0 ? 'Crear cliente' : 'Nuevo cliente'}
                </button>
              </div>
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
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Nº de personas
                </label>
                <input
                  type="number"
                  min={1}
                  className={inputClass}
                  value={invitados}
                  onChange={(e) => setInvitados(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="Ej. 80"
                  aria-describedby="eventos-personas-help"
                />
                <p id="eventos-personas-help" className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  Aforo / personas previstas. Sirve para precios «por persona». No hay lista de invitados.
                </p>
              </div>
              <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Dirección / lugar del evento *
                </label>
                {venues.length > 0 && (
                  <select className={inputClass} value={venueId} onChange={(e) => onSelectVenue(e.target.value)}>
                    <option value="">— Escribir dirección manualmente —</option>
                    {venues.map((v) => <option key={v._id} value={v._id}>{v.nombre}</option>)}
                  </select>
                )}
                <input
                  className={inputClass}
                  placeholder="Calle, número, ciudad…"
                  value={lugar}
                  onChange={(e) => {
                    setLugar(e.target.value);
                    if (venueId) setVenueId('');
                  }}
                />
              </div>
            </>
          )}
          {step === 'presupuesto' && (
            <>
              {catalogProducts.length > 0 && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-2">
                  <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                    Productos Carta TPV (cantidad)
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Elige cuántas unidades llevas / cobras en este evento.{' '}
                    <Link to="/saas/catalog?tab=catalog" className="text-[var(--v-blue,#2563eb)] font-semibold hover:underline">
                      Gestionar carta
                    </Link>
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {catalogProducts.slice(0, 40).map((p) => (
                      <div
                        key={p._id}
                        className="flex flex-wrap items-center gap-2 rounded-lg bg-white dark:bg-gray-900 border border-emerald-200/80 dark:border-emerald-800 px-2.5 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{p.name}</p>
                          <p className="text-[10px] text-gray-500">
                            {(Number(p.unitPrice) || 0).toLocaleString('es-ES')} €
                            {p.category ? ` · ${p.category}` : ''}
                          </p>
                        </div>
                        <input
                          type="number"
                          min={1}
                          className="w-16 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-xs tabular-nums"
                          value={productQtyById[p._id] ?? 1}
                          onChange={(e) =>
                            setProductQtyById((prev) => ({
                              ...prev,
                              [p._id]: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                            }))
                          }
                          aria-label={`Cantidad de ${p.name}`}
                        />
                        <button
                          type="button"
                          onClick={() => addProductToQuote(p._id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Añadir
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {catalogProducts.length === 0 && (
                <p className="text-xs text-gray-500">
                  Sin productos en Carta TPV.{' '}
                  <Link to="/saas/catalog?tab=catalog" className="text-[var(--v-blue,#2563eb)] font-semibold hover:underline">
                    Crear productos
                  </Link>
                </p>
              )}
              {services.length > 0 && (
                <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-2">
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">Añadir del catálogo de servicios</p>
                  <div className="flex flex-wrap gap-2">
                    {services.map((s) => (
                      <button
                        key={s._id}
                        type="button"
                        onClick={() => addServiceToQuote(s._id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800 text-xs font-medium hover:border-blue-400"
                      >
                        {s.nombre}
                        <span className="text-gray-500">{(Number(s.precio) || 0).toLocaleString('es-ES')} €</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Los servicios «por persona» usan {invitados} personas como cantidad.
                    <Link to="/saas/events-services" className="ml-1 text-[var(--v-blue,#2563eb)] font-semibold hover:underline">Gestionar catálogo</Link>
                  </p>
                </div>
              )}
              {services.length === 0 && (
                <p className="text-xs text-gray-500">
                  No hay servicios en catálogo.{' '}
                  <Link to="/saas/events-services" className="text-[var(--v-blue,#2563eb)] font-semibold hover:underline">Crear servicios y tarifas</Link>
                </p>
              )}
              <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 px-0.5">
                <span className="col-span-5">Concepto</span>
                <span className="col-span-2 text-center">Cant.</span>
                <span className="col-span-2 text-center">Precio</span>
                <span className="col-span-2">Total</span>
                <span className="col-span-1" />
              </div>
              {lineas.map((line) => (
                <div key={line.id} className="grid grid-cols-12 gap-2">
                  <input className={`${inputClass} col-span-5`} placeholder="Concepto" value={line.concepto} onChange={(e) => patchLine(line.id, { concepto: e.target.value })} />
                  <input type="number" min={0} className={`${inputClass} col-span-2`} value={line.cantidad} onChange={(e) => patchLine(line.id, { cantidad: Number(e.target.value) })} />
                  <input type="number" className={`${inputClass} col-span-2`} value={line.precioUnitario} onChange={(e) => patchLine(line.id, { precioUnitario: Number(e.target.value) })} />
                  <span className="col-span-2 text-sm font-semibold self-center">{line.total} €</span>
                  <button type="button" onClick={() => setLineas((p) => p.filter((l) => l.id !== line.id))} className="col-span-1 text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setLineas((p) => [...p, emptyLine()])} className="text-sm text-[var(--v-blue,#2563eb)] font-semibold inline-flex items-center gap-1"><Plus className="w-4 h-4" /> Línea</button>
              <input type="number" className={inputClass} placeholder="Señal €" value={deposito} onChange={(e) => setDeposito(Number(e.target.value) || 0)} />
              <textarea className={inputClass} placeholder="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
              <p className="font-bold text-lg">Total: {total.toLocaleString('es-ES')} €</p>
            </>
          )}          {step === 'trabajadores' && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Quién va al evento</p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    Marca el equipo o añade a alguien externo. Puedes dejarlo vacío y completarlo después en Planificación.
                  </p>
                </div>
                <span className="text-xs font-semibold text-gray-500 tabular-nums">
                  {selectedWorkers.length} seleccionado{selectedWorkers.length === 1 ? '' : 's'}
                </span>
              </div>

              {teamToShow.length === 0 && extras.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Aún no hay equipo en Vertial. Añade un nombre abajo o invita trabajadores desde Equipo.
                </p>
              ) : (
                <ul className="space-y-2">
                  {teamToShow.map((person) => {
                    const selected = Boolean(workers.find((w) => w.id === person.id)?.ok);
                    return (
                      <li
                        key={person.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-100 px-3 py-2.5 dark:border-stone-800"
                      >
                        <p className="text-sm font-medium text-stone-800 dark:text-stone-200">{person.name}</p>
                        <button
                          type="button"
                          onClick={() => toggleWorker(person)}
                          className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ${
                            selected
                              ? 'bg-emerald-500 text-white'
                              : 'border border-stone-200 bg-white text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300'
                          }`}
                        >
                          {selected ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
                          {selected ? 'Va' : 'Añadir'}
                        </button>
                      </li>
                    );
                  })}
                  {extras.map((person) => (
                    <li
                      key={person.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-100 px-3 py-2.5 dark:border-stone-800"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-800 dark:text-stone-200">{person.name}</p>
                        <p className="text-[11px] text-stone-500">Externo</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white">
                          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                          Va
                        </span>
                        <button
                          type="button"
                          onClick={() => removeExtraWorker(person.id)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg dark:hover:bg-red-950/30"
                          aria-label={`Quitar a ${person.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <input
                  value={extraName}
                  onChange={(e) => setExtraName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addExtraWorker();
                    }
                  }}
                  placeholder="Nombre (si no está en el equipo)"
                  className="min-h-11 min-w-[12rem] flex-1 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-blue-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                />
                <button type="button" onClick={addExtraWorker} className={VERTIAL_BTN_SECONDARY}>
                  <Plus className="h-4 w-4" />
                  Añadir
                </button>
              </div>
            </>
          )}
          {step === 'confirmar' && (
            <div className="text-sm space-y-2">
              <p><strong>Cliente:</strong> {cliente}</p>
              <p><strong>Evento:</strong> {nombre}</p>
              <p><strong>Fecha:</strong> {fecha}</p>
              <p><strong>Lugar:</strong> {lugar}</p>
              <p><strong>Total:</strong> {total.toLocaleString('es-ES')} €</p>
              <p>
                <strong>Trabajadores:</strong>{' '}
                {selectedWorkers.length > 0
                  ? selectedWorkers.map((w) => w.name).join(', ')
                  : 'Sin asignar (se puede completar después)'}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-between mt-6">
          <button type="button" onClick={goBack} disabled={stepIndex === 0} className={VERTIAL_BTN_SECONDARY}>
            Atrás
          </button>
          {step === 'confirmar' ? (
            <button type="button" onClick={() => void handleSubmit()} disabled={saving} className={VERTIAL_BTN_PRIMARY}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Crear
            </button>
          ) : (
            <button type="button" onClick={goNext} className={VERTIAL_BTN_PRIMARY}>
              Siguiente <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <NuevoClienteModal
        open={showNuevoClienteModal}
        onClose={() => setShowNuevoClienteModal(false)}
        onClientCreated={applyCreatedClient}
        contexto="vertical"
        businessId={businessId || undefined}
        dataUserId={dataUserId || undefined}
      />
    </Layout>
  );
}
