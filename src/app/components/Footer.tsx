import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Info, PhoneCall } from 'lucide-react';
import { VertialLogo } from './VertialLogo';

interface FooterProps {
  landingDark?: boolean;
}

export function Footer({ landingDark = false }: FooterProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
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
    ? 'text-zinc-500 hover:text-blue-300 transition-colors text-sm'
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
                {t('landing.footer.blurb')}
              </p>
              <p className={`text-xs flex items-center gap-1.5 ${muted}`}>
                <span className={`w-2 h-2 rounded-full inline-block ${landingDark ? 'bg-blue-400' : 'bg-blue-400'}`} />
                {t('landing.footer.madeIn')}
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">{t('landing.footer.product')}</h3>
              <ul className="space-y-3">
                {[
                  ['verticales', t('landing.footer.verticals')],
                  ['modulos', t('landing.footer.modules')],
                  ['integraciones', t('landing.footer.integrations')],
                  ['planes', t('landing.footer.prices')],
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
              <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">{t('landing.footer.resources')}</h3>
              <ul className="space-y-3">
                <li><button type="button" onClick={() => handleClick(t('landing.footer.docs'))} className={link}>{t('landing.footer.docs')}</button></li>
                <li><button type="button" onClick={() => scrollToSection('faq')} className={link}>{t('landing.footer.faq')}</button></li>
                <li><button type="button" onClick={() => handleClick(t('landing.footer.api'))} className={link}>{t('landing.footer.api')}</button></li>
                <li><button type="button" onClick={() => scrollToSection('como-funciona')} className={link}>{t('landing.footer.howItWorks')}</button></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">{t('landing.footer.company')}</h3>
              <ul className="space-y-3">
                <li><button type="button" onClick={() => handleClick(t('landing.footer.about'))} className={link}>{t('landing.footer.about')}</button></li>
                <li><button type="button" onClick={() => scrollToSection('contacto')} className={link}>{t('landing.footer.contact')}</button></li>
                <li><button type="button" onClick={() => navigate('/affiliados')} className={link}>{t('landing.footer.affiliates')}</button></li>
              </ul>

              <div className={`mt-6 ${callBox}`}>
                <p className={`text-xs mb-2 flex items-center gap-1.5 ${landingDark ? 'text-zinc-500' : 'text-blue-300'}`}>
                  <PhoneCall className="w-3.5 h-3.5" />
                  {t('landing.footer.callUs')}
                </p>
                <a
                  href="tel:+34647779812"
                  className={`font-semibold text-sm transition-colors ${landingDark ? 'text-white hover:text-blue-300' : 'text-white hover:text-blue-200'}`}
                >
                  +34 647 77 98 12
                </a>
              </div>
            </div>
          </div>

          <div className={`pt-8 border-t ${border} flex flex-col md:flex-row items-center justify-between gap-4`}>
            <div className={`text-sm ${muted}`}>
              {t('landing.footer.rights')}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
              {[
                [t('landing.footer.privacy'), () => handleClick(t('landing.footer.privacy'))],
                [t('landing.footer.terms'), () => handleClick(t('landing.footer.terms'))],
                [t('landing.footer.cookies'), () => handleClick(t('landing.footer.cookies'))],
                ['Legal', () => navigate('/legal')],
              ].map(([label, action]) => (
                <button key={String(label)} type="button" onClick={action as () => void} className={`${muted} hover:text-white transition-colors`}>
                  {label as string}
                </button>
              ))}
            </div>
          </div>
        </div>
      </footer>

      <Dialog open={showComingSoonModal} onOpenChange={setShowComingSoonModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10">
              <Info className="h-8 w-8 text-[var(--v-blue,#2563eb)]" />
            </div>
            <DialogTitle className="text-center">{t('landing.footer.comingSoon')}</DialogTitle>
            <DialogDescription className="text-center">
              {t('landing.footer.comingSoonDesc', { feature: modalFeature })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setShowComingSoonModal(false)} className="w-full sm:w-auto">
              {t('landing.footer.understood')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
