import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useModalClose } from '../../hooks/useModalClose';
import { getPublicVehicleRequest } from '../../lib/vehicleApi';
import {
  Car, Fuel, Gauge, Zap, DoorOpen, ToggleLeft,
  Phone, Mail, MessageCircle, ChevronLeft, ChevronRight,
  AlertTriangle, MapPin, Tag, Share2, Copy, Check, ExternalLink, X,
} from 'lucide-react';

interface PublicVehicle {
  id: string;
  brand: string;
  model: string;
  version?: string;
  year: number;
  color?: string;
  fuelType?: string;
  mileage?: number;
  transmission?: string;
  doors?: number;
  power?: number;
  bodyType?: string;
  salePrice?: number;
  images?: string[];
  notes?: string;
  status: string;
  registrationPlate: string;
}

const FUEL_LABELS: Record<string, string> = { gasolina: 'Gasolina', diesel: 'Diésel', hibrido: 'Híbrido', electrico: 'Eléctrico', glp: 'GLP', otro: 'Otro' };
const TRANS_LABELS: Record<string, string> = { manual: 'Manual', automatico: 'Automático', semiauto: 'Semiautomático' };
const BODY_LABELS: Record<string, string> = { sedan: 'Sedán', suv: 'SUV', familiar: 'Familiar', coupe: 'Coupé', cabrio: 'Cabrio', furgon: 'Furgón', pickup: 'Pick-up', otro: 'Otro' };

// ── SEO helper ──────────────────────────────────────────────────────────────

