import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  BarChart3,
  Car,
  FileText,
  Monitor,
  Package,
  TrendingUp,
  Truck,
  Users,
  Wrench,
  ClipboardList,
  UserCog,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import { ACCESO__SelectableCard } from '../../../components/design-system/ACCESO__SelectableCard';
import {
  OnboardingStepHeading,
  OnboardingStepShell,
} from '../../../components/auth/onboarding/OnboardingStepShell';
import { useOnboarding, ONBOARDING_ROUTES } from '../../../context/OnboardingContext';
import {
  DELIVERY_NEED_OPTIONS,
  deliveryNeedsToModules,
  getNeedsOptionsForBusinessType,
  isDeliveryBusinessType,
  modulesToDeliveryNeeds,
  type DeliveryNeedKey,
  type DeliveryNeedsSelection,
  type RequestedModuleKey,
} from '../../../lib/onboardingPlanRecommendation';

const STEP_INDEX = 3;

const MODULE_ICONS: Record<RequestedModuleKey, LucideIcon> = {
  inventory: Package,
  sales: Monitor,
  crm: Users,
  documentation: FileText,
  analytics: BarChart3,
  workshop: Wrench,
};

const MODULE_ICONS_DEALERSHIP: Record<RequestedModuleKey, LucideIcon> = {
  inventory: Car,
  sales: TrendingUp,
  crm: Users,
  documentation: FileText,
  analytics: BarChart3,
  workshop: Wrench,
};

const DELIVERY_ICONS: Record<DeliveryNeedKey, LucideIcon> = {
  tpv: Monitor,
  catalogStock: Package,
  deliveryOrders: ClipboardList,
  autoShipping: Truck,
  clients: Users,
  team: UserCog,
  invoicing: FileText,
  reports: BarChart3,
};

export function Needs() {
  const navigate = useNavigate();
  const { data, updateData, advanceStep } = useOnboarding();
  const isDelivery = isDeliveryBusinessType(data.businessType);

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

  const [deliveryNeeds, setDeliveryNeeds] = useState<DeliveryNeedsSelection>(() =>
    data.deliveryNeeds ?? modulesToDeliveryNeeds(data.requestedModules),
  );

  const needsOptions = useMemo(
    () => getNeedsOptionsForBusinessType(data.businessType),
    [data.businessType],
  );

  const iconSet =
    data.businessType === 'carDealership' || data.businessType === 'workshop'
      ? MODULE_ICONS_DEALERSHIP
      : MODULE_ICONS;

  const toggleNeed = (key: RequestedModuleKey) => {
    setNeeds({ ...needs, [key]: !needs[key] });
  };

  const toggleDeliveryNeed = (key: DeliveryNeedKey) => {
    setDeliveryNeeds({ ...deliveryNeeds, [key]: !deliveryNeeds[key] });
  };

  const handleContinue = () => {
    if (isDelivery) {
      updateData('deliveryNeeds', deliveryNeeds);
      updateData('requestedModules', deliveryNeedsToModules(deliveryNeeds));
    } else {
      updateData('requestedModules', needs);
    }
    advanceStep(STEP_INDEX);
    navigate('/auth/onboarding/recommendation');
  };

  return (
    <OnboardingStepShell
      stepIndex={STEP_INDEX}
      footer={
        <div className="flex justify-between gap-3">
          <ACCESO__Button type="button" onClick={() => navigate('/auth/onboarding/structure')} variant="outline">
            ← Atrás
          </ACCESO__Button>
          <ACCESO__Button type="button" onClick={handleContinue} variant="primary">
            Ver precio recomendado →
          </ACCESO__Button>
        </div>
      }
    >
      <OnboardingStepHeading
        title={isDelivery ? '¿Qué quieres usar?' : '¿Qué vas a usar en Vertial?'}
        subtitle={
          isDelivery
            ? 'Marca lo que necesitas. Con esto calculamos el plan y el precio mensual recomendado.'
            : 'Indica tu operativa. Con esto calculamos el plan y el precio mensual recomendado.'
        }
      />

      <div className="flex-1 min-h-0 grid grid-cols-2 lg:grid-cols-4 gap-2 auto-rows-fr">
        {isDelivery
          ? DELIVERY_NEED_OPTIONS.map((option) => {
              const Icon = DELIVERY_ICONS[option.key];
              return (
                <ACCESO__SelectableCard
                  key={option.key}
                  compact
                  icon={<Icon className="w-5 h-5" />}
                  title={option.title}
                  description={option.description}
                  selected={deliveryNeeds[option.key]}
                  onClick={() => toggleDeliveryNeed(option.key)}
                />
              );
            })
          : needsOptions.map((option) => {
              const Icon = iconSet[option.key];
              return (
                <ACCESO__SelectableCard
                  key={option.key}
                  compact
                  icon={<Icon className="w-5 h-5" />}
                  title={option.title}
                  description={option.description}
                  selected={needs[option.key]}
                  onClick={() => toggleNeed(option.key)}
                />
              );
            })}
      </div>

      <p className="shrink-0 mt-2 text-xs text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 leading-snug">
        {isDelivery
          ? 'Puedes elegir varias. En el siguiente paso verás el precio según usuarios, locales y lo que marques aquí.'
          : 'En el siguiente paso verás el plan sugerido. Podrás cambiar módulos después en Configuración.'}
      </p>
    </OnboardingStepShell>
  );
}
