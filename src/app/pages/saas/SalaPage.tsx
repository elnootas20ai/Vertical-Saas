import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SalaManager } from '../../components/saas/sala/manager/SalaManager';

function isSalaSetupPath(pathname: string): boolean {
  const path = String(pathname || '').trim();
  return path === '/saas/sala/setup' || path.endsWith('/sala/setup');
}

export function SalaPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const setupFromQuery = new URLSearchParams(location.search).get('setup') === '1';
  const setupMode = isSalaSetupPath(location.pathname) || setupFromQuery;

  useEffect(() => {
    if (setupFromQuery && !isSalaSetupPath(location.pathname)) {
      navigate('/saas/sala/setup', { replace: true });
    }
  }, [setupFromQuery, location.pathname, navigate]);

  return <SalaManager setupMode={setupMode} />;
}
