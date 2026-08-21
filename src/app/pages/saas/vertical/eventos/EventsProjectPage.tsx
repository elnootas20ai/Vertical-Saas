import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '../../../../components/saas/Layout';
import { useAuth } from '../../../../context/AuthContext';
import { useBusiness } from '../../../../context/BusinessContext';
import { EventsProjectFinancePanel } from '../../../../components/saas/events/EventsProjectFinancePanel';
import { EventsProjectPlanningPanel } from '../../../../components/saas/events/EventsProjectPlanningPanel';
import { EventsQuoteEditModal } from '../../../../components/saas/events/EventsQuoteEditModal';
import {
  advanceEventStage,
  jumpToReachedStage,
  loadEventById,
  loadEventServices,
  parseQuoteLines,
  resolveEventsUserId,
  retreatEventStage,
} from '../../../../lib/eventsFlow';
import { ensureEventPortableTpv } from '../../../../lib/eventsPortableTpv';
import {
  notifyDeliveryActiveStoreChanged,
  writeDeliveryOpsSelectedPdvId,
} from '../../../../lib/deliveryOpsPdvSelection';
import { EVENTS_CEO_TPV_PATH } from '../../../../lib/retailOpsPaths';
import { saasPathWithBusinessScope } from '../../../../lib/businessScopeUrl';
import { downloadEventQuotePdf, sendEventQuoteByEmailRequest, sendEventReviewInviteRequest, summarizeEventFinancials } from '../../../../lib/eventsFinance';
import { resolveBusinessScopeId } from '../../../../lib/deliverySetup';
import {
  canAdvanceTo,
  canJumpToReachedStage,
  EVENT_CONTRACT_STAGES,
  furthestReachedStage,
  stageOrder,
  type EventContractStage,
  type EventRecord,
  type EventServiceRecord,
} from '../../../../lib/eventsTypes';
import { EventContractStepper, EventStageBadge } from '../../../../components/saas/events/EventContractStepper';
import { EventsStageMetrics } from '../../../../components/saas/events/EventsStagePulse';
import { EventsStagePaymentCard, formatEventPaymentBreakdown } from '../../../../components/saas/events/EventsStagePaymentCard';
import { EventsQuoteSettingsModal } from '../../../../components/saas/events/EventsQuoteSettingsModal';
import {
  loadEventsQuoteSettings,
  shouldAutoSendReviewOnFinish,
} from '../../../../lib/eventsQuoteSettings';
import { formatMoneyEs, formatQtyEs } from '../../../../lib/formatNumberEs';
import { currentStageDwellLabel } from '../../../../lib/eventsStageTiming';
import { formatDateTimeEs } from '../../../../lib/formatDateEs';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../../../lib/vertialUiTokens';
import {
  addEventToPhoneCalendar,
  calendarIcsFromParts,
} from '../../../../lib/calendarIcs';
import {
  ArrowLeft, Loader2, Send, CheckCircle2, FileSignature, CalendarCheck,
  MapPin, Phone, Mail, RefreshCw, FileDown, Link2, Pencil, Settings, Download, Copy, Monitor,
} from 'lucide-react';

type TabId = 'resumen' | 'planificacion' | 'finanzas';

