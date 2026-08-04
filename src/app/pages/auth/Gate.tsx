import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Building2,
  UserPlus,
  CheckCircle,
  Car,
  Users,
  UserSearch,
  Receipt,
  Plus,
  RefreshCw,
  Wrench,
  Loader2,
} from 'lucide-react';
import { ACCESO__Modal } from '../../components/design-system/ACCESO__Modal';
import { ACCESO__Input } from '../../components/design-system/ACCESO__Input';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { VertialLogo } from '../../components/VertialLogo';
import { useOnboarding } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { resolveWorkerSessionEntryPath } from '../../lib/workerProfileCompletion';
import { useBusiness } from '../../context/BusinessContext';
import { useApp } from '../../context/AppContext';
import { BusinessGrid } from '../../components/gate/BusinessGrid';
import { buildGateSnapshotMap } from '../../components/gate/gateBusinessSnapshots';
import { usePortfolioOverview } from '../../hooks/usePortfolioOverview';
import { ModalProximamente } from '../../components/gate/ModalProximamente';
import { ModalExportar } from '../../components/gate/ModalExportar';
import { resolveClientLocationFields } from '../../lib/clientAddressUtils';
import { ModalModulo } from '../../components/gate/ModalModulo';
import { VehicleImportWizard } from '../../components/saas/VehicleImportWizard';
import { CrmImportWizard } from '../../components/saas/CrmImportWizard';
import {
  readStoredOnboardingBusinessType,
} from '../../lib/deliverySetup';
import { saasPathWithBusinessScope } from '../../lib/businessScopeUrl';
import type { BusinessType } from '../../lib/businessApi';
import {
  resolveRestaurantFormat,
  type RestaurantFormat,
} from '../../verticals/restaurant/restaurantFormat';

const BUSINESS_TYPE_OPTIONS: Array<{ value: BusinessType; label: string }> = [
  { value: 'carDealership', label: 'Compraventa' },
  { value: 'workshop', label: 'Taller' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'restaurant', label: 'Bar/restaurante' },
  { value: 'events', label: 'Eventos' },
  { value: 'cleaning', label: 'Limpieza' },
  { value: 'hairSalon', label: 'Peluqueria' },
  { value: 'gym', label: 'Gimnasio' },
  { value: 'clinic', label: 'Clinica' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'construction', label: 'Construccion' },
  { value: 'academy', label: 'Academia' },
  { value: 'realEstate', label: 'Inmobiliaria' },
  { value: 'lawyer', label: 'Abogado' },
  { value: 'nightclub', label: 'Ocio nocturno' },
  { value: 'scrapyard', label: 'Desguace' },
  { value: 'spareParts', label: 'Recambios' },
  { value: 'taxi', label: 'Taxi' },
  { value: 'pharmacy', label: 'Farmacia' },
  { value: 'carWash', label: 'Lavadero' },
  { value: 'vet', label: 'Veterinario' },
  { value: 'tobaccoShop', label: 'Estanco' },
  { value: 'butcherShop', label: 'Carniceria' },
];

const GATE_CREATE_BUSINESS_FORM_ID = 'gate-create-business-modal-form';

const CREATE_BUSINESS_FLOW_STEPS = [
  { step: 1, title: 'Empresa y sector', hint: 'Nombre y tipo de negocio' },
  { step: 2, title: 'Identificación', hint: 'CIF, teléfono y email' },
  { step: 3, title: 'Ubicación', hint: 'Ciudad y dirección' },
] as const;

function isValidTaxId(value: string) {
  const clean = value.trim().toUpperCase();
  return /^[A-Z0-9]{8,12}$/.test(clean);
}

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 9;
}

function isValidEmail(value: string) {
  const clean = value.trim().toLowerCase().replace(/\s+/g, '');
  // Acepta dominios estándar y también dominios internos/locales.
  return /^[^\s@]+@[^\s@]+(\.[^\s@]+)?$/.test(clean);
}

function isTransientVerificationLoadError(message: string | null | undefined): boolean {
  const m = String(message || '').toLowerCase();
  return m.includes('verificar tu email') || m.includes('email_not_verified');
}

type OnboardingCompanyProfile = {
  tradeName?: string;
  legalName?: string;
  taxId?: string;
  address?: string;
  province?: string;
  city?: string;
  companyEmail?: string;
  companyPhone?: string;
};

function resolveOnboardingCompanyProfile(
  user: ReturnType<typeof useAuth>['user'],
  localOnboarding: ReturnType<typeof useOnboarding>['data'],
): OnboardingCompanyProfile | null {
  const serverProfile = (user?.onboardingData as { companyProfile?: OnboardingCompanyProfile } | undefined)
    ?.companyProfile;
  const localProfile = localOnboarding.companyProfile;
  const profile = serverProfile?.tradeName?.trim() ? serverProfile : localProfile;
  if (!profile?.tradeName?.trim() && !user?.companyName?.trim()) return null;
  return profile;
}

