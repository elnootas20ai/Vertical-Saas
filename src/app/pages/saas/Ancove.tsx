import { useState, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useBusiness } from '../../context/BusinessContext';
import {
  Shield, CheckCircle, FileText, ExternalLink,
  Award, Users, Megaphone, BarChart2,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ANCOVE_CONSENT_KEY = 'ancove_terms_accepted';

function getConsentStorageKey(businessId?: string): string {
  return `${ANCOVE_CONSENT_KEY}:${businessId || 'default'}`;
}

function hasAcceptedTerms(businessId?: string): boolean {
  try {
    return localStorage.getItem(getConsentStorageKey(businessId)) === 'true';
  } catch {
    return false;
  }
}

function saveTermsAcceptance(businessId?: string): void {
  try {
    localStorage.setItem(getConsentStorageKey(businessId), 'true');
  } catch { /* noop */ }
}

// ─── Terms acceptance screen ──────────────────────────────────────────────────

function AncoveTerms({ onAccept }: { onAccept: () => void }) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header banner */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-700 rounded-2xl p-8 text-white text-center">
        <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Award className="w-7 h-7 text-amber-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">ANCOVE</h2>
        <p className="text-sm text-gray-300 leading-relaxed max-w-md mx-auto">
          Asociación Nacional de Comerciantes de Vehículos de Ocasión y Empresas vinculadas
        </p>
      </div>

      {/* Benefits preview */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-4">
          Al aceptar podrás acceder a
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: <Shield className="w-4 h-4 text-blue-600" />, bg: 'bg-blue-50', label: 'Prestigio y representatividad sectorial' },
            { icon: <Users className="w-4 h-4 text-violet-600" />, bg: 'bg-violet-50', label: 'Participación activa en cuestiones del sector' },
            { icon: <Megaphone className="w-4 h-4 text-amber-600" />, bg: 'bg-amber-50', label: 'Información continua y comunicados' },
            { icon: <BarChart2 className="w-4 h-4 text-emerald-600" />, bg: 'bg-emerald-50', label: 'Estadísticas mensuales de ventas' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
              <div className={`w-8 h-8 ${item.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                {item.icon}
              </div>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Terms and conditions */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Términos y condiciones</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-64 overflow-y-auto text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          <p>
            Al aceptar estos términos, usted consiente recibir ofertas comerciales, comunicados informativos
            y contenido promocional de ANCOVE (Asociación Nacional de Comerciantes de Vehículos) a través
            de los canales de comunicación disponibles en la plataforma.
          </p>
          <p>
            La información compartida incluye, pero no se limita a: comunicados oficiales del sector,
            estadísticas de mercado, ventajas de afiliación, información sobre eventos y ferias del sector,
            y ofertas de servicios exclusivos para profesionales de la compraventa de vehículos.
          </p>
          <p>
            Sus datos serán tratados conforme a la normativa vigente de protección de datos (RGPD) y la
            Ley Orgánica de Protección de Datos y Garantía de Derechos Digitales (LOPDGDD). Puede revocar
            su consentimiento en cualquier momento desde la configuración de su empresa.
          </p>
          <p>
            ANCOVE se compromete a utilizar sus datos exclusivamente para los fines descritos y no los
            compartirá con terceros sin su consentimiento expreso. Para más información sobre la política
            de privacidad, puede consultar la web oficial de ANCOVE.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-5 h-5 rounded-md border-2 border-gray-300 dark:border-gray-600 peer-checked:border-amber-500 peer-checked:bg-amber-500 transition-all flex items-center justify-center group-hover:border-gray-400">
                {checked && <CheckCircle className="w-3.5 h-3.5 text-white" />}
              </div>
            </div>
            <span className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              He leído y acepto los términos y condiciones para recibir ofertas comerciales e información
              sectorial de ANCOVE. Entiendo que puedo revocar mi consentimiento en cualquier momento.
            </span>
          </label>
        </div>
      </div>

      {/* Action */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onAccept}
          disabled={!checked}
          className={`flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold transition-all ${
            checked
              ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          Aceptar y acceder a ANCOVE
        </button>
      </div>

      {/* Link to ANCOVE website */}
      <div className="text-center">
        <a
          href="https://www.ancove.es"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Visitar la web oficial de ANCOVE
        </a>
      </div>
    </div>
  );
}

// ─── Iframe view (post-acceptance) ────────────────────────────────────────────

function AncoveIframe() {
  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className="flex items-center gap-3 px-5 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl">
        <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Has aceptado recibir ofertas comerciales de ANCOVE
          </p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
            Puedes revocar tu consentimiento en cualquier momento desde la configuración de tu empresa.
          </p>
        </div>
        <a
          href="https://www.ancove.es/afiliacion/ventajas"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-300 rounded-lg hover:bg-emerald-100 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Abrir en nueva pestaña
        </a>
      </div>

      {/* Iframe container */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <iframe
          src="https://www.ancove.es/afiliacion/ventajas"
          title="ANCOVE — Ventajas de la afiliación"
          className="w-full border-0"
          style={{ height: 'calc(100vh - 260px)', minHeight: '600px' }}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN — Ancove page
// ═══════════════════════════════════════════════════════════

export function Ancove() {
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id;

  const [accepted, setAccepted] = useState(() => hasAcceptedTerms(businessId));

  const handleAccept = useCallback(() => {
    saveTermsAcceptance(businessId);
    setAccepted(true);
  }, [businessId]);

  return (
    <Layout
      title="ANCOVE"
      subtitle={accepted
        ? 'Ventajas de la afiliación — ofertas comerciales'
        : 'Aceptar términos para recibir ofertas comerciales'
      }
    >
      {accepted ? <AncoveIframe /> : <AncoveTerms onAccept={handleAccept} />}
    </Layout>
  );
}