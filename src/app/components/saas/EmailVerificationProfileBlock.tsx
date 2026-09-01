import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, Clock, Mail, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';

const COOLDOWN_SEC = 60;

/**
 * Bloque de verificación de email para perfil / ficha de trabajador.
 * Muestra Verificado / No verificado y permite enviar el correo si falta.
 */
export function EmailVerificationProfileBlock({
  email,
  emailVerified,
  /** Si true, al comprobar estado refresca la sesión del usuario logueado. */
  refreshOwnSession = false,
  compact = false,
}: {
  email: string;
  emailVerified: boolean;
  refreshOwnSession?: boolean;
  compact?: boolean;
}) {
  const { resendVerificationEmail, refreshCurrentUser } = useAuth();
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const target = String(email || '').trim();

  const startCountdown = useCallback((seconds: number) => {
    setCountdown(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleSend = async () => {
    if (!target || sending || countdown > 0) return;
    setSending(true);
    try {
      const result = await resendVerificationEmail(target);
      if (result.success) {
        toast.success(`Enlace de verificación enviado a ${target}`);
        startCountdown(COOLDOWN_SEC);
      } else {
        const retryMatch = result.error?.match(/esperar (\d+) segundos/);
        if (retryMatch) startCountdown(Number(retryMatch[1]));
        toast.error(result.error || result.info || 'No se pudo enviar el correo');
      }
    } finally {
      setSending(false);
    }
  };

  const handleCheck = async () => {
    if (!refreshOwnSession) {
      toast.message('Pide al trabajador que abra el enlace del correo o que entre de nuevo.');
      return;
    }
    const result = await refreshCurrentUser();
    if (result.ok && result.emailVerified) {
      toast.success('Correo verificado');
    } else if (result.ok) {
      toast.message('Aún no está verificado. Revisa el correo o reenvía el enlace.');
    } else {
      toast.error('No se pudo comprobar el estado');
    }
  };

  if (!target) return null;

  if (emailVerified) {
    if (compact) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
          <CheckCircle className="h-3 w-3" />
          Email verificado
        </span>
      );
    }
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 dark:border-emerald-800 dark:bg-emerald-950/30">
        <div className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-200">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>
            <strong className="font-semibold">Correo verificado</strong>
            <span className="text-emerald-700/80 dark:text-emerald-300/80"> · {target}</span>
          </span>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        <Mail className="h-3 w-3" />
        Email no verificado
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-3 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex items-start gap-2">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              Correo no verificado
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-200/80 truncate">{target}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || countdown > 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-800 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-900 disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
          >
            {sending ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : countdown > 0 ? (
              <Clock className="h-3.5 w-3.5" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {sending
              ? 'Enviando…'
              : countdown > 0
                ? `Reenviar en ${countdown}s`
                : 'Enviar verificación'}
          </button>
          {refreshOwnSession ? (
            <button
              type="button"
              onClick={() => void handleCheck()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
            >
              Comprobar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
