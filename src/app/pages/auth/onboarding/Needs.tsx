import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Car, TrendingUp, Users, FileText, BarChart3, Wrench } from 'lucide-react';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import { ACCESO__Stepper } from '../../../components/design-system/ACCESO__Stepper';
import { ACCESO__SelectableCard } from '../../../components/design-system/ACCESO__SelectableCard';
import { useOnboarding, ONBOARDING_STEPS, ONBOARDING_ROUTES } from '../../../context/OnboardingContext';

const STEP_INDEX = 3;

export function Needs() {
  const navigate = useNavigate();
  const { data, updateData, advanceStep } = useOnboarding();

  useEffect(() => {
    if (data.completedStep < STEP_INDEX - 1) {
      navigate(ONBOARDING_ROUTES[data.completedStep + 1], { replace: true });
    }
  }, [data.completedStep, navigate]);
  const [needs, setNeeds] = useState({
    inventory: data.requestedModules.inventory,
    sales: data.requestedModules.sales,
    crm: data.requestedModules.crm,
    documentation: data.requestedModules.documentation,
    analytics: data.requestedModules.analytics,
    workshop: data.requestedModules.workshop,
  });

  const toggleNeed = (key: keyof typeof needs) => {
    setNeeds({ ...needs, [key]: !needs[key] });
  };

  const handleContinue = () => {
    updateData('requestedModules', needs);
    advanceStep(STEP_INDEX);
    navigate('/auth/onboarding/recommendation');
  };

  const handleBack = () => {
    navigate('/auth/onboarding/structure');
  };

  const needsOptions = [
    {
      key: 'inventory' as keyof typeof needs,
      icon: <Car className="w-6 h-6" />,
      title: 'Gestión de stock',
      description: 'Control de vehículos y ubicaciones',
    },
    {
      key: 'sales' as keyof typeof needs,
      icon: <TrendingUp className="w-6 h-6" />,
      title: 'Ventas y operaciones',
      description: 'Pipeline de compras y ventas',
    },
    {
      key: 'crm' as keyof typeof needs,
      icon: <Users className="w-6 h-6" />,
      title: 'CRM / Clientes',
      description: 'Gestión de leads y seguimiento',
    },
    {
      key: 'documentation' as keyof typeof needs,
      icon: <FileText className="w-6 h-6" />,
      title: 'Documentación',
      description: 'Contratos, facturas y gestoría',
    },
    {
      key: 'analytics' as keyof typeof needs,
      icon: <BarChart3 className="w-6 h-6" />,
      title: 'Métricas y KPIs',
      description: 'Dashboards y analíticas',
    },
    {
      key: 'workshop' as keyof typeof needs,
      icon: <Wrench className="w-6 h-6" />,
      title: 'Taller',
      description: 'Gestión de reparaciones',
    },
  ];

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-800 flex flex-col overflow-hidden">
      {/* Stepper sticky arriba */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 pt-6 pb-2 shrink-0">
        <div className="w-full max-w-3xl mx-auto">
          <ACCESO__Stepper
            steps={[...ONBOARDING_STEPS]}
            currentStep={STEP_INDEX}
            onStepClick={(i) => {
              if (i !== STEP_INDEX) navigate(ONBOARDING_ROUTES[i]);
            }}
          />
        </div>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="w-full max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              ¿Qué necesitas gestionar?
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Selecciona las áreas que quieres controlar (puedes elegir varias)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {needsOptions.map((option) => (
              <ACCESO__SelectableCard
                key={option.key}
                icon={option.icon}
                title={option.title}
                description={option.description}
                selected={needs[option.key]}
                onClick={() => toggleNeed(option.key)}
              />
            ))}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-900">
              💡 <strong>Consejo:</strong> Puedes activar o desactivar módulos en cualquier momento desde Configuración
            </p>
          </div>
        </div>
      </div>

      {/* Botones sticky abajo */}
      <div className="sticky bottom-0 z-20 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 shrink-0">
        <div className="w-full max-w-3xl mx-auto flex justify-between">
          <ACCESO__Button
            type="button"
            onClick={handleBack}
            variant="outline"
          >
            ← Atrás
          </ACCESO__Button>
          <ACCESO__Button
            type="button"
            onClick={handleContinue}
            variant="primary"
          >
            Ver recomendación →
          </ACCESO__Button>
        </div>
      </div>
    </div>
  );
}