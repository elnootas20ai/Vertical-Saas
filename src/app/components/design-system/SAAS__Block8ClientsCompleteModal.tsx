import { CheckCircle } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  onComplete: () => void;
}

export function SAAS__Block8ClientsCompleteModal({ onComplete }: Props) {
  useModalClose(true, onComplete);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onComplete}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-6 rounded-t-2xl text-center">
          <div className="w-20 h-20 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-12 h-12 text-blue-600" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">
            👥 Bloque 8 - Módulo de Clientes/CRM Completado
          </h2>
          <p className="text-blue-50 text-lg">
            Sistema completo de gestión de leads y clientes
          </p>
        </div>

        <div className="p-8">
          {/* Pantallas */}
          <div className="mb-8 p-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-xl">
            <h3 className="text-xl font-bold text-blue-900 mb-4">🖥️ 2 Pantallas Principales + Ficha</h3>
            <div className="space-y-3">
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-blue-900 mb-1">SAAS__Clientes (3 tabs)</div>
                <div className="text-sm text-blue-700">Leads | Clientes | Ventas</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-blue-900 mb-1">SAAS__Clientes__FichaCliente</div>
                <div className="text-sm text-blue-700">Detalle completo con 4 tabs</div>
              </div>
            </div>
          </div>

          {/* Tab Leads */}
          <div className="mb-8 p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
            <h3 className="text-xl font-bold text-green-900 mb-4">📊 Tab Leads (Pills + Cards)</h3>
            <div className="space-y-4">
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-green-900 mb-2">6 Pills de filtro con counters</div>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">Todos (6)</span>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">Nuevos (2)</span>
                  <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">Contactados (1)</span>
                  <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold">Cita (1)</span>
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">Reserva (1)</span>
                  <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-full text-xs font-semibold">Perdidos (1)</span>
                </div>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-green-900 mb-2">Cards de lead (Grid 3 columnas)</div>
                <ul className="text-sm text-green-700 space-y-1 pl-4">
                  <li>• <strong>Header:</strong> Nombre + Badge estado (colores semánticos)</li>
                  <li>• <strong>Contacto:</strong> Teléfono (icono Phone) + Email (icono Mail)</li>
                  <li>• <strong>Vehículo de interés:</strong> Card azul con modelo + presupuesto</li>
                  <li>• <strong>Footer:</strong> Badge origen + Fecha creación</li>
                  <li>• <strong>Responsable:</strong> Icono UserPlus + nombre</li>
                  <li>• <strong>Click:</strong> Abre drawer de detalle</li>
                  <li>• Hover effect con shadow</li>
                </ul>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-green-900 mb-2">Búsqueda funcional</div>
                <div className="text-sm text-green-700">
                  Filtra por nombre, email, teléfono o vehículo de interés en tiempo real
                </div>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-green-900 mb-2">Botón "+ Nuevo lead"</div>
                <div className="text-sm text-green-700">Arriba a la derecha, abre modal de creación</div>
              </div>
            </div>
          </div>

          {/* Lead Drawer */}
          <div className="mb-8 p-6 bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl">
            <h3 className="text-xl font-bold text-purple-900 mb-4">🎯 Lead Drawer (Detalle rápido)</h3>
            <div className="space-y-3">
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-purple-900 mb-2">Header degradado azul-morado</div>
                <ul className="text-sm text-purple-700 space-y-1 pl-4">
                  <li>• Título "Detalle del lead"</li>
                  <li>• Badges: Estado + Origen (blancos con transparencia)</li>
                </ul>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-purple-900 mb-2">Sección: Información de contacto</div>
                <ul className="text-sm text-purple-700 space-y-1 pl-4">
                  <li>• Nombre completo</li>
                  <li>• Teléfono (link con tel:)</li>
                  <li>• Email (link con mailto:)</li>
                </ul>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-purple-900 mb-2">Sección: Vehículo de interés (verde)</div>
                <ul className="text-sm text-purple-700 space-y-1 pl-4">
                  <li>• Modelo (grande, bold)</li>
                  <li>• Presupuesto</li>
                  <li>• Botón "Ver ficha del vehículo" si está vinculado</li>
                </ul>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-purple-900 mb-2">Sección: Notas</div>
                <div className="text-sm text-purple-700">Texto libre con toda la información</div>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-purple-900 mb-2">Sección: Metadata</div>
                <ul className="text-sm text-purple-700 space-y-1 pl-4">
                  <li>• Responsable (icono UserPlus)</li>
                  <li>• Fecha de creación (icono Calendar)</li>
                </ul>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-purple-900 mb-2">CTA principal</div>
                <div className="text-sm text-purple-700 mb-2">
                  <strong>Botón "Convertir a cliente"</strong> → degradado azul-morado, full width, bold
                </div>
                <div className="text-sm text-purple-700">
                  <strong>Acciones secundarias:</strong> Llamar (verde) | Email (azul) | Programar cita
                </div>
              </div>
            </div>
          </div>

          {/* Tab Clientes */}
          <div className="mb-8 p-6 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl">
            <h3 className="text-xl font-bold text-amber-900 mb-4">📋 Tab Clientes (Tabla)</h3>
            <div className="space-y-3">
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-amber-900 mb-2">Tabla con 7 columnas</div>
                <div className="grid grid-cols-2 gap-2 text-sm text-amber-700">
                  <div>1. <strong>Nombre</strong> (bold) + Ciudad (icono MapPin)</div>
                  <div>2. <strong>DNI/NIE</strong> (font-mono)</div>
                  <div>3. <strong>Teléfono</strong></div>
                  <div>4. <strong>Email</strong></div>
                  <div>5. <strong>Estado</strong> (badge Activo/Inactivo)</div>
                  <div>6. <strong>Responsable</strong></div>
                  <div>7. <strong>Acciones</strong> (Ver + Crear contrato)</div>
                </div>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-amber-900 mb-2">Acciones por cliente</div>
                <ul className="text-sm text-amber-700 space-y-1 pl-4">
                  <li>• <strong>Ver ficha (Eye):</strong> Navega a `/saas/clients/:id`</li>
                  <li>• <strong>Crear contrato (FileText):</strong> Abre modal con selector plantilla</li>
                </ul>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-amber-900 mb-2">Búsqueda funcional</div>
                <div className="text-sm text-amber-700">
                  Filtra por nombre, DNI, email o teléfono
                </div>
              </div>
            </div>
          </div>

          {/* Ficha Cliente */}
          <div className="mb-8 p-6 bg-gradient-to-br from-indigo-50 to-violet-50 border-2 border-indigo-200 rounded-xl">
            <h3 className="text-xl font-bold text-indigo-900 mb-4">📇 Ficha Detalle Cliente (4 tabs)</h3>
            <div className="space-y-4">
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-indigo-900 mb-2">Header degradado azul-cian</div>
                <ul className="text-sm text-indigo-700 space-y-1 pl-4">
                  <li>• Nombre (3xl, bold)</li>
                  <li>• Email, Teléfono, Ciudad con iconos</li>
                  <li>• Botón "Crear contrato" blanco destacado</li>
                </ul>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-indigo-900 mb-2">Tab 1: Información</div>
                <ul className="text-sm text-indigo-700 space-y-1 pl-4">
                  <li>• <strong>Card Datos personales:</strong> Grid 2 cols con todos los campos + icono Edit2</li>
                  <li>• <strong>Card Consentimientos (3):</strong>
                    <ul className="pl-4 mt-1">
                      <li>- Tratamiento de datos (CheckCircle verde / XCircle rojo)</li>
                      <li>- Comunicaciones comerciales</li>
                      <li>- Cesión a terceros</li>
                      <li>- Badge "Aceptado" verde / "Rechazado" rojo</li>
                    </ul>
                  </li>
                  <li>• <strong>Card Notas:</strong> Texto libre</li>
                  <li>• <strong>Card Metadata:</strong> Responsable + Cliente desde</li>
                </ul>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-indigo-900 mb-2">Tab 2: Interacciones (Timeline)</div>
                <ul className="text-sm text-indigo-700 space-y-1 pl-4">
                  <li>• Botón "+ Añadir nota" arriba</li>
                  <li>• Timeline vertical con iconos circulares coloreados:
                    <ul className="pl-4 mt-1">
                      <li>- <strong>call:</strong> verde (Phone)</li>
                      <li>- <strong>email:</strong> azul (Mail)</li>
                      <li>- <strong>meeting:</strong> morado (Calendar)</li>
                      <li>- <strong>note:</strong> ámbar (MessageSquare)</li>
                    </ul>
                  </li>
                  <li>• Cada evento: Título (bold) + Descripción + Usuario + Fecha/hora</li>
                  <li>• Counter en tab badge</li>
                </ul>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-indigo-900 mb-2">Tab 3: Vehículos</div>
                <ul className="text-sm text-indigo-700 space-y-1 pl-4">
                  <li>• <strong>Comprados:</strong> Cards verdes con icono TrendingUp + botón docs</li>
                  <li>• <strong>Vendidos:</strong> Cards azules con icono Car + botón docs</li>
                  <li>• Empty state si no hay vehículos vinculados</li>
                  <li>• Counter en tab badge</li>
                </ul>
              </div>

              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-indigo-900 mb-2">Tab 4: Documentos (Tabla)</div>
                <ul className="text-sm text-indigo-700 space-y-1 pl-4">
                  <li>• Columnas: Documento | Fecha | Estado | Acciones</li>
                  <li>• Badge verde "Firmado" / "Pagado"</li>
                  <li>• Icono FileText para ver documento</li>
                  <li>• Counter en tab badge</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Modales */}
          <div className="mb-8 p-6 bg-gradient-to-br from-rose-50 to-pink-50 border-2 border-rose-200 rounded-xl">
            <h3 className="text-xl font-bold text-rose-900 mb-4">🎯 3 Modales Funcionales</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-rose-900 mb-2">1️⃣ Nuevo Lead</div>
                <ul className="text-sm text-rose-700 space-y-1">
                  <li>• Sección contacto (azul)</li>
                  <li>• Sección vehículo (verde)</li>
                  <li>• Selector + input manual</li>
                  <li>• Presupuesto</li>
                  <li>• Origen (dropdown)</li>
                  <li>• Notas (textarea)</li>
                </ul>
              </div>
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-rose-900 mb-2">2️⃣ Convertir a Cliente</div>
                <ul className="text-sm text-rose-700 space-y-1">
                  <li>• Preview datos lead (azul)</li>
                  <li>• Flecha verde (ArrowRight)</li>
                  <li>• Campos adicionales:
                    <ul className="pl-3 mt-1">
                      <li>- DNI * (mono, bold)</li>
                      <li>- Dirección completa</li>
                      <li>- Notas</li>
                    </ul>
                  </li>
                  <li>• Consentimientos RGPD (3):
                    <ul className="pl-3 mt-1">
                      <li>- Datos * (obligatorio)</li>
                      <li>- Comerciales</li>
                      <li>- Terceros</li>
                    </ul>
                  </li>
                  <li>• Validación DNI requerido</li>
                </ul>
              </div>
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-rose-900 mb-2">3️⃣ Crear Contrato</div>
                <ul className="text-sm text-rose-700 space-y-1">
                  <li>• Preview cliente (azul)</li>
                  <li>• Paso 1: Tipo contrato
                    <ul className="pl-3 mt-1">
                      <li>- Venta 📤</li>
                      <li>- Reserva 🔖</li>
                      <li>- Compra 📥</li>
                    </ul>
                  </li>
                  <li>• Paso 2: Vehículo</li>
                  <li>• Paso 3: Precio + pago</li>
                  <li>• <strong>Preview verde:</strong>
                    <ul className="pl-3 mt-1">
                      <li>- Auto-relleno checks</li>
                      <li>- Checklist faltantes</li>
                      <li>- Validación completa</li>
                    </ul>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Features UI */}
          <div className="mb-8 p-6 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">✨ Características UI Destacadas</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="text-2xl font-bold text-blue-600 mb-1">Pills</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Filtros con counters</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="text-2xl font-bold text-green-600 mb-1">Drawer</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Detalle rápido slide-in</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="text-2xl font-bold text-purple-600 mb-1">Timeline</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Interacciones con iconos</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="text-2xl font-bold text-amber-600 mb-1">Badges</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Estados semánticos</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="text-2xl font-bold text-red-600 mb-1">RGPD</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Consentimientos completos</div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="text-2xl font-bold text-cyan-600 mb-1">Preview</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Auto-relleno contratos</div>
              </div>
            </div>
          </div>

          {/* Componentes */}
          <div className="p-6 bg-gradient-to-br from-gray-50 to-slate-50 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">📦 Componentes Actualizados/Creados</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                'ClientsPage (reescrita completa)',
                'ClientDetail (4 tabs)',
                'SAAS__LeadDrawer (actualizado)',
                'SAAS__NewLeadModal (actualizado)',
                'SAAS__ConvertToClientModal (actualizado)',
                'SAAS__CreateContractModal (actualizado)',
              ].map((comp) => (
                <div key={comp} className="p-3 bg-white dark:bg-gray-800 rounded-lg text-sm font-mono text-gray-900 dark:text-gray-100">
                  {comp}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-8 py-6 bg-gray-50 dark:bg-gray-800 rounded-b-2xl">
          <p className="text-center text-gray-700 dark:text-gray-300 mb-4">
            El módulo de Clientes/CRM está <span className="font-bold text-blue-600">100% funcional</span> con sistema
            completo de leads con pills, drawer detalle rápido, conversión a clientes, fichas con tabs, timeline de
            interacciones, consentimientos RGPD y generación de contratos con auto-relleno y validación.
          </p>
          <button
            onClick={onComplete}
            className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-lg font-bold rounded-xl transition-all shadow-lg hover:shadow-xl"
          >
            ✅ Bloque 8 listo. OK para continuar
          </button>
        </div>
      </div>
    </div>
  );
}
