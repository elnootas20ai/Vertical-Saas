import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Globe,
  Image,
  Paintbrush,
  RefreshCw,
  Save,
  Eye,
} from 'lucide-react';
import type { BrandingConfig } from '../../../lib/settingsApi';
import { getBranding, saveBranding } from '../../../lib/settingsApi';

interface Props {
  businessId: string;
  businessName: string;
}

const COLOR_PRESETS = [
  { name: 'Azul corporativo',  primary: '#3B82F6', secondary: '#1E40AF', accent: '#F59E0B' },
  { name: 'Verde esmeralda',   primary: '#10B981', secondary: '#065F46', accent: '#F59E0B' },
  { name: 'Violeta premium',   primary: '#7C3AED', secondary: '#4C1D95', accent: '#F59E0B' },
  { name: 'Rojo intenso',      primary: '#EF4444', secondary: '#991B1B', accent: '#FBBF24' },
  { name: 'Naranja enérgico',  primary: '#F97316', secondary: '#C2410C', accent: '#1D4ED8' },
  { name: 'Gris ejecutivo',    primary: '#374151', secondary: '#111827', accent: '#3B82F6' },
];

export function BrandingTab({ businessId, businessName }: Props) {
  const [config, setConfig] = useState<BrandingConfig>({
    logo: '',
    primaryColor: '#3B82F6',
    secondaryColor: '#1E40AF',
    accentColor: '#F59E0B',
    customDomain: '',
    businessName: businessName,
    tagline: '',
    favicon: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    getBranding(businessId)
      .then((data) => setConfig({ ...data, businessName: data.businessName || businessName }))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [businessId, businessName]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError('El logo no puede superar 2 MB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setConfig((c) => ({ ...c, logo: ev.target?.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await saveBranding(businessId, config);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (preset: (typeof COLOR_PRESETS)[number]) => {
    setConfig((c) => ({ ...c, primaryColor: preset.primary, secondaryColor: preset.secondary, accentColor: preset.accent }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Preview banner */}
      {previewMode && (
        <div
          className="rounded-2xl p-6 text-white flex items-center gap-4 shadow-lg dark:shadow-gray-900/40"
          style={{ background: `linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})` }}
        >
          {config.logo ? (
            <img src={config.logo} alt="logo" className="h-12 w-auto object-contain rounded-lg bg-white dark:bg-gray-800/20 p-1" />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-white dark:bg-gray-800/20 flex items-center justify-center text-xl font-black">
              {(config.businessName || businessName)?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
          <div>
            <p className="text-lg font-bold">{config.businessName || businessName}</p>
            {config.tagline && <p className="text-sm opacity-80">{config.tagline}</p>}
          </div>
          <div className="ml-auto">
            <div className="h-8 w-24 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: config.accentColor, color: '#fff' }}>
              Vista previa
            </div>
          </div>
        </div>
      )}

      {/* Logo */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Image className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Logo e identidad</h3>
        </div>
        <div className="flex items-start gap-6">
          <div
            className="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors overflow-hidden bg-gray-50 dark:bg-gray-800"
            onClick={() => logoInputRef.current?.click()}
          >
            {config.logo ? (
              <img src={config.logo} alt="logo" className="w-full h-full object-contain" />
            ) : (
              <div className="text-center p-2">
                <Image className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                <p className="text-[10px] text-gray-400 dark:text-gray-500">Subir logo</p>
              </div>
            )}
          </div>
          <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleLogoUpload} />
          <div className="flex-1 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Nombre del concesionario</label>
              <input
                type="text"
                value={config.businessName}
                onChange={(e) => setConfig((c) => ({ ...c, businessName: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                placeholder={businessName}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Tagline</label>
              <input
                type="text"
                value={config.tagline}
                onChange={(e) => setConfig((c) => ({ ...c, tagline: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                placeholder="Tu concesionario de confianza"
              />
            </div>
          </div>
        </div>
        {config.logo && (
          <button
            onClick={() => setConfig((c) => ({ ...c, logo: '' }))}
            className="text-xs text-red-500 hover:text-red-700 transition-colors"
          >
            Eliminar logo
          </button>
        )}
      </div>

      {/* Colors */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Paintbrush className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Colores de marca</h3>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Paletas predefinidas</p>
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors"
              >
                <div className="flex gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ background: preset.primary }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: preset.secondary }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: preset.accent }} />
                </div>
                {preset.name}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { key: 'primaryColor' as const, label: 'Color primario' },
            { key: 'secondaryColor' as const, label: 'Color secundario' },
            { key: 'accentColor' as const, label: 'Color de acento' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config[key]}
                  onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))}
                  className="w-10 h-10 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={config[key]}
                  onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))}
                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 outline-none text-sm font-mono"
                  maxLength={7}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Domain */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Dominio personalizado</h3>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">URL personalizada</label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              value={config.customDomain}
              onChange={(e) => setConfig((c) => ({ ...c, customDomain: e.target.value }))}
              className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm font-mono"
              placeholder="miautomoviles.es"
            />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">El dominio personalizado requiere configuración DNS adicional. Contacta con soporte para activarlo.</p>
        </div>
      </div>

      {/* Actions */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
          <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
          <p className="text-sm text-green-700">Configuración de marca guardada correctamente</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => setPreviewMode((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
        >
          <Eye className="w-4 h-4" />
          {previewMode ? 'Ocultar vista previa' : 'Vista previa'}
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
        >
          <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
          {saving ? 'Guardando...' : 'Guardar marca'}
        </button>
      </div>
    </div>
  );
}
