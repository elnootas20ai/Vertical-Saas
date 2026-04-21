import { CheckCircle } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  onComplete: () => void;
}

export function SAAS__LocationsCompleteModal({ onComplete }: Props) {
  useModalClose(true, onComplete);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onComplete}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gradient-to-r from-amber-600 to-orange-600 px-8 py-6 rounded-t-2xl text-center">
          <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            🎉 Bloque 7 - Ubicaciones Completado
          </h2>
          <p className="text-amber-50">
            Sistema completo de gestión de aparcamiento implementado
          </p>
        </div>

        <div className="p-8">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Pantallas creadas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-amber-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__Ubicaciones__Zonas</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-amber-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__Ubicaciones__GridZona</span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Componentes creados</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__CreateZoneModal</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__CreateSpotModal</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__MoveVehicleModal</span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Tabs funcionales</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-sm font-medium">
                📍 Zonas
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-sm font-medium">
                🔲 Vista Grid
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-sm font-medium">
                ⏱️ Historial
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Zonas predefinidas</h3>
            <div className="flex flex-wrap gap-2">
              <span className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-100 text-blue-700 border border-blue-200">
                🏢 Zona A (Interior)
              </span>
              <span className="px-4 py-2 text-sm font-semibold rounded-lg bg-purple-100 text-purple-700 border border-purple-200">
                🏢 Zona B (Interior)
              </span>
              <span className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-100 text-green-700 border border-green-200">
                🌳 Exterior
              </span>
              <span className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-100 text-orange-700 border border-orange-200">
                🔧 Taller
              </span>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Funcionalidades</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Gestión de zonas</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Crear zonas personalizadas con capacidad variable</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Vista de zonas</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Cards con ocupación, estadísticas y acciones rápidas</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Grid de plazas</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Vista visual de todas las plazas con estado ocupado/libre</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Plazas ocupadas muestran vehículo</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Matrícula y modelo visible en cada plaza</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Mover vehículos</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Modal interactivo con selector de zona y plaza destino</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Historial de movimientos</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Tabla completa con origen, destino, fecha y responsable</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Indicadores visuales</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Barras de ocupación con colores según porcentaje</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Detalles de implementación</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="font-semibold text-blue-900 mb-2">Grid interactivo</div>
                <div className="text-sm text-blue-800">
                  Responsive: 4/6/8 columnas según pantalla
                </div>
              </div>
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                <div className="font-semibold text-purple-900 mb-2">Preview de movimiento</div>
                <div className="text-sm text-purple-800">
                  Origen → Destino antes de confirmar
                </div>
              </div>
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                <div className="font-semibold text-green-900 mb-2">Filtro de plazas libres</div>
                <div className="text-sm text-green-800">
                  Solo muestra plazas disponibles al mover
                </div>
              </div>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="font-semibold text-amber-900 mb-2">Indicador de ocupación</div>
                <div className="text-sm text-amber-800">
                  Verde &lt;70%, Amber &lt;90%, Rojo &gt;90%
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-sm text-amber-900">
              <span className="font-semibold">Navegación:</span> Las plazas ocupadas son clickables y abren 
              el modal de mover vehículo. El selector de zona permite cambiar rápidamente entre áreas. 
              El historial muestra todos los movimientos con trazabilidad completa.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-8 py-6 bg-gray-50 dark:bg-gray-800 rounded-b-2xl">
          <button
            onClick={onComplete}
            className="w-full px-6 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl"
          >
            OK, continuar
          </button>
        </div>
      </div>
    </div>
  );
}
