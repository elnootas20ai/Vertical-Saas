import { Layout } from '../../components/saas/Layout';
import { EscandalloPanel } from '../../components/saas/EscandalloPanel';

export { EscandalloPanel };

export default function CostingPage() {
  return (
    <Layout title="Escandallo" subtitle="Cálculo de coste de producción y food cost por producto">
      <EscandalloPanel />
    </Layout>
  );
}
