import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { deleteUserRequest } from '../../lib/authApi';
import { AUTH_PATHS } from '../../lib/authEntryPaths';
import { ConfirmDestroyModal } from './ConfirmDestroyModal';

const CONFIRM_WORD = 'ELIMINAR';

interface DeleteAccountSectionProps {
  compact?: boolean;
}

export function DeleteAccountSection({ compact = false }: DeleteAccountSectionProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (!user?.user_id) {
      setError(t('worker.security.deleteAccountNoSession'));
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
      setError(err instanceof Error ? err.message : t('worker.security.deleteAccountError'));
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
      title={t('worker.security.deleteAccount')}
      description={t('worker.security.deleteAccountConfirmDesc')}
      itemName={CONFIRM_WORD}
      confirmLabel={t('worker.security.deleteAccountTypeConfirm', { word: CONFIRM_WORD })}
      destructiveLabel={t('worker.security.deleteAccountPermanent')}
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
          {t('worker.security.deleteAccountButton')}
        </button>
        {modal}
      </div>
    );
  }

  return (
    <div
      id="eliminar-cuenta"
      data-testid="delete-account-section"
      className="bg-white dark:bg-gray-800 rounded-2xl border border-red-200 dark:border-red-900/50 p-6 scroll-mt-24"
    >
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
        {t('worker.security.deleteAccountButton')}
      </button>

      {modal}
    </div>
  );
}
