import React, { useEffect, useState } from 'react';
import { Bell, Search, Menu, HelpCircle, User, Sun, Moon, Globe, Check, Command, Store } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { useAuthOptional, type AuthContextType } from '../../context/AuthContext';
import { isWorkerAccount } from '../../lib/authApi';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { pointOfSaleDisplayLabel } from '../../lib/deliveryApi';
import { useAlertCenterBusinessId } from '../../hooks/useAlertCenterBusinessId';
import { useAlertCenterSummary } from '../../hooks/useAlertCenterSummary';
import { SAAS__NotificationsDrawer } from '../design-system/SAAS__NotificationsDrawer';
import { SAAS__ProfileModal } from '../design-system/SAAS__ProfileModal';
import { SAAS__HelpModal } from '../design-system/SAAS__HelpModal';

interface TopbarProps {
  title: string;
  /** Ya no se muestra en barra (pestañas estrechas); se mantiene por compatibilidad con Layout */
  subtitle?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  onToggleSidebar: () => void;
  onOpenGlobalSearch?: () => void;
}

export function Topbar({
  title,
  titleClassName,
  onToggleSidebar,
  onOpenGlobalSearch,
}: TopbarProps) {
  const auth = useAuthOptional();
  if (!auth?.user) return null;
  return (
    <TopbarInner
      auth={auth}
      title={title}
      titleClassName={titleClassName}
      onToggleSidebar={onToggleSidebar}
      onOpenGlobalSearch={onOpenGlobalSearch}
    />
  );
}