const STAGE_ACTIONS: Partial<Record<EventContractStage, { label: string; icon: typeof Send; next: EventContractStage }>> = {
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
  const dataUserId = useMemo(
    () => resolveEventsUserId(user, currentBusiness),
    [user, currentBusiness],
  );
  const businessId = resolveBusinessScopeId(currentBusiness);
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [tab, setTab] = useState<TabId>('resumen');
  const [sendEmail, setSendEmail] = useState('');
  const [clientAcceptUrl, setClientAcceptUrl] = useState('');
  const [services, setServices] = useState<EventServiceRecord[]>([]);
  const [showQuoteEditor, setShowQuoteEditor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const prevEstadoRef = useRef<string | null>(null);

  const businessIssuer = useMemo(() => ({
    name: currentBusiness?.name,
    taxId: currentBusiness?.taxId,
    address: currentBusiness?.address,
    phone: currentBusiness?.phone,
    email: currentBusiness?.email,
    logo: currentBusiness?.logo,
  }), [currentBusiness]);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!dataUserId || !eventId) return;
    if (!opts?.silent) setLoading(true);
    try {
      const loaded = await loadEventById(dataUserId, eventId);
      setEvent((prev) => {
        if (!loaded) {
          // Un listado vacío / recarga en segundo plano no puede borrar la ficha en pantalla.
          return opts?.silent ? prev : (prev && prev._id === eventId ? prev : null);
        }
        if (
          prev
          && prev._id === loaded._id
          && String(prev.updatedAt || '') > String(loaded.updatedAt || '')
        ) {
          return prev;
        }
        return loaded;
      });
      if (loaded && !opts?.silent) {
        setSendEmail(String(loaded.clientEmail || '').trim());
      } else if (loaded?.clientEmail && opts?.silent) {
        // Solo sincroniza si el usuario no está editando a mano: si el campo está vacío o igual al guardado
        setSendEmail((prev) => {
          const saved = String(loaded.clientEmail || '').trim();
          if (!prev.trim() || prev.trim() === saved) return saved;
          return prev;
        });
      }
    } catch {
      if (!opts?.silent) {
        toast.error('No se pudo cargar la contratación. Recarga la página.');
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [dataUserId, eventId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Eventos sin código TPV (creados antes): generar PDV temporal en silencio.
  useEffect(() => {
    if (!dataUserId || !event || event.estado === 'cancelado') return;
    if (String(event.portableTerminalCode || '').trim()) return;
    let cancelled = false;
    void ensureEventPortableTpv(dataUserId, event, currentBusiness)
      .then((next) => {
        if (cancelled || !next?.portableTerminalCode) return;
        setEvent(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dataUserId, event?._id, event?.portableTerminalCode, event?.estado, currentBusiness]);

  // Mientras espera respuesta del cliente, refrescar el estado periódicamente.
  useEffect(() => {
    if (!event || event.estado !== 'enviado') return;
    const id = window.setInterval(() => { void refresh({ silent: true }); }, 4000);
    const onFocus = () => { void refresh({ silent: true }); };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [event?.estado, event?._id, refresh]);

  useEffect(() => {
    if (!event?.estado) return;
    if (prevEstadoRef.current === 'enviado' && event.estado === 'aceptado') {
      toast.success('El cliente ha aceptado el presupuesto');
    }
    prevEstadoRef.current = event.estado;
  }, [event?.estado]);

  const canEdit = Boolean(event) && event?.estado !== 'cancelado';

  useEffect(() => {
    if (!dataUserId || !canEdit) return;
    void loadEventServices(dataUserId).then(setServices).catch(() => setServices([]));
  }, [dataUserId, canEdit]);

  const lineas = useMemo(() => parseQuoteLines(event?.lineasPresupuesto), [event?.lineasPresupuesto]);
  const action = event ? STAGE_ACTIONS[event.estado] : null;
  const showPlanningTab = event && ['contratado', 'planificacion', 'en_curso', 'finalizado'].includes(event.estado);
  const sendEmailTrimmed = sendEmail.trim().toLowerCase();
  const canSendEmail = Boolean(sendEmailTrimmed && sendEmailTrimmed.includes('@'));

  const handleSendQuote = async (resend = false) => {
    if (!dataUserId || !event) return;
    if (!canSendEmail) {
      toast.error('Indica un email válido para enviar el presupuesto');
      return;
    }
    setActing(true);
    try {
      const result = await sendEventQuoteByEmailRequest(dataUserId, event._id, businessIssuer, {
        clientEmail: sendEmailTrimmed,
      });
      setEvent(result.event);
      setSendEmail(String(result.event.clientEmail || sendEmailTrimmed).trim());
      if (result.acceptUrl) setClientAcceptUrl(result.acceptUrl);
      toast.success(
        resend
          ? `Presupuesto reenviado a ${result.event.clientEmail || sendEmailTrimmed}`
          : `Presupuesto enviado a ${result.event.clientEmail || sendEmailTrimmed}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo enviar el presupuesto');
    } finally {
      setActing(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!event) return;
    try {
      downloadEventQuotePdf(event, businessIssuer);
      toast.success('PDF descargado');
    } catch {
      toast.error('No se pudo generar el PDF');
    }
  };

  const handleCopyAcceptLink = async () => {
    if (!clientAcceptUrl) {
      toast.error('Envía el presupuesto primero para obtener el enlace');
      return;
    }
    try {
      await navigator.clipboard.writeText(clientAcceptUrl);
      toast.success('Enlace de aceptación copiado');
    } catch {
      toast.error('No se pudo copiar el enlace');
    }
  };

  const handleSelectStage = async (target: EventContractStage) => {
    if (!dataUserId || !event || target === event.estado) return;
    if (canAdvanceTo(event.estado, target)) {
      await handleAdvance(target);
      return;
    }
    const furthest = furthestReachedStage(event);
    if (!canJumpToReachedStage(event.estado, target, furthest)) return;
    const goingBack = stageOrder(target) < stageOrder(event.estado);
    const fromLate = ['contratado', 'planificacion', 'en_curso', 'finalizado'].includes(event.estado);
    const label = EVENT_CONTRACT_STAGES.find((s) => s.id === target)?.label || target;
    if (goingBack && fromLate && !window.confirm(`¿Volver a ${label}? Podrás continuar otra vez desde ahí.`)) return;
    setActing(true);
    try {
      const updated = goingBack
        ? await retreatEventStage(dataUserId, event, target)
        : await jumpToReachedStage(dataUserId, event, target);
      setEvent(updated);
      if (target === 'planificacion' || target === 'en_curso') setTab('planificacion');
      else if (target === 'contratado') setTab('finanzas');
      else setTab('resumen');
      toast.success(goingBack ? `Volviste a ${label}` : `Continúas en ${label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : goingBack ? 'No se pudo volver atrás' : 'No se pudo avanzar');
    } finally {
      setActing(false);
    }
  };

  const trySendReviewOnFinish = async (finished: EventRecord) => {
    if (!dataUserId) return finished;
    const settings = loadEventsQuoteSettings(businessId || '');
    if (!shouldAutoSendReviewOnFinish(settings, finished)) {
      if (settings.reviewAutoSendOnFinish && settings.reviewUrl.trim() && !String(finished.clientEmail || '').trim()) {
        toast.message('Evento finalizado. Falta email del cliente para enviar la reseña.');
      }
      return finished;
    }
    try {
      const result = await sendEventReviewInviteRequest(dataUserId, finished._id, {
        reviewUrl: settings.reviewUrl,
        message: settings.reviewMessage,
        clientEmail: finished.clientEmail,
        companyName: currentBusiness?.name || '',
      });
      if (result.alreadySent) return result.event || finished;
      toast.success(`Reseña enviada a ${result.sentTo || finished.clientEmail}`);
      return result.event || finished;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo enviar la reseña');
      return finished;
    }
  };

  const handleAdvance = async (target: EventContractStage) => {
    if (!dataUserId || !event) return;
    if (!canAdvanceTo(event.estado, target)) {
      toast.error('No se puede avanzar a esa fase');
      return;
    }
    setActing(true);
    try {
      let updated = await advanceEventStage(dataUserId, event, target);
      if (target === 'aceptado') prevEstadoRef.current = 'aceptado';
      if (target === 'finalizado') {
        updated = await trySendReviewOnFinish(updated);
      }
      setEvent(updated);
      if (target === 'contratado') setTab('finanzas');
      if (target === 'planificacion') setTab('planificacion');
      toast.success(
        target === 'aceptado'
          ? 'Presupuesto marcado como aceptado'
          : target === 'finalizado'
            ? 'Evento finalizado'
            : 'Fase actualizada',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al avanzar');
    } finally {
      setActing(false);
    }
  };

  const handleMarkAccepted = async () => {
    if (!dataUserId || !event) return;
    if (event.estado === 'enviado') {
      await handleAdvance('aceptado');
      return;
    }
    if (event.estado !== 'presupuesto') return;
    setActing(true);
    try {
      const sent = await advanceEventStage(dataUserId, event, 'enviado');
      const updated = await advanceEventStage(dataUserId, sent, 'aceptado');
      prevEstadoRef.current = 'aceptado';
      setEvent(updated);
      toast.success('Presupuesto marcado como aceptado');
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className={`${VERTIAL_BTN_SECONDARY} !px-3`}
              title="Ajustes (reseña, presupuesto…)"
              aria-label="Ajustes de eventos"
            >
              <Settings className="w-4 h-4" />
            </button>
            <div className="text-right">
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{formatMoneyEs(Number(event.presupuesto) || 0)}</p>
              <p className="text-xs text-stone-500 mt-1 max-w-xs ml-auto">
                {formatEventPaymentBreakdown(event)}
                {' · '}este paso {currentStageDwellLabel(event)}
              </p>
            </div>
          </div>
        </header>

        <EventsQuoteSettingsModal
          open={showSettings}
          businessId={businessId || ''}
          onClose={() => setShowSettings(false)}
        />

        <EventsStageMetrics event={event} />

        <EventContractStepper
          current={event.estado}
          event={event}
          onSelectStep={(stage) => void handleSelectStage(stage)}
        />

        {action && event.estado !== 'presupuesto' && event.estado !== 'enviado' && event.estado !== 'aceptado' && event.estado !== 'en_curso' ? (
          <button
            type="button"
            disabled={acting}
            onClick={() => void handleAdvance(action.next)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <action.icon className="w-4 h-4" />}
            {action.label}
          </button>
        ) : null}

        {event.estado === 'en_curso' && action ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3 dark:border-stone-800 dark:bg-stone-950">
            <EventsStagePaymentCard
              mode="final"
              event={event}
              userId={dataUserId}
              business={businessIssuer}
              onEventUpdated={setEvent}
            />
            <button
              type="button"
              disabled={acting}
              onClick={() => {
                const fin = summarizeEventFinancials(event);
                if (fin.pendiente > 0.01) {
                  const ok = window.confirm(
                    `Aún falta ${formatMoneyEs(fin.pendiente)}. ¿Finalizar el evento con saldo pendiente?`,
                  );
                  if (!ok) return;
                }
                void handleAdvance(action.next);
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <action.icon className="w-4 h-4" />}
              {action.label}
            </button>
          </div>
        ) : null}

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
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Datos del evento</h2>
                <div className="flex flex-wrap items-center gap-2">
                  {String(event.fecha || '').trim() ? (
                    <button
                      type="button"
                      onClick={() => {
                        const icsEv = calendarIcsFromParts({
                          uid: `vertial-event-${event._id}@vertial.app`,
                          title: event.nombre || 'Evento Vertial',
                          description: [
                            event.cliente ? `Cliente: ${event.cliente}` : '',
                            event.lugar || '',
                            typeof window !== 'undefined'
                              ? `Abrir en Vertial: ${window.location.origin}/saas/vertical/eventos/${encodeURIComponent(event._id)}`
                              : '',
                          ].filter(Boolean).join('\n'),
                          location: event.lugar || '',
                          date: event.fecha,
                        });
                        const channel = addEventToPhoneCalendar(icsEv);
                        toast.success(
                          channel === 'ics'
                            ? 'Se abre Calendario — añade el evento para avisos en el iPhone'
                            : 'Se abre Google Calendar — confirma el evento para recibir avisos en el móvil',
                        );
                      }}
                      className={`${VERTIAL_BTN_SECONDARY} min-h-10 px-3 py-2`}
                    >
                      <Download className="w-4 h-4" />
                      Añadir al calendario
                    </button>
                  ) : null}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setShowQuoteEditor(true)}
                      className={`${VERTIAL_BTN_SECONDARY} min-h-10 px-3 py-2`}
                    >
                      <Pencil className="w-4 h-4" />
                      Editar
                    </button>
                  )}
                </div>
              </div>
              <dl className="grid sm:grid-cols-2 gap-3 text-sm">
                <div><dt className="text-gray-500">Cliente</dt><dd className="font-medium">{event.cliente}</dd></div>
                <div><dt className="text-gray-500">Personas</dt><dd className="font-medium">{event.invitados || '—'}</dd></div>
                <div className="sm:col-span-2 flex items-start gap-1"><MapPin className="w-4 h-4 text-gray-400 mt-0.5" /><dd>{event.lugar || '—'}</dd></div>
                {event.clientEmail && <div className="flex items-center gap-1"><Mail className="w-4 h-4 text-gray-400" />{event.clientEmail}</div>}
                {event.clientTelefono && <div className="flex items-center gap-1"><Phone className="w-4 h-4 text-gray-400" />{event.clientTelefono}</div>}
              </dl>
              <h3 className="font-semibold text-sm pt-2">Presupuesto</h3>
              {lineas.length > 0 ? (
                <ul className="text-sm divide-y divide-gray-100 dark:divide-gray-800">
                  {lineas.map((l) => (
                    <li key={l.id} className="flex justify-between gap-3 py-2">
                      <span className="min-w-0">{l.concepto} × {formatQtyEs(l.cantidad)}</span>
                      <span className="shrink-0 font-medium tabular-nums">{formatMoneyEs(l.total)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Sin partidas todavía.</p>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                <p className="font-bold tabular-nums">{formatMoneyEs(Number(event.presupuesto) || 0)}</p>
              </div>
            </section>

            {String(event.portableTerminalCode || '').trim() ? (
              <section className="rounded-2xl border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-[#2563EB]" />
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100">Código TPV del evento</h2>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  En la tablet, entra con este código: carga solo los productos de este evento.
                </p>
                <p className="text-3xl font-bold tracking-[0.2em] tabular-nums text-[#2563EB]">
                  {String(event.portableTerminalCode).trim().toUpperCase()}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`${VERTIAL_BTN_SECONDARY} text-sm`}
                    onClick={() => {
                      void navigator.clipboard.writeText(String(event.portableTerminalCode || '').trim().toUpperCase())
                        .then(() => toast.success('Código TPV copiado'))
                        .catch(() => toast.error('No se pudo copiar'));
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar
                  </button>
                  <button
                    type="button"
                    className={`${VERTIAL_BTN_PRIMARY} text-sm`}
                    onClick={() => {
                      const pdvId = String(event.portablePdvId || '').trim();
                      if (!pdvId) {
                        toast.error('Este evento aún no tiene PDV listo. Genera el TPV portátil otra vez.');
                        return;
                      }
                      if (businessId && dataUserId) {
                        writeDeliveryOpsSelectedPdvId(businessId, dataUserId, pdvId);
                        notifyDeliveryActiveStoreChanged();
                      }
                      navigate(saasPathWithBusinessScope(EVENTS_CEO_TPV_PATH, businessId));
                    }}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    Ir a TPV
                  </button>
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5 space-y-3">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Siguiente paso</h2>

              {event.estado === 'cancelado' || event.estado === 'finalizado' ? (
                <p className="text-sm text-gray-500">Operación cerrada.</p>
              ) : null}

              {(event.estado === 'presupuesto' || event.estado === 'enviado') && (
                <div className="space-y-3">
                  {event.estado === 'enviado' && (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 dark:border-sky-800 dark:bg-sky-950/30">
                      <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">Estado: enviado</p>
                      <p className="mt-0.5 text-xs text-sky-700/90 dark:text-sky-300/90">
                        Esperando que el cliente acepte o rechace desde el correo.
                      </p>
                      {event.quoteSentAt && (
                        <p className="mt-1 text-[11px] text-sky-600/80 dark:text-sky-400/80">
                          Enviado el {formatDateTimeEs(event.quoteSentAt)}
                        </p>
                      )}
                    </div>
                  )}

                  {event.estado === 'presupuesto' && event.quoteRejectedAt && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/30">
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Presupuesto rechazado</p>
                      <p className="mt-0.5 text-xs text-amber-700/90 dark:text-amber-300/90">
                        Puedes ajustar el presupuesto y enviarlo de nuevo.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Email de envío
                    </label>
                    <input
                      type="email"
                      value={sendEmail}
                      onChange={(e) => setSendEmail(e.target.value)}
                      placeholder="cliente@email.com"
                      className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      Puedes cambiarlo antes de enviar o reenviar.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={acting || !canSendEmail}
                    onClick={() => void handleSendQuote(event.estado === 'enviado')}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {acting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : event.estado === 'enviado' ? (
                      <RefreshCw className="w-4 h-4" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {event.estado === 'enviado' ? 'Enviar de nuevo' : 'Enviar presupuesto'}
                  </button>

                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      disabled={acting}
                      onClick={handleDownloadPdf}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      Descargar PDF
                    </button>
                    {event.estado === 'enviado' && (
                      <button
                        type="button"
                        disabled={acting || !clientAcceptUrl}
                        onClick={() => void handleCopyAcceptLink()}
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 disabled:opacity-50"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        Copiar enlace del cliente
                      </button>
                    )}
                  </div>
                  {event.estado === 'presupuesto' && (
                    <>
                      <button
                        type="button"
                        disabled={acting}
                        onClick={() => void handleAdvance('enviado')}
                        className={`${VERTIAL_BTN_SECONDARY} w-full`}
                      >
                        {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Continuar sin enviar
                      </button>
                      <button
                        type="button"
                        disabled={acting}
                        onClick={() => void handleMarkAccepted()}
                        className={`${VERTIAL_BTN_SECONDARY} w-full`}
                      >
                        {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Marcar como aceptado
                      </button>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Si el cliente ya aceptó en persona o el email no sale, avanza aquí sin enviarlo.
                      </p>
                    </>
                  )}
                  {event.estado === 'enviado' && (
                    <>
                      <button
                        type="button"
                        disabled={acting}
                        onClick={() => void handleMarkAccepted()}
                        className={VERTIAL_BTN_PRIMARY + ' w-full'}
                      >
                        {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Marcar como aceptado
                      </button>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Si el cliente ya aceptó por el correo o en persona, pulsa aquí para continuar.
                      </p>
                    </>
                  )}
                </div>
              )}

              {event.estado === 'aceptado' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-800 dark:bg-emerald-950/30">
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Presupuesto aceptado</p>
                    <p className="mt-0.5 text-xs text-emerald-700/90 dark:text-emerald-300/90">
                      Registra la señal aquí y pasa a contratado.
                    </p>
                  </div>
                  {dataUserId ? (
                    <EventsStagePaymentCard
                      mode="deposit"
                      event={event}
                      userId={dataUserId}
                      business={businessIssuer}
                      onEventUpdated={setEvent}
                      onDepositDoneAdvance={async (updated) => {
                        if (updated.estado !== 'aceptado') return;
                        setActing(true);
                        try {
                          const next = await advanceEventStage(dataUserId, updated, 'contratado');
                          setEvent(next);
                          toast.success('Contrato / señal: paso a contratado');
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'No se pudo avanzar');
                        } finally {
                          setActing(false);
                        }
                      }}
                    />
                  ) : null}
                  {event.depositPaidAt ? (
                    <button
                      type="button"
                      disabled={acting}
                      onClick={() => void handleAdvance('contratado')}
                      className={VERTIAL_BTN_PRIMARY + ' w-full'}
                    >
                      {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
                      Continuar a contratado
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={acting}
                      onClick={() => void handleAdvance('contratado')}
                      className={`${VERTIAL_BTN_SECONDARY} w-full`}
                    >
                      {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
                      Continuar sin registrar señal
                    </button>
                  )}
                </div>
              )}

              {['contratado', 'planificacion'].includes(event.estado) && dataUserId && !event.depositPaidAt ? (
                <EventsStagePaymentCard
                  mode="deposit"
                  event={event}
                  userId={dataUserId}
                  business={businessIssuer}
                  onEventUpdated={setEvent}
                />
              ) : null}

              {['contratado', 'planificacion'].includes(event.estado) && event.depositPaidAt ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                  {formatEventPaymentBreakdown(event)}
                </p>
              ) : null}

              {event.estado === 'finalizado' && dataUserId ? (
                <div className="space-y-3">
                  <EventsStagePaymentCard
                    mode="final"
                    event={event}
                    userId={dataUserId}
                    business={businessIssuer}
                    onEventUpdated={setEvent}
                  />
                  {event.reviewInviteSentAt ? (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                      Reseña enviada el {formatDateTimeEs(event.reviewInviteSentAt)}
                    </p>
                  ) : (
                    <p className="text-[11px] text-stone-500">
                      Si activas la reseña automática en ajustes (engranaje), se envía al finalizar.
                    </p>
                  )}
                </div>
              ) : null}

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
          <EventsProjectPlanningPanel
            event={event}
            userId={dataUserId}
            businessId={businessId}
            canEdit={canEdit && event.estado !== 'finalizado'}
            onEventUpdated={setEvent}
            onMarkReady={
              event.estado === 'planificacion'
                ? () => { void handleAdvance('en_curso'); }
                : undefined
            }
          />
        )}

        {tab === 'finanzas' && (
          <EventsProjectFinancePanel
            event={event}
            business={businessIssuer}
            userId={dataUserId}
            onEventUpdated={setEvent}
          />
        )}
      </div>

      {canEdit && (
        <EventsQuoteEditModal
          open={showQuoteEditor}
          onClose={() => setShowQuoteEditor(false)}
          userId={dataUserId}
          event={event}
          services={services}
          onSaved={(updated) => {
            setEvent(updated);
            setSendEmail(String(updated.clientEmail || '').trim());
          }}
        />
      )}
    </Layout>
  );
}
