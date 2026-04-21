import { CheckCircle } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  onComplete: () => void;
}

export function SAAS__Block5OperationsCompleteModal({ onComplete }: Props) {
  useModalClose(true, onComplete);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onComplete}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-6 rounded-t-2xl text-center">
          <div className="w-20 h-20 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-12 h-12 text-purple-600" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">
            📋 Bloque 5 - Módulo de Operaciones Completado
          </h2>
          <p className="text-purple-50 text-lg">
            Sistema completo de gestión operativa adaptado a compraventa de coches
          </p>
        </div>

        <div className="p-8">
          {/* Pantallas */}
          <div className="mb-8 p-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-xl">
            <h3 className="text-xl font-bold text-blue-900 mb-4">🖥️ Pantallas Implementadas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-blue-900 mb-1">SAAS__Operaciones__Lista</div>
                <div className="text-sm text-blue-700">Vista principal con 5 tabs funcionales</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-blue-900 mb-1">SAAS__Operaciones__Detalle</div>
                <div className="text-sm text-blue-700">Página de detalle completa con timeline</div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-8 p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
            <h3 className="text-xl font-bold text-green-900 mb-4">📑 5 Tabs Funcionales</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-green-900">Tab Operaciones</div>
                  <div className="text-sm text-green-700">Tabla con 8 columnas: ID, Operación, Cliente, Etapa, Estado, Responsable, Ubicación, Acciones</div>
                  <div className="text-xs text-green-600 mt-1">Acciones: Ver detalle, Documentos, Cambiar etapa</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-green-900">Tab Tareas</div>
                  <div className="text-sm text-green-700">Lista de tareas pendientes/completadas con checkboxes</div>
                  <div className="text-xs text-green-600 mt-1">Counter de tareas pendientes en badge</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-green-900">Tab Gastos</div>
                  <div className="text-sm text-green-700">Tabla de gastos con categorías y totales</div>
                  <div className="text-xs text-green-600 mt-1">Total calculado automáticamente</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-green-900">Tab Incidencias</div>
                  <div className="text-sm text-green-700">Cards con severidad (Alta/Media/Baja) y estados</div>
                  <div className="text-xs text-green-600 mt-1">Counter de incidencias abiertas en badge</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-green-900">Tab Historial</div>
                  <div className="text-sm text-green-700">Timeline vertical con eventos y usuarios</div>
                  <div className="text-xs text-green-600 mt-1">Diseño tipo timeline con línea y dots</div>
                </div>
              </div>
            </div>
          </div>

          {/* Detalle */}
          <div className="mb-8 p-6 bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl">
            <h3 className="text-xl font-bold text-purple-900 mb-4">📄 Detalle de Operación</h3>
            <div className="space-y-4">
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-purple-900 mb-2">Header Completo</div>
                <ul className="text-sm text-purple-700 space-y-1 pl-4">
                  <li>• ID operación (OP-XXXX)</li>
                  <li>• Tipo (Compra/Venta con badge)</li>
                  <li>• Vehículo y Cliente</li>
                  <li>• Estado con badge</li>
                  <li>• Fechas: Creación y Cierre estimado</li>
                </ul>
              </div>
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-purple-900 mb-2">Secciones/Cards</div>
                <ul className="text-sm text-purple-700 space-y-1 pl-4">
                  <li>• <span className="font-semibold">Gestión:</span> Etapa actual + Responsable (con botones de acción)</li>
                  <li>• <span className="font-semibold">Ubicación:</span> Snapshot visual con link a mapa</li>
                  <li>• <span className="font-semibold">Timeline:</span> Cambios de etapa con fechas, usuarios y notas</li>
                  <li>• <span className="font-semibold">Accesos rápidos:</span> Links a Vehículo, Cliente, Documentos, Ubicación</li>
                  <li>• <span className="font-semibold">Estadísticas:</span> Tiempo en etapa, Progreso, Días restantes</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Modales */}
          <div className="mb-8 p-6 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl">
            <h3 className="text-xl font-bold text-amber-900 mb-4">🎯 3 Modales Funcionales</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-amber-900 mb-2">Crear Operación</div>
                <div className="text-sm text-amber-700">Formulario completo con vehículo, cliente y datos</div>
              </div>
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-amber-900 mb-2">Cambiar Etapa</div>
                <div className="text-sm text-amber-700">11 etapas disponibles + notas + preview</div>
              </div>
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-amber-900 mb-2">Asignar Responsable</div>
                <div className="text-sm text-amber-700">Lista de equipo con avatares y roles</div>
              </div>
            </div>
          </div>

          {/* Etapas y Estados */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="p-6 bg-gradient-to-br from-indigo-50 to-violet-50 border-2 border-indigo-200 rounded-xl">
              <h3 className="text-xl font-bold text-indigo-900 mb-4">🎨 11 Etapas con Badges</h3>
              <div className="grid grid-cols-2 gap-2">
                {['Captación', 'Revisión/Peritaje', 'Puesta a punto', 'Publicación', 'Negociación', 'Reserva', 'Financiación', 'Documentación', 'Entrega', 'Postventa', 'Desguace'].map((stage) => (
                  <div key={stage} className="text-xs font-semibold text-indigo-700 bg-white dark:bg-gray-800 p-2 rounded text-center">
                    {stage}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 bg-gradient-to-br from-rose-50 to-pink-50 border-2 border-rose-200 rounded-xl">
              <h3 className="text-xl font-bold text-rose-900 mb-4">⚡ 4 Estados con Badges</h3>
              <div className="grid grid-cols-2 gap-2">
                {['Pendiente', 'En progreso', 'Retrasado', 'Completado'].map((status) => (
                  <div key={status} className="text-xs font-semibold text-rose-700 bg-white dark:bg-gray-800 p-2 rounded text-center">
                    {status}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="p-6 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">✨ Características Destacadas</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">5</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Tabs funcionales</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">11</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Etapas de workflow</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">3</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Modales de acción</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-amber-600">4</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Accesos rápidos</div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-8 py-6 bg-gray-50 dark:bg-gray-800 rounded-b-2xl">
          <p className="text-center text-gray-700 dark:text-gray-300 mb-4">
            El módulo de Operaciones está <span className="font-bold text-purple-600">100% funcional</span> con gestión completa
            de operativa adaptada a compraventa de coches. Incluye 5 tabs, 11 etapas, timeline visual y accesos directos.
          </p>
          <button
            onClick={onComplete}
            className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-lg font-bold rounded-xl transition-all shadow-lg hover:shadow-xl"
          >
            ✅ Bloque 5 listo. OK para continuar
          </button>
        </div>
      </div>
    </div>
  );
}