function TopbarInner({
  auth,
  title,
  titleClassName,
  onToggleSidebar,
  onOpenGlobalSearch,
}: TopbarProps & { auth: AuthContextType }) {
  const { notifications } = useApp();
  const { user } = auth;
  const isWorker = isWorkerAccount(user);
  const alertCenterBusinessId = useAlertCenterBusinessId();
  const { unresolved: alertCenterUnresolved, summary: alertSummary } = useAlertCenterSummary(
    !isWorker ? alertCenterBusinessId : undefined,
    { pollMs: 60_000 },
  );
  const { setTheme, resolvedTheme } = useTheme();
  const { i18n, t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === 'dark';

  const handleThemeToggle = () => {
    const root = document.documentElement;
    root.classList.add('theme-transitioning');
    setTheme(isDark ? 'light' : 'dark');
    window.setTimeout(() => root.classList.remove('theme-transitioning'), 350);
  };

  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLangDropdown, setShowLangDropdown] = useState(false);

  const LANGUAGES = [
    { code: 'es', label: 'Español', flag: '🇪🇸' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'pt', label: 'Português', flag: '🇵🇹' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  ] as const;
  const legacyUnread = notifications.filter((notification) => !notification.read).length;
  const unreadCount = isWorker ? legacyUnread : alertCenterUnresolved;
  const highAlertCount = alertSummary?.byPriority?.high ?? 0;
  const bellTone = unreadCount <= 0
    ? 'text-gray-600 dark:text-gray-300'
    : highAlertCount > 0
      ? 'text-red-600 dark:text-red-400'
      : 'text-amber-600 dark:text-amber-400';
  const badgeTone = highAlertCount > 0 ? 'bg-red-500' : 'bg-amber-500';

  const activeStore = useActiveStoreScope();
  const hasSavedStorePreference = Boolean(activeStore.activePreferenceRaw?.trim());
  const showStoreStrip =
    activeStore.pointsOfSale.length > 0 || hasSavedStorePreference;

  return (
    <>
      <header className="saas-topbar bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-3 md:px-5 pb-3 md:py-4 sticky top-0 z-30">
        <div className="flex items-center justify-between gap-2 md:gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            <button
              onClick={onToggleSidebar}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
              title="Toggle sidebar"
            >
              <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <h1
              className={`text-base md:text-xl font-semibold truncate min-w-0 ${
                titleClassName ?? 'text-gray-900 dark:text-gray-100'
              }`}
              title={title}
            >
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            {showStoreStrip && (
              <div
                className="flex items-center gap-1.5 min-w-0 max-w-[6.5rem] sm:max-w-[9rem] md:max-w-[12rem] mr-0.5 md:mr-1 border-r border-gray-200 dark:border-gray-700 pr-1.5 sm:pr-2 md:pr-3"
                title={
                  activeStore.displayLabelForActive ||
                  (activeStore.loading ? 'Cargando tienda…' : 'Tienda activa')
                }
              >
                <Store
                  className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0"
                  aria-hidden
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="hidden sm:block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 leading-none">
                    Tienda
                  </span>
                  {activeStore.pointsOfSale.length > 1 ? (
                    <>
                      <label className="sr-only" htmlFor="vertial-active-store-select">
                        Tienda activa
                      </label>
                      <select
                        id="vertial-active-store-select"
                        className="mt-1 w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 truncate"
                        value={
                          activeStore.activeSalesPointId &&
                          activeStore.pointsOfSale.some((p) => p._id === activeStore.activeSalesPointId)
                            ? activeStore.activeSalesPointId
                            : activeStore.pointsOfSale[0]?._id || ''
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v) activeStore.setActiveSalesPoint(v);
                        }}
                        title="Tienda / PDV activo"
                        disabled={activeStore.loading}
                      >
                        {activeStore.pointsOfSale.map((p) => (
                          <option key={p._id} value={p._id}>
                            {pointOfSaleDisplayLabel(p)}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <span
                      className="mt-1 text-xs font-semibold text-gray-900 dark:text-gray-100 truncate"
                      title={
                        activeStore.displayLabelForActive ||
                        (activeStore.loading ? 'Cargando…' : 'Tienda / PDV')
                      }
                    >
                      {activeStore.loading
                        ? '…'
                        : activeStore.displayLabelForActive ||
                          (activeStore.pointsOfSale.length === 1
                            ? pointOfSaleDisplayLabel(activeStore.pointsOfSale[0])
                            : '—')}
                    </span>
                  )}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onOpenGlobalSearch}
              className="hidden xl:flex items-center gap-2 pl-3 pr-2 py-2 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 transition-colors w-48 group"
            >
              <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <span className="flex-1 text-left text-sm text-gray-400 dark:text-gray-500 truncate">
                {t('topbar.search')}
              </span>
              <span className="flex items-center gap-0.5 flex-shrink-0">
                <kbd className="flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-[10px] font-mono text-gray-400 dark:text-gray-500">
                  <Command className="w-2.5 h-2.5" />K
                </kbd>
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenGlobalSearch}
              className="xl:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title={t('topbar.search')}
            >
              <Search className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>

            {mounted && (
              <div className="hidden lg:block relative">
                <button
                  onClick={() => setShowLangDropdown(v => !v)}
                  className="flex items-center gap-1 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  title="Cambiar idioma / Change language"
                >
                  <Globe className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">
                    {i18n.language.toUpperCase().slice(0, 2)}
                  </span>
                </button>
                {showLangDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg dark:shadow-gray-900/40 overflow-hidden z-50">
                    {LANGUAGES.map(lang => (
                      <button
                        key={lang.code}
                        onClick={() => { i18n.changeLanguage(lang.code); setShowLangDropdown(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${i18n.language === lang.code ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}
                      >
                        <span className="text-base leading-none">{lang.flag}</span>
                        <span className={`text-sm font-medium ${i18n.language === lang.code ? 'text-amber-700 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'}`}>
                          {lang.label}
                        </span>
                        {i18n.language === lang.code && (
                          <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {mounted && (
              <button
                onClick={handleThemeToggle}
                type="button"
                className="flex p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors shrink-0"
                title={isDark ? t('topbar.lightMode') : t('topbar.darkMode')}
                aria-label={isDark ? t('topbar.lightMode') : t('topbar.darkMode')}
              >
                {isDark ? (
                  <Sun className="w-5 h-5 text-amber-500" />
                ) : (
                  <Moon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                )}
              </button>
            )}

            <button
              onClick={() => setShowHelp(true)}
              className="hidden lg:flex p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title={t('topbar.help')}
            >
              <HelpCircle className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>

            <button
              type="button"
              onClick={() => setShowNotifications(true)}
              className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors touch-manipulation"
              title={isWorker ? t('topbar.notifications') : 'Centro de alertas'}
              aria-label={
                unreadCount > 0
                  ? `${unreadCount} alerta${unreadCount === 1 ? '' : 's'} pendiente${unreadCount === 1 ? '' : 's'}`
                  : (isWorker ? t('topbar.notifications') : 'Centro de alertas')
              }
            >
              <Bell className={`w-5 h-5 ${bellTone}`} />
              {unreadCount > 0 && (
                <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 ${badgeTone} rounded-full text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-white dark:ring-gray-900`}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowProfile(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title={t('topbar.profile')}
            >
              <User className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>
      </header>

      <SAAS__NotificationsDrawer
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
      />

      <SAAS__ProfileModal
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
      />

      <SAAS__HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
      />
    </>
  );
}
