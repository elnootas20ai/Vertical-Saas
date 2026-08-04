import { useEffect, useRef, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { I18N_LANG_STORAGE_KEY, WEB_LANGUAGES } from '../lib/landingI18n';

type Props = {
  /** Estilo sobre hero oscuro de la landing */
  onDark?: boolean;
  className?: string;
};

export function LanguageSwitcher({ onDark = false, className = '' }: Props) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = (i18n.language || 'es').slice(0, 2);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const setLang = (code: string) => {
    void i18n.changeLanguage(code);
    try {
      localStorage.setItem(I18N_LANG_STORAGE_KEY, code);
    } catch {
      /* noop */
    }
    setOpen(false);
  };

  const btn = onDark
    ? 'text-zinc-300 hover:text-white hover:bg-white/10 border border-white/10'
    : 'text-slate-600 hover:text-[var(--v-blue,#2563eb)] hover:bg-blue-50 border border-slate-200';

  const menu = onDark
    ? 'bg-zinc-900 border border-zinc-700 shadow-black/40'
    : 'bg-white border border-slate-200 shadow-lg';

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-semibold transition-colors ${btn}`}
        title="Cambiar idioma / Change language"
        aria-label="Cambiar idioma"
        aria-expanded={open}
      >
        <Globe className="h-4 w-4" />
        <span className="uppercase tabular-nums">{current}</span>
      </button>
      {open && (
        <div className={`absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl py-1 ${menu}`}>
          {WEB_LANGUAGES.map((lang) => {
            const active = current === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => setLang(lang.code)}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                  onDark
                    ? active
                      ? 'bg-blue-500/15 text-blue-200'
                      : 'text-zinc-300 hover:bg-zinc-800'
                    : active
                      ? 'bg-blue-50 text-[var(--v-blue,#2563eb)]'
                      : 'text-slate-700 hover:bg-blue-50/80'
                }`}
              >
                <span className="text-base leading-none">{lang.flag}</span>
                <span className="flex-1 text-sm font-medium">{lang.label}</span>
                {active ? <Check className="h-3.5 w-3.5" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
