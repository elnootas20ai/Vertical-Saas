import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { TpvProvider } from '../../context/TpvContext';
import { TpvModePage } from './TpvModePage';
import { DealershipCatalogPage } from './DealershipCatalogPage';
import { HairSalonWorkstationPage } from './HairSalonWorkstationPage';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { writeDeliveryOpsSelectedPdvId } from '../../lib/deliveryOpsPdvSelection';
import { listSalesPoints, type SalesPoint } from '../../lib/salesPointsApi';
import { Store, Loader2 } from 'lucide-react';

export function SalesPointTpvPage() {
  const { salesPointId } = useParams<{ salesPointId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const [salesPoint, setSalesPoint] = useState<SalesPoint | null>(null);
  const [loading, setLoading] = useState(true);

  const businessType = currentBusiness?.businessType;
  const isCarDealership = businessType === 'carDealership';
  const isEvents = businessType === 'events';
  const isHairSalon = businessType === 'hairSalon';
  const isDelivery = businessType === 'delivery';

  useEffect(() => {
    if (!isDelivery || !salesPointId || !user) return;
    const bid = String(currentBusiness?.business_id || currentBusiness?.id || '');
    const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
    if (bid && dataUserId) writeDeliveryOpsSelectedPdvId(bid, dataUserId, `wc:${salesPointId}`);
    navigate('/saas/delivery-ops', { replace: true });
  }, [isDelivery, salesPointId, user, currentBusiness, navigate]);

  useEffect(() => {
    if (isDelivery || isEvents) {
      setLoading(false);
      return;
    }
    if (!user?.id || !salesPointId) {
      setLoading(false);
      return;
    }
    listSalesPoints(user.id)
      .then((sps) => {
        const found = sps.find((sp) => sp._id === salesPointId || sp.id === salesPointId);
        setSalesPoint(found || null);
      })
      .catch(() => setSalesPoint(null))
      .finally(() => setLoading(false));
  }, [user?.id, salesPointId, isDelivery, isEvents]);

  if (isEvents) {
    return <Navigate to="/saas/vertical/eventos" replace />;
  }

  if (isDelivery && salesPointId) {
    return (
      <Layout title="Delivery" subtitle="Cambiando de tienda…">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout title="TPV" subtitle="Cargando punto de venta...">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  if (!salesPoint) {
    return (
      <Layout title="TPV" subtitle="Punto de venta no encontrado">
        <div className="flex flex-col items-center justify-center py-32 text-gray-500 dark:text-gray-400">
          <Store className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-lg font-semibold">Punto de venta no encontrado</p>
          <p className="text-sm mt-1">El punto de venta solicitado no existe o fue eliminado.</p>
        </div>
      </Layout>
    );
  }

  if (isCarDealership) {
    return (
      <DealershipCatalogPage
        salesPoint={salesPoint}
        onBack={() => navigate(-1)}
      />
    );
  }

  if (isHairSalon) {
    return (
      <HairSalonWorkstationPage
        salesPoint={salesPoint}
        onBack={() => navigate(-1)}
      />
    );
  }

  return (
    <TpvProvider>
      <TpvModePage salesPoint={salesPoint} />
    </TpvProvider>
  );
}
