import { useState } from 'react';
import { Loader2 } from 'lucide-react';

type Props = {
  label?: string;
  disabled?: boolean;
  onPress: () => void | Promise<void>;
  className?: string;
};

/** Botón estilo Apple HIG (negro, ancho completo). */
export function AppleSignInButton({
  label = 'Continuar con Apple',
  disabled = false,
  onPress,
  className = '',
}: Props) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      await onPress();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={disabled || busy}
      className={`w-full min-h-[44px] inline-flex items-center justify-center gap-2.5 rounded-xl bg-black text-white text-sm font-semibold px-4 py-3 transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      aria-label={label}
    >
      {busy ? (
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
      ) : (
        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M17.05 20.28c-.98.95-2.05 1.88-3.51 1.9-1.48.02-1.95-.87-3.63-.87-1.68 0-2.2.85-3.6.89-1.44.04-2.54-1.35-3.52-2.29C2.44 16.38 1.04 11.9 2.94 8.7c.95-1.52 2.6-2.48 4.4-2.51 1.37-.02 2.66.92 3.5.92.84 0 2.41-1.14 4.07-.97.69.03 2.63.28 3.87 2.1-3.24 1.77-2.72 6.38.47 7.84-.65 1.66-1.5 3.31-3.03 4.2zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
        </svg>
      )}
      <span>{busy ? 'Conectando…' : label}</span>
    </button>
  );
}
