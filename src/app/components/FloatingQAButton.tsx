import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { CheckCircle, X, Map, ListChecks, Sparkles } from 'lucide-react';

export function FloatingQAButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);

  // No mostrar en las páginas de QA, mapa, resumen o SaaS (tiene su propio botón)
  if (
    location.pathname.startsWith('/qa') || 
    location.pathname === '/navigation-map' ||
    location.pathname === '/project-summary' ||
    location.pathname.startsWith('/saas')
  ) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isExpanded ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-2 border-green-500 p-4 w-72 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Herramientas
            </h3>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
          
          <div className="space-y-2">
            <button
              onClick={() => navigate('/project-summary')}
              className="w-full flex items-center gap-3 p-3 bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 rounded-lg transition-colors text-left border border-blue-200"
            >
              <Sparkles className="w-5 h-5 text-purple-600" />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">Resumen del Proyecto</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Vista general completa</div>
              </div>
            </button>

            <button
              onClick={() => navigate('/qa')}
              className="w-full flex items-center gap-3 p-3 bg-green-50 hover:bg-green-100 rounded-lg transition-colors text-left"
            >
              <ListChecks className="w-5 h-5 text-green-600" />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">Sistema QA</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">152 verificaciones</div>
              </div>
            </button>
            
            <button
              onClick={() => navigate('/navigation-map')}
              className="w-full flex items-center gap-3 p-3 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors text-left"
            >
              <Map className="w-5 h-5 text-amber-600" />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">Mapa de Navegación</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Diagrama visual</div>
              </div>
            </button>
          </div>
          
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Prototipo 100% navegable
            </p>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsExpanded(true)}
          className="bg-green-600 hover:bg-green-700 text-white rounded-full p-4 shadow-2xl hover:scale-110 transition-all group"
          title="Herramientas QA"
        >
          <CheckCircle className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}