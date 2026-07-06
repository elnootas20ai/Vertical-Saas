import { useRef, useState } from 'react';
import { FileSignature, Loader2, ShieldCheck } from 'lucide-react';
import {
  AFFILIATE_AGREEMENT,
  AFFILIATE_AGREEMENT_VERSION,
} from '../../content/legal/affiliateAgreement';
import { VERTIAL_LEGAL_ENTITY } from '../../content/legal/vertialLegal';

interface AffiliateContractGateProps {
  affiliateName: string;
  loading: boolean;
  error?: string;
  onAccept: () => void;
}

export function AffiliateContractGate({
  affiliateName,
  loading,
  error,
  onAccept,
}: AffiliateContractGateProps) {
  const [accepted, setAccepted] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    if (atBottom) setScrolledToEnd(true);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-blue-950 text-white">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <FileSignature className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-200/80">Paso obligatorio</p>
              <h1 className="text-xl font-black mt-1">{AFFILIATE_AGREEMENT.title}</h1>
              <p className="text-sm text-blue-100/80 mt-1">
                Hola, {affiliateName}. Debes aceptar este contrato para acceder al panel de afiliado.
              </p>
            </div>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="max-h-[50vh] overflow-y-auto px-6 py-5 space-y-6"
        >
          <p className="text-sm text-slate-600 leading-relaxed">{AFFILIATE_AGREEMENT.subtitle}</p>
          <p className="text-xs text-slate-400">Versión {AFFILIATE_AGREEMENT_VERSION} · {AFFILIATE_AGREEMENT.lastUpdated}</p>

          {AFFILIATE_AGREEMENT.sections.map((section) => (
            <section key={section.id}>
              <h2 className="text-base font-bold text-slate-900">{section.title}</h2>
              {section.paragraphs?.map((p, i) => (
                <p key={i} className="mt-2 text-sm leading-relaxed text-slate-700">{p}</p>
              ))}
              {section.bullets && (
                <ul className="mt-2 list-disc pl-5 space-y-1.5 text-sm text-slate-700">
                  {section.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <p className="text-xs text-slate-500 border-t border-slate-100 pt-4">
            Contratante: {VERTIAL_LEGAL_ENTITY.name} · {VERTIAL_LEGAL_ENTITY.nif}
          </p>
        </div>

        <div className="px-6 py-5 border-t border-slate-200 bg-slate-50 space-y-4">
          {!scrolledToEnd && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Desplázate hasta el final del contrato para habilitar la firma.
            </p>
          )}

          <label className={`flex items-start gap-3 ${!scrolledToEnd ? 'opacity-50' : ''}`}>
            <input
              type="checkbox"
              checked={accepted}
              disabled={!scrolledToEnd}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1 rounded border-slate-300"
            />
            <span className="text-sm text-slate-700 leading-relaxed">
              He leído y acepto el <strong>Contrato del Programa de Afiliados Vertial</strong> (v.
              {AFFILIATE_AGREEMENT_VERSION}). Entiendo las condiciones de comisiones, obligaciones legales
              y que Vertial registrará esta aceptación con fecha e identificadores de sesión.
            </span>
          </label>

          {error && (
            <p className="text-sm text-red-600 font-medium">{error}</p>
          )}

          <button
            type="button"
            disabled={!accepted || !scrolledToEnd || loading}
            onClick={onAccept}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            {loading ? 'Registrando firma…' : 'Firmar y continuar al panel'}
          </button>
        </div>
      </div>
    </div>
  );
}
