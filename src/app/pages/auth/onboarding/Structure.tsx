import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Building2, Layers, Minus, Plus, Store, Users } from 'lucide-react';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import {
  OnboardingStepHeading,
  OnboardingStepShell,
} from '../../../components/auth/onboarding/OnboardingStepShell';
import { useOnboarding } from '../../../context/OnboardingContext';
import { useOnboardingStepGate } from '../../../hooks/useOnboardingStepGate';

const STEP_INDEX = 2;

function clampInt(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

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
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const commit = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) {
      onChange(min);
      setDraft(String(min));
      return;
    }
    const n = clampInt(parseInt(digits, 10), min, max);
    onChange(n);
    setDraft(String(n));
  };

  return (
    <div className="flex h-10 min-h-10 items-stretch overflow-hidden rounded-xl border-2 border-gray-200 bg-white transition-colors focus-within:border-blue-500 dark:border-gray-700 dark:bg-gray-900/40 sm:h-11 sm:min-h-11">
      <button
        type="button"
        aria-label="Disminuir"
        onClick={() => {
          const next = clampInt(value - 1, min, max);
          onChange(next);
          setDraft(String(next));
        }}
        disabled={value <= min}
        className="shrink-0 border-r border-gray-200 bg-gray-50 px-2.5 transition-colors hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 sm:px-3"
      >
        <Minus className="mx-auto h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={draft}
        onFocus={() => {
          setFocused(true);
          setDraft(String(value));
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d]/g, '');
          setDraft(raw);
          if (raw === '') return;
          const n = parseInt(raw, 10);
          if (!Number.isNaN(n)) onChange(clampInt(n, min, max));
        }}
        onBlur={() => {
          setFocused(false);
          commit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="min-w-0 flex-1 border-0 bg-transparent px-2 text-center text-base font-semibold focus:outline-none focus:ring-0 sm:text-lg"
        required
      />
      <button
        type="button"
        aria-label="Aumentar"
        onClick={() => {
          const next = clampInt(value + 1, min, max);
          onChange(next);
          setDraft(String(next));
        }}
        disabled={value >= max}
        className="shrink-0 border-l border-gray-200 bg-gray-50 px-2.5 transition-colors hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 sm:px-3"
      >
        <Plus className="mx-auto h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </button>
    </div>
  );
}

type MetricCardProps = {
  icon: ReactNode;
  label: string;
  hint: string;
  children: ReactNode;
};

function MetricCard({ icon, label, hint, children }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-800/80 sm:p-3">
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-900 dark:text-gray-100 sm:mb-2 sm:text-sm">
        <span className="shrink-0 text-amber-600 dark:text-amber-400">{icon}</span>
        <span className="min-w-0 truncate">{label}</span>
      </label>
      {children}
      <p className="mt-1 text-[10px] leading-snug text-gray-500 dark:text-gray-400 sm:mt-1.5 sm:text-[11px]">
        {hint}
      </p>
    </div>
  );
}

export function Structure() {
  const navigate = useNavigate();
  const { data, updateData, advanceStep } = useOnboarding();
  useOnboardingStepGate(STEP_INDEX);

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
        compact
        stepLabel="Paso 3 · Estructura"
        title="Infraestructura de tu empresa"
        subtitle="Empresas, trabajadores, PDV y marcas para dimensionar el plan. El TPV no se cuenta aparte."
      />

      <form id="structure-form" onSubmit={handleContinue} className="flex flex-col gap-2 pb-2 sm:gap-3">
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:gap-2.5">
          <MetricCard
            icon={<Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
            label="Empresas *"
            hint="CIF o razones sociales distintas."
          >
            <NumberStepper
              id="structure-business-count"
              min={1}
              max={10}
              value={formData.businessCount}
              onChange={(n) => setFormData({ ...formData, businessCount: n })}
            />
          </MetricCard>

          <MetricCard
            icon={<Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
            label="Trabajadores *"
            hint="Admin, caja, cocina, reparto…"
          >
            <NumberStepper
              id="structure-user-count"
              min={1}
              max={50}
              value={formData.userCount}
              onChange={(n) => setFormData({ ...formData, userCount: n })}
            />
          </MetricCard>

          <MetricCard
            icon={<Store className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
            label="Puntos de venta (PDV) *"
            hint="Locales o tiendas (no TPVs)."
          >
            <NumberStepper
              id="structure-pdv-count"
              min={1}
              max={10}
              value={formData.locationCount}
              onChange={(n) => setFormData({ ...formData, locationCount: n })}
            />
          </MetricCard>

          <MetricCard
            icon={<Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
            label="Marcas extra"
            hint="Además de «General». 0 si solo una."
          >
            <NumberStepper
              id="structure-brand-count"
              min={0}
              max={10}
              value={formData.commercialBrandCount}
              onChange={(n) => setFormData({ ...formData, commercialBrandCount: n })}
            />
          </MetricCard>
        </div>
      </form>
    </OnboardingStepShell>
  );
}
