import { Layout } from '../../components/saas/Layout';
import { ArrowRight, CheckCircle } from 'lucide-react';

export function SAAS__FlowMap() {
  const flows = [
    {
      title: 'Dashboard',
      path: '/saas/dashboard',
      connects: ['Operaciones', 'Vehículos', 'Clientes', 'Ventas'],
      color: 'from-blue-500 to-blue-600',
    },
    {
      title: 'Operaciones',
      path: '/saas/operations',
      connects: ['Detalle Operación', 'Vehículos', 'Documentos'],
      color: 'from-purple-500 to-purple-600',
    },
    {
      title: 'Vehículos',
      path: '/saas/vehicles',
      connects: ['Ficha Vehículo', 'Ubicaciones', 'Operaciones'],
      color: 'from-green-500 to-green-600',
    },
    {
      title: 'Ubicaciones',
      path: '/saas/locations',
      connects: ['Ficha Vehículo', 'Mover vehículo', 'Historial'],
      color: 'from-amber-500 to-amber-600',
    },
    {
      title: 'Clientes',
      path: '/saas/clients',
      connects: ['Leads Drawer', 'Ficha Cliente', 'Crear Contrato'],
      color: 'from-pink-500 to-pink-600',
    },
    {
      title: 'Documentos',
      path: '/saas/documents',
      connects: ['Detalle Doc', 'Firmar', 'Enviar Gestoría', 'Plantillas'],
      color: 'from-indigo-500 to-indigo-600',
    },
    {
      title: 'Ventas',
      path: '/saas/sales',
      connects: ['Crear Venta', 'Generar Docs', 'Pipeline'],
      color: 'from-emerald-500 to-emerald-600',
    },
    {
      title: 'Llamadas (IA)',
      path: '/saas/calls',
      connects: ['Detalle Llamada', 'Resumen IA', 'Tareas'],
      color: 'from-violet-500 to-violet-600',
      disabled: true,
    },
    {
      title: 'Finanzas',
      path: '/saas/finance',
      connects: ['Visión', 'Cobros/Pagos'],
      color: 'from-cyan-500 to-cyan-600',
    },
  ];

  return (
    <Layout title="SAAS Flow Map" subtitle="Mapa de navegación y flujos">
      <div className="space-y-8">
        {/* Navigation Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Navegación Principal</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {flows.map((flow) => (
              <div key={flow.title} className={`space-y-3 ${flow.disabled ? 'opacity-40 grayscale' : ''}`}>
                <div className={`p-4 bg-gradient-to-r ${flow.color} rounded-xl text-white`}>
                  <h3 className="font-bold text-lg mb-1">
                    {flow.title}
                    {flow.disabled && <span className="ml-2 text-xs font-normal opacity-80">Próximamente</span>}
                  </h3>
                  <p className="text-sm opacity-90">{flow.path}</p>
                </div>
                <div className="pl-4 border-l-2 border-gray-200 dark:border-gray-700 space-y-2">
                  {flow.connects.map((connection, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <ArrowRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                      <span>{connection}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Interaction Map */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Tipos de Interacción</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-blue-50 border-2 border-blue-200 rounded-xl">
              <h3 className="font-bold text-blue-900 mb-4 text-lg">📋 Tabs/Pills</h3>
              <ul className="space-y-2 text-sm text-blue-800">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Operaciones: 11 estados con pills</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Clientes: Leads (6 pills) + Clientes</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Documentos: 5 tipos (tabs)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Finanzas: Visión + Cobros/Pagos</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Ubicaciones: 3 zonas</span>
                </li>
              </ul>
            </div>

            <div className="p-6 bg-green-50 border-2 border-green-200 rounded-xl">
              <h3 className="font-bold text-green-900 mb-4 text-lg">🔍 Detalle Pages</h3>
              <ul className="space-y-2 text-sm text-green-800">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Operación → /operations/:id</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Vehículo → /vehicles/:id (4 tabs)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Cliente → /clients/:id (4 tabs)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Documento → /documents/:id</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Llamada → /calls/:id (3 tabs)</span>
                </li>
              </ul>
            </div>

            <div className="p-6 bg-purple-50 border-2 border-purple-200 rounded-xl">
              <h3 className="font-bold text-purple-900 mb-4 text-lg">➕ Modales de Creación</h3>
              <ul className="space-y-2 text-sm text-purple-800">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Añadir Operación</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Añadir Vehículo</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Añadir Cliente</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Subir Documento</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Crear Venta</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Generar Plantilla</span>
                </li>
              </ul>
            </div>

            <div className="p-6 bg-amber-50 border-2 border-amber-200 rounded-xl">
              <h3 className="font-bold text-amber-900 mb-4 text-lg">🎯 Acciones Especiales</h3>
              <ul className="space-y-2 text-sm text-amber-800">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Drawer: Lead detail, Notificaciones</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Filtros: Búsqueda + Filtros drawer</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Switch: Tarjetas ↔ Tabla</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Firmar documento MVP</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Enviar a gestoría</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Mover vehículo (drag & click)</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Topbar & Sidebar */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Layout Components</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 text-lg">Sidebar (Fijo)</h3>
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <li>✓ Dashboard</li>
                <li>✓ Operaciones</li>
                <li>✓ Vehículos</li>
                <li>✓ Ubicaciones</li>
                <li>✓ Clientes</li>
                <li>✓ Documentos</li>
                <li>✓ Ventas</li>
                <li>✓ Llamadas (IA)</li>
                <li>✓ ANCOVE</li>
                <li>✓ Equipo</li>
                <li>✓ Finanzas</li>
                <li>✓ Facturación</li>
                <li>✓ Sistema</li>
              </ul>
            </div>

            <div className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 text-lg">Topbar (Global)</h3>
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <li>🔍 Búsqueda global</li>
                <li>❓ Ayuda → Modal Help</li>
                <li>🔔 Notificaciones → Drawer</li>
                <li>👤 Perfil → Modal Perfil</li>
                <li>🏢 Selector empresa → Modal</li>
                <li>📱 Menú móvil (responsive)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
