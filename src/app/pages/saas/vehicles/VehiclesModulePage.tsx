import { Layout } from '../../../components/saas/Layout';
import { VehicleVerticalGate } from '../../../components/saas/vehicles/VehicleVerticalGate';
import { VehiclesModuleShell } from '../../../components/saas/vehicles/VehiclesModuleShell';

export function VehiclesModulePage() {
  return (
    <VehicleVerticalGate>
      <Layout title="Vehículos" subtitle="Stock y fichas" noPadding>
        <div className="px-3 pb-4 pt-3 md:px-4 md:pb-5 md:pt-4">
          <VehiclesModuleShell />
        </div>
      </Layout>
    </VehicleVerticalGate>
  );
}