function buildCreatePayloadFromOnboarding(
  user: ReturnType<typeof useAuth>['user'],
  localOnboarding: ReturnType<typeof useOnboarding>['data'],
) {
  const profile = resolveOnboardingCompanyProfile(user, localOnboarding);
  const businessType = (
    (user?.onboardingData as { businessType?: string } | undefined)?.businessType ||
    localOnboarding.businessType ||
    readStoredOnboardingBusinessType(user?.user_id) ||
    'delivery'
  ) as BusinessType;

  const restaurantFormat =
    businessType === 'restaurant'
      ? ((user?.onboardingData as { restaurantFormat?: string } | undefined)?.restaurantFormat ||
          localOnboarding.restaurantFormat ||
          'restaurant')
      : undefined;

  return {
    name: profile?.tradeName?.trim() || user?.companyName?.trim() || '',
    legalName: profile?.legalName,
    taxId: profile?.taxId,
    address: profile?.address,
    city: profile?.city || profile?.province,
    phone: profile?.companyPhone || user?.phone,
    email: profile?.companyEmail || user?.email,
    businessType,
    restaurantFormat,
  };
}

export function Gate() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data } = useOnboarding();
  const { logout, user } = useAuth();
  const {
    businesses,
    currentBusiness,
    switchBusiness,
    isLoading: isLoadingBusinesses,
    businessesFetchSettled,
    businessesLoadError,
    createBusiness,
    reloadBusinesses,
  } = useBusiness();
  const { vehicles, leads, clients, sales } = useApp();

  const isWorkerUser = Boolean(
    user && (user.accountType === 'user' || Boolean(String((user as { invitedBy?: string }).invitedBy || '').trim())),
  );

  useEffect(() => {
    if (!user) return;
    // Worker sin empresa enlazada → invitaciones / alta (sin Gate de empresas).
    if (user.accountType === 'user' && !user.linkedBusinessId) {
      navigate('/saas/invitations', { replace: true });
      return;
    }
    // Worker invitado a una empresa → directo a su zona de trabajador.
    if (isWorkerUser) {
      navigate(resolveWorkerSessionEntryPath(user), { replace: true });
    }
  }, [user, isWorkerUser, navigate]);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);
  const [comingSoonVertical, setComingSoonVertical] = useState('');
  const [inviteData, setInviteData] = useState({ email: '', role: 'comercial' });
  const [showExportVehicles, setShowExportVehicles] = useState(false);
  const [showExportClients, setShowExportClients] = useState(false);
  const [showExportLeads, setShowExportLeads] = useState(false);
  const [showExportInvoices, setShowExportInvoices] = useState(false);
  const [showImportVehicles, setShowImportVehicles] = useState(false);
  const [crmImportMode, setCrmImportMode] = useState<'leads' | 'clients' | null>(null);
  const [showCreateBusiness, setShowCreateBusiness] = useState(false);
  const [createBusinessData, setCreateBusinessData] = useState<{
    name: string;
    taxId: string;
    address: string;
    city: string;
    phone: string;
    email: string;
    businessType: BusinessType | '';
    restaurantFormat: RestaurantFormat;
  }>(() => ({
    name: '',
    taxId: '',
    address: '',
    city: '',
    phone: '',
    email: '',
    businessType: (data.businessType as BusinessType) || '',
    restaurantFormat: resolveRestaurantFormat(data.restaurantFormat),
  }));
  const [isCreatingBusiness, setIsCreatingBusiness] = useState(false);
  const [createBusinessStep, setCreateBusinessStep] = useState<1 | 2 | 3>(1);
  const [createBusinessError, setCreateBusinessError] = useState('');
  const [isAutoProvisioning, setIsAutoProvisioning] = useState(false);
  const autoProvisionAttempted = useRef(false);

  const onboardingPayload = useMemo(
    () => buildCreatePayloadFromOnboarding(user, data),
    [user, data],
  );
  const hasOnboardingCompany = Boolean(onboardingPayload.name);

  const { rows: portfolioRows, loading: portfolioSummariesLoading } = usePortfolioOverview(
    user,
    businesses,
    { live: false },
  );
  const gateBusinessSnapshots = useMemo(
    () => buildGateSnapshotMap(portfolioRows),
    [portfolioRows],
  );

  useEffect(() => {
    if (!hasOnboardingCompany) return;
    setCreateBusinessData((prev) => ({
      name: onboardingPayload.name || prev.name,
      taxId: onboardingPayload.taxId || prev.taxId,
      address: onboardingPayload.address || prev.address,
      city: onboardingPayload.city || prev.city,
      phone: onboardingPayload.phone || prev.phone,
      email: onboardingPayload.email || prev.email,
      businessType: onboardingPayload.businessType || prev.businessType,
      restaurantFormat: resolveRestaurantFormat(onboardingPayload.restaurantFormat || prev.restaurantFormat),
    }));
  }, [hasOnboardingCompany, onboardingPayload.name, onboardingPayload.taxId, onboardingPayload.address, onboardingPayload.city, onboardingPayload.phone, onboardingPayload.email, onboardingPayload.businessType, onboardingPayload.restaurantFormat]);

  const [showModuloVehiculos, setShowModuloVehiculos] = useState(false);
  const [showModuloClientes, setShowModuloClientes] = useState(false);
  const [showModuloFacturacion, setShowModuloFacturacion] = useState(false);
  const [showModuloEquipo, setShowModuloEquipo] = useState(false);

  const [moduloVehiculosActivo, setModuloVehiculosActivo] = useState(true);
  const [moduloClientesActivo, setModuloClientesActivo] = useState(true);
  const [moduloFacturacionActivo, setModuloFacturacionActivo] = useState(false);
  const [moduloEquipoActivo, setModuloEquipoActivo] = useState(false);

  // Datos reales del onboarding (sin placeholders)
  const hasApiBusinesses = businesses.length > 0;
  const isBusinessesPending = !businessesFetchSettled || (isLoadingBusinesses && !hasApiBusinesses);
  // Nunca muro de error si ya hay empresas (caché/API). Solo vacío real o reintento limpio.
  const showBusinessesLoadError =
    Boolean(businessesLoadError) &&
    !isBusinessesPending &&
    !hasApiBusinesses &&
    !isTransientVerificationLoadError(businessesLoadError);
  const showTrulyEmptyBusinesses =
    businessesFetchSettled && !isBusinessesPending && !hasApiBusinesses && !businessesLoadError;

  // Si hay empresas pero aún no hay activa (race tras F5), elegir la primera.
  useEffect(() => {
    if (isBusinessesPending || !hasApiBusinesses || currentBusiness) return;
    const first = businesses[0];
    if (first?.business_id) switchBusiness(first.business_id);
  }, [isBusinessesPending, hasApiBusinesses, currentBusiness, businesses, switchBusiness]);

  // Sin empresas y fallo de red: reintentar solo, sin muro de error.
  useEffect(() => {
    if (!showBusinessesLoadError) return;
    const id = window.setTimeout(() => {
      void reloadBusinesses();
    }, 1800);
    return () => window.clearTimeout(id);
  }, [showBusinessesLoadError, reloadBusinesses]);

  // Una sola empresa → ir directo al panel (esta pantalla solo tiene sentido con varias).
  // Nunca para trabajador: el efecto de arriba ya lo manda a /saas/worker/*;
  // si no, aquí ganaba la carrera y acababa en el home de empresa.
  useEffect(() => {
    if (location.pathname !== '/auth/gate') return;
    if (isWorkerUser) return;
    if (isBusinessesPending || showBusinessesLoadError) return;
    if (businesses.length !== 1) return;
    const only = businesses[0];
    if (!only?.business_id) return;
    if (currentBusiness?.business_id !== only.business_id) {
      switchBusiness(only.business_id);
    }
    navigate(saasPathWithBusinessScope('/saas/dashboard', only.business_id), { replace: true });
  }, [
    location.pathname,
    isWorkerUser,
    isBusinessesPending,
    showBusinessesLoadError,
    businesses,
    currentBusiness?.business_id,
    switchBusiness,
    navigate,
  ]);

  // Tras el onboarding, crear la empresa automáticamente con los datos ya recogidos.
  useEffect(() => {
    if (isWorkerUser) return;
    if (!showTrulyEmptyBusinesses || !hasOnboardingCompany || autoProvisionAttempted.current) return;

    if (user?.onboardingData?.suppressAutoProvision) {
      autoProvisionAttempted.current = true;
      return;
    }

    // El backend ya la crea al completar el onboarding; evitar un segundo alta desde aquí.
    if (user?.onboardingCompleted) {
      autoProvisionAttempted.current = true;
      void reloadBusinesses();
      return;
    }

    autoProvisionAttempted.current = true;
    setIsAutoProvisioning(true);

    void createBusiness(onboardingPayload)
      .then(async (result) => {
        if (!result.success || !result.business?.business_id) return;
        await reloadBusinesses();
        switchBusiness(result.business.business_id);
        navigate(saasPathWithBusinessScope('/saas/dashboard', result.business.business_id), { replace: true });
      })
      .finally(() => setIsAutoProvisioning(false));
  }, [
    isWorkerUser,
    showTrulyEmptyBusinesses,
    hasOnboardingCompany,
    user?.onboardingCompleted,
    createBusiness,
    reloadBusinesses,
    switchBusiness,
    navigate,
    onboardingPayload,
  ]);


  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createBusinessData.name.trim()) return;

    if (!createBusinessData.businessType) {
      setCreateBusinessError('Selecciona el tipo de negocio');
      return;
    }
    if (!isValidTaxId(createBusinessData.taxId)) {
      setCreateBusinessError('Introduce un CIF/NIF valido (8-12 caracteres)');
      return;
    }
    if (!isValidPhone(createBusinessData.phone)) {
      setCreateBusinessError('Introduce un telefono valido (minimo 9 digitos)');
      return;
    }
    if (!createBusinessData.email.trim() || !isValidEmail(createBusinessData.email)) {
      setCreateBusinessError('Introduce un email valido');
      return;
    }

    setCreateBusinessError('');
    setIsCreatingBusiness(true);
    try {
      const businessType =
        createBusinessData.businessType || (data.businessType as BusinessType) || undefined;
      const result = await createBusiness({
        name: createBusinessData.name.trim(),
        taxId: createBusinessData.taxId.trim() || undefined,
        address: createBusinessData.address.trim() || undefined,
        city: createBusinessData.city.trim() || undefined,
        phone: createBusinessData.phone.trim() || undefined,
        email: createBusinessData.email.trim() || undefined,
        businessType,
        restaurantFormat:
          businessType === 'restaurant' ? createBusinessData.restaurantFormat : undefined,
      });
      if (result.success) {
        setShowCreateBusiness(false);
        setCreateBusinessData({
          name: '',
          taxId: '',
          address: '',
          city: '',
          phone: '',
          email: '',
          businessType: (data.businessType as BusinessType) || '',
          restaurantFormat: resolveRestaurantFormat(data.restaurantFormat),
        });
        setCreateBusinessStep(1);
        setCreateBusinessError('');
        await reloadBusinesses();
      }
    } finally {
      setIsCreatingBusiness(false);
    }
  };

  const resetCreateBusinessModal = () => {
    setShowCreateBusiness(false);
    setCreateBusinessStep(1);
    setCreateBusinessError('');
  };

  const handleNextCreateStep = () => {
    if (createBusinessStep === 1) {
      if (!createBusinessData.businessType || !createBusinessData.name.trim()) {
        setCreateBusinessError('Completa tipo de negocio y nombre comercial para continuar');
        return;
      }
    }
    if (createBusinessStep === 2) {
      if (!isValidTaxId(createBusinessData.taxId)) {
        setCreateBusinessError('Introduce un CIF/NIF valido (8-12 caracteres)');
        return;
      }
      if (!isValidPhone(createBusinessData.phone)) {
        setCreateBusinessError('Introduce un telefono valido (minimo 9 digitos)');
        return;
      }
      if (!createBusinessData.email.trim() || !isValidEmail(createBusinessData.email)) {
        setCreateBusinessError('Introduce un email valido');
        return;
      }
    }
    setCreateBusinessError('');
    setCreateBusinessStep((prev) => (prev === 3 ? 3 : ((prev + 1) as 1 | 2 | 3)));
  };

  const handlePrevCreateStep = () => {
    setCreateBusinessError('');
    setCreateBusinessStep((prev) => (prev === 1 ? 1 : ((prev - 1) as 1 | 2 | 3)));
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setShowInviteModal(false);
    setShowSuccessModal(true);
    setInviteData({ email: '', role: 'comercial' });
  };

  // No pintar el selector de empresas mientras redirige al trabajador.
  if (isWorkerUser) {
    return (
      <div className="min-h-screen bg-[#03050a] flex items-center justify-center text-sm text-slate-400">
        Abriendo tu espacio de trabajo…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="border-b border-gray-200/80 bg-white/95 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <VertialLogo size="md" />
          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/');
            }}
            className="text-sm text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-6">
        {isBusinessesPending ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-8 w-48 rounded-lg bg-gray-200 dark:bg-gray-700" />
            <div className="h-32 rounded-2xl bg-gray-200 dark:bg-gray-700" />
            <div className="h-32 rounded-2xl bg-gray-200 dark:bg-gray-700" />
          </div>
        ) : showBusinessesLoadError ? (
          <div className="mx-auto max-w-lg rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <Loader2 className="mx-auto mb-4 h-9 w-9 animate-spin text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Conectando con tus empresas…</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600 dark:text-gray-400">
              Un momento. Si tarda, pulsa reintentar.
            </p>
            <ACCESO__Button className="mt-6" variant="primary" onClick={() => void reloadBusinesses()}>
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </ACCESO__Button>
          </div>
        ) : showTrulyEmptyBusinesses ? (
          <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-sm dark:border-gray-600 dark:bg-gray-800">
            {isAutoProvisioning || hasOnboardingCompany ? (
              <>
                <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-blue-600" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Activando tu espacio
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  Usamos los datos de tu alta ({onboardingPayload.name}) para preparar tu empresa en Vertial.
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-700">
                  <Building2 className="h-7 w-7 text-gray-500 dark:text-gray-400" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Crea tu primera empresa</h1>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  Configura tu negocio para acceder al panel de Vertial.
                </p>
                <ACCESO__Button
                  className="mt-6"
                  variant="primary"
                  size="lg"
                  onClick={() => setShowCreateBusiness(true)}
                >
                  <Plus className="h-4 w-4" />
                  Nueva empresa
                </ACCESO__Button>
              </>
            )}
          </div>
        ) : hasApiBusinesses && businesses.length > 1 ? (
          <div className="space-y-4 pb-20">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                  Elige empresa
                </h1>
                <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                  Tienes {businesses.length} negocios. Pulsa el botón de la empresa o entra con la activa.
                </p>
              </div>
              <ACCESO__Button
                variant="outline"
                size="sm"
                className="shrink-0 whitespace-nowrap !border !py-1.5 !px-3"
                onClick={() => setShowCreateBusiness(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Nueva empresa
              </ACCESO__Button>
            </div>

            <BusinessGrid
              businesses={businesses}
              currentBusinessId={currentBusiness?.business_id}
              onEnterBusiness={(businessId) => {
                switchBusiness(businessId);
                navigate(saasPathWithBusinessScope('/saas/dashboard', businessId), { replace: true });
              }}
              onManageBusinesses={() =>
                navigate(
                  saasPathWithBusinessScope(
                    '/saas/settings/empresas',
                    currentBusiness?.business_id,
                  ),
                )
              }
              businessSnapshots={gateBusinessSnapshots}
              summariesLoading={portfolioSummariesLoading}
            />

            {currentBusiness ? (
              <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <ACCESO__Button
                  variant="primary"
                  size="md"
                  fullWidth
                  icon="next"
                  onClick={() => {
                    switchBusiness(currentBusiness.business_id);
                    navigate(
                      saasPathWithBusinessScope('/saas/dashboard', currentBusiness.business_id),
                      { replace: true },
                    );
                  }}
                >
                  Entrar al panel — {currentBusiness.name}
                </ACCESO__Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </main>

      {/* Modal de invitación */}
      <ACCESO__Modal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Invitar a un trabajador"
      >
        <form onSubmit={handleInvite} className="space-y-4">
          <ACCESO__Input
            label="Email del trabajador"
            type="email"
            placeholder="trabajador@empresa.com"
            value={inviteData.email}
            onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Rol
            </label>
            <select
              value={inviteData.role}
              onChange={(e) => setInviteData({ ...inviteData, role: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            >
              <option value="comercial">Comercial</option>
              <option value="administracion">Administración</option>
              <option value="gerente">Gerente</option>
            </select>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
            Recibirá un email para activar su cuenta y configurar su contraseña.
          </p>

          <div className="flex gap-3">
            <ACCESO__Button
              type="button"
              onClick={() => setShowInviteModal(false)}
              variant="outline"
              fullWidth
            >
              Cancelar
            </ACCESO__Button>
            <ACCESO__Button
              type="submit"
              variant="primary"
              fullWidth
            >
              Enviar invitación
            </ACCESO__Button>
          </div>
        </form>
      </ACCESO__Modal>

      {/* Modal de éxito */}
      <ACCESO__Modal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        showCloseButton={false}
      >
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            ✅ Invitación enviada
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            El usuario recibirá un email con las instrucciones para acceder
          </p>
          <ACCESO__Button
            onClick={() => setShowSuccessModal(false)}
            variant="primary"
          >
            Entendido
          </ACCESO__Button>
        </div>
      </ACCESO__Modal>

      {/* Modal crear empresa: acciones fijas abajo; solo el cuerpo hace scroll */}
      <ACCESO__Modal
        isOpen={showCreateBusiness}
        onClose={resetCreateBusinessModal}
        title="Crear nueva empresa"
        maxWidth="7xl"
        tall
        spaciousBody
        footer={
          <div className="flex gap-3">
            <ACCESO__Button
              type="button"
              onClick={createBusinessStep === 1 ? resetCreateBusinessModal : handlePrevCreateStep}
              variant="outline"
              fullWidth
            >
              {createBusinessStep === 1 ? 'Cancelar' : 'Anterior'}
            </ACCESO__Button>
            {createBusinessStep < 3 ? (
              <ACCESO__Button type="button" variant="primary" fullWidth onClick={handleNextCreateStep}>
                Siguiente
              </ACCESO__Button>
            ) : (
              <ACCESO__Button
                type="submit"
                form={GATE_CREATE_BUSINESS_FORM_ID}
                variant="primary"
                fullWidth
                disabled={isCreatingBusiness || !createBusinessData.name.trim()}
              >
                {isCreatingBusiness ? 'Creando...' : 'Crear empresa'}
              </ACCESO__Button>
            )}
          </div>
        }
      >
        <form id={GATE_CREATE_BUSINESS_FORM_ID} onSubmit={handleCreateBusiness} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {CREATE_BUSINESS_FLOW_STEPS.map(({ step, title, hint }) => {
              const done = createBusinessStep > step;
              const active = createBusinessStep === step;
              return (
                <div
                  key={step}
                  className={`rounded-xl border-2 px-3 py-2.5 sm:py-3 text-left transition-colors ${
                    done
                      ? 'border-green-300 bg-green-50/80 dark:border-green-800 dark:bg-green-950/30'
                      : active
                        ? 'border-amber-500 bg-amber-50/90 dark:border-amber-600 dark:bg-amber-950/25 ring-1 ring-amber-200/80 dark:ring-amber-800/50'
                        : 'border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-900/40'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        done
                          ? 'bg-green-600 text-white'
                          : active
                            ? 'bg-amber-500 text-white'
                            : 'bg-gray-300 text-gray-700 dark:bg-gray-600 dark:text-gray-200'
                      }`}
                    >
                      {done ? '✓' : step}
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className={`text-sm font-semibold leading-tight ${active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-800 dark:text-gray-200'}`}>
                        {title}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400 leading-snug">{hint}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 -mt-2">
            Paso {createBusinessStep} de 3 — {CREATE_BUSINESS_FLOW_STEPS[createBusinessStep - 1]?.title}
          </p>

          {createBusinessStep === 1 && (
            <>
              <ACCESO__Input
                label="Nombre comercial"
                placeholder="Mi empresa S.L."
                value={createBusinessData.name}
                onChange={(e) => setCreateBusinessData({ ...createBusinessData, name: e.target.value })}
                required
              />
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Tipo de negocio (vertical)
                </label>
                <div className="grid grid-cols-3 min-[480px]:grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2">
                  {BUSINESS_TYPE_OPTIONS.map((option) => {
                    const selected = createBusinessData.businessType === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setCreateBusinessData({
                            ...createBusinessData,
                            businessType: option.value,
                            restaurantFormat:
                              option.value === 'restaurant' ? 'restaurant' : createBusinessData.restaurantFormat,
                          })
                        }
                        className={`min-h-[3rem] rounded-xl border px-3 py-3 text-left transition-all sm:min-h-[3.25rem] sm:px-3.5 sm:py-3.5 ${
                          selected
                            ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-2 ring-amber-200 dark:ring-amber-800'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                        }`}
                      >
                        <span className={`block text-sm font-semibold leading-snug sm:text-base ${selected ? 'text-amber-800 dark:text-amber-300' : 'text-gray-900 dark:text-gray-100'}`}>
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {createBusinessStep === 2 && (
            <div className="space-y-5">
              <ACCESO__Input
                label="CIF / NIF"
                placeholder="Ej. B12345674 (9 caracteres)"
                value={createBusinessData.taxId}
                onChange={(e) =>
                  setCreateBusinessData({
                    ...createBusinessData,
                    taxId: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                  })
                }
                maxLength={14}
                required
              />
              <ACCESO__Input
                label="Telefono"
                placeholder="612 345 678"
                value={createBusinessData.phone}
                onChange={(e) => setCreateBusinessData({ ...createBusinessData, phone: e.target.value })}
                required
              />
              <ACCESO__Input
                label="Email de la empresa"
                type="email"
                placeholder="info@miempresa.com"
                value={createBusinessData.email}
                onChange={(e) =>
                  setCreateBusinessData({
                    ...createBusinessData,
                    email: e.target.value.replace(/\s+/g, ''),
                  })
                }
                required
              />
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-5 space-y-2.5">
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Comprobación de datos</p>
                <p className={`text-sm ${isValidTaxId(createBusinessData.taxId) ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {isValidTaxId(createBusinessData.taxId) ? 'OK' : 'Pendiente'} - CIF/NIF valido
                </p>
                <p className={`text-sm ${isValidPhone(createBusinessData.phone) ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {isValidPhone(createBusinessData.phone) ? 'OK' : 'Pendiente'} - Telefono valido
                </p>
                <p className={`text-sm ${isValidEmail(createBusinessData.email) ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {isValidEmail(createBusinessData.email) ? 'OK' : 'Pendiente'} - Email valido
                </p>
              </div>
            </div>
          )}

          {createBusinessStep === 3 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ACCESO__Input
                  label="Ciudad"
                  placeholder="Madrid"
                  value={createBusinessData.city}
                  onChange={(e) => setCreateBusinessData({ ...createBusinessData, city: e.target.value })}
                />
                <ACCESO__Input
                  label="Direccion"
                  placeholder="Calle ejemplo 123"
                  value={createBusinessData.address}
                  onChange={(e) => setCreateBusinessData({ ...createBusinessData, address: e.target.value })}
                />
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 text-base leading-relaxed text-gray-600 dark:text-gray-300">
                Revisa los datos y pulsa <strong>Crear empresa</strong> para finalizar.
              </div>
            </div>
          )}

          {createBusinessError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {createBusinessError}
            </div>
          )}
        </form>
      </ACCESO__Modal>

      {/* Modal próximamente */}
      <ModalProximamente
        isOpen={showComingSoonModal}
        onClose={() => setShowComingSoonModal(false)}
        verticalName={comingSoonVertical}
      />

      {/* Modales de importación */}
      <VehicleImportWizard
        isOpen={showImportVehicles}
        onClose={() => setShowImportVehicles(false)}
      />

      <CrmImportWizard
        isOpen={crmImportMode !== null}
        onClose={() => setCrmImportMode(null)}
        initialMode={crmImportMode ?? undefined}
      />

      {/* Modales de exportación */}
      {/* Modales de módulos */}
      <ModalModulo
        isOpen={showModuloVehiculos}
        onClose={() => setShowModuloVehiculos(false)}
        title="Módulo Vehículos"
        description="Gestión completa del stock de vehículos: alta, edición, ubicaciones, historial de costes y fichas públicas compartibles."
        icon={<Car className="w-6 h-6 text-blue-600" />}
        iconBgColor="bg-blue-50 dark:bg-blue-900/30"
        activated={moduloVehiculosActivo}
        onToggle={() => setModuloVehiculosActivo((v) => !v)}
        stats={[
          { label: 'Vehículos en stock', value: vehicles.length },
          { label: 'Importaciones', value: vehicles.length > 0 ? 'Sí' : 'No' },
        ]}
        features={[
          'Alta y edición de vehículos',
          'Importación masiva CSV/Excel',
          'Gestión de ubicaciones',
          'Fichas públicas compartibles',
          'Historial de costes y gastos',
          'Comparador de vehículos',
        ]}
      />

      <ModalModulo
        isOpen={showModuloClientes}
        onClose={() => setShowModuloClientes(false)}
        title="Módulo Clientes"
        description="CRM completo para gestión de leads y clientes: seguimiento, pipeline de ventas, etiquetas y comunicaciones."
        icon={<Users className="w-6 h-6 text-emerald-600" />}
        iconBgColor="bg-emerald-50 dark:bg-emerald-900/30"
        activated={moduloClientesActivo}
        onToggle={() => setModuloClientesActivo((v) => !v)}
        stats={[
          { label: 'Clientes', value: clients.length },
          { label: 'Leads', value: leads.length },
        ]}
        features={[
          'Gestión de leads y clientes',
          'Pipeline de ventas visual',
          'Importación masiva CRM',
          'Etiquetas y segmentación',
          'Historial de interacciones',
          'Asignación de responsables',
        ]}
      />

      <ModalModulo
        isOpen={showModuloFacturacion}
        onClose={() => setShowModuloFacturacion(false)}
        title="Módulo Facturación"
        description="Facturación y gestión de ventas: creación de facturas, seguimiento de cobros, exportación contable y reporting financiero."
        icon={<Receipt className="w-6 h-6 text-amber-600" />}
        iconBgColor="bg-amber-50 dark:bg-amber-900/30"
        activated={moduloFacturacionActivo}
        onToggle={() => setModuloFacturacionActivo((v) => !v)}
        stats={[
          { label: 'Ventas registradas', value: sales.length },
          { label: 'Estado', value: moduloFacturacionActivo ? 'Activo' : 'Inactivo' },
        ]}
        features={[
          'Creación de facturas',
          'Seguimiento de cobros',
          'Exportación CSV/Excel',
          'Integración con contabilidad',
          'Informes de ventas',
          'Gestión de pagos parciales',
        ]}
      />

      <ModalModulo
        isOpen={showModuloEquipo}
        onClose={() => setShowModuloEquipo(false)}
        title="Módulo Equipo"
        description="Gestión del equipo de trabajo: roles, permisos, asignaciones, rendimiento comercial y control de accesos."
        icon={<Wrench className="w-6 h-6 text-violet-600" />}
        iconBgColor="bg-violet-50 dark:bg-violet-900/30"
        activated={moduloEquipoActivo}
        onToggle={() => setModuloEquipoActivo((v) => !v)}
        stats={[
          { label: 'Estado', value: moduloEquipoActivo ? 'Activo' : 'Inactivo' },
        ]}
        features={[
          'Gestión de usuarios y roles',
          'Invitación de trabajadores',
          'Permisos por módulo',
          'Rendimiento comercial',
          'Control de accesos',
          'Historial de actividad',
        ]}
      />

      <ModalExportar
        isOpen={showExportVehicles}
        onClose={() => setShowExportVehicles(false)}
        title="Exportar Vehículos"
        description="Exporta todo tu stock de vehículos con los datos principales de cada uno."
        icon={<Car className="w-5 h-5 text-blue-600" />}
        iconBgColor="bg-blue-50 dark:bg-blue-900/30"
        filenamePrefix="Vehiculos_Vertial"
        data={vehicles as unknown as Record<string, unknown>[]}
        columns={[
          { key: 'registrationPlate', label: 'Matrícula' },
          { key: 'brand', label: 'Marca' },
          { key: 'model', label: 'Modelo' },
          { key: 'year', label: 'Año' },
          { key: 'color', label: 'Color' },
          { key: 'fuelType', label: 'Combustible' },
          { key: 'mileage', label: 'Kilómetros' },
          { key: 'purchasePrice', label: 'Precio compra' },
          { key: 'salePrice', label: 'Precio venta' },
          { key: 'status', label: 'Estado' },
          { key: 'location', label: 'Ubicación' },
          { key: 'daysInStock', label: 'Días en stock' },
        ]}
      />

      <ModalExportar
        isOpen={showExportClients}
        onClose={() => setShowExportClients(false)}
        title="Exportar Clientes"
        description="Exporta la base de datos de clientes con su información de contacto."
        icon={<Users className="w-5 h-5 text-emerald-600" />}
        iconBgColor="bg-emerald-50 dark:bg-emerald-900/30"
        filenamePrefix="Clientes_Vertial"
        data={
          clients.map((c) => ({
            ...c,
            ...resolveClientLocationFields(c),
          })) as unknown as Record<string, unknown>[]
        }
        columns={[
          { key: 'name', label: 'Nombre' },
          { key: 'phone', label: 'Teléfono' },
          { key: 'email', label: 'Email' },
          { key: 'dni', label: 'DNI/NIF' },
          { key: 'address', label: 'Calle / dirección' },
          { key: 'city', label: 'Ciudad' },
          { key: 'postalCode', label: 'Código postal' },
          { key: 'status', label: 'Estado' },
          { key: 'responsible', label: 'Responsable' },
        ]}
      />

      <ModalExportar
        isOpen={showExportLeads}
        onClose={() => setShowExportLeads(false)}
        title="Exportar Leads"
        description="Exporta todos los leads del pipeline de ventas con sus datos de seguimiento."
        icon={<UserSearch className="w-5 h-5 text-violet-600" />}
        iconBgColor="bg-violet-50 dark:bg-violet-900/30"
        filenamePrefix="Leads_Vertial"
        data={leads as unknown as Record<string, unknown>[]}
        columns={[
          { key: 'name', label: 'Nombre' },
          { key: 'phone', label: 'Teléfono' },
          { key: 'email', label: 'Email' },
          { key: 'source', label: 'Origen' },
          { key: 'status', label: 'Estado' },
          { key: 'interestedVehicle', label: 'Vehículo interesado' },
          { key: 'budget', label: 'Presupuesto' },
          { key: 'responsible', label: 'Responsable' },
          { key: 'score', label: 'Puntuación' },
        ]}
      />

      <ModalExportar
        isOpen={showExportInvoices}
        onClose={() => setShowExportInvoices(false)}
        title="Exportar Facturas / Ventas"
        description="Exporta el registro de operaciones de venta con importes y estados."
        icon={<Receipt className="w-5 h-5 text-amber-600" />}
        iconBgColor="bg-amber-50 dark:bg-amber-900/30"
        filenamePrefix="Facturas_Vertial"
        data={sales as unknown as Record<string, unknown>[]}
        columns={[
          { key: 'id', label: 'ID' },
          { key: 'vehicleId', label: 'Vehículo' },
          { key: 'clientId', label: 'Cliente' },
          { key: 'salePrice', label: 'Precio venta' },
          { key: 'downPayment', label: 'Entrada' },
          { key: 'financingAmount', label: 'Financiación' },
          { key: 'status', label: 'Estado' },
          { key: 'saleDate', label: 'Fecha venta' },
          { key: 'notes', label: 'Notas' },
        ]}
      />
    </div>
  );
}