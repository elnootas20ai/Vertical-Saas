import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ChevronDown, Menu, X } from 'lucide-react';
import { VertialLogo } from './VertialLogo';
import { useModalClose } from '../hooks/useModalClose';
import { AUTH_PATHS } from '../lib/authEntryPaths';

interface HeaderProps {
  /** Header transparente sobre hero oscuro de la landing */
  landingDark?: boolean;
}

export function Header({ landingDark = false }: HeaderProps) {
  const navigate = useNavigate();
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
    : 'text-slate-600 hover:text-emerald-600';
  const headerShell = onDarkHero
    ? 'bg-transparent border-b border-transparent'
    : isScrolled
      ? landingDark
        ? 'bg-zinc-950/90 backdrop-blur-xl shadow-lg shadow-black/20 border-b border-zinc-800'
        : 'bg-white/95 backdrop-blur-lg shadow-sm border-b border-blue-100'
      : landingDark
        ? 'bg-transparent border-b border-transparent'
        : 'bg-white';

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${headerShell}`}>
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => { navigate('/'); setMobileMenuOpen(false); }}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <VertialLogo size="lg" />
            </button>

            <nav className="hidden lg:flex items-center gap-6">
              <div className="relative">
                <button
                  onClick={() => setShowProductMenu(!showProductMenu)}
                  onMouseEnter={() => setShowProductMenu(true)}
                  className={`flex items-center gap-1 transition-colors py-2 font-medium ${navLink}`}
                >
                  Producto
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
                    {['verticales', 'modulos', 'integraciones'].map((id) => (
                      <button
                        key={id}
                        onClick={() => scrollToSection(id)}
                        className={`w-full text-left px-4 py-2.5 font-medium text-sm capitalize transition-colors ${
                          onDarkHero ? 'text-zinc-300 hover:bg-zinc-800 hover:text-white' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                        }`}
                      >
                        {id === 'modulos' ? 'Módulos' : id === 'integraciones' ? 'Integraciones' : 'Verticales'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {[
                ['como-funciona', 'Cómo funciona'],
                ['planes', 'Planes'],
                ['faq', 'FAQ'],
                ['contacto', 'Contacto'],
              ].map(([id, label]) => (
                <button key={id} onClick={() => scrollToSection(id)} className={`transition-colors font-medium ${navLink}`}>
                  {label}
                </button>
              ))}
            </nav>

            <div className="hidden lg:flex items-center gap-3">
              <button
                onClick={() => navigate(AUTH_PATHS.entry)}
                className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                  onDarkHero
                    ? 'vertial-glow-btn text-white shadow-lg shadow-emerald-900/30 hover:opacity-95'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm shadow-emerald-600/30'
                }`}
              >
                Empezar gratis
              </button>
            </div>

            <div className="flex lg:hidden items-center gap-2">
              <button
                onClick={() => navigate(AUTH_PATHS.entry)}
                className="px-3 py-2 vertial-glow-btn text-white rounded-lg font-semibold text-sm"
              >
                Empezar
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className={`p-2 rounded-lg transition-colors ${onDarkHero ? 'text-zinc-300 hover:text-white hover:bg-white/10' : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50'}`}
                aria-label="Menú"
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
            <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${landingDark ? 'text-zinc-500' : 'text-slate-400'}`}>Producto</p>
            {[
              ['verticales', 'Verticales'],
              ['modulos', 'Módulos'],
              ['integraciones', 'Integraciones'],
              ['como-funciona', 'Cómo funciona'],
              ['planes', 'Planes'],
              ['faq', 'FAQ'],
              ['contacto', 'Contacto'],
            ].map(([id, label]) => (
              <button
                key={id}
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