import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Info, PhoneCall } from 'lucide-react';
import { VertialLogo } from './VertialLogo';

interface FooterProps {
  landingDark?: boolean;
}

export function Footer({ landingDark = false }: FooterProps) {
  const navigate = useNavigate();
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);
  const [modalFeature, setModalFeature] = useState('');

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
  };

  const handleClick = (section: string) => {
    setModalFeature(section);
    setShowComingSoonModal(true);
  };

  const link = landingDark
    ? 'text-zinc-500 hover:text-emerald-400 transition-colors text-sm'
    : 'text-blue-300 hover:text-white transition-colors text-sm';

  const muted = landingDark ? 'text-zinc-600' : 'text-blue-400';
  const border = landingDark ? 'border-zinc-800' : 'border-blue-900';
  const callBox = landingDark
    ? 'p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm'
    : 'p-4 bg-blue-900/50 rounded-xl border border-blue-800';

  return (
    <>
      <footer className={landingDark ? 'bg-zinc-950 text-zinc-400 border-t border-zinc-800 relative' : 'bg-blue-950 text-blue-200'}>
        {landingDark && <div className="absolute top-0 left-0 right-0 vertial-section-divider" />}
        <div className="max-w-7xl mx-auto px-6 py-16 relative">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div>
              <div className="mb-4">
                <VertialLogo size="lg" />
              </div>
              <p className={`mb-4 text-sm leading-relaxed ${landingDark ? 'text-zinc-500' : 'text-blue-300'}`}>
                Vertial — software de gestión para negocios profesionales. Compraventa, taller y delivery en una sola plataforma.
              </p>
              <p className={`text-xs flex items-center gap-1.5 ${muted}`}>
                <span className={`w-2 h-2 rounded-full inline-block ${landingDark ? 'bg-emerald-500' : 'bg-blue-400'}`} />
                Hecho en España · Datos en Europa
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Producto</h3>
              <ul className="space-y-3">
                {[
                  ['verticales', 'Verticales'],
                  ['modulos', 'Módulos'],
                  ['integraciones', 'Integraciones'],
                  ['planes', 'Precios'],
                ].map(([id, label]) => (
                  <li key={id}>
                    <button type="button" onClick={() => scrollToSection(id)} className={link}>
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Recursos</h3>
              <ul className="space-y-3">
                <li><button type="button" onClick={() => handleClick('Documentación')} className={link}>Documentación</button></li>
                <li><button type="button" onClick={() => scrollToSection('faq')} className={link}>Preguntas frecuentes</button></li>
                <li><button type="button" onClick={() => handleClick('API')} className={link}>API para desarrolladores</button></li>
                <li><button type="button" onClick={() => scrollToSection('como-funciona')} className={link}>Cómo funciona</button></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Empresa</h3>
              <ul className="space-y-3">
                <li><button type="button" onClick={() => handleClick('Sobre nosotros')} className={link}>Sobre nosotros</button></li>
                <li><button type="button" onClick={() => scrollToSection('contacto')} className={link}>Contacto</button></li>
                <li><button type="button" onClick={() => navigate('/affiliados')} className={link}>Afiliados</button></li>
              </ul>

              <div className={`mt-6 ${callBox}`}>
                <p className={`text-xs mb-2 flex items-center gap-1.5 ${landingDark ? 'text-zinc-500' : 'text-blue-300'}`}>
                  <PhoneCall className="w-3.5 h-3.5" />
                  ¿Dudas? Llámanos
                </p>
                <a
                  href="tel:+34647779812"
                  className={`font-semibold text-sm transition-colors ${landingDark ? 'text-white hover:text-emerald-400' : 'text-white hover:text-blue-200'}`}
                >
                  +34 647 77 98 12
                </a>
              </div>
            </div>
          </div>

          <div className={`pt-8 border-t ${border} flex flex-col md:flex-row items-center justify-between gap-4`}>
            <div className={`text-sm ${muted}`}>
              © 2026 Vertial. Todos los derechos reservados.
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
              {[
                ['Política de privacidad', () => handleClick('Política de privacidad')],
                ['Términos de servicio', () => handleClick('Términos de servicio')],
                ['Cookies', () => handleClick('Política de cookies')],
                ['Legal', () => navigate('/legal')],
              ].map(([label, action]) => (
                <button key={label} type="button" onClick={action} className={`${muted} hover:text-white transition-colors`}>
                  {label}
                </button>
              ))}
              {!landingDark && (
                <>
                  <span className="text-blue-800">|</span>
                  <button type="button" onClick={() => navigate('/navigation-map')} className="text-amber-400 hover:text-amber-300 transition-colors font-medium">
                    📍 Mapa
                  </button>
                  <button type="button" onClick={() => navigate('/qa')} className="text-green-400 hover:text-green-300 transition-colors font-medium">
                    ✅ QA
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </footer>

      <Dialog open={showComingSoonModal} onOpenChange={setShowComingSoonModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
              <Info className="h-8 w-8 text-emerald-500" />
            </div>
            <DialogTitle className="text-center">Próximamente</DialogTitle>
            <DialogDescription className="text-center">
              {modalFeature} estará disponible muy pronto en Vertial.
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
