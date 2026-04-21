import { CheckCircle } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  onComplete: () => void;
}

export function SAAS__ClientsCompleteModal({ onComplete }: Props) {
  useModalClose(true, onComplete);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onComplete}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-6 rounded-t-2xl text-center">
          <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            🎉 Bloque 8 - Clientes Completado
          </h2>
          <p className="text-blue-50">
            Sistema completo de gestión de leads y clientes implementado
          </p>
        </div>

        <div className="p-8">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Pantallas creadas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__Clientes__Leads (con pills)</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__Clientes__Clientes (tabla)</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__Clientes__FichaCliente</span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Componentes creados</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__LeadDrawer</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__NewLeadModal</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__ConvertToClientModal</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__CreateContractModal</span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Pills de leads (6)</h3>
            <div className="flex flex-wrap gap-2">
              <span className="px-4 py-2 text-sm font-semibold rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                Todos
              </span>
              <span className="px-4 py-2 text-sm font-semibold rounded-full bg-blue-100 text-blue-700">
                Nuevos
              </span>
              <span className="px-4 py-2 text-sm font-semibold rounded-full bg-purple-100 text-purple-700">
                Contactados
              </span>
              <span className="px-4 py-2 text-sm font-semibold rounded-full bg-amber-100 text-amber-700">
                Cita
              </span>
              <span className="px-4 py-2 text-sm font-semibold rounded-full bg-green-100 text-green-700">
                Reserva
              </span>
              <span className="px-4 py-2 text-sm font-semibold rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                Perdidos
              </span>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Tabs de cliente (4)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-sm font-medium">
                👤 Datos
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-sm font-medium">
                💬 Interacciones
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-sm font-medium">
                🚗 Vehículos
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-sm font-medium">
                📄 Documentos
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Funcionalidades principales</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Gestión de leads con pills</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">6 estados filtrables con contador automático</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Drawer de detalle rápido</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Vista completa del lead con CTA de conversión</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Conversión de lead a cliente</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Modal con datos adicionales y consentimientos GDPR</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Tabla de clientes completa</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Con búsqueda, filtros y acceso a ficha</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Ficha de cliente detallada</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">4 tabs: Datos, Interacciones, Vehículos, Documentos</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Creación de contratos con plantillas</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">4 plantillas con auto-relleno y checklist de campos</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Auto-relleno de contratos</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl">
                <div className="font-semibold text-purple-900 mb-2">4 Plantillas</div>
                <ul className="text-sm text-purple-800 space-y-1">
                  <li>📥 Contrato de compra</li>
                  <li>📤 Contrato de venta</li>
                  <li>🔖 Contrato de reserva</li>
                  <li>💰 Contrato de financiación</li>
                </ul>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="font-semibold text-blue-900 mb-2">Preview inteligente</div>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>✓ Campos completados automáticamente</li>
                  <li>⚠️ Checklist de campos faltantes</li>
                  <li>📊 Estadísticas de completitud</li>
                  <li>👁️ Preview antes de generar</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm text-blue-900">
              <span className="font-semibold">Navegación:</span> Los leads abren un drawer lateral con detalle 
              completo y botón de "Convertir a cliente". Los clientes tienen ficha completa con 4 tabs. 
              El modal de contratos muestra preview con auto-relleno y checklist de campos completados/faltantes.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-8 py-6 bg-gray-50 dark:bg-gray-800 rounded-b-2xl">
          <button
            onClick={onComplete}
            className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl"
          >
            OK, continuar
          </button>
        </div>
      </div>
    </div>
  );
}
