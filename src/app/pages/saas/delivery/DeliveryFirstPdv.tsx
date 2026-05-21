import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Store, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { VertialLogo } from '../../../components/VertialLogo';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../../components/design-system/ACCESO__Input';
import { ACCESO__AddressAutocomplete } from '../../../components/design-system/ACCESO__AddressAutocomplete';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import {
  countDeliveryPointsOfSale,
  isDeliveryAccountFromSources,
  markDeliveryPdvSessionConfirmed,
  setupDeliveryRetailStore,
} from '../../../lib/deliverySetup';
import { pointOfSaleDisplayLabel } from '../../../lib/deliveryApi';

function FirstPdvPageLoader() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
    </div>
  );
}

export function DeliveryFirstPdv() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness, isLoading: businessesLoading } = useBusiness();

  const [checking, setChecking] = useState(true);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [addressError, setAddressError] = useState('');
  const createdAndLeft = useRef(false);

  const redirectIfNotNeeded = useCallback(async () => {
    if (createdAndLeft.current) return;
    if (businessesLoading && !currentBusiness) return;
    if (
      !isDeliveryAccountFromSources({
        business: currentBusiness,
        userOnboarding: user?.onboardingData as { businessType?: string } | undefined,
      })
    ) {
      navigate('/saas/dashboard', { replace: true });
      return;
    }
    if (!user) {
      setChecking(false);
      return;
    }
    try {
      const count = await countDeliveryPointsOfSale(user, currentBusiness);
      if (count > 0) {
        navigate('/saas/dashboard', { replace: true });
        return;
      }
    } catch {
      /* seguir en pantalla de creación */
    }
    setChecking(false);
  }, [businessesLoading, currentBusiness, user, navigate]);

  useEffect(() => {
    void redirectIfNotNeeded();
  }, [redirectIfNotNeeded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError('');
    setAddressError('');

    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    if (!trimmedName) {
      setNameError('El nombre del local es obligatorio');
      return;
    }
    if (trimmedAddress.length < 5) {
      setAddressError('Indica una dirección completa (mínimo 5 caracteres)');
      return;
    }
    if (!user) {
      toast.error('Sesión no válida. Vuelve a iniciar sesión.');
      return;
    }

    setSaving(true);
    try {
      const { pointOfSale } = await setupDeliveryRetailStore(user, currentBusiness, {
        name: trimmedName,
        address: trimmedAddress,
        city: city.trim() || undefined,
        province: province.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        phone: phone.trim() || undefined,
        businessId: currentBusiness?.business_id || currentBusiness?.id,
      });

      const uid = String(user.user_id || user.id || '').trim();
      if (uid) markDeliveryPdvSessionConfirmed(uid);
      createdAndLeft.current = true;
      toast.success(`Punto de venta creado: ${pointOfSaleDisplayLabel(pointOfSale)}`);
      navigate('/saas/dashboard', { replace: true });
      return;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el punto de venta');
    } finally {
      setSaving(false);
    }
  };

  if (checking || (businessesLoading && !currentBusiness)) {
    return <FirstPdvPageLoader />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[480px]">
          <div className="flex justify-center mb-8">
            <VertialLogo size="lg" />
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm px-8 py-10">
              <div className="flex justify-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-950/50 flex items-center justify-center">
                <Store className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50 text-center mb-2">
              Tu primer punto de venta
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-8 leading-relaxed">
              Sin un local con caja no puedes facturar, usar el TPV ni operar pedidos. Completa estos
              datos para activar tu empresa.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
              <ACCESO__Input
                label="Nombre del local *"
                type="text"
                placeholder="Ej: Local Centro"
                icon={<Store className="w-5 h-5" />}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError('');
                }}
                error={nameError || undefined}
                required
              />
              <ACCESO__AddressAutocomplete
                label="Dirección *"
                placeholder="Calle, número, ciudad…"
                value={address}
                onChange={(val) => {
                  setAddress(val);
                  setAddressError('');
                }}
                onPlaceSelect={(place) => {
                  setAddress(place.address || '');
                  if (place.city) setCity(place.city);
                  if (place.province) setProvince(place.province);
                  setAddressError('');
                }}
              />
              {addressError && (
                <p className="text-xs text-red-600 -mt-2 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {addressError}
                </p>
              )}
              <ACCESO__Input
                label="Teléfono (opcional)"
                type="tel"
                placeholder="Contacto del local"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <ACCESO__Button type="submit" variant="primary" fullWidth disabled={saving}>
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creando punto de venta…
                  </span>
                ) : (
                  'Crear y continuar'
                )}
              </ACCESO__Button>
            </form>
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-6">
              Se creará el centro de trabajo, el PDV de caja (TPV-1) y la selección de tienda activa.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
