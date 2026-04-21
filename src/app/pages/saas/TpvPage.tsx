import { useLocation } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { TpvTab } from './TpvTab';

export function TpvPage() {
  const { user } = useAuth();
  const location = useLocation();
  const isLocales = location.pathname.includes('/tpv/locales');

  return (
    <Layout
      title={isLocales ? 'Locales' : 'TPV'}
      subtitle={isLocales ? 'Plano de mesas y zonas' : 'Terminal punto de venta'}
    >
      <TpvTab
        userName={user?.fullName || 'Usuario'}
        userId={user?.user_id || ''}
        view={isLocales ? 'locales' : 'tpv'}
      />
    </Layout>
  );
}
