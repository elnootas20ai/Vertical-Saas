import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  BellOff,
  Mail,
  Smartphone,
  Monitor,
  MessageSquare,
  Calendar,
  Clock,
  ClipboardList,
  FileText,
  Users,
  AlertCircle,
  Save,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';

interface NotificationSetting {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  email: boolean;
  push: boolean;
  inApp: boolean;
}

export function WorkerNotifications() {
  const { t } = useTranslation();

  const [settings, setSettings] = useState<NotificationSetting[]>([
    { id: 'tasks', label: t('worker.notifications.taskAssigned'), description: t('worker.notifications.taskAssignedDesc'), icon: <ClipboardList className="w-5 h-5" />, email: true, push: true, inApp: true },
    { id: 'calendar', label: t('worker.notifications.calendarReminder'), description: t('worker.notifications.calendarReminderDesc'), icon: <Calendar className="w-5 h-5" />, email: false, push: true, inApp: true },
    { id: 'clock', label: t('worker.notifications.clockReminder'), description: t('worker.notifications.clockReminderDesc'), icon: <Clock className="w-5 h-5" />, email: false, push: true, inApp: true },
    { id: 'chat', label: t('worker.notifications.newMessage'), description: t('worker.notifications.newMessageDesc'), icon: <MessageSquare className="w-5 h-5" />, email: false, push: true, inApp: true },
    { id: 'docs', label: t('worker.notifications.newDocument'), description: t('worker.notifications.newDocumentDesc'), icon: <FileText className="w-5 h-5" />, email: true, push: false, inApp: true },
    { id: 'team', label: t('worker.notifications.teamUpdates'), description: t('worker.notifications.teamUpdatesDesc'), icon: <Users className="w-5 h-5" />, email: false, push: false, inApp: true },
    { id: 'payslip', label: t('worker.notifications.payslipReady'), description: t('worker.notifications.payslipReadyDesc'), icon: <FileText className="w-5 h-5" />, email: true, push: true, inApp: true },
    { id: 'urgent', label: t('worker.notifications.urgentNotice'), description: t('worker.notifications.urgentNoticeDesc'), icon: <AlertCircle className="w-5 h-5" />, email: true, push: true, inApp: true },
  ]);

  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('08:00');

  const toggleChannel = (id: string, channel: 'email' | 'push' | 'inApp') => {
    setSettings((prev) =>
      prev.map((s) => s.id === id ? { ...s, [channel]: !s[channel] } : s),
    );
  };

  return (
    <Layout title={t('worker.notifications.title')} subtitle={t('worker.notifications.subtitle')}>
      <div className="space-y-6">
        {/* Global Toggle */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {globalEnabled ? (
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                  <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
              ) : (
                <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center">
                  <BellOff className="w-5 h-5 text-gray-400" />
                </div>
              )}
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('worker.notifications.globalToggle')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('worker.notifications.globalToggleDesc')}</p>
              </div>
            </div>
            <button
              onClick={() => setGlobalEnabled(!globalEnabled)}
              className={`relative w-12 h-7 rounded-full transition-colors ${globalEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${globalEnabled ? 'translate-x-5.5 left-[2px]' : 'left-[2px]'}`}
                style={{ transform: globalEnabled ? 'translateX(22px)' : 'translateX(0)' }}
              />
            </button>
          </div>
        </div>

        {/* Quiet Hours */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('worker.notifications.quietHours')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('worker.notifications.quietHoursDesc')}</p>
            </div>
            <button
              onClick={() => setQuietHoursEnabled(!quietHoursEnabled)}
              className={`relative w-12 h-7 rounded-full transition-colors ${quietHoursEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <div className="absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform"
                style={{ transform: quietHoursEnabled ? 'translateX(22px)' : 'translateX(0)', left: '2px' }}
              />
            </button>
          </div>
          {quietHoursEnabled && (
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('worker.notifications.from')}</label>
                <input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)}
                  className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700" />
              </div>
              <span className="text-gray-400 mt-4">→</span>
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('worker.notifications.to')}</label>
                <input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)}
                  className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700" />
              </div>
            </div>
          )}
        </div>

        {/* Per-category Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="p-5 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('worker.notifications.byCategory')}</h3>
            <div className="flex items-center gap-6 mt-3 text-xs font-semibold text-gray-400">
              <span className="flex-1" />
              <span className="w-16 text-center flex items-center justify-center gap-1"><Mail className="w-3 h-3" /> Email</span>
              <span className="w-16 text-center flex items-center justify-center gap-1"><Smartphone className="w-3 h-3" /> Push</span>
              <span className="w-16 text-center flex items-center justify-center gap-1"><Monitor className="w-3 h-3" /> App</span>
            </div>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {settings.map((setting) => (
              <div key={setting.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400 shrink-0">
                  {setting.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{setting.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{setting.description}</p>
                </div>
                {(['email', 'push', 'inApp'] as const).map((channel) => (
                  <button
                    key={channel}
                    onClick={() => toggleChannel(setting.id, channel)}
                    className={`w-16 flex justify-center`}
                  >
                    <div className={`w-9 h-5 rounded-full transition-colors relative ${setting[channel] ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'}`}>
                      <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                        style={{ transform: setting[channel] ? 'translateX(18px)' : 'translateX(2px)' }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
            <Save className="w-4 h-4" />
            {t('common.saveChanges')}
          </button>
        </div>
      </div>
    </Layout>
  );
}
