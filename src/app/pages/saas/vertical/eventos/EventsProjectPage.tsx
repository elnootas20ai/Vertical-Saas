import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '../../../../components/saas/Layout';
import { useAuth } from '../../../../context/AuthContext';
import { useBusiness } from '../../../../context/BusinessContext';
import { EventsProjectFinancePanel } from '../../../../components/saas/events/EventsProjectFinancePanel';
import { EventsProjectPlanningPanel } from '../../../../components/saas/events/EventsProjectPlanningPanel';
import {
  advanceEventStage,
  loadEventById,
  parseQuoteLines,
} from '../../../../lib/eventsFlow';
import { markEventQuoteSent } from '../../../../lib/eventsFinance';
import { loadEventPlanningSnapshot, type EventPlanningSnapshot } from '../../../../lib/eventsPlanning';
import { canAdvanceTo, type EventContractStage, type EventRecord } from '../../../../lib/eventsTypes';
import { EventContractStepper, EventStageBadge } from '../../../../components/saas/events/EventContractStepper';
import {
  ArrowLeft, Loader2, Send, CheckCircle2, FileSignature, CalendarCheck,
  MapPin, Phone, Mail,
} from 'lucide-react';

type TabId = 'resumen' | 'planificacion' | 'finanzas';

const STAGE_ACTIONS: Partial<Record<EventContractStage, { label: string; icon: typeof Send; next: EventContractStage }>> = {
  presupuesto: { label: 'Enviar presupuesto (PDF)', icon: Send, next: 'enviado' },
  enviado: { label: 'Marcar presupuesto aceptado', icon: CheckCircle2, next: 'aceptado' },
  aceptado: { label: 'Registrar contrato / señal', icon: FileSignature, next: 'contratado' },
  contratado: { label: 'Iniciar planificación operativa', icon: CalendarCheck, next: 'planificacion' },
  planificacion: { label: 'Evento en curso (día D)', icon: CalendarCheck, next: 'en_curso' },
  en_curso: { label: 'Marcar como finalizado', icon: CheckCircle2, next: 'finalizado' },
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'planificacion', label: 'Planificación' },
  { id: 'finanzas', label: 'Finanzas' },
];

