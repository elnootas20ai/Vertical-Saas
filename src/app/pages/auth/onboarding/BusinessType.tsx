import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  Car, Wrench, Truck, SprayCan, Dumbbell, Stethoscope,
  Hotel, HardHat, GraduationCap, Building2, Scale, Music,
  PartyPopper, Scissors, Container, Cog, CarTaxiFront,
  Pill, Droplets, PawPrint, Cigarette, Beef, UtensilsCrossed,
} from 'lucide-react';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import { ACCESO__SelectableCard } from '../../../components/design-system/ACCESO__SelectableCard';
import {
  OnboardingStepHeading,
  OnboardingStepShell,
} from '../../../components/auth/onboarding/OnboardingStepShell';
import { useOnboarding } from '../../../context/OnboardingContext';
import { isRestaurantBusinessType } from '../../../lib/deliveryOpsTypes';

const STEP_INDEX = 0;

const ENABLED_TYPES = new Set(['events', 'carDealership', 'workshop', 'delivery', 'restaurant', 'cleaning', 'hairSalon', 'tobaccoShop', 'scrapyard', 'gym', 'clinic', 'hotel', 'construction', 'academy', 'realEstate', 'lawyer', 'nightclub', 'spareParts', 'taxi', 'pharmacy', 'carWash', 'vet', 'butcherShop']);

const BUSINESS_TYPES = [
  { id: 'events',        icon: PartyPopper,   title: 'Eventos',              description: 'Eventos' },
  { id: 'carDealership', icon: Car,           title: 'Compraventa',          description: 'Coches' },
  { id: 'workshop',      icon: Wrench,        title: 'Taller',                description: 'Mecánico' },
  { id: 'delivery',      icon: Truck,           title: 'Delivery',              description: 'Reparto y pedidos a domicilio' },
  { id: 'restaurant',    icon: UtensilsCrossed, title: 'Bar/restaurante',     description: 'Sala, TPV, cocina y caja' },
  { id: 'cleaning',      icon: SprayCan,      title: 'Limpieza',             description: 'Limpieza' },
  { id: 'hairSalon',     icon: Scissors,      title: 'Peluquería',           description: 'Salón' },
  { id: 'gym',           icon: Dumbbell,      title: 'Gimnasio',             description: 'Fitness' },
  { id: 'clinic',        icon: Stethoscope,   title: 'Clínica',              description: 'Salud' },
  { id: 'hotel',         icon: Hotel,         title: 'Hotel',                description: 'Hotel' },
  { id: 'construction',  icon: HardHat,       title: 'Constructora',         description: 'Obras' },
  { id: 'academy',       icon: GraduationCap, title: 'Academia',             description: 'Formación' },
  { id: 'realEstate',    icon: Building2,     title: 'Inmobiliaria',         description: 'Inmuebles' },
  { id: 'lawyer',        icon: Scale,         title: 'Abogados',             description: 'Legal' },
  { id: 'nightclub',     icon: Music,         title: 'Discoteca',            description: 'Ocio' },
  { id: 'scrapyard',     icon: Container,     title: 'Desguace',             description: 'Desguace' },
  { id: 'spareParts',    icon: Cog,           title: 'Recambios',            description: 'Repuestos' },
  { id: 'taxi',          icon: CarTaxiFront,  title: 'Taxi',                 description: 'Flota' },
  { id: 'pharmacy',      icon: Pill,          title: 'Farmacia',             description: 'Farmacia' },
  { id: 'carWash',       icon: Droplets,      title: 'Lavadero',             description: 'Lavado' },
  { id: 'vet',           icon: PawPrint,      title: 'Veterinario',          description: 'Veterinaria' },
  { id: 'tobaccoShop',   icon: Cigarette,     title: 'Estanco',              description: 'Estanco' },
  { id: 'butcherShop',   icon: Beef,          title: 'Carnicería',           description: 'Carnicería' },
] as const;

export function BusinessType() {
  const navigate = useNavigate();
  const { data, updateData, advanceStep } = useOnboarding();
  const [selectedType, setSelectedType] = useState(data.businessType || 'events');

  useEffect(() => {
    setSelectedType(data.businessType || 'events');
  }, [data.businessType]);

  const handleContinue = () => {
    if (selectedType !== 'carDealership') {
      updateData('companyProfile', {
        ...data.companyProfile,
        isAncovePartner: false,
        ancoveMemberNumber: '',
      });
    }
    updateData('businessType', selectedType);
    if (selectedType === 'workshop') {
      updateData('requestedModules', { ...data.requestedModules, workshop: true });
    }
    if (isRestaurantBusinessType(selectedType)) {
      updateData('restaurantFormat', 'restaurant');
    } else {
      updateData('restaurantFormat', undefined);
    }
    advanceStep(STEP_INDEX);
    navigate('/auth/onboarding/company');
  };

  return (
    <OnboardingStepShell
      stepIndex={STEP_INDEX}
      maxWidth="max-w-6xl"
      footer={
        <div className="flex justify-end">
          <ACCESO__Button onClick={handleContinue} variant="primary" icon="next">
            Continuar
          </ACCESO__Button>
        </div>
      }
    >
      <OnboardingStepHeading
        stepLabel="Paso 1 · Tipo de negocio"
        title="¿Qué tipo de negocio tienes?"
        subtitle="Selecciona el sector que mejor describa tu actividad principal."
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-visible grid grid-cols-[repeat(auto-fill,minmax(min(100%,8.75rem),1fr))] gap-2 auto-rows-fr content-start">
        {BUSINESS_TYPES.map((bt) => {
          const Icon = bt.icon;
          const enabled = ENABLED_TYPES.has(bt.id);
          return (
            <ACCESO__SelectableCard
              key={bt.id}
              compact
              icon={<Icon className="w-6 h-6 text-amber-600" />}
              title={bt.title}
              description={bt.description}
              selected={selectedType === bt.id}
              disabled={!enabled}
              onClick={() => setSelectedType(bt.id)}
            />
          );
        })}
      </div>
    </OnboardingStepShell>
  );
}
