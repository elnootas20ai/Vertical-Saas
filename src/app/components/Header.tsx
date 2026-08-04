import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Menu, X } from 'lucide-react';
import { VertialLogo } from './VertialLogo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useModalClose } from '../hooks/useModalClose';
import { AUTH_PATHS } from '../lib/authEntryPaths';

interface HeaderProps {
  /** Header transparente sobre hero oscuro de la landing */
  landingDark?: boolean;
}

export function Header({ landingDark = false }: HeaderProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [showProductMenu, setShowProductMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useModalClose(mobileMenuOpen, () => setMobileMenuOpen(false));

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  const scrollToSection = (id: string) => {
    setShowProductMenu(false);
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
  };

  const onDarkHero = landingDark && !isScrolled;
  const navLink = onDarkHero
    ? 'text-zinc-300 hover:text-white'
    : 'text-slate-600 hover:text-[var(--v-blue,#2563eb)]';
  const headerShell = onDarkHero
    ? 'bg-transparent border-b border-transparent'
    : isScrolled
      ? landingDark
        ? 'bg-zinc-950/90 backdrop-blur-xl shadow-lg shadow-black/20 border-b border-zinc-800'
        : 'bg-white/95 backdrop-blur-lg shadow-sm border-b border-blue-100'
      : landingDark
        ? 'bg-transparent border-b border-transparent'
        : 'bg-white';

  const productLinks = [
    ['verticales', t('landing.nav.verticals')],
    ['modulos', t('landing.nav.modules')],
    ['integraciones', t('landing.nav.integrations')],
  ] as const;

  const mainLinks = [
    ['como-funciona', t('landing.nav.howItWorks')],
    ['planes', t('landing.nav.plans')],
    ['faq', t('landing.nav.faq')],
    ['contacto', t('landing.nav.contact')],
  ] as const;

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${headerShell}`}>
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => { navigate('/'); setMobileMenuOpen(false); }}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <VertialLogo size="lg" />
            </button>

            <nav className="hidden lg:flex items-center gap-6">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowProductMenu(!showProductMenu)}
                  onMouseEnter={() => setShowProductMenu(true)}
                  className={`flex items-center gap-1 transition-colors py-2 font-medium ${navLink}`}
                >
                  {t('landing.nav.product')}
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showProductMenu ? 'rotate-180' : ''}`} />
                </button>
                {showProductMenu && (
                  <div
                    className={`absolute top-full left-0 mt-1 w-52 rounded-xl shadow-lg py-2 ${
                      onDarkHero
                        ? 'bg-zinc-900 border border-zinc-700 shadow-black/40'
                        : 'bg-white border border-blue-100 shadow-blue-900/10'
                    }`}
                    onMouseLeave={() => setShowProductMenu(false)}
                  >
                    {productLinks.map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => scrollToSection(id)}
                        className={`w-full text-left px-4 py-2.5 font-medium text-sm transition-colors ${
                          onDarkHero ? 'text-zinc-300 hover:bg-zinc-800 hover:text-white' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {mainLinks.map(([id, label]) => (
                <button key={id} type="button" onClick={() => scrollToSection(id)} className={`transition-colors font-medium ${navLink}`}>
                  {label}
                </button>
              ))}
            </nav>

            <div className="hidden lg:flex items-center gap-2">
              <LanguageSwitcher onDark={onDarkHero} />
              <button
                type="button"
                onClick={() => navigate(AUTH_PATHS.entry)}
                className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                  onDarkHero
                    ? 'vertial-glow-btn text-white shadow-lg shadow-blue-900/30 hover:opacity-95'
                    : 'bg-[var(--v-blue,#2563eb)] text-white hover:bg-[#1d4ed8] shadow-sm shadow-blue-600/30'
                }`}
              >
                {t('landing.nav.startFree')}
              </button>
            </div>

            <div className="flex lg:hidden items-center gap-1.5">
              <LanguageSwitcher onDark={onDarkHero || landingDark} />
              <button
                type="button"
                onClick={() => navigate(AUTH_PATHS.entry)}
                className="px-3 py-2 vertial-glow-btn text-white rounded-lg font-semibold text-sm"
              >
                {t('landing.nav.start')}
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className={`p-2 rounded-lg transition-colors ${onDarkHero ? 'text-zinc-300 hover:text-white hover:bg-white/10' : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50'}`}
                aria-label={t('landing.nav.menu')}
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className={`absolute top-[57px] left-0 right-0 border-b shadow-xl px-6 py-6 space-y-1 ${
            landingDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-blue-100'
          }`}>
            <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${landingDark ? 'text-zinc-500' : 'text-slate-400'}`}>
              {t('landing.nav.product')}
            </p>
            {[...productLinks, ...mainLinks].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollToSection(id)}
                className={`w-full text-left px-3 py-3 rounded-lg transition-colors font-medium ${
                  landingDark ? 'text-zinc-300 hover:text-white hover:bg-zinc-900' : 'text-slate-700 hover:text-blue-700 hover:bg-blue-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
