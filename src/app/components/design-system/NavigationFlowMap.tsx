import { Home, LogIn, UserPlus, Lock, Building2, Briefcase, Package, LayoutDashboard, Car, Users, FileText, TrendingUp, DollarSign, Settings, MapPin, Phone, Zap, UserCog } from 'lucide-react';

export function NavigationFlowMap() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">Mapa de Flujo - Vertial</h1>
          <p className="text-gray-600 dark:text-gray-400">Diagrama completo de navegación de la aplicación</p>
        </div>

        {/* WEB: Landing */}
        <div className="mb-8 bg-white dark:bg-gray-800 rounded-xl border-2 border-blue-500 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <Home className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">WEB__ Landing Page</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">Ruta: /</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-sm">
              <div className="font-semibold text-gray-900 dark:text-gray-100">Módulos</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Scroll to section</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-sm">
              <div className="font-semibold text-gray-900 dark:text-gray-100">Cómo funciona</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Scroll to section</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-sm">
              <div className="font-semibold text-gray-900 dark:text-gray-100">Planes</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Scroll to section</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-sm">
              <div className="font-semibold text-gray-900 dark:text-gray-100">FAQ</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Scroll to section</div>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg text-sm border-2 border-blue-500">
              <div className="font-semibold text-blue-900">→ /auth/entry</div>
              <div className="text-blue-700 text-xs">Probar gratis</div>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg text-sm border-2 border-blue-500">
              <div className="font-semibold text-blue-900">→ /auth/login</div>
              <div className="text-blue-700 text-xs">Iniciar sesión</div>
            </div>
          </div>
        </div>

        {/* ACCESO: Authentication Flow */}
        <div className="mb-8 bg-white dark:bg-gray-800 rounded-xl border-2 border-amber-500 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
              <Lock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">ACCESO__ Authentication</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">Rutas: /auth/*</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-amber-50 p-3 rounded-lg text-sm">
              <LogIn className="w-5 h-5 text-amber-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">/auth/entry</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Punto de entrada</div>
            </div>
            <div className="bg-amber-50 p-3 rounded-lg text-sm">
              <LogIn className="w-5 h-5 text-amber-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">/auth/login</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Iniciar sesión</div>
            </div>
            <div className="bg-amber-50 p-3 rounded-lg text-sm">
              <UserPlus className="w-5 h-5 text-amber-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">/auth/register</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Registro</div>
            </div>
            <div className="bg-amber-50 p-3 rounded-lg text-sm">
              <Lock className="w-5 h-5 text-amber-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">/auth/recover</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Recuperar contraseña</div>
            </div>
          </div>
        </div>

        {/* ACCESO: Onboarding Flow */}
        <div className="mb-8 bg-white dark:bg-gray-800 rounded-xl border-2 border-green-500 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">ACCESO__ Onboarding Flow</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">Rutas: /auth/onboarding/*</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-green-50 p-3 rounded-lg text-sm">
              <Building2 className="w-5 h-5 text-green-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">1. Business Type</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Tipo de negocio</div>
            </div>
            <div className="bg-green-50 p-3 rounded-lg text-sm">
              <Building2 className="w-5 h-5 text-green-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">2. Company</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Datos empresa</div>
            </div>
            <div className="bg-green-50 p-3 rounded-lg text-sm">
              <Package className="w-5 h-5 text-green-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">3. Structure</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Estructura</div>
            </div>
            <div className="bg-green-50 p-3 rounded-lg text-sm">
              <Package className="w-5 h-5 text-green-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">4. Needs</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Necesidades</div>
            </div>
            <div className="bg-green-50 p-3 rounded-lg text-sm">
              <Package className="w-5 h-5 text-green-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">5. Recommendation</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Recomendación</div>
            </div>
            <div className="bg-green-100 p-3 rounded-lg text-sm border-2 border-green-600">
              <Package className="w-5 h-5 text-green-700 mb-1" />
              <div className="font-semibold text-green-900">6. Confirmation</div>
              <div className="text-green-700 text-xs">→ /auth/gate</div>
            </div>
          </div>
        </div>

        {/* SAAS: Main Application */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-purple-500 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">SAAS__ Main Application</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">Rutas: /saas/*</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Core Modules */}
            <div className="bg-purple-50 p-3 rounded-lg text-sm">
              <LayoutDashboard className="w-5 h-5 text-purple-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">/saas/dashboard</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Panel principal</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg text-sm">
              <Car className="w-5 h-5 text-purple-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">/saas/vehicles</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Stock vehículos</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg text-sm">
              <Users className="w-5 h-5 text-purple-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">/saas/clients</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">CRM & Leads</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg text-sm">
              <Package className="w-5 h-5 text-purple-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">/saas/operations</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Operaciones</div>
            </div>
            
            {/* Secondary Modules */}
            <div className="bg-purple-50 p-3 rounded-lg text-sm">
              <TrendingUp className="w-5 h-5 text-purple-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">/saas/sales</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Ventas</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg text-sm">
              <FileText className="w-5 h-5 text-purple-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">/saas/documents</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Documentos</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg text-sm">
              <DollarSign className="w-5 h-5 text-purple-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">/saas/finance</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Finanzas</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg text-sm">
              <MapPin className="w-5 h-5 text-purple-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">/saas/locations</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Ubicaciones</div>
            </div>
            
            {/* Support Modules */}
            <div className="bg-purple-50 p-3 rounded-lg text-sm">
              <Phone className="w-5 h-5 text-purple-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">/saas/calls</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Llamadas</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg text-sm">
              <Zap className="w-5 h-5 text-purple-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">/saas/ancove</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">ANCOVE</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg text-sm">
              <UserCog className="w-5 h-5 text-purple-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">/saas/team</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Equipo</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg text-sm">
              <Settings className="w-5 h-5 text-purple-600 mb-1" />
              <div className="font-semibold text-gray-900 dark:text-gray-100">/saas/settings</div>
              <div className="text-gray-600 dark:text-gray-400 text-xs">Configuración</div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Leyenda</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span className="text-sm text-gray-700 dark:text-gray-300">WEB__ Landing</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-amber-500 rounded"></div>
              <span className="text-sm text-gray-700 dark:text-gray-300">ACCESO__ Auth</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span className="text-sm text-gray-700 dark:text-gray-300">ACCESO__ Onboarding</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-purple-500 rounded"></div>
              <span className="text-sm text-gray-700 dark:text-gray-300">SAAS__ Application</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
