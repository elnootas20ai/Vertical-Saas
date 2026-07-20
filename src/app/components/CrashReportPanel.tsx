import { useState } from 'react';
import type { ErrorInfo } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Home, Loader2, RefreshCw, Send } from 'lucide-react';
import { submitBugReportRequest } from '../lib/supportApi';

function readStoredBusinessHint(): { businessId?: string; businessName?: string } {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('vertial_current_business:'));
    const businessId = keys.length ? String(localStorage.getItem(keys[0]) || '').trim() : '';
    return businessId ? { businessId } : {};
  } catch {
    return {};
  }
}

/** Nunca mostrar al usuario correos, IDs de reporte ni detalle de servidor. */
function safeSupportToast(raw: string | undefined, fallback: string): string {
  const msg = String(raw || '').trim();
  if (!msg) return fallback;
  if (/@|\.com|ALERTS_|BUG_REPORT|SMTP|email|correo/i.test(msg)) return fallback;
  if (msg.length > 120) return fallback;
  return msg;
}

type CrashReportPanelProps = {
  error: Error;
  errorInfo?: ErrorInfo | null;
  moduleName?: string;
  onReset: () => void;
  homeHref?: string;
  homeLabel?: string;
  title?: string;
  description?: string;
};

/**
 * Pantalla de recuperación tras un crash de React.
 * En producción: sin mensaje técnico, sin correos, sin IDs. Solo «Enviar a Vertial».
 */
export function CrashReportPanel({
  error,
  errorInfo = null,
  moduleName,
  onReset,
  homeHref = '/saas/dashboard',
  homeLabel = 'Ir al inicio',
  title,
  description,
}: CrashReportPanelProps) {
  const isDev = import.meta.env.DEV;
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const heading = title
    || (moduleName ? `Error en ${moduleName}` : 'Algo ha ido mal');
  const body = description
    || 'Ha ocurrido un problema. Puedes reintentar, volver al inicio o enviarlo a Vertial para que lo revisemos.';

  const handleSend = async () => {
    if (sending || sent) return;
    setSending(true);
    try {
      const biz = readStoredBusinessHint();
      const technical = [
        `Módulo: ${moduleName || 'Vertial'}`,
        `URL: ${typeof window !== 'undefined' ? window.location.href : '—'}`,
        `Mensaje: ${error.message}`,
        error.stack ? `\nStack:\n${error.stack}` : '',
        errorInfo?.componentStack
          ? `\nComponent stack:\n${errorInfo.componentStack}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      const result = await submitBugReportRequest({
        category: 'error',
        description:
          `Pantalla rota${moduleName ? ` en ${moduleName}` : ''}. `
          + 'El usuario ha pulsado «Enviar a Vertial» desde la pantalla de error.',
        stepsToReproduce: technical.slice(0, 3900),
        pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        businessId: biz.businessId,
        businessName: biz.businessName,
      });

      if (!result.ok) {
        toast.error(safeSupportToast(result.error, 'No se pudo enviar. Inténtalo de nuevo.'));
        return;
      }
      setSent(true);
      toast.success('Enviado a Vertial. Gracias — lo revisamos.');
    } catch {
      toast.error('No se pudo enviar. Comprueba la conexión e inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[100svh] w-full p-8 text-center bg-gray-50 dark:bg-gray-950">
      <div className="w-16 h-16 bg-red-100 dark:bg-red-950 rounded-2xl flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-red-500" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
        {heading}
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">
        {body}
      </p>

      {isDev ? (
        <pre className="mb-6 max-w-lg max-h-32 text-left text-[11px] bg-gray-100 dark:bg-gray-800 text-red-600 dark:text-red-400 rounded-xl p-3 overflow-auto whitespace-pre-wrap break-words">
          {error.message}
        </pre>
      ) : null}

      {sent ? (
        <p className="mb-4 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          Enviado a Vertial. Ya puedes reintentar o volver.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3 justify-center">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar
        </button>
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || sent}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {sent ? 'Enviado' : 'Enviar a Vertial'}
        </button>
        <button
          type="button"
          onClick={() => { window.location.href = homeHref; }}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold transition-colors"
        >
          <Home className="w-4 h-4" />
          {homeLabel}
        </button>
      </div>
    </div>
  );
}
