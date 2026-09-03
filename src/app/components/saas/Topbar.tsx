import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Bell, Search, Menu, HelpCircle, User, Sun, Moon, Globe, Check, Command, Store, ArrowLeft } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { useAuthOptional, type AuthContextType } from '../../context/AuthContext';
import { isWorkerAccount } from '../../lib/authApi';
import { canUseCeoAdminPanel } from '../../lib/teamManagerAccess';
import { useBusinessOptional } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { pointOfSaleDisplayLabel } from '../../lib/deliveryApi';
import { useAlertCenterBusinessId } from '../../hooks/useAlertCenterBusinessId';
import { useAlertCenterSummary } from '../../hooks/useAlertCenterSummary';
import { useDeliveryAlertsReviewPrompt } from '../../hooks/useDeliveryAlertsReviewPrompt';
import { SAAS__NotificationsDrawer } from '../design-system/SAAS__NotificationsDrawer';
import { SAAS__ProfileModal } from '../design-system/SAAS__ProfileModal';
import { SAAS__HelpModal } from '../design-system/SAAS__HelpModal';
import { NotificationLivePopup } from './NotificationLivePopup';
import {
  isDeliveryNestedPath,
  resolveSaasBackFallback,
  resolveSaasBackTarget,
  shouldShowSaasBack,
} from '../../lib/saasBackNavigation';

interface TopbarProps {
  title: string;
  /** Ya no se muestra en barra (pestañas estrechas); se mantiene por compatibilidad con Layout */
  subtitle?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  backTo?: string | false;
  onToggleSidebar: () => void;
  onOpenGlobalSearch?: () => void;
}

export function Topbar({
  title,
  titleClassName,
  backTo,
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
      backTo={backTo}
      onToggleSidebar={onToggleSidebar}
      onOpenGlobalSearch={onOpenGlobalSearch}
    />
  );
}