function useSEO(vehicle: PublicVehicle | null) {
  useEffect(() => {
    if (!vehicle) return;
    const title = `${vehicle.brand} ${vehicle.model}${vehicle.version ? ' ' + vehicle.version : ''} ${vehicle.year} — ${vehicle.salePrice ? vehicle.salePrice.toLocaleString('es-ES') + '€' : 'Consultar precio'}`;
    const description = [
      `${vehicle.brand} ${vehicle.model} del año ${vehicle.year}`,
      vehicle.mileage ? `${vehicle.mileage.toLocaleString('es-ES')} km` : null,
      vehicle.fuelType ? FUEL_LABELS[vehicle.fuelType] ?? vehicle.fuelType : null,
      vehicle.transmission ? TRANS_LABELS[vehicle.transmission] ?? vehicle.transmission : null,
      vehicle.color ? `Color ${vehicle.color}` : null,
      vehicle.salePrice ? `Precio: ${vehicle.salePrice.toLocaleString('es-ES')} €` : null,
    ].filter(Boolean).join(' · ');
    const image = vehicle.images?.[0] ?? '';
    const url = window.location.href;

    document.title = title;

    const setMeta = (name: string, content: string, type: 'name' | 'property' = 'name') => {
      let el = document.querySelector(`meta[${type}="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(type, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('description', description);
    setMeta('robots', 'index, follow');

    // Open Graph
    setMeta('og:title', title, 'property');
    setMeta('og:description', description, 'property');
    setMeta('og:type', 'product', 'property');
    setMeta('og:url', url, 'property');
    if (image) setMeta('og:image', image, 'property');
    setMeta('og:locale', 'es_ES', 'property');

    // Twitter Card
    setMeta('twitter:card', image ? 'summary_large_image' : 'summary', 'name');
    setMeta('twitter:title', title, 'name');
    setMeta('twitter:description', description, 'name');
    if (image) setMeta('twitter:image', image, 'name');

    return () => {
      document.title = 'Concesionario';
    };
  }, [vehicle]);
}

// ── Share modal ──────────────────────────────────────────────────────────────

function ShareModal({ vehicle, onClose }: { vehicle: PublicVehicle; onClose: () => void }) {
  useModalClose(true, onClose);
  const url = window.location.href;
  const text = `${vehicle.brand} ${vehicle.model} ${vehicle.year}${vehicle.salePrice ? ' — ' + vehicle.salePrice.toLocaleString('es-ES') + '€' : ''}`;
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const shareOptions = [
    {
      label: 'WhatsApp',
      color: 'bg-green-500 hover:bg-green-600',
      icon: '💬',
      action: () => window.open(`https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`, '_blank'),
    },
    {
      label: 'Facebook',
      color: 'bg-blue-600 hover:bg-blue-700',
      icon: '📘',
      action: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank'),
    },
    {
      label: 'X (Twitter)',
      color: 'bg-gray-900 hover:bg-black',
      icon: '🐦',
      action: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank'),
    },
    {
      label: 'Telegram',
      color: 'bg-sky-500 hover:bg-sky-600',
      icon: '✈️',
      action: () => window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank'),
    },
    {
      label: 'Email',
      color: 'bg-gray-500 hover:bg-gray-600',
      icon: '📧',
      action: () => window.open(`mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(text + '\n\nVer ficha: ' + url)}`, '_blank'),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-sm mx-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Compartir vehículo</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"><X className="w-4 h-4" /></button>
        </div>

        {/* URL copy bar */}
        <div className="mx-4 mb-4 flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <span className="flex-1 text-xs text-gray-500 dark:text-gray-400 truncate font-mono">{url}</span>
          <button onClick={copy} className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors">
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>

        {/* Share buttons grid */}
        <div className="grid grid-cols-5 gap-3 px-4 pb-6">
          {shareOptions.map(opt => (
            <button
              key={opt.label}
              onClick={() => { opt.action(); onClose(); }}
              className={`flex flex-col items-center gap-1.5 p-3 ${opt.color} text-white rounded-2xl transition-colors`}
            >
              <span className="text-xl">{opt.icon}</span>
              <span className="text-[9px] font-semibold leading-none">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function VehiclePublic() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const [vehicle, setVehicle] = useState<PublicVehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', email: '', message: '' });
  const [contactSent, setContactSent] = useState(false);
  const [showShare, setShowShare] = useState(false);
  useModalClose(lightbox !== null, () => setLightbox(null));
  const thumbnailRef = useRef<HTMLDivElement>(null);

  useSEO(vehicle);

  useEffect(() => {
    if (!vehicleId) return;
    setLoading(true);
    getPublicVehicleRequest(vehicleId)
      .then(res => setVehicle(res.vehicle as PublicVehicle))
      .catch(err => setError(err.message || 'Vehículo no disponible'))
      .finally(() => setLoading(false));
  }, [vehicleId]);

  const photos = vehicle?.images?.length ? vehicle.images : [];
  const safeIdx = photos.length > 0 ? photoIdx % photos.length : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 text-sm">Cargando ficha del vehículo…</p>
        </div>
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-10 text-center max-w-sm w-full">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Vehículo no disponible</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error || 'Este vehículo no se encuentra o ya no está disponible.'}</p>
        </div>
      </div>
    );
  }

  const specs = [
    { icon: <Tag className="w-4 h-4" />, label: 'Versión', value: vehicle.version || '—' },
    { icon: <Fuel className="w-4 h-4" />, label: 'Combustible', value: vehicle.fuelType ? FUEL_LABELS[vehicle.fuelType] ?? vehicle.fuelType : '—' },
    { icon: <ToggleLeft className="w-4 h-4" />, label: 'Cambio', value: vehicle.transmission ? TRANS_LABELS[vehicle.transmission] ?? vehicle.transmission : '—' },
    { icon: <Gauge className="w-4 h-4" />, label: 'Kilómetros', value: vehicle.mileage ? `${vehicle.mileage.toLocaleString('es-ES')} km` : '—' },
    { icon: <Zap className="w-4 h-4" />, label: 'Potencia', value: vehicle.power ? `${vehicle.power} CV` : '—' },
    { icon: <DoorOpen className="w-4 h-4" />, label: 'Puertas', value: vehicle.doors ? `${vehicle.doors}` : '—' },
    { icon: <Car className="w-4 h-4" />, label: 'Carrocería', value: vehicle.bodyType ? BODY_LABELS[vehicle.bodyType] ?? vehicle.bodyType : '—' },
  ].filter(s => s.value !== '—');

  const isAvailable = vehicle.status === 'listo';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      {/* V-09: Top bar */}
      <header className="sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Car className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-gray-900 dark:text-gray-100 text-sm leading-tight">{vehicle.brand} {vehicle.model}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{vehicle.year}{vehicle.version ? ` · ${vehicle.version}` : ''}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {vehicle.salePrice && (
            <div className="text-right mr-2">
              <div className="text-xs text-gray-400 dark:text-gray-500 leading-none">PVP</div>
              <div className="font-bold text-xl text-green-600 leading-tight">{vehicle.salePrice.toLocaleString('es-ES')}€</div>
            </div>
          )}
          {/* V-09: Share button */}
          <button
            onClick={() => setShowShare(true)}
            className="w-9 h-9 flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-xl transition-colors"
            title="Compartir"
          >
            <Share2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto pb-32">
        {/* V-09: Enhanced photo gallery with lightbox */}
        <div className="relative bg-gray-900 aspect-[16/10] overflow-hidden">
          {photos.length > 0 ? (
            <>
              <img
                src={photos[safeIdx]}
                alt={`${vehicle.brand} ${vehicle.model} — foto ${safeIdx + 1}`}
                className="w-full h-full object-cover cursor-zoom-in"
                onClick={() => setLightbox(safeIdx)}
              />
              {photos.length > 1 && (
                <>
                  <button
                    onClick={() => setPhotoIdx(i => (i - 1 + photos.length) % photos.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setPhotoIdx(i => (i + 1) % photos.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full font-medium">
                    {safeIdx + 1}/{photos.length}
                  </div>
                </>
              )}
              <div className={`absolute top-3 left-3 text-xs font-bold px-3 py-1 rounded-full ${isAvailable ? 'bg-green-500 text-white' : 'bg-gray-700 text-white'}`}>
                {isAvailable ? '✓ Disponible' : vehicle.status === 'reservado' ? 'Reservado' : 'No disponible'}
              </div>
              {/* Share overlay button */}
              <button
                onClick={() => setShowShare(true)}
                className="absolute bottom-3 left-3 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
                title="Compartir"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center text-white/40">
                <Car className="w-16 h-16 mx-auto mb-2" />
                <p className="text-sm">Sin fotografías disponibles</p>
              </div>
            </div>
          )}
        </div>

        {/* V-09: Improved thumbnail strip */}
        {photos.length > 1 && (
          <div ref={thumbnailRef} className="flex gap-1.5 px-4 py-2 bg-gray-800 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            {photos.map((src, i) => (
              <button
                key={i}
                onClick={() => setPhotoIdx(i)}
                className={`flex-shrink-0 w-14 h-10 rounded-lg overflow-hidden border-2 transition-all ${i === safeIdx ? 'border-white scale-105' : 'border-transparent opacity-60 hover:opacity-80 hover:border-white/40'}`}
              >
                <img src={src} alt={`Miniatura ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Lightbox */}
        {lightbox !== null && (
          <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={() => setLightbox(null)}>
            <button className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors z-10" onClick={() => setLightbox(null)}>
              <X className="w-5 h-5" />
            </button>
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/10 text-white text-sm px-3 py-1 rounded-full font-medium">
              {lightbox + 1} / {photos.length}
            </div>
            {photos.length > 1 && (
              <>
                <button className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center" onClick={e => { e.stopPropagation(); setLightbox(l => l !== null ? (l - 1 + photos.length) % photos.length : null); }}>
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center" onClick={e => { e.stopPropagation(); setLightbox(l => l !== null ? (l + 1) % photos.length : null); }}>
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
            <img
              src={photos[lightbox]}
              alt=""
              className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg"
              onClick={e => e.stopPropagation()}
            />
          </div>
        )}

        <div className="px-4 py-5 space-y-5">
          {/* Title & price */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{vehicle.brand} {vehicle.model}</h1>
            {vehicle.version && <p className="text-gray-500 dark:text-gray-400 mt-0.5">{vehicle.version}</p>}
            <div className="flex items-center gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
              <span>{vehicle.year}</span>
              {vehicle.mileage && <><span>·</span><span>{vehicle.mileage.toLocaleString('es-ES')} km</span></>}
              {vehicle.color && <><span>·</span><span>{vehicle.color}</span></>}
              {vehicle.fuelType && <><span>·</span><span>{FUEL_LABELS[vehicle.fuelType] ?? vehicle.fuelType}</span></>}
            </div>
            {vehicle.salePrice && (
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-green-600">{vehicle.salePrice.toLocaleString('es-ES')}€</span>
                <span className="text-sm text-gray-400 dark:text-gray-500">PVP</span>
              </div>
            )}
          </div>

          {/* Specs */}
          {specs.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
              <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-3 text-sm">Características</h2>
              <div className="grid grid-cols-2 gap-2">
                {specs.map(s => (
                  <div key={s.label} className="flex items-center gap-2.5 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">{s.icon}</span>
                    <div className="min-w-0">
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{s.label}</div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">{s.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {vehicle.notes && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
              <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-2 text-sm">Descripción</h2>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">{vehicle.notes}</p>
            </div>
          )}

          {/* Contact form */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => setContactOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <span className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><MessageCircle className="w-4 h-4 text-blue-600" />¿Interesado? Contáctanos</span>
              <ChevronRight className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${contactOpen ? 'rotate-90' : ''}`} />
            </button>
            {contactOpen && (
              <div className="border-t border-gray-100 dark:border-gray-800 p-4 space-y-3">
                {contactSent ? (
                  <div className="text-center py-4">
                    <div className="text-3xl mb-2">✉️</div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">¡Mensaje enviado!</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Nos pondremos en contacto contigo en breve.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Nombre</label>
                        <input value={contactForm.name} onChange={e => setContactForm(p => ({ ...p, name: e.target.value }))} placeholder="Tu nombre" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Teléfono</label>
                        <input type="tel" value={contactForm.phone} onChange={e => setContactForm(p => ({ ...p, phone: e.target.value }))} placeholder="600 000 000" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Email</label>
                      <input type="email" value={contactForm.email} onChange={e => setContactForm(p => ({ ...p, email: e.target.value }))} placeholder="tu@email.com" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Mensaje</label>
                      <textarea value={contactForm.message} onChange={e => setContactForm(p => ({ ...p, message: e.target.value }))} rows={3} placeholder="Me interesa este vehículo, ¿podemos concertar una visita?" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none resize-none" />
                    </div>
                    <button
                      onClick={() => setContactSent(true)}
                      disabled={!contactForm.name.trim() || (!contactForm.phone.trim() && !contactForm.email.trim())}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors disabled:opacity-40 flex items-center justify-center gap-2 text-sm"
                    >
                      <Mail className="w-4 h-4" />Enviar consulta
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* V-09: Share section */}
      <div className="mx-4 mb-2">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 text-sm"><Share2 className="w-4 h-4 text-blue-600" />Compartir este vehículo</h2>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'WhatsApp', icon: '💬', color: 'bg-green-100 hover:bg-green-200 text-green-800', action: () => window.open(`https://wa.me/?text=${encodeURIComponent(`${vehicle.brand} ${vehicle.model} ${vehicle.year} — ${vehicle.salePrice ? vehicle.salePrice.toLocaleString('es-ES') + '€' : ''}\n${window.location.href}`)}`, '_blank') },
              { label: 'Facebook', icon: '📘', color: 'bg-blue-100 hover:bg-blue-200 text-blue-800', action: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`, '_blank') },
              { label: 'X', icon: '🐦', color: 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-800 dark:text-gray-200', action: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${vehicle.brand} ${vehicle.model} ${vehicle.year}`)}&url=${encodeURIComponent(window.location.href)}`, '_blank') },
              { label: 'Copiar enlace', icon: '🔗', color: 'bg-purple-100 hover:bg-purple-200 text-purple-800', action: () => navigator.clipboard.writeText(window.location.href) },
            ].map(opt => (
              <button key={opt.label} onClick={opt.action} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${opt.color}`}>
                <span>{opt.icon}</span>{opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Floating CTA bar */}
      {isAvailable && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3 shadow-lg">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            {vehicle.salePrice && <div className="flex-shrink-0"><div className="text-xs text-gray-400 dark:text-gray-500">PVP</div><div className="font-bold text-green-600 text-xl leading-tight">{vehicle.salePrice.toLocaleString('es-ES')}€</div></div>}
            <div className="flex-1 grid grid-cols-3 gap-2">
              <a href="tel:+34900000000" className="flex items-center justify-center gap-2 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                <Phone className="w-4 h-4" />Llamar
              </a>
              <button onClick={() => setShowShare(true)} className="flex items-center justify-center gap-2 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                <Share2 className="w-4 h-4" />Compartir
              </button>
              <button onClick={() => { setContactOpen(true); setTimeout(() => document.querySelector('textarea')?.scrollIntoView({ behavior: 'smooth' }), 100); }} className="flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors">
                <MessageCircle className="w-4 h-4" />Me interesa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* V-09: Share modal */}
      {showShare && <ShareModal vehicle={vehicle} onClose={() => setShowShare(false)} />}
    </div>
  );
}