export function EventsProjectPage() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const userId = user?.user_id || user?.id || '';
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [planning, setPlanning] = useState<EventPlanningSnapshot | null>(null);
  const [planningLoading, setPlanningLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [tab, setTab] = useState<TabId>('resumen');

  const businessIssuer = useMemo(() => ({
    name: currentBusiness?.name,
    taxId: currentBusiness?.taxId,
    address: currentBusiness?.address,
    phone: currentBusiness?.phone,
    email: currentBusiness?.email,
  }), [currentBusiness]);

  const refresh = useCallback(async () => {
    if (!userId || !eventId) return;
    setLoading(true);
    try {
      const loaded = await loadEventById(userId, eventId);
      setEvent(loaded);
    } finally {
      setLoading(false);
    }
  }, [userId, eventId]);

  const refreshPlanning = useCallback(async (ev: EventRecord) => {
    if (!userId) return;
    setPlanningLoading(true);
    try {
      setPlanning(await loadEventPlanningSnapshot(userId, ev));
    } finally {
      setPlanningLoading(false);
    }
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!event || tab !== 'planificacion') return;
    void refreshPlanning(event);
  }, [event, tab, refreshPlanning]);

  const lineas = useMemo(() => parseQuoteLines(event?.lineasPresupuesto), [event?.lineasPresupuesto]);
  const action = event ? STAGE_ACTIONS[event.estado] : null;
  const showPlanningTab = event && ['contratado', 'planificacion', 'en_curso', 'finalizado'].includes(event.estado);

  const handleAdvance = async (target: EventContractStage) => {
    if (!userId || !event) return;
    if (!canAdvanceTo(event.estado, target)) {
      toast.error('No se puede avanzar a esa fase');
      return;
    }
    setActing(true);
    try {
      let current = event;
      if (target === 'enviado' && event.estado === 'presupuesto') {
        current = await markEventQuoteSent(userId, event, businessIssuer);
      }
      const updated = await advanceEventStage(userId, current, target);
      setEvent(updated);
      if (target === 'contratado') setTab('finanzas');
      if (target === 'planificacion') setTab('planificacion');
      toast.success(target === 'enviado' ? 'Presupuesto PDF generado y fase actualizada' : 'Fase actualizada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al avanzar');
    } finally {
      setActing(false);
    }
  };

  const handleCancel = async () => {
    if (!event || !window.confirm('¿Cancelar esta contratación?')) return;
    await handleAdvance('cancelado');
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
      </Layout>
    );
  }

  if (!event) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto py-20 text-center">
          <p className="text-gray-500">Contratación no encontrada</p>
          <button type="button" onClick={() => navigate('/saas/vertical/eventos/contrataciones')} className="mt-4 text-cyan-600 font-semibold">Volver al listado</button>
        </div>
      </Layout>
    );
  }

  const visibleTabs = TABS.filter((t) => t.id !== 'planificacion' || showPlanningTab);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6 pb-10">
        <button type="button" onClick={() => navigate('/saas/vertical/eventos/contrataciones')} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
          <ArrowLeft className="w-4 h-4" /> Contrataciones
        </button>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{event.nombre}</h1>
              <EventStageBadge stage={event.estado} />
            </div>
            <p className="text-sm text-gray-500 mt-1">{event.cliente} · {event.fecha ? new Date(event.fecha).toLocaleDateString('es-ES') : 'Sin fecha'}</p>
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{(Number(event.presupuesto) || 0).toLocaleString('es-ES')} €</p>
        </header>

        <EventContractStepper current={event.estado} />

        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-cyan-600 text-cyan-700 dark:text-cyan-300'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'resumen' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="lg:col-span-2 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Datos del evento</h2>
              <dl className="grid sm:grid-cols-2 gap-3 text-sm">
                <div><dt className="text-gray-500">Cliente</dt><dd className="font-medium">{event.cliente}</dd></div>
                <div><dt className="text-gray-500">Invitados</dt><dd className="font-medium">{event.invitados || '—'}</dd></div>
                <div className="sm:col-span-2 flex items-start gap-1"><MapPin className="w-4 h-4 text-gray-400 mt-0.5" /><dd>{event.lugar || '—'}</dd></div>
                {event.clientEmail && <div className="flex items-center gap-1"><Mail className="w-4 h-4 text-gray-400" />{event.clientEmail}</div>}
                {event.clientTelefono && <div className="flex items-center gap-1"><Phone className="w-4 h-4 text-gray-400" />{event.clientTelefono}</div>}
              </dl>
              {lineas.length > 0 && (
                <>
                  <h3 className="font-semibold text-sm pt-2">Presupuesto</h3>
                  <ul className="text-sm divide-y divide-gray-100 dark:divide-gray-800">
                    {lineas.map((l) => (
                      <li key={l.id} className="flex justify-between py-2">
                        <span>{l.concepto} × {l.cantidad}</span>
                        <span className="font-medium">{l.total.toLocaleString('es-ES')} €</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5 space-y-3">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Siguiente paso</h2>
              {event.estado === 'cancelado' || event.estado === 'finalizado' ? (
                <p className="text-sm text-gray-500">Operación cerrada.</p>
              ) : action ? (
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => void handleAdvance(action.next)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-700 disabled:opacity-50"
                >
                  {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <action.icon className="w-4 h-4" />}
                  {action.label}
                </button>
              ) : null}
              {event.estado === 'aceptado' && (
                <button type="button" onClick={() => setTab('finanzas')} className="w-full text-sm text-cyan-700 dark:text-cyan-300 font-semibold hover:underline">
                  Ir a cobro de señal →
                </button>
              )}
              {showPlanningTab && (
                <button type="button" onClick={() => setTab('planificacion')} className="w-full text-sm text-cyan-700 dark:text-cyan-300 font-semibold hover:underline">
                  Abrir planificación →
                </button>
              )}
              {event.estado !== 'cancelado' && event.estado !== 'finalizado' && (
                <button type="button" onClick={() => void handleCancel()} className="w-full text-sm text-red-600 hover:underline">Cancelar contratación</button>
              )}
            </section>
          </div>
        )}

        {tab === 'planificacion' && showPlanningTab && (
          <EventsProjectPlanningPanel event={event} snapshot={planning} loading={planningLoading} />
        )}

        {tab === 'finanzas' && (
          <EventsProjectFinancePanel
            event={event}
            business={businessIssuer}
            userId={userId}
            onEventUpdated={setEvent}
          />
        )}
      </div>
    </Layout>
  );
}
