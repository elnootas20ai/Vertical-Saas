import { Layout } from '../../../../components/saas/Layout';
import { VentasModuleShell } from '../../../../components/saas/compraventa/ventas/VentasModuleShell';

export function CompraventaVentasPage() {
  return (
    <Layout title="Ventas" subtitle="Compraventa" noPadding>
      <div className="px-3 pb-4 pt-3 md:px-4 md:pb-5 md:pt-4">
        <VentasModuleShell />
      </div>
    </Layout>
  );
}
