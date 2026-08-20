import { Outlet } from 'react-router-dom';
import { Layout } from '../../../components/saas/Layout';

/** Solo directorio. Pedidos y facturas están en Catálogo → Compras. */
export function SuppliersLayout() {
  return (
    <Layout
      title="Proveedores"
      subtitle="Directorio de proveedores"
    >
      <Outlet />
    </Layout>
  );
}
