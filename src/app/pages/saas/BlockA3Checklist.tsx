import { useState } from 'react';
import { Layout } from '../../components/saas/Layout';
import { CheckCircle, Circle, ExternalLink, Upload, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  path?: string;
  checked: boolean;
}

export function BlockA3Checklist() {
  const [items, setItems] = useState<ChecklistItem[]>([
    {
      id: '1',
      label: 'Wizard de 3 pasos implementado',
      description: 'Paso 1: Subir archivo CSV/Excel | Paso 2: Mapear columnas | Paso 3: Revisar y confirmar',
      checked: true,
    },
    {
      id: '2',
      label: 'Soporte CSV y Excel',
      description: 'Parseo con papaparse (CSV) y xlsx (Excel .xlsx/.xls)',
      checked: true,
    },
    {
      id: '3',
      label: 'Auto-mapeo inteligente de columnas',
      description: 'Detecta automáticamente nombres comunes de columnas en español e inglés',
      checked: true,
    },
    {
      id: '4',
      label: 'Validación de datos por fila',
      description: 'Valida campos requeridos, formatos de año, precios y estados',
      checked: true,
    },
    {
      id: '5',
      label: 'Reporte de errores detallado',
      description: 'Muestra errores por fila con campo específico y valor problemático',
      checked: true,
    },
    {
      id: '6',
      label: 'Vista previa de datos',
      description: 'Tabla con primeras 5 filas y resumen de filas válidas/errores',
      checked: true,
    },
    {
      id: '7',
      label: 'Importación real a BD',
      description: 'Crea vehículos usando addVehicle() del AppContext (sin mocks)',
      path: '/saas/vehicles',
      checked: true,
    },
    {
      id: '8',
      label: 'Manejo de errores con reintentos',
      description: 'Botón "Volver" en cada paso y "Reiniciar" para empezar desde cero',
      checked: true,
    },
    {
      id: '9',
      label: 'Plantilla descargable',
      description: 'Genera archivo Excel de ejemplo con formato correcto',
      checked: true,
    },
    {
      id: '10',
      label: 'Botón de importar en Vehículos',
      description: 'Dropdown con "📥 Importar vehículos" en página de Vehículos',
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

  const features = [
    {
      title: 'Paso 1: Subir archivo',
      items: [
        'Drag & drop o selección de archivo',
        'Soporte .csv, .xlsx, .xls',
        'Contador de filas detectadas',
        'Botón descargar plantilla',
      ],
    },
    {
      title: 'Paso 2: Mapear columnas',
      items: [
        'Lista de columnas del archivo con ejemplos',
        'Selects para mapear a campos del sistema',
        'Auto-detección de nombres comunes',
        'Validación de campos obligatorios (*)',
      ],
    },
    {
      title: 'Paso 3: Revisar y confirmar',
      items: [
        'Resumen: Total / Válidas / Con errores',
        'Lista detallada de errores por fila',
        'Vista previa tabla (5 primeras filas)',
        'Importación solo de filas válidas',
      ],
    },
  ];

  const validations = [
    { field: 'Matrícula*', rule: 'No vacío', example: '1234ABC' },
    { field: 'Marca*', rule: 'No vacío', example: 'Toyota' },
    { field: 'Modelo*', rule: 'No vacío', example: 'Corolla' },
    { field: 'Año*', rule: 'Número entre 1900 y año actual+1', example: '2020' },
    { field: 'Color*', rule: 'No vacío', example: 'Blanco' },
    { field: 'Precio Compra*', rule: 'Número > 0', example: '15000' },
    { field: 'Precio Venta', rule: 'Número > 0 (opcional)', example: '18000' },
    { field: 'Estado', rule: 'available | reserved | sold (opcional)', example: 'available' },
    { field: 'Ubicación', rule: 'Texto (opcional)', example: 'Parcela A' },
  ];

  return (
    <Layout title="Checklist Bloque A3" subtitle="Importador de vehículos CSV/Excel">
      <div className="space-y-6">
        {/* Progress Card */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-8 text-white">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold mb-2">BLOQUE A3 - Completado</h2>
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

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href="/saas/vehicles"
            className="p-6 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 rounded-xl transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <Upload className="w-8 h-8 text-blue-600" />
              <ExternalLink className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-blue-600 transition-colors" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Probar importador</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Ve a Vehículos → Añadir vehículo → Importar vehículos
            </p>
          </a>

          <button
            onClick={() => {
              const template = [
                {
                  'Matrícula': '1234ABC',
                  'Marca': 'Toyota',
                  'Modelo': 'Corolla',
                  'Año': '2020',
                  'Color': 'Blanco',
                  'Precio Compra': '15000',
                  'Precio Venta': '18000',
                  'Estado': 'available',
                  'Ubicación': 'Parcela A',
                },
                {
                  'Matrícula': '5678DEF',
                  'Marca': 'Honda',
                  'Modelo': 'Civic',
                  'Año': '2019',
                  'Color': 'Negro',
                  'Precio Compra': '14000',
                  'Precio Venta': '16500',
                  'Estado': 'available',
                  'Ubicación': 'Parcela B',
                },
              ];
              
              // Download Excel
              const worksheet = XLSX.utils.json_to_sheet(template);
              const workbook = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(workbook, worksheet, 'Vehículos');
              XLSX.writeFile(workbook, 'plantilla_vehiculos.xlsx');
            }}
            className="p-6 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-green-500 rounded-xl transition-all text-left"
          >
            <div className="flex items-center justify-between mb-3">
              <FileSpreadsheet className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Descargar plantilla</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Obtén un archivo Excel de ejemplo con el formato correcto
            </p>
          </button>
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

        {/* Wizard Steps */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Pasos del wizard</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div key={index} className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                  <h4 className="font-bold text-blue-900">{feature.title}</h4>
                </div>
                <ul className="space-y-2">
                  {feature.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-blue-800">
                      <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Validations Table */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Validaciones implementadas</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Campo</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Regla de validación</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Ejemplo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {validations.map((validation, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3">
                      <span className={`font-mono text-sm ${validation.field.includes('*') ? 'font-bold text-blue-900' : 'text-gray-700 dark:text-gray-300'}`}>
                        {validation.field}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{validation.rule}</td>
                    <td className="px-4 py-3">
                      <code className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs">
                        {validation.example}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Technical Details */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Detalles técnicos</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-purple-50 border-l-4 border-purple-600 rounded-lg">
              <h4 className="font-bold text-purple-900 mb-2">📦 Librerías</h4>
              <ul className="text-sm text-purple-800 space-y-1">
                <li>• <strong>papaparse</strong> - Parseo CSV</li>
                <li>• <strong>xlsx</strong> - Parseo Excel (.xlsx, .xls)</li>
                <li>• <strong>@types/papaparse</strong> - TypeScript definitions</li>
              </ul>
            </div>

            <div className="p-4 bg-green-50 border-l-4 border-green-600 rounded-lg">
              <h4 className="font-bold text-green-900 mb-2">✅ Sin datos mock</h4>
              <p className="text-sm text-green-800">
                Los vehículos se crean usando <code className="bg-green-200 px-1 rounded">addVehicle()</code> del AppContext.
                Se integran inmediatamente en el catálogo real.
              </p>
            </div>

            <div className="p-4 bg-amber-50 border-l-4 border-amber-600 rounded-lg">
              <h4 className="font-bold text-amber-900 mb-2">⚠️ Manejo de errores</h4>
              <p className="text-sm text-amber-800">
                Las filas con errores se muestran en rojo en la vista previa y se omiten en la importación.
                El usuario puede volver al paso anterior para corregir.
              </p>
            </div>

            <div className="p-4 bg-blue-50 border-l-4 border-blue-600 rounded-lg">
              <h4 className="font-bold text-blue-900 mb-2">🧠 Auto-mapeo</h4>
              <p className="text-sm text-blue-800">
                Detecta automáticamente nombres de columnas en español e inglés:
                "Matrícula", "Plate", "Marca", "Brand", etc.
              </p>
            </div>
          </div>
        </div>

        {/* Testing Instructions */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Instrucciones de prueba</h3>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border-l-4 border-blue-600 rounded-lg">
              <h4 className="font-bold text-blue-900 mb-2">1. Descargar plantilla</h4>
              <p className="text-sm text-blue-800 mb-2">
                Ve a /saas/vehicles → Añadir vehículo → Importar vehículos → Descargar plantilla
              </p>
              <p className="text-xs text-blue-700">
                O usa el botón "Descargar plantilla" en esta página.
              </p>
            </div>

            <div className="p-4 bg-green-50 border-l-4 border-green-600 rounded-lg">
              <h4 className="font-bold text-green-900 mb-2">2. Llenar plantilla con datos reales</h4>
              <p className="text-sm text-green-800">
                Añade varias filas de vehículos con datos variados. Prueba con 5-10 registros.
              </p>
            </div>

            <div className="p-4 bg-amber-50 border-l-4 border-amber-600 rounded-lg">
              <h4 className="font-bold text-amber-900 mb-2">3. Probar errores</h4>
              <p className="text-sm text-amber-800 mb-2">
                Añade una fila con datos incorrectos para validar el manejo de errores:
              </p>
              <ul className="text-xs text-amber-700 space-y-1 ml-4">
                <li>• Año: "ABC" (debe ser número)</li>
                <li>• Precio: "-500" (debe ser &gt; 0)</li>
                <li>• Estado: "xyz" (debe ser available/reserved/sold)</li>
              </ul>
            </div>

            <div className="p-4 bg-purple-50 border-l-4 border-purple-600 rounded-lg">
              <h4 className="font-bold text-purple-900 mb-2">4. Importar y verificar</h4>
              <p className="text-sm text-purple-800">
                Completa el wizard, confirma la importación y verifica que los vehículos aparezcan
                en el catálogo de /saas/vehicles.
              </p>
            </div>
          </div>
        </div>

        {/* Success Criteria */}
        <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-500 rounded-xl">
          <h3 className="text-2xl font-bold text-green-900 mb-4">✅ Criterios de aceptación cumplidos</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-900">
                <strong>Wizard 3 pasos:</strong> Subir → Mapear → Confirmar
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-900">
                <strong>Soporte CSV y Excel</strong> con papaparse y xlsx
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-900">
                <strong>Creación real en BD</strong> usando AppContext.addVehicle()
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-900">
                <strong>Errores por fila</strong> con campo y valor problemático
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-900">
                <strong>Reintentos</strong> con botones Volver y Reiniciar
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-green-900">
                <strong>Sin hardcodeo</strong> - Todo conectado al AppContext real
              </span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}