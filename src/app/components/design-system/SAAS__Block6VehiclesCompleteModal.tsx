import { CheckCircle } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  onComplete: () => void;
}

export function SAAS__Block6VehiclesCompleteModal({ onComplete }: Props) {
  useModalClose(true, onComplete);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onComplete}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gradient-to-r from-green-600 to-emerald-600 px-8 py-6 rounded-t-2xl text-center">
          <div className="w-20 h-20 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">
            🚗 Bloque 6 - Módulo de Vehículos Completado
          </h2>
          <p className="text-green-50 text-lg">
            Catálogo completo adaptado a compraventa de coches con gestión avanzada
          </p>
        </div>

        <div className="p-8">
          {/* Pantallas */}
          <div className="mb-8 p-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-xl">
            <h3 className="text-xl font-bold text-blue-900 mb-4">🖥️ 5 Pantallas Implementadas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-blue-900 mb-1">SAAS__Vehículos__Tarjetas</div>
                <div className="text-sm text-blue-700">Grid responsive con cards visuales</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-blue-900 mb-1">SAAS__Vehículos__Tabla</div>
                <div className="text-sm text-blue-700">Vista tabla con 7 columnas</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-blue-900 mb-1">SAAS__Vehículos__AltaRapida</div>
                <div className="text-sm text-blue-700">Modal con formulario esencial</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-blue-900 mb-1">SAAS__Vehículos__Ficha (5 tabs)</div>
                <div className="text-sm text-blue-700">Detalle completo con navegación</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg col-span-1 md:col-span-2">
                <div className="font-semibold text-blue-900 mb-1">SAAS__Vehículos__EntradaRecepcion</div>
                <div className="text-sm text-blue-700">Wizard 4 pasos con progress</div>
              </div>
            </div>
          </div>

          {/* Listados features */}
          <div className="mb-8 p-6 bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl">
            <h3 className="text-xl font-bold text-purple-900 mb-4">🔍 Sistema de Búsqueda y Filtros</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-purple-900">Buscador en tiempo real</div>
                  <div className="text-sm text-purple-700">Por matrícula, marca o modelo con resultados instantáneos</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-purple-900">Filtro por Estado</div>
                  <div className="text-sm text-purple-700">5 estados: En stock, Reservado, Vendido, En taller, Desguace</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-purple-900">Filtro por Ubicación</div>
                  <div className="text-sm text-purple-700">Selector con todas las plazas disponibles</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-purple-900">Filtro por Marca</div>
                  <div className="text-sm text-purple-700">Dropdown con todas las marcas del catálogo</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-purple-900">Filtro por Días en Stock</div>
                  <div className="text-sm text-purple-700">4 rangos: 0-30, 31-60, 61-90, +90 días</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-purple-900">Drawer de filtros</div>
                  <div className="text-sm text-purple-700">Panel lateral con contador de filtros activos + botón "Limpiar"</div>
                </div>
              </div>
            </div>
          </div>

          {/* Card vehicle */}
          <div className="mb-8 p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
            <h3 className="text-xl font-bold text-green-900 mb-4">🎴 Card de Vehículo</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {['Foto (o emoji)', 'Matrícula con badge', 'Marca/Modelo/Año', 'Kilómetros', 'Precio venta destacado', 'Estado con badge color', 'Ubicación con icono', 'Días en stock (color)'].map((item) => (
                <div key={item} className="p-3 bg-white dark:bg-gray-800 rounded-lg text-sm font-medium text-green-900 text-center">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Alta rapida */}
            <div className="p-6 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl">
              <h3 className="text-xl font-bold text-amber-900 mb-4">⚡ Alta Rápida (Modal)</h3>
              <ul className="space-y-2 text-sm text-amber-800">
                <li className="flex items-start gap-2">
                  <span className="text-amber-600">✓</span>
                  <span>9 campos esenciales: matrícula, marca, modelo, año, km, precios, estado, ubicación</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600">✓</span>
                  <span>Preview de margen calculado automáticamente</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600">✓</span>
                  <span>CTA "Guardar y abrir ficha" → navega a detalle</span>
                </li>
              </ul>
            </div>

            {/* Wizard recepción */}
            <div className="p-6 bg-gradient-to-br from-indigo-50 to-violet-50 border-2 border-indigo-200 rounded-xl">
              <h3 className="text-xl font-bold text-indigo-900 mb-4">📋 Entrada Recepción (Wizard)</h3>
              <ul className="space-y-2 text-sm text-indigo-800">
                <li className="flex items-start gap-2">
                  <span className="text-indigo-600">1.</span>
                  <span><strong>Datos vehículo:</strong> matrícula, marca, modelo, año, km, VIN, color, combustible</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-600">2.</span>
                  <span><strong>Origen:</strong> particular/proveedor/subasta + precio + fecha compra</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-600">3.</span>
                  <span><strong>Ubicación:</strong> selector visual de plazas disponibles</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-600">4.</span>
                  <span><strong>Documentos:</strong> upload de ficha técnica, permiso, etc.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Ficha 5 tabs */}
          <div className="mb-8 p-6 bg-gradient-to-br from-rose-50 to-pink-50 border-2 border-rose-200 rounded-xl">
            <h3 className="text-xl font-bold text-rose-900 mb-4">📑 Ficha Vehículo - 5 Tabs Funcionales</h3>
            
            <div className="space-y-3">
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-rose-900 mb-2">1️⃣ Tab Resumen</div>
                <ul className="text-sm text-rose-700 space-y-1 pl-4">
                  <li>• <strong>Ubicación actual</strong> con snapshot visual + botón "Mover"</li>
                  <li>• <strong>Costes y gastos</strong> desglosados (compra + taller + publicidad + otros)</li>
                  <li>• <strong>Precio y margen</strong> con cálculo automático + porcentaje</li>
                  <li>• <strong>Estado</strong> con badge + botón "Cambiar estado"</li>
                  <li>• <strong>Stats</strong>: fecha compra, días en stock (destacado), kilómetros</li>
                </ul>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-rose-900 mb-2">2️⃣ Tab Documentos</div>
                <ul className="text-sm text-rose-700 space-y-1 pl-4">
                  <li>• Grid con cards de documentos (ficha técnica, permiso, ITV, contrato)</li>
                  <li>• CTA "Gestionar documentos" → navega a módulo Documentos</li>
                </ul>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-rose-900 mb-2">3️⃣ Tab Historial</div>
                <ul className="text-sm text-rose-700 space-y-1 pl-4">
                  <li>• Timeline vertical con línea y dots</li>
                  <li>• Eventos: creación, movimientos, cambios de estado, actualizaciones de precio</li>
                  <li>• Cada evento muestra: acción, detalles, usuario, fecha/hora</li>
                </ul>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-rose-900 mb-2">4️⃣ Tab Venta</div>
                <ul className="text-sm text-rose-700 space-y-1 pl-4">
                  <li>• CTA destacado "Crear venta" → navega a módulo Ventas</li>
                  <li>• Resumen para venta con vehículo, precio, margen, días en stock</li>
                </ul>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-rose-900 mb-2">5️⃣ Tab Desguace (MVP)</div>
                <ul className="text-sm text-rose-700 space-y-1 pl-4">
                  <li>• CTA "Iniciar proceso de desguace" → abre modal</li>
                  <li>• Avisos: acción irreversible, documentación necesaria</li>
                  <li>• <strong>Modal desguace:</strong> motivo (4 opciones), fecha, coste, ingreso, notas</li>
                  <li>• Confirmación por matrícula para evitar errores</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Modales y componentes */}
          <div className="mb-8 p-6 bg-gradient-to-br from-gray-50 to-slate-50 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">🎯 Modales y Componentes Nuevos</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                'SAAS__VehicleQuickAddModal',
                'SAAS__VehicleReceptionWizard',
                'SAAS__VehicleFiltersDrawer',
                'SAAS__MoveVehicleModal',
                'SAAS__ScrapVehicleModal',
              ].map((comp) => (
                <div key={comp} className="p-3 bg-white dark:bg-gray-800 rounded-lg text-sm font-mono text-gray-900 dark:text-gray-100">
                  {comp}
                </div>
              ))}
            </div>
          </div>

          {/* Features */}
          <div className="p-6 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">✨ Características Destacadas</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">2</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Vistas (cards/tabla)</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">4</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Filtros avanzados</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">5</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Tabs en ficha</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-amber-600">4</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Pasos wizard</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">5</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Modales funcionales</div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-8 py-6 bg-gray-50 dark:bg-gray-800 rounded-b-2xl">
          <p className="text-center text-gray-700 dark:text-gray-300 mb-4">
            El módulo de Vehículos está <span className="font-bold text-green-600">100% funcional</span> con catálogo completo,
            búsqueda avanzada, 2 modos de entrada, ficha con 5 tabs y gestión completa del ciclo de vida.
          </p>
          <button
            onClick={onComplete}
            className="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-lg font-bold rounded-xl transition-all shadow-lg hover:shadow-xl"
          >
            ✅ Bloque 6 listo. OK para continuar
          </button>
        </div>
      </div>
    </div>
  );
}
