import { useState } from 'react';
import { Layout } from '../../components/saas/Layout';
import { CheckCircle, Circle, ExternalLink } from 'lucide-react';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  path?: string;
  checked: boolean;
}

export function BlockA1Checklist() {
  const [items, setItems] = useState<ChecklistItem[]>([
    {
      id: '1',
      label: 'Drawer de notificaciones',
      description: 'Componente global SAAS__NotificationsDrawer con lista de notificaciones reales',
      path: '/saas/dashboard',
      checked: true,
    },
    {
      id: '2',
      label: 'Menú de perfil',
      description: 'Modal SAAS__ProfileModal con: Mi perfil, Empresa, Billing, Cerrar sesión',
      path: '/saas/dashboard',
      checked: true,
    },
    {
      id: '3',
      label: 'Modal de ayuda',
      description: 'SAAS__HelpModal con: FAQ, Soporte, Contacto y guías rápidas',
      path: '/saas/dashboard',
      checked: true,
    },
    {
      id: '4',
      label: 'Toggle colapsar/expandir sidebar',
      description: 'Botón en Topbar que colapsa sidebar. Estado persistente en localStorage',
      path: '/saas/dashboard',
      checked: true,
    },
    {
      id: '5',
      label: 'Modal "Próximamente" reutilizable',
      description: 'Componente SAAS__ComingSoonModal para acciones no implementadas',
      path: '/saas/dashboard',
      checked: true,
    },
    {
      id: '6',
      label: 'Toggle Tarjetas/Tabla con persistencia',
      description: 'Componente ViewToggle + hook useViewMode para guardar preferencia por módulo',
      path: '/saas/vehicles',
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
    { name: 'SAAS__NotificationsDrawer', path: '/src/app/components/design-system/SAAS__NotificationsDrawer.tsx' },
    { name: 'SAAS__ProfileModal', path: '/src/app/components/design-system/SAAS__ProfileModal.tsx' },
    { name: 'SAAS__HelpModal', path: '/src/app/components/design-system/SAAS__HelpModal.tsx' },
    { name: 'SAAS__ComingSoonModal', path: '/src/app/components/design-system/SAAS__ComingSoonModal.tsx' },
    { name: 'ViewToggle', path: '/src/app/components/design-system/ViewToggle.tsx' },
    { name: 'Layout (updated)', path: '/src/app/components/saas/Layout.tsx' },
    { name: 'Sidebar (updated)', path: '/src/app/components/saas/Sidebar.tsx' },
    { name: 'Topbar (updated)', path: '/src/app/components/saas/Topbar.tsx' },
  ];

  return (
    <Layout title="Checklist Bloque A1" subtitle="Topbar + UI Helpers - Verificación completa">
      <div className="space-y-6">
        {/* Progress Card */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-8 text-white">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold mb-2">BLOQUE A1 - Completado</h2>
              <div className="text-green-100">
                {completedCount} de {totalCount} elementos implementados
              </div>
            </div>
            <div className="text-right">
              <div className="text-6xl font-bold">{progress}%</div>
              <div className="text-green-100">Completado</div>
            </div>
          </div>
          <div className="w-full bg-white/20 rounded-full h-4 overflow-hidden">
            <div
              className="bg-white dark:bg-gray-800 h-full transition-all duration-500 rounded-full"
              style={{ width: `${progress}%` }}
            />
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

        {/* Components Created */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Componentes creados/actualizados</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {components.map((component) => (
              <div
                key={component.name}
                className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg"
              >
                <div className="font-mono text-sm text-blue-900">{component.name}</div>
                <CheckCircle className="w-4 h-4 text-green-600" />
              </div>
            ))}
          </div>
        </div>

        {/* Features Summary */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Funcionalidades clave</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl">
              <h4 className="font-bold text-blue-900 mb-2">🔔 Notificaciones</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Drawer lateral animado</li>
                <li>• 4 tipos: success, warning, info, alert</li>
                <li>• Timestamps relativos (Hace Xh)</li>
                <li>• Badge de no leídas</li>
                <li>• Empty state cuando no hay</li>
              </ul>
            </div>

            <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl">
              <h4 className="font-bold text-purple-900 mb-2">👤 Perfil</h4>
              <ul className="text-sm text-purple-800 space-y-1">
                <li>• Modal centrado</li>
                <li>• 4 opciones: Perfil, Empresa, Billing, Config</li>
                <li>• Info usuario del AppContext</li>
                <li>• Badge plan activo</li>
                <li>• Botón cerrar sesión destacado</li>
              </ul>
            </div>

            <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
              <h4 className="font-bold text-green-900 mb-2">❓ Ayuda</h4>
              <ul className="text-sm text-green-800 space-y-1">
                <li>• Centro de ayuda completo</li>
                <li>• 3 opciones: FAQ, Chat, Email</li>
                <li>• 6 guías rápidas</li>
                <li>• Links externos funcionales</li>
                <li>• Info de versión</li>
              </ul>
            </div>

            <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl">
              <h4 className="font-bold text-amber-900 mb-2">📏 Sidebar Collapse</h4>
              <ul className="text-sm text-amber-800 space-y-1">
                <li>• Toggle desde Topbar (icono Menu)</li>
                <li>• Animación suave (300ms)</li>
                <li>• Modo colapsado: solo iconos</li>
                <li>• Estado en localStorage persistente</li>
                <li>• Tooltips en modo colapsado</li>
              </ul>
            </div>

            <div className="p-4 bg-gradient-to-br from-red-50 to-pink-50 border-2 border-red-200 rounded-xl">
              <h4 className="font-bold text-red-900 mb-2">🚀 Próximamente</h4>
              <ul className="text-sm text-red-800 space-y-1">
                <li>• Modal genérico reutilizable</li>
                <li>• Personalizable con featureName</li>
                <li>• Diseño consistente</li>
                <li>• Botón "Entendido"</li>
                <li>• Usado en acciones no implementadas</li>
              </ul>
            </div>

            <div className="p-4 bg-gradient-to-br from-gray-50 to-slate-50 border-2 border-gray-300 rounded-xl">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">🔄 Toggle Vista</h4>
              <ul className="text-sm text-gray-800 dark:text-gray-200 space-y-1">
                <li>• Componente ViewToggle</li>
                <li>• 2 modos: Tarjetas / Tabla</li>
                <li>• Iconos LayoutGrid / List</li>
                <li>• Estilo consistente</li>
                <li>• Reutilizable en todos los módulos</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Testing Instructions */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Instrucciones de prueba</h3>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border-l-4 border-blue-600 rounded-lg">
              <h4 className="font-bold text-blue-900 mb-2">1. Prueba el Topbar completo</h4>
              <p className="text-sm text-blue-800">
                Haz clic en: 🔔 Notificaciones, 👤 Perfil, ❓ Ayuda, 🏢 Selector empresa.
                Todos deben abrir sus respectivos modales/drawers.
              </p>
            </div>

            <div className="p-4 bg-purple-50 border-l-4 border-purple-600 rounded-lg">
              <h4 className="font-bold text-purple-900 mb-2">2. Prueba el collapse del sidebar</h4>
              <p className="text-sm text-purple-800">
                Haz clic en el icono ☰ (Menu) del Topbar. El sidebar debe colapsar mostrando solo iconos.
                Recarga la página y debe mantener el estado.
              </p>
            </div>

            <div className="p-4 bg-green-50 border-l-4 border-green-600 rounded-lg">
              <h4 className="font-bold text-green-900 mb-2">3. Prueba navegación desde modales</h4>
              <p className="text-sm text-green-800">
                Desde el modal de Perfil, haz clic en "Mi plan" - debe navegar a /saas/billing.
                Desde Ayuda, los enlaces deben funcionar.
              </p>
            </div>

            <div className="p-4 bg-amber-50 border-l-4 border-amber-600 rounded-lg">
              <h4 className="font-bold text-amber-900 mb-2">4. Verifica "Próximamente"</h4>
              <p className="text-sm text-amber-800">
                Haz clic en el selector de empresa (Coches García). Debe abrir el modal "Próximamente"
                con mensaje personalizado.
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
                <strong>0 botones/iconos del topbar sin acción</strong> - Todos funcionales
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-900">
                <strong>Modal "Próximamente" para acciones no implementadas</strong> - Componente creado y usado
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-900">
                <strong>Sin datos mock hardcodeados</strong> - Usa datos del AppContext donde aplica
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-900">
                <strong>Empty states reales</strong> - Implementados en notificaciones
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-900">
                <strong>Sidebar collapse persistente</strong> - localStorage implementado
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-900">
                <strong>Toggle Tarjetas/Tabla</strong> - Componente reutilizable creado
              </span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}