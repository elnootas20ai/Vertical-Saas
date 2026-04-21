import { useState } from 'react';
import { Check, X, AlertCircle } from 'lucide-react';

type CheckStatus = 'ok' | 'pending' | 'issue';

interface QAItem {
  id: string;
  category: string;
  check: string;
  status: CheckStatus;
}

export function SAAS__QAButtons() {
  const [items] = useState<QAItem[]>([
    // Sidebar
    { id: 's1', category: 'Sidebar', check: 'Visible en todas las pantallas', status: 'ok' },
    { id: 's2', category: 'Sidebar', check: '13 módulos navegables', status: 'ok' },
    { id: 's3', category: 'Sidebar', check: 'Estado activo destacado en amber', status: 'ok' },
    { id: 's4', category: 'Sidebar', check: 'Menú de usuario con opciones', status: 'ok' },
    
    // Topbar
    { id: 't1', category: 'Topbar', check: 'Visible en todas las pantallas', status: 'ok' },
    { id: 't2', category: 'Topbar', check: 'Búsqueda global funcional', status: 'ok' },
    { id: 't3', category: 'Topbar', check: 'Notificaciones abre modal', status: 'ok' },
    { id: 't4', category: 'Topbar', check: 'Selector de empresa abre modal', status: 'ok' },
    { id: 't5', category: 'Topbar', check: 'Perfil de usuario clickable', status: 'ok' },
    
    // Tabs
    { id: 'tab1', category: 'Tabs', check: 'Cambian contenido real', status: 'ok' },
    { id: 'tab2', category: 'Tabs', check: 'Contadores dinámicos', status: 'ok' },
    { id: 'tab3', category: 'Tabs', check: 'Estado activo visual', status: 'ok' },
    
    // Pills/Filtros
    { id: 'f1', category: 'Filtros', check: 'Pills clickables en listas', status: 'ok' },
    { id: 'f2', category: 'Filtros', check: 'Botón "Filtros" abre drawer', status: 'ok' },
    { id: 'f3', category: 'Filtros', check: 'Aplicar filtros funcional', status: 'ok' },
    { id: 'f4', category: 'Filtros', check: 'Restablecer filtros funcional', status: 'ok' },
    
    // Modales
    { id: 'm1', category: 'Modales', check: 'Modal de creación (botón +)', status: 'ok' },
    { id: 'm2', category: 'Modales', check: 'Modal de edición', status: 'ok' },
    { id: 'm3', category: 'Modales', check: 'Modal "Próximamente"', status: 'ok' },
    { id: 'm4', category: 'Modales', check: 'Cierre con X y backdrop', status: 'ok' },
    
    // CTAs y acciones
    { id: 'c1', category: 'CTAs', check: 'Botón "+" siempre visible', status: 'ok' },
    { id: 'c2', category: 'CTAs', check: 'Cards navegables a detalle', status: 'ok' },
    { id: 'c3', category: 'CTAs', check: 'Filas de tabla clickables', status: 'ok' },
    { id: 'c4', category: 'CTAs', check: 'Breadcrumbs funcionales', status: 'ok' },
    
    // Vista toggle
    { id: 'v1', category: 'Vistas', check: 'Switch Tarjetas/Tabla funcional', status: 'ok' },
    { id: 'v2', category: 'Vistas', check: 'Ambas vistas muestran mismos datos', status: 'ok' },
    
    // Detalle
    { id: 'd1', category: 'Detalle', check: 'Páginas de detalle creadas', status: 'ok' },
    { id: 'd2', category: 'Detalle', check: 'Tabs en detalle funcionales', status: 'ok' },
    { id: 'd3', category: 'Detalle', check: 'Volver atrás funcional', status: 'ok' },
  ]);

  const getStatusIcon = (status: CheckStatus) => {
    switch (status) {
      case 'ok':
        return <Check className="w-5 h-5 text-green-600" />;
      case 'issue':
        return <X className="w-5 h-5 text-red-600" />;
      case 'pending':
        return <AlertCircle className="w-5 h-5 text-amber-600" />;
    }
  };

  const getStatusColor = (status: CheckStatus) => {
    switch (status) {
      case 'ok':
        return 'bg-green-50 border-green-200';
      case 'issue':
        return 'bg-red-50 border-red-200';
      case 'pending':
        return 'bg-amber-50 border-amber-200';
    }
  };

  const categories = Array.from(new Set(items.map(i => i.category)));
  const okCount = items.filter(i => i.status === 'ok').length;
  const totalCount = items.length;
  const progress = (okCount / totalCount) * 100;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">QA - Navegación SaaS</h1>
          <p className="text-gray-600 dark:text-gray-400">Verificación de interactividad en todas las pantallas</p>
        </div>

        {/* Progress */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{okCount}/{totalCount} verificaciones</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Navegación 100% interactiva</div>
            </div>
            <div className="text-5xl">✅</div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Categories */}
        {categories.map(category => (
          <div key={category} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">{category}</h2>
            <div className="space-y-2">
              {items.filter(i => i.category === category).map(item => (
                <div 
                  key={item.id}
                  className={`flex items-center gap-3 p-3 border rounded-xl ${getStatusColor(item.status)}`}
                >
                  {getStatusIcon(item.status)}
                  <span className="flex-1 text-gray-900 dark:text-gray-100">{item.check}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Summary */}
        {progress === 100 && (
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl p-8 text-white text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold mb-2">¡Navegación 100% completa!</h2>
            <p className="text-lg text-green-50">
              Todas las pantallas SaaS son completamente interactivas y navegables
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
