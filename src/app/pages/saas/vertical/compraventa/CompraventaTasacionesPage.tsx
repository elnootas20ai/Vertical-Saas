import { Layout } from '../../../../components/saas/Layout';
import { TasacionesModuleShell } from '../../../../components/saas/compraventa/tasaciones/TasacionesModuleShell';

export function CompraventaTasacionesPage() {
  return (
    <Layout title="Tasaciones" subtitle="Compraventa" noPadding>
      <div className="px-3 pb-4 pt-3 md:px-4 md:pb-5 md:pt-4">
        <TasacionesModuleShell />
      </div>
    </Layout>
  );
}
