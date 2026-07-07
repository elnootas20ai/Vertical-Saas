import { useSearchParams } from 'react-router-dom';
import { Layout } from '../../../../components/saas/Layout';
import { FiscalCalculatorShell } from '../../../../components/saas/compraventa/fiscal/FiscalCalculatorShell';

export function CompraventaFiscalCalculatorPage() {
  const [params] = useSearchParams();
  const vehicleId = params.get('vehicleId');
  const acquisitionId = params.get('acquisitionId');

  return (
    <Layout title="Calculadora fiscal" subtitle="Compraventa" noPadding>
      <div className="px-3 pb-4 pt-3 md:px-4 md:pb-5 md:pt-4">
        <FiscalCalculatorShell
          initialVehicleId={vehicleId}
          initialAcquisitionId={acquisitionId}
        />
      </div>
    </Layout>
  );
}
