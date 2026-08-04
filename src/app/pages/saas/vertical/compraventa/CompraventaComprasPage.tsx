import { Layout } from '../../../../components/saas/Layout';
import { ComprasModuleShell } from '../../../../components/saas/compraventa/compras/ComprasModuleShell';

export function CompraventaComprasPage() {
  return (
    <Layout
      title="Compras"
      subtitle="Compraventa"
      noPadding
      titleClassName="vsaas-title text-2xl"
      subtitleClassName="vsaas-subtitle"
    >
      <div className="vsaas-page vsaas-page-mesh px-3 pb-4 pt-3 md:px-4 md:pb-5 md:pt-4">
        <div className="mb-3 vsaas-brand-bar" aria-hidden />
        <ComprasModuleShell />
      </div>
    </Layout>
  );
}
