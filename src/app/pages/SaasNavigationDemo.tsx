import { useState } from 'react';
import { useNavigate } from 'react-router';
import { SAAS__NavigationCompleteModal } from '../components/design-system/SAAS__NavigationCompleteModal';
import { WEB__Button } from '../components/design-system/WEB__Button';
import { Play, Check, Map, CheckCircle as CheckIcon } from 'lucide-react';

export function SaasNavigationDemo() {
  const navigate = useNavigate();
  const [showCompleteModal, setShowCompleteModal] = useState(true);

  const features = [
    { name: 'Sidebar siempre visible', description: '13 módulos navegables', icon: '📋' },
    { name: 'Topbar interactivo', description: 'Notificaciones, perfil, empresa', icon: '🔔' },
    { name: 'Tabs funcionales', description: 'Cambian contenido real', icon: '📑' },
    { name: 'Filtros con drawer', description: 'Aplicar y restablecer', icon: '🔍' },
    { name: 'Toggle de vistas', description: 'Tarjetas ↔ Tabla', icon: '🔄' },
    { name: 'Modales de creación', description: 'Botón + en todas las listas', icon: '➕' },
    { name: 'Navegación a detalle', description: 'Cards y filas clickables', icon: '👆' },
    { name: 'Breadcrumbs', description: 'Navegación contextual', icon: '🗺️' },
  ];

  const modules = [
    { name: 'Dashboard', path: '/saas/dashboard', color: 'from-blue-500 to-blue-600' },
    { name: 'Operaciones', path: '/saas/operations', color: 'from-purple-500 to-purple-600' },
    { name: 'Vehículos', path: '/saas/vehicles', color: 'from-green-500 to-green-600' },
    { name: 'Ubicaciones', path: '/saas/locations', color: 'from-amber-500 to-amber-600' },
    { name: 'Clientes', path: '/saas/clients', color: 'from-pink-500 to-pink-600' },
    { name: 'Documentos', path: '/saas/documents', color: 'from-indigo-500 to-indigo-600' },
    { name: 'Ventas', path: '/saas/sales', color: 'from-emerald-500 to-emerald-600' },
    { name: 'Llamadas (IA)', path: '/saas/calls', color: 'from-cyan-500 to-cyan-600', disabled: true },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Navegación SaaS 100% Interactiva
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-6">
            Todos los botones, tabs, filtros y cards son completamente funcionales
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <WEB__Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/saas/dashboard')}
            >
              <Play className="w-5 h-5" />
              Probar Dashboard
            </WEB__Button>
            <WEB__Button
              variant="secondary"
              size="lg"
              onClick={() => navigate('/saas-flow-map')}
            >
              <Map className="w-5 h-5" />
              Ver mapa de navegación
            </WEB__Button>
            <WEB__Button
              variant="secondary"
              size="lg"
              onClick={() => navigate('/saas-qa-check')}
            >
              <CheckIcon className="w-5 h-5" />
              Ver checklist QA
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
                className="flex items-start gap-3 p-4 bg-green-50 rounded-xl border border-green-200"
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

        {/* Módulos rápidos */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
            Acceso rápido a módulos
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {modules.map((module) => (
              <button
                key={module.name}
                onClick={() => !module.disabled && navigate(module.path)}
                disabled={module.disabled}
                className={`p-4 bg-gradient-to-br ${module.color} rounded-xl text-white font-semibold transition-transform shadow-lg ${
                  module.disabled ? 'opacity-40 cursor-not-allowed grayscale' : 'hover:scale-105'
                }`}
              >
                {module.name}
                {module.disabled && <span className="block text-[10px] mt-1 font-normal opacity-80">Próximamente</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Componentes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Check className="w-5 h-5 text-blue-600" />
              Componentes nuevos
            </h3>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li>✓ SAAS__FilterDrawer</li>
              <li>✓ SAAS__ViewToggle</li>
              <li>✓ SAAS__FlowMap</li>
              <li>✓ SAAS__QAButtons</li>
              <li>✓ SAAS__NavigationCompleteModal</li>
            </ul>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              Verificaciones
            </h3>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li>✓ 30/30 checks completados</li>
              <li>✓ Navegación 100% funcional</li>
              <li>✓ Modales y drawers operativos</li>
              <li>✓ Detalle en todas las entidades</li>
            </ul>
          </div>
        </div>

        {/* Instrucciones */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl shadow-lg p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">
            🎯 Cómo probar
          </h2>
          <ol className="space-y-3 text-lg">
            <li className="flex items-start gap-3">
              <span className="font-bold">1.</span>
              <span>Navega a cualquier módulo del SaaS</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-bold">2.</span>
              <span>Prueba los tabs para cambiar entre vistas</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-bold">3.</span>
              <span>Usa el botón "Filtros" para abrir el drawer lateral</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-bold">4.</span>
              <span>Cambia entre vista de Tarjetas y Tabla</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-bold">5.</span>
              <span>Haz clic en cualquier card o fila para ver el detalle</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-bold">6.</span>
              <span>Usa el botón "+" para crear nuevos elementos</span>
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
        <SAAS__NavigationCompleteModal
          onComplete={() => setShowCompleteModal(false)}
        />
      )}
    </div>
  );
}
