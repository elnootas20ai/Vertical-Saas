import { useNavigate } from 'react-router';
import { WEB__Button } from '../components/design-system/WEB__Button';
import { CreditCard, Key, Zap, Home, LayoutGrid, RefreshCw, MapPin, Presentation } from 'lucide-react';

export function DemoIndex() {
  const navigate = useNavigate();

  const demos = [
    {
      id: 'presentacion',
      title: 'Presentación Vertial',
      description: 'Para explicar qué es Vertial en 2 minutos (lenguaje simple)',
      icon: <Presentation className="w-8 h-8" />,
      color: 'from-teal-500 to-blue-600',
      path: '/presentacion',
      badge: 'NUEVO'
    },
    {
      id: 'locations',
      title: 'Módulo Ubicaciones',
      description: 'Gestión de aparcamiento con grid de plazas',
      icon: <MapPin className="w-8 h-8" />,
      color: 'from-amber-500 to-orange-500',
      path: '/locations-demo',
      badge: null
    },
    {
      id: 'operations',
      title: 'Módulo Operaciones',
      description: 'Gestión completa de compraventa con 11 etapas',
      icon: <RefreshCw className="w-8 h-8" />,
      color: 'from-green-500 to-emerald-500',
      path: '/operations-demo',
      badge: null
    },
    {
      id: 'saas-navigation',
      title: 'Navegación SaaS',
      description: 'Sistema 100% interactivo con todos los módulos',
      icon: <LayoutGrid className="w-8 h-8" />,
      color: 'from-purple-500 to-pink-500',
      path: '/saas-navigation-demo',
      badge: null
    },
    {
      id: 'subscription',
      title: 'Sistema de Suscripción',
      description: 'Estados de pago, facturación y bloqueos',
      icon: <CreditCard className="w-8 h-8" />,
      color: 'from-blue-500 to-purple-500',
      path: '/subscription-demo',
      badge: null
    },
    {
      id: 'access',
      title: 'Flujo de Acceso',
      description: '11 pantallas navegables de autenticación y onboarding',
      icon: <Key className="w-8 h-8" />,
      color: 'from-indigo-500 to-blue-500',
      path: '/access-flow-demo',
      badge: null
    },
    {
      id: 'project',
      title: 'Resumen del Proyecto',
      description: 'Vista general completa de Vertial',
      icon: <Zap className="w-8 h-8" />,
      color: 'from-gray-700 to-gray-900',
      path: '/project-summary',
      badge: null
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
            <Home className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Vertial - Demos
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            Prototipo completo para compraventas de coches en España
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {demos.map((demo) => (
            <button
              key={demo.id}
              onClick={() => navigate(demo.path)}
              className="group relative bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-2xl transition-all overflow-hidden"
            >
              {demo.badge && (
                <div className="absolute top-4 right-4 z-10">
                  <span className="px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-full shadow-lg">
                    {demo.badge}
                  </span>
                </div>
              )}
              
              <div className={`h-32 bg-gradient-to-br ${demo.color} flex items-center justify-center text-white group-hover:scale-105 transition-transform`}>
                {demo.icon}
              </div>
              
              <div className="p-6 text-left">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-amber-600 transition-colors">
                  {demo.title}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  {demo.description}
                </p>
              </div>

              <div className="px-6 pb-6">
                <div className="w-full py-2 text-center text-amber-600 font-semibold text-sm group-hover:bg-amber-50 rounded-lg transition-colors">
                  Ver demo →
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Accesos rápidos
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => navigate('/saas/dashboard')}
              className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-amber-500 hover:bg-amber-50 transition-all text-left group"
            >
              <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-amber-900">
                Dashboard SaaS
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Aplicación completa con todos los módulos
              </div>
            </button>

            <button
              onClick={() => navigate('/auth/entry')}
              className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-amber-500 hover:bg-amber-50 transition-all text-left group"
            >
              <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-amber-900">
                Punto de entrada
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Inicio del flujo de autenticación
              </div>
            </button>

            <button
              onClick={() => navigate('/navigation-map')}
              className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-amber-500 hover:bg-amber-50 transition-all text-left group"
            >
              <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-amber-900">
                Mapa de navegación
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Diagrama completo de rutas
              </div>
            </button>

            <button
              onClick={() => navigate('/qa')}
              className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-amber-500 hover:bg-amber-50 transition-all text-left group"
            >
              <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-amber-900">
                Sistema QA
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                152 verificaciones de calidad
              </div>
            </button>
          </div>
        </div>

        <div className="text-center">
          <WEB__Button
            variant="ghost"
            size="lg"
            onClick={() => navigate('/')}
          >
            Volver a la landing
          </WEB__Button>
        </div>
      </div>
    </div>
  );
}