import { useState } from 'react';
import { useNavigate } from 'react-router';
import { SAAS__SubscriptionCompleteModal } from '../components/design-system/SAAS__SubscriptionCompleteModal';
import { WEB__Button } from '../components/design-system/WEB__Button';
import { Play, Check, CreditCard, AlertCircle } from 'lucide-react';

export function SubscriptionDemo() {
  const navigate = useNavigate();
  const [showCompleteModal, setShowCompleteModal] = useState(true); // Auto-mostrar al cargar

  const features = [
    { name: 'Banners dinámicos', description: 'Cambian según el estado de suscripción', icon: '🎨' },
    { name: 'Lógica de bloqueo', description: 'Acciones limitadas según estado', icon: '🔒' },
    { name: 'Redirección automática', description: 'A pantalla suspendida si impago', icon: '🔄' },
    { name: 'Página de facturación', description: 'Gestión completa de plan y pagos', icon: '💳' },
    { name: 'Página de suspensión', description: 'Información clara y acciones disponibles', icon: '⛔' },
  ];

  const states = [
    { 
      name: 'Subscription Active', 
      color: 'green', 
      description: 'Sin banner, todo funcional',
      icon: '✅'
    },
    { 
      name: 'Trial Active', 
      color: 'blue', 
      description: 'Banner azul informativo con días restantes',
      icon: '🆓'
    },
    { 
      name: 'Trial Expired', 
      color: 'amber', 
      description: 'Banner ámbar con CTA para elegir plan',
      icon: '⏰'
    },
    { 
      name: 'Payment Failed', 
      color: 'red', 
      description: 'Banner rojo, acciones críticas bloqueadas',
      icon: '❌'
    },
    { 
      name: 'Grace Period', 
      color: 'orange', 
      description: 'Banner naranja con contador de horas',
      icon: '⚠️'
    },
    { 
      name: 'Suspended', 
      color: 'gray', 
      description: 'Pantalla de bloqueo total',
      icon: '🚫'
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Sistema de Suscripción
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-6">
            Gestión completa de estados y facturación para UDAR EDGE
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <WEB__Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/saas/dashboard')}
            >
              <Play className="w-5 h-5" />
              Probar en Dashboard
            </WEB__Button>
            <WEB__Button
              variant="secondary"
              size="lg"
              onClick={() => navigate('/saas/billing')}
            >
              <CreditCard className="w-5 h-5" />
              Ver Facturación
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

        {/* Estados */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
            <AlertCircle className="w-7 h-7 text-amber-600" />
            Estados de suscripción
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {states.map((state) => (
              <div
                key={state.name}
                className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-amber-300 transition-all"
              >
                <div className="text-3xl mb-2">{state.icon}</div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{state.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{state.description}</p>
              </div>
            ))}
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

        {/* Componentes creados */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              Componentes
            </h3>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li>✓ SubscriptionContext</li>
              <li>✓ SAAS__BannerSubscriptionStatus</li>
              <li>✓ SAAS__SubscriptionCompleteModal</li>
            </ul>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Check className="w-5 h-5 text-blue-600" />
              Páginas
            </h3>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li>✓ /saas/billing - Facturación</li>
              <li>✓ /saas/suspended - Suspensión</li>
              <li>✓ /subscription-demo - Esta demo</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 text-center">
          <WEB__Button
            variant="ghost"
            size="lg"
            onClick={() => navigate('/')}
          >
            Volver al inicio
          </WEB__Button>
        </div>
      </div>

      {showCompleteModal && (
        <SAAS__SubscriptionCompleteModal
          onComplete={() => setShowCompleteModal(false)}
        />
      )}
    </div>
  );
}