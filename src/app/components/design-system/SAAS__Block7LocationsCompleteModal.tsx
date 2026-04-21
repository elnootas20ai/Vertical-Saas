import { CheckCircle } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  onComplete: () => void;
}

export function SAAS__Block7LocationsCompleteModal({ onComplete }: Props) {
  useModalClose(true, onComplete);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onComplete}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gradient-to-r from-amber-600 to-orange-600 px-8 py-6 rounded-t-2xl text-center">
          <div className="w-20 h-20 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-12 h-12 text-amber-600" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">
            📍 Bloque 7 - Módulo de Ubicaciones Completado
          </h2>
          <p className="text-amber-50 text-lg">
            Sistema completo de control de plazas de aparcamiento
          </p>
        </div>

        <div className="p-8">
          {/* Pantallas */}
          <div className="mb-8 p-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-xl">
            <h3 className="text-xl font-bold text-blue-900 mb-4">🖥️ 2 Pantallas Principales</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-blue-900 mb-1">SAAS__Ubicaciones__Zonas</div>
                <div className="text-sm text-blue-700">Vista general con cards de zonas y stats</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-blue-900 mb-1">SAAS__Ubicaciones__GridZona</div>
                <div className="text-sm text-blue-700">Grid de plazas por zona específica</div>
              </div>
            </div>
          </div>

          {/* Zonas */}
          <div className="mb-8 p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
            <h3 className="text-xl font-bold text-green-900 mb-4">🏢 4 Zonas Configuradas</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0">
                  A
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-green-900">Zona A</div>
                  <div className="text-sm text-green-700">Interior - Planta baja • 20 plazas • Color azul</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0">
                  B
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-green-900">Zona B</div>
                  <div className="text-sm text-green-700">Interior - Primera planta • 15 plazas • Color verde</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0">
                  E
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-green-900">Exterior</div>
                  <div className="text-sm text-green-700">Parking exterior • 10 plazas • Color ámbar</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0">
                  T
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-green-900">Taller</div>
                  <div className="text-sm text-green-700">Zona de taller y reparaciones • 5 plazas • Color morado</div>
                </div>
              </div>
            </div>
          </div>

          {/* Vista Zonas */}
          <div className="mb-8 p-6 bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl">
            <h3 className="text-xl font-bold text-purple-900 mb-4">📋 Vista de Zonas (Lista)</h3>
            <div className="space-y-3">
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-purple-900 mb-2">Cards de zonas con información completa</div>
                <ul className="text-sm text-purple-700 space-y-1 pl-4">
                  <li>• Header con color identificativo de la zona</li>
                  <li>• Nombre y descripción editable (icono Edit2)</li>
                  <li>• <strong>Stats en grid 3 columnas:</strong> Total, Libres (verde), Ocupadas (azul)</li>
                  <li>• Barra de progreso de ocupación con porcentaje</li>
                  <li>• Botón "Ver plazas" → navega a grid de zona</li>
                  <li>• Hover effect con shadow</li>
                  <li>• Click en card navega a detalle</li>
                </ul>
              </div>
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-purple-900 mb-2">Resumen general (card inferior)</div>
                <ul className="text-sm text-purple-700 space-y-1 pl-4">
                  <li>• <strong>Plazas totales:</strong> Suma de todas las zonas</li>
                  <li>• <strong>Ocupadas:</strong> Total de plazas con vehículos</li>
                  <li>• <strong>Disponibles:</strong> Plazas libres</li>
                  <li>• <strong>Ocupación total:</strong> Porcentaje global</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Grid Zona */}
          <div className="mb-8 p-6 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl">
            <h3 className="text-xl font-bold text-amber-900 mb-4">🅿️ Grid de Plazas por Zona</h3>
            <div className="space-y-3">
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-amber-900 mb-2">Header de zona</div>
                <ul className="text-sm text-amber-700 space-y-1 pl-4">
                  <li>• Fondo con color de la zona</li>
                  <li>• Nombre y descripción</li>
                  <li>• Botón "Añadir plaza" con color de zona</li>
                  <li>• Stats 4 columnas: Total, Ocupadas, Libres, % Ocupación</li>
                </ul>
              </div>
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-amber-900 mb-2">Grid responsive de plazas</div>
                <ul className="text-sm text-amber-700 space-y-1 pl-4">
                  <li>• Grid 2-4-5 columnas según viewport</li>
                  <li>• Cada card de plaza muestra:
                    <ul className="pl-4 mt-1">
                      <li>- Número de plaza (badge con color si ocupada)</li>
                      <li>- <strong>Si ocupada:</strong> Icono coche, matrícula (mono), modelo (2 líneas)</li>
                      <li>- <strong>Si libre:</strong> Icono cuadrado gris + "Plaza libre"</li>
                      <li>- Acciones: Ver vehículo (Eye) + Mover (Move)</li>
                    </ul>
                  </li>
                  <li>• Color de borde según zona cuando ocupada</li>
                  <li>• Hover effect</li>
                </ul>
              </div>
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-amber-900 mb-2">Leyenda inferior</div>
                <ul className="text-sm text-amber-700 space-y-1 pl-4">
                  <li>• Cuadrado color zona = Plaza ocupada</li>
                  <li>• Cuadrado gris = Plaza libre</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Modales */}
          <div className="mb-8 p-6 bg-gradient-to-br from-indigo-50 to-violet-50 border-2 border-indigo-200 rounded-xl">
            <h3 className="text-xl font-bold text-indigo-900 mb-4">🎯 3 Modales Funcionales</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-indigo-900 mb-2">1️⃣ Crear Zona</div>
                <ul className="text-sm text-indigo-700 space-y-1">
                  <li>• Nombre *</li>
                  <li>• Descripción</li>
                  <li>• Color (6 opciones)</li>
                  <li>• Nº plazas *</li>
                  <li>• Auto-crea plazas</li>
                </ul>
              </div>
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-indigo-900 mb-2">2️⃣ Crear Plaza</div>
                <ul className="text-sm text-indigo-700 space-y-1">
                  <li>• Selector zona *</li>
                  <li>• Nº plaza * (mono)</li>
                  <li>• Formato: ZONA-XX</li>
                  <li>• Se crea vacía</li>
                </ul>
              </div>
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-indigo-900 mb-2">3️⃣ Mover Vehículo</div>
                <ul className="text-sm text-indigo-700 space-y-1">
                  <li>• Info vehículo actual</li>
                  <li>• Paso 1: Zona destino</li>
                  <li>• Paso 2: Plaza destino</li>
                  <li>• Solo plazas libres</li>
                  <li>• Preview origen→destino</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Historial */}
          <div className="mb-8 p-6 bg-gradient-to-br from-rose-50 to-pink-50 border-2 border-rose-200 rounded-xl">
            <h3 className="text-xl font-bold text-rose-900 mb-4">📜 Tab Historial de Movimientos</h3>
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
              <div className="font-semibold text-rose-900 mb-2">Tabla con 6 columnas</div>
              <div className="grid grid-cols-2 gap-2 text-sm text-rose-700">
                <div>1. <strong>Vehículo:</strong> Modelo + Matrícula (mono)</div>
                <div>2. <strong>Origen:</strong> Zona + Plaza</div>
                <div>3. <strong>→:</strong> Icono flecha</div>
                <div>4. <strong>Destino:</strong> Zona + Plaza (verde)</div>
                <div>5. <strong>Fecha/Hora:</strong> Timestamp completo</div>
                <div>6. <strong>Usuario:</strong> Quien movió</div>
              </div>
              <div className="mt-3 text-sm text-rose-700">
                • Counter en tab badge con total de movimientos<br />
                • Hover effect en filas<br />
                • Último movimiento arriba
              </div>
            </div>
          </div>

          {/* Features UI */}
          <div className="mb-8 p-6 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">✨ Características UI Destacadas</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="text-2xl font-bold text-blue-600 mb-1">Color</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Sistema de colores por zona</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="text-2xl font-bold text-green-600 mb-1">Grid</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Layout responsive 2-4-5</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="text-2xl font-bold text-amber-600 mb-1">Stats</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Cálculo en tiempo real</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="text-2xl font-bold text-purple-600 mb-1">Visual</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Ocupada vs Libre claro</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="text-2xl font-bold text-red-600 mb-1">Acciones</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Ver + Mover por plaza</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="text-2xl font-bold text-cyan-600 mb-1">Wizard</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Mover en 2 pasos</div>
              </div>
            </div>
          </div>

          {/* Componentes */}
          <div className="p-6 bg-gradient-to-br from-gray-50 to-slate-50 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">📦 Componentes Nuevos Creados</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                'SAAS__CreateZoneModal',
                'SAAS__CreateSpotModal',
                'SAAS__LocationMoveVehicleModal',
                'LocationZone (página)',
              ].map((comp) => (
                <div key={comp} className="p-3 bg-white dark:bg-gray-800 rounded-lg text-sm font-mono text-gray-900 dark:text-gray-100">
                  {comp}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-8 py-6 bg-gray-50 dark:bg-gray-800 rounded-b-2xl">
          <p className="text-center text-gray-700 dark:text-gray-300 mb-4">
            El módulo de Ubicaciones está <span className="font-bold text-amber-600">100% funcional</span> con sistema
            de zonas configurables, grid visual de plazas, movimientos con wizard en 2 pasos e historial completo.
          </p>
          <button
            onClick={onComplete}
            className="w-full px-6 py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-lg font-bold rounded-xl transition-all shadow-lg hover:shadow-xl"
          >
            ✅ Bloque 7 listo. OK para continuar
          </button>
        </div>
      </div>
    </div>
  );
}
