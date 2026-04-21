import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import {
  Wrench,
  Car,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Phone,
  Calendar,
  ChevronRight,
  Timer,
} from 'lucide-react';

// ─── Types (minimal, no auth) ─────────────────────────────────────────────────

type WorkOrderStatus = 'pending' | 'in_progress' | 'completed' | 'invoiced' | 'cancelled';

interface StageEvent {
  status: WorkOrderStatus;
  date: string;
  user: string;
  notes?: string;
}

interface PublicWorkOrder {
  _id: string;
  woNumber: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleMileage?: number;
  clientName: string;
  clientPhone?: string;
  status: WorkOrderStatus;
  serviceType: string;
  description: string;
  responsible: string;
  estimatedCompletion?: string;
  stageHistory: StageEvent[];
  createdAt: string;
  updatedAt: string;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; color: string; bg: string; border: string; icon: React.ReactNode; step: number }> = {
  pending:     { label: 'Pendiente',   color: 'text-amber-700',  bg: 'bg-amber-100',  border: 'border-amber-300',  icon: <Clock className="w-5 h-5" />,        step: 1 },
  in_progress: { label: 'En taller',   color: 'text-blue-700',   bg: 'bg-blue-100',   border: 'border-blue-300',   icon: <Wrench className="w-5 h-5" />,        step: 2 },
  completed:   { label: 'Listo',       color: 'text-green-700',  bg: 'bg-green-100',  border: 'border-green-300',  icon: <CheckCircle2 className="w-5 h-5" />,  step: 3 },
  invoiced:    { label: 'Entregado',   color: 'text-purple-700', bg: 'bg-purple-100', border: 'border-purple-300', icon: <CheckCircle2 className="w-5 h-5" />,  step: 4 },
  cancelled:   { label: 'Cancelada',   color: 'text-gray-500 dark:text-gray-400',   bg: 'bg-gray-100 dark:bg-gray-700',   border: 'border-gray-300',   icon: <AlertTriangle className="w-5 h-5" />, step: 0 },
};

const SERVICE_LABELS: Record<string, string> = {
  revision: 'Revisión',
  reparacion: 'Reparación',
  mantenimiento: 'Mantenimiento',
  puesta_punto: 'Puesta a punto',
  garantia: 'Garantía',
  otro: 'Otro',
};

const STEPS = [
  { status: 'pending'     as WorkOrderStatus, label: 'Recibido' },
  { status: 'in_progress' as WorkOrderStatus, label: 'En taller' },
  { status: 'completed'   as WorkOrderStatus, label: 'Listo' },
  { status: 'invoiced'    as WorkOrderStatus, label: 'Entregado' },
];

// ─── Public API call (no auth) ────────────────────────────────────────────────

function getApiBase() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const protocol = typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'http';
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const port = env.VITE_API_PORT || '3001';
  return `${protocol}://${host}:${port}`;
}

