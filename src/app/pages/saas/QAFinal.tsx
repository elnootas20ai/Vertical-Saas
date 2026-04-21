import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import {
  CheckCircle, Circle, Play, Home, Briefcase, Car, FileText,
  TrendingUp, Users, CreditCard, Phone, Database, Settings,
  MapPin, DollarSign, ArrowRight
} from 'lucide-react';

interface ChecklistItem {
  id: string;
  category: string;
  items: Array<{
    id: string;
    label: string;
    path: string;
    checked: boolean;
  }>;
}

export function QAFinal() {
  const navigate = useNavigate();
  const [isRunningTour, setIsRunningTour] = useState(false);
  const [currentTourStep, setCurrentTourStep] = useState(0);

  const [checklist, setChecklist] = useState<ChecklistItem[]>([
    {
      id: 'landing',
      category: 'WEB - Landing & Marketing',
      items: [
        { id: '1', label: 'Landing page principal', path: '/', checked: false },
        { id: '2', label: 'Acceso y login', path: '/auth/entry', checked: false },
        { id: '3', label: 'Registro', path: '/auth/register', checked: false },
        { id: '4', label: 'Onboarding completo', path: '/auth/onboarding/business-type', checked: false },
      ],
    },
    {
      id: 'navigation',
      category: 'NAVEGACIÓN SAAS',
      items: [
        { id: '5', label: 'Dashboard principal', path: '/saas/dashboard', checked: false },
        { id: '6', label: 'Sidebar navegación', path: '/saas/dashboard', checked: false },
        { id: '7', label: 'Topbar y perfil', path: '/saas/dashboard', checked: false },
      ],
    },
    {
      id: 'operations',
      category: 'OPERACIONES',
      items: [
        { id: '8', label: 'Lista de operaciones', path: '/saas/operations', checked: false },
        { id: '9', label: 'Detalle de operación', path: '/saas/operations/op-1', checked: false },
        { id: '10', label: 'Crear operación', path: '/saas/operations', checked: false },
      ],
    },
    {
      id: 'vehicles',
      category: 'VEHÍCULOS',
      items: [
        { id: '11', label: 'Stock de vehículos', path: '/saas/vehicles', checked: false },
        { id: '12', label: 'Ficha de vehículo', path: '/saas/vehicles/v-1', checked: false },
        { id: '13', label: 'Añadir vehículo', path: '/saas/vehicles', checked: false },
        { id: '14', label: 'Filtros y búsqueda', path: '/saas/vehicles', checked: false },
      ],
    },
    {
      id: 'locations',
      category: 'UBICACIONES',
      items: [
        { id: '15', label: 'Mapa de ubicaciones', path: '/saas/locations', checked: false },
        { id: '16', label: 'Detalle de zona', path: '/saas/locations/z-1', checked: false },
        { id: '17', label: 'Gestión de zonas', path: '/saas/locations', checked: false },
      ],
    },
    {
      id: 'clients',
      category: 'CLIENTES / CRM',
      items: [
        { id: '18', label: 'Leads', path: '/saas/clients', checked: false },
        { id: '19', label: 'Clientes', path: '/saas/clients', checked: false },
        { id: '20', label: 'Ficha de cliente', path: '/saas/clients/c-1', checked: false },
        { id: '21', label: 'Pills de filtro', path: '/saas/clients', checked: false },
      ],
    },
    {
      id: 'documents',
      category: 'DOCUMENTOS',
      items: [
        { id: '22', label: 'Repositorio (5 tabs)', path: '/saas/documents', checked: false },
        { id: '23', label: 'Detalle documento', path: '/saas/documents/doc-1', checked: false },
        { id: '24', label: 'Generar desde plantilla', path: '/saas/documents', checked: false },
        { id: '25', label: 'Firmar documento', path: '/saas/documents', checked: false },
        { id: '26', label: 'Enviar a gestoría', path: '/saas/documents', checked: false },
      ],
    },
    {
      id: 'sales',
      category: 'VENTAS',
      items: [
        { id: '27', label: 'Pipeline de ventas', path: '/saas/sales', checked: false },
        { id: '28', label: 'Crear venta', path: '/saas/sales', checked: false },
        { id: '29', label: 'Generar documentos', path: '/saas/sales', checked: false },
      ],
    },
    {
      id: 'finance',
      category: 'FINANZAS',
      items: [
        { id: '30', label: 'Visión general', path: '/saas/finance', checked: false },
        { id: '31', label: 'Cobros y pagos', path: '/saas/finance', checked: false },
      ],
    },
    {
      id: 'calls',
      category: 'LLAMADAS',
      items: [
        { id: '32', label: 'Lista de llamadas', path: '/saas/calls', checked: false },
        { id: '33', label: 'Detalle con IA', path: '/saas/calls/call-1', checked: false },
        { id: '34', label: 'Transcripción', path: '/saas/calls/call-1', checked: false },
        { id: '35', label: 'Tareas generadas', path: '/saas/calls/call-1', checked: false },
      ],
    },
    {
      id: 'ancove',
      category: 'ANCOVE',
      items: [
        { id: '36', label: 'Panel de integración', path: '/saas/ancove', checked: false },
        { id: '37', label: 'Sincronización', path: '/saas/ancove', checked: false },
        { id: '38', label: 'Historial de log', path: '/saas/ancove', checked: false },
      ],
    },
    {
      id: 'settings',
      category: 'CONFIGURACIÓN',
      items: [
        { id: '39', label: 'Ajustes generales', path: '/saas/settings', checked: false },
        { id: '40', label: 'Equipo', path: '/saas/team', checked: false },
        { id: '41', label: 'Billing y suscripción', path: '/saas/billing', checked: false },
      ],
    },
  ]);

  const tourSteps = [
    { label: 'Dashboard', path: '/saas/dashboard', icon: Home, description: 'Vista general y KPIs' },
    { label: 'Operaciones', path: '/saas/operations', icon: Briefcase, description: 'Gestión de compras' },
    { label: 'Vehículos', path: '/saas/vehicles', icon: Car, description: 'Stock completo' },
    { label: 'Ficha vehículo', path: '/saas/vehicles/v-1', icon: Car, description: 'Detalle completo' },
    { label: 'Documentos', path: '/saas/documents', icon: FileText, description: 'Repositorio documental' },
    { label: 'Ventas', path: '/saas/sales', icon: TrendingUp, description: 'Pipeline de ventas' },
    { label: 'Clientes', path: '/saas/clients', icon: Users, description: 'CRM completo' },
    { label: 'Billing', path: '/saas/billing', icon: CreditCard, description: 'Suscripción activa' },
  ];

  const toggleItem = (categoryId: string, itemId: string) => {
    setChecklist(prev =>
      prev.map(category =>
        category.id === categoryId
          ? {
              ...category,
              items: category.items.map(item =>
                item.id === itemId ? { ...item, checked: !item.checked } : item
              ),
            }
          : category
      )
    );
  };

  const navigateToPath = (path: string) => {
    navigate(path);
  };

  const startTour = () => {
    setIsRunningTour(true);
    setCurrentTourStep(0);
    navigate(tourSteps[0].path);
  };

  const nextTourStep = () => {
    if (currentTourStep < tourSteps.length - 1) {
      const nextStep = currentTourStep + 1;
      setCurrentTourStep(nextStep);
      navigate(tourSteps[nextStep].path);
    } else {
      setIsRunningTour(false);
      setCurrentTourStep(0);
    }
  };

  const totalItems = checklist.reduce((sum, cat) => sum + cat.items.length, 0);
  const checkedItems = checklist.reduce(
    (sum, cat) => sum + cat.items.filter(item => item.checked).length,
    0
  );
  const progress = Math.round((checkedItems / totalItems) * 100);

  return (
    <Layout title="QA Final - Verificación completa" subtitle="Checklist de navegación 100% funcional">
      <div className="space-y-6">
        {/* Progress Card */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-8 text-white">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold mb-2">Progreso de verificación</h2>
              <div className="text-green-100">
                {checkedItems} de {totalItems} elementos verificados
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

        {/* Tour Demo Button */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Tour Demo Automático</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Recorre automáticamente las pantallas principales de la aplicación
              </p>
            </div>
            <button
              onClick={startTour}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
            >
              <Play className="w-5 h-5" />
              Iniciar tour
            </button>
          </div>

          {isRunningTour && (
            <div className="mt-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-bold text-blue-900 mb-1">
                    Paso {currentTourStep + 1} de {tourSteps.length}
                  </div>
                  <div className="text-blue-700">{tourSteps[currentTourStep].label}</div>
                  <div className="text-sm text-blue-600">{tourSteps[currentTourStep].description}</div>
                </div>
                <button
                  onClick={nextTourStep}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  {currentTourStep < tourSteps.length - 1 ? (
                    <>
                      Siguiente <ArrowRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      Finalizar <CheckCircle className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300"
                  style={{ width: `${((currentTourStep + 1) / tourSteps.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Checklist */}
        <div className="space-y-4">
          {checklist.map((category) => {
            const categoryChecked = category.items.filter(item => item.checked).length;
            const categoryTotal = category.items.length;
            const categoryProgress = Math.round((categoryChecked / categoryTotal) * 100);

            return (
              <div key={category.id} className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{category.category}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {categoryChecked}/{categoryTotal}
                    </span>
                    <div className="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          categoryProgress === 100 ? 'bg-green-600' : 'bg-blue-600'
                        }`}
                        style={{ width: `${categoryProgress}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {category.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                    >
                      <label className="flex items-center gap-3 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => toggleItem(category.id, item.id)}
                          className="w-5 h-5 border-2 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <span className={`${item.checked ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                          {item.label}
                        </span>
                      </label>
                      <button
                        onClick={() => navigateToPath(item.path)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors opacity-0 group-hover:opacity-100"
                      >
                        Ir →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Completion Message */}
        {progress === 100 && (
          <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-500 rounded-xl text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-2xl font-bold text-green-900 mb-2">
              ¡Verificación completa!
            </h3>
            <p className="text-green-800 mb-4">
              Todos los elementos han sido verificados correctamente.
              El MVP está 100% funcional y navegable.
            </p>
            <div className="text-sm text-green-700">
              ✅ 0 botones rotos • ✅ Navegación completa • ✅ Todas las funcionalidades operativas
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
