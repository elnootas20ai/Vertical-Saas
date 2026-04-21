import { CheckCircle } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  onComplete: () => void;
}

export function SAAS__OperationsCompleteModal({ onComplete }: Props) {
  useModalClose(true, onComplete);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onComplete}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gradient-to-r from-green-600 to-emerald-600 px-8 py-6 rounded-t-2xl text-center">
          <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            🎉 Bloque 5 - Operaciones Completado
          </h2>
          <p className="text-green-50">
            Módulo completo de gestión de operaciones implementado
          </p>
        </div>

        <div className="p-8">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Pantallas creadas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__Operaciones__Lista</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__Operaciones__Detalle</span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Componentes creados</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__StageBadge</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__StatusBadge</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__OperationsCreateModal</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__ChangeStageModal</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__AssignResponsibleModal</span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Tabs funcionales</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-sm font-medium">
                ⚙️ Operaciones
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-sm font-medium">
                ⏰ Tareas
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-sm font-medium">
                💰 Gastos
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-sm font-medium">
                ⚠️ Incidencias
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-sm font-medium">
                📜 Historial
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Etapas implementadas (11)</h3>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">Captación</span>
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">Revisión/Peritaje</span>
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700">Puesta a punto</span>
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-cyan-100 text-cyan-700">Publicación</span>
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">Negociación</span>
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-700">Reserva</span>
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-pink-100 text-pink-700">Financiación</span>
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-violet-100 text-violet-700">Documentación</span>
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700">Entrega</span>
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-teal-100 text-teal-700">Postventa</span>
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">Desguace</span>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Funcionalidades</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Tabla completa de operaciones</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Con filtros, búsqueda y acciones por fila</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Vista de tarjetas</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Alternativa visual con toggle</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Detalle completo de operación</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Con timeline, responsable y accesos rápidos</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Cambio de etapa interactivo</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Modal con selección visual y preview</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Reasignación de responsable</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Gestión de equipo por operación</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">5 tabs funcionales</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Operaciones, Tareas, Gastos, Incidencias, Historial</div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-sm text-amber-900">
              <span className="font-semibold">Navegación:</span> Todas las operaciones son clickables y llevan al detalle. 
              Los accesos rápidos conectan con Vehículos, Clientes y Documentos. Los badges de etapa son interactivos 
              y abren el modal de cambio de etapa.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-8 py-6 bg-gray-50 dark:bg-gray-800 rounded-b-2xl">
          <button
            onClick={onComplete}
            className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl"
          >
            OK, continuar
          </button>
        </div>
      </div>
    </div>
  );
}
