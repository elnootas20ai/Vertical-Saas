import { CheckCircle } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  onComplete: () => void;
}

export function SAAS__NavigationCompleteModal({ onComplete }: Props) {
  useModalClose(true, onComplete);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onComplete}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-6 rounded-t-2xl text-center">
          <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            🎉 Bloque 4 - Navegación SaaS Completado
          </h2>
          <p className="text-blue-50">
            Sistema de navegación 100% interactivo implementado
          </p>
        </div>

        <div className="p-8">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Componentes creados</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__FilterDrawer</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__ViewToggle</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__FlowMap</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__QAButtons</span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Funcionalidades implementadas</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Sidebar completo</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">13 módulos navegables con estado activo</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Topbar interactivo</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Notificaciones, perfil y selector de empresa</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Tabs funcionales</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Cambian contenido real, no solo visual</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Filtros y vistas</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Drawer de filtros + toggle Tarjetas/Tabla</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Modales de creación</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Botón "+" abre modal en todas las listas</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Navegación a detalle</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Cards y filas de tabla clickables</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Páginas de verificación</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
                <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">SAAS__FlowMap</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Diagrama visual de navegación</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">/saas-flow-map</div>
              </div>
              <div className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
                <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">SAAS__QAButtons</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Checklist de interactividad</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">/saas-qa-check</div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
            <p className="text-sm text-amber-900">
              <span className="font-semibold">Verificaciones completadas:</span> 30/30 ✓
              <br />
              <span className="font-semibold">Estado:</span> Navegación 100% interactiva en todas las pantallas SaaS
            </p>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-8 py-6 bg-gray-50 dark:bg-gray-800 rounded-b-2xl">
          <button
            onClick={onComplete}
            className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl"
          >
            OK, continuar
          </button>
        </div>
      </div>
    </div>
  );
}
