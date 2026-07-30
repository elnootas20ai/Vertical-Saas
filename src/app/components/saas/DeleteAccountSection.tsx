import { useState } from 'react';
import { AlertTriangle, ExternalLink, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { deleteUserRequest } from '../../lib/authApi';
import { AUTH_PATHS } from '../../lib/authEntryPaths';
import { IOS_PRIVACY_POLICY_URL } from '../../lib/appStoreCompliance';
import { ConfirmDestroyModal } from './ConfirmDestroyModal';

const CONFIRM_WORD = 'ELIMINAR';

interface DeleteAccountSectionProps {
  compact?: boolean;
}

export function DeleteAccountSection({ compact = false }: DeleteAccountSectionProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (!user?.user_id) {
      setError('No hay sesión activa.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await deleteUserRequest(user.user_id);
      setModalOpen(false);
      await logout();
      navigate(AUTH_PATHS.entry);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la cuenta');
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => {
    setError('');
    setModalOpen(true);
  };

  const modal = (
    <ConfirmDestroyModal
      isOpen={modalOpen}
      onClose={() => {
        if (!loading) setModalOpen(false);
      }}
      onConfirm={handleDelete}
      title="Eliminar cuenta / Delete account"
      description="Se eliminará tu cuenta de Vertial de forma permanente y perderás el acceso. This permanently deletes your Vertial account and signs you out."
      itemName={CONFIRM_WORD}
      confirmLabel={`Escribe ${CONFIRM_WORD} / Type ${CONFIRM_WORD}`}
      destructiveLabel="Eliminar permanentemente"
      isDeleting={loading}
      caseInsensitive
    />
  );

  if (compact) {
    return (
      <div
        id="eliminar-cuenta"
        data-testid="delete-account-section"
        className="space-y-3 pt-2 border-t border-red-100 dark:border-red-900/40"
      >
        <p className="text-sm font-semibold text-red-600 dark:text-red-400">
          Eliminar cuenta / Delete account
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Borra tu cuenta de Vertial de forma permanente desde la app. Permanently delete your account in-app.
        </p>
        {error && (
          <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={openModal}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          Eliminar mi cuenta
        </button>
        {modal}
      </div>
    );
  }

  return (
    <div
      id="eliminar-cuenta"
      data-testid="delete-account-section"
      className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-red-300 dark:border-red-800 p-6 scroll-mt-24"
    >
      <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-1">
        <Trash2 className="w-5 h-5 text-red-500" />
        Eliminar cuenta / Delete account
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
        Borra tu cuenta de Vertial de forma permanente desde la app (requisito App Store). Según tu rol,
        pueden conservarse datos legales o contables exigidos por normativa. Consulta la{' '}
        <a
          href={IOS_PRIVACY_POLICY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline underline-offset-2"
        >
          política de privacidad
        </a>
        .
      </p>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={openModal}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
      >
        <Trash2 className="w-4 h-4" />
        Eliminar mi cuenta permanentemente
      </button>

      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
        <ExternalLink className="w-3 h-3" />
        No hace falta email ni teléfono: el borrado se completa aquí en la app.
      </p>

      {modal}
    </div>
  );
}