async function fetchPublicWorkOrder(workOrderId: string): Promise<PublicWorkOrder | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/workshop/public/${encodeURIComponent(workOrderId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.workOrder || null;
  } catch {
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkOrderStatus() {
  const { workOrderId } = useParams<{ workOrderId: string }>();
  const [order, setOrder] = useState<PublicWorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!workOrderId) { setNotFound(true); setLoading(false); return; }
    fetchPublicWorkOrder(workOrderId).then(data => {
      if (data) setOrder(data);
      else setNotFound(true);
      setLoading(false);
    });
  }, [workOrderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando estado de tu vehículo...</p>
        </div>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Wrench className="w-8 h-8 text-gray-500 dark:text-gray-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Orden no encontrada</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            El enlace puede haber caducado o la orden no existe.
            Contacta con el taller para más información.
          </p>
        </div>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[order.status];
  const currentStep = cfg.step;
  const history = [...(order.stageHistory || [])].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      {/* Header */}
      <div className="bg-gray-900 text-white px-4 py-5">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-gray-700 rounded-xl flex items-center justify-center">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500">Estado de tu vehículo</div>
              <div className="font-bold font-mono text-lg">{order.woNumber}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Status card */}
        <div className={`p-5 rounded-2xl border-2 ${cfg.bg} ${cfg.border}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.bg} ${cfg.color}`}>
              {cfg.icon}
            </div>
            <div>
              <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Estado actual</div>
              <div className={`text-xl font-bold ${cfg.color}`}>{cfg.label}</div>
            </div>
          </div>
          {order.estimatedCompletion && order.status !== 'completed' && order.status !== 'invoiced' && (
            <div className="flex items-center gap-2 mt-3 text-sm text-gray-700 dark:text-gray-300">
              <Calendar className="w-4 h-4" />
              Entrega estimada: <strong>{new Date(order.estimatedCompletion).toLocaleDateString('es-ES', { dateStyle: 'long' })}</strong>
            </div>
          )}
        </div>

        {/* Progress stepper */}
        {order.status !== 'cancelled' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 text-sm uppercase tracking-wide">Progreso</h3>
            <div className="flex items-center justify-between relative">
              {/* Progress line */}
              <div className="absolute left-0 right-0 top-4 h-0.5 bg-gray-200 z-0" />
              <div
                className="absolute left-0 top-4 h-0.5 bg-green-500 z-0 transition-all duration-700"
                style={{ width: `${Math.max(0, ((currentStep - 1) / (STEPS.length - 1)) * 100)}%` }}
              />
              {STEPS.map((step, idx) => {
                const stepNum = idx + 1;
                const done = currentStep > stepNum;
                const active = currentStep === stepNum;
                return (
                  <div key={step.status} className="flex flex-col items-center gap-2 z-10">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                      done ? 'bg-green-500 border-green-500 text-white' :
                      active ? 'bg-white dark:bg-gray-800 border-gray-900 text-gray-900 dark:text-gray-100 shadow-md' :
                      'bg-white dark:bg-gray-800 border-gray-300 text-gray-400 dark:text-gray-500'
                    }`}>
                      {done ? <CheckCircle2 className="w-4 h-4" /> : stepNum}
                    </div>
                    <span className={`text-xs font-medium text-center ${active ? 'text-gray-900 dark:text-gray-100 font-bold' : done ? 'text-green-700' : 'text-gray-400 dark:text-gray-500'}`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Vehicle info */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
            <Car className="w-4 h-4" /> Tu vehículo
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Vehículo</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{order.vehicleBrand} {order.vehicleModel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Matrícula</span>
              <span className="font-mono font-bold text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-lg">{order.vehiclePlate}</span>
            </div>
            {order.vehicleMileage && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Kilómetros</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{order.vehicleMileage.toLocaleString('es-ES')} km</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-400">Tipo de servicio</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-lg">
                {SERVICE_LABELS[order.serviceType] || order.serviceType}
              </span>
            </div>
          </div>
        </div>

        {/* Work description */}
        {order.description && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2 text-sm uppercase tracking-wide flex items-center gap-2">
              <Wrench className="w-4 h-4" /> Trabajo a realizar
            </h3>
            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{order.description}</p>
            {order.responsible && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Mecánico: <strong>{order.responsible}</strong>
              </p>
            )}
          </div>
        )}

        {/* Timeline */}
        {history.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 text-sm uppercase tracking-wide flex items-center gap-2">
              <Timer className="w-4 h-4" /> Historial de cambios
            </h3>
            <div className="space-y-3">
              {history.map((event, idx) => {
                const ecfg = STATUS_CONFIG[event.status];
                return (
                  <div key={idx} className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${ecfg?.bg || 'bg-gray-100 dark:bg-gray-700'} ${ecfg?.color || 'text-gray-600 dark:text-gray-400'}`}>
                      {ecfg?.icon || <ChevronRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{ecfg?.label || event.status}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(event.date).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                      {event.notes && <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{event.notes}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Contact */}
        {order.clientPhone && (
          <div className="bg-gray-900 text-white rounded-2xl p-5 flex items-center justify-between">
            <div>
              <div className="font-bold">{order.clientName}</div>
              <div className="text-sm text-gray-400 dark:text-gray-500">Para consultas llama al taller</div>
            </div>
            <a
              href={`tel:${order.clientPhone}`}
              className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center hover:bg-green-700 transition-colors"
            >
              <Phone className="w-5 h-5" />
            </a>
          </div>
        )}

        <div className="text-center text-xs text-gray-400 dark:text-gray-500 pb-6">
          Última actualización: {new Date(order.updatedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
        </div>
      </div>
    </div>
  );
}
