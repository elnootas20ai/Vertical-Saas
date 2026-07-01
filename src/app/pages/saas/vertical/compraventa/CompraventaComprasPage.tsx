import { Layout } from '../../../../components/saas/Layout';
import { ComprasModuleShell } from '../../../../components/saas/compraventa/compras/ComprasModuleShell';

export function CompraventaComprasPage() {
  return (
    <Layout title="Compras" subtitle="Compraventa" noPadding>
      <div className="px-3 pb-4 pt-3 md:px-4 md:pb-5 md:pt-4">
        <ComprasModuleShell />
      </div>
    </Layout>
  );
}
