import { useCallback, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bug,
  Camera,
  ImagePlus,
  Loader2,
  Send,
  Trash2,
} from 'lucide-react';
import { useBusinessOptional } from '../../context/BusinessContext';
import { submitBugReportRequest, type BugReportCategory } from '../../lib/supportApi';

const CATEGORIES: { value: BugReportCategory; label: string; hint: string }[] = [
  {
    value: 'bug',
    label: 'Bug',
    hint: 'Algo no funciona como debería',
  },
  {
    value: 'error',
    label: 'Error',
    hint: 'Pantalla rota, mensaje de error o bloqueo',
  },
  {
    value: 'suggestion',
    label: 'Sugerencia',
    hint: 'Mejora o idea para la plataforma',
  },
];

interface BugReportFormProps {
  onSubmitted?: (reportId?: string) => void;
  compact?: boolean;
}

export function BugReportForm({ onSubmitted, compact = false }: BugReportFormProps) {
  const businessCtx = useBusinessOptional();
  const currentBusiness = businessCtx?.currentBusiness ?? null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<BugReportCategory>('bug');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const readFileAsDataUrl = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se admiten imágenes');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error('La imagen no puede superar 4 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (result) setScreenshot(result);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleCaptureScreen = useCallback(async () => {
    setCapturing(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(document.documentElement, {
        backgroundColor: '#ffffff',
        scale: window.devicePixelRatio > 1 ? 1.5 : 1,
        useCORS: true,
        logging: false,
        ignoreElements: (el) => el.classList?.contains('bug-report-overlay') === true,
      });
      setScreenshot(canvas.toDataURL('image/jpeg', 0.82));
      toast.success('Captura añadida al reporte');
    } catch {
      toast.error('No se pudo capturar la pantalla. Sube una imagen manualmente.');
    } finally {
      setCapturing(false);
    }
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = description.trim();
    if (text.length < 10) {
      toast.error('Describe el problema con al menos 10 caracteres');
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitBugReportRequest({
        description: text,
        category,
        stepsToReproduce: stepsToReproduce.trim() || undefined,
        screenshotBase64: screenshot,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        businessId: String(currentBusiness?.business_id || currentBusiness?.id || '').trim() || undefined,
        businessName: String(currentBusiness?.name || '').trim() || undefined,
      });

      if (!result.ok) {
        const raw = String(result.error || '');
        const safe =
          /@|ALERTS_|BUG_REPORT|SMTP|email|correo/i.test(raw) || raw.length > 120
            ? 'No se pudo enviar el reporte'
            : (raw || 'No se pudo enviar el reporte');
        toast.error(safe);
        return;
      }

      toast.success('Reporte enviado. Lo revisaremos pronto.');
      setDescription('');
      setStepsToReproduce('');
      setScreenshot(null);
      setCategory('bug');
      onSubmitted?.(result.reportId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={compact ? 'space-y-4' : 'space-y-5'}>
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-100">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <p>
            Este canal va directo al equipo de Vertial. Incluye captura o pasos para reproducir
            el fallo si puedes; lo revisamos nosotros.
          </p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          Tipo de reporte
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {CATEGORIES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setCategory(item.value)}
              className={`rounded-xl border-2 p-3 text-left transition-all ${
                category === item.value
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{item.label}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          Qué ha pasado *
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={compact ? 4 : 5}
          placeholder="Ej.: Al abrir el TPV del gerente sale siempre «Esta tienda ya no está disponible» aunque la tienda existe."
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          required
          minLength={10}
        />
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          Pasos para reproducirlo
        </label>
        <textarea
          value={stepsToReproduce}
          onChange={(e) => setStepsToReproduce(e.target.value)}
          rows={3}
          placeholder="1. Entro en TPV rápido&#10;2. Elijo trabajador&#10;3. Aparece el mensaje amarillo"
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          Captura o imagen
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleCaptureScreen()}
            disabled={capturing || submitting}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
          >
            {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            Capturar pantalla
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
          >
            <ImagePlus className="w-4 h-4" />
            Subir imagen
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readFileAsDataUrl(file);
              e.target.value = '';
            }}
          />
        </div>

        {screenshot && (
          <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-900/40">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Vista previa</span>
              <button
                type="button"
                onClick={() => setScreenshot(null)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Quitar
              </button>
            </div>
            <img src={screenshot} alt="Captura del reporte" className="max-h-56 w-full object-contain bg-white" />
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold py-3 transition-colors"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Enviar reporte a Vertial
      </button>
    </form>
  );
}

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BugReportModal({ isOpen, onClose }: BugReportModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="bug-report-overlay fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Bug className="w-5 h-5 text-amber-700 dark:text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Reportar a Vertial</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Bug, error o incidencia con captura</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Cerrar
          </button>
        </div>
        <div className="p-6">
          <BugReportForm
            compact
            onSubmitted={() => {
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
