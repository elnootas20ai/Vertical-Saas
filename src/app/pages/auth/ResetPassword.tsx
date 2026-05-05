import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../components/design-system/ACCESO__Input';
import { VertialLogo } from '../../components/VertialLogo';
import { useAuth } from '../../context/AuthContext';

export function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { resetPassword } = useAuth();

  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';
  const { t } = useTranslation();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token || !email) {
      setError(t('auth.resetPassword.invalidLink'));
    }
  }, [token, email, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError(t('auth.resetPassword.errors.minLength'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('auth.resetPassword.errors.noMatch'));
      return;
    }

    setLoading(true);
    try {
      const result = await resetPassword(token, email, newPassword);
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error || t('auth.resetPassword.errors.failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-8 shadow-sm">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-6">
              <VertialLogo size="lg" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {t('auth.resetPassword.title')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {t('auth.resetPassword.subtitle')}
            </p>
          </div>

          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t('auth.resetPassword.successTitle')}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {t('auth.resetPassword.successDesc')}
              </p>
              <ACCESO__Button
                variant="primary"
                fullWidth
                onClick={() => navigate('/auth/login')}
              >
                {t('auth.resetPassword.backToLogin')}
              </ACCESO__Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {(!token || !email) ? (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">
                    {t('auth.resetPassword.invalidLink')}{' '}
                    <button
                      type="button"
                      className="underline font-medium"
                      onClick={() => navigate('/auth/recover')}
                    >
                      {t('auth.resetPassword.requestNew')}
                    </button>.
                  </p>
                </div>
              ) : (
                <>
                  {email && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3">
                      {t('auth.resetPassword.resettingFor')} <strong className="text-gray-700 dark:text-gray-300">{email}</strong>
                    </p>
                  )}

                  <ACCESO__Input
                    label={t('auth.resetPassword.newPassword')}
                    type="password"
                    placeholder={t('auth.resetPassword.newPasswordPlaceholder')}
                    icon={<Lock className="w-5 h-5" />}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />

                  <ACCESO__Input
                    label={t('auth.resetPassword.confirmPassword')}
                    type="password"
                    placeholder={t('auth.resetPassword.confirmPasswordPlaceholder')}
                    icon={<Lock className="w-5 h-5" />}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />

                  {error && (
                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  <ACCESO__Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    size="lg"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2 justify-center">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('auth.resetPassword.saving')}
                      </span>
                    ) : (
                      t('auth.resetPassword.submit')
                    )}
                  </ACCESO__Button>
                </>
              )}
            </form>
          )}
        </div>

        {!success && (
          <div className="mt-6 text-center">
            <ACCESO__Button
              variant="ghost"
              onClick={() => navigate('/auth/login')}
            >
              ← {t('auth.backToLogin')}
            </ACCESO__Button>
          </div>
        )}
      </div>
    </div>
  );
}
