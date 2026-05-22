import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Users, MapPin, Minus, Plus } from 'lucide-react';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import {
  OnboardingStepHeading,
  OnboardingStepShell,
} from '../../../components/auth/onboarding/OnboardingStepShell';
import { useOnboarding, ONBOARDING_ROUTES } from '../../../context/OnboardingContext';

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
        className="px-3 py-2 shrink-0 bg-gray-100 dark:bg-gray-700/80 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:pointer-events-none transition-colors border-r border-gray-200 dark:border-gray-600"
      >
        <Minus className="w-4 h-4 mx-auto" />
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
        className="flex-1 min-w-0 px-2 py-2 border-0 bg-transparent text-center font-medium text-base focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        required
      />
      <button
        type="button"
        aria-label="Aumentar"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="px-3 py-2 shrink-0 bg-gray-100 dark:bg-gray-700/80 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:pointer-events-none transition-colors border-l border-gray-200 dark:border-gray-600"
      >
        <Plus className="w-4 h-4 mx-auto" />
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

  return (
    <OnboardingStepShell
      stepIndex={STEP_INDEX}
      footer={
        <div className="flex justify-between gap-3">
          <ACCESO__Button type="button" onClick={() => navigate('/auth/onboarding/company')} variant="outline">
            ← Atrás
          </ACCESO__Button>
          <ACCESO__Button type="submit" form="structure-form" variant="primary">
            Continuar →
          </ACCESO__Button>
        </div>
      }
    >
      <OnboardingStepHeading
        title="Estructura de tu negocio"
        subtitle="Ayúdanos a conocer tu operación para recomendarte el mejor plan"
      />

      <form
        id="structure-form"
        onSubmit={handleContinue}
        className="flex-1 min-h-0 flex flex-col justify-center"
      >
        <div className="p-4 sm:p-5 bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-200 dark:border-amber-800 rounded-xl space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-amber-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
              !
            </div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">
              Información clave para tu plan
            </h3>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="flex items-start gap-2 text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                <Users className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Usuarios en Vertial *</span>
              </label>
              <NumberStepper
                min={1}
                max={50}
                value={formData.userCount}
                onChange={(n) => setFormData({ ...formData, userCount: n })}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Admin, comercial, taller…</p>
            </div>

            <div>
              <label className="flex items-start gap-2 text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Ubicaciones / locales *</span>
              </label>
              <NumberStepper
                min={1}
                max={10}
                value={formData.locationCount}
                onChange={(n) => setFormData({ ...formData, locationCount: n })}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Oficinas, tiendas, almacenes…</p>
            </div>
          </div>
        </div>
      </form>
    </OnboardingStepShell>
  );
}
