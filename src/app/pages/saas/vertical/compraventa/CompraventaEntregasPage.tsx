import { Layout } from '../../../../components/saas/Layout';
import { EntregasModuleShell } from '../../../../components/saas/compraventa/entregas/EntregasModuleShell';

export function CompraventaEntregasPage() {
  return (
    <Layout title="Entregas" subtitle="Compraventa" noPadding>
      <div className="px-3 pb-4 pt-3 md:px-4 md:pb-5 md:pt-4">
        <EntregasModuleShell />
      </div>
    </Layout>
  );
}
