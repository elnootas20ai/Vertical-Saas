import { useState } from 'react';
import { useNavigate } from 'react-router';
import { SAAS__LocationsCompleteModal } from '../components/design-system/SAAS__LocationsCompleteModal';
import { WEB__Button } from '../components/design-system/WEB__Button';
import { Play, Check, MapPin } from 'lucide-react';

export function LocationsDemo() {
  const navigate = useNavigate();
  const [showCompleteModal, setShowCompleteModal] = useState(true);

  const features = [
    { name: 'Gestión de zonas', description: 'Crear y configurar zonas personalizadas', icon: '📍' },
    { name: 'Vista de zonas', description: 'Cards con ocupación y estadísticas', icon: '📊' },
    { name: 'Grid de plazas', description: 'Vista visual interactiva por zona', icon: '🔲' },
    { name: 'Plazas ocupadas', description: 'Matrícula y modelo en cada plaza', icon: '🚗' },
    { name: 'Mover vehículos', description: 'Modal con selector de destino', icon: '↔️' },
    { name: 'Historial completo', description: 'Registro de todos los movimientos', icon: '📜' },
    { name: 'Indicadores visuales', description: 'Barras de ocupación coloreadas', icon: '📈' },
    { name: '4 zonas predefinidas', description: 'Zona A, B, Exterior y Taller', icon: '🏢' },
  ];

  const zones = [
    { name: 'Zona A', type: 'Interior', capacity: 24, color: 'from-blue-500 to-blue-600' },
    { name: 'Zona B', type: 'Interior', capacity: 20, color: 'from-purple-500 to-purple-600' },
    { name: 'Exterior', type: 'Exterior', capacity: 15, color: 'from-green-500 to-green-600' },
    { name: 'Taller', type: 'Interior', capacity: 8, color: 'from-orange-500 to-orange-600' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
            <MapPin className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Módulo de Ubicaciones
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-6">
            Sistema completo de gestión de aparcamiento y control de vehículos
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <WEB__Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/saas/locations')}
            >
              <Play className="w-5 h-5" />
              Ver Ubicaciones
            </WEB__Button>
          </div>
        </div>

        {/* Funcionalidades */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
            Funcionalidades implementadas
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((feature) => (
              <div
                key={feature.name}
                className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200"
              >
                <div className="text-2xl">{feature.icon}</div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{feature.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Zonas */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
            Zonas predefinidas
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {zones.map((zone) => (
              <div
                key={zone.name}
                className={`p-6 bg-gradient-to-br ${zone.color} rounded-xl text-white text-center shadow-lg`}
              >
                <div className="text-3xl mb-2">
                  {zone.type === 'Interior' ? '🏢' : '🌳'}
                </div>
                <div className="font-bold mb-1">{zone.name}</div>
                <div className="text-sm opacity-90">{zone.type}</div>
                <div className="text-2xl font-bold mt-2">{zone.capacity}</div>
                <div className="text-xs opacity-75">plazas</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
            3 Tabs funcionales
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-amber-500 transition-all text-center">
              <div className="text-4xl mb-3">📍</div>
              <div className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Zonas</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Vista de cards con ocupación y estadísticas por zona
              </div>
            </div>
            <div className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-amber-500 transition-all text-center">
              <div className="text-4xl mb-3">🔲</div>
              <div className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Vista Grid</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Grid interactivo de plazas con estado visual
              </div>
            </div>
            <div className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-amber-500 transition-all text-center">
              <div className="text-4xl mb-3">⏱️</div>
              <div className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Historial</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Registro completo de movimientos de vehículos
              </div>
            </div>
          </div>
        </div>

        {/* Componentes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Check className="w-5 h-5 text-blue-600" />
              Componentes creados
            </h3>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li>✓ SAAS__CreateZoneModal</li>
              <li>✓ SAAS__CreateSpotModal</li>
              <li>✓ SAAS__MoveVehicleModal</li>
            </ul>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              Pantallas
            </h3>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li>✓ Vista de zonas (cards)</li>
              <li>✓ Grid de plazas por zona</li>
              <li>✓ Historial de movimientos</li>
            </ul>
          </div>
        </div>

        {/* Detalles técnicos */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
            Detalles de implementación
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="font-semibold text-blue-900 mb-2">Grid responsive</div>
              <div className="text-sm text-blue-800">
                4/6/8 columnas según tamaño de pantalla
              </div>
            </div>
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
              <div className="font-semibold text-purple-900 mb-2">Preview de movimiento</div>
              <div className="text-sm text-purple-800">
                Muestra origen → destino antes de confirmar
              </div>
            </div>
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="font-semibold text-green-900 mb-2">Plazas libres filtradas</div>
              <div className="text-sm text-green-800">
                Solo muestra plazas disponibles al mover
              </div>
            </div>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="font-semibold text-amber-900 mb-2">Indicadores de color</div>
              <div className="text-sm text-amber-800">
                Verde &lt;70%, Amber &lt;90%, Rojo &gt;90%
              </div>
            </div>
          </div>
        </div>

        {/* Instrucciones */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl shadow-lg p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">
            🎯 Cómo probar
          </h2>
          <ol className="space-y-3 text-lg">
            <li className="flex items-start gap-3">
              <span className="font-bold">1.</span>
              <span>Navega a Ubicaciones desde el sidebar</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-bold">2.</span>
              <span>Explora las 4 zonas predefinidas en el tab "Zonas"</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-bold">3.</span>
              <span>Cambia al tab "Vista Grid" para ver el grid de plazas</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-bold">4.</span>
              <span>Haz clic en una plaza ocupada (azul) para mover el vehículo</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-bold">5.</span>
              <span>Selecciona zona y plaza destino en el modal</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-bold">6.</span>
              <span>Revisa el historial de movimientos en el tab correspondiente</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-bold">7.</span>
              <span>Crea nuevas zonas con el botón "Nueva zona"</span>
            </li>
          </ol>
        </div>

        <div className="mt-8 text-center">
          <WEB__Button
            variant="ghost"
            size="lg"
            onClick={() => navigate('/demos')}
          >
            Volver a demos
          </WEB__Button>
        </div>
      </div>

      {showCompleteModal && (
        <SAAS__LocationsCompleteModal
          onComplete={() => setShowCompleteModal(false)}
        />
      )}
    </div>
  );
}
