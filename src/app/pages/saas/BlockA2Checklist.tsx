import { useState } from 'react';
import { Layout } from '../../components/saas/Layout';
import { CheckCircle, Circle, ExternalLink, Shield } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  path?: string;
  checked: boolean;
}

export function BlockA2Checklist() {
  const { subscription } = useApp();

  const [items, setItems] = useState<ChecklistItem[]>([
    {
      id: '1',
      label: 'Estados de suscripción en AppContext',
      description: '7 estados: trial_active, trial_expiring, trial_expired, subscription_active, payment_failed, grace_period, suspended',
      checked: true,
    },
    {
      id: '2',
      label: 'SubscriptionGuard component',
      description: 'Guard para proteger rutas según estado de suscripción',
      checked: true,
    },
    {
      id: '3',
      label: 'SubscriptionBanner component',
      description: 'Banners globales: amarillo (trial_expiring), rojo (payment_failed), naranja (grace_period)',
      checked: true,
    },
    {
      id: '4',
      label: 'Página Billing completa',
      description: 'Plan actual, planes disponibles, método de pago, historial de facturas',
      path: '/saas/billing',
      checked: true,
    },
    {
      id: '5',
      label: 'Página Suspended',
      description: 'Pantalla de bloqueo con acceso solo a Billing y Soporte',
      path: '/saas/suspended',
      checked: true,
    },
    {
      id: '7',
      label: 'Redirects automáticos',
      description: 'trial_expired → Billing, suspended → Suspended page',
      checked: true,
    },
    {
      id: '8',
      label: 'Control de acciones críticas',
      description: 'CriticalActionButton + helpers canPerformCriticalAction() para bloquear firmas, gestoría, ventas',
      checked: true,
    },
    {
      id: '9',
      label: 'Access control helpers',
      description: 'canAccessFeature(), canPerformCriticalAction(), getAccessRestrictionMessage() en AppContext',
      checked: true,
    },
  ]);

  const toggleItem = (id: string) => {
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, checked: !item.checked } : item))
    );
  };

  const completedCount = items.filter(item => item.checked).length;
  const totalCount = items.length;
  const progress = Math.round((completedCount / totalCount) * 100);

  const components = [
    { name: 'AppContext (updated)', path: '/src/app/context/AppContext.tsx', status: 'updated' },
    { name: 'SubscriptionGuard', path: '/src/app/components/saas/SubscriptionGuard.tsx', status: 'new' },
    { name: 'SubscriptionBanner', path: '/src/app/components/saas/SubscriptionBanner.tsx', status: 'new' },
    { name: 'Billing (rewritten)', path: '/src/app/pages/saas/Billing.tsx', status: 'updated' },
    { name: 'Suspended (updated)', path: '/src/app/pages/saas/Suspended.tsx', status: 'updated' },
    { name: 'Layout (updated)', path: '/src/app/components/saas/Layout.tsx', status: 'updated' },
    { name: 'SaasRoot (updated)', path: '/src/app/pages/SaasRoot.tsx', status: 'updated' },
  ];

  const subscriptionStates = [
    {
      status: 'trial_active',
      label: 'Trial activo',
      access: 'Completo',
      banner: 'Ninguno',
      color: 'from-green-600 to-emerald-600',
    },
    {
      status: 'trial_expiring',
      label: 'Trial expirando',
      access: 'Completo',
      banner: 'Amarillo (≤3 días)',
      color: 'from-amber-600 to-yellow-600',
    },
    {
      status: 'trial_expired',
      label: 'Trial expirado',
      access: 'Solo Billing + Settings',
      banner: 'Redirect a Billing',
      color: 'from-red-600 to-orange-600',
    },
    {
      status: 'subscription_active',
      label: 'Suscripción activa',
      access: 'Completo',
      banner: 'Ninguno',
      color: 'from-blue-600 to-indigo-600',
    },
    {
      status: 'payment_failed',
      label: 'Pago fallido',
      access: 'Lectura + acciones básicas',
      banner: 'Rojo (actualizar pago)',
      color: 'from-red-600 to-pink-600',
    },
    {
      status: 'grace_period',
      label: 'Periodo de gracia',
      access: 'Lectura + acciones básicas',
      banner: 'Naranja (contador 72h)',
      color: 'from-orange-600 to-amber-600',
    },
    {
      status: 'suspended',
      label: 'Suspendido',
      access: 'Solo Billing + Soporte',
      banner: 'Redirect a Suspended',
      color: 'from-gray-600 to-slate-600',
    },
  ];

  return (
    <Layout title="Checklist Bloque A2" subtitle="Control de acceso por suscripción">
      <div className="space-y-6">
        {/* Progress Card */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold mb-2">BLOQUE A2 - Completado</h2>
              <div className="text-blue-100">
                {completedCount} de {totalCount} elementos implementados
              </div>
            </div>
            <div className="text-right">
              <div className="text-6xl font-bold">{progress}%</div>
              <div className="text-blue-100">Completado</div>
            </div>
          </div>
          <div className="w-full bg-white/20 rounded-full h-4 overflow-hidden">
            <div
              className="bg-white dark:bg-gray-800 h-full transition-all duration-500 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Current Status */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Estado actual del sistema</h3>
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
          <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl">
            <div className="text-sm text-blue-900 mb-2">Suscripción activa:</div>
            <div className="text-3xl font-bold text-blue-900 mb-4">{subscription.status}</div>
            <div className="text-sm text-blue-800">
              Plan: <strong>{subscription.planName}</strong>
            </div>
          </div>
        </div>

        {/* Checklist */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Elementos implementados</h3>
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <button
                  onClick={() => toggleItem(item.id)}
                  className="flex-shrink-0 mt-1"
                >
                  {item.checked ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <Circle className="w-6 h-6 text-gray-300" />
                  )}
                </button>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{item.label}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{item.description}</div>
                  {item.path && (
                    <a
                      href={item.path}
                      className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      Ver en acción
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Subscription States */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Estados de suscripción</h3>
          <div className="space-y-3">
            {subscriptionStates.map((state) => (
              <div
                key={state.status}
                className={`p-4 rounded-xl bg-gradient-to-r ${state.color} text-white`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-lg">{state.label}</div>
                  {subscription.status === state.status && (
                    <div className="px-3 py-1 bg-white/30 rounded-full text-xs font-bold">
                      ACTUAL
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="opacity-80 mb-1">Acceso:</div>
                    <div className="font-semibold">{state.access}</div>
                  </div>
                  <div>
                    <div className="opacity-80 mb-1">Banner/Acción:</div>
                    <div className="font-semibold">{state.banner}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Components Created */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Componentes creados/actualizados</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {components.map((component) => (
              <div
                key={component.name}
                className={`flex items-center justify-between p-3 border rounded-lg ${
                  component.status === 'new'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-blue-50 border-blue-200'
                }`}
              >
                <div className="font-mono text-sm">
                  <span className={component.status === 'new' ? 'text-green-900' : 'text-blue-900'}>
                    {component.name}
                  </span>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded ${
                    component.status === 'new'
                      ? 'bg-green-600 text-white'
                      : 'bg-blue-600 text-white'
                  }`}
                >
                  {component.status === 'new' ? 'NEW' : 'UPD'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Testing Instructions */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Instrucciones de prueba</h3>
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border-l-4 border-amber-600 rounded-lg">
              <h4 className="font-bold text-amber-900 mb-2">1. Prueba trial_expiring</h4>
              <p className="text-sm text-amber-800">
                Selecciona "Trial expirando" → Debe aparecer banner amarillo en el topbar
                con botón "Ver planes" que navega a /saas/billing.
              </p>
            </div>

            <div className="p-4 bg-red-50 border-l-4 border-red-600 rounded-lg">
              <h4 className="font-bold text-red-900 mb-2">2. Prueba payment_failed</h4>
              <p className="text-sm text-red-800">
                Selecciona "Pago fallido" → Banner rojo con "Actualizar pago".
                Intenta firmar documentos o crear ventas (deben bloquearse).
              </p>
            </div>

            <div className="p-4 bg-orange-50 border-l-4 border-orange-600 rounded-lg">
              <h4 className="font-bold text-orange-900 mb-2">3. Prueba grace_period</h4>
              <p className="text-sm text-orange-800">
                Selecciona "Periodo de gracia" → Banner naranja con contador en tiempo real (72h).
                Solo acciones básicas permitidas.
              </p>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800 border-l-4 border-gray-600 rounded-lg">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">4. Prueba suspended</h4>
              <p className="text-sm text-gray-800 dark:text-gray-200">
                Selecciona "Suspendido" → Redirect automático a /saas/suspended.
                Solo acceso a Billing y Soporte.
              </p>
            </div>

            <div className="p-4 bg-blue-50 border-l-4 border-blue-600 rounded-lg">
              <h4 className="font-bold text-blue-900 mb-2">5. Prueba trial_expired</h4>
              <p className="text-sm text-blue-800">
                Selecciona "Trial expirado" → Redirect automático a /saas/billing.
                Solo Billing y Settings accesibles.
              </p>
            </div>
          </div>
        </div>

        {/* Criteria Validation */}
        <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-500 rounded-xl">
          <h3 className="text-2xl font-bold text-green-900 mb-4">✅ Criterios de aceptación cumplidos</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-900">
                <strong>7 estados de suscripción</strong> - Implementados y funcionales
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-900">
                <strong>Banners contextuales</strong> - Amarillo, rojo, naranja según estado
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-900">
                <strong>Redirects automáticos</strong> - trial_expired y suspended
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-900">
                <strong>Página Billing completa</strong> - Plan, facturas, método de pago
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-900">
                <strong>Sin datos mock</strong> - Estados del AppContext real
              </span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}