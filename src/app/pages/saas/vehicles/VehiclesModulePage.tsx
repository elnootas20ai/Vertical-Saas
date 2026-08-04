import { Layout } from '../../../components/saas/Layout';
import { VehicleVerticalGate } from '../../../components/saas/vehicles/VehicleVerticalGate';
import { VehiclesModuleShell } from '../../../components/saas/vehicles/VehiclesModuleShell';

export function VehiclesModulePage() {
  return (
    <VehicleVerticalGate>
      <Layout
        title="Vehículos"
        subtitle="Stock y fichas"
        noPadding
        titleClassName="vsaas-title text-2xl"
        subtitleClassName="vsaas-subtitle"
      >
        <div className="vsaas-page vsaas-page-mesh px-3 pb-4 pt-3 md:px-4 md:pb-5 md:pt-4">
          <div className="mb-3 vsaas-brand-bar" aria-hidden />
          <VehiclesModuleShell />
        </div>
      </Layout>
    </VehicleVerticalGate>
  );
}
