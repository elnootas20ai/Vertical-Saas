import React, { useEffect, useState } from 'react';
import { Bell, Search, Menu, HelpCircle, User, Sun, Moon, Globe, Check, Command } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { SAAS__NotificationsDrawer } from '../design-system/SAAS__NotificationsDrawer';
import { SAAS__ProfileModal } from '../design-system/SAAS__ProfileModal';
import { SAAS__HelpModal } from '../design-system/SAAS__HelpModal';

interface TopbarProps {
  title: string;
  subtitle?: string;
  /** Sustituye el color por defecto del título (ej. marca por pantalla) */
  titleClassName?: string;
  /** Sustituye el color por defecto del subtítulo */
  subtitleClassName?: string;
  onToggleSidebar: () => void;
  onOpenGlobalSearch?: () => void;
}

export function Topbar({
  title,
  subtitle,
  titleClassName,
  subtitleClassName,
  onToggleSidebar,
  onOpenGlobalSearch,
}: TopbarProps) {
  const { notifications } = useApp();
  const { user } = useAuth();
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
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <>
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-3 md:px-5 py-3 md:py-4 sticky top-0 z-30">
        <div className="flex items-center justify-between gap-3">
          {/* Left: Hamburger + Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onToggleSidebar}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
              title="Toggle sidebar"
            >
              <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <div className="min-w-0">
              <h1
                className={`text-lg md:text-2xl font-semibold truncate leading-tight ${
                  titleClassName ?? 'text-gray-900 dark:text-gray-100'
                }`}
              >
                {title}
              </h1>
              {subtitle && (
                <p
                  className={`text-xs md:text-sm truncate hidden sm:block ${
                    subtitleClassName ?? 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            {/* Search trigger — desktop only */}
            <button
              type="button"
              onClick={onOpenGlobalSearch}
              className="hidden md:flex items-center gap-2 pl-3 pr-2 py-2 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 transition-colors w-56 group"
            >
              <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <span className="flex-1 text-left text-sm text-gray-400 dark:text-gray-500">
                {t('topbar.search')}
              </span>
              <span className="flex items-center gap-0.5 flex-shrink-0">
                <kbd className="flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-[10px] font-mono text-gray-400 dark:text-gray-500">
                  <Command className="w-2.5 h-2.5" />K
                </kbd>
              </span>
            </button>

            {/* Language selector */}
            {mounted && (
              <div className="hidden md:block relative">
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

            {/* Dark mode toggle */}
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

            {/* Help — desktop only */}
            <button
              onClick={() => setShowHelp(true)}
              className="hidden md:flex p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title={t('topbar.help')}
            >
              <HelpCircle className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>

            {/* Notifications */}
            <button
              onClick={() => setShowNotifications(true)}
              className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title={t('topbar.notifications')}
            >
              <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Profile */}
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

      {/* Modals and Drawers */}
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
