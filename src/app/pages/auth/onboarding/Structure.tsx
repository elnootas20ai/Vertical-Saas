import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Users, MapPin, Minus, Plus } from 'lucide-react';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import { ACCESO__Stepper } from '../../../components/design-system/ACCESO__Stepper';
import { useOnboarding, ONBOARDING_STEPS, ONBOARDING_ROUTES } from '../../../context/OnboardingContext';

const STEP_INDEX = 2;

function NumberStepper({
  value,
  onChange,
  min,
  max,
  id,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  id?: string;
}) {
  return (
    <div className="flex items-stretch rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden focus-within:border-blue-500 transition-colors">
      <button
        type="button"
        aria-label="Disminuir"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="px-3 py-3 shrink-0 bg-gray-100 dark:bg-gray-700/80 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:pointer-events-none transition-colors border-r border-gray-200 dark:border-gray-600"
      >
        <Minus className="w-5 h-5 mx-auto" />
      </button>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (Number.isNaN(n)) return;
          onChange(Math.min(max, Math.max(min, n)));
        }}
        className="flex-1 min-w-0 px-2 py-3 border-0 bg-transparent text-center font-medium text-lg focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        required
      />
      <button
        type="button"
        aria-label="Aumentar"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="px-3 py-3 shrink-0 bg-gray-100 dark:bg-gray-700/80 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:pointer-events-none transition-colors border-l border-gray-200 dark:border-gray-600"
      >
        <Plus className="w-5 h-5 mx-auto" />
      </button>
    </div>
  );
}

export function Structure() {
  const navigate = useNavigate();
  const { data, updateData, advanceStep } = useOnboarding();

  useEffect(() => {
    if (data.completedStep < STEP_INDEX - 1) {
      navigate(ONBOARDING_ROUTES[data.completedStep + 1], { replace: true });
    }
  }, [data.completedStep, navigate]);
  const [formData, setFormData] = useState({
    userCount: data.businessMetrics.userCount,
    locationCount: data.businessMetrics.locationCount,
    monthlyOperations: data.businessMetrics.monthlyOperations,
    activeItems: data.businessMetrics.activeItems,
    currentTools: data.businessMetrics.currentTools,
    otherToolsDetail: data.businessMetrics.otherToolsDetail,
    requiredIntegrations: data.businessMetrics.requiredIntegrations,
  });

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    updateData('businessMetrics', formData);
    advanceStep(STEP_INDEX);
    navigate('/auth/onboarding/needs');
  };

  const handleBack = () => {
    navigate('/auth/onboarding/company');
  };

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
              Estructura de tu negocio
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Ayúdanos a conocer tu operación para recomendarte el mejor plan
            </p>
          </div>

          <form id="structure-form" onSubmit={handleContinue} className="space-y-6">
            {/* Campos OBLIGATORIOS */}
            <div className="p-6 bg-amber-50 border-2 border-amber-200 rounded-2xl space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-amber-600 rounded-full flex items-center justify-center text-white text-xs font-bold">!</div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Información clave para tu plan</h3>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="flex items-start gap-2 text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                    <Users className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>¿Cuántos usuarios/trabajadores van a usar UDAR EDGE? *</span>
                  </label>
                  <NumberStepper
                    min={1}
                    max={50}
                    value={formData.userCount}
                    onChange={(n) => setFormData({ ...formData, userCount: n })}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Incluye administradores, comerciales, mecánicos, etc.</p>
                </div>

                <div>
                  <label className="flex items-start gap-2 text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>¿Cuántas ubicaciones/exposiciones tienes? *</span>
                  </label>
                  <NumberStepper
                    min={1}
                    max={10}
                    value={formData.locationCount}
                    onChange={(n) => setFormData({ ...formData, locationCount: n })}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Oficinas, establecimientos, almacenes, etc.</p>
                </div>
              </div>
            </div>

          </form>
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
            type="submit"
            form="structure-form"
            variant="primary"
          >
            Continuar →
          </ACCESO__Button>
        </div>
      </div>
    </div>
  );
}