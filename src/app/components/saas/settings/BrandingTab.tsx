import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
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

export type BrandingTabHandle = {
  save: () => Promise<void>;
  togglePreview: () => void;
};

export type BrandingStatus = {
  saving: boolean;
  success: boolean;
  error: string;
  previewMode: boolean;
};

interface Props {
  businessId: string;
  businessName: string;
  /** En Ajustes → Marca: sin botones aquí (van al pie de la pestaña). */
  embedded?: boolean;
  onStatusChange?: (status: BrandingStatus) => void;
}

const COLOR_PRESETS = [
  { name: 'Azul corporativo', primary: '#3B82F6', secondary: '#1E40AF', accent: '#F59E0B' },
  { name: 'Verde esmeralda', primary: '#10B981', secondary: '#065F46', accent: '#F59E0B' },
  { name: 'Violeta premium', primary: '#7C3AED', secondary: '#4C1D95', accent: '#F59E0B' },
  { name: 'Rojo intenso', primary: '#EF4444', secondary: '#991B1B', accent: '#FBBF24' },
  { name: 'Naranja enérgico', primary: '#F97316', secondary: '#C2410C', accent: '#1D4ED8' },
  { name: 'Gris ejecutivo', primary: '#374151', secondary: '#111827', accent: '#3B82F6' },
];

export const BrandingTab = forwardRef<BrandingTabHandle, Props>(function BrandingTab(
  { businessId, businessName, embedded = false, onStatusChange },
  ref,
) {
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

  useEffect(() => {
    onStatusChange?.({ saving, success, error, previewMode });
  }, [saving, success, error, previewMode, onStatusChange]);

  const handleSave = useCallback(async () => {
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
  }, [businessId, config]);

  useImperativeHandle(
    ref,
    () => ({
      save: handleSave,
      togglePreview: () => setPreviewMode((v) => !v),
    }),
    [handleSave],
  );

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('El logo no puede superar 2 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setConfig((c) => ({ ...c, logo: ev.target?.result as string }));
    reader.readAsDataURL(file);
  };

  const applyPreset = (preset: (typeof COLOR_PRESETS)[number]) => {
    setConfig((c) => ({
      ...c,
      primaryColor: preset.primary,
      secondaryColor: preset.secondary,
      accentColor: preset.accent,
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  const cardClass = embedded
    ? 'rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4'
    : 'rounded-2xl border border-gray-200 bg-white p-6 space-y-4 dark:border-gray-700 dark:bg-gray-800';

  const showInlineActions = !embedded;

  return (
    <div className={`space-y-6 ${embedded ? 'max-w-none' : 'max-w-3xl'}`}>
      {previewMode && (
        <div
          className="flex items-center gap-4 rounded-2xl p-6 text-white shadow-lg dark:shadow-gray-900/40"
          style={{ background: `linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})` }}
        >
          {config.logo ? (
            <img src={config.logo} alt="logo" className="h-12 w-auto rounded-lg bg-white/20 object-contain p-1" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-xl font-black">
              {(config.businessName || businessName)?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
          <div>
            <p className="text-lg font-bold">{config.businessName || businessName}</p>
            {config.tagline ? <p className="text-sm opacity-80">{config.tagline}</p> : null}
          </div>
        </div>
      )}

      <div className={cardClass}>
        <div className="mb-2 flex items-center gap-2">
          <Image className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Logo</h3>
        </div>
        <div className="flex items-start gap-6">
          <div
            className="flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 transition-colors hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800"
            onClick={() => logoInputRef.current?.click()}
          >
            {config.logo ? (
              <img src={config.logo} alt="logo" className="h-full w-full object-contain" />
            ) : (
              <div className="p-2 text-center">
                <Image className="mx-auto mb-1 h-6 w-6 text-gray-300" />
                <p className="text-[10px] text-gray-400">Subir</p>
              </div>
            )}
          </div>
          <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleLogoUpload} />
          <div className="flex-1 space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Nombre mostrado
              </label>
              <input
                type="text"
                value={config.businessName}
                onChange={(e) => setConfig((c) => ({ ...c, businessName: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:focus:border-gray-400"
                placeholder={businessName}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Eslogan
              </label>
              <input
                type="text"
                value={config.tagline}
                onChange={(e) => setConfig((c) => ({ ...c, tagline: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:focus:border-gray-400"
                placeholder="Opcional"
              />
            </div>
          </div>
        </div>
        {config.logo ? (
          <button type="button" onClick={() => setConfig((c) => ({ ...c, logo: '' }))} className="text-xs text-red-500 hover:text-red-700">
            Quitar logo
          </button>
        ) : null}
      </div>

      <div className={`${cardClass} space-y-5`}>
        <div className="flex items-center gap-2">
          <Paintbrush className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Colores</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyPreset(preset)}
              className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"
            >
              <div className="flex gap-1">
                <div className="h-3 w-3 rounded-full" style={{ background: preset.primary }} />
                <div className="h-3 w-3 rounded-full" style={{ background: preset.secondary }} />
                <div className="h-3 w-3 rounded-full" style={{ background: preset.accent }} />
              </div>
              {preset.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(
            [
              { key: 'primaryColor' as const, label: 'Primario' },
              { key: 'secondaryColor' as const, label: 'Secundario' },
              { key: 'accentColor' as const, label: 'Acento' },
            ] as const
          ).map(({ key, label }) => (
            <div key={key}>
              <label className="mb-2 block text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config[key]}
                  onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))}
                  className="h-10 w-10 cursor-pointer rounded-lg border border-gray-200 p-0.5 dark:border-gray-700"
                />
                <input
                  type="text"
                  value={config[key]}
                  onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))}
                  className="flex-1 rounded-xl border border-gray-200 px-3 py-2 font-mono text-sm outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-800"
                  maxLength={7}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Dominio</h3>
        </div>
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={config.customDomain}
            onChange={(e) => setConfig((c) => ({ ...c, customDomain: e.target.value }))}
            className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3.5 font-mono text-sm outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-800"
            placeholder="tudominio.es"
          />
        </div>
      </div>

      {showInlineActions ? (
        <>
          {error ? (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ) : null}
          {success ? (
            <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
              <p className="text-sm text-green-700">Apariencia guardada</p>
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPreviewMode((v) => !v)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300"
            >
              <Eye className="h-4 w-4" />
              {previewMode ? 'Ocultar vista previa' : 'Vista previa'}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
            >
              <Save className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
              {saving ? 'Guardando…' : 'Guardar apariencia'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
});
