import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Car, Wrench, Truck, SprayCan, Dumbbell, Stethoscope,
  Hotel, HardHat, GraduationCap, Building2, Scale, Music,
  PartyPopper, Scissors, Container, Cog, CarTaxiFront,
  Pill, Droplets, PawPrint, Cigarette, Beef,
} from 'lucide-react';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import { ACCESO__Stepper } from '../../../components/design-system/ACCESO__Stepper';
import { ACCESO__SelectableCard } from '../../../components/design-system/ACCESO__SelectableCard';
import { useOnboarding, ONBOARDING_STEPS, ONBOARDING_ROUTES } from '../../../context/OnboardingContext';

const STEP_INDEX = 0;

const ENABLED_TYPES = new Set(['events', 'carDealership', 'workshop', 'delivery', 'cleaning', 'hairSalon', 'tobaccoShop', 'scrapyard', 'gym', 'clinic', 'hotel', 'construction', 'academy', 'realEstate', 'lawyer', 'nightclub', 'spareParts', 'taxi', 'pharmacy', 'carWash', 'vet', 'butcherShop']);

const BUSINESS_TYPES = [
  { id: 'events',        icon: PartyPopper,   title: 'Eventos',              description: 'Organización y gestión de eventos' },
  { id: 'carDealership', icon: Car,           title: 'Compraventa de coches', description: 'Gestión completa para tu compraventa' },
  { id: 'workshop',      icon: Wrench,        title: 'Taller',                description: 'Gestión de taller mecánico' },
  { id: 'delivery',      icon: Truck,         title: 'Delivery',              description: 'Logística y entregas' },
  { id: 'cleaning',      icon: SprayCan,      title: 'Limpieza',             description: 'Gestión de empresa de limpieza' },
  { id: 'hairSalon',     icon: Scissors,      title: 'Peluquería',           description: 'Gestión de salón de belleza' },
  { id: 'gym',           icon: Dumbbell,      title: 'Gimnasio',             description: 'Gestión de gimnasio y fitness' },
  { id: 'clinic',        icon: Stethoscope,   title: 'Clínica',              description: 'Gestión de clínica y consultas' },
  { id: 'hotel',         icon: Hotel,         title: 'Hotel',                description: 'Gestión hotelera completa' },
  { id: 'construction',  icon: HardHat,       title: 'Constructora',         description: 'Gestión de obras y proyectos' },
  { id: 'academy',       icon: GraduationCap, title: 'Academia',             description: 'Gestión educativa y formación' },
  { id: 'realEstate',    icon: Building2,     title: 'Inmobiliaria',         description: 'Gestión inmobiliaria integral' },
  { id: 'lawyer',        icon: Scale,         title: 'Abogados',             description: 'Gestión de despacho jurídico' },
  { id: 'nightclub',     icon: Music,         title: 'Discoteca',            description: 'Gestión de ocio nocturno' },
  { id: 'scrapyard',     icon: Container,     title: 'Desguace',             description: 'Gestión de desguace de vehículos' },
  { id: 'spareParts',    icon: Cog,           title: 'Recambios',            description: 'Venta de recambios y repuestos' },
  { id: 'taxi',          icon: CarTaxiFront,  title: 'Taxi',                 description: 'Gestión de flota de taxis' },
  { id: 'pharmacy',      icon: Pill,          title: 'Farmacia',             description: 'Gestión de farmacia y parafarmacia' },
  { id: 'carWash',       icon: Droplets,      title: 'Lavadero de coches',   description: 'Gestión de centro de lavado' },
  { id: 'vet',           icon: PawPrint,      title: 'Veterinario',          description: 'Gestión de clínica veterinaria' },
  { id: 'tobaccoShop',   icon: Cigarette,     title: 'Estanco',              description: 'Gestión de estanco y expendeduría' },
  { id: 'butcherShop',   icon: Beef,          title: 'Carnicería',           description: 'Gestión de carnicería y charcutería' },
] as const;

export function BusinessType() {
  const navigate = useNavigate();
  const { data, updateData, advanceStep } = useOnboarding();
  const [selectedType, setSelectedType] = useState(data.businessType || 'events');

  const handleContinue = () => {
    if (selectedType !== 'carDealership') {
      updateData('companyProfile', {
        ...data.companyProfile,
        isAncovePartner: false,
        ancoveMemberNumber: '',
      });
    }
    updateData('businessType', selectedType);
    advanceStep(STEP_INDEX);
    navigate('/auth/onboarding/company');
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-800 flex flex-col overflow-hidden">
      {/* Stepper sticky arriba */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 pt-4 pb-1 shrink-0">
        <div className="w-full max-w-5xl mx-auto">
          <ACCESO__Stepper
            steps={[...ONBOARDING_STEPS]}
            currentStep={STEP_INDEX}
            compact
            onStepClick={(i) => {
              if (i !== STEP_INDEX) navigate(ONBOARDING_ROUTES[i]);
            }}
          />
        </div>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="w-full max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              ¿Qué tipo de negocio tienes?
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Selecciona el sector que mejor describa tu actividad principal.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {BUSINESS_TYPES.map((bt) => {
              const Icon = bt.icon;
              const enabled = ENABLED_TYPES.has(bt.id);
              return (
                <ACCESO__SelectableCard
                  key={bt.id}
                  icon={<Icon className="w-8 h-8 text-amber-600" />}
                  title={bt.title}
                  description={bt.description}
                  selected={selectedType === bt.id}
                  disabled={!enabled}
                  onClick={() => setSelectedType(bt.id)}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Botones sticky abajo */}
      <div className="sticky bottom-0 z-20 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 shrink-0">
        <div className="w-full max-w-5xl mx-auto flex justify-end">
          <ACCESO__Button
            onClick={handleContinue}
            variant="primary"
            icon="next"
          >
            Continuar
          </ACCESO__Button>
        </div>
      </div>
    </div>
  );
}