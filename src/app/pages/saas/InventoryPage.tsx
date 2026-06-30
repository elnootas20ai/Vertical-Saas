import { Layout } from '../../components/saas/Layout';
import { InventoryPanel } from '../../components/saas/InventoryPanel';

export default function InventoryPage() {
  return (
    <Layout
      title="Inventario"
      subtitle="Artículos físicos de almacén · independiente del TPV y del escandallo"
    >
      <InventoryPanel />
    </Layout>
  );
}