function TopbarInner({
  auth,
  title,
  titleClassName,
  backTo,
  onToggleSidebar,
  onOpenGlobalSearch,
}: TopbarProps & { auth: AuthContextType }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications } = useApp();
  const { user } = auth;
  const businessCtx = useBusinessOptional();
  const isWorker = isWorkerAccount(user);
  const usesCeoAlerts =
    !isWorker || canUseCeoAdminPanel(user, businessCtx?.businesses);
  const alertCenterBusinessId = useAlertCenterBusinessId();
  const { unresolved: alertCenterUnresolved, summary: alertSummary } = useAlertCenterSummary(
    usesCeoAlerts ? alertCenterBusinessId : undefined,
    { pollMs: 120_000 },
  );
  useDeliveryAlertsReviewPrompt({ sendNotif: usesCeoAlerts });
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
  // CEO + Admin invitado: alertas de negocio + mensajes personales.
  const unreadCount = usesCeoAlerts ? alertCenterUnresolved + legacyUnread : legacyUnread;
  const highAlertCount = alertSummary?.byPriority?.high ?? 0;
  const bellTone = unreadCount <= 0
    ? 'text-slate-600 dark:text-slate-300'
    : highAlertCount > 0 || legacyUnread > 0
      ? 'text-[var(--v-rose,#e11d48)]'
      : 'text-[var(--v-blue,#2563eb)]';
  const badgeTone =
    highAlertCount > 0 || legacyUnread > 0
      ? 'bg-[var(--v-rose,#e11d48)]'
      : 'bg-[var(--v-blue,#2563eb)]';

  const activeStore = useActiveStoreScope();
  const hasSavedStorePreference = Boolean(activeStore.activePreferenceRaw?.trim());
  const showStoreStrip =
    activeStore.pointsOfSale.length > 0 || hasSavedStorePreference;

  const showBack = shouldShowSaasBack(location.pathname, backTo);
  const backLabel = isDeliveryNestedPath(location.pathname)
    ? 'Volver a Operativa'
    : 'Atrás';
  const handleBack = () => {
    const target = resolveSaasBackTarget(location.pathname, backTo);
    if (!target) return;
    if (target !== 'history') {
      navigate(target);
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(resolveSaasBackFallback(location.pathname));
  };

  return (
    <>
      <header className="saas-topbar vsaas-topbar-shell px-3 md:px-5 pb-3 md:py-3.5 sticky top-0 z-30">
        <div className="flex items-center justify-between gap-2 md:gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            {showBack ? (
              <button
                type="button"
                onClick={handleBack}
                className="vsaas-icon-btn flex-shrink-0"
                aria-label={backLabel}
                title={backLabel}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onToggleSidebar}
              className={`vsaas-icon-btn flex-shrink-0 ${showBack ? 'hidden md:inline-flex' : ''}`}
              title="Menú"
              aria-label="Menú"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1
              className={`text-base md:text-xl truncate min-w-0 tracking-tight ${
                titleClassName ?? 'vsaas-title'
              }`}
              title={title}
            >
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-1 md:gap-1.5 flex-shrink-0">
            {showStoreStrip && (
              <div
                className="flex items-center gap-1.5 min-w-0 max-w-[6.5rem] sm:max-w-[9rem] md:max-w-[12rem] mr-0.5 md:mr-1 border-r border-slate-200 dark:border-slate-700 pr-1.5 sm:pr-2 md:pr-3"
                title={
                  activeStore.displayLabelForActive ||
                  (activeStore.loading ? 'Cargando tienda…' : 'Tienda activa')
                }
              >
                <Store
                  className="w-4 h-4 text-[var(--v-blue,#2563eb)] shrink-0"
                  aria-hidden
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="hidden sm:block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 leading-none">
                    Tienda
                  </span>
                  {activeStore.pointsOfSale.length > 1 ? (
                    <>
                      <label className="sr-only" htmlFor="vertial-active-store-select">
                        Tienda activa
                      </label>
                      <select
                        id="vertial-active-store-select"
                        className="mt-1 w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 truncate focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
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
                      className="mt-1 text-xs font-semibold text-slate-900 dark:text-slate-100 truncate"
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
              className="hidden xl:flex items-center gap-2 pl-3 pr-2 py-2 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/40 transition-colors w-48 group"
            >
              <Search className="w-4 h-4 text-slate-400 flex-shrink-0 group-hover:text-[var(--v-blue,#2563eb)]" />
              <span className="flex-1 text-left text-sm text-slate-400 truncate">
                {t('topbar.search')}
              </span>
              <span className="flex items-center gap-0.5 flex-shrink-0">
                <kbd className="flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-[10px] font-mono text-slate-400">
                  <Command className="w-2.5 h-2.5" />K
                </kbd>
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenGlobalSearch}
              className="xl:hidden vsaas-icon-btn"
              title={t('topbar.search')}
            >
              <Search className="w-5 h-5" />
            </button>

            {mounted && (
              <div className="hidden lg:block relative">
                <button
                  onClick={() => setShowLangDropdown(v => !v)}
                  className="vsaas-icon-btn gap-1"
                  title="Cambiar idioma / Change language"
                >
                  <Globe className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase">
                    {i18n.language.toUpperCase().slice(0, 2)}
                  </span>
                </button>
                {showLangDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-50">
                    {LANGUAGES.map(lang => (
                      <button
                        key={lang.code}
                        onClick={() => { i18n.changeLanguage(lang.code); setShowLangDropdown(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors ${i18n.language === lang.code ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                      >
                        <span className="text-base leading-none">{lang.flag}</span>
                        <span className={`text-sm font-medium ${i18n.language === lang.code ? 'text-[var(--v-blue,#2563eb)]' : 'text-slate-700 dark:text-slate-300'}`}>
                          {lang.label}
                        </span>
                        {i18n.language === lang.code && (
                          <Check className="w-3.5 h-3.5 text-[var(--v-blue,#2563eb)] ml-auto" />
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
                className="vsaas-icon-btn shrink-0"
                title={isDark ? t('topbar.lightMode') : t('topbar.darkMode')}
                aria-label={isDark ? t('topbar.lightMode') : t('topbar.darkMode')}
              >
                {isDark ? (
                  <Sun className="w-5 h-5 text-[var(--v-amber,#d97706)]" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </button>
            )}

            <button
              onClick={() => setShowHelp(true)}
              className="hidden lg:flex vsaas-icon-btn"
              title={t('topbar.help')}
            >
              <HelpCircle className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => setShowNotifications(true)}
              className="relative vsaas-icon-btn touch-manipulation"
              title={t('topbar.notifications')}
              aria-label={
                unreadCount > 0
                  ? `${unreadCount} notificación${unreadCount === 1 ? '' : 'es'} pendiente${unreadCount === 1 ? '' : 's'}`
                  : t('topbar.notifications')
              }
            >
              <Bell className={`w-5 h-5 ${bellTone}`} />
              {unreadCount > 0 && (
                <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 ${badgeTone} rounded-full text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-900`}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowProfile(true)}
              className="vsaas-icon-btn"
              title={t('topbar.profile')}
            >
              <User className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <NotificationLivePopup onOpenInbox={() => setShowNotifications(true)} />

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
