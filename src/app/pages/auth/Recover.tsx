import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Mail, CheckCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../components/design-system/ACCESO__Input';
import { UdarLogo } from '../../components/UdarLogo';
import { useAuth } from '../../context/AuthContext';

export function Recover() {
  const navigate = useNavigate();
  const { recoverPassword } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await recoverPassword(email);
      if (result.success) {
        setSent(true);
      } else {
        setError(result.error || t('auth.recover.error'));
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
              <UdarLogo size="lg" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {t('auth.recover.title')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {t('auth.recover.subtitle')}
            </p>
          </div>

          {!sent ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <ACCESO__Input
                label={t('auth.email')}
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                icon={<Mail className="w-5 h-5" />}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  {error}
                </p>
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
                    {t('auth.recover.sending')}
                  </span>
                ) : (
                  t('auth.recover.sendLink')
                )}
              </ACCESO__Button>
            </form>
          ) : (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t('auth.recover.successTitle')}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {t('auth.recover.successDesc', { email })}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {t('auth.recover.successSpam')}
              </p>
              <ACCESO__Button
                variant="outline"
                onClick={() => navigate('/auth/login')}
              >
                {t('auth.backToLogin')}
              </ACCESO__Button>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <ACCESO__Button
            variant="ghost"
            onClick={() => navigate('/auth/login')}
          >
            ← {t('auth.backToLogin')}
          </ACCESO__Button>
        </div>
      </div>
    </div>
  );
}
