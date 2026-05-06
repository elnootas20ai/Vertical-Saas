import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle, Car, User, Phone, Mail, MessageSquare, Send, AlertCircle } from 'lucide-react';
import { getApiBase } from '../../lib/apiBase';

interface DealerInfo {
  name: string;
  logo: string | null;
}

function captureUtmParams(searchParams: URLSearchParams) {
  return {
    utm_source: searchParams.get('utm_source') || searchParams.get('source') || '',
    utm_medium: searchParams.get('utm_medium') || searchParams.get('medium') || '',
    utm_campaign: searchParams.get('utm_campaign') || searchParams.get('campaign') || '',
    utm_content: searchParams.get('utm_content') || '',
    utm_term: searchParams.get('utm_term') || '',
    referrer: typeof document !== 'undefined' ? document.referrer : '',
    landing_page: typeof window !== 'undefined' ? window.location.href : '',
  };
}

export function EmbedLeadForm() {
  const { dealerId } = useParams<{ dealerId: string }>();
  const [searchParams] = useSearchParams();
  const accentColor = searchParams.get('color') || '#6d28d9';

  const utmParams = captureUtmParams(searchParams);

  const [dealer, setDealer] = useState<DealerInfo | null>(null);
  const [loadingDealer, setLoadingDealer] = useState(true);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    vehicleInterest: '',
    budget: '',
    notes: '',
    consent: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (!dealerId) return;
    fetch(`${getApiBase()}/api/embed/${encodeURIComponent(dealerId)}/info`, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setDealer(data.dealer);
      })
      .catch(() => {})
      .finally(() => setLoadingDealer(false));
  }, [dealerId]);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'El nombre es obligatorio';
    if (!form.phone.trim()) e.phone = 'El teléfono es obligatorio';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Email no válido';
    if (!form.consent) e.consent = 'Debes aceptar la política de privacidad';
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError('');
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBase()}/api/embed/${encodeURIComponent(dealerId!)}/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          vehicleInterest: form.vehicleInterest.trim(),
          budget: form.budget.trim(),
          notes: form.notes.trim(),
          consent: form.consent,
          ...utmParams,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al enviar');
      setSubmitted(true);
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingDealer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Solicitud enviada!</h2>
          <p className="text-gray-500">
            Hemos recibido tu información. Un asesor de{' '}
            <span className="font-semibold text-gray-700">{dealer?.name || 'nuestro equipo'}</span>{' '}
            se pondrá en contacto contigo pronto.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
        <div
          className="px-8 py-6 text-white"
          style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)` }}
        >
          {dealer?.logo && (
            <img src={dealer.logo} alt="Logo" className="h-10 object-contain mb-3" />
          )}
          <h1 className="text-xl font-bold">
            {dealer?.name ? `Contacta con ${dealer.name}` : 'Solicita información'}
          </h1>
          <p className="text-white/80 text-sm mt-1">
            Rellena el formulario y te contactaremos lo antes posible
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              <User className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              Nombre completo <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej. María García"
              className={`w-full px-4 py-2.5 border rounded-xl text-sm outline-none transition-colors ${errors.name ? 'border-rose-400 bg-rose-50' : 'border-gray-200 focus:border-violet-400'}`}
            />
            {errors.name && <p className="text-xs text-rose-600 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              <Phone className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              Teléfono <span className="text-rose-500">*</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="Ej. 612 345 678"
              className={`w-full px-4 py-2.5 border rounded-xl text-sm outline-none transition-colors ${errors.phone ? 'border-rose-400 bg-rose-50' : 'border-gray-200 focus:border-violet-400'}`}
            />
            {errors.phone && <p className="text-xs text-rose-600 mt-1">{errors.phone}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              <Mail className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="Ej. maria@ejemplo.com"
              className={`w-full px-4 py-2.5 border rounded-xl text-sm outline-none transition-colors ${errors.email ? 'border-rose-400 bg-rose-50' : 'border-gray-200 focus:border-violet-400'}`}
            />
            {errors.email && <p className="text-xs text-rose-600 mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              <Car className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              Vehículo de interés
            </label>
            <input
              type="text"
              value={form.vehicleInterest}
              onChange={(e) => setForm((f) => ({ ...f, vehicleInterest: e.target.value }))}
              placeholder="Ej. SUV eléctrico, berlina…"
              className="w-full px-4 py-2.5 border border-gray-200 focus:border-violet-400 rounded-xl text-sm outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Presupuesto aproximado
            </label>
            <input
              type="text"
              value={form.budget}
              onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
              placeholder="Ej. 25.000 €"
              className="w-full px-4 py-2.5 border border-gray-200 focus:border-violet-400 rounded-xl text-sm outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              <MessageSquare className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              Mensaje adicional
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Cuéntanos en qué podemos ayudarte…"
              className="w-full px-4 py-2.5 border border-gray-200 focus:border-violet-400 rounded-xl text-sm outline-none transition-colors resize-none"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.consent}
              onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))}
              className="mt-0.5 w-4 h-4 rounded accent-violet-600"
            />
            <span className="text-xs text-gray-500 leading-relaxed">
              Acepto la{' '}
              <a href="#" className="underline text-violet-600">política de privacidad</a>{' '}
              y consiento el tratamiento de mis datos personales con fines comerciales.
            </span>
          </label>
          {errors.consent && (
            <p className="text-xs text-rose-600 -mt-3 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {errors.consent}
            </p>
          )}

          {serverError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{ backgroundColor: accentColor }}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {submitting ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {submitting ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </form>
      </div>
    </div>
  );
}
