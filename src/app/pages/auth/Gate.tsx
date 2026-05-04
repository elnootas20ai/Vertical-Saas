import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { 
  Building2, 
  UserPlus, 
  ArrowRight, 
  CheckCircle,
  Car,
  Users,
  UserSearch,
  Receipt,
  Building,
  Plus,
  Upload,
  FileText,
  FolderOpen,
  Download,
  Wrench,
} from 'lucide-react';
import { ACCESO__Modal } from '../../components/design-system/ACCESO__Modal';
import { ACCESO__Input } from '../../components/design-system/ACCESO__Input';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { useOnboarding } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useApp } from '../../context/AppContext';
import { BadgeStatus } from '../../components/gate/BadgeStatus';
import { BusinessGrid } from '../../components/gate/BusinessGrid';
import { ModalProximamente } from '../../components/gate/ModalProximamente';
import { ModalExportar } from '../../components/gate/ModalExportar';
import { ModalModulo } from '../../components/gate/ModalModulo';
import { VehicleImportWizard } from '../../components/saas/VehicleImportWizard';
import { CrmImportWizard } from '../../components/saas/CrmImportWizard';
import type { BusinessType } from '../../lib/businessApi';

const BUSINESS_TYPE_OPTIONS: Array<{ value: BusinessType; label: string }> = [
  { value: 'carDealership', label: 'Compraventa' },
  { value: 'workshop', label: 'Taller' },
  { value: 'delivery', label: 'Delivery' },
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

export function Gate() {
  const navigate = useNavigate();
  const { data } = useOnboarding();
  const { logout, user } = useAuth();
  const { businesses, currentBusiness, switchBusiness, isLoading: isLoadingBusinesses, createBusiness, reloadBusinesses } = useBusiness();
  const { vehicles, leads, clients, sales } = useApp();

  useEffect(() => {
    if (user?.accountType === 'user' && !user?.linkedBusinessId) {
      navigate('/saas/user-dashboard', { replace: true });
    }
  }, [user, navigate]);
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
  }>({
    name: '',
    taxId: '',
    address: '',
    city: '',
    phone: '',
    email: '',
    businessType: (data.businessType as BusinessType) || '',
  });
  const [isCreatingBusiness, setIsCreatingBusiness] = useState(false);
  const [createBusinessStep, setCreateBusinessStep] = useState<1 | 2 | 3>(1);
  const [createBusinessError, setCreateBusinessError] = useState('');

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
  const hasCIF = hasApiBusinesses
    ? Boolean(currentBusiness?.taxId?.trim())
    : data.companyProfile.taxId.length > 0;
  const displayTradeName = hasApiBusinesses
    ? (currentBusiness?.name || '')
    : data.companyProfile.tradeName;
  const displayTaxId = hasApiBusinesses
    ? (currentBusiness?.taxId || '')
    : data.companyProfile.taxId;
  
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
      const result = await createBusiness({
        name: createBusinessData.name.trim(),
        taxId: createBusinessData.taxId.trim() || undefined,
        address: createBusinessData.address.trim() || undefined,
        city: createBusinessData.city.trim() || undefined,
        phone: createBusinessData.phone.trim() || undefined,
        email: createBusinessData.email.trim() || undefined,
        businessType: createBusinessData.businessType || (data.businessType as BusinessType) || undefined,
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

  const handleEnterDashboard = () => {
    navigate('/saas/dashboard');
  };

  const handleComingSoon = (verticalName: string) => {
    setComingSoonVertical(verticalName);
    setShowComingSoonModal(true);
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setShowInviteModal(false);
    setShowSuccessModal(true);
    setInviteData({ email: '', role: 'comercial' });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#0f1419] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">U</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Vertial</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">Plataforma SaaS multi-vertical</p>
              </div>
            </div>
            <button 
              onClick={() => {
                logout();
                navigate('/');
              }}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Welcome section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
            Bienvenido a Vertial{user?.firstName ? `, ${user.firstName}` : ''}
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
            Plataforma SaaS multi-vertical para digitalizar negocios. Tu acceso actual es <strong>{user?.role || 'Admin'}</strong>.
          </p>
          <div className="flex flex-wrap gap-2">
            <BadgeStatus label="Compraventa" status="available" />
            <BadgeStatus label="Taller" status="available" />
            <BadgeStatus label="Delivery" status="available" />
            <BadgeStatus label="Eventos" status="available" />
            <BadgeStatus label="Limpieza" status="available" />
            <BadgeStatus label="Peluquería" status="available" />
            <BadgeStatus label="Gimnasio" status="available" />
            <BadgeStatus label="Clínica" status="available" />
            <BadgeStatus label="Hotel" status="available" />
            <BadgeStatus label="Construcción" status="available" />
            <BadgeStatus label="Academia" status="available" />
            <BadgeStatus label="Inmobiliaria" status="available" />
            <BadgeStatus label="Abogado" status="available" />
            <BadgeStatus label="Ocio nocturno" status="available" />
            <BadgeStatus label="Desguace" status="available" />
            <BadgeStatus label="Recambios" status="available" />
            <BadgeStatus label="Taxi" status="available" />
            <BadgeStatus label="Farmacia" status="available" />
            <BadgeStatus label="Lavadero" status="available" />
            <BadgeStatus label="Veterinario" status="available" />
            <BadgeStatus label="Estanco" status="available" />
            <BadgeStatus label="Carnicería" status="available" />
          </div>
        </div>

        {/* Grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - 2/3 */}
          <div className="lg:col-span-2 space-y-6">
            {/* Todas las empresas — grid completo */}
            {!isLoadingBusinesses && (
              <div className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Todas las empresas</h3>
                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium rounded-full">
                    {businesses.length}
                  </span>
                </div>
                {hasApiBusinesses && businesses.length > 0 ? (
                  <BusinessGrid
                    businesses={businesses}
                    currentBusinessId={currentBusiness?.business_id}
                    onEnterBusiness={(businessId) => {
                      switchBusiness(businessId);
                      navigate('/saas/dashboard');
                    }}
                    onManageBusinesses={() => navigate('/saas/settings/empresas')}
                    vehicles={vehicles}
                    sales={sales}
                  />
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-800 p-8 text-center">
                    <Building2 className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                    <p className="text-base font-medium text-gray-900 dark:text-gray-100 mb-1">Todavia no hay empresas</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                      Es normal en un entorno nuevo. Crea tu primera empresa para empezar a trabajar.
                    </p>
                    <ACCESO__Button
                      variant="primary"
                      onClick={() => setShowCreateBusiness(true)}
                    >
                      <Plus className="w-4 h-4" />
                      Crear primera empresa
                    </ACCESO__Button>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Right column - 1/3 */}
          <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
            {/* Tu espacio / Empresa activa */}
            <div className="p-7 border-2 border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800 shadow-sm">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-5">Tu espacio</h3>
              {isLoadingBusinesses ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-24 bg-gray-100 dark:bg-gray-700 rounded-2xl" />
                  <div className="h-12 bg-gray-100 dark:bg-gray-700 rounded-xl" />
                </div>
              ) : hasApiBusinesses && currentBusiness ? (
                <div className="space-y-4">
                  <div className="p-5 bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/70 rounded-2xl border border-gray-200 dark:border-gray-700">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-12 h-12 bg-gray-900 dark:bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {currentBusiness.logo ? (
                          <img src={currentBusiness.logo} alt="" className="w-12 h-12 object-cover" />
                        ) : (
                          <Building2 className="w-6 h-6 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{displayTradeName}</h4>
                        {hasCIF ? (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">CIF: {displayTaxId}</p>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full mt-1">
                            CIF pendiente
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full mb-4">
                      Empresa activa
                    </span>
                    {!hasCIF && (
                      <button
                        onClick={() => navigate('/auth/onboarding/company')}
                        className="w-full px-3 py-1.5 mb-3 border border-yellow-600 text-yellow-700 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-950/30 transition-colors text-sm font-medium"
                      >
                        Completar datos
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <ACCESO__Button
                      onClick={handleEnterDashboard}
                      variant="primary"
                      fullWidth
                      size="lg"
                    >
                      <span className="flex-1 text-left">Entrar al panel</span>
                      <ArrowRight className="w-5 h-5" />
                    </ACCESO__Button>
                    <ACCESO__Button onClick={() => setShowInviteModal(true)} variant="outline" fullWidth>
                      <UserPlus className="w-5 h-5" />
                      Invitar a un trabajador
                    </ACCESO__Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Plus className="w-7 h-7 text-amber-600" />
                  </div>
                  <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Crea tu primera empresa</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Configura tu negocio para activar tu panel principal
                  </p>
                  <ACCESO__Button
                    variant="primary"
                    onClick={() => setShowCreateBusiness(true)}
                    fullWidth
                    size="lg"
                  >
                    <Plus className="w-5 h-5" />
                    Nueva empresa
                  </ACCESO__Button>
                </div>
              )}
            </div>

            {/* Integraciones - ANCOVE reubicado */}
            <div className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Integraciones</h3>
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="flex items-start gap-3 mb-2">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">ANCOVE</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">(Opcional)</p>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-200 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-full">
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full"></span>
                      No conectado
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Configúralo cuando lo necesites
                </p>
                <button
                  onClick={() => navigate('/saas/ancove')}
                  className="w-full px-4 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
                >
                  Configurar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

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

      {/* Modal crear empresa */}
      <ACCESO__Modal
        isOpen={showCreateBusiness}
        onClose={resetCreateBusinessModal}
        title="Crear nueva empresa"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateBusiness} className="space-y-4">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className={`h-2 flex-1 rounded-full ${createBusinessStep >= step ? 'bg-amber-500' : 'bg-gray-200 dark:bg-gray-700'}`}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Paso {createBusinessStep} de 3
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                          })
                        }
                        className={`p-3 rounded-xl border text-left transition-all ${
                          selected
                            ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-2 ring-amber-200 dark:ring-amber-800'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                        }`}
                      >
                        <p className={`text-sm font-semibold ${selected ? 'text-amber-800 dark:text-amber-300' : 'text-gray-900 dark:text-gray-100'}`}>
                          {option.label}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Vertical
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {createBusinessStep === 2 && (
            <>
              <ACCESO__Input
                label="CIF / NIF"
                placeholder="B12345678"
                value={createBusinessData.taxId}
                onChange={(e) => setCreateBusinessData({ ...createBusinessData, taxId: e.target.value })}
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
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4 space-y-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Comprobacion de datos</p>
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
            </>
          )}

          {createBusinessStep === 3 && (
            <>
              <div className="grid grid-cols-2 gap-3">
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
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-sm text-gray-600 dark:text-gray-300">
                Revisa los datos y pulsa <strong>Crear empresa</strong> para finalizar.
              </div>
            </>
          )}

          {createBusinessError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {createBusinessError}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <ACCESO__Button
              type="button"
              onClick={createBusinessStep === 1 ? resetCreateBusinessModal : handlePrevCreateStep}
              variant="outline"
              fullWidth
            >
              {createBusinessStep === 1 ? 'Cancelar' : 'Anterior'}
            </ACCESO__Button>
            {createBusinessStep < 3 ? (
              <ACCESO__Button
                type="button"
                variant="primary"
                fullWidth
                onClick={handleNextCreateStep}
              >
                Siguiente
              </ACCESO__Button>
            ) : (
              <ACCESO__Button
                type="submit"
                variant="primary"
                fullWidth
                disabled={isCreatingBusiness || !createBusinessData.name.trim()}
              >
                {isCreatingBusiness ? 'Creando...' : 'Crear empresa'}
              </ACCESO__Button>
            )}
          </div>
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
        filenamePrefix="Vehiculos_UDAR"
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
        filenamePrefix="Clientes_UDAR"
        data={clients as unknown as Record<string, unknown>[]}
        columns={[
          { key: 'name', label: 'Nombre' },
          { key: 'phone', label: 'Teléfono' },
          { key: 'email', label: 'Email' },
          { key: 'dni', label: 'DNI/NIF' },
          { key: 'address', label: 'Dirección' },
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
        filenamePrefix="Leads_UDAR"
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
        filenamePrefix="Facturas_UDAR"
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