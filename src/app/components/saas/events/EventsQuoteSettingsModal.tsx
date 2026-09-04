/**
 * Ajustes de presupuestos: diseño Vertial o plantilla propia + reglas (% / anotaciones).
 */
import { useEffect, useRef, useState } from 'react';
import { Star, Eye, X, Upload, Loader2, Palette, FileUp } from 'lucide-react';
import { toast } from 'sonner';
import { useModalClose } from '../../../hooks/useModalClose';
import { formatMoneyEs } from '../../../lib/formatNumberEs';
import {
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_FOCUS_RING,
  VERTIAL_SURFACE,
} from '../../../lib/vertialUiTokens';
import {
  loadEventsQuoteSettings,
  normalizeEventsQuoteSettings,
  readDesignTemplateFile,
  saveEventsQuoteSettings,
  type EventsQuoteSettings,
} from '../../../lib/eventsQuoteSettings';

const inputClass = `w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 ${VERTIAL_FOCUS_RING}`;

/** Ejemplo fijo solo para la maqueta de vista previa (no se guarda). */
const PREVIEW_SAMPLE_TOTAL = 2400;

function dataUrlMime(dataUrl: string): string {
  const m = /^data:([^;,]+)/i.exec(String(dataUrl || ''));
  return (m?.[1] || '').toLowerCase();
}

