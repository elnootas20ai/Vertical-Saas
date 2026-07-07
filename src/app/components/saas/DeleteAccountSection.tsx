import { useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { deleteUserRequest } from '../../lib/authApi';
import { AUTH_PATHS } from '../../lib/authEntryPaths';
import { IOS_PRIVACY_POLICY_URL } from '../../lib/appStoreCompliance';

const CONFIRM_WORD = 'ELIMINAR';

interface DeleteAccountSectionProps {
  compact?: boolean;
}

export function DeleteAccountSection({ compact = false }: DeleteAccountSectionProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (!user?.user_id) {
      setError('No hay sesión activa.');
      return;
    }
    if (confirmText.trim().toUpperCase() !== CONFIRM_WORD) {
      setError(`Escribe ${CONFIRM_WORD} para confirmar.`);
      return;
    }
    if (!window.confirm('Se eliminará tu cuenta de Vertial y perderás el acceso. ¿Continuar?')) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      await deleteUserRequest(user.user_id);
      await logout();
      navigate(AUTH_PATHS.entry);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la cuenta');
    } finally {
      setLoading(false);
    }
  };

  if (compact) {
    return (
      <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-700">
        <p className="text-sm font-medium text-red-600 dark:text-red-400">Eliminar mi cuenta</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Borra tu cuenta de Vertial de forma permanente desde la app.
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={`Escribe ${CONFIRM_WORD}`}
          className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700"
        />
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={loading || confirmText.trim().toUpperCase() !== CONFIRM_WORD}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          Eliminar mi cuenta
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-red-200 dark:border-red-900/50 p-6">
      <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-1">
        <Trash2 className="w-5 h-5 text-red-500" />
        Eliminar cuenta
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
        Borra tu cuenta de Vertial de forma permanente. Según tu rol, pueden conservarse datos legales o
        contables exigidos por normativa. Consulta la{' '}
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

      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
        Escribe <span className="font-mono text-red-600 dark:text-red-400">{CONFIRM_WORD}</span> para confirmar
      </label>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => {
          setConfirmText(e.target.value);
          if (error) setError('');
        }}
        autoComplete="off"
        className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white mb-4"
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleDelete()}
        disabled={loading || confirmText.trim().toUpperCase() !== CONFIRM_WORD}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        Eliminar mi cuenta permanentemente
      </button>

      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
        <ExternalLink className="w-3 h-3" />
        Requisito App Store: la eliminación se inicia desde la app, sin contactar por email.
      </p>
    </div>
  );
}
