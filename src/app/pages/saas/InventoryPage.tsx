import { Navigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { InventoryPanel } from '../../components/saas/InventoryPanel';
import { useBusiness } from '../../context/BusinessContext';
import { restaurantWarehouseViaExcelOnly } from '../../verticals/restaurant/restaurantWarehousePolicy';

export default function InventoryPage() {
  const { currentBusiness } = useBusiness();
  if (restaurantWarehouseViaExcelOnly(currentBusiness?.businessType)) {
    return <Navigate to="/saas/catalog?tab=catalog" replace />;
  }

  return (
    <Layout
      title="Inventario"
      subtitle="Artículos físicos de almacén · independiente del TPV y del escandallo"
    >
      <InventoryPanel />
    </Layout>
  );
}