function QuoteDesignPreview({ settings }: { settings: EventsQuoteSettings }) {
  const deposit = settings.depositPercent > 0
    ? (PREVIEW_SAMPLE_TOTAL * settings.depositPercent) / 100
    : 0;
  const balance = settings.balancePercent > 0
    ? (PREVIEW_SAMPLE_TOTAL * settings.balancePercent) / 100
    : Math.max(0, PREVIEW_SAMPLE_TOTAL - deposit);
  const notes = String(settings.annotations || '').trim();
  const mime = dataUrlMime(settings.customTemplateDataUrl);
  const isImage = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';

  if (settings.designMode === 'custom') {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-900/60 overflow-hidden">
        {!settings.customTemplateDataUrl ? (
          <p className="px-3 py-8 text-center text-[11px] text-stone-500">
            Sube una plantilla para verla aquí
          </p>
        ) : isImage ? (
          <img
            src={settings.customTemplateDataUrl}
            alt="Vista previa de la plantilla"
            className="w-full max-h-56 object-contain bg-white"
          />
        ) : isPdf ? (
          <iframe
            title="Vista previa PDF"
            src={settings.customTemplateDataUrl}
            className="w-full h-56 bg-white"
          />
        ) : (
          <div className="px-3 py-6 text-center space-y-1">
            <p className="text-xs font-semibold text-stone-700 dark:text-stone-200 truncate">
              {settings.customTemplateFileName || 'Plantilla'}
            </p>
            <p className="text-[11px] text-stone-500">
              Word / Office no tiene vista previa en el navegador. El archivo queda guardado para usarlo al generar el documento.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden dark:border-stone-700 dark:bg-stone-950">
      <div className="h-1.5 bg-gradient-to-r from-[#22C55E] via-[#14B8A6] to-[#2563EB]" />
      <div className="px-3 py-3 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold tracking-wide text-[var(--v-blue,#2563eb)] uppercase">Presupuesto</p>
            <p className="text-xs font-bold text-stone-900 dark:text-stone-100">Evento de ejemplo</p>
            <p className="text-[10px] text-stone-500">Cliente · 19/08/2026</p>
          </div>
          <span className="text-[10px] font-semibold text-stone-700 dark:text-stone-200 text-right max-w-[9rem] truncate">
            {String(settings.documentCompanyName || '').trim() || 'Tu empresa'}
          </span>
        </div>
        <div className="rounded-lg border border-stone-100 dark:border-stone-800 overflow-hidden text-[10px]">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 bg-stone-50 dark:bg-stone-900 px-2 py-1 font-semibold text-stone-500">
            <span>Concepto</span>
            <span>Ud.</span>
            <span>Importe</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-2 py-1 text-stone-700 dark:text-stone-300">
            <span>Catering</span>
            <span>1</span>
            <span>{formatMoneyEs(1800)}</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-2 py-1 text-stone-700 dark:text-stone-300 border-t border-stone-50 dark:border-stone-800">
            <span>Montaje</span>
            <span>1</span>
            <span>{formatMoneyEs(600)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-[10px]">
          <p className="font-bold text-stone-900 dark:text-stone-100">
            Total {formatMoneyEs(PREVIEW_SAMPLE_TOTAL)}
          </p>
          {settings.depositPercent > 0 ? (
            <p className="text-stone-500">
              Depósito {settings.depositPercent}% · {formatMoneyEs(deposit)}
            </p>
          ) : null}
          {(settings.balancePercent > 0 || settings.depositPercent > 0) ? (
            <p className="text-stone-500">
              Resto{settings.balancePercent > 0 ? ` ${settings.balancePercent}%` : ''} · {formatMoneyEs(balance)}
            </p>
          ) : null}
          {settings.validityDays > 0 ? (
            <p className="text-stone-400">Válido {settings.validityDays} días</p>
          ) : null}
        </div>
        {notes ? (
          <p className="text-[10px] text-stone-500 line-clamp-3 border-t border-stone-100 dark:border-stone-800 pt-2 whitespace-pre-wrap">
            {notes}
          </p>
        ) : (
          <p className="text-[10px] text-stone-400 border-t border-stone-100 dark:border-stone-800 pt-2 italic">
            Sin anotaciones
          </p>
        )}
      </div>
    </div>
  );
}

type Props = {
  open: boolean;
  businessId: string;
  onClose: () => void;
  onSaved?: (settings: EventsQuoteSettings) => void;
};

export function EventsQuoteSettingsModal({ open, businessId, onClose, onSaved }: Props) {
  useModalClose(open, onClose);
  const designFileRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<EventsQuoteSettings>(() => loadEventsQuoteSettings(businessId));
  const [saving, setSaving] = useState(false);
  const [importingDesign, setImportingDesign] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSettings(loadEventsQuoteSettings(businessId));
  }, [open, businessId]);

  if (!open) return null;

  const handleImportDesign = async (file: File | null) => {
    if (!file) return;
    setImportingDesign(true);
    try {
      const { fileName, dataUrl } = await readDesignTemplateFile(file);
      setSettings((prev) => ({
        ...prev,
        designMode: 'custom',
        customTemplateFileName: fileName,
        customTemplateDataUrl: dataUrl,
      }));
      toast.success(`Plantilla «${fileName}» lista`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir la plantilla');
    } finally {
      setImportingDesign(false);
      if (designFileRef.current) designFileRef.current.value = '';
    }
  };

  const clearCustomDesign = () => {
    setSettings((prev) => ({
      ...prev,
      designMode: 'vertial',
      customTemplateFileName: '',
      customTemplateDataUrl: '',
    }));
  };

  const handleSave = () => {
    setSaving(true);
    try {
      const cleaned = normalizeEventsQuoteSettings(settings);
      saveEventsQuoteSettings(businessId, cleaned);
      setSettings(cleaned);
      onSaved?.(cleaned);
      toast.success('Ajustes guardados');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const percentSum = settings.depositPercent + settings.balancePercent;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="events-quote-settings-title"
        className={`${VERTIAL_SURFACE} w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-xl`}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-100 dark:border-stone-800 shrink-0">
          <div>
            <h2 id="events-quote-settings-title" className="text-base font-bold text-stone-900 dark:text-stone-100">
              Ajustes de eventos
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Diseño, porcentajes, anotaciones y reseña al finalizar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-6">
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Diseño del documento</h3>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Diseño Vertial o tu propia plantilla (PDF / Word / imagen)
              </p>
            </div>

            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-stone-500">
                Nombre en cabecera (presupuesto / factura)
              </span>
              <input
                className={inputClass}
                value={settings.documentCompanyName}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, documentCompanyName: e.target.value }))
                }
                placeholder="Ej. MODOMIOFEST (vacío = nombre de la empresa)"
                maxLength={120}
              />
              <span className="block text-[10px] text-stone-400">
                Si lo dejas vacío, se usa el nombre de la empresa en Vertial.
              </span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, designMode: 'vertial' }))}
                className={`rounded-xl border-2 p-3 text-left transition-colors ${
                  settings.designMode === 'vertial'
                    ? 'border-[var(--v-blue,#2563eb)] bg-blue-50/70 dark:bg-blue-950/30'
                    : 'border-stone-200 dark:border-stone-700 hover:border-stone-300'
                }`}
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-800 dark:text-stone-100">
                  <Palette className="w-3.5 h-3.5 text-[var(--v-blue,#2563eb)]" />
                  Diseño Vertial
                </span>
                <span className="mt-2 block h-10 rounded-lg bg-gradient-to-r from-[#22C55E] via-[#14B8A6] to-[#2563EB] opacity-90" />
                <span className="mt-2 block text-[11px] text-stone-500">
                  Cabecera limpia, tipografía Vertial, totales claros
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, designMode: 'custom' }))}
                className={`rounded-xl border-2 p-3 text-left transition-colors ${
                  settings.designMode === 'custom'
                    ? 'border-[var(--v-blue,#2563eb)] bg-blue-50/70 dark:bg-blue-950/30'
                    : 'border-stone-200 dark:border-stone-700 hover:border-stone-300'
                }`}
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-800 dark:text-stone-100">
                  <FileUp className="w-3.5 h-3.5" />
                  Plantilla propia
                </span>
                <span className="mt-2 block text-[11px] text-stone-500">
                  PDF, Word o imagen con tu marca
                </span>
                {settings.customTemplateFileName ? (
                  <span className="mt-2 block text-[11px] font-semibold text-stone-700 dark:text-stone-200 truncate">
                    {settings.customTemplateFileName}
                  </span>
                ) : (
                  <span className="mt-2 block text-[11px] text-stone-400">Sin archivo aún</span>
                )}
              </button>
            </div>

            {settings.designMode === 'custom' && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => designFileRef.current?.click()}
                  disabled={importingDesign}
                  className={`${VERTIAL_BTN_SECONDARY} !min-h-10 !px-3 !py-2 text-xs`}
                >
                  {importingDesign ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Subir plantilla
                </button>
                {settings.customTemplateFileName ? (
                  <button
                    type="button"
                    onClick={clearCustomDesign}
                    className={`${VERTIAL_BTN_SECONDARY} !min-h-10 !px-3 !py-2 text-xs`}
                  >
                    Quitar y usar Vertial
                  </button>
                ) : null}
                <input
                  ref={designFileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => void handleImportDesign(e.target.files?.[0] || null)}
                />
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Reglas del presupuesto</h3>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Porcentajes y validez. Déjalos a 0 si no quieres esa regla.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-stone-500">% depósito (anticipo)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputClass}
                  value={settings.depositPercent || ''}
                  placeholder="0"
                  onChange={(e) => setSettings((s) => ({
                    ...s,
                    depositPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                  }))}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-stone-500">% resto (total a liquidar)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputClass}
                  value={settings.balancePercent || ''}
                  placeholder="0"
                  onChange={(e) => setSettings((s) => ({
                    ...s,
                    balancePercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                  }))}
                />
              </label>
              <label className="block space-y-1 col-span-2 sm:col-span-1">
                <span className="text-xs font-medium text-stone-500">Validez (días)</span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  className={inputClass}
                  value={settings.validityDays || ''}
                  placeholder="0"
                  onChange={(e) => setSettings((s) => ({
                    ...s,
                    validityDays: Math.min(365, Math.max(0, Math.round(Number(e.target.value) || 0))),
                  }))}
                />
              </label>
            </div>
            {percentSum > 0 && percentSum !== 100 ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Depósito + resto = {percentSum}% (suele sumar 100%)
              </p>
            ) : null}
          </section>

          <section className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Anotaciones</h3>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Condiciones, exclusiones, forma de pago…
              </p>
            </div>
            <textarea
              className={`${inputClass} min-h-[100px] resize-y`}
              placeholder="Escribe aquí las reglas o condiciones del presupuesto…"
              value={settings.annotations}
              onChange={(e) => setSettings((s) => ({ ...s, annotations: e.target.value }))}
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-start gap-2">
              <Star className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Reseña al finalizar</h3>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Al marcar el evento como Finalizado, se envía el enlace al email del cliente.
                </p>
              </div>
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 rounded border-stone-300"
                checked={settings.reviewAutoSendOnFinish}
                onChange={(e) => setSettings((s) => ({
                  ...s,
                  reviewAutoSendOnFinish: e.target.checked,
                }))}
              />
              <span className="text-sm text-stone-700 dark:text-stone-200">
                Enviar enlace de reseña automáticamente al finalizar
              </span>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-stone-500">URL de reseña</span>
              <input
                type="url"
                className={inputClass}
                placeholder="https://g.page/r/… o tu enlace"
                value={settings.reviewUrl}
                onChange={(e) => setSettings((s) => ({ ...s, reviewUrl: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-stone-500">Mensaje del email (opcional)</span>
              <textarea
                className={`${inputClass} min-h-[72px] resize-y`}
                placeholder="Gracias por confiar en nosotros. Si te ha gustado el evento, déjanos una reseña:"
                value={settings.reviewMessage}
                onChange={(e) => setSettings((s) => ({ ...s, reviewMessage: e.target.value }))}
              />
            </label>
            {settings.reviewAutoSendOnFinish && !settings.reviewUrl.trim() ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Falta la URL: sin enlace no se enviará nada.
              </p>
            ) : null}
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-stone-400" />
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Vista previa</h3>
            </div>
            <p className="text-[11px] text-stone-500">
              Maqueta con datos de ejemplo. Se actualiza al cambiar diseño, % o anotaciones.
            </p>
            <QuoteDesignPreview settings={settings} />
          </section>
        </div>

        <div className="shrink-0 flex gap-2 px-4 py-3 border-t border-stone-100 dark:border-stone-800">
          <button type="button" onClick={onClose} className={`${VERTIAL_BTN_SECONDARY} flex-1`}>
            Cancelar
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className={`${VERTIAL_BTN_PRIMARY} flex-1`}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
