import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { isVertialSuperAdminEmail } from '../../lib/superAdmin';
import { getUserByIdRequest, type AuthUser } from '../../lib/authApi';
import { EditClientModal } from './AdminPanel';

/**
 * Ficha completa de cliente SaaS (super-admin).
 * Secciones ordenadas: resumen → acciones → cupos → plan → datos.
 */
export function AdminClientDetail() {
  const { userId = '' } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
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
      const response = await getUserByIdRequest(id);
      const found = response.user || null;
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
  }, [userId]);

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
    <Layout title={title} subtitle={account?.email ? `${account.email} · Ficha admin` : 'Ficha admin'}>
      <div className="space-y-4 max-w-4xl mx-auto w-full">
        {loading && (
          <div className="flex items-center gap-2 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-8 text-sm text-stone-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Cargando cliente…
          </div>
        )}

        {!loading && error && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={backToList}
              className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a clientes
            </button>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
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
