import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  CalendarDays,
  ClipboardList,
  FileText,
  MessageSquare,
  ChevronRight,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Timer,
  ChefHat,
  Wrench,
  SprayCan,
  ShoppingCart,
  ArrowRight,
  Recycle,
  Music,
  Scissors,
  Building2,
  PartyPopper,
  HardHat,
  PawPrint,
  Scale,
  Cigarette,
  GraduationCap,
  Dumbbell,
  Stethoscope,
  Hotel,
  CarTaxiFront,
  Droplets,
  Beef,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import type { BusinessType } from '../../../lib/businessApi';
import { WorkerClockInCard } from '../../../components/saas/worker/WorkerClockInCard';
import { WorkerAssignmentsCard } from '../../../components/saas/worker/WorkerAssignmentsCard';
import { AUTH_PATHS } from '../../../lib/authEntryPaths';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  color: string;
}

const TPV_VERTICAL_CONFIG: Partial<Record<BusinessType, { label: string; description: string; icon: React.ReactNode; gradient: string; path?: string }>> = {
  delivery:      { label: 'Cocina y Pedidos',   description: 'Gestiona pedidos, cocina, montaje y reparto',         icon: <ChefHat className="w-6 h-6" />,       gradient: 'from-orange-500 to-red-600' },
  workshop:      { label: 'Taller Mecánico',     description: 'Órdenes de trabajo, temporizador y fotos',           icon: <Wrench className="w-6 h-6" />,        gradient: 'from-blue-500 to-indigo-600' },
  cleaning:      { label: 'Servicios Limpieza',  description: 'Check-in, checklist de tareas y cobro',              icon: <SprayCan className="w-6 h-6" />,      gradient: 'from-cyan-500 to-teal-600' },
  carDealership: { label: 'Punto de Venta',      description: 'Catálogo, ventas y cobros rápidos',                  icon: <ShoppingCart className="w-6 h-6" />,  gradient: 'from-blue-500 to-blue-700' },
  spareParts:    { label: 'Mostrador',           description: 'Venta de recambios y gestión de stock',              icon: <ShoppingCart className="w-6 h-6" />,  gradient: 'from-violet-500 to-purple-600' },
  scrapyard:     { label: 'Mi Puesto - Desguace', description: 'Recepción, despiece, piezas y bajas de vehículos',    icon: <Recycle className="w-6 h-6" />,       gradient: 'from-gray-600 to-gray-800' },
  pharmacy:      { label: 'Dispensación',        description: 'Venta y dispensación de medicamentos',                icon: <ShoppingCart className="w-6 h-6" />,  gradient: 'from-emerald-500 to-green-600' },
  nightclub:     { label: 'Mi Puesto - Discoteca', description: 'Puerta, lista, aforo y pedidos de barra',             icon: <Music className="w-6 h-6" />,       gradient: 'from-fuchsia-600 to-purple-800' },
  hairSalon:     { label: 'Mi Puesto - Peluquería', description: 'Citas del día, servicios y cobro rápido en caja',     icon: <Scissors className="w-6 h-6" />,       gradient: 'from-violet-500 to-fuchsia-600' },
  realEstate:    { label: 'Mi Puesto - Inmobiliaria', description: 'Visitas del día, propiedades y estados rápidos',    icon: <Building2 className="w-6 h-6" />,      gradient: 'from-teal-500 to-cyan-700' },
  events:        { label: 'Operaciones eventos', description: 'Eventos de hoy, logística y coordinación en campo', icon: <PartyPopper className="w-6 h-6" />,    gradient: 'from-pink-500 to-rose-600', path: '/saas/worker/events' },
  construction:  { label: 'Mi Puesto - Obra',        description: 'Partes de trabajo, materiales y horas',             icon: <HardHat className="w-6 h-6" />,        gradient: 'from-amber-500 to-orange-700' },
  vet:           { label: 'Mi Puesto - Veterinario', description: 'Consultas, pacientes y vacunaciones',               icon: <PawPrint className="w-6 h-6" />,       gradient: 'from-lime-500 to-green-700' },
  lawyer:        { label: 'Mi Puesto - Despacho',    description: 'Expedientes, agenda y tiempo facturable',           icon: <Scale className="w-6 h-6" />,          gradient: 'from-slate-500 to-gray-700' },
  tobaccoShop:   { label: 'Mi Puesto - Estanco',     description: 'Caja rápida, lotería e inventario',                 icon: <Cigarette className="w-6 h-6" />,      gradient: 'from-yellow-600 to-amber-800' },
  butcherShop:   { label: 'Mi Puesto - Carnicería',  description: 'Mostrador, pedidos, peso y cobro rápido',            icon: <Beef className="w-6 h-6" />,           gradient: 'from-red-600 to-rose-800', path: '/saas/worker/tpv' },
  academy:       { label: 'Mi Puesto - Academia',    description: 'Clases del día, asistencia y alumnos',              icon: <GraduationCap className="w-6 h-6" />,  gradient: 'from-indigo-500 to-blue-700' },
  gym:           { label: 'Mi Puesto - Gimnasio',    description: 'Socios, clases y control de accesos',               icon: <Dumbbell className="w-6 h-6" />,       gradient: 'from-red-500 to-rose-700' },
  clinic:        { label: 'Mi Puesto - Clínica',     description: 'Consultas, pacientes e historial médico',           icon: <Stethoscope className="w-6 h-6" />,    gradient: 'from-sky-500 to-blue-600' },
  hotel:         { label: 'Mi Puesto - Recepción',   description: 'Check-in/out, habitaciones y huéspedes',            icon: <Hotel className="w-6 h-6" />,          gradient: 'from-amber-400 to-yellow-600' },
  taxi:          { label: 'Mi Puesto - Taxi',        description: 'Carreras, turnos y recaudación',                    icon: <CarTaxiFront className="w-6 h-6" />,   gradient: 'from-yellow-400 to-amber-600' },
  carWash:       { label: 'Mi Puesto - Lavadero',    description: 'Cola de vehículos, servicios y cobros',             icon: <Droplets className="w-6 h-6" />,       gradient: 'from-blue-400 to-cyan-600' },
};

