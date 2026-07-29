import { useNavigate } from 'react-router';
import { 
  LayoutDashboard, RefreshCw, Car, MapPin, Users, FileText, 
  TrendingUp, Phone, Building2, UsersRound, DollarSign, Settings,
  CreditCard, ArrowRight
} from 'lucide-react';

export function SAAS__FlowMap() {
  const navigate = useNavigate();

  const modules = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, path: '/saas/dashboard', color: 'bg-blue-100 text-blue-600' },
    { id: 'operations', name: 'Operaciones', icon: RefreshCw, path: '/saas/operations', color: 'bg-purple-100 text-purple-600' },
    { id: 'vehicles', name: 'Vehículos', icon: Car, path: '/saas/vehicles', color: 'bg-green-100 text-green-600' },
    { id: 'locations', name: 'Ubicaciones', icon: MapPin, path: '/saas/locations', color: 'bg-amber-100 text-amber-600' },
    { id: 'clients', name: 'Clientes', icon: Users, path: '/saas/clients', color: 'bg-pink-100 text-pink-600' },
    { id: 'documents', name: 'Documentos', icon: FileText, path: '/saas/documents', color: 'bg-indigo-100 text-indigo-600' },
    { id: 'sales', name: 'Ventas', icon: TrendingUp, path: '/saas/sales', color: 'bg-emerald-100 text-emerald-600' },
    { id: 'calls', name: 'Llamadas (IA)', icon: Phone, path: '/saas/calls', color: 'bg-cyan-100 text-cyan-600', disabled: true },
    { id: 'ancove', name: 'ANCOVE', icon: Building2, path: '/saas/ancove', color: 'bg-orange-100 text-orange-600' },
    { id: 'team', name: 'Equipo', icon: UsersRound, path: '/saas/team', color: 'bg-violet-100 text-violet-600' },
    { id: 'finance', name: 'Finanzas', icon: DollarSign, path: '/saas/finance', color: 'bg-red-100 text-red-600' },
    { id: 'billing', name: 'Mi plan', icon: CreditCard, path: '/saas/billing', color: 'bg-teal-100 text-teal-600' },
    { id: 'settings', name: 'Sistema', icon: Settings, path: '/saas/settings', color: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' },
  ];

  const flows = [
    { from: 'operations', to: 'vehicles', label: 'Asignar vehículo' },
    { from: 'vehicles', to: 'locations', label: 'Ubicar' },
    { from: 'clients', to: 'sales', label: 'Crear venta' },
    { from: 'sales', to: 'documents', label: 'Generar docs' },
    { from: 'documents', to: 'ancove', label: 'Enviar' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">Mapa de navegación SaaS</h1>
          <p className="text-gray-600 dark:text-gray-400">Diagrama visual de todos los módulos y sus conexiones</p>
        </div>

        {/* Main modules grid */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Módulos principales</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {modules.map((module) => (
              <button
                key={module.id}
                onClick={() => !module.disabled && navigate(module.path)}
                disabled={module.disabled}
                className={`group p-6 border-2 border-gray-200 dark:border-gray-700 rounded-xl transition-all ${
                  module.disabled ? 'opacity-40 cursor-not-allowed grayscale' : 'hover:border-amber-500 hover:shadow-lg'
                }`}
              >
                <div className={`w-12 h-12 ${module.color} rounded-lg flex items-center justify-center mb-3 ${module.disabled ? '' : 'group-hover:scale-110'} transition-transform`}>
                  <module.icon className="w-6 h-6" />
                </div>
                <div className="font-semibold text-gray-900 dark:text-gray-100 text-left">{module.name}</div>
                {module.disabled && <div className="text-[10px] text-gray-500 dark:text-gray-400 text-left mt-1">Próximamente</div>}
              </button>
            ))}
          </div>
        </div>

        {/* Flows */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Flujos principales</h2>
          <div className="space-y-4">
            {flows.map((flow, idx) => {
              const fromModule = modules.find(m => m.id === flow.from);
              const toModule = modules.find(m => m.id === flow.to);
              return (
                <div key={idx} className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <div className="flex items-center gap-2">
                    {fromModule && <fromModule.icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />}
                    <span className="font-medium text-gray-900 dark:text-gray-100">{fromModule?.name}</span>
                  </div>
                  <ArrowRight className="w-5 h-5 text-amber-500" />
                  <div className="flex-1 text-sm text-gray-600 dark:text-gray-400">{flow.label}</div>
                  <ArrowRight className="w-5 h-5 text-amber-500" />
                  <div className="flex items-center gap-2">
                    {toModule && <toModule.icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />}
                    <span className="font-medium text-gray-900 dark:text-gray-100">{toModule?.name}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
            <div className="font-semibold text-blue-900 mb-2">✓ Sidebar</div>
            <div className="text-sm text-blue-800">13 módulos navegables</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
            <div className="font-semibold text-green-900 mb-2">✓ Topbar</div>
            <div className="text-sm text-green-800">Notificaciones, perfil, empresas</div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-6 border border-amber-200">
            <div className="font-semibold text-amber-900 mb-2">✓ Modales</div>
            <div className="text-sm text-amber-800">Filtros, creación, detalle</div>
          </div>
        </div>
      </div>
    </div>
  );
}
