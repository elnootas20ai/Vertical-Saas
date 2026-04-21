import { useState } from 'react';
import { useNavigate } from 'react-router';
import { SAAS__OperationsCompleteModal } from '../components/design-system/SAAS__OperationsCompleteModal';
import { WEB__Button } from '../components/design-system/WEB__Button';
import { Play, Check, RefreshCw } from 'lucide-react';

export function OperationsDemo() {
  const navigate = useNavigate();
  const [showCompleteModal, setShowCompleteModal] = useState(true);

  const features = [
    { name: 'Tabla de operaciones', description: 'Vista completa con filtros y acciones', icon: '📊' },
    { name: 'Vista de tarjetas', description: 'Alternativa visual con toggle', icon: '🎴' },
    { name: 'Detalle de operación', description: 'Timeline y gestión completa', icon: '📋' },
    { name: '11 etapas de gestión', description: 'Desde captación hasta postventa', icon: '🔄' },
    { name: 'Cambio de etapa', description: 'Modal interactivo con preview', icon: '↔️' },
    { name: 'Asignación de responsable', description: 'Gestión de equipo', icon: '👥' },
    { name: '5 tabs funcionales', description: 'Operaciones, tareas, gastos, incidencias, historial', icon: '📑' },
    { name: 'Accesos rápidos', description: 'Enlaces a vehículo, cliente, documentos', icon: '⚡' },
  ];

  const stages = [
    'Captación', 'Revisión/Peritaje', 'Puesta a punto', 'Publicación', 
    'Negociación', 'Reserva', 'Financiación', 'Documentación', 
    'Entrega', 'Postventa', 'Desguace'
  ];

  const tabs = [
    { name: 'Operaciones', icon: '⚙️', desc: 'Gestión completa de compraventa' },
    { name: 'Tareas', icon: '⏰', desc: 'Pendientes y asignaciones' },
    { name: 'Gastos', icon: '💰', desc: 'Control de costes operativos' },
    { name: 'Incidencias', icon: '⚠️', desc: 'Problemas y excepciones' },
    { name: 'Historial', icon: '📜', desc: 'Registro de cambios' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
            <RefreshCw className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Módulo de Operaciones
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-6">
            Gestión completa del ciclo de compraventa de vehículos
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <WEB__Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/saas/operations')}
            >
              <Play className="w-5 h-5" />
              Ver Operaciones
            </WEB__Button>
            <WEB__Button
              variant="secondary"
              size="lg"
              onClick={() => navigate('/saas/operations/OP-0001')}
            >
              Ver Detalle
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

        {/* Etapas */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
            11 Etapas de gestión
          </h2>
          <div className="flex flex-wrap gap-3">
            {stages.map((stage, idx) => (
              <div
                key={stage}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl"
              >
                <span className="text-2xl font-bold text-blue-600">{idx + 1}</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{stage}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
            5 Tabs funcionales
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {tabs.map((tab) => (
              <div
                key={tab.name}
                className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-amber-500 transition-all text-center"
              >
                <div className="text-3xl mb-2">{tab.icon}</div>
                <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{tab.name}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{tab.desc}</div>
              </div>
            ))}
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
              <li>✓ SAAS__StageBadge</li>
              <li>✓ SAAS__StatusBadge</li>
              <li>✓ SAAS__OperationsCreateModal</li>
              <li>✓ SAAS__ChangeStageModal</li>
              <li>✓ SAAS__AssignResponsibleModal</li>
            </ul>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              Pantallas
            </h3>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li>✓ Lista de operaciones (tabla + cards)</li>
              <li>✓ Detalle de operación</li>
              <li>✓ 5 tabs funcionales</li>
            </ul>
          </div>
        </div>

        {/* Instrucciones */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl shadow-lg p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">
            🎯 Cómo probar
          </h2>
          <ol className="space-y-3 text-lg">
            <li className="flex items-start gap-3">
              <span className="font-bold">1.</span>
              <span>Navega a Operaciones desde el sidebar</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-bold">2.</span>
              <span>Prueba los 5 tabs en la parte superior</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-bold">3.</span>
              <span>Cambia entre vista de Tabla y Tarjetas</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-bold">4.</span>
              <span>Haz clic en cualquier operación para ver el detalle</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-bold">5.</span>
              <span>Prueba "Cambiar etapa" y "Reasignar" en el detalle</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-bold">6.</span>
              <span>Usa los accesos rápidos a Vehículo, Cliente y Documentos</span>
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
        <SAAS__OperationsCompleteModal
          onComplete={() => setShowCompleteModal(false)}
        />
      )}
    </div>
  );
}
