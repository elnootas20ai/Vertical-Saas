import { useNavigate } from 'react-router';
import { CheckCircle, ArrowRight, Layers, Code, Sparkles, Target, Package, FileCheck, Users } from 'lucide-react';

export function ProjectSummary() {
  const navigate = useNavigate();

  const achievements = [
    {
      icon: <CheckCircle className="w-6 h-6" />,
      title: '100% Navegable',
      description: 'Todos los botones, links y elementos interactivos funcionan',
      color: 'green'
    },
    {
      icon: <Layers className="w-6 h-6" />,
      title: 'Design System',
      description: '7 componentes reutilizables con nomenclatura consistente',
      color: 'blue'
    },
    {
      icon: <FileCheck className="w-6 h-6" />,
      title: '152 Verificaciones',
      description: 'Sistema QA completo en 4 bloques',
      color: 'purple'
    },
    {
      icon: <Target className="w-6 h-6" />,
      title: 'Mapa de Flujo',
      description: 'Diagrama visual de toda la navegación',
      color: 'amber'
    }
  ];

  const stats = [
    { label: 'Páginas totales', value: '30+', icon: <Package className="w-5 h-5" /> },
    { label: 'Componentes DS', value: '7', icon: <Code className="w-5 h-5" /> },
    { label: 'Rutas configuradas', value: '24', icon: <ArrowRight className="w-5 h-5" /> },
    { label: 'Verificaciones QA', value: '152', icon: <FileCheck className="w-5 h-5" /> }
  ];

  const modules = [
    { name: 'Landing Page', status: 'ok', items: 'Header, Hero, Módulos, Planes, FAQ, Footer' },
    { name: 'Autenticación', status: 'ok', items: 'Entry, Login, Register, Recover, Gate' },
    { name: 'Onboarding', status: 'ok', items: '6 pasos completos con validación' },
    { name: 'Dashboard', status: 'ok', items: 'KPIs, Tabs, Alertas, Actividad reciente' },
    { name: 'Vehículos', status: 'ok', items: 'Lista, Detalle, Modales, Wizard importación' },
    { name: 'Clientes (CRM)', status: 'ok', items: 'Leads, Filtros, Detalle, Timeline' },
    { name: 'Operaciones', status: 'ok', items: 'Lista, Detalle, Pipeline, Estados' },
    { name: 'Ventas', status: 'ok', items: 'Módulo completo con filtros' },
    { name: 'Finanzas', status: 'ok', items: 'KPIs, Gráficos, Exportación' },
    { name: 'Documentos', status: 'ok', items: 'Lista, Estados, Firma digital' },
    { name: 'Ubicaciones', status: 'ok', items: 'Gestión de plazas y espacios' },
    { name: 'Equipo', status: 'ok', items: 'Miembros, Roles, Invitaciones' },
    { name: 'Llamadas IA', status: 'ok', items: 'Integración preparada' },
    { name: 'ANCOVE', status: 'ok', items: 'Conexión lista' },
    { name: 'Configuración', status: 'ok', items: 'Tabs completas, Facturación, Notificaciones' }
  ];

  const designSystem = [
    { name: 'WEB__Button', description: 'Botones para landing (4 variantes)' },
    { name: 'ACCESO__Input', description: 'Inputs para formularios con estados' },
    { name: 'SAAS__ComingSoonModal', description: 'Modal reutilizable "Próximamente"' },
    { name: 'SAAS__PageHeader', description: 'Cabecera con breadcrumb y acciones' },
    { name: 'SAAS__DataTable', description: 'Tabla con loading y empty states' },
    { name: 'NavigationFlowMap', description: 'Mapa visual de navegación' },
    { name: 'QAChecklist', description: 'Sistema de verificación por bloques' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-16 h-16 bg-[#0f1419] rounded-xl shadow-lg" />
            <h1 className="text-5xl font-bold text-gray-900 dark:text-gray-100">Udar Edge</h1>
          </div>
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 px-4 py-2 rounded-full mb-4">
            <CheckCircle className="w-5 h-5" />
            <span className="font-semibold">Prototipo 100% Navegable</span>
          </div>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            Software de gestión completo para compraventas de coches en España
          </p>
        </div>

        {/* Key Achievements */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {achievements.map((achievement, index) => (
            <div
              key={index}
              className={`bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border-2 border-${achievement.color}-200`}
            >
              <div className={`w-12 h-12 bg-${achievement.color}-100 rounded-xl flex items-center justify-center mb-4 text-${achievement.color}-600`}>
                {achievement.icon}
              </div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">{achievement.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{achievement.description}</p>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-12">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-500" />
            Estadísticas del Proyecto
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <div key={index} className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="flex items-center justify-center text-gray-500 dark:text-gray-400 mb-2">
                  {stat.icon}
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">{stat.value}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Modules Grid */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-12">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-500" />
            Módulos Implementados
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map((module, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl"
              >
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{module.name}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{module.items}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Design System */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-12">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
            <Code className="w-6 h-6 text-purple-500" />
            Design System Creado
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {designSystem.map((component, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-4 bg-purple-50 border border-purple-200 rounded-xl"
              >
                <div className="w-2 h-2 bg-purple-600 rounded-full mt-2 flex-shrink-0" />
                <div>
                  <div className="font-mono font-semibold text-purple-900">{component.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{component.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* QA System */}
        <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-2xl shadow-lg p-8 text-white mb-12">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <FileCheck className="w-6 h-6" />
            Sistema de QA Completo
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white/20 backdrop-blur rounded-xl p-4 text-center">
              <div className="text-3xl font-bold mb-1">4</div>
              <div className="text-sm opacity-90">Bloques</div>
            </div>
            <div className="bg-white/20 backdrop-blur rounded-xl p-4 text-center">
              <div className="text-3xl font-bold mb-1">152</div>
              <div className="text-sm opacity-90">Verificaciones</div>
            </div>
            <div className="bg-white/20 backdrop-blur rounded-xl p-4 text-center">
              <div className="text-3xl font-bold mb-1">30+</div>
              <div className="text-sm opacity-90">Páginas auditadas</div>
            </div>
            <div className="bg-white/20 backdrop-blur rounded-xl p-4 text-center">
              <div className="text-3xl font-bold mb-1">100%</div>
              <div className="text-sm opacity-90">Cobertura</div>
            </div>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => navigate('/qa')}
              className="flex-1 bg-white dark:bg-gray-800 text-green-600 px-6 py-3 rounded-xl font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
            >
              Ver Sistema QA
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate('/navigation-map')}
              className="flex-1 bg-white/20 backdrop-blur text-white px-6 py-3 rounded-xl font-semibold hover:bg-white/30 transition-colors flex items-center justify-center gap-2"
            >
              Mapa de Navegación
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation CTAs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button
            onClick={() => navigate('/')}
            className="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 group"
          >
            <div className="text-4xl mb-3">🏠</div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-blue-600">Landing Page</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Explora la web principal</p>
          </button>

          <button
            onClick={() => navigate('/auth/entry')}
            className="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all border-2 border-gray-200 dark:border-gray-700 hover:border-amber-500 group"
          >
            <div className="text-4xl mb-3">🔐</div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-amber-600">Autenticación</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Prueba el flujo de acceso</p>
          </button>

          <button
            onClick={() => navigate('/saas/dashboard')}
            className="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all border-2 border-gray-200 dark:border-gray-700 hover:border-purple-500 group"
          >
            <div className="text-4xl mb-3">🚀</div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-purple-600">Dashboard</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Acceso directo al SaaS</p>
          </button>
        </div>
      </div>
    </div>
  );
}
