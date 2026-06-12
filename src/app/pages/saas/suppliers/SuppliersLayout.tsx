import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout } from '../../../components/saas/Layout';
import { Tabs } from '../../../components/saas/Tabs';
import {
  suppliersHubPathForTab,
  suppliersHubTabFromPath,
  type SuppliersHubTab,
} from '../../../lib/suppliersHubPaths';

const HUB_TABS: { id: SuppliersHubTab; label: string }[] = [
  { id: 'directorio', label: 'Directorio' },
  { id: 'ordenes', label: 'Órdenes de compra' },
  { id: 'facturas', label: 'Facturas' },
];

export function SuppliersLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = suppliersHubTabFromPath(location.pathname);

  return (
    <Layout
      title="Proveedores"
      subtitle="Directorio, órdenes de compra y facturas recibidas"
    >
      <Tabs
        tabs={HUB_TABS}
        activeTab={activeTab}
        onChange={(tabId) => navigate(suppliersHubPathForTab(tabId as SuppliersHubTab))}
      />
      <div className="mt-6">
        <Outlet />
      </div>
    </Layout>
  );
}
