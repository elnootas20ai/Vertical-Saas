import { CheckCircle } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  onComplete: () => void;
}

export function SAAS__DocumentsCompleteModal({ onComplete }: Props) {
  useModalClose(true, onComplete);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onComplete}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-6 rounded-t-2xl text-center">
          <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-purple-600" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            🎉 Bloque 9 - Documentos Completado
          </h2>
          <p className="text-purple-50">
            Sistema completo de repositorio de documentos implementado
          </p>
        </div>

        <div className="p-8">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Pantallas creadas (6)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__Documentos__Recepción</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__Documentos__Contratos</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__Documentos__Hojas</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__Documentos__Facturas</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__Documentos__Gestoría</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__Documento__Detalle</span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Componentes creados (4)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__UploadDocumentModal</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__GenerateFromTemplateModal</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__SignDocumentModal</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__SendToGestoriaModal</span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Tabs funcionales (5)</h3>
            <div className="flex flex-wrap gap-2">
              <span className="px-4 py-2 text-sm font-semibold rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                📥 Recepción
              </span>
              <span className="px-4 py-2 text-sm font-semibold rounded-full bg-blue-100 text-blue-700">
                📄 Contratos
              </span>
              <span className="px-4 py-2 text-sm font-semibold rounded-full bg-purple-100 text-purple-700">
                📋 Hojas de encargo
              </span>
              <span className="px-4 py-2 text-sm font-semibold rounded-full bg-green-100 text-green-700">
                🧾 Facturas
              </span>
              <span className="px-4 py-2 text-sm font-semibold rounded-full bg-amber-100 text-amber-700">
                🏛️ Gestoría
              </span>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Estados de documento (3)</h3>
            <div className="flex gap-3">
              <span className="px-4 py-2 text-sm font-semibold rounded-full bg-amber-100 text-amber-700">
                ⏳ Pendiente
              </span>
              <span className="px-4 py-2 text-sm font-semibold rounded-full bg-green-100 text-green-700">
                ✓ Firmado
              </span>
              <span className="px-4 py-2 text-sm font-semibold rounded-full bg-blue-100 text-blue-700">
                📨 Enviado
              </span>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Plantillas disponibles (5)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
                <div className="font-semibold text-gray-900 dark:text-gray-100">📥 Contrato de compra</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Variables: cliente_*, vehiculo_*, precio</div>
              </div>
              <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
                <div className="font-semibold text-gray-900 dark:text-gray-100">📤 Contrato de venta</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Variables: cliente_*, vehiculo_*, precio</div>
              </div>
              <div className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg">
                <div className="font-semibold text-gray-900 dark:text-gray-100">📋 Hoja de encargo</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Variables: cliente_*, fecha</div>
              </div>
              <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg">
                <div className="font-semibold text-gray-900 dark:text-gray-100">🧾 Factura</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Variables: cliente_*, vehiculo_*, precio</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="font-semibold text-gray-900 dark:text-gray-100">📝 Documento de recepción</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Variables: vehiculo_*, fecha, responsable</div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Acciones implementadas</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Generar desde plantilla</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Selector de plantilla + preview con variables auto-completadas</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Firmar documento (MVP)</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Marca como firmado + añade sello "FIRMADO" con fecha</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Enviar a gestoría</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Genera paquete PDF + cambia estado a "Enviado"</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Subir documento</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Upload de archivos con vinculación a vehículo/cliente</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Historial de cambios</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Timeline completo con creación, modificaciones, firma y envío</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Sistema de variables</h3>
            <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl">
              <div className="font-semibold text-purple-900 mb-2">Variables disponibles en plantillas</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-purple-800">
                <div className="font-mono text-xs">{`{cliente_nombre}`}</div>
                <div className="font-mono text-xs">{`{cliente_dni}`}</div>
                <div className="font-mono text-xs">{`{cliente_telefono}`}</div>
                <div className="font-mono text-xs">{`{cliente_email}`}</div>
                <div className="font-mono text-xs">{`{cliente_direccion}`}</div>
                <div className="font-mono text-xs">{`{vehiculo_marca}`}</div>
                <div className="font-mono text-xs">{`{vehiculo_modelo}`}</div>
                <div className="font-mono text-xs">{`{vehiculo_matricula}`}</div>
                <div className="font-mono text-xs">{`{precio}`}</div>
                <div className="font-mono text-xs">{`{fecha}`}</div>
                <div className="font-mono text-xs">{`{responsable}`}</div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm text-blue-900">
              <span className="font-semibold">Navegación:</span> La tabla muestra todos los documentos por tipo. 
              Generar desde plantilla muestra preview con variables auto-completadas. Firmar añade sello visual 
              y cambia estado. Enviar a gestoría genera paquete PDF. El detalle incluye historial completo de cambios.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-8 py-6 bg-gray-50 dark:bg-gray-800 rounded-b-2xl">
          <button
            onClick={onComplete}
            className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl"
          >
            OK, continuar
          </button>
        </div>
      </div>
    </div>
  );
}
