import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { isVertialSuperAdminEmail } from '../../lib/superAdmin';
import type { AuthUser } from '../../lib/authApi';
import { EditClientModal } from './AdminPanel';

/**
 * Ficha completa de cliente SaaS (super-admin).
 * Mismo contenido que el antiguo popup, en página como CRM delivery.
 */
export function AdminClientDetail() {
  const { userId = '' } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user, listUsers } = useAuth();
  const [account, setAccount] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const backToList = useCallback(() => {
    navigate('/saas/admin?tab=clients');
  }, [navigate]);

  const loadAccount = useCallback(async () => {
    const id = String(userId || '').trim();
    if (!id) {
      setError('Falta el id del cliente');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const users = await listUsers();
      const found = users.find((u) => u.user_id === id) || null;
      if (!found) {
        setAccount(null);
        setError('No se encontró esta cuenta en el panel admin.');
      } else {
        setAccount(found);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el cliente');
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [listUsers, userId]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  if (!isVertialSuperAdminEmail(user?.email)) {
    return (
      <Layout title="Cliente SaaS" subtitle="Acceso restringido">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-sm text-amber-800">
          Este panel solo está disponible para la cuenta interna de plataforma (super-admin).
        </div>
      </Layout>
    );
  }

  const title = account?.companyName || account?.fullName || 'Cliente SaaS';

  return (
    <Layout title={title} subtitle={account?.email || 'Ficha admin · mismas herramientas que antes'}>
      <div className="space-y-4 max-w-4xl mx-auto w-full">
        {loading && (
          <div className="flex items-center gap-2 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-8 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Cargando cliente…
          </div>
        )}

        {!loading && error && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={backToList}
              className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a clientes
            </button>
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          </div>
        )}

        {!loading && account && (
          <EditClientModal
            layout="page"
            account={account}
            onClose={backToList}
            onSaved={(updated) => setAccount(updated)}
          />
        )}
      </div>
    </Layout>
  );
}