export function WorkerHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const navigate = useNavigate();
  const vertical = currentBusiness?.businessType as BusinessType | undefined;
  const tpvConfig = vertical ? TPV_VERTICAL_CONFIG[vertical] : undefined;

  const businessId = currentBusiness?.business_id || user?.linkedBusinessId || '';
  const memberId = String(user?.user_id || user?.id || '').trim();
  const memberName = user?.fullName || '';

  const now = new Date();
  const greeting = now.getHours() < 12
    ? t('worker.home.goodMorning')
    : now.getHours() < 18
      ? t('worker.home.goodAfternoon')
      : t('worker.home.goodEvening');

  const quickActions: QuickAction[] = [
    { id: 'tasks', label: t('worker.home.myTasks'), icon: <ClipboardList className="w-5 h-5" />, path: '/saas/worker/tasks', color: 'bg-blue-500' },
    { id: 'calendar', label: t('worker.home.calendar'), icon: <CalendarDays className="w-5 h-5" />, path: '/saas/worker/calendar', color: 'bg-purple-500' },
    { id: 'docs', label: t('worker.home.documents'), icon: <FileText className="w-5 h-5" />, path: '/saas/worker/documents', color: 'bg-amber-500' },
    { id: 'chat', label: t('worker.home.chats'), icon: <MessageSquare className="w-5 h-5" />, path: '/saas/worker/chat', color: 'bg-emerald-500' },
  ];

  const todayTasks = [
    { id: '1', title: t('worker.home.sampleTask1'), time: '09:00 - 11:00', status: 'completed' as const },
    { id: '2', title: t('worker.home.sampleTask2'), time: '11:30 - 13:00', status: 'in_progress' as const },
    { id: '3', title: t('worker.home.sampleTask3'), time: '15:00 - 17:00', status: 'pending' as const },
  ];

  const weekStats = {
    hoursWorked: 32.5,
    tasksCompleted: 12,
    tasksPending: 5,
    punctuality: 98,
  };

  return (
    <Layout title={t('worker.home.title')} subtitle={greeting + ', ' + (user?.firstName || t('worker.home.worker'))}>
      <div className="space-y-6">
        {businessId && memberId ? (
          <div className="max-w-[380px]">
            <WorkerClockInCard
              businessId={businessId}
              memberId={memberId}
              memberName={memberName}
              size="md"
            />
          </div>
        ) : null}

        <WorkerAssignmentsCard />

        {/* TPV Module CTA */}
        {tpvConfig && (
          <button
            onClick={() => navigate(tpvConfig.path || AUTH_PATHS.tpvTabletLogin)}
            className={`relative overflow-hidden rounded-2xl p-5 text-white transition-all hover:shadow-xl active:scale-[0.99] bg-gradient-to-br ${tpvConfig.gradient}`}
          >
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-20 translate-x-20" />
            <div className="relative flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                {tpvConfig.icon}
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-base font-bold">{tpvConfig.label}</h3>
                <p className="text-white/70 text-sm">{tpvConfig.description}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-white/60" />
            </div>
          </button>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.id}
              onClick={() => navigate(action.path)}
              className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md transition-all group"
            >
              <div className={`w-10 h-10 ${action.color} rounded-lg flex items-center justify-center text-white group-hover:scale-110 transition-transform`}>
                {action.icon}
              </div>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{action.label}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Today's Tasks */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('worker.home.todayTasks')}</h3>
              <button
                onClick={() => navigate('/saas/worker/tasks')}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                {t('worker.home.viewAll')}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {todayTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  {task.status === 'completed' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  ) : task.status === 'in_progress' ? (
                    <Timer className="w-5 h-5 text-blue-500 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-gray-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                      {task.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{task.time}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    task.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : task.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
                  }`}>
                    {task.status === 'completed' ? t('worker.home.done') : task.status === 'in_progress' ? t('worker.home.inProgress') : t('worker.home.pending')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly Stats */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('worker.home.weekSummary')}</h3>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{weekStats.hoursWorked}h</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('worker.home.hoursWorked')}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{weekStats.tasksCompleted}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('worker.home.tasksCompleted')}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{weekStats.tasksPending}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('worker.home.tasksPending')}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{weekStats.punctuality}%</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('worker.home.punctuality')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
