import { useBusiness } from '../../../context/BusinessContext';
import type { BusinessType } from '../../../lib/businessApi';
import { TpvRegisterGate } from '../../../components/saas/TpvRegisterGate';
import { TpvOfflineBanner } from '../../../components/saas/TpvOfflineBanner';
import { WorkerTpvDelivery } from './WorkerTpvDelivery';
import { WorkerTpvSales } from './WorkerTpvSales';
import { WorkerTpvWorkshop } from './WorkerTpvWorkshop';
import { WorkerTpvCleaning } from './WorkerTpvCleaning';
import { WorkerTpvScrapyard } from './WorkerTpvScrapyard';
import { WorkerTpvPharmacy } from './WorkerTpvPharmacy';
import { WorkerTpvSpareParts } from './WorkerTpvSpareParts';
import { WorkerTpvRealEstate } from './WorkerTpvRealEstate';
import { WorkerTpvLawyer } from './WorkerTpvLawyer';
import { WorkerTpvNightclub } from './WorkerTpvNightclub';
import { WorkerTpvConstruction } from './WorkerTpvConstruction';
import { WorkerTpvCarWash } from './WorkerTpvCarWash';
import { WorkerTpvVet } from './WorkerTpvVet';
import { WorkerTpvTobacco } from './WorkerTpvTobacco';
import { WorkerTpvAcademy } from './WorkerTpvAcademy';
import { WorkerTpvGym } from './WorkerTpvGym';
import { WorkerTpvClinic } from './WorkerTpvClinic';
import { WorkerTpvHotel } from './WorkerTpvHotel';
import { WorkerTpvTaxi } from './WorkerTpvTaxi';
import { ButcherTpvPage } from '../ButcherTpvPage';
import { EventsWorkstationPage } from '../EventsWorkstationPage';
import { HairSalonWorkstationPage } from '../HairSalonWorkstationPage';
import { Layout } from '../../../components/saas/Layout';
import {
  Monitor,
  Truck,
  Wrench,
  SprayCan,
  ShoppingCart,
  PartyPopper,
  Recycle,
  Music,
  HardHat,
  Droplets,
  Scale,
  PawPrint,
  Scissors,
  Cog,
  GraduationCap,
  Cigarette,
  Pill,
  Building2,
  Dumbbell,
  Stethoscope,
  Hotel,
  CarTaxiFront,
  Beef,
} from 'lucide-react';

const VERTICAL_MODULE: Partial<Record<BusinessType, React.ComponentType>> = {
  delivery: WorkerTpvDelivery,
  workshop: WorkerTpvWorkshop,
  cleaning: WorkerTpvCleaning,
  carDealership: WorkerTpvSales,
  spareParts: WorkerTpvSpareParts,
  scrapyard: WorkerTpvScrapyard,
  construction: WorkerTpvConstruction,
  pharmacy: WorkerTpvPharmacy,
  carWash: WorkerTpvCarWash,
  vet: WorkerTpvVet,
  events: EventsWorkstationPage,
  hairSalon: HairSalonWorkstationPage,
  nightclub: WorkerTpvNightclub,
  lawyer: WorkerTpvLawyer,
  tobaccoShop: WorkerTpvTobacco,
  academy: WorkerTpvAcademy,
  realEstate: WorkerTpvRealEstate,
  butcherShop: ButcherTpvPage,
};

const VERTICAL_INFO: Partial<Record<BusinessType, { label: string; icon: React.ReactNode }>> = {
  delivery: { label: 'Pedidos y Cocina', icon: <Truck className="w-6 h-6" /> },
  workshop: { label: 'Órdenes de Trabajo', icon: <Wrench className="w-6 h-6" /> },
  cleaning: { label: 'Servicios de Limpieza', icon: <SprayCan className="w-6 h-6" /> },
  carDealership: { label: 'Ventas', icon: <ShoppingCart className="w-6 h-6" /> },
  spareParts: { label: 'Recambios', icon: <Cog className="w-6 h-6" /> },
  scrapyard: { label: 'Desguace', icon: <Recycle className="w-6 h-6" /> },
  construction: { label: 'Obra', icon: <HardHat className="w-6 h-6" /> },
  pharmacy: { label: 'Farmacia', icon: <Pill className="w-6 h-6" /> },
  vet: { label: 'Clínica veterinaria', icon: <PawPrint className="w-6 h-6" /> },
  events: { label: 'Centro de Eventos', icon: <PartyPopper className="w-6 h-6" /> },
  hairSalon: { label: 'Agenda Peluquería', icon: <Scissors className="w-6 h-6" /> },
  nightclub: { label: 'Puerta y Barra', icon: <Music className="w-6 h-6" /> },
  lawyer: { label: 'Despacho', icon: <Scale className="w-6 h-6" /> },
  tobaccoShop: { label: 'Estanco', icon: <Cigarette className="w-6 h-6" /> },
  academy: { label: 'Clases y asistencia', icon: <GraduationCap className="w-6 h-6" /> },
  realEstate: { label: 'Inmobiliaria', icon: <Building2 className="w-6 h-6" /> },
  gym: { label: 'Gimnasio', icon: <Dumbbell className="w-6 h-6" /> },
  clinic: { label: 'Clínica', icon: <Stethoscope className="w-6 h-6" /> },
  hotel: { label: 'Recepción', icon: <Hotel className="w-6 h-6" /> },
  taxi: { label: 'Taxi', icon: <CarTaxiFront className="w-6 h-6" /> },
  butcherShop: { label: 'Carnicería', icon: <Beef className="w-6 h-6" /> },
};

export function WorkerTpv() {
  const { currentBusiness } = useBusiness();
  const vertical = currentBusiness?.businessType as BusinessType | undefined;

  const Module = vertical ? VERTICAL_MODULE[vertical] : undefined;

  if (!Module) {
    return (
      <Layout title="Mi Puesto" subtitle="Panel de trabajo">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
            <Monitor className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
            Módulo TPV no disponible
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
            Tu tipo de negocio aún no tiene un módulo de puesto de trabajo específico.
            Contacta con soporte para más información.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <>
      <TpvOfflineBanner />
      <TpvRegisterGate>
        <Module />
      </TpvRegisterGate>
    </>
  );
}
