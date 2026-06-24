import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Building2, Layers, Minus, Plus, Store, Users, Info } from 'lucide-react';
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
    <div className="flex items-stretch rounded-xl border-2 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40 overflow-hidden focus-within:border-blue-500 transition-colors">
      <button
        type="button"
        aria-label="Disminuir"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="px-3.5 py-3 shrink-0 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none transition-colors border-r border-gray-200 dark:border-gray-600"
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
        className="flex-1 min-w-0 px-2 py-3 border-0 bg-transparent text-center font-semibold text-lg focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        required
      />
      <button
        type="button"
        aria-label="Aumentar"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="px-3.5 py-3 shrink-0 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none transition-colors border-l border-gray-200 dark:border-gray-600"
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
    businessCount: data.businessMetrics.businessCount ?? 1,
    commercialBrandCount: data.businessMetrics.commercialBrandCount ?? 0,
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
        stepLabel="Paso 3 · Estructura"
        title="Infraestructura de tu empresa"
        subtitle="Cuéntanos el tamaño real de tu operación para activar el plan correcto desde el primer día"
      />

      <form
        id="structure-form"
        onSubmit={handleContinue}
        className="flex-1 min-h-0 flex flex-col gap-4"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          Estos datos definen cuántas empresas, puntos de venta, trabajadores y líneas comerciales incluye tu
          suscripción. Así evitas bloqueos al crear tiendas o marcas después de pagar.
        </p>

        <div className="bg-white dark:bg-gray-800 border-2 border-amber-300 dark:border-amber-700 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-start gap-3 border-b border-amber-100 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/40 sm:px-5 sm:py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
              <Info className="h-4 w-4" />
            </div>
            <div className="min-w-0 pt-0.5">
              <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">
                Tu operativa en números
              </h3>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400 leading-snug">
                La marca principal «General» siempre está incluida. Las líneas extra son, por ejemplo, Pizzería o
                Burger.
              </p>
            </div>
          </div>

          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:gap-5 sm:p-5">
            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/30">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                <Building2 className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>Empresas *</span>
              </label>
              <NumberStepper
                id="structure-business-count"
                min={1}
                max={10}
                value={formData.businessCount}
                onChange={(n) => setFormData({ ...formData, businessCount: n })}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-snug">
                CIF o razones sociales distintas bajo tu cuenta.
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/30">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                <Store className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>Puntos de venta (PDV) *</span>
              </label>
              <NumberStepper
                id="structure-pdv-count"
                min={1}
                max={10}
                value={formData.locationCount}
                onChange={(n) => setFormData({ ...formData, locationCount: n })}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-snug">
                Tiendas, locales o cajas que operarán en Vertial.
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/30">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                <Users className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>Trabajadores en total *</span>
              </label>
              <NumberStepper
                id="structure-user-count"
                min={1}
                max={50}
                value={formData.userCount}
                onChange={(n) => setFormData({ ...formData, userCount: n })}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-snug">
                Admin, caja, cocina, reparto…
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/30">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                <Layers className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>Líneas comerciales extra</span>
              </label>
              <NumberStepper
                id="structure-brand-count"
                min={0}
                max={10}
                value={formData.commercialBrandCount}
                onChange={(n) => setFormData({ ...formData, commercialBrandCount: n })}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-snug">
                Además de «General». Pon 0 si solo tienes una línea de negocio.
              </p>
            </div>
          </div>
        </div>

        {formData.commercialBrandCount > 0 || formData.locationCount > 1 || formData.businessCount > 1 ? (
          <p className="text-xs text-violet-800 dark:text-violet-200 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 rounded-lg px-3 py-2 leading-snug">
            Con varias empresas, varios PDV o líneas comerciales extra te recomendaremos el plan PRO en el siguiente
            paso de precio.
          </p>
        ) : (
          <p className="text-xs text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 leading-snug">
            En el siguiente paso elegirás módulos y verás el plan y precio según esta infraestructura.
          </p>
        )}
      </form>
    </OnboardingStepShell>
  );
}
