import { useParams, useNavigate } from 'react-router';
import { useState, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { TpvProvider } from '../../context/TpvContext';
import { TpvModePage } from './TpvModePage';
import { DealershipCatalogPage } from './DealershipCatalogPage';
import { EventsWorkstationPage } from './EventsWorkstationPage';
import { HairSalonWorkstationPage } from './HairSalonWorkstationPage';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
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

  useEffect(() => {
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
  }, [user?.id, salesPointId]);

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

  if (isEvents) {
    return (
      <EventsWorkstationPage
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
