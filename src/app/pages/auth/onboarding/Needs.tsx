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
import { useOnboarding } from '../../../context/OnboardingContext';
import { useOnboardingStepGate } from '../../../hooks/useOnboardingStepGate';
import {
  deliveryNeedsToModules,
  emptyRestaurantNeeds,
  getDeliveryNeedOptionsForBusinessType,
  getNeedsOptionsForBusinessType,
  modulesToDeliveryNeeds,
  usesDeliveryNeedsOnboarding,
  type DeliveryNeedKey,
  type DeliveryNeedsSelection,
  type RequestedModuleKey,
} from '../../../lib/onboardingPlanRecommendation';
import { isRestaurantBusinessType } from '../../../lib/deliveryOpsTypes';

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
  const isDeliveryOps = usesDeliveryNeedsOnboarding(data.businessType);
  useOnboardingStepGate(STEP_INDEX);

  const [needs, setNeeds] = useState({
    inventory: data.requestedModules.inventory,
    sales: data.requestedModules.sales,
    crm: data.requestedModules.crm,
    documentation: data.requestedModules.documentation,
    analytics: data.requestedModules.analytics,
    workshop: data.requestedModules.workshop,
  });

  const [deliveryNeeds, setDeliveryNeeds] = useState<DeliveryNeedsSelection>(() => {
    if (data.deliveryNeeds) return data.deliveryNeeds;
    if (isRestaurantBusinessType(data.businessType)) return emptyRestaurantNeeds(data.restaurantFormat);
    return modulesToDeliveryNeeds(data.requestedModules);
  });

  useEffect(() => {
    if (isRestaurantBusinessType(data.businessType) && !data.deliveryNeeds) {
      setDeliveryNeeds(emptyRestaurantNeeds(data.restaurantFormat));
    }
  }, [data.businessType, data.deliveryNeeds, data.restaurantFormat]);

  const needsOptions = useMemo(
    () => getNeedsOptionsForBusinessType(data.businessType),
    [data.businessType],
  );

  const deliveryNeedOptions = useMemo(
    () => getDeliveryNeedOptionsForBusinessType(data.businessType),
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
    if (isDeliveryOps) {
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
        stepLabel="Paso 4 · Operativa"
        title={isDeliveryOps ? '¿Qué quieres usar?' : '¿Qué vas a usar en Vertial?'}
        subtitle={
          isDeliveryOps
            ? isRestaurantBusinessType(data.businessType)
              ? 'Marca lo que necesitas en tu local. El reparto a domicilio es opcional.'
              : 'Marca lo que necesitas. Con esto calculamos el plan y el precio mensual recomendado.'
            : 'Indica tu operativa. Con esto calculamos el plan y el precio mensual recomendado.'
        }
      />

      <div className="flex-1 min-h-0 grid grid-cols-2 lg:grid-cols-4 gap-2 auto-rows-fr">
        {isDeliveryOps
          ? deliveryNeedOptions.map((option) => {
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
        {isDeliveryOps
          ? 'Puedes elegir varias. En el siguiente paso verás el precio según usuarios, locales y lo que marques aquí.'
          : 'En el siguiente paso verás el plan sugerido. Podrás cambiar módulos después en Configuración.'}
      </p>
    </OnboardingStepShell>
  );
}
