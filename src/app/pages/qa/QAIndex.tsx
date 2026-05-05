import { useNavigate } from 'react-router';
import { CheckSquare, Map, Play, FileCheck, Users, Package, DollarSign, Settings } from 'lucide-react';

export function QAIndex() {
  const navigate = useNavigate();

  const blocks = [
    {
      id: 1,
      title: 'Bloque 1: Landing + Auth',
      description: 'Verificación de la landing page y flujo de autenticación',
      icon: <FileCheck className="w-8 h-8" />,
      color: 'blue',
      items: 32,
      path: '/qa/block-1'
    },
    {
      id: 2,
      title: 'Bloque 2: Onboarding',
      description: 'Flujo completo de onboarding y configuración inicial',
      icon: <Users className="w-8 h-8" />,
      color: 'green',
      items: 26,
      path: '/qa/block-2'
    },
    {
      id: 3,
      title: 'Bloque 3: SaaS Core',
      description: 'Dashboard, Vehículos, Clientes y Operaciones',
      icon: <Package className="w-8 h-8" />,
      color: 'purple',
      items: 68,
      path: '/qa/block-3'
    },
    {
      id: 4,
      title: 'Bloque 4: SaaS Secondary',
      description: 'Ventas, Finanzas, Documentos, Equipo, Configuración',
      icon: <Settings className="w-8 h-8" />,
      color: 'amber',
      items: 26,
      path: '/qa/block-4'
    }
  ];

  const getColorClasses = (color: string) => {
    const classes = {
      blue: 'bg-blue-100 text-blue-600 border-blue-200 hover:bg-blue-50',
      green: 'bg-green-100 text-green-600 border-green-200 hover:bg-green-50',
      purple: 'bg-purple-100 text-purple-600 border-purple-200 hover:bg-purple-50',
      amber: 'bg-amber-100 text-amber-600 border-amber-200 hover:bg-amber-50'
    };
    return classes[color as keyof typeof classes];
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-12 h-12 bg-[#0f1419] rounded-lg" />
            <span className="text-3xl font-semibold">Vertial</span>
          </div>
          <h1 className="text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Sistema de QA
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-2">
            Verificación completa de interactividad y navegación
          </p>
          <p className="text-gray-500 dark:text-gray-400">
            Asegurando que cada botón, link, tab y pill sea funcional
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <button
            onClick={() => navigate('/navigation-map')}
            className="p-6 bg-white dark:bg-gray-800 border-2 border-amber-200 rounded-xl hover:border-amber-400 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-amber-100 rounded-lg flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                <Map className="w-8 h-8 text-amber-600" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  Mapa de Navegación
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Diagrama visual completo de todas las rutas
                </p>
              </div>
              <div className="text-amber-600">→</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/qa/block-1')}
            className="p-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:shadow-xl transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-lg flex items-center justify-center group-hover:bg-white/30 transition-colors">
                <Play className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-lg font-semibold mb-1">
                  Iniciar QA Completo
                </h3>
                <p className="text-sm text-white/80">
                  Comienza desde el Bloque 1
                </p>
              </div>
              <div className="text-white">→</div>
            </div>
          </button>
        </div>

        {/* QA Blocks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {blocks.map((block) => (
            <button
              key={block.id}
              onClick={() => navigate(block.path)}
              className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-8 hover:shadow-lg transition-all text-left group"
            >
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center mb-4 transition-colors ${getColorClasses(block.color)}`}>
                {block.icon}
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-gray-700">
                {block.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {block.description}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {block.items} verificaciones
                </span>
                <div className="flex items-center gap-2 text-sm font-medium text-blue-600 group-hover:gap-3 transition-all">
                  Comenzar
                  <span>→</span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">Resumen del Sistema</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">152</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Verificaciones totales</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">4</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Bloques de QA</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">30+</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Páginas auditadas</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">100%</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Cobertura</div>
            </div>
          </div>
        </div>

        {/* Back to home */}
        <div className="mt-12 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 transition-colors"
          >
            ← Volver a la landing
          </button>
        </div>
      </div>
    </div>
  );
}
