import { CheckCircle, Home } from 'lucide-react';
import { useNavigate } from 'react-router';

export function FinalQA() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-12 text-center">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            ✅ QA Completado
          </h1>
          
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
            Vertial es ahora un prototipo 100% navegable y coherente
          </p>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Resumen de verificación</h2>
            <div className="grid grid-cols-2 gap-4 text-left">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Bloque 1: Landing + Auth</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Bloque 2: Onboarding</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Bloque 3: SaaS Core</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Bloque 4: SaaS Secondary</span>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8 text-left">
            <h3 className="font-semibold text-blue-900 mb-3">✨ Componentes del Design System creados:</h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li>• <strong>WEB__Button</strong> - Botones para landing page</li>
              <li>• <strong>ACCESO__Input</strong> - Inputs para formularios de autenticación</li>
              <li>• <strong>SAAS__ComingSoonModal</strong> - Modal "Próximamente" reutilizable</li>
              <li>• <strong>SAAS__PageHeader</strong> - Cabecera de página con breadcrumb</li>
              <li>• <strong>SAAS__DataTable</strong> - Tabla de datos con estados</li>
              <li>• <strong>NavigationFlowMap</strong> - Mapa de flujo completo</li>
              <li>• <strong>QAChecklist</strong> - Sistema de QA por bloques</li>
            </ul>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8 text-left">
            <h3 className="font-semibold text-amber-900 mb-3">🎯 Logros principales:</h3>
            <ul className="space-y-2 text-sm text-amber-800">
              <li>✓ Todos los botones, links, tabs y pills son interactivos</li>
              <li>✓ Navegación coherente en toda la aplicación</li>
              <li>✓ Modales "Próximamente" para funcionalidades pendientes</li>
              <li>✓ Prefijos de nomenclatura: WEB__, ACCESO__, SAAS__</li>
              <li>✓ Mapa de flujo visual creado</li>
              <li>✓ Sistema de QA por bloques implementado</li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => navigate('/navigation-map')}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
            >
              Ver mapa de navegación
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex-1 px-6 py-3 border-2 border-gray-900 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium flex items-center justify-center gap-2"
            >
              <Home className="w-5 h-5" />
              Ir a la landing
            </button>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Prototipo creado siguiendo las especificaciones de Vertial<br />
              Siguiendo patrones de UX/UI + QA de Figma
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
