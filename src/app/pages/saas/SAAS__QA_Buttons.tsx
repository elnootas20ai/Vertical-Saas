import { useState } from 'react';
import { Layout } from '../../components/saas/Layout';
import { CheckCircle, Circle, ArrowRight } from 'lucide-react';

interface QAItem {
  id: string;
  category: string;
  item: string;
  testPath?: string;
  checked: boolean;
}

export function SAAS__QA_Buttons() {
  const [qaItems, setQaItems] = useState<QAItem[]>([
    // Sidebar
    { id: '1', category: 'Sidebar', item: 'Dashboard navega correctamente', testPath: '/saas/dashboard', checked: false },
    { id: '2', category: 'Sidebar', item: 'Operaciones navega correctamente', testPath: '/saas/operations', checked: false },
    { id: '3', category: 'Sidebar', item: 'Vehículos navega correctamente', testPath: '/saas/vehicles', checked: false },
    { id: '4', category: 'Sidebar', item: 'Ubicaciones navega correctamente', testPath: '/saas/locations', checked: false },
    { id: '5', category: 'Sidebar', item: 'Clientes navega correctamente', testPath: '/saas/clients', checked: false },
    { id: '6', category: 'Sidebar', item: 'Documentos navega correctamente', testPath: '/saas/documents', checked: false },
    { id: '7', category: 'Sidebar', item: 'Ventas navega correctamente', testPath: '/saas/sales', checked: false },
    { id: '8', category: 'Sidebar', item: 'Llamadas navega correctamente', testPath: '/saas/calls', checked: false },
    { id: '9', category: 'Sidebar', item: 'ANCOVE navega correctamente', testPath: '/saas/ancove', checked: false },
    { id: '10', category: 'Sidebar', item: 'Equipo navega correctamente', testPath: '/saas/team', checked: false },
    { id: '11', category: 'Sidebar', item: 'Finanzas navega correctamente', testPath: '/saas/finance', checked: false },
    { id: '12', category: 'Sidebar', item: 'Mi plan navega correctamente', testPath: '/saas/billing', checked: false },
    { id: '13', category: 'Sidebar', item: 'Sistema navega correctamente', testPath: '/saas/settings', checked: false },

    // Topbar
    { id: '14', category: 'Topbar', item: 'Icono menú móvil abre modal', checked: false },
    { id: '15', category: 'Topbar', item: 'Búsqueda funciona', checked: false },
    { id: '16', category: 'Topbar', item: 'Botón ayuda (?) abre modal', checked: false },
    { id: '17', category: 'Topbar', item: 'Notificaciones abre drawer', checked: false },
    { id: '18', category: 'Topbar', item: 'Perfil abre modal', checked: false },
    { id: '19', category: 'Topbar', item: 'Selector empresa abre modal', checked: false },

    // Tabs
    { id: '20', category: 'Tabs', item: 'Operaciones: 11 pills cambian vista', testPath: '/saas/operations', checked: false },
    { id: '21', category: 'Tabs', item: 'Clientes: Leads/Clientes cambian vista', testPath: '/saas/clients', checked: false },
    { id: '22', category: 'Tabs', item: 'Documentos: 5 tabs cambian vista', testPath: '/saas/documents', checked: false },
    { id: '23', category: 'Tabs', item: 'Finanzas: 2 tabs cambian vista', testPath: '/saas/finance', checked: false },
    { id: '24', category: 'Tabs', item: 'Ubicaciones: 3 zonas cambian vista', testPath: '/saas/locations', checked: false },
    { id: '25', category: 'Tabs', item: 'Ficha vehículo: 4 tabs funcionan', testPath: '/saas/vehicles/veh-001', checked: false },
    { id: '26', category: 'Tabs', item: 'Ficha cliente: 4 tabs funcionan', testPath: '/saas/clients/cli-001', checked: false },
    { id: '27', category: 'Tabs', item: 'Llamada: 3 tabs funcionan', testPath: '/saas/calls/call-1', checked: false },

    // Filtros
    { id: '28', category: 'Filtros', item: 'Operaciones: filtros funcionan', testPath: '/saas/operations', checked: false },
    { id: '29', category: 'Filtros', item: 'Vehículos: búsqueda funciona', testPath: '/saas/vehicles', checked: false },
    { id: '30', category: 'Filtros', item: 'Clientes: búsqueda funciona', testPath: '/saas/clients', checked: false },
    { id: '31', category: 'Filtros', item: 'Documentos: búsqueda funciona', testPath: '/saas/documents', checked: false },

    // Modales
    { id: '32', category: 'Modales', item: 'Añadir operación abre modal', testPath: '/saas/operations', checked: false },
    { id: '33', category: 'Modales', item: 'Añadir vehículo abre modal', testPath: '/saas/vehicles', checked: false },
    { id: '34', category: 'Modales', item: 'Añadir cliente abre modal', testPath: '/saas/clients', checked: false },
    { id: '35', category: 'Modales', item: 'Subir documento abre modal', testPath: '/saas/documents', checked: false },
    { id: '36', category: 'Modales', item: 'Generar plantilla abre modal', testPath: '/saas/documents', checked: false },
    { id: '37', category: 'Modales', item: 'Crear venta abre modal', testPath: '/saas/sales', checked: false },
    { id: '38', category: 'Modales', item: 'Firmar documento abre modal', testPath: '/saas/documents', checked: false },
    { id: '39', category: 'Modales', item: 'Enviar gestoría abre modal', testPath: '/saas/documents', checked: false },

    // CTAs
    { id: '40', category: 'CTAs', item: 'Ver detalle operación funciona', testPath: '/saas/operations', checked: false },
    { id: '41', category: 'CTAs', item: 'Ver ficha vehículo funciona', testPath: '/saas/vehicles', checked: false },
    { id: '42', category: 'CTAs', item: 'Abrir drawer lead funciona', testPath: '/saas/clients', checked: false },
    { id: '43', category: 'CTAs', item: 'Ver ficha cliente funciona', testPath: '/saas/clients', checked: false },
    { id: '44', category: 'CTAs', item: 'Ver detalle documento funciona', testPath: '/saas/documents', checked: false },
    { id: '45', category: 'CTAs', item: 'Ver detalle llamada funciona', testPath: '/saas/calls', checked: false },

    // Switches
    { id: '46', category: 'Switches', item: 'Operaciones: Tarjetas ↔ Tabla', testPath: '/saas/operations', checked: false },
    { id: '47', category: 'Switches', item: 'Ubicaciones: Mover vehículo funciona', testPath: '/saas/locations', checked: false },
    { id: '48', category: 'Switches', item: 'Leads: 6 pills filtran correctamente', testPath: '/saas/clients', checked: false },
  ]);

  const toggleCheck = (id: string) => {
    setQaItems(prev => prev.map(item => 
      item.id === id ? { ...item, checked: !item.checked } : item
    ));
  };

  const groupedItems = qaItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, QAItem[]>);

  const totalItems = qaItems.length;
  const checkedItems = qaItems.filter(item => item.checked).length;
  const progress = (checkedItems / totalItems) * 100;

  return (
    <Layout title="QA Buttons & Navigation" subtitle="Verificación de navegación 100% clickable">
      <div className="space-y-6">
        {/* Progress */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white">
          <h2 className="text-2xl font-bold mb-2">✅ Control de Navegación</h2>
          <p className="text-blue-100 mb-4">
            Verifica que todos los botones, tabs, filtros y modales estén funcionando
          </p>
          <div className="bg-white/20 rounded-full h-4 overflow-hidden">
            <div 
              className="bg-white dark:bg-gray-800 h-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 text-sm">
            {checkedItems} de {totalItems} verificados ({Math.round(progress)}%)
          </div>
        </div>

        {/* Checklist */}
        <div className="space-y-4">
          {Object.entries(groupedItems).map(([category, items]) => (
            <div key={category} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center justify-between">
                  <span>{category}</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {items.filter(i => i.checked).length}/{items.length}
                  </span>
                </h3>
              </div>
              <div className="p-4 space-y-2">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => toggleCheck(item.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors text-left group"
                  >
                    {item.checked ? (
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    )}
                    <span className={`flex-1 ${item.checked ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                      {item.item}
                    </span>
                    {item.testPath && (
                      <ArrowRight className="w-4 h-4 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        {progress === 100 && (
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl p-8 text-white text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold mb-2">¡Navegación 100% Verificada!</h2>
            <p className="text-green-100">
              Todos los botones, tabs, filtros y modales están funcionando correctamente
            </p>
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-6">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Sidebar</div>
            <div className="text-3xl font-bold text-blue-600">
              {groupedItems['Sidebar']?.filter(i => i.checked).length || 0}/{groupedItems['Sidebar']?.length || 0}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-6">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Topbar</div>
            <div className="text-3xl font-bold text-purple-600">
              {groupedItems['Topbar']?.filter(i => i.checked).length || 0}/{groupedItems['Topbar']?.length || 0}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-6">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Tabs</div>
            <div className="text-3xl font-bold text-green-600">
              {groupedItems['Tabs']?.filter(i => i.checked).length || 0}/{groupedItems['Tabs']?.length || 0}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-6">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Modales</div>
            <div className="text-3xl font-bold text-amber-600">
              {groupedItems['Modales']?.filter(i => i.checked).length || 0}/{groupedItems['Modales']?.length || 0}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
