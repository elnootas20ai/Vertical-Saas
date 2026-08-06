import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ACCESO__CompleteModal } from '../components/design-system/ACCESO__CompleteModal';
import { WEB__Button } from '../components/design-system/WEB__Button';
import { Play, Check } from 'lucide-react';

export function AccessFlowDemo() {
  const navigate = useNavigate();
  const [showCompleteModal, setShowCompleteModal] = useState(false);

  const screens = [
    { id: '00', name: 'Entry', path: '/auth/entry', description: 'Punto de entrada - Login o Registro' },
    { id: '01', name: 'Login', path: '/auth/login', description: 'Inicio de sesión con validaciones' },
    { id: '02', name: 'Recover', path: '/auth/recover', description: 'Recuperación de contraseña' },
    { id: '03', name: 'Registro', path: '/auth/register', description: 'Crear nueva cuenta' },
    { id: '04', name: 'Onboarding Tipo', path: '/auth/onboarding/business-type', description: 'Selección tipo de negocio' },
    { id: '05', name: 'Onboarding Empresa', path: '/auth/onboarding/company', description: 'Datos de empresa + ANCOVE' },
    { id: '06', name: 'Onboarding Estructura', path: '/auth/onboarding/structure', description: 'Empresas, PDV, trabajadores y marcas' },
    { id: '07', name: 'Onboarding Necesidades', path: '/auth/onboarding/needs', description: 'Funcionalidades a activar' },
    { id: '08', name: 'Plan Recomendado', path: '/auth/onboarding/recommendation', description: 'Recomendación con lógica MVP' },
    { id: '09', name: 'Información de Pago', path: '/auth/onboarding/payment-info', description: 'Captura de tarjeta obligatoria' },
    { id: '10', name: 'Creando Espacio', path: '/auth/onboarding/confirmation', description: 'Progreso de creación' },
    { id: '11', name: 'Gate Interno', path: '/auth/gate', description: 'Bienvenida al espacio' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Flujo Completo ACCESO__
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-6">
            Prototipo 100% navegable con 12 pantallas
          </p>
          <div className="flex gap-4 justify-center">
            <WEB__Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/auth/entry')}
            >
              <Play className="w-5 h-5" />
              Iniciar flujo desde Entry
            </WEB__Button>
            <WEB__Button
              variant="secondary"
              size="lg"
              onClick={() => setShowCompleteModal(true)}
            >
              Ver resumen completo
            </WEB__Button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
            Pantallas del flujo
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {screens.map((screen) => (
              <button
                key={screen.id}
                onClick={() => navigate(screen.path)}
                className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-amber-500 hover:bg-amber-50 transition-all text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-amber-500 transition-colors">
                    <span className="font-bold text-gray-600 dark:text-gray-400 group-hover:text-white">
                      {screen.id}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      ACCESO__{screen.id} - {screen.name}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {screen.description}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              Funcionalidades
            </h3>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li>✓ Navegación bidireccional (Atrás/Siguiente)</li>
              <li>✓ Validaciones UI en tiempo real</li>
              <li>✓ Lógica de recomendación de plan</li>
              <li>✓ Estados de trial visuales</li>
              <li>✓ Modales interactivos</li>
              <li>✓ Toggle ANCOVE</li>
              <li>✓ Sistema de invitaciones</li>
              <li>✓ Progreso animado</li>
            </ul>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Check className="w-5 h-5 text-blue-600" />
              Componentes ACCESO__
            </h3>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li>✓ ACCESO__Button</li>
              <li>✓ ACCESO__Input</li>
              <li>✓ ACCESO__Checkbox</li>
              <li>✓ ACCESO__Stepper</li>
              <li>✓ ACCESO__SelectableCard</li>
              <li>✓ ACCESO__Modal</li>
              <li>✓ ACCESO__TrialBanner</li>
              <li>✓ ACCESO__CompleteModal</li>
            </ul>
          </div>
        </div>

        <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl shadow-lg p-8 text-white text-center">
          <h3 className="text-2xl font-bold mb-3">
            🎉 Flujo 100% Navegable
          </h3>
          <p className="text-lg mb-6 opacity-90">
            Todos los botones, links, validaciones y modales están completamente funcionales
          </p>
          <WEB__Button
            variant="secondary"
            size="lg"
            onClick={() => navigate('/')}
          >
            Volver al inicio
          </WEB__Button>
        </div>
      </div>

      {showCompleteModal && (
        <ACCESO__CompleteModal
          onComplete={() => setShowCompleteModal(false)}
        />
      )}
    </div>
  );
}