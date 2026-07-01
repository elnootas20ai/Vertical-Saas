import { useLayoutEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBusinessOptional } from '../../../context/BusinessContext';
import { AuthRouteLoading } from '../../../components/AuthRouteLoading';
import {
  findVehicleInventoryBusiness,
  getVerticalHomePath,
  supportsVehicleInventoryModule,
} from '../../../lib/vehicleVertical';

type VehicleVerticalGateProps = {
  children: React.ReactNode;
};

/**
 * En F5 o enlace directo a /saas/vehicles con una empresa delivery (p. ej. modomio)
 * activa en caché, cambia a la primera compraventa/taller del titular o redirige al home vertical.
 */
export function VehicleVerticalGate({ children }: VehicleVerticalGateProps) {
  const navigate = useNavigate();
  const businessCtx = useBusinessOptional();
  const currentBusiness = businessCtx?.currentBusiness ?? null;
  const businesses = businessCtx?.businesses ?? [];
  const settled = businessCtx?.businessesFetchSettled ?? false;
  const switchBusiness = businessCtx?.switchBusiness;

  const vehicleBusiness = useMemo(() => findVehicleInventoryBusiness(businesses), [businesses]);
  const currentSupports = supportsVehicleInventoryModule(currentBusiness?.businessType);

  const [pendingSwitch, setPendingSwitch] = useState(false);

  useLayoutEffect(() => {
    if (!settled) return;
    if (currentSupports) {
      setPendingSwitch(false);
      return;
    }
    if (vehicleBusiness && switchBusiness) {
      setPendingSwitch(true);
      switchBusiness(vehicleBusiness.business_id);
      return;
    }
    navigate(getVerticalHomePath(currentBusiness?.businessType), { replace: true });
  }, [
    settled,
    currentSupports,
    vehicleBusiness?.business_id,
    switchBusiness,
    navigate,
    currentBusiness?.businessType,
  ]);

  useLayoutEffect(() => {
    if (currentSupports) setPendingSwitch(false);
  }, [currentSupports, currentBusiness?.business_id]);

  if (!settled || pendingSwitch || !currentSupports) {
    const label = pendingSwitch
      ? 'Abriendo inventario de compraventa…'
      : settled
        ? 'Redirigiendo…'
        : 'Cargando vehículos…';
    return <AuthRouteLoading label={label} />;
  }

  return <>{children}</>;
}
