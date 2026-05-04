import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Info } from 'lucide-react';
import { UdarLogo } from './UdarLogo';

export function Footer() {
  const navigate = useNavigate();
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);
  const [modalFeature, setModalFeature] = useState('');

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  const handleClick = (section: string) => {
    setModalFeature(section);
    setShowComingSoonModal(true);
  };

  return (
    <>
      <footer className="bg-blue-950 text-blue-200">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            {/* Brand */}
            <div>
              <div className="mb-4">
                <UdarLogo size="lg" />
              </div>
              <p className="text-blue-300 mb-4 text-sm leading-relaxed">
                Software de gestión para negocios profesionales. Compraventa, taller y delivery en una sola plataforma.
              </p>
              <p className="text-xs text-blue-400 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-blue-400 rounded-full inline-block" />
                Hecho en España · Datos en Europa
              </p>
            </div>

            {/* Producto */}
            <div>
              <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Producto</h3>
              <ul className="space-y-3">
                <li>
                  <button
                    onClick={() => scrollToSection('verticales')}
                    className="text-blue-300 hover:text-white transition-colors text-sm"
                  >
                    Verticales
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection('modulos')}
                    className="text-blue-300 hover:text-white transition-colors text-sm"
                  >
                    Módulos
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection('integraciones')}
                    className="text-blue-300 hover:text-white transition-colors text-sm"
                  >
                    Integraciones
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection('planes')}
                    className="text-blue-300 hover:text-white transition-colors text-sm"
                  >
                    Precios
                  </button>
                </li>
              </ul>
            </div>

            {/* Recursos */}
            <div>
              <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Recursos</h3>
              <ul className="space-y-3">
                <li>
                  <button
                    onClick={() => handleClick('Documentación')}
                    className="text-blue-300 hover:text-white transition-colors text-sm"
                  >
                    Documentación
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection('faq')}
                    className="text-blue-300 hover:text-white transition-colors text-sm"
                  >
                    Preguntas frecuentes
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleClick('API')}
                    className="text-blue-300 hover:text-white transition-colors text-sm"
                  >
                    API para desarrolladores
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection('como-funciona')}
                    className="text-blue-300 hover:text-white transition-colors text-sm"
                  >
                    Cómo funciona
                  </button>
                </li>
              </ul>
            </div>

            {/* Empresa */}
            <div>
              <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Empresa</h3>
              <ul className="space-y-3">
                <li>
                  <button
                    onClick={() => handleClick('Sobre nosotros')}
                    className="text-blue-300 hover:text-white transition-colors text-sm"
                  >
                    Sobre nosotros
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection('contacto')}
                    className="text-blue-300 hover:text-white transition-colors text-sm"
                  >
                    Contacto
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleClick('Soporte')}
                    className="text-blue-300 hover:text-white transition-colors text-sm"
                  >
                    Soporte
                  </button>
                </li>
              </ul>

              <div className="mt-6 p-4 bg-blue-900/50 rounded-xl border border-blue-800">
                <p className="text-xs text-blue-300 mb-2">¿Dudas? Llámanos</p>
                <a href="tel:+34647779812" className="text-white font-semibold text-sm hover:text-blue-200 transition-colors">
                  +34 647 77 98 12
                </a>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-blue-900 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-blue-400">
              © 2026 Vertial. Todos los derechos reservados.
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
              <button
                onClick={() => handleClick('Política de privacidad')}
                className="text-blue-400 hover:text-white transition-colors"
              >
                Privacidad
              </button>
              <button
                onClick={() => handleClick('Términos de servicio')}
                className="text-blue-400 hover:text-white transition-colors"
              >
                Términos
              </button>
              <button
                onClick={() => handleClick('Política de cookies')}
                className="text-blue-400 hover:text-white transition-colors"
              >
                Cookies
              </button>
              <button
                onClick={() => navigate('/legal')}
                className="text-blue-400 hover:text-white transition-colors"
              >
                Legal
              </button>
              <span className="text-blue-800">|</span>
              <button
                onClick={() => navigate('/navigation-map')}
                className="text-amber-400 hover:text-amber-300 transition-colors font-medium"
              >
                📍 Mapa
              </button>
              <button
                onClick={() => navigate('/qa')}
                className="text-green-400 hover:text-green-300 transition-colors font-medium"
              >
                ✅ QA
              </button>
            </div>
          </div>
        </div>
      </footer>

      <Dialog open={showComingSoonModal} onOpenChange={setShowComingSoonModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
              <Info className="h-8 w-8 text-blue-600" />
            </div>
            <DialogTitle className="text-center">Próximamente</DialogTitle>
            <DialogDescription className="text-center">
              {modalFeature} estará disponible muy pronto. Estamos trabajando para ofrecerte la mejor experiencia.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setShowComingSoonModal(false)} className="w-full sm:w-auto">
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}