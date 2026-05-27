import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ChevronDown, Menu, X } from 'lucide-react';
import { VertialLogo } from './VertialLogo';
import { useModalClose } from '../hooks/useModalClose';

export function Header() {
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

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-white/95 backdrop-blur-lg shadow-sm border-b border-blue-100' : 'bg-white'}`}>
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <button
              onClick={() => { navigate('/'); setMobileMenuOpen(false); }}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <VertialLogo size="lg" />
            </button>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-6">
              <div className="relative">
                <button
                  onClick={() => setShowProductMenu(!showProductMenu)}
                  onMouseEnter={() => setShowProductMenu(true)}
                  className="flex items-center gap-1 text-slate-600 hover:text-blue-700 transition-colors py-2 font-medium"
                >
                  Producto
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showProductMenu ? 'rotate-180' : ''}`} />
                </button>
                {showProductMenu && (
                  <div
                    className="absolute top-full left-0 mt-1 w-52 bg-white border border-blue-100 rounded-xl shadow-lg shadow-blue-900/10 py-2"
                    onMouseLeave={() => setShowProductMenu(false)}
                  >
                    <button onClick={() => scrollToSection('verticales')} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 hover:text-blue-700 transition-colors text-slate-600 font-medium text-sm">
                      Verticales
                    </button>
                    <button onClick={() => scrollToSection('modulos')} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 hover:text-blue-700 transition-colors text-slate-600 font-medium text-sm">
                      Módulos
                    </button>
                    <button onClick={() => scrollToSection('integraciones')} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 hover:text-blue-700 transition-colors text-slate-600 font-medium text-sm">
                      Integraciones
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => scrollToSection('como-funciona')} className="text-slate-600 hover:text-blue-700 transition-colors font-medium">
                Cómo funciona
              </button>
              <button onClick={() => scrollToSection('planes')} className="text-slate-600 hover:text-blue-700 transition-colors font-medium">
                Planes
              </button>
              <button onClick={() => scrollToSection('faq')} className="text-slate-600 hover:text-blue-700 transition-colors font-medium">
                FAQ
              </button>
              <button onClick={() => scrollToSection('contacto')} className="text-slate-600 hover:text-blue-700 transition-colors font-medium">
                Contacto
              </button>
            </nav>

            {/* Desktop Actions */}
            <div className="hidden lg:flex items-center gap-3">
              <button
                onClick={() => navigate('/panel-afiliado')}
                className="text-slate-600 hover:text-violet-700 transition-colors font-medium"
              >
                Acceso afiliados
              </button>
              <button
                onClick={() => navigate('/auth/login')}
                className="text-slate-600 hover:text-blue-700 transition-colors font-medium"
              >
                Iniciar sesión
              </button>
              <button
                onClick={() => navigate('/auth/worker-login')}
                className="text-slate-600 hover:text-blue-700 transition-colors font-medium"
              >
                Soy trabajador
              </button>
              <button
                onClick={() => scrollToSection('planes')}
                className="px-4 py-2 border border-blue-200 text-blue-700 rounded-xl hover:bg-blue-50 transition-colors font-medium text-sm"
              >
                Ver planes
              </button>
              <button
                onClick={() => navigate('/auth/entry')}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm shadow-blue-600/30"
              >
                Empezar gratis
              </button>
            </div>

            {/* Mobile: CTA + Hamburger */}
            <div className="flex lg:hidden items-center gap-2">
              <button
                onClick={() => navigate('/auth/entry')}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                Empezar gratis
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                aria-label="Menú"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute top-[57px] left-0 right-0 bg-white border-b border-blue-100 shadow-xl px-6 py-6 space-y-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Producto</p>
            <button onClick={() => scrollToSection('verticales')} className="w-full text-left px-3 py-3 text-slate-700 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors font-medium">
              Verticales
            </button>
            <button onClick={() => scrollToSection('modulos')} className="w-full text-left px-3 py-3 text-slate-700 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors font-medium">
              Módulos
            </button>
            <button onClick={() => scrollToSection('integraciones')} className="w-full text-left px-3 py-3 text-slate-700 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors font-medium">
              Integraciones
            </button>
            <button onClick={() => scrollToSection('como-funciona')} className="w-full text-left px-3 py-3 text-slate-700 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors font-medium">
              Cómo funciona
            </button>
            <button onClick={() => scrollToSection('planes')} className="w-full text-left px-3 py-3 text-slate-700 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors font-medium">
              Planes
            </button>
            <button onClick={() => scrollToSection('faq')} className="w-full text-left px-3 py-3 text-slate-700 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors font-medium">
              FAQ
            </button>
            <button onClick={() => scrollToSection('contacto')} className="w-full text-left px-3 py-3 text-slate-700 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors font-medium">
              Contacto
            </button>
            <div className="pt-4 border-t border-blue-100 space-y-2">
              <button
                onClick={() => { navigate('/panel-afiliado'); setMobileMenuOpen(false); }}
                className="w-full px-4 py-3 border-2 border-violet-200 text-violet-700 rounded-xl hover:bg-violet-50 transition-colors font-semibold"
              >
                Acceso afiliados
              </button>
              <button
                onClick={() => { navigate('/auth/login'); setMobileMenuOpen(false); }}
                className="w-full px-4 py-3 border-2 border-blue-200 text-blue-700 rounded-xl hover:bg-blue-50 transition-colors font-semibold"
              >
                Iniciar sesión
              </button>
              <button
                onClick={() => { navigate('/auth/worker-login'); setMobileMenuOpen(false); }}
                className="w-full px-4 py-3 border-2 border-blue-200 text-blue-700 rounded-xl hover:bg-blue-50 transition-colors font-semibold"
              >
                Soy trabajador
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}