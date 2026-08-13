import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Shield,
  Lock,
  Eye,
  EyeOff,
  Smartphone,
  Monitor,
  Clock,
  AlertTriangle,
  CheckCircle2,
  LogOut,
  Key,
  Fingerprint,
  Save,
  Download,
  Loader2,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { exportMyDataRequest } from '../../../lib/authApi';
import { IOS_PRIVACY_POLICY_URL } from '../../../lib/appStoreCompliance';

export function WorkerSecurity() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [downloadingData, setDownloadingData] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const handleDownloadMyData = async () => {
    setDownloadingData(true);
    setDownloadError('');
    setDownloadSuccess(false);
    try {
      await exportMyDataRequest();
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (err: unknown) {
      setDownloadError(err instanceof Error ? err.message : 'Error al descargar datos');
    } finally {
      setDownloadingData(false);
    }
  };

  const sessions = [
    { id: '1', device: 'Chrome - Windows', location: 'Madrid, España', lastActive: t('worker.security.now'), current: true },
    { id: '2', device: 'Safari - iPhone', location: 'Madrid, España', lastActive: t('worker.security.hoursAgo', { count: 2 }), current: false },
    { id: '3', device: 'Firefox - MacOS', location: 'Barcelona, España', lastActive: t('worker.security.daysAgo', { count: 5 }), current: false },
  ];

  const passwordStrength = (password: string) => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  };

  const strength = passwordStrength(newPassword);
  const strengthLabel = ['', t('worker.security.weak'), t('worker.security.fair'), t('worker.security.good'), t('worker.security.strong')];
  const strengthColor = ['', 'bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500'];

  return (
    <Layout title={t('worker.security.title')} subtitle={t('worker.security.subtitle')}>
      <div className="space-y-6">
        {/* Change Password */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Key className="w-4 h-4 text-blue-500" />
            {t('worker.security.changePassword')}
          </h3>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.security.currentPassword')}</label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.security.newPassword')}</label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {newPassword && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < strength ? strengthColor[strength] : 'bg-gray-200 dark:bg-gray-700'}`} />
                    ))}
                  </div>
                  <p className={`text-xs mt-1 ${strength >= 3 ? 'text-emerald-600' : strength >= 2 ? 'text-amber-600' : 'text-red-600'}`}>
                    {strengthLabel[strength]}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.security.confirmPassword')}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {t('worker.security.passwordMismatch')}
                </p>
              )}
              {confirmPassword && newPassword === confirmPassword && confirmPassword.length > 0 && (
                <p className="text-xs text-emerald-500 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {t('worker.security.passwordMatch')}
                </p>
              )}
            </div>

            <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
              <Save className="w-4 h-4" />
              {t('worker.security.updatePassword')}
            </button>
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${twoFactorEnabled ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                <Fingerprint className={`w-5 h-5 ${twoFactorEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('worker.security.twoFactor')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('worker.security.twoFactorDesc')}</p>
              </div>
            </div>
            <button
              onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}
              className={`relative w-12 h-7 rounded-full transition-colors ${twoFactorEnabled ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <div className="absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform"
                style={{ transform: twoFactorEnabled ? 'translateX(22px)' : 'translateX(0)', left: '2px' }}
              />
            </button>
          </div>
          {twoFactorEnabled && (
            <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <p className="text-sm text-emerald-700 dark:text-emerald-300">{t('worker.security.twoFactorActive')}</p>
            </div>
          )}
        </div>

        {/* Active Sessions */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-purple-500" />
              {t('worker.security.activeSessions')}
            </h3>
            <button className="text-xs text-red-600 hover:underline font-medium">
              {t('worker.security.closeAllSessions')}
            </button>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {sessions.map((session) => (
              <div key={session.id} className="flex items-center gap-4 px-5 py-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${session.current ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                  <Monitor className={`w-5 h-5 ${session.current ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{session.device}</p>
                    {session.current && (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full">
                        {t('worker.security.currentSession')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {session.location} · {session.lastActive}
                  </p>
                </div>
                {!session.current && (
                  <button className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                    <LogOut className="w-4 h-4 text-red-500" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Privacidad */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-500" />
            {t('worker.security.privacy')}
          </h3>
          <div className="space-y-3">
            <button
              onClick={() => void handleDownloadMyData()}
              disabled={downloadingData}
              className="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                {downloadingData ? (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 text-blue-500" />
                )}
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {downloadingData ? t('worker.security.downloadingData') : t('worker.security.downloadData')}
                </p>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 ml-6">{t('worker.security.downloadDataDesc')}</p>
            </button>
            {downloadSuccess && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <p className="text-xs text-emerald-700 dark:text-emerald-300">{t('worker.security.downloadDataSuccess')}</p>
              </div>
            )}
            {downloadError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-700 dark:text-red-300">{downloadError}</p>
              </div>
            )}
            <a
              href={IOS_PRIVACY_POLICY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400 px-3"
            >
              Política de privacidad
            </a>
          </div>
        </div>
      </div>
    </Layout>
  );
}
